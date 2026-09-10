-- Vista administrativa de gastos y correcciones auditadas.
-- Los movimientos originales nunca se borran: una corrección conserva el
-- importe capturado y modifica el importe efectivo usado en los totales.

CREATE TABLE public.cash_movement_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id uuid NOT NULL UNIQUE REFERENCES public.cash_movements(id) ON DELETE RESTRICT,
  shift_id uuid NOT NULL REFERENCES public.cash_shifts(id) ON DELETE RESTRICT,
  previous_amount numeric(12,2) NOT NULL CHECK (previous_amount > 0),
  corrected_amount numeric(12,2) NOT NULL CHECK (corrected_amount >= 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 300),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  authorized_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_movement_correction_amount_changed_check
    CHECK (corrected_amount <> previous_amount)
);

CREATE INDEX cash_movement_corrections_shift_created_at_idx
  ON public.cash_movement_corrections (shift_id, created_at DESC);

ALTER TABLE public.cash_movement_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cash_movement_corrections FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.cash_shift_totals(p_shift_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH shift AS (
    SELECT opening_float
    FROM public.cash_shifts
    WHERE id = p_shift_id
  ), transaction_totals AS (
    SELECT
      count(*) FILTER (WHERE status = 'completed')::integer AS payment_count,
      COALESCE(sum(subtotal_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS gross_sales,
      COALESCE(sum(discount_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS discount_total,
      COALESCE(sum(tip_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS tip_total,
      COALESCE(sum(subtotal_amount - discount_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS net_sales,
      COALESCE(sum(total_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS collected_total,
      COALESCE(sum(total_amount) FILTER (WHERE status = 'voided'), 0)::numeric(12,2) AS voided_total
    FROM public.payment_transactions
    WHERE cash_shift_id = p_shift_id
  ), tender_totals AS (
    SELECT
      COALESCE(sum(tender.amount) FILTER (WHERE tender.method = 'efectivo'), 0)::numeric(12,2) AS cash_total,
      COALESCE(sum(tender.amount) FILTER (WHERE tender.method = 'tarjeta'), 0)::numeric(12,2) AS card_total,
      COALESCE(sum(tender.amount) FILTER (WHERE tender.method = 'transferencia'), 0)::numeric(12,2) AS transfer_total
    FROM public.payment_tenders AS tender
    JOIN public.payment_transactions AS transaction
      ON transaction.id = tender.transaction_id
     AND transaction.status = 'completed'
    WHERE transaction.cash_shift_id = p_shift_id
  ), effective_movements AS (
    SELECT
      movement.movement_type,
      movement.direction,
      COALESCE(correction.corrected_amount, movement.amount) AS amount
    FROM public.cash_movements AS movement
    LEFT JOIN public.cash_movement_corrections AS correction
      ON correction.movement_id = movement.id
    WHERE movement.shift_id = p_shift_id
  ), movement_totals AS (
    SELECT
      COALESCE(sum(amount) FILTER (WHERE movement_type = 'fund_addition'), 0)::numeric(12,2) AS fund_in_total,
      COALESCE(sum(amount) FILTER (WHERE movement_type = 'withdrawal'), 0)::numeric(12,2) AS withdrawal_total,
      COALESCE(sum(amount) FILTER (WHERE movement_type = 'expense'), 0)::numeric(12,2) AS expense_total,
      COALESCE(sum(
        CASE
          WHEN movement_type = 'correction' AND direction = 'in' THEN amount
          WHEN movement_type = 'correction' AND direction = 'out' THEN -amount
          ELSE 0
        END
      ), 0)::numeric(12,2) AS correction_total
    FROM effective_movements
  ), pending_totals AS (
    SELECT
      count(*)::integer AS pending_order_count,
      COALESCE(sum(GREATEST(orders.total::numeric - orders.paid_amount, 0)), 0)::numeric(12,2) AS pending_balance
    FROM public.orders AS orders
    WHERE orders.status <> 'cancelled'
      AND orders.payment_status <> 'paid'
      AND orders.total::numeric > orders.paid_amount
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
    'card_total', tender_totals.card_total,
    'transfer_total', tender_totals.transfer_total,
    'fund_in_total', movement_totals.fund_in_total,
    'withdrawal_total', movement_totals.withdrawal_total,
    'expense_total', movement_totals.expense_total,
    'correction_total', movement_totals.correction_total,
    'pending_order_count', pending_totals.pending_order_count,
    'pending_balance', pending_totals.pending_balance,
    'expected_cash', ROUND(
      shift.opening_float
      + tender_totals.cash_total
      + movement_totals.fund_in_total
      - movement_totals.withdrawal_total
      - movement_totals.expense_total
      + movement_totals.correction_total,
      2
    )
  )
  FROM shift
  CROSS JOIN transaction_totals
  CROSS JOIN tender_totals
  CROSS JOIN movement_totals
  CROSS JOIN pending_totals;
$$;

CREATE OR REPLACE FUNCTION private.list_cash_movements(
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 250,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := private.active_profile_role();
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 250), 1), 500);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'No tienes permiso para consultar gastos y movimientos';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_data ORDER BY created_at DESC)
    FROM (
      SELECT
        to_jsonb(movement)
        || jsonb_build_object(
          'shift_number', shift.number,
          'shift_status', shift.status,
          'shift_archived_at', shift.archived_at,
          'created_by_name', creator.full_name,
          'authorized_by_name', authorizer.full_name,
          'corrected_amount', correction.corrected_amount,
          'correction_reason', correction.reason,
          'corrected_by', correction.created_by,
          'corrected_by_name', correction_creator.full_name,
          'correction_authorized_by', correction.authorized_by,
          'correction_authorized_by_name', correction_authorizer.full_name,
          'corrected_at', correction.created_at,
          'correction_status', CASE
            WHEN correction.id IS NULL THEN 'active'
            WHEN correction.corrected_amount = 0 THEN 'voided'
            ELSE 'corrected'
          END
        ) AS row_data,
        movement.created_at
      FROM public.cash_movements AS movement
      JOIN public.cash_shifts AS shift ON shift.id = movement.shift_id
      JOIN public.profiles AS creator ON creator.id = movement.created_by
      JOIN public.profiles AS authorizer ON authorizer.id = movement.authorized_by
      LEFT JOIN public.cash_movement_corrections AS correction
        ON correction.movement_id = movement.id
      LEFT JOIN public.profiles AS correction_creator
        ON correction_creator.id = correction.created_by
      LEFT JOIN public.profiles AS correction_authorizer
        ON correction_authorizer.id = correction.authorized_by
      WHERE (p_since IS NULL OR movement.created_at >= p_since)
        AND (p_until IS NULL OR movement.created_at < p_until)
      ORDER BY movement.created_at DESC
      LIMIT v_limit
      OFFSET v_offset
    ) AS rows
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_cash_movements(
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 250,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.list_cash_movements(p_since, p_until, p_limit, p_offset);
$$;

CREATE OR REPLACE FUNCTION private.correct_cash_movement(
  p_movement_id uuid,
  p_corrected_amount numeric,
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
  v_role text := private.active_profile_role();
  v_movement public.cash_movements%ROWTYPE;
  v_shift public.cash_shifts%ROWTYPE;
  v_authorized_by uuid;
  v_delta numeric;
  v_totals jsonb;
BEGIN
  IF v_caller_id IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'No tienes permiso para corregir gastos';
  END IF;
  IF p_movement_id IS NULL
     OR p_corrected_amount IS NULL
     OR ROUND(p_corrected_amount, 2) < 0
     OR length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Completa correctamente la corrección del gasto';
  END IF;

  SELECT * INTO v_movement
  FROM public.cash_movements
  WHERE id = p_movement_id
  FOR UPDATE;

  IF v_movement.id IS NULL THEN
    RAISE EXCEPTION 'El movimiento ya no existe';
  END IF;
  IF v_movement.movement_type = 'correction' THEN
    RAISE EXCEPTION 'Los movimientos de corrección no se pueden corregir';
  END IF;

  SELECT * INTO v_shift
  FROM public.cash_shifts
  WHERE id = v_movement.shift_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.cash_movement_corrections
    WHERE movement_id = v_movement.id
  ) THEN
    RAISE EXCEPTION 'Este movimiento ya fue corregido';
  END IF;

  v_delta := ABS(ROUND(v_movement.amount, 2) - ROUND(p_corrected_amount, 2));
  IF v_delta <= 0 THEN
    RAISE EXCEPTION 'El importe corregido debe ser diferente al original';
  END IF;

  SELECT authz.authorized_by INTO v_authorized_by
  FROM private.cash_action_authorizations AS authz
  WHERE authz.token = p_authorization
    AND authz.shift_id = v_movement.shift_id
    AND authz.action = 'cash_movement'
    AND authz.requested_by = v_caller_id
    AND authz.amount = ROUND(v_delta, 2)
    AND authz.used_at IS NULL
    AND authz.expires_at > now()
  FOR UPDATE;

  IF v_authorized_by IS NULL THEN
    RAISE EXCEPTION 'La corrección necesita autorización vigente';
  END IF;

  INSERT INTO public.cash_movement_corrections (
    movement_id, shift_id, previous_amount, corrected_amount, reason,
    created_by, authorized_by
  ) VALUES (
    v_movement.id, v_movement.shift_id, v_movement.amount,
    ROUND(p_corrected_amount, 2), btrim(p_reason), v_caller_id, v_authorized_by
  );

  v_totals := private.cash_shift_totals(v_movement.shift_id);

  UPDATE public.cash_shifts
  SET fund_in_total = (v_totals->>'fund_in_total')::numeric,
      withdrawal_total = (v_totals->>'withdrawal_total')::numeric,
      expense_total = (v_totals->>'expense_total')::numeric,
      correction_total = (v_totals->>'correction_total')::numeric,
      expected_cash = CASE WHEN status = 'closed' THEN (v_totals->>'expected_cash')::numeric ELSE NULL END,
      difference = CASE
        WHEN status = 'closed' THEN ROUND(counted_cash - (v_totals->>'expected_cash')::numeric, 2)
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = v_movement.shift_id;

  UPDATE private.cash_action_authorizations
  SET used_at = now()
  WHERE token = p_authorization;

  RETURN jsonb_build_object(
    'movement_id', v_movement.id,
    'shift_id', v_movement.shift_id,
    'corrected_amount', ROUND(p_corrected_amount, 2),
    'correction_status', CASE WHEN p_corrected_amount = 0 THEN 'voided' ELSE 'corrected' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_cash_movement(
  p_movement_id uuid,
  p_corrected_amount numeric,
  p_reason text,
  p_authorization uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.correct_cash_movement(
    p_movement_id, p_corrected_amount, p_reason, p_authorization
  );
$$;

REVOKE ALL ON FUNCTION private.list_cash_movements(timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.correct_cash_movement(uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_cash_movements(timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.correct_cash_movement(uuid, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_cash_movements(timestamptz, timestamptz, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION private.correct_cash_movement(uuid, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_cash_movements(timestamptz, timestamptz, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_cash_movement(uuid, numeric, text, uuid) TO authenticated;
