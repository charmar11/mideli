-- Keep order deletion atomic while avoiding lock waits against payment and
-- cash-close flows, which acquire related rows in a different order.
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
  v_transaction_ids uuid[];
  v_deleted_count integer;
BEGIN
  SELECT order_row.business_id
    INTO v_order_business_id
    FROM public.orders AS order_row
   WHERE order_row.id = p_order_id
   FOR NO KEY UPDATE NOWAIT;

  IF NOT FOUND OR v_order_business_id IS DISTINCT FROM p_business_id THEN
    RETURN false;
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
