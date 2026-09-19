-- Structural checks for business-scoped order RLS.

BEGIN;

SELECT plan(12);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.orders'::regclass),
  'orders have RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.order_items'::regclass),
  'order items have RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.order_status_log'::regclass),
  'order status history has RLS enabled'
);

SELECT is(
  (SELECT count(*)::integer FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
      AND policyname LIKE 'orders_%'),
  4,
  'orders have four scoped policies'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_items'
      AND policyname LIKE 'order_items_%'),
  4,
  'order items have four scoped policies'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_status_log'
      AND policyname LIKE 'order_status_log_%'),
  2,
  'status history has two scoped policies'
);

SELECT is(
  (SELECT count(*)::integer FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        'Orders viewable by staff',
        'Orders created by staff',
        'Orders updated by staff',
        'Orders deleted by admins',
        'Orders deleted by staff',
        'Order items viewable by staff',
        'Order items managed by staff',
        'Order status log viewable by staff',
        'Order status log insert by staff'
      )),
  0,
  'legacy global order policies are removed'
);

SELECT ok(
  to_regprocedure('private.multibusiness_has_capability(text,uuid,uuid)') IS NOT NULL,
  'order policies use the capability resolver'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'orders'
       AND policyname = 'orders_viewed_by_business_membership'
       AND qual::text LIKE '%multibusiness_can_view_business%'
  ),
  'orders are read through business membership'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'order_items'
       AND policyname = 'order_items_viewed_by_business_membership'
       AND qual::text LIKE '%multibusiness_can_view_business%'
  ),
  'order items derive visibility from their order'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'order_status_log'
       AND policyname = 'order_status_log_viewed_by_business_membership'
       AND qual::text LIKE '%multibusiness_can_view_business%'
  ),
  'status history derives visibility from its order'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'orders'
       AND policyname = 'orders_created_with_operation_capability'
       AND with_check::text LIKE '%multibusiness_has_capability%'
  ),
  'order creation requires an operation capability'
);

SELECT * FROM finish();

ROLLBACK;
