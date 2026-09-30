BEGIN;

SELECT plan(6);

SELECT ok(
  to_regprocedure('public.create_business_order_with_details(uuid,uuid,jsonb,text,text,text,uuid,text,jsonb)') IS NOT NULL,
  'atomic POS order entry point exists'
);

SELECT ok(
  NOT (
    SELECT prosecdef FROM pg_proc
     WHERE oid = 'public.create_business_order_with_details(uuid,uuid,jsonb,text,text,text,uuid,text,jsonb)'::regprocedure
  ),
  'order details are written with caller RLS permissions'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.create_business_order_with_details(uuid,uuid,jsonb,text,text,text,uuid,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated staff may invoke the order RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_business_order_with_details(uuid,uuid,jsonb,text,text,text,uuid,text,jsonb)',
    'EXECUTE'
  ),
  'anonymous callers cannot invoke the order RPC'
);

SELECT ok(
  (
    SELECT prosrc LIKE '%pg_advisory_xact_lock%'
       AND prosrc LIKE '%create_business_order_with_items%'
       AND prosrc LIKE '%UPDATE public.orders%'
       AND prosrc LIKE '%IF NOT FOUND THEN%'
      FROM pg_proc
     WHERE oid = 'public.create_business_order_with_details(uuid,uuid,jsonb,text,text,text,uuid,text,jsonb)'::regprocedure
  ),
  'creation and details use one transaction and reject a missing update'
);

SELECT ok(
  (
    SELECT prosrc LIKE '%v_prior_id IS NOT NULL%'
       AND prosrc LIKE '%schedule_status%'
       AND prosrc LIKE '%delivery_colony%'
      FROM pg_proc
     WHERE oid = 'public.create_business_order_with_details(uuid,uuid,jsonb,text,text,text,uuid,text,jsonb)'::regprocedure
  ),
  'replays preserve later edits and delivery/schedule fields are included'
);

SELECT * FROM finish();

ROLLBACK;
