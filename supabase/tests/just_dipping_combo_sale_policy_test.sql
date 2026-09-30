-- Structural regression checks for per-product sale modes and combo gifts.
BEGIN;

SELECT plan(8);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'menu_items'
       AND column_name = 'sale_mode'
       AND column_default = '''both''::text'
  ),
  'new products default to individual sale and combo availability'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.menu_items'::regclass
       AND conname = 'menu_items_sale_mode_check'
       AND pg_get_constraintdef(oid) LIKE '%standalone_only%'
       AND pg_get_constraintdef(oid) LIKE '%combo_only%'
  ),
  'sale mode only accepts the supported product choices'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'menu_items'
       AND column_name = 'source_catalog_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'categories'
       AND column_name = 'source_catalog_id'
  ),
  'both catalog levels can safely retain their import identity'
);

SELECT ok(
  to_regclass('public.menu_items_business_source_catalog_id_uq') IS NOT NULL
  AND to_regclass('public.categories_business_source_catalog_id_uq') IS NOT NULL,
  'import identities are unique inside each business'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.menu_items'::regclass
       AND tgname = 'menu_items_validate_sale_policy'
       AND NOT tgisinternal
  ) AND (
    SELECT prosrc LIKE '%standalone_only%'
       AND prosrc LIKE '%combo_only%'
       AND prosrc LIKE '%is_gift%'
      FROM pg_proc
     WHERE oid = 'private.validate_menu_item_sale_policy()'::regprocedure
  ),
  'database validation keeps combo components sellable only in valid contexts'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.order_items'::regclass
       AND tgname = 'zzz_order_items_sale_mode_and_gift_snapshot'
       AND NOT tgisinternal
  ),
  'order rows validate sale mode after canonicalization and snapshot gift metadata'
);

SELECT ok(
  (SELECT prosrc LIKE '%combo_only%'
          AND prosrc LIKE '%combo_component_is_gift%'
          AND prosrc LIKE '%is_gift%'
     FROM pg_proc
    WHERE oid = 'private.enforce_menu_item_sale_mode_and_snapshot_gifts()'::regprocedure),
  'client-submitted gift markers are replaced with trusted combo configuration'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'private.enforce_menu_item_sale_mode_and_snapshot_gifts()',
    'EXECUTE'
  ) AND NOT has_function_privilege(
    'anon',
    'private.enforce_menu_item_sale_mode_and_snapshot_gifts()',
    'EXECUTE'
  ),
  'clients cannot directly invoke the private trigger function'
);

SELECT * FROM finish();
ROLLBACK;
