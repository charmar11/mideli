-- Structural checks for the inventory business boundary.

BEGIN;

SELECT plan(19);

SELECT has_column('public', 'inventory_items', 'business_id', 'inventory items have a business');
SELECT has_column('public', 'inventory_recipes', 'business_id', 'recipes have a business');
SELECT has_column('public', 'inventory_movements', 'business_id', 'movements have a business');
SELECT has_column('public', 'inventory_counts', 'business_id', 'counts have a business');
SELECT has_column('public', 'inventory_purchase_orders', 'business_id', 'purchase orders have a business');
SELECT has_column('public', 'inventory_receipts', 'business_id', 'receipts have a business');
SELECT has_column('public', 'inventory_lots', 'business_id', 'lots have a business');

SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_business_id_fkey'),
  'inventory items reference a business'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_recipes_business_id_fkey'),
  'recipes reference a business'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_business_id_fkey'),
  'movements reference a business'
);

SELECT ok(
  to_regprocedure('private.multibusiness_validate_inventory_recipe()') IS NOT NULL,
  'recipe validator exists'
);
SELECT ok(
  to_regprocedure('private.multibusiness_validate_purchase_line()') IS NOT NULL,
  'purchase line validator exists'
);
SELECT ok(
  to_regprocedure('private.multibusiness_validate_receipt_line()') IS NOT NULL,
  'receipt line validator exists'
);
SELECT ok(
  to_regprocedure('private.multibusiness_validate_lot_scope()') IS NOT NULL,
  'lot validator exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.inventory_recipes'::regclass
       AND tgname = 'inventory_recipes_validate_business'
       AND NOT tgisinternal
  ),
  'recipes validate business before write'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.inventory_movements'::regclass
       AND tgname = 'inventory_movements_assign_business'
       AND NOT tgisinternal
  ),
  'movements derive business from their item'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_class
     WHERE relname = 'inventory_items_business_idx'
       AND relnamespace = 'public'::regnamespace
  ),
  'inventory items have a business index'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_class
     WHERE relname = 'inventory_movements_business_created_idx'
       AND relnamespace = 'public'::regnamespace
  ),
  'movements have a business/date index'
);

SELECT is(
  (SELECT count(*)::integer FROM public.inventory_items WHERE business_id IS NULL),
  CASE WHEN EXISTS (SELECT 1 FROM public.businesses) THEN 0
       ELSE (SELECT count(*)::integer FROM public.inventory_items) END,
  'inventory items are scoped when a business exists'
);

SELECT * FROM finish();

ROLLBACK;
