-- Structural checks for business-local custom roles and explicit global access.

BEGIN;

SELECT plan(28);

SELECT ok(
  to_regclass('public.business_staff_roles') IS NOT NULL,
  'business-local staff roles are stored separately per business'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.business_staff_roles'::regclass),
  'business staff roles have row-level security enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.business_staff_role_capabilities'::regclass),
  'role capabilities have row-level security enabled'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'memberships'
       AND column_name = 'staff_role_id'
  ),
  'local memberships can point to a configurable role'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'memberships_active_local_staff_uidx'
  ),
  'active local staff cannot have duplicate memberships in one business'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'memberships_sync_business_staff_role'
       AND NOT tgisinternal
  ),
  'membership writes validate and synchronize their local role'
);
SELECT ok(
  to_regprocedure('public.save_business_staff_role(uuid,uuid,text,text,text[])') IS NOT NULL,
  'business owners have a guarded custom-role editor'
);
SELECT ok(
  (
    SELECT prosecdef
      FROM pg_proc
     WHERE oid = 'public.save_business_staff_role(uuid,uuid,text,text,text[])'::regprocedure
  ),
  'custom-role changes run through a security-definer boundary'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.save_business_staff_role(uuid,uuid,text,text,text[])'::regprocedure,
    'EXECUTE'
  ),
  'authenticated callers can use the guarded custom-role editor'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.create_business_staff_membership_with_role(uuid,uuid,uuid,boolean)'::regprocedure,
    'EXECUTE'
  ),
  'local staff can be assigned an existing account and an explicit role'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.set_business_staff_membership_role(uuid,uuid)'::regprocedure,
    'EXECUTE'
  ),
  'a business owner can update a local role through the guarded RPC'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.set_global_waiter_business_access(uuid,uuid,boolean,text)'::regprocedure,
    'EXECUTE'
  ),
  'the coordinator can grant or remove access for a specific business'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.set_global_waiter_cash_permissions(uuid,uuid,boolean,boolean,text)'::regprocedure,
    'EXECUTE'
  ),
  'cash permissions are no longer administered from the global waiter scope'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.update_business_staff_membership_role(uuid,text)'::regprocedure,
    'EXECUTE'
  ),
  'the legacy role setter cannot bypass the configurable local role'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%organization.operate_orders%'
       AND prosrc LIKE '%organization.charge_orders%'
       AND prosrc LIKE '%RETURN false%'
      FROM pg_proc
     WHERE oid = 'private.multibusiness_has_capability(text,uuid,uuid)'::regprocedure
  ),
  'legacy organization-wide order grants do not authorize every business'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%capability_code NOT IN (%'
       AND prosrc LIKE '%organization.charge_orders%'
      FROM pg_proc
     WHERE oid = 'public.get_my_multibusiness_context()'::regprocedure
  ),
  'legacy organization-wide order grants are not exposed as UI permissions'
);
SELECT ok(
  NOT (
    SELECT prosrc LIKE '%platform.manage_businesses%'
      FROM pg_proc
     WHERE oid = 'private.multibusiness_can_manage_membership(text,uuid,uuid,text)'::regprocedure
  ),
  'platform administration cannot impersonate local owners when assigning staff'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%affected_active_members%'
       AND prosrc LIKE '%Permisos reemplazados al actualizar el rango local%'
      FROM pg_proc
     WHERE oid = 'public.save_business_staff_role(uuid,uuid,text,text,text[])'::regprocedure
  ),
  'editing a role replaces its active members’ effective capabilities'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%private.business_license_is_available(p_business_id)%'
      FROM pg_proc
     WHERE oid = 'public.set_global_waiter_business_access(uuid,uuid,boolean,text)'::regprocedure
  ),
  'global access cannot be enabled for a business with an unavailable license'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.set_global_waiter_business_access(uuid,uuid,boolean,text)'::regprocedure,
    'EXECUTE'
  ),
  'anonymous callers cannot modify global business access'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'private.multibusiness_has_capability(text,uuid,uuid)'::regprocedure,
    'EXECUTE'
  ),
  'row-level policies can still invoke the guarded capability resolver'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'private.multibusiness_can_manage_membership(text,uuid,uuid,text)'::regprocedure,
    'EXECUTE'
  ),
  'row-level policies can still invoke the guarded membership manager'
);
SELECT ok(
  to_regprocedure('public.transfer_business_owner(uuid,uuid,text)') IS NOT NULL,
  'owner transfer is a dedicated database operation'
);
SELECT ok(
  (
    SELECT prosecdef
      FROM pg_proc
     WHERE oid = 'public.transfer_business_owner(uuid,uuid,text)'::regprocedure
  ),
  'owner transfer executes behind a security-definer boundary'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.transfer_business_owner(uuid,uuid,text)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated callers can request a guarded owner transfer'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.transfer_business_owner(uuid,uuid,text)'::regprocedure,
    'EXECUTE'
  ),
  'anonymous callers cannot transfer business ownership'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%platform.manage_businesses%'
       AND prosrc LIKE '%business.owner.transferred%'
       AND prosrc LIKE '%exactamente un dueño activo%'
       AND prosrc LIKE '%auth.users%'
       AND prosrc LIKE '%FOR UPDATE%'
      FROM pg_proc
     WHERE oid = 'public.transfer_business_owner(uuid,uuid,text)'::regprocedure
  ),
  'owner transfer validates the active account, serializes ownership, and audits the change'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%WHEN membership.scope_type = ''business'' AND membership.role_code = ''business_owner'' THEN 1%'
      FROM pg_proc
     WHERE oid = 'public.get_my_multibusiness_context()'::regprocedure
  ),
  'the selected local owner role takes precedence over global memberships'
);

SELECT * FROM finish();

ROLLBACK;
