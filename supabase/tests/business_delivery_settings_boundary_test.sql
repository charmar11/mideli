-- Delivery prices and local origins are private to each business. Only
-- authenticated server actions may read or update the rows with service_role.

BEGIN;

SELECT plan(19);

SELECT has_table('public', 'business_delivery_settings', 'per-business delivery settings exist');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.business_delivery_settings'::regclass),
  'delivery settings have RLS enabled'
);
SELECT has_pk('public', 'business_delivery_settings', ARRAY['business_id'], 'one configuration row belongs to each business');
SELECT has_column('public', 'business_delivery_settings', 'origin_address', 'each local stores its own displayed address');
SELECT has_column('public', 'business_delivery_settings', 'origin_latitude', 'each local stores its own latitude');
SELECT has_column('public', 'business_delivery_settings', 'origin_longitude', 'each local stores its own longitude');
SELECT has_column('public', 'business_delivery_settings', 'delivery_rates', 'distance ranges are stored per business');
SELECT has_column('public', 'business_delivery_settings', 'delivery_surcharges', 'colony surcharges are stored per business');

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.business_delivery_settings'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%jsonb_typeof(delivery_rates)%'
  ),
  'distance rules must be a JSON array'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.business_delivery_settings'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%jsonb_typeof(delivery_surcharges)%'
  ),
  'colony rules must be a JSON array'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.business_delivery_settings'::regclass
       AND contype = 'f'
       AND confrelid = 'public.businesses'::regclass
       AND confdeltype = 'c'
  ),
  'delivery settings are removed only when their owning business is removed'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.businesses'::regclass
       AND tgname = 'businesses_seed_delivery_settings'
       AND NOT tgisinternal
  ),
  'new businesses receive an independent delivery configuration'
);

SELECT ok(has_table_privilege('service_role', 'public.business_delivery_settings', 'SELECT'), 'server role can read settings');
SELECT ok(has_table_privilege('service_role', 'public.business_delivery_settings', 'INSERT'), 'server role can create settings');
SELECT ok(has_table_privilege('service_role', 'public.business_delivery_settings', 'UPDATE'), 'server role can update settings');
SELECT ok(NOT has_table_privilege('authenticated', 'public.business_delivery_settings', 'SELECT'), 'browser clients cannot read another business configuration');
SELECT ok(NOT has_table_privilege('authenticated', 'public.business_delivery_settings', 'INSERT'), 'browser clients cannot insert delivery settings directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.business_delivery_settings', 'UPDATE'), 'browser clients cannot change delivery settings directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.business_delivery_settings', 'DELETE'), 'browser clients cannot delete delivery settings directly');

SELECT * FROM finish();
ROLLBACK;
