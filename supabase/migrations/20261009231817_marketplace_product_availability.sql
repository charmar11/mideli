-- Availability is independent per business and sales channel. Missing rows and
-- new menu items remain unavailable until a business owner checks the box.
ALTER TABLE public.business_marketplace_prices
  ALTER COLUMN platform_price DROP NOT NULL,
  ADD COLUMN is_available boolean NOT NULL DEFAULT false;

-- Preserve products that had an explicit platform price before this migration.
UPDATE public.business_marketplace_prices
   SET is_available = true
 WHERE platform_price IS NOT NULL;

-- A previously enabled channel accepted every active product at menu price.
-- Preserve that behavior for any channel already in use before this release.
INSERT INTO public.business_marketplace_prices (
  business_id, platform, menu_item_id, platform_price, is_available
)
SELECT setting.business_id, setting.platform, menu_item.id, NULL, true
  FROM public.business_marketplace_settings AS setting
  JOIN public.menu_items AS menu_item
    ON menu_item.business_id = setting.business_id
   AND menu_item.is_active
 WHERE setting.is_enabled
   AND NOT EXISTS (
     SELECT 1 FROM public.business_marketplace_prices AS existing
      WHERE existing.business_id = setting.business_id
        AND existing.platform = setting.platform
        AND existing.menu_item_id = menu_item.id
   )
ON CONFLICT (business_id, platform, menu_item_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_marketplace_order_price_map(
  p_business_id uuid,
  p_platform text,
  p_payment_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organization_id uuid;
  v_enabled boolean;
  v_prices jsonb;
BEGIN
  IF p_platform IS NULL OR p_payment_mode IS NULL
     OR p_platform NOT IN ('uber_eats', 'didi_food')
     OR p_payment_mode NOT IN ('app', 'cash')
     OR (p_platform = 'uber_eats' AND p_payment_mode <> 'app') THEN
    RAISE EXCEPTION 'La plataforma o forma de pago no es válida';
  END IF;

  SELECT business.organization_id, business.marketplace_orders_enabled
    INTO v_organization_id, v_enabled
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.lifecycle_status = 'active';
  IF v_organization_id IS NULL OR NOT v_enabled THEN
    RAISE EXCEPTION 'Los pedidos de plataformas no están habilitados para este negocio';
  END IF;
  IF NOT private.business_license_is_available(p_business_id) THEN
    RAISE EXCEPTION 'BUSINESS_LICENSE_INACTIVE';
  END IF;
  IF NOT private.multibusiness_has_capability(
       'business.operate_orders', v_organization_id, p_business_id
     ) THEN
    RAISE EXCEPTION 'No tienes permiso para crear pedidos en este negocio';
  END IF;

  SELECT setting.is_enabled
    INTO v_enabled
    FROM public.business_marketplace_settings AS setting
   WHERE setting.business_id = p_business_id
     AND setting.platform = p_platform;
  IF NOT COALESCE(v_enabled, false) THEN
    RAISE EXCEPTION 'Esta plataforma no está habilitada para el negocio';
  END IF;

  SELECT COALESCE(
           jsonb_object_agg(
             menu_item.id::text,
             COALESCE(price.platform_price, menu_item.price)
           ),
           '{}'::jsonb
         )
    INTO v_prices
    FROM public.business_marketplace_prices AS price
    JOIN public.menu_items AS menu_item
      ON menu_item.id = price.menu_item_id
     AND menu_item.business_id = price.business_id
     AND menu_item.is_active
   WHERE price.business_id = p_business_id
     AND price.platform = p_platform
     AND price.is_available;

  RETURN v_prices;
END;
$$;

REVOKE ALL ON FUNCTION public.get_marketplace_order_price_map(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_marketplace_order_price_map(uuid, text, text)
  TO authenticated;

-- Save availability, optional prices, and channel settings in one authorized
-- transaction so a partial save cannot leave the screen and order rules apart.
CREATE OR REPLACE FUNCTION public.save_business_marketplace_settings(
  p_business_id uuid,
  p_platforms jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_organization_id uuid;
  v_feature_enabled boolean;
  v_platform jsonb;
  v_platform_code text;
  v_platform_seen text[] := ARRAY[]::text[];
  v_commission numeric;
  v_product jsonb;
  v_item_id uuid;
  v_price_value integer;
  v_is_available boolean;
BEGIN
  IF v_actor_id IS NULL OR jsonb_typeof(COALESCE(p_platforms, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_platforms) > 2 THEN
    RAISE EXCEPTION 'La configuración enviada no es válida';
  END IF;

  SELECT business.organization_id, business.marketplace_orders_enabled
    INTO v_organization_id, v_feature_enabled
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.lifecycle_status = 'active';
  IF v_organization_id IS NULL OR NOT v_feature_enabled THEN
    RAISE EXCEPTION 'Rincón 404 debe habilitar primero la opción para este negocio';
  END IF;
  IF NOT private.business_license_is_available(p_business_id) THEN
    RAISE EXCEPTION 'La licencia del negocio no está vigente';
  END IF;
  IF NOT (
    private.multibusiness_has_capability('business.manage_catalog', v_organization_id, p_business_id)
    OR private.multibusiness_has_capability('platform.manage_businesses', NULL, NULL)
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para configurar las plataformas de este negocio';
  END IF;

  FOR v_platform IN SELECT value FROM jsonb_array_elements(p_platforms)
  LOOP
    v_platform_code := v_platform->>'platform';
    IF v_platform_code NOT IN ('uber_eats', 'didi_food')
       OR v_platform_code = ANY(v_platform_seen)
       OR jsonb_typeof(COALESCE(v_platform->'prices', '[]'::jsonb)) <> 'array'
       OR jsonb_array_length(COALESCE(v_platform->'prices', '[]'::jsonb)) > 1000 THEN
      RAISE EXCEPTION 'Una plataforma tiene datos repetidos o inválidos';
    END IF;
    v_platform_seen := array_append(v_platform_seen, v_platform_code);

    v_commission := NULLIF(v_platform->>'commissionRate', '')::numeric;
    IF v_commission IS NOT NULL AND (v_commission < 0 OR v_commission > 100) THEN
      RAISE EXCEPTION 'La comisión de referencia debe estar entre 0 y 100';
    END IF;
    INSERT INTO public.business_marketplace_settings (
      business_id, platform, is_enabled, commission_rate, updated_by, updated_at
    ) VALUES (
      p_business_id,
      v_platform_code,
      COALESCE((v_platform->>'isEnabled')::boolean, false),
      v_commission,
      v_actor_id,
      now()
    )
    ON CONFLICT (business_id, platform) DO UPDATE
      SET is_enabled = EXCLUDED.is_enabled,
          commission_rate = EXCLUDED.commission_rate,
          updated_by = EXCLUDED.updated_by,
          updated_at = now();

    DELETE FROM public.business_marketplace_prices AS saved_product
     WHERE saved_product.business_id = p_business_id
       AND saved_product.platform = v_platform_code;

    FOR v_product IN SELECT value FROM jsonb_array_elements(COALESCE(v_platform->'prices', '[]'::jsonb))
    LOOP
      BEGIN
        v_item_id := (v_product->>'menuItemId')::uuid;
        v_price_value := NULLIF(v_product->>'price', '')::integer;
        v_is_available := COALESCE(
          NULLIF(v_product->>'isAvailable', '')::boolean,
          v_price_value IS NOT NULL
        );
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'La disponibilidad o el precio de un producto tiene un formato inválido';
      END;

      IF (v_price_value IS NOT NULL AND (v_price_value < 0 OR v_price_value > 1000000))
         OR NOT EXISTS (
           SELECT 1 FROM public.menu_items AS menu_item
            WHERE menu_item.id = v_item_id
              AND menu_item.business_id = p_business_id
              AND menu_item.is_active
         ) THEN
        RAISE EXCEPTION 'El precio debe pertenecer a un producto activo de este negocio';
      END IF;

      INSERT INTO public.business_marketplace_prices (
        business_id, platform, menu_item_id, platform_price, is_available, updated_by
      ) VALUES (
        p_business_id, v_platform_code, v_item_id, v_price_value, v_is_available, v_actor_id
      );
    END LOOP;
  END LOOP;

  INSERT INTO public.audit_events (
    actor_user_id, organization_id, business_id, action, entity_type, entity_id, reason, metadata
  ) VALUES (
    v_actor_id,
    v_organization_id,
    p_business_id,
    'updated',
    'business_marketplace_settings',
    p_business_id,
    'Configuración de pedidos por plataforma',
    jsonb_build_object('platforms', v_platform_seen)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.save_business_marketplace_settings(uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_business_marketplace_settings(uuid, jsonb)
  TO authenticated;

-- Enforce the checkbox again at the database boundary. This protects orders
-- if settings change in another session or a client bypasses the POS UI.
CREATE OR REPLACE FUNCTION private.guard_marketplace_order_product_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.marketplace_platform IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.marketplace_platform IS NOT DISTINCT FROM NEW.marketplace_platform THEN
      RETURN NEW;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.order_items AS order_item
      LEFT JOIN public.business_marketplace_prices AS channel_product
        ON channel_product.business_id = NEW.business_id
       AND channel_product.platform = NEW.marketplace_platform
       AND channel_product.menu_item_id = order_item.menu_item_id
       AND channel_product.is_available
     WHERE order_item.order_id = NEW.id
       AND channel_product.menu_item_id IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MARKETPLACE_PRODUCT_NOT_AVAILABLE';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_marketplace_order_product_availability()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER orders_guard_marketplace_product_availability_insert
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_marketplace_order_product_availability();

CREATE TRIGGER orders_guard_marketplace_product_availability_update
  BEFORE UPDATE OF marketplace_platform ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_marketplace_order_product_availability();
