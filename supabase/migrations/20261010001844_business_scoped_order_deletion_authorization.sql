BEGIN;

-- Mesero and supervisor deletion requests must be approved by an owner who is
-- active in the same business. Never expose the stored PIN hash to the client.
CREATE OR REPLACE FUNCTION public.list_business_order_deletion_authorizers(
  p_business_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_organization_id uuid;
  v_is_business_owner boolean;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.profiles AS profile
     WHERE profile.id = v_actor_id
       AND profile.is_active
  ) THEN
    RAISE EXCEPTION 'Tu sesión no puede solicitar autorizaciones';
  END IF;

  SELECT business.organization_id
    INTO v_organization_id
    FROM public.businesses AS business
    JOIN public.organizations AS organization
      ON organization.id = business.organization_id
   WHERE business.id = p_business_id
     AND business.lifecycle_status = 'active'
     AND organization.lifecycle_status <> 'retired';

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'El negocio no está disponible';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.memberships AS membership
     WHERE membership.user_id = v_actor_id
       AND membership.organization_id = v_organization_id
       AND membership.business_id = p_business_id
       AND membership.scope_type = 'business'
       AND membership.role_code = 'business_owner'
       AND membership.status = 'active'
  )
    INTO v_is_business_owner;

  IF NOT v_is_business_owner AND NOT private.multibusiness_has_capability(
    'business.operate_orders', v_organization_id, p_business_id
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para solicitar el borrado de pedidos de este negocio';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', profile.id,
        'full_name', profile.full_name,
        'pin_configured', pin.user_id IS NOT NULL
      ) ORDER BY profile.full_name, profile.id
    ),
    '[]'::jsonb
  )
    INTO v_result
    FROM public.memberships AS membership
    JOIN public.profiles AS profile
      ON profile.id = membership.user_id
    LEFT JOIN private.staff_authorization_pins AS pin
      ON pin.user_id = profile.id
   WHERE membership.organization_id = v_organization_id
     AND membership.business_id = p_business_id
     AND membership.scope_type = 'business'
     AND membership.role_code = 'business_owner'
     AND membership.status = 'active'
     AND profile.is_active;

  RETURN v_result;
END;
$$;

-- The authenticated entry point validates the exact business, owner PIN and
-- order, then invokes the existing atomic deletion in this same transaction.
CREATE OR REPLACE FUNCTION public.delete_business_order_with_owner_pin(
  p_order_id uuid,
  p_business_id uuid,
  p_authorizer_id uuid DEFAULT NULL,
  p_pin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_organization_id uuid;
  v_is_business_owner boolean;
  v_is_local_staff boolean;
  v_is_global_waiter boolean;
  v_order public.orders%ROWTYPE;
  v_pin private.staff_authorization_pins%ROWTYPE;
  v_next_attempt integer;
  v_deleted boolean;
BEGIN
  IF v_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.profiles AS profile
     WHERE profile.id = v_actor_id
       AND profile.is_active
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'code', 'NOT_AUTHENTICATED',
      'message', 'Tu sesión expiró. Inicia sesión nuevamente.'
    );
  END IF;

  SELECT business.organization_id
    INTO v_organization_id
    FROM public.businesses AS business
    JOIN public.organizations AS organization
      ON organization.id = business.organization_id
   WHERE business.id = p_business_id
     AND business.lifecycle_status = 'active'
     AND organization.lifecycle_status <> 'retired';

  IF v_organization_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'code', 'BUSINESS_UNAVAILABLE',
      'message', 'El negocio no está disponible para esta operación.'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.memberships AS membership
     WHERE membership.user_id = v_actor_id
       AND membership.organization_id = v_organization_id
       AND membership.business_id = p_business_id
       AND membership.scope_type = 'business'
       AND membership.role_code = 'business_owner'
       AND membership.status = 'active'
  )
    INTO v_is_business_owner;

  IF NOT v_is_business_owner AND NOT private.multibusiness_has_capability(
    'business.operate_orders', v_organization_id, p_business_id
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'code', 'NOT_ALLOWED',
      'message', 'No tienes permiso para eliminar pedidos de este negocio.'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.memberships AS membership
     WHERE membership.user_id = v_actor_id
       AND membership.organization_id = v_organization_id
       AND membership.business_id = p_business_id
       AND membership.scope_type = 'business'
       AND membership.status = 'active'
  )
    INTO v_is_local_staff;

  SELECT EXISTS (
    SELECT 1
      FROM public.memberships AS membership
     WHERE membership.user_id = v_actor_id
       AND membership.organization_id = v_organization_id
       AND membership.scope_type = 'organization'
       AND membership.role_code = 'global_waiter'
       AND membership.status = 'active'
  )
    INTO v_is_global_waiter;

  SELECT order_row.*
    INTO v_order
    FROM public.orders AS order_row
   WHERE order_row.id = p_order_id
     AND order_row.business_id = p_business_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'code', 'ORDER_NOT_FOUND',
      'message', 'El pedido ya no existe o no pertenece a este negocio.'
    );
  END IF;

  IF v_order.marketplace_platform IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'code', 'ORDER_MARKETPLACE_PROTECTED',
      'message', 'Los pedidos de Uber Eats y DiDi Food se conservan para proteger su ticket y registro de caja.'
    );
  END IF;

  IF v_is_global_waiter AND NOT v_is_local_staff AND v_order.type <> 'comedor' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'code', 'ORDER_SCOPE_RESTRICTED',
      'message', 'La mesera global solo puede eliminar pedidos de comedor en otros negocios.'
    );
  END IF;

  IF NOT v_is_business_owner THEN
    IF p_authorizer_id IS NULL OR p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
      RETURN pg_catalog.jsonb_build_object(
        'success', false,
        'code', 'PIN_REQUIRED',
        'message', 'Selecciona al dueño de este negocio e ingresa su PIN de 4 dígitos.'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM public.memberships AS membership
        JOIN public.profiles AS profile
          ON profile.id = membership.user_id
       WHERE membership.user_id = p_authorizer_id
         AND membership.organization_id = v_organization_id
         AND membership.business_id = p_business_id
         AND membership.scope_type = 'business'
         AND membership.role_code = 'business_owner'
         AND membership.status = 'active'
         AND profile.is_active
    ) THEN
      RETURN pg_catalog.jsonb_build_object(
        'success', false,
        'code', 'AUTHORIZER_NOT_BUSINESS_OWNER',
        'message', 'El autorizador debe ser dueño activo de este negocio.'
      );
    END IF;

    SELECT authorization_pin.*
      INTO v_pin
      FROM private.staff_authorization_pins AS authorization_pin
     WHERE authorization_pin.user_id = p_authorizer_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object(
        'success', false,
        'code', 'PIN_NOT_CONFIGURED',
        'message', 'El dueño seleccionado aún no configura su PIN en Personal.'
      );
    END IF;

    IF v_pin.locked_until IS NOT NULL AND v_pin.locked_until > now() THEN
      RETURN pg_catalog.jsonb_build_object(
        'success', false,
        'code', 'PIN_LOCKED',
        'message', 'El PIN está bloqueado temporalmente. Intenta de nuevo en 10 minutos.'
      );
    END IF;

    IF extensions.crypt(p_pin, v_pin.pin_hash) IS DISTINCT FROM v_pin.pin_hash THEN
      v_next_attempt := COALESCE(v_pin.failed_attempts, 0) + 1;
      UPDATE private.staff_authorization_pins AS authorization_pin
         SET failed_attempts = CASE WHEN v_next_attempt >= 5 THEN 0 ELSE v_next_attempt END,
             locked_until = CASE
               WHEN v_next_attempt >= 5 THEN now() + interval '10 minutes'
               ELSE NULL
             END,
             updated_at = now()
       WHERE authorization_pin.user_id = p_authorizer_id;

      RETURN pg_catalog.jsonb_build_object(
        'success', false,
        'code', 'PIN_INVALID',
        'message', 'El PIN de autorización es incorrecto.'
      );
    END IF;

    UPDATE private.staff_authorization_pins AS authorization_pin
       SET failed_attempts = 0,
           locked_until = NULL,
           updated_at = now()
     WHERE authorization_pin.user_id = p_authorizer_id;
  END IF;

  v_deleted := public.delete_sales_order_atomic(p_order_id, p_business_id);
  IF NOT v_deleted THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'code', 'ORDER_NOT_FOUND',
      'message', 'El pedido ya no existe o no pertenece a este negocio.'
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.list_business_order_deletion_authorizers(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_business_order_deletion_authorizers(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.delete_business_order_with_owner_pin(uuid, uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_business_order_with_owner_pin(uuid, uuid, uuid, text)
  TO authenticated;

COMMIT;
