-- Structural checks for owner/coordinator staff management gateways.

BEGIN;

SELECT plan(20);

SELECT ok(
  to_regprocedure('public.create_business_staff_membership(uuid,uuid,text,boolean)') IS NOT NULL,
  'business staff creation gateway exists'
);
SELECT ok(
  to_regprocedure('public.create_global_waiter_membership(uuid,uuid,boolean)') IS NOT NULL,
  'global waiter creation gateway exists'
);
SELECT ok(
  to_regprocedure('public.set_multibusiness_membership_status(uuid,text,text)') IS NOT NULL,
  'membership status gateway exists'
);
SELECT ok(
  to_regprocedure('public.update_business_staff_membership_role(uuid,text)') IS NOT NULL,
  'local role update gateway exists'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.create_business_staff_membership(uuid,uuid,text,boolean)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated managers can use the local staff gateway'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.create_global_waiter_membership(uuid,uuid,boolean)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated coordinators can use the global waiter gateway'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.set_multibusiness_membership_status(uuid,text,text)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated managers can change membership status'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.update_business_staff_membership_role(uuid,text)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated business owners can change local roles'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.memberships', 'INSERT'),
  'the browser cannot insert memberships directly'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.memberships', 'UPDATE'),
  'the browser cannot update memberships directly'
);
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.memberships', 'user_id', 'INSERT'),
  'the browser cannot insert membership columns directly'
);
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.memberships', 'status', 'UPDATE'),
  'the browser cannot update membership columns directly'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%private.multibusiness_can_manage_membership%'
      AND prosrc LIKE '%local_waiter%'
      AND prosrc LIKE '%local_kitchen%'
      FROM pg_proc
     WHERE oid = 'public.create_business_staff_membership(uuid,uuid,text,boolean)'::regprocedure
  ),
  'local staff creation validates manager capability and supported roles'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%business.operate_orders%'
      AND prosrc LIKE '%business.update_preparation%'
      AND prosrc LIKE '%business.charge_orders%'
      FROM pg_proc
     WHERE oid = 'private.multibusiness_staff_capability_codes(text)'::regprocedure
  ),
  'local role capability mapping is explicit'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%private.multibusiness_can_manage_membership%'
      AND prosrc LIKE '%global_waiter%'
      FROM pg_proc
     WHERE oid = 'public.create_global_waiter_membership(uuid,uuid,boolean)'::regprocedure
  ),
  'global waiter creation is coordinator-scoped'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%target.user_id = caller_id%'
      FROM pg_proc
     WHERE oid = 'public.set_multibusiness_membership_status(uuid,text,text)'::regprocedure
  ),
  'status changes cannot disable the current session'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%audit_events%'
      FROM pg_proc
     WHERE oid = 'public.create_business_staff_membership(uuid,uuid,text,boolean)'::regprocedure
  ),
  'local staff changes create an audit event'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%audit_events%'
      FROM pg_proc
     WHERE oid = 'public.create_global_waiter_membership(uuid,uuid,boolean)'::regprocedure
  ),
  'global waiter changes create an audit event'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%deactivation_reason%'
      AND prosrc LIKE '%p_status%'
      FROM pg_proc
     WHERE oid = 'public.set_multibusiness_membership_status(uuid,text,text)'::regprocedure
  ),
  'deactivation preserves a reason in the membership record'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%membership_capabilities%'
      AND prosrc LIKE '%role_changed%'
      AND prosrc LIKE '%business_owner%'
      FROM pg_proc
     WHERE oid = 'public.update_business_staff_membership_role(uuid,text)'::regprocedure
  ),
  'role changes replace capabilities and create an audit event'
);

SELECT * FROM finish();

ROLLBACK;
