-- Structural security checks for business-scoped cashier roles.

BEGIN;

SELECT plan(24);

SELECT is(
  (SELECT scope_type FROM public.capabilities WHERE code = 'business.open_cash'),
  'business',
  'opening cash is an explicitly business-scoped capability'
);
SELECT is(
  (SELECT scope_type FROM public.capabilities WHERE code = 'business.close_cash'),
  'business',
  'closing cash and consulting a fresh cut are business-scoped'
);
SELECT ok(
  to_regprocedure('public.set_global_waiter_cash_permissions(uuid,uuid,boolean,boolean,text)') IS NOT NULL,
  'the guarded coordinator permission setter exists'
);
SELECT ok(
  (
    SELECT prosecdef
      FROM pg_proc
     WHERE oid = 'public.set_global_waiter_cash_permissions(uuid,uuid,boolean,boolean,text)'::regprocedure
  ),
  'the permission setter owns its authorization boundary'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.set_global_waiter_cash_permissions(uuid,uuid,boolean,boolean,text)'::regprocedure,
    'EXECUTE'
  ),
  'coordinators can no longer assign cash permissions globally'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.set_global_waiter_cash_permissions(uuid,uuid,boolean,boolean,text)'::regprocedure,
    'EXECUTE'
  ),
  'anonymous callers cannot change cashier permissions'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%organization.manage_global_waiters%'
       AND prosrc LIKE '%business.open_cash%'
       AND prosrc LIKE '%business.close_cash%'
       AND prosrc LIKE '%v_user_id = v_actor_id%'
       AND prosrc LIKE '%global_waiter.cash_permission.granted%'
       AND prosrc LIKE '%global_waiter.cash_permission.revoked%'
      FROM pg_proc
     WHERE oid = 'public.set_global_waiter_cash_permissions(uuid,uuid,boolean,boolean,text)'::regprocedure
  ),
  'the setter scopes coordinators, target roles, self-grants, and audit events'
);
SELECT ok(
  (
      SELECT prosrc LIKE '%business.open_cash%'
       AND prosrc LIKE '%business.close_cash%'
       AND prosrc LIKE '%business.manage_cash%'
       AND prosrc LIKE '%record_movement%'
       AND prosrc LIKE '%list_history%'
      FROM pg_proc
     WHERE oid = 'private.multibusiness_cash_action_unscoped(uuid,text,jsonb)'::regprocedure
  ),
  'cash actions distinguish operational rights from financial administration'
);
SELECT ok(
  (
      SELECT prosrc LIKE '%status_only%'
       AND prosrc LIKE '%private.cash_shift_json(v_shift_id, false)%'
       AND prosrc LIKE '%NOT v_can_close_cash%'
       AND prosrc LIKE '%v_result->''id''%'
      FROM pg_proc
     WHERE oid = 'private.multibusiness_cash_action_unscoped(uuid,text,jsonb)'::regprocedure
  ),
  'operators and opening-only cashiers receive cash status without financial details'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%p_action = ''list_authorizers''%'
       AND prosrc LIKE '%jsonb_array_elements%'
       AND prosrc LIKE '%membership.scope_type = ''business''%'
       AND prosrc LIKE '%membership.business_id = p_business_id%'
      FROM pg_proc
     WHERE oid = 'public.multibusiness_cash_action(uuid,text,jsonb)'::regprocedure
  ),
  'the authorizer list is restricted to active staff directly assigned to this business'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%p_action = ''authorize''%'
       AND prosrc LIKE '%p_authorizer_id%'
       AND prosrc LIKE '%membership.scope_type = ''business''%'
       AND prosrc LIKE '%membership.business_id = p_business_id%'
      FROM pg_proc
     WHERE oid = 'public.multibusiness_cash_action(uuid,text,jsonb)'::regprocedure
  ),
  'PIN authorization rejects staff without a direct membership in this business'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'private.multibusiness_cash_action_unscoped(uuid,text,jsonb)'::regprocedure,
    'EXECUTE'
  ),
  'the internal cash implementation cannot be called directly through the API'
);
SELECT ok(
  (
    SELECT prosecdef
      FROM pg_proc
     WHERE oid = 'public.multibusiness_cash_action(uuid,text,jsonb)'::regprocedure
  ),
  'the business cash gateway remains security definer'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.multibusiness_cash_action(uuid,text,jsonb)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated users can call the guarded cash gateway'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%business.manage_cash%'
       AND prosrc LIKE '%business.open_cash%'
       AND prosrc LIKE '%business.close_cash%'
       AND prosrc LIKE '%closed_by = profile.id%'
       AND prosrc LIKE '%interval ''2 hours''%'
      FROM pg_proc
     WHERE oid = 'private.can_view_cash_shift(uuid)'::regprocedure
  ),
  'cash visibility uses the business permission and own-recent-cut boundary'
);
SELECT ok(
  NOT (
    SELECT prosrc LIKE '%profile.role%'
      FROM pg_proc
     WHERE oid = 'private.can_view_cash_shift(uuid)'::regprocedure
  ),
  'cash visibility no longer trusts legacy global profile roles'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'public.open_cash_shift(numeric,jsonb,text)'::regprocedure, 'EXECUTE'
  ),
  'the legacy unscoped opening endpoint is no longer directly callable'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'public.record_cash_movement(uuid,text,text,numeric,text,uuid)'::regprocedure, 'EXECUTE'
  ),
  'the legacy unscoped movement endpoint is no longer directly callable'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'public.list_cash_shifts(integer,integer)'::regprocedure, 'EXECUTE'
  ),
  'cashier roles cannot bypass the scoped gateway to browse all cuts'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'public.get_cash_shift_detail(uuid)'::regprocedure, 'EXECUTE'
  ),
  'cashier roles cannot bypass per-shift visibility checks'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'public.correct_cash_movement(uuid,numeric,text,uuid)'::regprocedure, 'EXECUTE'
  ),
  'cashier roles cannot bypass the scoped gateway to correct movements'
);
SELECT ok(
  to_regprocedure('private.can_manage_cash_shift(uuid)') IS NOT NULL,
  'supporting cash data has a separate full-administrator visibility check'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%business.manage_cash%'
      FROM pg_proc
     WHERE oid = 'private.can_manage_cash_shift(uuid)'::regprocedure
  ),
  'supporting cash visibility requires the full cash-management capability'
);
SELECT ok(
  (
    SELECT policy.polqual::text LIKE '%can_manage_cash_shift%'
      FROM pg_policy AS policy
     WHERE policy.polrelid = 'public.cash_movements'::regclass
       AND policy.polname = 'Cash movements visible to cash administrators'
  ),
  'direct movement queries remain restricted to full cash administrators'
);

SELECT * FROM finish();

ROLLBACK;
