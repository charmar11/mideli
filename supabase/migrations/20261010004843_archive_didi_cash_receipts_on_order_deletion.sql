-- Allow deleting delivered Didi cash orders without removing their cash from
-- an open or closed register shift. The audit keeps only the receipt fields
-- needed for reconciliation, not customer data or order items.

CREATE TABLE private.marketplace_cash_order_deletion_archive (
  order_id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  cash_shift_id uuid NOT NULL REFERENCES public.cash_shifts(id) ON DELETE RESTRICT,
  order_number integer NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  received_at timestamptz NOT NULL,
  received_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX marketplace_cash_order_deletion_shift_idx
  ON private.marketplace_cash_order_deletion_archive
    (cash_shift_id, business_id, received_at, order_number);

ALTER TABLE private.marketplace_cash_order_deletion_archive
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.marketplace_cash_order_deletion_archive
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE private.marketplace_cash_order_deletion_archive IS
  'Audit receipts for delivered Didi cash orders removed from order history; amounts remain in the original cash shift.';

CREATE OR REPLACE FUNCTION private.marketplace_cash_receipts_for_shift(
  p_shift_id uuid
)
RETURNS TABLE (
  order_id uuid,
  business_id uuid,
  order_number integer,
  platform text,
  amount numeric,
  received_at timestamptz,
  received_by uuid,
  was_deleted boolean,
  deleted_at timestamptz,
  deleted_by uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    order_row.id,
    order_row.business_id,
    order_row.number,
    order_row.marketplace_platform::text,
    order_row.marketplace_cash_received::numeric,
    order_row.marketplace_handed_off_at,
    order_row.marketplace_handed_off_by,
    false,
    NULL::timestamptz,
    NULL::uuid
  FROM public.orders AS order_row
  WHERE order_row.marketplace_cash_shift_id = p_shift_id
    AND order_row.marketplace_platform = 'didi_food'
    AND order_row.marketplace_payment_mode = 'cash'
    AND order_row.marketplace_handed_off_at IS NOT NULL
    AND order_row.marketplace_cash_received IS NOT NULL

  UNION ALL

  SELECT
    receipt.order_id,
    receipt.business_id,
    receipt.order_number,
    'didi_food'::text,
    receipt.amount::numeric,
    receipt.received_at,
    receipt.received_by,
    true,
    receipt.deleted_at,
    receipt.deleted_by
  FROM private.marketplace_cash_order_deletion_archive AS receipt
  WHERE receipt.cash_shift_id = p_shift_id;
$$;

REVOKE ALL ON FUNCTION private.marketplace_cash_receipts_for_shift(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.block_marketplace_order_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.marketplace_platform = 'didi_food'
     AND OLD.marketplace_payment_mode = 'cash'
     AND OLD.marketplace_handed_off_at IS NOT NULL
     AND OLD.marketplace_cash_received IS NOT NULL
     AND OLD.marketplace_cash_shift_id IS NOT NULL THEN
    INSERT INTO private.marketplace_cash_order_deletion_archive (
      order_id,
      business_id,
      cash_shift_id,
      order_number,
      amount,
      received_at,
      received_by,
      deleted_by
    )
    VALUES (
      OLD.id,
      OLD.business_id,
      OLD.marketplace_cash_shift_id,
      OLD.number,
      OLD.marketplace_cash_received,
      OLD.marketplace_handed_off_at,
      OLD.marketplace_handed_off_by,
      auth.uid()
    )
    ON CONFLICT (order_id) DO NOTHING;
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.block_marketplace_order_delete()
  FROM PUBLIC, anon, authenticated;

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
    PERFORM shift.id
      FROM public.cash_shifts AS shift
     WHERE shift.id = v_marketplace_cash_shift_id
     FOR UPDATE NOWAIT;
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

CREATE OR REPLACE FUNCTION private.cash_shift_totals(p_shift_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH shift AS (
    SELECT opening_float, business_id FROM public.cash_shifts WHERE id = p_shift_id
  ), transaction_totals AS (
    SELECT count(*) FILTER (WHERE status = 'completed')::integer AS payment_count,
      COALESCE(sum(subtotal_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS gross_sales,
      COALESCE(sum(discount_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS discount_total,
      COALESCE(sum(tip_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS tip_total,
      COALESCE(sum(subtotal_amount - discount_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS net_sales,
      COALESCE(sum(total_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS collected_total,
      COALESCE(sum(total_amount) FILTER (WHERE status = 'voided'), 0)::numeric(12,2) AS voided_total
    FROM public.payment_transactions WHERE cash_shift_id = p_shift_id
  ), tender_totals AS (
    SELECT
      COALESCE(sum(tender.amount) FILTER (WHERE tender.method = 'efectivo'), 0)::numeric(12,2) AS cash_total,
      COALESCE(sum(tender.amount) FILTER (WHERE tender.method = 'tarjeta'), 0)::numeric(12,2) AS card_total,
      COALESCE(sum(tender.amount) FILTER (WHERE tender.method = 'transferencia'), 0)::numeric(12,2) AS transfer_total
    FROM public.payment_tenders AS tender
    JOIN public.payment_transactions AS transaction
      ON transaction.id = tender.transaction_id AND transaction.status = 'completed'
    WHERE transaction.cash_shift_id = p_shift_id
  ), marketplace_totals AS (
    SELECT COALESCE(sum(receipt.amount), 0)::numeric(12,2) AS marketplace_cash_total
      FROM private.marketplace_cash_receipts_for_shift(p_shift_id) AS receipt
      CROSS JOIN shift
     WHERE receipt.business_id = shift.business_id
  ), movement_totals AS (
    SELECT
      COALESCE(sum(amount) FILTER (WHERE movement_type = 'fund_addition'), 0)::numeric(12,2) AS fund_in_total,
      COALESCE(sum(amount) FILTER (WHERE movement_type = 'withdrawal'), 0)::numeric(12,2) AS withdrawal_total,
      COALESCE(sum(amount) FILTER (WHERE movement_type = 'expense'), 0)::numeric(12,2) AS expense_total,
      COALESCE(sum(CASE WHEN movement_type = 'correction' AND direction = 'in' THEN amount
                        WHEN movement_type = 'correction' AND direction = 'out' THEN -amount ELSE 0 END), 0)::numeric(12,2) AS correction_total
    FROM public.cash_movements WHERE shift_id = p_shift_id
  ), pending_totals AS (
    SELECT count(*)::integer AS pending_order_count,
      COALESCE(sum(GREATEST(order_row.total::numeric - order_row.paid_amount, 0)), 0)::numeric(12,2) AS pending_balance
    FROM public.orders AS order_row CROSS JOIN shift
    WHERE order_row.business_id = shift.business_id
      AND order_row.marketplace_platform IS NULL
      AND order_row.status <> 'cancelled'
      AND order_row.payment_status <> 'paid'
      AND order_row.total::numeric > order_row.paid_amount
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
    'marketplace_cash_total', marketplace_totals.marketplace_cash_total,
    'card_total', tender_totals.card_total,
    'transfer_total', tender_totals.transfer_total,
    'fund_in_total', movement_totals.fund_in_total,
    'withdrawal_total', movement_totals.withdrawal_total,
    'expense_total', movement_totals.expense_total,
    'correction_total', movement_totals.correction_total,
    'pending_order_count', pending_totals.pending_order_count,
    'pending_balance', pending_totals.pending_balance,
    'expected_cash', ROUND(shift.opening_float + tender_totals.cash_total
      + marketplace_totals.marketplace_cash_total + movement_totals.fund_in_total
      - movement_totals.withdrawal_total - movement_totals.expense_total
      + movement_totals.correction_total, 2)
  )
  FROM shift CROSS JOIN transaction_totals CROSS JOIN tender_totals
    CROSS JOIN marketplace_totals CROSS JOIN movement_totals CROSS JOIN pending_totals;
$$;

CREATE OR REPLACE FUNCTION private.cash_shift_json(
  p_shift_id uuid,
  p_reveal_cash boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_shift public.cash_shifts%ROWTYPE;
  v_result jsonb;
  v_totals jsonb;
  v_receipts jsonb;
  v_opened_by_name text;
  v_closed_by_name text;
  v_authorized_by_name text;
  v_archived_by_name text;
BEGIN
  SELECT * INTO v_shift FROM public.cash_shifts WHERE id = p_shift_id;
  IF v_shift.id IS NULL THEN RETURN NULL; END IF;
  SELECT full_name INTO v_opened_by_name FROM public.profiles WHERE id = v_shift.opened_by;
  SELECT full_name INTO v_closed_by_name FROM public.profiles WHERE id = v_shift.closed_by;
  SELECT full_name INTO v_authorized_by_name FROM public.profiles WHERE id = v_shift.difference_authorized_by;
  SELECT full_name INTO v_archived_by_name FROM public.profiles WHERE id = v_shift.archived_by;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'order_id', receipt.order_id,
    'order_number', receipt.order_number,
    'platform', receipt.platform,
    'amount', CASE
      WHEN p_reveal_cash OR v_shift.status = 'closed' THEN receipt.amount
      ELSE NULL
    END,
    'received_at', receipt.received_at,
    'received_by_name', received_by.full_name,
    'order_deleted', receipt.was_deleted,
    'deleted_at', receipt.deleted_at,
    'deleted_by_name', deleted_by.full_name
  ) ORDER BY receipt.received_at, receipt.order_number), '[]'::jsonb)
    INTO v_receipts
    FROM private.marketplace_cash_receipts_for_shift(v_shift.id) AS receipt
    LEFT JOIN public.profiles AS received_by ON received_by.id = receipt.received_by
    LEFT JOIN public.profiles AS deleted_by ON deleted_by.id = receipt.deleted_by
   WHERE receipt.business_id = v_shift.business_id;

  v_result := to_jsonb(v_shift) || jsonb_build_object(
    'opened_by_name', COALESCE(v_opened_by_name, 'Personal'),
    'closed_by_name', v_closed_by_name,
    'difference_authorized_by_name', v_authorized_by_name,
    'archived_by_name', v_archived_by_name,
    'marketplace_cash_receipts', v_receipts
  );
  IF v_shift.status = 'open' THEN
    v_totals := private.cash_shift_totals(v_shift.id);
    IF NOT p_reveal_cash THEN
      v_totals := v_totals - ARRAY['cash_total', 'marketplace_cash_total', 'expected_cash', 'gross_sales', 'net_sales', 'collected_total'];
    END IF;
    v_result := v_result || jsonb_build_object('operating_totals', v_totals);
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION private.snapshot_marketplace_cash_on_shift_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'open' AND NEW.status = 'closed' THEN
    SELECT COALESCE(sum(receipt.amount), 0)::numeric(12,2)
      INTO NEW.marketplace_cash_total
      FROM private.marketplace_cash_receipts_for_shift(OLD.id) AS receipt
     WHERE receipt.business_id = OLD.business_id;
  END IF;
  RETURN NEW;
END;
$$;
