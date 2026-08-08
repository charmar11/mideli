-- Payment method correction authorization for waiters and atomic category ordering.

CREATE TABLE private.payment_method_correction_authorizations (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id uuid NOT NULL REFERENCES public.payment_tenders(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  authorized_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requested_by, idempotency_key)
);

CREATE INDEX payment_method_correction_authorizations_tender_idx
  ON private.payment_method_correction_authorizations (tender_id, expires_at DESC);

ALTER TABLE private.payment_method_correction_authorizations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON private.payment_method_correction_authorizations
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.payment_tender_method_changes
  ADD COLUMN authorized_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT;

UPDATE public.payment_tender_method_changes
SET authorized_by = changed_by
WHERE authorized_by IS NULL;

ALTER TABLE public.payment_tender_method_changes
  ALTER COLUMN authorized_by SET NOT NULL;

CREATE INDEX payment_tender_method_changes_authorized_by_idx
  ON public.payment_tender_method_changes (authorized_by, created_at DESC);

CREATE OR REPLACE FUNCTION private.authorize_payment_method_correction(
  p_tender_id uuid,
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
  v_caller_role text := private.active_profile_role();
  v_authorizer_role text;
  v_pin private.staff_authorization_pins%ROWTYPE;
  v_transaction_status text;
  v_token uuid;
BEGIN
  IF v_caller_id IS NULL OR v_caller_role <> 'waiter' THEN
    RAISE EXCEPTION 'Solo un mesero activo puede solicitar esta autorización';
  END IF;

  IF p_tender_id IS NULL
     OR p_authorizer_id IS NULL
     OR p_idempotency_key IS NULL
     OR p_pin IS NULL
     OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'La autorización no es válida';
  END IF;

  SELECT payment.status
  INTO v_transaction_status
  FROM public.payment_tenders AS tender
  JOIN public.payment_transactions AS payment
    ON payment.id = tender.transaction_id
  WHERE tender.id = p_tender_id;

  IF v_transaction_status IS NULL THEN
    RAISE EXCEPTION 'No se encontró el pago';
  END IF;

  IF v_transaction_status <> 'completed' THEN
    RAISE EXCEPTION 'No se puede corregir un pago anulado';
  END IF;

  SELECT profile.role
  INTO v_authorizer_role
  FROM public.profiles AS profile
  WHERE profile.id = p_authorizer_id
    AND profile.is_active;

  IF v_authorizer_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Selecciona un propietario o administrador activo';
  END IF;

  SELECT authorization_pin.*
  INTO v_pin
  FROM private.staff_authorization_pins AS authorization_pin
  WHERE authorization_pin.user_id = p_authorizer_id
  FOR UPDATE;

  IF v_pin.user_id IS NULL THEN
    RAISE EXCEPTION 'El administrador seleccionado aún no configura su PIN';
  END IF;

  IF v_pin.locked_until IS NOT NULL AND v_pin.locked_until > now() THEN
    RAISE EXCEPTION 'PIN bloqueado temporalmente. Intenta más tarde';
  END IF;

  IF extensions.crypt(p_pin, v_pin.pin_hash) <> v_pin.pin_hash THEN
    UPDATE private.staff_authorization_pins
    SET failed_attempts = CASE WHEN failed_attempts >= 4 THEN 0 ELSE failed_attempts + 1 END,
        locked_until = CASE
          WHEN failed_attempts >= 4 THEN now() + interval '10 minutes'
          ELSE NULL
        END,
        updated_at = now()
    WHERE user_id = p_authorizer_id;

    RETURN NULL;
  END IF;

  UPDATE private.staff_authorization_pins
  SET failed_attempts = 0,
      locked_until = NULL,
      updated_at = now()
  WHERE user_id = p_authorizer_id;

  INSERT INTO private.payment_method_correction_authorizations (
    tender_id,
    requested_by,
    authorized_by,
    idempotency_key
  ) VALUES (
    p_tender_id,
    v_caller_id,
    p_authorizer_id,
    p_idempotency_key
  )
  ON CONFLICT (requested_by, idempotency_key)
  DO UPDATE SET
    token = gen_random_uuid(),
    tender_id = EXCLUDED.tender_id,
    authorized_by = EXCLUDED.authorized_by,
    expires_at = now() + interval '10 minutes',
    used_at = NULL,
    created_at = now()
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_payment_method_correction(
  p_tender_id uuid,
  p_authorizer_id uuid,
  p_pin text,
  p_idempotency_key uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.authorize_payment_method_correction(
    p_tender_id,
    p_authorizer_id,
    p_pin,
    p_idempotency_key
  );
$$;

DROP FUNCTION public.correct_payment_tender_method(
  uuid,
  public.payment_method,
  text
);

DROP FUNCTION private.correct_payment_tender_method(
  uuid,
  public.payment_method,
  text
);

CREATE FUNCTION private.correct_payment_tender_method(
  p_tender_id uuid,
  p_new_method public.payment_method,
  p_reason text,
  p_authorization uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := (SELECT auth.uid());
  v_caller_role text := private.active_profile_role();
  v_tender public.payment_tenders%ROWTYPE;
  v_transaction public.payment_transactions%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_new_cash_received numeric(12,2);
  v_new_change_given numeric(12,2);
  v_authorized_by uuid;
  v_shift_status text;
  v_adjustment_reason text;
BEGIN
  IF v_caller_id IS NULL
     OR v_caller_role NOT IN ('owner', 'admin', 'waiter') THEN
    RAISE EXCEPTION 'No tienes permiso para corregir métodos de pago';
  END IF;

  IF char_length(v_reason) < 4 OR char_length(v_reason) > 300 THEN
    RAISE EXCEPTION 'Escribe un motivo de 4 a 300 caracteres';
  END IF;

  IF p_new_method IS NULL THEN
    RAISE EXCEPTION 'Selecciona el método correcto';
  END IF;

  SELECT tender.*
  INTO v_tender
  FROM public.payment_tenders AS tender
  WHERE tender.id = p_tender_id
  FOR UPDATE;

  IF v_tender.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el método de pago';
  END IF;

  SELECT payment.*
  INTO v_transaction
  FROM public.payment_transactions AS payment
  WHERE payment.id = v_tender.transaction_id
  FOR UPDATE;

  IF v_transaction.id IS NULL OR v_transaction.status <> 'completed' THEN
    RAISE EXCEPTION 'No se puede corregir un pago anulado';
  END IF;

  IF v_tender.method = p_new_method THEN
    RAISE EXCEPTION 'Selecciona un método distinto al actual';
  END IF;

  IF v_caller_role IN ('owner', 'admin') THEN
    v_authorized_by := v_caller_id;
  ELSE
    SELECT authz.authorized_by
    INTO v_authorized_by
    FROM private.payment_method_correction_authorizations AS authz
    JOIN public.profiles AS authorizer
      ON authorizer.id = authz.authorized_by
     AND authorizer.is_active
     AND authorizer.role IN ('owner', 'admin')
    WHERE authz.token = p_authorization
      AND authz.tender_id = p_tender_id
      AND authz.requested_by = v_caller_id
      AND authz.used_at IS NULL
      AND authz.expires_at > now()
    FOR UPDATE OF authz;

    IF v_authorized_by IS NULL THEN
      RAISE EXCEPTION 'Solicita una autorización administrativa vigente';
    END IF;
  END IF;

  IF p_new_method = 'efectivo' THEN
    v_new_cash_received := v_tender.amount;
    v_new_change_given := 0;
  ELSE
    v_new_cash_received := NULL;
    v_new_change_given := NULL;
  END IF;

  UPDATE public.payment_tenders
  SET method = p_new_method,
      cash_received = v_new_cash_received,
      change_given = v_new_change_given
  WHERE id = v_tender.id;

  UPDATE public.payment_transactions AS payment
  SET cash_received = totals.cash_received,
      change_given = totals.change_given
  FROM (
    SELECT
      COALESCE(SUM(tender.cash_received), 0)::numeric(12,2) AS cash_received,
      COALESCE(SUM(tender.change_given), 0)::numeric(12,2) AS change_given
    FROM public.payment_tenders AS tender
    WHERE tender.transaction_id = v_tender.transaction_id
  ) AS totals
  WHERE payment.id = v_tender.transaction_id;

  INSERT INTO public.payment_tender_method_changes (
    transaction_id,
    tender_id,
    previous_method,
    new_method,
    previous_cash_received,
    previous_change_given,
    new_cash_received,
    new_change_given,
    reason,
    changed_by,
    authorized_by
  ) VALUES (
    v_tender.transaction_id,
    v_tender.id,
    v_tender.method,
    p_new_method,
    v_tender.cash_received,
    v_tender.change_given,
    v_new_cash_received,
    v_new_change_given,
    v_reason,
    v_caller_id,
    v_authorized_by
  );

  UPDATE public.orders AS orders
  SET payment_method = method_summary.single_method
  FROM (
    SELECT
      allocation.order_id,
      CASE
        WHEN COUNT(DISTINCT tender.method) = 1
          THEN MIN(tender.method::text)::public.payment_method
        ELSE NULL
      END AS single_method
    FROM public.payment_order_allocations AS allocation
    JOIN public.payment_transactions AS payment
      ON payment.id = allocation.transaction_id
     AND payment.status = 'completed'
    JOIN public.payment_tenders AS tender
      ON tender.transaction_id = payment.id
    WHERE allocation.order_id IN (
      SELECT current_allocation.order_id
      FROM public.payment_order_allocations AS current_allocation
      WHERE current_allocation.transaction_id = v_tender.transaction_id
    )
    GROUP BY allocation.order_id
  ) AS method_summary
  WHERE orders.id = method_summary.order_id;

  IF v_transaction.cash_shift_id IS NOT NULL THEN
    SELECT shift.status
    INTO v_shift_status
    FROM public.cash_shifts AS shift
    WHERE shift.id = v_transaction.cash_shift_id
    FOR UPDATE;

    IF v_shift_status = 'closed' THEN
      v_adjustment_reason := left(
        format(
          'Reclasificación del ticket %s: %s',
          v_transaction.folio,
          v_reason
        ),
        300
      );

      INSERT INTO public.cash_shift_adjustments (
        shift_id,
        payment_method,
        direction,
        amount,
        reason,
        created_by,
        authorized_by
      ) VALUES
        (
          v_transaction.cash_shift_id,
          v_tender.method::text,
          'decrease',
          v_tender.amount,
          v_adjustment_reason,
          v_caller_id,
          v_authorized_by
        ),
        (
          v_transaction.cash_shift_id,
          p_new_method::text,
          'increase',
          v_tender.amount,
          v_adjustment_reason,
          v_caller_id,
          v_authorized_by
        );
    END IF;
  END IF;

  UPDATE public.payment_transactions
  SET receipt_snapshot = private.payment_receipt_json(v_tender.transaction_id)
  WHERE id = v_tender.transaction_id;

  IF v_caller_role = 'waiter' THEN
    UPDATE private.payment_method_correction_authorizations
    SET used_at = now()
    WHERE token = p_authorization;
  END IF;

  RETURN private.payment_receipt_json(v_tender.transaction_id);
END;
$$;

CREATE FUNCTION public.correct_payment_tender_method(
  p_tender_id uuid,
  p_new_method public.payment_method,
  p_reason text,
  p_authorization uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.correct_payment_tender_method(
    p_tender_id,
    p_new_method,
    p_reason,
    p_authorization
  );
$$;

DROP POLICY IF EXISTS "Categories managed by admins" ON public.categories;

CREATE POLICY "Categories managed by active admins"
  ON public.categories
  FOR ALL TO authenticated
  USING ((SELECT private.active_profile_role()) IN ('owner', 'admin'))
  WITH CHECK ((SELECT private.active_profile_role()) IN ('owner', 'admin'));

CREATE OR REPLACE FUNCTION private.reorder_categories(p_category_ids uuid[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := private.active_profile_role();
  v_requested_count integer;
  v_distinct_count integer;
  v_existing_count integer;
  v_matched_count integer;
BEGIN
  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'No tienes permiso para ordenar categorías';
  END IF;

  IF p_category_ids IS NULL OR cardinality(p_category_ids) = 0 THEN
    RAISE EXCEPTION 'Envía el orden completo de categorías';
  END IF;

  IF array_position(p_category_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'El orden contiene una categoría inválida';
  END IF;

  LOCK TABLE public.categories IN SHARE ROW EXCLUSIVE MODE;

  SELECT
    COUNT(*)::integer,
    COUNT(DISTINCT requested.category_id)::integer
  INTO v_requested_count, v_distinct_count
  FROM unnest(p_category_ids) AS requested(category_id);

  SELECT COUNT(*)::integer
  INTO v_existing_count
  FROM public.categories;

  SELECT COUNT(*)::integer
  INTO v_matched_count
  FROM public.categories AS category
  WHERE category.id = ANY(p_category_ids);

  IF v_requested_count <> v_distinct_count
     OR v_requested_count <> v_existing_count
     OR v_matched_count <> v_existing_count THEN
    RAISE EXCEPTION 'El orden ya no coincide con las categorías actuales';
  END IF;

  UPDATE public.categories AS category
  SET sort_order = requested.position - 1,
      updated_at = now()
  FROM unnest(p_category_ids) WITH ORDINALITY AS requested(category_id, position)
  WHERE category.id = requested.category_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_categories(p_category_ids uuid[])
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.reorder_categories(p_category_ids);
$$;

REVOKE ALL ON FUNCTION private.authorize_payment_method_correction(uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.authorize_payment_method_correction(uuid, uuid, text, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.correct_payment_tender_method(uuid, public.payment_method, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.correct_payment_tender_method(uuid, public.payment_method, text, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.reorder_categories(uuid[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reorder_categories(uuid[])
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.authorize_payment_method_correction(uuid, uuid, text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_payment_method_correction(uuid, uuid, text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.correct_payment_tender_method(uuid, public.payment_method, text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_payment_tender_method(uuid, public.payment_method, text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.reorder_categories(uuid[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_categories(uuid[])
  TO authenticated;
