CREATE TABLE public.payment_tender_method_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.payment_transactions(id) ON DELETE RESTRICT,
  tender_id uuid NOT NULL REFERENCES public.payment_tenders(id) ON DELETE RESTRICT,
  previous_method public.payment_method NOT NULL,
  new_method public.payment_method NOT NULL,
  previous_cash_received numeric(12,2),
  previous_change_given numeric(12,2),
  new_cash_received numeric(12,2),
  new_change_given numeric(12,2),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 4 AND 300),
  changed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (previous_method <> new_method)
);

CREATE INDEX payment_tender_method_changes_transaction_idx
  ON public.payment_tender_method_changes (transaction_id, created_at DESC);

ALTER TABLE public.payment_tender_method_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payment corrections visible to administrators"
  ON public.payment_tender_method_changes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = (SELECT auth.uid())
        AND profile.is_active
        AND profile.role IN ('owner', 'admin')
    )
  );

REVOKE ALL ON public.payment_tender_method_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_tender_method_changes TO authenticated;

CREATE OR REPLACE FUNCTION private.correct_payment_tender_method(
  p_tender_id uuid,
  p_new_method public.payment_method,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := (SELECT auth.uid());
  v_caller_role text := public.get_user_role();
  v_tender public.payment_tenders%ROWTYPE;
  v_transaction_status text;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_new_cash_received numeric(12,2);
  v_new_change_given numeric(12,2);
BEGIN
  IF v_caller_id IS NULL OR v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Solo dueño y administradores pueden corregir métodos de pago';
  END IF;

  IF char_length(v_reason) < 4 OR char_length(v_reason) > 300 THEN
    RAISE EXCEPTION 'Escribe un motivo de 4 a 300 caracteres';
  END IF;

  SELECT tender.*
  INTO v_tender
  FROM public.payment_tenders AS tender
  WHERE tender.id = p_tender_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró el método de pago';
  END IF;

  SELECT transaction.status
  INTO v_transaction_status
  FROM public.payment_transactions AS transaction
  WHERE transaction.id = v_tender.transaction_id
  FOR UPDATE;

  IF v_transaction_status <> 'completed' THEN
    RAISE EXCEPTION 'No se puede corregir un pago anulado';
  END IF;

  IF v_tender.method = p_new_method THEN
    RAISE EXCEPTION 'Selecciona un método distinto al actual';
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

  UPDATE public.payment_transactions AS transaction
  SET cash_received = totals.cash_received,
      change_given = totals.change_given
  FROM (
    SELECT
      COALESCE(SUM(tender.cash_received), 0)::numeric(12,2) AS cash_received,
      COALESCE(SUM(tender.change_given), 0)::numeric(12,2) AS change_given
    FROM public.payment_tenders AS tender
    WHERE tender.transaction_id = v_tender.transaction_id
  ) AS totals
  WHERE transaction.id = v_tender.transaction_id;

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
    changed_by
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
    v_caller_id
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
    JOIN public.payment_transactions AS transaction
      ON transaction.id = allocation.transaction_id
     AND transaction.status = 'completed'
    JOIN public.payment_tenders AS tender
      ON tender.transaction_id = transaction.id
    WHERE allocation.order_id IN (
      SELECT current_allocation.order_id
      FROM public.payment_order_allocations AS current_allocation
      WHERE current_allocation.transaction_id = v_tender.transaction_id
    )
    GROUP BY allocation.order_id
  ) AS method_summary
  WHERE orders.id = method_summary.order_id;

  UPDATE public.payment_transactions
  SET receipt_snapshot = private.payment_receipt_json(v_tender.transaction_id)
  WHERE id = v_tender.transaction_id;

  RETURN private.payment_receipt_json(v_tender.transaction_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_payment_tender_method(
  p_tender_id uuid,
  p_new_method public.payment_method,
  p_reason text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.correct_payment_tender_method(p_tender_id, p_new_method, p_reason);
$$;

REVOKE ALL ON FUNCTION private.correct_payment_tender_method(uuid, public.payment_method, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.correct_payment_tender_method(uuid, public.payment_method, text)
  FROM PUBLIC, anon;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.correct_payment_tender_method(uuid, public.payment_method, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_payment_tender_method(uuid, public.payment_method, text)
  TO authenticated;
