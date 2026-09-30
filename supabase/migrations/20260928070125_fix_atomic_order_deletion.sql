-- A parent's BEFORE DELETE trigger validates the business license before
-- PostgreSQL executes ON DELETE CASCADE against its child rows. At that point
-- the deleted parent is no longer visible to child-row license lookups, so a
-- nested cascade must not fail merely because its parent lookup returns NULL.
CREATE OR REPLACE FUNCTION private.enforce_business_license_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_business_id uuid;
  v_new_business_id uuid;
  v_business_id uuid;
  v_checked boolean := false;
  v_allow_draft_setup boolean := TG_TABLE_NAME IN (
    'categories', 'menu_items', 'inventory_items', 'inventory_recipes',
    'inventory_lots', 'inventory_movements', 'inventory_counts',
    'inventory_count_lines', 'inventory_purchase_orders',
    'inventory_purchase_order_lines', 'inventory_receipts', 'inventory_receipt_lines'
  );
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old_business_id := private.business_id_for_license_row(TG_TABLE_NAME, to_jsonb(OLD));
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_business_id := private.business_id_for_license_row(TG_TABLE_NAME, to_jsonb(NEW));
  END IF;

  FOREACH v_business_id IN ARRAY ARRAY[v_old_business_id, v_new_business_id]
  LOOP
    IF v_business_id IS NOT NULL THEN
      v_checked := true;
      IF v_allow_draft_setup THEN
        IF NOT private.business_license_allows_setup(v_business_id) THEN
          RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BUSINESS_LICENSE_INACTIVE';
        END IF;
      ELSIF NOT private.business_license_is_available(v_business_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BUSINESS_LICENSE_INACTIVE';
      END IF;
    END IF;
  END LOOP;

  IF NOT v_checked
     AND TG_OP = 'DELETE'
     AND pg_catalog.pg_trigger_depth() > 1
     AND TG_TABLE_NAME IN (
       'inventory_count_lines', 'inventory_purchase_order_lines',
       'inventory_receipt_lines', 'order_items', 'order_status_log'
     ) THEN
    -- The parent DELETE has already passed this license guard. Permit only its
    -- nested FK cleanup; direct child deletes still resolve and check a parent.
    RETURN OLD;
  END IF;

  IF NOT v_checked THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BUSINESS_LICENSE_CONTEXT_UNAVAILABLE';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_business_license_write() FROM PUBLIC, anon, authenticated;

-- Payment rows and an order must be deleted in one transaction. The previous
-- server action deleted payments in one REST request and the order in another,
-- so a later trigger failure could remove payment history while preserving the
-- order. Execute this invoker-rights RPC only from the server's service client.
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
   FOR UPDATE;

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

  -- Serialize against new/shared allocations, payment edits and shift closing.
  PERFORM allocation.id
    FROM public.payment_order_allocations AS allocation
   WHERE allocation.transaction_id = ANY(v_transaction_ids)
   ORDER BY allocation.id
   FOR UPDATE;

  PERFORM payment.id
    FROM public.payment_transactions AS payment
   WHERE payment.id = ANY(v_transaction_ids)
   ORDER BY payment.id
   FOR UPDATE;

  PERFORM shift.id
    FROM public.cash_shifts AS shift
    JOIN public.payment_transactions AS payment
      ON payment.cash_shift_id = shift.id
   WHERE payment.id = ANY(v_transaction_ids)
   ORDER BY shift.id
   FOR UPDATE OF shift;

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

REVOKE ALL ON FUNCTION public.delete_sales_order_atomic(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sales_order_atomic(uuid, uuid) TO service_role;
