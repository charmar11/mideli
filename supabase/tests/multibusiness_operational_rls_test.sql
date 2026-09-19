-- Structural checks for business-scoped operational RLS.

BEGIN;

SELECT plan(18);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.inventory_items'::regclass),
  'inventory items have RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.cash_shifts'::regclass),
  'cash shifts have RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.payment_transactions'::regclass),
  'payments have RLS enabled'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'multibusiness_inventory_items_view'),
  'inventory reads use business membership'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'multibusiness_inventory_recipes_manage'),
  'recipes require inventory management capability'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'multibusiness_inventory_count_lines_manage'),
  'count lines inherit their parent business boundary'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'multibusiness_inventory_purchase_lines_manage'),
  'purchase lines inherit their parent business boundary'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'multibusiness_inventory_receipt_lines_insert'),
  'receipt lines inherit their parent business boundary'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'multibusiness_cash_shifts_view'),
  'cash reads use business membership'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'multibusiness_cash_shifts_manage'),
  'cash creation requires cash management capability'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'multibusiness_cash_movements_insert'),
  'cash movements require cash management capability'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'multibusiness_payment_transactions_view'),
  'payment reads use business membership'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'multibusiness_payment_transactions_manage'),
  'payment creation allows charge capability only'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'multibusiness_payment_order_allocations_manage'),
  'order allocations require charge capability'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polname = 'Inventory items viewable by staff'
  ),
  'legacy global inventory policy is removed'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polname = 'Payments visible by authorized staff'
  ),
  'legacy global payment policy is removed'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polname = 'Cash shifts visible to authorized staff'
  ),
  'legacy global cash policy is removed'
);

SELECT ok(
  to_regprocedure('private.multibusiness_has_capability(text,uuid,uuid)') IS NOT NULL,
  'operational RLS uses the shared capability resolver'
);

SELECT * FROM finish();

ROLLBACK;
