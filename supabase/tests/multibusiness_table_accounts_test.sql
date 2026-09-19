-- Structural checks for shared table visits and per-business accounts.

BEGIN;

SELECT plan(16);

SELECT has_table('public', 'table_visits', 'table visits exist');
SELECT has_table('public', 'business_accounts', 'business accounts exist');
SELECT has_column('public', 'orders', 'table_visit_id', 'orders can reference a table visit');
SELECT has_column('public', 'orders', 'business_account_id', 'orders can reference a business account');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.table_visits'::regclass),
  'table visits have RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.business_accounts'::regclass),
  'business accounts have RLS enabled'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.business_accounts'::regclass
       AND conname = 'business_accounts_business_organization_fkey'
  ),
  'business accounts keep organization and business aligned'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_business_account_business_fkey'
  ),
  'orders keep account and business aligned'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_class
     WHERE relname = 'table_visits_one_open_per_table_idx'
       AND relnamespace = 'public'::regnamespace
  ),
  'a table cannot have two open visits'
);

SELECT ok(
  to_regprocedure('private.multibusiness_validate_visit_account()') IS NOT NULL,
  'visit/account order validator exists'
);
SELECT ok(
  to_regprocedure('private.multibusiness_validate_table_visit()') IS NOT NULL,
  'table visit validator exists'
);
SELECT ok(
  to_regprocedure('private.multibusiness_validate_business_account()') IS NOT NULL,
  'business account validator exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.orders'::regclass
       AND tgname = 'orders_validate_visit_account'
       AND NOT tgisinternal
  ),
  'orders validate visit and account before write'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.business_accounts'::regclass
       AND tgname = 'business_accounts_validate_scope'
       AND NOT tgisinternal
  ),
  'business accounts validate their scope before write'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid = 'public.table_visits'::regclass
       AND polname = 'table_visits_viewed_by_organization_membership'
  ),
  'table visits have organization-scoped read policy'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid = 'public.business_accounts'::regclass
       AND polname = 'business_accounts_viewed_by_business_membership'
  ),
  'business accounts have business-scoped read policy'
);

SELECT * FROM finish();

ROLLBACK;
