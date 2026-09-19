-- Structural and seed checks for the multibusiness foundation.
-- The authenticated-session isolation cases will be expanded when the first
-- staging project is available. This suite must run after all migrations.

BEGIN;

SELECT plan(20);

SELECT has_table('public', 'organizations', 'organizations exists');
SELECT has_table('public', 'businesses', 'businesses exists');
SELECT has_table('public', 'memberships', 'memberships exists');
SELECT has_table('public', 'capabilities', 'capabilities exists');
SELECT has_table('public', 'membership_capabilities', 'membership_capabilities exists');
SELECT has_table('public', 'audit_events', 'audit_events exists');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.organizations'::regclass),
  'organizations has RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.businesses'::regclass),
  'businesses has RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.memberships'::regclass),
  'memberships has RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.capabilities'::regclass),
  'capabilities has RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.membership_capabilities'::regclass),
  'membership_capabilities has RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.audit_events'::regclass),
  'audit_events has RLS enabled'
);

SELECT is(
  (SELECT count(*)::integer FROM public.capabilities),
  10,
  'the foundation seeds only the ten approved capabilities'
);
SELECT is(
  (SELECT count(*)::integer FROM public.organizations),
  0,
  'the foundation does not invent organizations'
);
SELECT is(
  (SELECT count(*)::integer FROM public.businesses),
  0,
  'the foundation does not invent businesses'
);
SELECT is(
  (SELECT count(*)::integer FROM public.memberships),
  0,
  'the foundation does not invent memberships'
);
SELECT is(
  (SELECT count(*)::integer FROM public.audit_events),
  0,
  'the foundation does not invent audit history'
);

SELECT is(
  (
    SELECT count(*)::integer
      FROM public.capabilities
     WHERE code LIKE 'platform.%'
        OR code LIKE 'organization.%'
        OR code LIKE 'business.%'
  ),
  10,
  'all seeded capabilities use an approved scope prefix'
);

SELECT ok(
  to_regprocedure('private.multibusiness_has_capability(text,uuid,uuid)') IS NOT NULL,
  'capability resolver exists in the private schema'
);

SELECT ok(
  to_regprocedure('private.multibusiness_can_manage_membership(text,uuid,uuid,text)') IS NOT NULL,
  'membership manager resolver exists in the private schema'
);

SELECT * FROM finish();

ROLLBACK;
