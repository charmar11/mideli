ALTER TABLE private.payment_discount_authorizations
  ADD COLUMN discount_amount numeric(12,2)
  CHECK (discount_amount > 0);

DROP FUNCTION public.authorize_payment_discount(uuid, text, uuid);
DROP FUNCTION private.authorize_payment_discount(uuid, text, uuid);

CREATE FUNCTION private.authorize_payment_discount(
  p_authorizer_id uuid,
  p_pin text,
  p_idempotency_key uuid,
  p_discount_amount numeric
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
  v_discount numeric(12,2) := ROUND(COALESCE(p_discount_amount, 0), 2);
  v_token uuid;
BEGIN
  IF v_caller_id IS NULL OR v_caller_role NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para solicitar descuentos';
  END IF;

  IF p_idempotency_key IS NULL OR p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' OR v_discount <= 0 THEN
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
    idempotency_key,
    discount_amount
  )
  VALUES (v_caller_id, p_authorizer_id, p_idempotency_key, v_discount)
  ON CONFLICT (requested_by, idempotency_key)
  DO UPDATE SET
    authorized_by = EXCLUDED.authorized_by,
    discount_amount = EXCLUDED.discount_amount,
    expires_at = now() + interval '10 minutes',
    used_at = NULL
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$;

CREATE FUNCTION public.authorize_payment_discount(
  p_authorizer_id uuid,
  p_pin text,
  p_idempotency_key uuid,
  p_discount_amount numeric
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.authorize_payment_discount(
    p_authorizer_id,
    p_pin,
    p_idempotency_key,
    p_discount_amount
  );
$$;

CREATE FUNCTION private.validate_payment_discount_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.discount_amount <= 0 THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM private.payment_discount_authorizations AS authz
    WHERE authz.requested_by = NEW.charged_by
      AND authz.authorized_by = NEW.discount_authorized_by
      AND authz.idempotency_key = NEW.idempotency_key
      AND authz.discount_amount = NEW.discount_amount
      AND authz.used_at IS NULL
      AND authz.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'El descuento autorizado no coincide con el cobro';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_payment_discount_before_insert
  BEFORE INSERT ON public.payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_payment_discount_insert();

REVOKE ALL ON FUNCTION private.authorize_payment_discount(uuid, text, uuid, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.authorize_payment_discount(uuid, text, uuid, numeric)
  TO authenticated;
REVOKE ALL ON FUNCTION private.validate_payment_discount_insert()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.authorize_payment_discount(uuid, text, uuid, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_payment_discount(uuid, text, uuid, numeric)
  TO authenticated;
