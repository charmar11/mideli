-- Structural checks for the business-scoped order status boundary.

BEGIN;

SELECT plan(9);

SELECT ok(
  to_regprocedure('private.multibusiness_can_update_order_status(uuid,public.order_status)') IS NOT NULL,
  'status capability guard exists'
);
SELECT ok(
  to_regprocedure('private.validate_multibusiness_order_status()') IS NOT NULL,
  'status trigger function exists'
);
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgrelid = 'public.orders'::regclass
       AND tgname = 'orders_validate_multibusiness_status'
       AND NOT tgisinternal
  ),
  'orders validate status transitions before update'
);
SELECT ok(
  to_regprocedure('public.update_business_order_status(uuid,uuid,public.order_status)') IS NOT NULL,
  'business status gateway exists'
);
SELECT ok(
  (
    SELECT prosecdef
      FROM pg_proc
     WHERE oid = 'public.update_business_order_status(uuid,uuid,public.order_status)'::regprocedure
  ),
  'status gateway owns its authorization boundary'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.update_business_order_status(uuid,uuid,public.order_status)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated users can call the status gateway'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.update_business_order_status(uuid,uuid,public.order_status)'::regprocedure,
    'EXECUTE'
  ),
  'anonymous users cannot call the status gateway'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%business.update_preparation%'
      AND prosrc LIKE '%organization.operate_orders%'
      AND prosrc LIKE '%organization.charge_orders%'
      FROM pg_proc
     WHERE oid = 'private.multibusiness_can_update_order_status(uuid,public.order_status)'::regprocedure
  ),
  'status guard distinguishes preparation, operation and charging capabilities'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%business_id = p_business_id%'
      FROM pg_proc
     WHERE oid = 'public.update_business_order_status(uuid,uuid,public.order_status)'::regprocedure
  ),
  'status gateway requires the selected business'
);

SELECT * FROM finish();

ROLLBACK;
