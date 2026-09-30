BEGIN;

SELECT plan(11);

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
