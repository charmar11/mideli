-- Per-business customer records and receipt configuration stay behind the
-- authenticated server actions; the legacy WhatsApp customer tables remain
-- independent.

BEGIN;

SELECT plan(22);

SELECT has_table('public', 'business_customers', 'business customer directory exists');
SELECT has_table('public', 'business_customer_addresses', 'business customer addresses exist');
SELECT has_table('public', 'business_receipt_settings', 'per-business receipt settings exist');
SELECT has_column('public', 'orders', 'business_customer_id', 'orders link to an operational customer');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.business_customers'::regclass),
  'business customers have RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.business_customer_addresses'::regclass),
  'business customer addresses have RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.business_receipt_settings'::regclass),
  'receipt settings have RLS enabled'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.business_customers'::regclass
       AND conname = 'business_customers_business_phone_key'
  ),
  'a phone number has one customer record per business'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_business_customer_id_fkey'
  ),
  'orders keep a valid business customer reference'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.orders'::regclass
       AND tgname = 'orders_business_customer_guard'
       AND NOT tgisinternal
  ),
  'an order cannot reference a customer from another business'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.business_customer_addresses'::regclass
       AND tgname = 'business_customer_addresses_scope_guard'
       AND NOT tgisinternal
  ),
  'a saved address must belong to its customer business'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.orders'::regclass
       AND tgname = 'orders_sync_business_customer_address'
       AND NOT tgisinternal
  ),
  'delivery orders refresh their saved business address transactionally'
);

SELECT ok(
  has_table_privilege('service_role', 'public.business_customers', 'SELECT'),
  'server service role can read business customers'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.business_customers', 'SELECT'),
  'authenticated clients cannot bypass the customer server actions'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.business_customers', 'SELECT'),
  'anonymous clients cannot read business customers'
);
SELECT ok(
  has_table_privilege('service_role', 'public.business_receipt_settings', 'UPDATE'),
  'server service role can update receipt settings'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.business_receipt_settings', 'SELECT'),
  'receipt settings are not exposed to authenticated clients'
);

SELECT ok(
  (SELECT prosrc LIKE '%business_customer_id = NULLIF%'
     FROM pg_proc
    WHERE oid = 'public.create_business_order_with_details(uuid,uuid,jsonb,text,text,text,uuid,text,jsonb)'::regprocedure),
  'atomic POS order creation persists the scoped customer reference'
);

SELECT ok(
  to_regprocedure('public.create_multibusiness_table_orders_with_customers(uuid,uuid,text,jsonb,text,text,text,jsonb)') IS NOT NULL,
  'mixed table orders support a customer record per business'
);
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.create_multibusiness_table_orders_with_customers(uuid,uuid,text,jsonb,text,text,text,jsonb)'::regprocedure),
  'mixed-order wrapper uses caller permissions and row-level policies'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.create_multibusiness_table_orders_with_customers(uuid,uuid,text,jsonb,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated users can call the authorized mixed-order wrapper'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_multibusiness_table_orders_with_customers(uuid,uuid,text,jsonb,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'anonymous users cannot call the mixed-order wrapper'
);

SELECT * FROM finish();

ROLLBACK;
