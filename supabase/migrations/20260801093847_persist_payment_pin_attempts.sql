CREATE OR REPLACE FUNCTION private.authorize_payment_discount(
  p_authorizer_id uuid,
  p_pin text,
  p_idempotency_key uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := (SELECT auth.uid());
  v_caller_role text := public.get_user_role();
  v_authorizer_role text;
  v_pin private.staff_authorization_pins%ROWTYPE;
  v_token uuid;
BEGIN
  IF v_caller_id IS NULL OR v_caller_role NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para solicitar descuentos';
  END IF;

  IF p_idempotency_key IS NULL OR p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'La autorización no es válida';
  END IF;

  SELECT role INTO v_authorizer_role
  FROM public.profiles
  WHERE id = p_authorizer_id AND is_active;

  IF v_authorizer_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'El autorizador no tiene permisos administrativos';
  END IF;

  SELECT * INTO v_pin
  FROM private.staff_authorization_pins
  WHERE user_id = p_authorizer_id
  FOR UPDATE;

  IF v_pin.user_id IS NULL THEN
    RAISE EXCEPTION 'El administrador aún no configura su PIN';
  END IF;

  IF v_pin.locked_until IS NOT NULL AND v_pin.locked_until > now() THEN
    RAISE EXCEPTION 'PIN bloqueado temporalmente por varios intentos';
  END IF;

  IF extensions.crypt(p_pin, v_pin.pin_hash) <> v_pin.pin_hash THEN
    UPDATE private.staff_authorization_pins
    SET failed_attempts = CASE WHEN failed_attempts >= 4 THEN 0 ELSE failed_attempts + 1 END,
        locked_until = CASE WHEN failed_attempts >= 4 THEN now() + interval '10 minutes' ELSE NULL END,
        updated_at = now()
    WHERE user_id = p_authorizer_id;

    -- Returning NULL lets the failed-attempt update commit. Raising here would
    -- roll the update back together with the function call.
    RETURN NULL;
  END IF;

  UPDATE private.staff_authorization_pins
  SET failed_attempts = 0,
      locked_until = NULL,
      updated_at = now()
  WHERE user_id = p_authorizer_id;

  INSERT INTO private.payment_discount_authorizations (
    requested_by,
    authorized_by,
    idempotency_key
  )
  VALUES (v_caller_id, p_authorizer_id, p_idempotency_key)
  ON CONFLICT (requested_by, idempotency_key)
  DO UPDATE SET
    authorized_by = EXCLUDED.authorized_by,
    expires_at = now() + interval '10 minutes',
    used_at = NULL
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION private.authorize_payment_discount(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.authorize_payment_discount(uuid, text, uuid)
  TO authenticated;
