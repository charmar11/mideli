-- Migration: Order deletion PIN authorization for waiters/staff
-- Allows waiters to delete orders only when authorized with an active owner/admin/supervisor PIN.

CREATE OR REPLACE FUNCTION private.authorize_order_deletion(
  p_order_id uuid,
  p_authorizer_id uuid DEFAULT NULL,
  p_pin text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := (SELECT auth.uid());
  v_caller_role text := private.active_profile_role();
  v_authorizer_role text;
  v_pin private.staff_authorization_pins%ROWTYPE;
  v_order_exists boolean;
  v_closed_shift_payment boolean;
  v_shared_payment boolean;
  v_transaction_ids uuid[];
BEGIN
  IF v_caller_id IS NULL OR v_caller_role NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para solicitar la eliminación de pedidos';
  END IF;

  -- Waiters (and non-admins) MUST provide a valid authorizer and PIN
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    IF p_authorizer_id IS NULL OR p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
      RAISE EXCEPTION 'Se requiere la selección de un administrador y su PIN de 4 dígitos';
    END IF;

    SELECT role INTO v_authorizer_role
    FROM public.profiles
    WHERE id = p_authorizer_id AND is_active;

    IF v_authorizer_role NOT IN ('owner', 'admin', 'supervisor') THEN
      RAISE EXCEPTION 'El usuario seleccionado no tiene permisos de autorización';
    END IF;

    SELECT * INTO v_pin
    FROM private.staff_authorization_pins
    WHERE user_id = p_authorizer_id
    FOR UPDATE;

    IF v_pin.user_id IS NULL THEN
      RAISE EXCEPTION 'El administrador seleccionado aún no configura su PIN';
    END IF;

    IF v_pin.locked_until IS NOT NULL AND v_pin.locked_until > now() THEN
      RAISE EXCEPTION 'PIN bloqueado temporalmente por varios intentos erróneos. Intenta en 10 minutos.';
    END IF;

    IF extensions.crypt(p_pin, v_pin.pin_hash) <> v_pin.pin_hash THEN
      UPDATE private.staff_authorization_pins
      SET failed_attempts = CASE WHEN failed_attempts >= 4 THEN 0 ELSE failed_attempts + 1 END,
          locked_until = CASE WHEN failed_attempts >= 4 THEN now() + interval '10 minutes' ELSE NULL END,
          updated_at = now()
      WHERE user_id = p_authorizer_id;
      RAISE EXCEPTION 'PIN de autorización incorrecto';
    END IF;

    UPDATE private.staff_authorization_pins
    SET failed_attempts = 0, locked_until = NULL, updated_at = now()
    WHERE user_id = p_authorizer_id;
  END IF;

  -- Validate order existence
  SELECT EXISTS(SELECT 1 FROM public.orders WHERE id = p_order_id) INTO v_order_exists;
  IF NOT v_order_exists THEN
    RAISE EXCEPTION 'El pedido ya no existe';
  END IF;

  -- Check if order belongs to a closed cash shift
  SELECT ARRAY(
    SELECT DISTINCT transaction_id
    FROM public.payment_order_allocations
    WHERE order_id = p_order_id
  ) INTO v_transaction_ids;

  IF array_length(v_transaction_ids, 1) > 0 THEN
    SELECT EXISTS(
      SELECT 1
      FROM public.payment_transactions pt
      JOIN public.cash_shifts cs ON cs.id = pt.cash_shift_id
      WHERE pt.id = ANY(v_transaction_ids)
        AND cs.status = 'closed'
    ) INTO v_closed_shift_payment;

    IF v_closed_shift_payment THEN
      RAISE EXCEPTION 'Este pedido pertenece a un corte cerrado y no se puede eliminar. Registra una corrección en Caja.';
    END IF;

    SELECT EXISTS(
      SELECT 1
      FROM public.payment_order_allocations
      WHERE transaction_id = ANY(v_transaction_ids)
        AND order_id <> p_order_id
    ) INTO v_shared_payment;

    IF v_shared_payment THEN
      RAISE EXCEPTION 'Este pedido pertenece a una cuenta dividida. Anula primero el ticket compartido para eliminarlo.';
    END IF;

    DELETE FROM public.payment_transactions WHERE id = ANY(v_transaction_ids);
  END IF;

  DELETE FROM public.orders WHERE id = p_order_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_order_deletion(
  p_order_id uuid,
  p_authorizer_id uuid DEFAULT NULL,
  p_pin text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.authorize_order_deletion(p_order_id, p_authorizer_id, p_pin);
$$;

REVOKE ALL ON FUNCTION private.authorize_order_deletion(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.authorize_order_deletion(uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.authorize_order_deletion(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_order_deletion(uuid, uuid, text) TO authenticated;
