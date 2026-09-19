-- Structural checks for the first order/business association slice.
-- Session-level isolation and mixed-account tests will be added with the
-- business-aware order creation RPC.

BEGIN;

SELECT plan(10);

SELECT has_column(
  'public',
  'orders',
  'business_id',
  'orders has a business boundary'
);

SELECT ok(
  (
    SELECT is_nullable = 'NO'
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'orders'
       AND column_name = 'business_id'
  ),
  'orders.business_id is required'
);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_business_id_fkey'
  ),
  'orders.business_id references businesses'
);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_class
     WHERE relname = 'orders_business_created_at_idx'
       AND relnamespace = 'public'::regnamespace
  ),
  'orders have a business/date index'
);

SELECT ok(
  to_regprocedure('private.multibusiness_mideli_business_id()') IS NOT NULL,
  'Mideli business resolver exists'
);

SELECT ok(
  to_regprocedure('private.multibusiness_assign_order_business()') IS NOT NULL,
  'order business trigger function exists'
);

SELECT ok(
  to_regprocedure('private.multibusiness_validate_order_item_business()') IS NOT NULL,
  'order item business validator exists'
);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgrelid = 'public.orders'::regclass
       AND tgname = 'orders_assign_multibusiness_scope'
       AND NOT tgisinternal
  ),
  'orders assign a business before write'
);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgrelid = 'public.order_items'::regclass
       AND tgname = 'order_items_validate_multibusiness_scope'
       AND NOT tgisinternal
  ),
  'order items validate their business before write'
);

SELECT is(
  (SELECT count(*)::integer FROM public.orders WHERE business_id IS NULL),
  0,
  'existing orders have no null business boundary'
);

SELECT * FROM finish();

ROLLBACK;
