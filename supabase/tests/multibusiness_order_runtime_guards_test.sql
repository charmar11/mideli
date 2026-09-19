-- Structural checks for the guarded single-business order path.

BEGIN;

SELECT plan(5);

SELECT ok(
  to_regprocedure('public.update_business_order_with_items(uuid,uuid,jsonb,integer,text,uuid,text)') IS NOT NULL,
  'the business-scoped order update RPC exists'
);
SELECT ok(
  (
    SELECT prosecdef
      FROM pg_proc
     WHERE oid = 'public.update_business_order_with_items(uuid,uuid,jsonb,integer,text,uuid,text)'::regprocedure
  ),
  'the order update RPC owns its authorization boundary'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.update_business_order_with_items(uuid,uuid,jsonb,integer,text,uuid,text)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated users can invoke the guarded update RPC'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.create_order_with_items(uuid,jsonb,text,integer,text,text,uuid,text)'::regprocedure,
    'EXECUTE'
  ),
  'the legacy create RPC is no longer directly callable after migration'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.update_order_with_items(uuid,jsonb,integer,text,uuid,text)'::regprocedure,
    'EXECUTE'
  ),
  'the legacy update RPC is no longer directly callable after migration'
);

SELECT * FROM finish();

ROLLBACK;
