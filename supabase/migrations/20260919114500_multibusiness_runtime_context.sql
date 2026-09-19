-- Runtime context for the future business selector and a single-business POS
-- order RPC. WhatsApp remains outside this selector and stays Mideli-only.

CREATE OR REPLACE FUNCTION public.get_my_multibusiness_context()
RETURNS TABLE (
  organization_id uuid,
  organization_slug text,
  organization_name text,
  organization_timezone text,
  business_id uuid,
  business_slug text,
  business_display_name text,
  business_timezone text,
  business_lifecycle_status text,
  membership_id uuid,
  membership_scope_type text,
  membership_role_code text,
  capability_codes text[]
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
WITH visible_businesses AS (
  SELECT business.*
    FROM public.businesses AS business
    JOIN public.organizations AS organization
      ON organization.id = business.organization_id
   WHERE auth.uid() IS NOT NULL
     AND organization.lifecycle_status <> 'retired'
     AND business.lifecycle_status NOT IN ('archived', 'retired')
     AND EXISTS (
       SELECT 1
         FROM public.memberships AS membership
        WHERE membership.user_id = auth.uid()
          AND membership.status = 'active'
          AND (
            membership.scope_type = 'platform'
            OR membership.business_id = business.id
            OR membership.organization_id = business.organization_id
          )
     )
)
SELECT
  organization.id,
  organization.slug,
  organization.name,
  organization.timezone,
  business.id,
  business.slug,
  business.display_name,
  business.timezone,
  business.lifecycle_status,
  effective_membership.id,
  effective_membership.scope_type,
  effective_membership.role_code,
  COALESCE(
    (
      SELECT array_agg(DISTINCT membership_capability.capability_code ORDER BY membership_capability.capability_code)
        FROM public.memberships AS membership
        JOIN public.membership_capabilities AS membership_capability
          ON membership_capability.membership_id = membership.id
        JOIN public.capabilities AS capability
          ON capability.code = membership_capability.capability_code
       WHERE membership.user_id = auth.uid()
         AND membership.status = 'active'
         AND membership_capability.revoked_at IS NULL
         AND capability.is_active
         AND (
           membership.scope_type = 'platform'
           OR membership.organization_id = business.organization_id
           OR membership.business_id = business.id
         )
         AND (
           (
             capability.scope_type = 'platform'
             AND membership_capability.organization_id IS NULL
             AND membership_capability.business_id IS NULL
           )
           OR (
             capability.scope_type = 'organization'
             AND membership_capability.organization_id = business.organization_id
             AND membership_capability.business_id IS NULL
           )
           OR (
             capability.scope_type = 'business'
             AND membership_capability.organization_id = business.organization_id
             AND membership_capability.business_id = business.id
           )
         )
    ),
    ARRAY[]::text[]
  )
  FROM visible_businesses AS business
  JOIN public.organizations AS organization
    ON organization.id = business.organization_id
  LEFT JOIN LATERAL (
    SELECT membership.id, membership.scope_type, membership.role_code
      FROM public.memberships AS membership
     WHERE membership.user_id = auth.uid()
       AND membership.status = 'active'
       AND (
         membership.scope_type = 'platform'
         OR membership.business_id = business.id
         OR membership.organization_id = business.organization_id
       )
     ORDER BY CASE membership.scope_type
       WHEN 'platform' THEN 1
       WHEN 'organization' THEN 2
       ELSE 3
     END, membership.created_at
     LIMIT 1
  ) AS effective_membership ON true
 ORDER BY organization.name, business.display_name;
$$;

-- A business-specific POS flow. The server canonicalizes the cart and owns
-- the prices. The older Mideli RPC remains available during the rollout.
CREATE OR REPLACE FUNCTION public.create_business_order_with_items(
  p_business_id uuid,
  p_creation_key uuid,
  p_items jsonb,
  p_order_type text,
  p_notes text DEFAULT '',
  p_table_number text DEFAULT NULL,
  p_table_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_existing public.orders%ROWTYPE;
  v_created public.orders%ROWTYPE;
  v_line record;
  v_total bigint := 0;
  v_created_order boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;
  IF p_business_id IS NULL THEN
    RAISE EXCEPTION 'Falta seleccionar el negocio';
  END IF;
  IF p_creation_key IS NULL THEN
    RAISE EXCEPTION 'Falta la clave de creación del pedido';
  END IF;
  IF p_order_type NOT IN ('comedor', 'domicilio', 'para_llevar') THEN
    RAISE EXCEPTION 'Tipo de pedido no válido';
  END IF;
  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'El pedido debe contener al menos un producto';
  END IF;

  SELECT business.organization_id
    INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.lifecycle_status = 'active';

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'El negocio no está disponible para recibir pedidos';
  END IF;

  IF p_table_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.restaurant_tables AS restaurant_table
     WHERE restaurant_table.id = p_table_id
       AND restaurant_table.organization_id = v_organization_id
       AND restaurant_table.is_active
  ) THEN
    RAISE EXCEPTION 'La mesa no está disponible en esta organización';
  END IF;

  IF NOT (
    private.multibusiness_has_capability(
      'organization.operate_orders', v_organization_id, NULL
    )
    OR private.multibusiness_has_capability(
      'business.operate_orders', v_organization_id, p_business_id
    )
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para operar este negocio';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS multibusiness_single_order_lines (
    line_number bigint NOT NULL,
    menu_item_id uuid NOT NULL,
    business_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price integer NOT NULL,
    notes text NOT NULL,
    selected_modifiers jsonb NOT NULL,
    line_total bigint NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.multibusiness_single_order_lines;

  INSERT INTO pg_temp.multibusiness_single_order_lines (
    line_number,
    menu_item_id,
    business_id,
    quantity,
    unit_price,
    notes,
    selected_modifiers,
    line_total
  )
  SELECT
    input_line.ordinality,
    canonical.menu_item_id,
    canonical.business_id,
    canonical.quantity,
    canonical.unit_price,
    canonical.notes,
    canonical.selected_modifiers,
    canonical.line_total
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS input_line(value, ordinality)
    CROSS JOIN LATERAL private.multibusiness_canonicalize_order_item(input_line.value) AS canonical;

  IF EXISTS (
    SELECT 1
      FROM pg_temp.multibusiness_single_order_lines
     WHERE business_id IS DISTINCT FROM p_business_id
  ) THEN
    RAISE EXCEPTION 'El carrito contiene productos de otro negocio';
  END IF;

  SELECT COALESCE(SUM(line_total), 0)::bigint
    INTO v_total
    FROM pg_temp.multibusiness_single_order_lines;
  IF v_total > 2147483647 THEN
    RAISE EXCEPTION 'El total del pedido excede el límite permitido';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_creation_key::text, 406));
  SELECT *
    INTO v_existing
    FROM public.orders AS order_row
   WHERE order_row.creation_key = p_creation_key
   FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.business_id IS DISTINCT FROM p_business_id THEN
      RAISE EXCEPTION 'La clave del pedido ya fue utilizada por otro negocio';
    END IF;
    RETURN v_existing;
  END IF;

  INSERT INTO public.orders (
    creation_key,
    status,
    type,
    total,
    notes,
    table_number,
    table_id,
    customer_name,
    created_by,
    business_id
  ) VALUES (
    p_creation_key,
    'pending',
    p_order_type::public.order_type,
    v_total::integer,
    left(COALESCE(p_notes, ''), 1000),
    NULLIF(btrim(COALESCE(p_table_number, '')), ''),
    p_table_id,
    NULLIF(btrim(COALESCE(p_customer_name, '')), ''),
    v_user_id,
    p_business_id
  )
  RETURNING * INTO v_created;
  v_created_order := true;

  IF v_created_order THEN
    INSERT INTO public.order_items (
      order_id,
      menu_item_id,
      quantity,
      unit_price,
      notes,
      selected_modifiers
    )
    SELECT
      v_created.id,
      line.menu_item_id,
      line.quantity,
      line.unit_price,
      line.notes,
      line.selected_modifiers
      FROM pg_temp.multibusiness_single_order_lines AS line
     ORDER BY line.line_number;

    INSERT INTO public.order_status_log (order_id, to_status, changed_by)
    VALUES (v_created.id, 'pending', v_user_id);
  END IF;

  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_multibusiness_context()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_multibusiness_context()
  TO authenticated;

REVOKE ALL ON FUNCTION public.create_business_order_with_items(
  uuid, uuid, jsonb, text, text, text, uuid, text
)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_order_with_items(
  uuid, uuid, jsonb, text, text, text, uuid, text
)
  TO authenticated;
