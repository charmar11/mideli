-- Structural checks for the organization-scoped shared table map.

BEGIN;

SELECT plan(19);

SELECT has_column(
  'public', 'table_zones', 'organization_id',
  'table zones belong to an organization'
);
SELECT has_column(
  'public', 'restaurant_tables', 'organization_id',
  'restaurant tables belong to an organization'
);
SELECT has_column(
  'public', 'table_map_labels', 'organization_id',
  'map labels belong to an organization'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.restaurant_tables'::regclass
       AND conname = 'restaurant_tables_zone_organization_fkey'
  ),
  'a table cannot point to a zone from another organization'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.table_visits'::regclass
       AND conname = 'table_visits_table_organization_fkey'
  ),
  'a visit cannot point to a table from another organization'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.table_zones'::regclass),
  'table zones have RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.restaurant_tables'::regclass),
  'restaurant tables have RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.table_map_labels'::regclass),
  'map labels have RLS enabled'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'table_zones_viewed_by_organization_membership'),
  'zone reads are organization-scoped'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'restaurant_tables_viewed_by_organization_membership'),
  'table reads are organization-scoped'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'table_map_labels_viewed_by_organization_membership'),
  'label reads are organization-scoped'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'table_zones_managed_by_organization'),
  'zone writes require organization table capability'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'restaurant_tables_managed_by_organization'),
  'table writes require organization table capability'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'table_map_labels_managed_by_organization'),
  'label writes require organization table capability'
);

SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Table zones viewable by staff'),
  'legacy global zone policy is removed'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Restaurant tables viewable by staff'),
  'legacy global table policy is removed'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Table map labels viewable by staff'),
  'legacy global label policy is removed'
);

SELECT ok(
  to_regprocedure('private.multibusiness_assign_table_map_organization()') IS NOT NULL,
  'new table map writes resolve organization context'
);
SELECT ok(
  to_regprocedure('private.multibusiness_validate_table_visit()') IS NOT NULL,
  'table visits validate table organization'
);

SELECT * FROM finish();

ROLLBACK;
