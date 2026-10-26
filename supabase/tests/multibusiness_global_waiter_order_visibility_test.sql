-- Regression checks for dine-in visibility and explicit local order access.

BEGIN;

SELECT plan(14);

SELECT ok(
  to_regprocedure('private.multibusiness_can_view_order(uuid,public.order_type)') IS NOT NULL,
  'the order visibility helper exists'
);
SELECT ok(
  (
    SELECT prosecdef
      FROM pg_proc
     WHERE oid = 'private.multibusiness_can_view_order(uuid,public.order_type)'::regprocedure
  ),
  'order visibility runs behind a controlled security definer'
);
SELECT ok(
  (
    SELECT proconfig @> ARRAY['search_path=""']
      FROM pg_proc
     WHERE oid = 'private.multibusiness_can_view_order(uuid,public.order_type)'::regprocedure
  ),
  'order visibility pins an empty search path'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'private.multibusiness_can_view_order(uuid,public.order_type)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated users can evaluate order visibility through RLS'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'private.multibusiness_can_view_order(uuid,public.order_type)'::regprocedure,
    'EXECUTE'
  ),
  'anonymous users cannot execute the order visibility helper'
);
SELECT ok(
  (
    SELECT pg_get_functiondef(
      'private.multibusiness_can_view_order(uuid,public.order_type)'::regprocedure
    ) ILIKE '%role_code = ''global_waiter''%'
  ),
  'the special rule applies only to active global waiter memberships'
);
SELECT ok(
  (
    SELECT pg_get_functiondef(
      'private.multibusiness_can_view_order(uuid,public.order_type)'::regprocedure
    ) ILIKE '%p_order_type = ''comedor''%'
  ),
  'global waiters can view dine-in orders across their organization'
);
SELECT ok(
  (
    SELECT pg_get_functiondef(
      'private.multibusiness_can_view_order(uuid,public.order_type)'::regprocedure
    ) NOT ILIKE '%multibusiness_has_capability%'
  ),
  'business grants do not unlock delivery or takeout for a global waiter'
);
SELECT ok(
  (
    SELECT pg_get_functiondef(
      'private.multibusiness_can_view_order(uuid,public.order_type)'::regprocedure
    ) ILIKE '%multibusiness_requested_business_id%'
  ),
  'order visibility keeps the selected-business boundary'
);
SELECT ok(
  (
    SELECT pg_get_functiondef(
      'private.multibusiness_can_view_order(uuid,public.order_type)'::regprocedure
    ) ILIKE '%multibusiness_can_view_business%'
  ),
  'non-global roles retain the existing business membership rule'
);
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'orders'
       AND policyname = 'orders_viewed_by_business_membership'
       AND qual ILIKE '%multibusiness_can_view_order%'
  ),
  'order rows use the service-type visibility helper'
);
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'order_items'
       AND policyname = 'order_items_viewed_by_business_membership'
       AND qual ILIKE '%multibusiness_can_view_order%'
  ),
  'order items inherit service-type visibility'
);
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'order_status_log'
       AND policyname = 'order_status_log_viewed_by_business_membership'
       AND qual ILIKE '%multibusiness_can_view_order%'
  ),
  'order status history inherits service-type visibility'
);
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'orders'
       AND policyname = 'business_license_read_gate'
       AND permissive = 'RESTRICTIVE'
  ),
  'the license read gate remains restrictive'
);

SELECT * FROM finish();

ROLLBACK;
