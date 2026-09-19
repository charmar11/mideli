-- Structural checks for the explicit business context used by cash and
-- payment operations.

BEGIN;

SELECT plan(15);

SELECT ok(
  to_regprocedure('private.multibusiness_requested_business_id()') IS NOT NULL,
  'financial procedures can read a transaction-local business context'
);
SELECT ok(
  to_regprocedure('public.multibusiness_cash_action(uuid,text,jsonb)') IS NOT NULL,
  'the business-scoped cash gateway exists'
);
SELECT ok(
  (
    SELECT prosecdef
      FROM pg_proc
     WHERE oid = 'public.multibusiness_cash_action(uuid,text,jsonb)'::regprocedure
  ),
  'the cash gateway owns its authorization boundary'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.multibusiness_cash_action(uuid,text,jsonb)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated users can call the cash gateway'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.multibusiness_cash_action(uuid,text,jsonb)'::regprocedure,
    'EXECUTE'
  ),
  'anonymous users cannot call the cash gateway'
);

SELECT ok(
  to_regprocedure('public.multibusiness_payment_action(uuid,text,jsonb)') IS NOT NULL,
  'the business-scoped payment gateway exists'
);
SELECT ok(
  (
    SELECT prosecdef
      FROM pg_proc
     WHERE oid = 'public.multibusiness_payment_action(uuid,text,jsonb)'::regprocedure
  ),
  'the payment gateway owns its authorization boundary'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.multibusiness_payment_action(uuid,text,jsonb)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated users can call the payment gateway'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.multibusiness_payment_action(uuid,text,jsonb)'::regprocedure,
    'EXECUTE'
  ),
  'anonymous users cannot call the payment gateway'
);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_attribute
     WHERE attrelid = 'private.payment_discount_authorizations'::regclass
       AND attname = 'business_id'
       AND NOT attisdropped
  ),
  'discount authorizations carry their business boundary'
);
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgrelid = 'private.payment_discount_authorizations'::regclass
       AND tgname = 'payment_discount_authorizations_assign_business'
       AND NOT tgisinternal
  ),
  'discount authorizations receive an explicit business context'
);
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgrelid = 'public.payment_transactions'::regclass
       AND tgname = 'payment_transactions_assign_business'
       AND NOT tgisinternal
  ),
  'payment transactions validate the selected business'
);
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgrelid = 'public.cash_shift_pending_orders'::regclass
       AND tgname = 'cash_shift_pending_orders_validate_business'
       AND NOT tgisinternal
  ),
  'pending orders cannot cross a cash business boundary'
);
SELECT ok(
  to_regprocedure('private.multibusiness_close_cash_shift(uuid,uuid,text,jsonb,numeric,text,uuid)') IS NOT NULL,
  'cash closing has a business-scoped implementation'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%order_row.business_id = p_business_id%'
      FROM pg_proc
     WHERE oid = 'private.multibusiness_close_cash_shift(uuid,uuid,text,jsonb,numeric,text,uuid)'::regprocedure
  ),
  'cash closing snapshots only pending orders from its business'
);

SELECT * FROM finish();

ROLLBACK;
