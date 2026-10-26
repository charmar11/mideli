-- Platform orders can be deleted through the same business-scoped owner/PIN
-- authorization as other orders. Preserve Didi cash already recorded in a
-- register shift, closed-shift payments, shared payments, and concurrent locks.

CREATE OR REPLACE FUNCTION public.delete_sales_order_atomic(
  p_order_id uuid,
  p_business_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_order_business_id uuid;
  v_marketplace_cash_shift_id uuid;
  v_transaction_ids uuid[];
  v_deleted_count integer;
BEGIN
  SELECT order_row.business_id, order_row.marketplace_cash_shift_id
    INTO v_order_business_id, v_marketplace_cash_shift_id
    FROM public.orders AS order_row
   WHERE order_row.id = p_order_id
   FOR NO KEY UPDATE NOWAIT;

  IF NOT FOUND OR v_order_business_id IS DISTINCT FROM p_business_id THEN
    RETURN false;
  END IF;

  IF v_marketplace_cash_shift_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ORDER_DELETE_MARKETPLACE_CASH_HANDOFF';
  END IF;

  SELECT COALESCE(
    array_agg(DISTINCT allocation.transaction_id),
    ARRAY[]::uuid[]
  )
    INTO v_transaction_ids
    FROM public.payment_order_allocations AS allocation
   WHERE allocation.order_id = p_order_id;

  PERFORM allocation.id
    FROM public.payment_order_allocations AS allocation
   WHERE allocation.transaction_id = ANY(v_transaction_ids)
   ORDER BY allocation.id
   FOR UPDATE NOWAIT;

  PERFORM payment.id
    FROM public.payment_transactions AS payment
   WHERE payment.id = ANY(v_transaction_ids)
   ORDER BY payment.id
   FOR UPDATE NOWAIT;

  PERFORM shift.id
    FROM public.cash_shifts AS shift
    JOIN public.payment_transactions AS payment
      ON payment.cash_shift_id = shift.id
   WHERE payment.id = ANY(v_transaction_ids)
   ORDER BY shift.id
   FOR UPDATE OF shift NOWAIT;

  IF EXISTS (
    SELECT 1
      FROM public.payment_transactions AS payment
      JOIN public.cash_shifts AS shift ON shift.id = payment.cash_shift_id
     WHERE payment.id = ANY(v_transaction_ids)
       AND shift.status = 'closed'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ORDER_DELETE_CLOSED_SHIFT';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.payment_order_allocations AS allocation
     WHERE allocation.transaction_id = ANY(v_transaction_ids)
       AND allocation.order_id <> p_order_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ORDER_DELETE_SHARED_PAYMENT';
  END IF;

  DELETE FROM public.payment_transactions AS payment
   WHERE payment.id = ANY(v_transaction_ids);

  DELETE FROM public.orders AS order_row
   WHERE order_row.id = p_order_id
     AND order_row.business_id = v_order_business_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ORDER_NOT_FOUND';
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION private.block_marketplace_order_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.marketplace_platform IS NOT NULL
     AND OLD.marketplace_cash_shift_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ORDER_DELETE_MARKETPLACE_CASH_HANDOFF';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.block_marketplace_order_delete()
  FROM PUBLIC, anon, authenticated;

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

REVOKE ALL ON FUNCTION public.delete_business_order_with_owner_pin(uuid, uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_business_order_with_owner_pin(uuid, uuid, uuid, text)
  TO authenticated;
