-- Regression checks for the multibusiness RLS privilege cleanup.

BEGIN;

SELECT plan(15);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'private.multibusiness_can_view_business(uuid)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated sessions can evaluate the business visibility helper'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'private.multibusiness_can_view_business(uuid)'::regprocedure,
    'EXECUTE'
  ),
  'anonymous sessions cannot execute the business visibility helper'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'private.multibusiness_mideli_business_id()'::regprocedure,
    'EXECUTE'
  ),
  'authenticated sessions can evaluate the Mideli print-station helper'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'private.multibusiness_mideli_business_id()'::regprocedure,
    'EXECUTE'
  ),
  'anonymous sessions cannot execute the Mideli print-station helper'
);

SELECT is(
  (SELECT count(*)::integer
     FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'categories'
      AND policyname LIKE 'categories_%'),
  4,
  'categories expose only the four scoped policies'
);
SELECT is(
  (SELECT count(*)::integer
     FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'menu_items'
      AND policyname LIKE 'menu_items_%'),
  4,
  'menu items expose only the four scoped policies'
);
SELECT is(
  (SELECT count(*)::integer
     FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname LIKE 'orders_%'),
  4,
  'orders expose only the four scoped policies'
);
SELECT is(
  (SELECT count(*)::integer
     FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_items'
      AND policyname LIKE 'order_items_%'),
  4,
  'order items expose only the four scoped policies'
);
SELECT is(
  (SELECT count(*)::integer
     FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_status_log'
      AND policyname LIKE 'order_status_log_%'),
  2,
  'order status history exposes only scoped read and insert policies'
);
SELECT is(
  (SELECT count(*)::integer
     FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'print_station_settings'),
  3,
  'print station settings retain scoped access plus the restrictive license gate'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'categories',
         'menu_items',
         'orders',
         'order_items',
         'order_status_log'
       )
       AND (
         qual IN ('true', '(true)')
         OR with_check IN ('true', '(true)')
       )
  ),
  'legacy permissive policies are absent from business data tables'
);
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'orders'
       AND policyname = 'orders_viewed_by_business_membership'
       AND qual ILIKE '%multibusiness_can_view_business%'
  ),
  'orders keep business-scoped visibility'
);
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'order_status_log'
       AND policyname = 'order_status_log_inserted_with_operation_capability'
       AND with_check ILIKE '%multibusiness_has_capability%'
  ),
  'status history keeps capability-scoped inserts'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'orders'
       AND policyname = 'Orders are viewable by authenticated users'
  ),
  'the legacy broad orders policy is removed'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'order_status_log'
       AND policyname = 'Authenticated users can insert status log'
  ),
  'the legacy unrestricted status insert policy is removed'
);

SELECT * FROM finish();

ROLLBACK;
