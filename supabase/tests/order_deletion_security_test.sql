BEGIN;

SELECT plan(27);

SELECT ok(
  to_regprocedure('public.delete_sales_order_atomic(uuid,uuid)') IS NOT NULL,
  'atomic order deletion entry point exists'
);
SELECT ok(
  NOT (
    SELECT prosecdef
      FROM pg_proc
     WHERE oid = 'public.delete_sales_order_atomic(uuid,uuid)'::regprocedure
  ),
  'the service-only order deletion function runs with invoker privileges'
);
SELECT ok(
  has_function_privilege('service_role', 'public.delete_sales_order_atomic(uuid,uuid)', 'EXECUTE'),
  'the server service role can execute atomic order deletion'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.delete_sales_order_atomic(uuid,uuid)', 'EXECUTE'),
  'authenticated users cannot call the privileged deletion entry point directly'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.delete_sales_order_atomic(uuid,uuid)', 'EXECUTE'),
  'anonymous users cannot call the privileged deletion entry point'
);
SELECT ok(
  to_regprocedure('public.list_business_order_deletion_authorizers(uuid)') IS NOT NULL,
  'business-scoped owner PIN authorizer list exists'
);
SELECT ok(
  to_regprocedure('public.delete_business_order_with_owner_pin(uuid,uuid,uuid,text)') IS NOT NULL,
  'PIN-authorized multibusiness deletion entry point exists'
);
SELECT ok(
  (
    SELECT prosecdef
      FROM pg_proc
     WHERE oid = 'public.list_business_order_deletion_authorizers(uuid)'::regprocedure
  ),
  'the authorizer list validates access inside a security definer function'
);
SELECT ok(
  (
    SELECT prosecdef
      FROM pg_proc
     WHERE oid = 'public.delete_business_order_with_owner_pin(uuid,uuid,uuid,text)'::regprocedure
  ),
  'the deletion RPC performs authorization and deletion inside one transaction'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.list_business_order_deletion_authorizers(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.list_business_order_deletion_authorizers(uuid)', 'EXECUTE'),
  'only authenticated users can list scoped owner authorizers'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.delete_business_order_with_owner_pin(uuid,uuid,uuid,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.delete_business_order_with_owner_pin(uuid,uuid,uuid,text)', 'EXECUTE'),
  'only authenticated users can request PIN-authorized deletion'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%business.operate_orders%'
       AND prosrc LIKE '%business_owner%'
       AND prosrc LIKE '%scope_type = ''business''%'
       AND prosrc LIKE '%private.multibusiness_has_capability%'
      FROM pg_proc
     WHERE oid = 'public.delete_business_order_with_owner_pin(uuid,uuid,uuid,text)'::regprocedure
  ),
  'deletion requires business-scoped order access or ownership in the target business'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%staff_authorization_pins%'
       AND prosrc LIKE '%extensions.crypt%'
       AND prosrc LIKE '%PIN_INVALID%'
       AND prosrc LIKE '%locked_until%'
      FROM pg_proc
     WHERE oid = 'public.delete_business_order_with_owner_pin(uuid,uuid,uuid,text)'::regprocedure
  ),
  'staff deletion verifies and rate-limits the selected owner PIN'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%delete_sales_order_atomic%'
       AND prosrc NOT LIKE '%ORDER_MARKETPLACE_PROTECTED%'
      FROM pg_proc
     WHERE oid = 'public.delete_business_order_with_owner_pin(uuid,uuid,uuid,text)'::regprocedure
  ),
  'platform orders use the same scoped authorization and atomic deletion path'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%marketplace_cash_shift_id%'
       AND prosrc LIKE '%FOR UPDATE NOWAIT%'
       AND prosrc NOT LIKE '%ORDER_DELETE_MARKETPLACE_CASH_HANDOFF%'
      FROM pg_proc
     WHERE oid = 'public.delete_sales_order_atomic(uuid,uuid)'::regprocedure
  ),
  'a Didi cash order can be deleted while its linked shift is locked against concurrent close'
);
SELECT ok(
  (
    SELECT lower(prosrc) LIKE '%insert into private.marketplace_cash_order_deletion_archive%'
       AND prosrc LIKE '%OLD.marketplace_cash_received%'
       AND prosrc NOT LIKE '%ORDER_DELETE_MARKETPLACE_CASH_HANDOFF%'
      FROM pg_proc
     WHERE oid = 'private.block_marketplace_order_delete()'::regprocedure
  ),
  'deleting a delivered Didi cash order archives its receipt instead of blocking deletion'
);
SELECT ok(
  to_regclass('private.marketplace_cash_order_deletion_archive') IS NOT NULL
    AND (
      SELECT relrowsecurity
        FROM pg_class
       WHERE oid = to_regclass('private.marketplace_cash_order_deletion_archive')
    )
    AND NOT has_table_privilege('authenticated', 'private.marketplace_cash_order_deletion_archive', 'SELECT')
    AND NOT has_table_privilege('anon', 'private.marketplace_cash_order_deletion_archive', 'SELECT'),
  'the cash receipt audit is private and unavailable through authenticated or anonymous table access'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%marketplace_cash_order_deletion_archive%'
       AND prosrc LIKE '%UNION ALL%'
       AND prosrc LIKE '%was_deleted%'
      FROM pg_proc
     WHERE oid = 'private.marketplace_cash_receipts_for_shift(uuid)'::regprocedure
  ),
  'cash shift receipt lookup combines active receipts with deleted-order audit receipts'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%private.marketplace_cash_receipts_for_shift%'
      FROM pg_proc
     WHERE oid = 'private.cash_shift_totals(uuid)'::regprocedure
  )
  AND (
    SELECT prosrc LIKE '%private.marketplace_cash_receipts_for_shift%'
      FROM pg_proc
     WHERE oid = 'private.cash_shift_json(uuid,boolean)'::regprocedure
  )
  AND (
    SELECT prosrc LIKE '%private.marketplace_cash_receipts_for_shift%'
      FROM pg_proc
     WHERE oid = 'private.snapshot_marketplace_cash_on_shift_close()'::regprocedure
  ),
  'open and closed cash totals and receipt details retain archived Didi cash'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%role_code = ''business_owner''%'
       AND prosrc LIKE '%membership.business_id = p_business_id%'
       AND prosrc LIKE '%membership.scope_type = ''business''%'
       AND prosrc NOT LIKE '%pin_hash%'
      FROM pg_proc
     WHERE oid = 'public.list_business_order_deletion_authorizers(uuid)'::regprocedure
  ),
  'the PIN picker exposes only same-business owners and never returns a PIN hash'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%v_is_global_waiter%'
       AND prosrc LIKE '%v_is_local_staff%'
       AND prosrc LIKE '%v_order.type <> ''comedor''%'
      FROM pg_proc
     WHERE oid = 'public.delete_business_order_with_owner_pin(uuid,uuid,uuid,text)'::regprocedure
  ),
  'a global waiter cannot use owner authorization to delete delivery or takeout orders from another business'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%FOR UPDATE%'
       AND prosrc LIKE '%ORDER_DELETE_CLOSED_SHIFT%'
       AND prosrc LIKE '%ORDER_DELETE_SHARED_PAYMENT%'
       AND prosrc LIKE '%DELETE FROM public.payment_transactions%'
       AND prosrc LIKE '%DELETE FROM public.orders%'
      FROM pg_proc
     WHERE oid = 'public.delete_sales_order_atomic(uuid,uuid)'::regprocedure
  ),
  'the atomic function locks payments and shifts, protects tickets, and deletes together'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%FOR NO KEY UPDATE NOWAIT%'
       AND prosrc LIKE '%FOR UPDATE NOWAIT%'
      FROM pg_proc
     WHERE oid = 'public.delete_sales_order_atomic(uuid,uuid)'::regprocedure
  ),
  'conflicting payment and cash-close operations fail fast without partial deletion'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%pg_catalog.pg_trigger_depth() > 1%'
       AND prosrc LIKE '%order_items%'
       AND prosrc LIKE '%order_status_log%'
      FROM pg_proc
     WHERE oid = 'private.enforce_business_license_write()'::regprocedure
  ),
  'license validation permits only nested foreign-key cleanup after the parent gate'
);
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.order_items'::regclass
       AND confrelid = 'public.orders'::regclass
       AND confdeltype = 'c'
  ),
  'order items retain their cascading foreign-key relationship'
);
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgrelid = 'public.order_items'::regclass
       AND tgname = 'zzzz_enforce_business_license_write'
       AND NOT tgisinternal
  ),
  'order item license validation remains installed'
);
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgrelid = 'public.orders'::regclass
       AND tgname = 'zzzz_enforce_business_license_write'
       AND NOT tgisinternal
  ),
  'the parent order still must pass its own business license check'
);

SELECT * FROM finish();

ROLLBACK;
