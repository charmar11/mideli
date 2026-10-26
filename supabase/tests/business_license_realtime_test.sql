BEGIN;

SELECT plan(7);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'realtime.messages'::regclass),
  'Realtime message access remains protected by RLS'
);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_policy
     WHERE polrelid = 'realtime.messages'::regclass
       AND polname = 'business_license_private_channel_read'
       AND polcmd = 'r'
       AND polroles @> ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')]::oid[]
       AND pg_get_expr(polqual, polrelid) LIKE '%multibusiness_can_view_business%'
  ),
  'license events are readable only through authorized business topics'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.business_licenses'::regclass
       AND tgname = 'business_licenses_broadcast_insert_delete'
       AND NOT tgisinternal
  ),
  'license creation or removal broadcasts availability'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.business_licenses'::regclass
       AND tgname = 'business_licenses_broadcast_update'
       AND NOT tgisinternal
  ),
  'license status or expiry changes broadcast availability'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.businesses'::regclass
       AND tgname = 'businesses_broadcast_license_availability'
       AND NOT tgisinternal
  ),
  'business lifecycle changes broadcast availability'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'private.publish_business_license_availability(uuid)',
    'EXECUTE'
  ),
  'authenticated clients cannot invoke the broadcast helper directly'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.business_licenses', 'SELECT'),
  'license rows remain unreadable to authenticated clients'
);

SELECT * FROM finish();
ROLLBACK;
