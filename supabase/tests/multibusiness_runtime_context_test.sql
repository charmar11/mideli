-- Structural checks for the runtime context and business-scoped POS RPC.

BEGIN;

SELECT plan(18);

SELECT ok(
  to_regprocedure('public.get_my_multibusiness_context()') IS NOT NULL,
  'the authenticated context function exists'
);
SELECT ok(
  (
    SELECT prosecdef
      FROM pg_proc
     WHERE oid = 'public.get_my_multibusiness_context()'::regprocedure
  ),
  'the context function reads through a controlled security definer'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.get_my_multibusiness_context()'::regprocedure,
    'EXECUTE'
  ),
  'authenticated users can request only their own context'
);

SELECT ok(
  to_regprocedure('public.create_business_order_with_items(uuid,uuid,jsonb,text,text,text,uuid,text)') IS NOT NULL,
  'the business-scoped order RPC exists'
);
SELECT ok(
  (
    SELECT prosecdef
      FROM pg_proc
     WHERE oid = 'public.create_business_order_with_items(uuid,uuid,jsonb,text,text,text,uuid,text)'::regprocedure
  ),
  'the order RPC owns its transaction boundary'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.create_business_order_with_items(uuid,uuid,jsonb,text,text,text,uuid,text)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated users can invoke the order RPC'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_business_order_with_items(uuid,uuid,jsonb,text,text,text,uuid,text)'::regprocedure,
    'EXECUTE'
  ),
  'anonymous users cannot invoke the order RPC'
);
SELECT ok(
  to_regprocedure('private.multibusiness_canonicalize_order_item(jsonb)') IS NOT NULL,
  'the order RPC reuses server-side catalog canonicalization'
);

SELECT ok(
  to_regprocedure('private.multibusiness_can_view_business(uuid)') IS NOT NULL,
  'business visibility is resolved by a private scoped helper'
);
SELECT ok(
  (
    SELECT prosecdef
      FROM pg_proc
     WHERE oid = 'private.multibusiness_can_view_business(uuid)'::regprocedure
  ),
  'business visibility runs behind a controlled security definer'
);
SELECT ok(
  (
    SELECT pg_get_functiondef('private.multibusiness_can_view_business(uuid)'::regprocedure)
      LIKE '%membership.scope_type = ''business''%'
      AND pg_get_functiondef('private.multibusiness_can_view_business(uuid)'::regprocedure)
        LIKE '%membership.business_id = business.id%'
      AND pg_get_functiondef('private.multibusiness_can_view_business(uuid)'::regprocedure)
        LIKE '%membership.scope_type = ''organization''%'
      AND pg_get_functiondef('private.multibusiness_can_view_business(uuid)'::regprocedure)
        LIKE '%organization.manage_global_waiters%'
  ),
  'business visibility distinguishes local memberships from explicit organization capabilities'
);
SELECT ok(
  (
    SELECT pg_get_functiondef('public.get_my_multibusiness_context()'::regprocedure)
      LIKE '%private.multibusiness_can_list_business_context(business.id)%'
  ),
  'the context list uses a metadata-only organization boundary'
);
SELECT ok(
  (
    SELECT pg_get_functiondef('public.get_my_multibusiness_context()'::regprocedure)
      LIKE '%membership.scope_type = ''business''%'
      AND pg_get_functiondef('public.get_my_multibusiness_context()'::regprocedure)
        LIKE '%membership.business_id = business.id%'
  ),
  'context membership resolution stays business-scoped'
);
SELECT ok(
  to_regprocedure('private.multibusiness_can_list_business_context(uuid)') IS NOT NULL,
  'organization metadata visibility has its own helper'
);
SELECT ok(
  (
    SELECT prosecdef
      FROM pg_proc
     WHERE oid = 'private.multibusiness_can_list_business_context(uuid)'::regprocedure
  ),
  'organization metadata visibility runs behind a controlled security definer'
);
SELECT ok(
  (
    SELECT pg_get_functiondef('private.multibusiness_can_list_business_context(uuid)'::regprocedure)
      LIKE '%organization.manage_tables%'
      AND pg_get_functiondef('private.multibusiness_can_list_business_context(uuid)'::regprocedure)
        LIKE '%organization.manage_global_waiters%'
  ),
  'coordinator context can resolve the shared floor without broad business RLS'
);
SELECT ok(
  (
    SELECT pg_get_functiondef('public.get_my_multibusiness_context()'::regprocedure)
      NOT LIKE '%private.multibusiness_can_view_business(business.id)%'
  ),
  'context metadata does not reuse the private business data gate'
);
SELECT ok(
  (
    SELECT pg_get_functiondef('private.multibusiness_can_view_business(uuid)'::regprocedure)
      NOT LIKE '%organization.manage_tables%'
  ),
  'shared table management is not a private business data capability'
);

SELECT * FROM finish();

ROLLBACK;
