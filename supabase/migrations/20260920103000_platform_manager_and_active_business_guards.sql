-- Give the existing Mideli administrator the platform capability without
-- changing credentials or inventing another person. The exact business-owner
-- relationship is used as the identity anchor.
DO $$
DECLARE
  v_admin_id uuid;
  v_admin_count integer;
  v_platform_membership_id uuid;
BEGIN
  SELECT count(*)::integer
    INTO v_admin_count
    FROM public.profiles AS profile
    JOIN public.memberships AS business_membership
      ON business_membership.user_id = profile.id
     AND business_membership.scope_type = 'business'
     AND business_membership.role_code = 'business_owner'
     AND business_membership.status = 'active'
    JOIN public.businesses AS business
      ON business.id = business_membership.business_id
     AND business.slug = 'mideli'
    JOIN public.organizations AS organization
      ON organization.id = business.organization_id
     AND organization.slug = 'rincon-404-food-park'
   WHERE profile.full_name = 'Administrador'
     AND profile.is_active;

  IF v_admin_count > 1 THEN
    RAISE EXCEPTION 'Hay más de un administrador elegible para acceso de plataforma';
  END IF;

  SELECT profile.id
    INTO v_admin_id
    FROM public.profiles AS profile
    JOIN public.memberships AS business_membership
      ON business_membership.user_id = profile.id
     AND business_membership.scope_type = 'business'
     AND business_membership.role_code = 'business_owner'
     AND business_membership.status = 'active'
    JOIN public.businesses AS business
      ON business.id = business_membership.business_id
     AND business.slug = 'mideli'
    JOIN public.organizations AS organization
      ON organization.id = business.organization_id
     AND organization.slug = 'rincon-404-food-park'
   WHERE profile.full_name = 'Administrador'
     AND profile.is_active;

  IF v_admin_id IS NULL THEN
    RAISE NOTICE 'No se encontró el administrador actual de Mideli; no se creó acceso de plataforma';
    RETURN;
  END IF;

  INSERT INTO public.memberships (
    user_id,
    scope_type,
    role_code,
    status,
    created_by
  )
  SELECT
    v_admin_id,
    'platform',
    'platform_admin',
    'active',
    v_admin_id
  WHERE NOT EXISTS (
    SELECT 1
      FROM public.memberships AS membership
     WHERE membership.user_id = v_admin_id
       AND membership.scope_type = 'platform'
       AND membership.role_code = 'platform_admin'
       AND membership.status = 'active'
  )
  RETURNING id INTO v_platform_membership_id;

  IF v_platform_membership_id IS NULL THEN
    SELECT membership.id
      INTO v_platform_membership_id
      FROM public.memberships AS membership
     WHERE membership.user_id = v_admin_id
       AND membership.scope_type = 'platform'
       AND membership.role_code = 'platform_admin'
       AND membership.status = 'active'
     LIMIT 1;
  END IF;

  INSERT INTO public.membership_capabilities (
    membership_id,
    capability_code,
    granted_by,
    grant_reason
  )
  SELECT
    v_platform_membership_id,
    capability.code,
    v_admin_id,
    'Acceso inicial del administrador de Rincón 404 Food Park'
    FROM public.capabilities AS capability
   WHERE capability.code = 'platform.manage_businesses'
     AND capability.scope_type = 'platform'
     AND capability.is_active
  ON CONFLICT DO NOTHING;

  INSERT INTO public.audit_events (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  )
  SELECT
    v_admin_id,
    'platform_access_granted',
    'membership',
    v_platform_membership_id,
    'Se habilitó la administración de negocios para el administrador existente de Mideli',
    jsonb_build_object('capability', 'platform.manage_businesses')
  WHERE NOT EXISTS (
    SELECT 1
      FROM public.audit_events AS audit
     WHERE audit.entity_id = v_platform_membership_id
       AND audit.action = 'platform_access_granted'
  );
END;
$$;

-- Draft and paused businesses may be configured, but never operated or
-- charged. The UI and the public RPCs use this helper so lifecycle state is a
-- backend rule rather than only a navigation convention.
CREATE OR REPLACE FUNCTION private.multibusiness_require_business_capability(
  p_business_id uuid,
  p_capability text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organization_id uuid;
  v_lifecycle_status text;
BEGIN
  SELECT business.organization_id, business.lifecycle_status
    INTO v_organization_id, v_lifecycle_status
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.lifecycle_status NOT IN ('archived', 'retired');

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'El negocio seleccionado no está disponible';
  END IF;

  IF p_capability IN (
    'business.operate_orders',
    'business.update_preparation',
    'business.charge_orders',
    'business.manage_cash',
    'organization.operate_orders',
    'organization.charge_orders'
  ) AND v_lifecycle_status <> 'active' THEN
    RAISE EXCEPTION 'El negocio todavía no está activo para operar';
  END IF;

  IF NOT private.multibusiness_has_capability(
    p_capability,
    v_organization_id,
    CASE
      WHEN p_capability LIKE 'organization.%' THEN NULL
      ELSE p_business_id
    END
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para operar este negocio';
  END IF;

  RETURN v_organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_can_operate_business(
  p_business_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.businesses AS business
     WHERE business.id = p_business_id
       AND business.lifecycle_status = 'active'
       AND (
         private.multibusiness_has_capability(
           'business.operate_orders', business.organization_id, business.id
         )
         OR private.multibusiness_has_capability(
           'business.charge_orders', business.organization_id, business.id
         )
         OR private.multibusiness_has_capability(
           'business.manage_cash', business.organization_id, business.id
         )
         OR private.multibusiness_has_capability(
           'organization.operate_orders', business.organization_id, NULL
         )
         OR private.multibusiness_has_capability(
           'organization.charge_orders', business.organization_id, NULL
         )
       )
  );
$$;

-- Charging is a security-definer path, so it also gets an explicit active
-- lifecycle check before any payment allocation is inspected.
CREATE OR REPLACE FUNCTION public.multibusiness_payment_action(
  p_business_id uuid,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_organization_id uuid;
  v_existing_id uuid;
  v_order_business_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  SELECT business.organization_id
    INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.lifecycle_status = 'active';
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'El negocio todavía no está activo para cobrar';
  END IF;

  IF NOT (
    private.multibusiness_has_capability(
      'business.charge_orders', v_organization_id, p_business_id
    )
    OR private.multibusiness_has_capability(
      'organization.charge_orders', v_organization_id, NULL
    )
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para cobrar en este negocio';
  END IF;

  PERFORM pg_catalog.set_config(
    'mideli.business_id',
    p_business_id::text,
    true
  );

  IF p_action = 'authorize_discount' THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.profiles AS profile
       WHERE profile.id = (v_payload->>'p_authorizer_id')::uuid
         AND profile.is_active
         AND profile.role IN ('owner', 'admin')
         AND EXISTS (
           SELECT 1
             FROM public.memberships AS membership
            WHERE membership.user_id = profile.id
              AND membership.status = 'active'
              AND (
                membership.business_id = p_business_id
                OR (
                  membership.organization_id = v_organization_id
                  AND membership.scope_type IN ('organization', 'platform')
                )
              )
         )
    ) THEN
      RAISE EXCEPTION 'El autorizador no pertenece al negocio seleccionado';
    END IF;

    RETURN to_jsonb(private.authorize_payment_discount(
      (v_payload->>'p_authorizer_id')::uuid,
      COALESCE(v_payload->>'p_pin', ''),
      (v_payload->>'p_idempotency_key')::uuid,
      (v_payload->>'p_discount_amount')::numeric
    ));
  END IF;

  IF p_action <> 'finalize' THEN
    RAISE EXCEPTION 'La operación de pago no es válida';
  END IF;

  SELECT transaction.id, transaction.business_id
    INTO v_existing_id, v_order_business_id
    FROM public.payment_transactions AS transaction
   WHERE transaction.idempotency_key = (v_payload->>'p_idempotency_key')::uuid;
  IF v_existing_id IS NOT NULL THEN
    IF v_order_business_id IS DISTINCT FROM p_business_id THEN
      RAISE EXCEPTION 'La clave del cobro ya pertenece a otro negocio';
    END IF;
    RETURN private.payment_receipt_json(v_existing_id);
  END IF;

  IF jsonb_typeof(COALESCE(v_payload->'p_order_allocations', '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(v_payload->'p_order_allocations', '[]'::jsonb)) = 0
     OR jsonb_typeof(COALESCE(v_payload->'p_item_allocations', '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(v_payload->'p_item_allocations', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'No hay productos para el ticket';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_payload->'p_order_allocations') AS allocation
      LEFT JOIN public.orders AS order_row
        ON order_row.id = (allocation->>'order_id')::uuid
     WHERE order_row.id IS NULL
        OR order_row.business_id IS DISTINCT FROM p_business_id
  ) THEN
    RAISE EXCEPTION 'El cobro contiene un pedido de otro negocio';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_payload->'p_item_allocations') AS item
      LEFT JOIN public.order_items AS order_item
        ON order_item.id = (item->>'order_item_id')::uuid
      LEFT JOIN public.orders AS order_row
        ON order_row.id = order_item.order_id
     WHERE order_item.id IS NULL
        OR order_row.business_id IS DISTINCT FROM p_business_id
        OR NOT EXISTS (
          SELECT 1
            FROM jsonb_array_elements(v_payload->'p_order_allocations') AS allocation
           WHERE (allocation->>'order_id')::uuid = order_item.order_id
        )
  ) THEN
    RAISE EXCEPTION 'El cobro contiene un producto de otro negocio';
  END IF;

  IF (v_payload->>'p_discount_authorization') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM private.payment_discount_authorizations AS discount_auth
        WHERE discount_auth.token = (v_payload->>'p_discount_authorization')::uuid
          AND discount_auth.business_id = p_business_id
          AND discount_auth.used_at IS NULL
          AND discount_auth.expires_at > now()
     ) THEN
    RAISE EXCEPTION 'La autorización del descuento no pertenece al negocio seleccionado';
  END IF;

  RETURN private.finalize_payment(
    (v_payload->>'p_idempotency_key')::uuid,
    v_payload->'p_order_allocations',
    v_payload->'p_item_allocations',
    v_payload->'p_tenders',
    COALESCE((v_payload->>'p_tip_amount')::numeric, 0),
    (v_payload->>'p_discount_authorization')::uuid
  );
END;
$$;

REVOKE ALL ON FUNCTION private.multibusiness_require_business_capability(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_can_operate_business(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.multibusiness_payment_action(uuid, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.multibusiness_payment_action(uuid, text, jsonb)
  TO authenticated;
