-- Structural checks for atomic mixed-business table orders.

BEGIN;

SELECT plan(12);

SELECT has_table('public', 'order_batches', 'order batches exist');
SELECT has_column('public', 'orders', 'order_batch_id', 'orders can reference a shared batch');

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_order_batch_fkey'
  ),
  'orders reference their shared batch'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.order_batches'::regclass),
  'order batches have RLS enabled'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_class
     WHERE relname = 'order_batches_organization_created_idx'
       AND relnamespace = 'public'::regnamespace
  ),
  'order batches have an organization/date index'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_class
     WHERE relname = 'orders_order_batch_idx'
       AND relnamespace = 'public'::regnamespace
  ),
  'orders have a batch index'
);

SELECT ok(
  to_regprocedure('private.multibusiness_validate_order_batch()') IS NOT NULL,
  'order batch validator exists'
);
SELECT ok(
  to_regprocedure('private.multibusiness_canonicalize_order_item(jsonb)') IS NOT NULL,
  'server-side order line canonicalizer exists'
);
SELECT ok(
  to_regprocedure('public.create_multibusiness_table_orders(uuid,uuid,text,jsonb,text,text)') IS NOT NULL,
  'mixed table order RPC exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.orders'::regclass
       AND tgname = 'orders_validate_order_batch'
       AND NOT tgisinternal
  ),
  'orders validate their shared batch before write'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid = 'public.order_batches'::regclass
       AND polname = 'order_batches_viewed_by_organization_membership'
  ),
  'order batches have organization-scoped read policy'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.create_multibusiness_table_orders(uuid,uuid,text,jsonb,text,text)',
    'EXECUTE'
  ),
  'authenticated users can call the mixed order RPC'
);

SELECT * FROM finish();

ROLLBACK;
