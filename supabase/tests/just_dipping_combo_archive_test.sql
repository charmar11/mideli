-- Structural checks for combo, per-business folio, and historical archive guards.

BEGIN;

SELECT plan(23);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'menu_items'
       AND column_name = 'is_combo'
  ),
  'menu items can mark a catalog combo'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'menu_items'
       AND column_name = 'combo_definition'
  ),
  'combo definition is stored with the menu item'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.menu_items'::regclass
       AND tgname = 'menu_items_validate_combo_definition'
       AND NOT tgisinternal
  ),
  'catalog writes validate combo components'
);
SELECT ok(
  (SELECT prosrc LIKE '%product.business_id = NEW.business_id%'
          AND prosrc LIKE '%product.is_active%'
          AND prosrc LIKE '%NOT product.is_combo%'
     FROM pg_proc
    WHERE oid = 'private.validate_menu_item_combo_definition()'::regprocedure),
  'combo parts must be active non-combos from the same business'
);
SELECT ok(
  (SELECT prosrc LIKE '%combo-choice:%'
          AND prosrc LIKE '%combo-fixed:%'
          AND prosrc LIKE '%combo_component_menu_item_id%'
     FROM pg_proc
    WHERE oid = 'private.multibusiness_canonicalize_order_item(jsonb)'::regprocedure),
  'order canonicalization validates combo choices and snapshots components'
);
SELECT ok(
  (SELECT prosrc LIKE '%multibusiness_canonicalize_order_item%'
     FROM pg_proc
    WHERE oid = 'private.multibusiness_validate_order_item_business()'::regprocedure),
  'direct order-item inserts pass through server catalog validation'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_business_number_key'
       AND pg_get_constraintdef(oid) = 'UNIQUE (business_id, number)'
  ),
  'order folios are unique only inside each business'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.cash_shifts'::regclass
       AND conname = 'cash_shifts_business_number_key'
       AND pg_get_constraintdef(oid) = 'UNIQUE (business_id, number)'
  ),
  'cash-shift folios are unique only inside each business'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.payment_transactions'::regclass
       AND conname = 'payment_transactions_business_folio_key'
       AND pg_get_constraintdef(oid) = 'UNIQUE (business_id, folio)'
  ),
  'payment folios are unique only inside each business'
);
SELECT ok(
  to_regclass('private.business_document_counters') IS NOT NULL,
  'folio counters are stored in the non-public schema'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'private.business_document_counters', 'SELECT'),
  'authenticated clients cannot read folio counters'
);
SELECT ok(
  to_regclass('public.legacy_sales_tickets') IS NOT NULL,
  'historical tickets use a separate archive table'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.legacy_sales_tickets'::regclass),
  'historical archive has row-level security enabled'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'legacy_sales_tickets'
       AND policyname = 'legacy_sales_tickets_visible_to_business_members'
  ),
  'historical tickets are scoped by business membership'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.legacy_sales_tickets', 'SELECT'),
  'authenticated members can read archive rows allowed by RLS'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.legacy_sales_tickets', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.legacy_sales_tickets', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.legacy_sales_tickets', 'DELETE'),
  'authenticated users cannot change or remove archive rows'
);
SELECT ok(
  to_regprocedure('public.import_legacy_sales_tickets(uuid,jsonb)') IS NOT NULL,
  'a bounded archive import function exists'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.import_legacy_sales_tickets(uuid,jsonb)',
    'EXECUTE'
  ),
  'the migration service can import historical tickets'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.import_legacy_sales_tickets(uuid,jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.import_legacy_sales_tickets(uuid,jsonb)',
    'EXECUTE'
  ),
  'browser and anonymous callers cannot import historical tickets'
);
SELECT ok(
  (SELECT prosrc LIKE '%business.slug = ''just-dipping''%'
     FROM pg_proc
    WHERE oid = 'public.import_legacy_sales_tickets(uuid,jsonb)'::regprocedure),
  'the archive importer is restricted to Just Dipping'
);
SELECT ok(
  (SELECT prosrc LIKE '%sanitize_legacy_sales_items%'
          AND prosrc NOT LIKE '%customer_phone%'
          AND prosrc NOT LIKE '%customer_name%'
     FROM pg_proc
    WHERE oid = 'private.sanitize_legacy_sales_items(jsonb)'::regprocedure),
  'the archive sanitizer stores allowlisted ticket items without customer fields'
);
SELECT ok(
  (SELECT prosrc LIKE '%ON CONFLICT (business_id, source_system, source_document_id) DO NOTHING%'
     FROM pg_proc
    WHERE oid = 'public.import_legacy_sales_tickets(uuid,jsonb)'::regprocedure),
  're-running a ticket import does not duplicate source documents'
);
SELECT ok(
  (SELECT prosrc LIKE '%is_combo%' AND prosrc LIKE '%combo_component_quantity%'
     FROM pg_proc
    WHERE oid = 'private.consume_inventory_for_order_item()'::regprocedure),
  'combo component selections drive inventory consumption'
);

SELECT * FROM finish();

ROLLBACK;
