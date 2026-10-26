BEGIN;

-- Marketplace sales are a per-business feature. New locals remain disabled;
-- only the existing Just Dipping business starts enabled.
ALTER TABLE public.businesses
  ADD COLUMN marketplace_orders_enabled boolean NOT NULL DEFAULT false;

UPDATE public.businesses AS business
   SET marketplace_orders_enabled = true,
       updated_at = now()
  FROM public.organizations AS organization
 WHERE organization.id = business.organization_id
   AND organization.slug = 'rincon-404-food-park'
   AND business.slug = 'just-dipping'
   AND business.lifecycle_status NOT IN ('archived', 'retired');

CREATE TABLE public.business_marketplace_settings (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('uber_eats', 'didi_food')),
  is_enabled boolean NOT NULL DEFAULT false,
  commission_rate numeric(5,2) CHECK (commission_rate IS NULL OR commission_rate BETWEEN 0 AND 100),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, platform)
);

CREATE TABLE public.business_marketplace_prices (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('uber_eats', 'didi_food')),
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  platform_price integer NOT NULL CHECK (platform_price BETWEEN 0 AND 1000000),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, platform, menu_item_id)
);

ALTER TABLE public.business_marketplace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_marketplace_prices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_marketplace_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_marketplace_prices FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.business_marketplace_settings TO service_role;
GRANT ALL ON TABLE public.business_marketplace_prices TO service_role;

ALTER TABLE public.orders
  ADD COLUMN marketplace_platform text,
  ADD COLUMN marketplace_payment_mode text,
  ADD COLUMN marketplace_handed_off_at timestamptz,
  ADD COLUMN marketplace_handed_off_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN marketplace_handoff_key uuid,
  ADD COLUMN marketplace_cash_received integer,
  ADD COLUMN marketplace_cash_shift_id uuid REFERENCES public.cash_shifts(id) ON DELETE RESTRICT,
  ADD CONSTRAINT orders_marketplace_platform_check
    CHECK (marketplace_platform IS NULL OR marketplace_platform IN ('uber_eats', 'didi_food')),
  ADD CONSTRAINT orders_marketplace_payment_check
    CHECK (
      (marketplace_platform IS NULL AND marketplace_payment_mode IS NULL)
      OR (marketplace_platform = 'uber_eats' AND marketplace_payment_mode = 'app')
      OR (marketplace_platform = 'didi_food' AND marketplace_payment_mode IN ('app', 'cash'))
    ),
  ADD CONSTRAINT orders_marketplace_handoff_check
    CHECK (
      (marketplace_handed_off_at IS NULL
        AND marketplace_handed_off_by IS NULL
        AND marketplace_handoff_key IS NULL
        AND marketplace_cash_received IS NULL
        AND marketplace_cash_shift_id IS NULL)
      OR
      (marketplace_platform IS NOT NULL
        AND marketplace_handed_off_at IS NOT NULL
        AND marketplace_handed_off_by IS NOT NULL
        AND marketplace_handoff_key IS NOT NULL
        AND (
          (marketplace_payment_mode = 'cash'
            AND marketplace_cash_received IS NOT NULL
            AND marketplace_cash_received >= 0
            AND marketplace_cash_shift_id IS NOT NULL)
          OR
          (marketplace_payment_mode = 'app'
            AND marketplace_cash_received IS NULL
            AND marketplace_cash_shift_id IS NULL)
        ))
    ),
  ADD CONSTRAINT orders_marketplace_handoff_key_key UNIQUE (marketplace_handoff_key);

ALTER TABLE public.cash_shifts
  ADD COLUMN marketplace_cash_total numeric(12,2) NOT NULL DEFAULT 0
  CHECK (marketplace_cash_total >= 0);

CREATE INDEX orders_marketplace_status_idx
  ON public.orders (business_id, marketplace_platform, status, created_at DESC)
  WHERE marketplace_platform IS NOT NULL;
CREATE INDEX orders_marketplace_cash_shift_idx
  ON public.orders (marketplace_cash_shift_id)
  WHERE marketplace_cash_shift_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.guard_business_marketplace_feature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.marketplace_orders_enabled IS DISTINCT FROM OLD.marketplace_orders_enabled
     AND private.request_jwt_role() IS DISTINCT FROM 'service_role'
     AND NOT private.multibusiness_has_capability(
       'platform.manage_businesses', NULL, NULL
     ) THEN
    RAISE EXCEPTION 'Sólo Rincón 404 puede habilitar pedidos de plataformas';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_business_marketplace_feature()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER businesses_guard_marketplace_feature
  BEFORE UPDATE OF marketplace_orders_enabled ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_business_marketplace_feature();

CREATE OR REPLACE FUNCTION private.guard_marketplace_order_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_internal_write text := current_setting('mideli.marketplace_internal_write', true);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.marketplace_platform IS NOT NULL
       OR NEW.marketplace_payment_mode IS NOT NULL
       OR NEW.marketplace_handed_off_at IS NOT NULL
       OR NEW.marketplace_handed_off_by IS NOT NULL
       OR NEW.marketplace_handoff_key IS NOT NULL
       OR NEW.marketplace_cash_received IS NOT NULL
       OR NEW.marketplace_cash_shift_id IS NOT NULL THEN
      RAISE EXCEPTION 'Los pedidos de plataforma deben crearse por el flujo validado del POS';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.marketplace_platform IS DISTINCT FROM OLD.marketplace_platform
      OR NEW.marketplace_payment_mode IS DISTINCT FROM OLD.marketplace_payment_mode)
     AND v_internal_write IS DISTINCT FROM 'create' THEN
    RAISE EXCEPTION 'El canal de plataforma del pedido no se puede modificar';
  END IF;

  IF (NEW.marketplace_handed_off_at IS DISTINCT FROM OLD.marketplace_handed_off_at
      OR NEW.marketplace_handed_off_by IS DISTINCT FROM OLD.marketplace_handed_off_by
      OR NEW.marketplace_handoff_key IS DISTINCT FROM OLD.marketplace_handoff_key
      OR NEW.marketplace_cash_received IS DISTINCT FROM OLD.marketplace_cash_received
      OR NEW.marketplace_cash_shift_id IS DISTINCT FROM OLD.marketplace_cash_shift_id)
     AND v_internal_write IS DISTINCT FROM 'handoff' THEN
    RAISE EXCEPTION 'La entrega a plataforma debe registrarse desde Estado';
  END IF;

  IF OLD.marketplace_handed_off_at IS NOT NULL
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status = 'cancelled' THEN
    RAISE EXCEPTION 'Un pedido entregado a la plataforma ya no se puede cancelar';
  END IF;

  IF NEW.marketplace_platform IS NOT NULL
     AND (NEW.type <> 'para_llevar'
       OR NEW.delivery_address IS NOT NULL
       OR COALESCE(NEW.delivery_fee, 0) <> 0) THEN
    RAISE EXCEPTION 'Un pedido de plataforma no puede usar el reparto local';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_marketplace_order_fields()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER orders_guard_marketplace_fields
  BEFORE INSERT OR UPDATE OF marketplace_platform, marketplace_payment_mode,
    marketplace_handed_off_at, marketplace_handed_off_by,
    marketplace_handoff_key, marketplace_cash_received, status,
    marketplace_cash_shift_id, type, delivery_address, delivery_fee
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_marketplace_order_fields();

CREATE OR REPLACE FUNCTION private.block_marketplace_order_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.marketplace_platform IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MARKETPLACE_ORDER_DELETE_PROTECTED';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.block_marketplace_order_delete()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER orders_block_marketplace_delete
  BEFORE DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.block_marketplace_order_delete();

CREATE OR REPLACE FUNCTION private.guard_marketplace_order_item_prices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.unit_price IS DISTINCT FROM OLD.unit_price
     AND EXISTS (
       SELECT 1 FROM public.orders AS order_row
        WHERE order_row.id = OLD.order_id
          AND order_row.marketplace_platform IS NOT NULL
     )
     AND current_setting('mideli.marketplace_internal_write', true) IS DISTINCT FROM 'create' THEN
    RAISE EXCEPTION 'El precio del pedido de plataforma sólo se fija al crearlo';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_marketplace_order_item_prices()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER order_items_guard_marketplace_prices
  BEFORE UPDATE OF unit_price ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_marketplace_order_item_prices();

-- Read-only, caller-scoped validator used by the atomic order RPC. Returning
-- only a product-to-price map keeps the service role key out of browser code.
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

  SELECT COALESCE(jsonb_object_agg(price.menu_item_id::text, price.platform_price), '{}'::jsonb)
    INTO v_prices
    FROM public.business_marketplace_prices AS price
    JOIN public.menu_items AS menu_item
      ON menu_item.id = price.menu_item_id
     AND menu_item.business_id = price.business_id
     AND menu_item.is_active
   WHERE price.business_id = p_business_id
     AND price.platform = p_platform;

  RETURN v_prices;
END;
$$;

REVOKE ALL ON FUNCTION public.get_marketplace_order_price_map(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_marketplace_order_price_map(uuid, text, text)
  TO authenticated;

-- Platform settings are written atomically and only by the business catalog
-- manager or Rincón 404. Prices must reference active products of that local.
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
  v_price jsonb;
  v_item_id uuid;
  v_price_value integer;
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

    DELETE FROM public.business_marketplace_prices AS price
     WHERE price.business_id = p_business_id
       AND price.platform = v_platform_code;

    FOR v_price IN SELECT value FROM jsonb_array_elements(COALESCE(v_platform->'prices', '[]'::jsonb))
    LOOP
      BEGIN
        v_item_id := (v_price->>'menuItemId')::uuid;
        v_price_value := (v_price->>'price')::integer;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Un precio de plataforma tiene un formato inválido';
      END;
      IF v_price_value < 0 OR v_price_value > 1000000 OR NOT EXISTS (
        SELECT 1 FROM public.menu_items AS menu_item
         WHERE menu_item.id = v_item_id
           AND menu_item.business_id = p_business_id
           AND menu_item.is_active
      ) THEN
        RAISE EXCEPTION 'El precio debe pertenecer a un producto activo de este negocio';
      END IF;
      INSERT INTO public.business_marketplace_prices (
        business_id, platform, menu_item_id, platform_price, updated_by
      ) VALUES (
        p_business_id, v_platform_code, v_item_id, v_price_value, v_actor_id
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

-- The existing wrapper stays SECURITY INVOKER so ordinary order creation
-- continues to observe RLS. Marketplace prices and metadata are verified by
-- this RPC, never accepted as client-supplied totals.
CREATE OR REPLACE FUNCTION public.create_business_order_with_details(
  p_business_id uuid,
  p_creation_key uuid,
  p_items jsonb,
  p_order_type text,
  p_notes text DEFAULT '',
  p_table_number text DEFAULT NULL,
  p_table_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_prior_id uuid;
  v_order public.orders%ROWTYPE;
  v_has_delivery boolean;
  v_has_schedule boolean;
  v_has_marketplace boolean;
  v_scheduled_for timestamptz;
  v_kitchen_release_at timestamptz;
  v_marketplace_platform text;
  v_marketplace_payment_mode text;
  v_platform_prices jsonb := '{}'::jsonb;
BEGIN
  IF p_creation_key IS NULL THEN RAISE EXCEPTION 'Falta la clave del pedido'; END IF;
  IF jsonb_typeof(COALESCE(p_details, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Los detalles del pedido no son válidos';
  END IF;
  IF p_details ? 'delivery' AND jsonb_typeof(p_details->'delivery') NOT IN ('object', 'null') THEN
    RAISE EXCEPTION 'Los datos de entrega no son válidos';
  END IF;
  IF p_details ? 'schedule' AND jsonb_typeof(p_details->'schedule') NOT IN ('object', 'null') THEN
    RAISE EXCEPTION 'La programación no es válida';
  END IF;
  IF p_details ? 'marketplace' AND jsonb_typeof(p_details->'marketplace') NOT IN ('object', 'null') THEN
    RAISE EXCEPTION 'Los datos de plataforma no son válidos';
  END IF;

  v_has_delivery := jsonb_typeof(p_details->'delivery') = 'object';
  v_has_schedule := jsonb_typeof(p_details->'schedule') = 'object';
  v_has_marketplace := jsonb_typeof(p_details->'marketplace') = 'object';
  IF v_has_delivery AND p_order_type IS DISTINCT FROM 'domicilio' THEN
    RAISE EXCEPTION 'La entrega local sólo aplica a pedidos a domicilio';
  END IF;
  IF v_has_marketplace AND (p_order_type IS DISTINCT FROM 'para_llevar' OR v_has_delivery OR v_has_schedule) THEN
    RAISE EXCEPTION 'Un pedido de plataforma no lleva domicilio local ni horario de recogida';
  END IF;
  IF v_has_schedule THEN
    v_scheduled_for := NULLIF(p_details #>> '{schedule,scheduled_for}', '')::timestamptz;
    v_kitchen_release_at := NULLIF(p_details #>> '{schedule,kitchen_release_at}', '')::timestamptz;
    IF v_scheduled_for IS NULL OR v_kitchen_release_at IS NULL THEN
      RAISE EXCEPTION 'La programación del pedido está incompleta';
    END IF;
  END IF;
  IF v_has_marketplace THEN
    v_marketplace_platform := p_details #>> '{marketplace,platform}';
    v_marketplace_payment_mode := p_details #>> '{marketplace,payment_mode}';
    IF v_marketplace_platform IS NULL OR v_marketplace_payment_mode IS NULL THEN
      RAISE EXCEPTION 'La plataforma y forma de pago son obligatorias';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_creation_key::text, 406));
  SELECT id INTO v_prior_id
    FROM public.orders
   WHERE creation_key = p_creation_key
   FOR UPDATE;

  -- On an uncertain client retry, return the committed order even if the
  -- platform was disabled after its original creation.
  IF v_prior_id IS NULL AND v_has_marketplace THEN
    v_platform_prices := public.get_marketplace_order_price_map(
      p_business_id, v_marketplace_platform, v_marketplace_payment_mode
    );
  END IF;

  v_order := public.create_business_order_with_items(
    p_business_id, p_creation_key, p_items, p_order_type, p_notes,
    p_table_number, p_table_id, p_customer_name
  );
  IF v_prior_id IS NOT NULL OR p_details IS NULL OR p_details = '{}'::jsonb THEN
    RETURN v_order;
  END IF;

  IF v_has_marketplace THEN
    PERFORM set_config('mideli.marketplace_internal_write', 'create', true);
    UPDATE public.order_items AS item
       SET unit_price = COALESCE(
         NULLIF(v_platform_prices->>item.menu_item_id::text, '')::integer,
         item.unit_price
       )
     WHERE item.order_id = v_order.id;
    UPDATE public.orders AS order_row
       SET marketplace_platform = v_marketplace_platform,
           marketplace_payment_mode = v_marketplace_payment_mode,
           total = totals.order_total,
           updated_at = now()
      FROM (
        SELECT COALESCE(sum(
          (item.unit_price::bigint + COALESCE((
            SELECT sum((modifier->>'price')::bigint)
              FROM jsonb_array_elements(COALESCE(item.selected_modifiers, '[]'::jsonb)) AS modifier
          ), 0)) * item.quantity
        ), 0)::integer AS order_total
          FROM public.order_items AS item
         WHERE item.order_id = v_order.id
      ) AS totals
     WHERE order_row.id = v_order.id
       AND order_row.business_id = p_business_id
     RETURNING order_row.* INTO v_order;
    IF NOT FOUND THEN RAISE EXCEPTION 'No se pudieron fijar los datos de la plataforma'; END IF;
  END IF;

  UPDATE public.orders
     SET customer_id = NULLIF(p_details->>'customer_id', '')::uuid,
         business_customer_id = NULLIF(p_details->>'business_customer_id', '')::uuid,
         customer_phone = CASE
           WHEN v_has_delivery THEN NULLIF(btrim(p_details #>> '{delivery,phone}'), '')
           ELSE NULLIF(btrim(p_details->>'customer_phone'), '')
         END,
         source_channel = CASE
           WHEN NULLIF(p_details->>'channel_conversation_id', '') IS NOT NULL THEN 'whatsapp'
           ELSE source_channel
         END,
         channel_conversation_id = NULLIF(p_details->>'channel_conversation_id', '')::uuid,
         whatsapp_status_opt_in = CASE WHEN v_has_delivery
           THEN COALESCE((p_details #>> '{delivery,whatsapp_status_opt_in}')::boolean, false)
           ELSE whatsapp_status_opt_in END,
         delivery_address = CASE WHEN v_has_delivery THEN btrim(COALESCE(p_details #>> '{delivery,address}', '')) ELSE delivery_address END,
         delivery_colony = CASE WHEN v_has_delivery THEN NULLIF(btrim(p_details #>> '{delivery,colony}'), '') ELSE delivery_colony END,
         delivery_reference = CASE WHEN v_has_delivery THEN NULLIF(btrim(p_details #>> '{delivery,reference}'), '') ELSE delivery_reference END,
         delivery_fee = CASE WHEN v_has_delivery THEN COALESCE((p_details #>> '{delivery,fee}')::integer, 0) ELSE delivery_fee END,
         delivery_distance_meters = CASE WHEN v_has_delivery THEN (p_details #>> '{delivery,distance_meters}')::integer ELSE delivery_distance_meters END,
         delivery_latitude = CASE WHEN v_has_delivery THEN (p_details #>> '{delivery,latitude}')::numeric ELSE delivery_latitude END,
         delivery_longitude = CASE WHEN v_has_delivery THEN (p_details #>> '{delivery,longitude}')::numeric ELSE delivery_longitude END,
         payment_method_requested = CASE WHEN v_has_delivery
           THEN NULLIF(p_details #>> '{delivery,payment_method}', '')::public.payment_method
           ELSE payment_method_requested END,
         requested_cash_tendered = CASE WHEN v_has_delivery THEN (p_details #>> '{delivery,cash_tendered}')::integer ELSE requested_cash_tendered END,
         scheduled_for = CASE WHEN v_has_schedule THEN v_scheduled_for ELSE scheduled_for END,
         kitchen_release_at = CASE WHEN v_has_schedule THEN v_kitchen_release_at ELSE kitchen_release_at END,
         kitchen_released_at = CASE WHEN v_has_schedule THEN NULL ELSE kitchen_released_at END,
         schedule_status = CASE WHEN v_has_schedule THEN 'scheduled' ELSE schedule_status END,
         updated_at = now()
   WHERE id = v_order.id AND business_id = p_business_id
   RETURNING * INTO v_order;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudieron guardar los detalles del pedido'; END IF;
  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.create_business_order_with_details(
  uuid, uuid, jsonb, text, text, text, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_order_with_details(
  uuid, uuid, jsonb, text, text, text, uuid, text, jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.handoff_marketplace_order(
  p_business_id uuid,
  p_order_id uuid,
  p_idempotency_key uuid,
  p_cash_received integer DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_organization_id uuid;
  v_cash_shift_id uuid;
BEGIN
  IF v_actor_id IS NULL OR p_business_id IS NULL OR p_order_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Faltan datos para entregar el pedido a la plataforma';
  END IF;
  SELECT business.organization_id INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.lifecycle_status = 'active';
  IF v_organization_id IS NULL
     OR NOT private.business_license_is_available(p_business_id)
     OR NOT private.multibusiness_has_capability('business.operate_orders', v_organization_id, p_business_id) THEN
    RAISE EXCEPTION 'No tienes permiso para entregar pedidos de este negocio';
  END IF;

  SELECT order_row.* INTO v_order
    FROM public.orders AS order_row
   WHERE order_row.id = p_order_id AND order_row.business_id = p_business_id
   FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'El pedido no pertenece al negocio seleccionado'; END IF;
  IF v_order.marketplace_platform IS NULL THEN RAISE EXCEPTION 'Este pedido no pertenece a una plataforma'; END IF;
  IF v_order.marketplace_handed_off_at IS NOT NULL THEN RETURN v_order; END IF;
  IF v_order.status <> 'ready' THEN RAISE EXCEPTION 'El pedido debe estar listo antes de entregarlo'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.orders AS other_order
     WHERE other_order.marketplace_handoff_key = p_idempotency_key
       AND other_order.id <> p_order_id
  ) THEN
    RAISE EXCEPTION 'La clave de entrega ya se usó en otro pedido';
  END IF;

  IF v_order.marketplace_platform = 'didi_food' AND v_order.marketplace_payment_mode = 'cash' THEN
    IF p_cash_received IS NULL OR p_cash_received < 0 OR p_cash_received > 1000000 THEN
      RAISE EXCEPTION 'Escribe el efectivo que realmente recibiste del repartidor';
    END IF;
    SELECT shift.id INTO v_cash_shift_id
      FROM public.cash_shifts AS shift
     WHERE shift.business_id = p_business_id
       AND shift.status = 'open'
     ORDER BY shift.opened_at DESC
     LIMIT 1
     FOR UPDATE;
    IF v_cash_shift_id IS NULL THEN RAISE EXCEPTION 'Abre caja de este negocio antes de registrar el efectivo de Didi'; END IF;
  ELSE
    IF p_cash_received IS NOT NULL THEN RAISE EXCEPTION 'Este pedido se pagó en la aplicación y no lleva efectivo de caja'; END IF;
  END IF;

  PERFORM set_config('mideli.marketplace_internal_write', 'handoff', true);
  UPDATE public.orders AS order_row
     SET status = 'served',
         marketplace_handed_off_at = now(),
         marketplace_handed_off_by = v_actor_id,
         marketplace_handoff_key = p_idempotency_key,
         marketplace_cash_received = p_cash_received,
         marketplace_cash_shift_id = v_cash_shift_id,
         updated_at = now()
   WHERE order_row.id = p_order_id AND order_row.business_id = p_business_id
   RETURNING order_row.* INTO v_order;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.handoff_marketplace_order(uuid, uuid, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handoff_marketplace_order(uuid, uuid, uuid, integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION private.cash_shift_totals(p_shift_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH shift AS (
    SELECT opening_float, business_id FROM public.cash_shifts WHERE id = p_shift_id
  ), transaction_totals AS (
    SELECT count(*) FILTER (WHERE status = 'completed')::integer AS payment_count,
      COALESCE(sum(subtotal_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS gross_sales,
      COALESCE(sum(discount_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS discount_total,
      COALESCE(sum(tip_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS tip_total,
      COALESCE(sum(subtotal_amount - discount_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS net_sales,
      COALESCE(sum(total_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS collected_total,
      COALESCE(sum(total_amount) FILTER (WHERE status = 'voided'), 0)::numeric(12,2) AS voided_total
    FROM public.payment_transactions WHERE cash_shift_id = p_shift_id
  ), tender_totals AS (
    SELECT
      COALESCE(sum(tender.amount) FILTER (WHERE tender.method = 'efectivo'), 0)::numeric(12,2) AS cash_total,
      COALESCE(sum(tender.amount) FILTER (WHERE tender.method = 'tarjeta'), 0)::numeric(12,2) AS card_total,
      COALESCE(sum(tender.amount) FILTER (WHERE tender.method = 'transferencia'), 0)::numeric(12,2) AS transfer_total
    FROM public.payment_tenders AS tender
    JOIN public.payment_transactions AS transaction
      ON transaction.id = tender.transaction_id AND transaction.status = 'completed'
    WHERE transaction.cash_shift_id = p_shift_id
  ), marketplace_totals AS (
    SELECT COALESCE(sum(order_row.marketplace_cash_received), 0)::numeric(12,2) AS marketplace_cash_total
      FROM public.orders AS order_row CROSS JOIN shift
     WHERE order_row.marketplace_cash_shift_id = p_shift_id
       AND order_row.business_id = shift.business_id
       AND order_row.marketplace_platform = 'didi_food'
       AND order_row.marketplace_payment_mode = 'cash'
       AND order_row.marketplace_handed_off_at IS NOT NULL
  ), movement_totals AS (
    SELECT
      COALESCE(sum(amount) FILTER (WHERE movement_type = 'fund_addition'), 0)::numeric(12,2) AS fund_in_total,
      COALESCE(sum(amount) FILTER (WHERE movement_type = 'withdrawal'), 0)::numeric(12,2) AS withdrawal_total,
      COALESCE(sum(amount) FILTER (WHERE movement_type = 'expense'), 0)::numeric(12,2) AS expense_total,
      COALESCE(sum(CASE WHEN movement_type = 'correction' AND direction = 'in' THEN amount
                        WHEN movement_type = 'correction' AND direction = 'out' THEN -amount ELSE 0 END), 0)::numeric(12,2) AS correction_total
    FROM public.cash_movements WHERE shift_id = p_shift_id
  ), pending_totals AS (
    SELECT count(*)::integer AS pending_order_count,
      COALESCE(sum(GREATEST(order_row.total::numeric - order_row.paid_amount, 0)), 0)::numeric(12,2) AS pending_balance
    FROM public.orders AS order_row CROSS JOIN shift
    WHERE order_row.business_id = shift.business_id
      AND order_row.marketplace_platform IS NULL
      AND order_row.status <> 'cancelled'
      AND order_row.payment_status <> 'paid'
      AND order_row.total::numeric > order_row.paid_amount
  )
  SELECT jsonb_build_object(
    'payment_count', transaction_totals.payment_count,
    'gross_sales', transaction_totals.gross_sales,
    'discount_total', transaction_totals.discount_total,
    'tip_total', transaction_totals.tip_total,
    'net_sales', transaction_totals.net_sales,
    'collected_total', transaction_totals.collected_total,
    'voided_total', transaction_totals.voided_total,
    'cash_total', tender_totals.cash_total,
    'marketplace_cash_total', marketplace_totals.marketplace_cash_total,
    'card_total', tender_totals.card_total,
    'transfer_total', tender_totals.transfer_total,
    'fund_in_total', movement_totals.fund_in_total,
    'withdrawal_total', movement_totals.withdrawal_total,
    'expense_total', movement_totals.expense_total,
    'correction_total', movement_totals.correction_total,
    'pending_order_count', pending_totals.pending_order_count,
    'pending_balance', pending_totals.pending_balance,
    'expected_cash', ROUND(shift.opening_float + tender_totals.cash_total
      + marketplace_totals.marketplace_cash_total + movement_totals.fund_in_total
      - movement_totals.withdrawal_total - movement_totals.expense_total
      + movement_totals.correction_total, 2)
  )
  FROM shift CROSS JOIN transaction_totals CROSS JOIN tender_totals
    CROSS JOIN marketplace_totals CROSS JOIN movement_totals CROSS JOIN pending_totals;
$$;

CREATE OR REPLACE FUNCTION private.cash_shift_json(
  p_shift_id uuid,
  p_reveal_cash boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_shift public.cash_shifts%ROWTYPE;
  v_result jsonb;
  v_totals jsonb;
  v_receipts jsonb;
  v_opened_by_name text;
  v_closed_by_name text;
  v_authorized_by_name text;
  v_archived_by_name text;
BEGIN
  SELECT * INTO v_shift FROM public.cash_shifts WHERE id = p_shift_id;
  IF v_shift.id IS NULL THEN RETURN NULL; END IF;
  SELECT full_name INTO v_opened_by_name FROM public.profiles WHERE id = v_shift.opened_by;
  SELECT full_name INTO v_closed_by_name FROM public.profiles WHERE id = v_shift.closed_by;
  SELECT full_name INTO v_authorized_by_name FROM public.profiles WHERE id = v_shift.difference_authorized_by;
  SELECT full_name INTO v_archived_by_name FROM public.profiles WHERE id = v_shift.archived_by;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'order_id', order_row.id,
    'order_number', order_row.number,
    'platform', order_row.marketplace_platform,
    'amount', CASE
      WHEN p_reveal_cash OR v_shift.status = 'closed' THEN order_row.marketplace_cash_received
      ELSE NULL
    END,
    'received_at', order_row.marketplace_handed_off_at,
    'received_by_name', profile.full_name
  ) ORDER BY order_row.marketplace_handed_off_at, order_row.number), '[]'::jsonb)
    INTO v_receipts
    FROM public.orders AS order_row
    LEFT JOIN public.profiles AS profile ON profile.id = order_row.marketplace_handed_off_by
   WHERE order_row.marketplace_cash_shift_id = v_shift.id
     AND order_row.business_id = v_shift.business_id
     AND order_row.marketplace_cash_received IS NOT NULL;

  v_result := to_jsonb(v_shift) || jsonb_build_object(
    'opened_by_name', COALESCE(v_opened_by_name, 'Personal'),
    'closed_by_name', v_closed_by_name,
    'difference_authorized_by_name', v_authorized_by_name,
    'archived_by_name', v_archived_by_name,
    'marketplace_cash_receipts', v_receipts
  );
  IF v_shift.status = 'open' THEN
    v_totals := private.cash_shift_totals(v_shift.id);
    IF NOT p_reveal_cash THEN
      v_totals := v_totals - ARRAY['cash_total', 'marketplace_cash_total', 'expected_cash', 'gross_sales', 'net_sales', 'collected_total'];
    END IF;
    v_result := v_result || jsonb_build_object('operating_totals', v_totals);
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION private.snapshot_marketplace_cash_on_shift_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'open' AND NEW.status = 'closed' THEN
    SELECT COALESCE(sum(order_row.marketplace_cash_received), 0)::numeric(12,2)
      INTO NEW.marketplace_cash_total
      FROM public.orders AS order_row
     WHERE order_row.marketplace_cash_shift_id = OLD.id
       AND order_row.business_id = OLD.business_id
       AND order_row.marketplace_handed_off_at IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.snapshot_marketplace_cash_on_shift_close()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER cash_shifts_snapshot_marketplace_cash
  BEFORE UPDATE OF status ON public.cash_shifts
  FOR EACH ROW
  EXECUTE FUNCTION private.snapshot_marketplace_cash_on_shift_close();

CREATE OR REPLACE FUNCTION private.skip_marketplace_pending_cash_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.orders AS order_row
     WHERE order_row.id = NEW.order_id
       AND order_row.marketplace_platform IS NOT NULL
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.skip_marketplace_pending_cash_orders()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER cash_shift_pending_orders_skip_marketplace
  BEFORE INSERT ON public.cash_shift_pending_orders
  FOR EACH ROW
  EXECUTE FUNCTION private.skip_marketplace_pending_cash_orders();

REVOKE ALL ON FUNCTION private.cash_shift_totals(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cash_shift_totals(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.cash_shift_json(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cash_shift_json(uuid, boolean) TO authenticated;

COMMIT;
