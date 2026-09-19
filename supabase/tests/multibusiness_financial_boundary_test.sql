-- Structural checks for cash and payment business boundaries.

BEGIN;

SELECT plan(25);

SELECT has_column('public', 'cash_shifts', 'business_id', 'cash shifts have a business');
SELECT has_column('public', 'cash_movements', 'business_id', 'cash movements have a business');
SELECT has_column('public', 'cash_shift_pending_orders', 'business_id', 'pending orders have a business');
SELECT has_column('public', 'cash_shift_adjustments', 'business_id', 'cash adjustments have a business');
SELECT has_column('public', 'cash_shift_opening_float_changes', 'business_id', 'opening float changes have a business');
SELECT has_column('public', 'cash_movement_corrections', 'business_id', 'movement corrections have a business');
SELECT has_column('public', 'payment_transactions', 'business_id', 'payment transactions have a business');
SELECT has_column('public', 'payment_tenders', 'business_id', 'payment tenders have a business');
SELECT has_column('public', 'payment_order_allocations', 'business_id', 'order allocations have a business');
SELECT has_column('public', 'payment_item_allocations', 'business_id', 'item allocations have a business');
SELECT has_column('public', 'payment_tender_method_changes', 'business_id', 'tender changes have a business');

SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_shifts_business_id_fkey'),
  'cash shifts reference a business'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_transactions_business_id_fkey'),
  'payment transactions reference a business'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_order_allocations_business_id_fkey'),
  'order allocations reference a business'
);

SELECT ok(
  to_regprocedure('private.multibusiness_assign_cash_shift_business()') IS NOT NULL,
  'cash shift business resolver exists'
);
SELECT ok(
  to_regprocedure('private.multibusiness_assign_payment_business()') IS NOT NULL,
  'payment business resolver exists'
);
SELECT ok(
  to_regprocedure('private.multibusiness_validate_payment_order()') IS NOT NULL,
  'payment order validator exists'
);
SELECT ok(
  to_regprocedure('private.multibusiness_validate_pending_order_business()') IS NOT NULL,
  'pending order validator exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.cash_shifts'::regclass
       AND tgname = 'cash_shifts_assign_business'
       AND NOT tgisinternal
  ),
  'cash shifts assign their business before write'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.payment_transactions'::regclass
       AND tgname = 'payment_transactions_assign_business'
       AND NOT tgisinternal
  ),
  'payments assign their business before write'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.payment_order_allocations'::regclass
       AND tgname = 'payment_order_allocations_validate_business'
       AND NOT tgisinternal
  ),
  'allocations validate their business before write'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_class
     WHERE relname = 'cash_shifts_single_open_business_idx'
       AND relnamespace = 'public'::regnamespace
  ),
  'each business can have one open cash shift'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_class
     WHERE relname = 'payment_transactions_business_created_idx'
       AND relnamespace = 'public'::regnamespace
  ),
  'payments have a business/date index'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_class
     WHERE relname = 'cash_movements_business_created_idx'
       AND relnamespace = 'public'::regnamespace
  ),
  'cash movements have a business/date index'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE relname = 'cash_shifts_single_open_idx'
       AND relnamespace = 'public'::regnamespace
  ),
  'the old global single-cash-shift index is removed'
);

SELECT * FROM finish();

ROLLBACK;
