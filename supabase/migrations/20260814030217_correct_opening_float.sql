-- Show and safely correct the opening float of the current cash shift.

CREATE TABLE public.cash_shift_opening_float_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.cash_shifts(id) ON DELETE CASCADE,
  previous_amount numeric(12,2) NOT NULL CHECK (previous_amount >= 0),
  new_amount numeric(12,2) NOT NULL CHECK (new_amount >= 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 300),
  changed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (previous_amount <> new_amount)
);

CREATE INDEX cash_shift_opening_float_changes_shift_created_at_idx
  ON public.cash_shift_opening_float_changes (shift_id, created_at DESC);

ALTER TABLE public.cash_shift_opening_float_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Opening float changes visible with shift"
  ON public.cash_shift_opening_float_changes
  FOR SELECT
  TO authenticated
  USING ((SELECT private.can_view_cash_shift(shift_id)));

REVOKE ALL ON TABLE public.cash_shift_opening_float_changes
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cash_shift_opening_float_changes
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.correct_cash_shift_opening_float(
  p_shift_id uuid,
  p_new_amount numeric,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := (SELECT auth.uid());
  v_role text := private.active_profile_role();
  v_shift public.cash_shifts%ROWTYPE;
  v_new_amount numeric(12,2);
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF v_caller_id IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'No tienes permiso para corregir el fondo inicial';
  END IF;

  IF p_new_amount IS NULL
     OR p_new_amount::text = 'NaN'
     OR ROUND(p_new_amount, 2) < 0 THEN
    RAISE EXCEPTION 'El fondo inicial no puede ser negativo';
  END IF;
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'Escribe un motivo de entre 3 y 300 caracteres';
  END IF;

  v_new_amount := ROUND(p_new_amount, 2);

  SELECT *
  INTO v_shift
  FROM public.cash_shifts
  WHERE id = p_shift_id
  FOR UPDATE;

  IF v_shift.id IS NULL THEN
    RAISE EXCEPTION 'El turno no existe';
  END IF;
  IF v_shift.status <> 'open' THEN
    RAISE EXCEPTION 'Solo se puede corregir el turno abierto';
  END IF;
  IF v_shift.opening_float = v_new_amount THEN
    RAISE EXCEPTION 'El nuevo fondo debe ser diferente al actual';
  END IF;

  UPDATE public.cash_shifts
  SET opening_float = v_new_amount,
      updated_at = now()
  WHERE id = v_shift.id;

  INSERT INTO public.cash_shift_opening_float_changes (
    shift_id,
    previous_amount,
    new_amount,
    reason,
    changed_by
  ) VALUES (
    v_shift.id,
    v_shift.opening_float,
    v_new_amount,
    v_reason,
    v_caller_id
  );

  RETURN private.cash_shift_json(v_shift.id, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_cash_shift_opening_float(
  p_shift_id uuid,
  p_new_amount numeric,
  p_reason text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.correct_cash_shift_opening_float(
    p_shift_id,
    p_new_amount,
    p_reason
  );
$$;

CREATE OR REPLACE FUNCTION private.get_cash_shift_detail(p_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT private.can_view_cash_shift(p_shift_id) THEN
    RAISE EXCEPTION 'No tienes permiso para consultar este turno';
  END IF;

  v_result := private.cash_shift_json(
    p_shift_id,
    (SELECT status = 'closed' FROM public.cash_shifts WHERE id = p_shift_id)
  );

  RETURN v_result || jsonb_build_object(
    'movements', COALESCE((
      SELECT jsonb_agg(to_jsonb(movement) || jsonb_build_object(
        'created_by_name', creator.full_name,
        'authorized_by_name', authorizer.full_name
      ) ORDER BY movement.created_at DESC)
      FROM public.cash_movements AS movement
      JOIN public.profiles AS creator ON creator.id = movement.created_by
      JOIN public.profiles AS authorizer ON authorizer.id = movement.authorized_by
      WHERE movement.shift_id = p_shift_id
    ), '[]'::jsonb),
    'pending_orders', COALESCE((
      SELECT jsonb_agg(to_jsonb(pending) ORDER BY pending.order_number)
      FROM public.cash_shift_pending_orders AS pending
      WHERE pending.closing_shift_id = p_shift_id
    ), '[]'::jsonb),
    'adjustments', COALESCE((
      SELECT jsonb_agg(to_jsonb(adjustment) || jsonb_build_object(
        'created_by_name', creator.full_name,
        'authorized_by_name', authorizer.full_name
      ) ORDER BY adjustment.created_at DESC)
      FROM public.cash_shift_adjustments AS adjustment
      JOIN public.profiles AS creator ON creator.id = adjustment.created_by
      JOIN public.profiles AS authorizer ON authorizer.id = adjustment.authorized_by
      WHERE adjustment.shift_id = p_shift_id
    ), '[]'::jsonb),
    'opening_float_changes', COALESCE((
      SELECT jsonb_agg(to_jsonb(change) || jsonb_build_object(
        'changed_by_name', changer.full_name
      ) ORDER BY change.created_at DESC)
      FROM public.cash_shift_opening_float_changes AS change
      JOIN public.profiles AS changer ON changer.id = change.changed_by
      WHERE change.shift_id = p_shift_id
    ), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', transaction.id,
        'folio', transaction.folio,
        'status', transaction.status,
        'total_amount', transaction.total_amount,
        'table_zone_name', transaction.table_zone_name,
        'table_number', transaction.table_number,
        'customer_name', transaction.customer_name,
        'charged_by', transaction.charged_by,
        'charged_by_name', profile.full_name,
        'created_at', transaction.created_at
      ) ORDER BY transaction.created_at DESC)
      FROM public.payment_transactions AS transaction
      JOIN public.profiles AS profile ON profile.id = transaction.charged_by
      WHERE transaction.cash_shift_id = p_shift_id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.correct_cash_shift_opening_float(uuid, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.correct_cash_shift_opening_float(uuid, numeric, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.correct_cash_shift_opening_float(uuid, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.correct_cash_shift_opening_float(uuid, numeric, text)
  TO authenticated;
