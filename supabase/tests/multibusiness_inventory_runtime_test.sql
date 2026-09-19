-- Structural checks for the business-scoped inventory gateway.

BEGIN;

SELECT plan(13);

SELECT ok(
  to_regprocedure('public.multibusiness_inventory_action(uuid,text,jsonb)') IS NOT NULL,
  'the business-scoped inventory gateway exists'
);
SELECT ok(
  NOT (
    SELECT prosecdef
      FROM pg_proc
     WHERE oid = 'public.multibusiness_inventory_action(uuid,text,jsonb)'::regprocedure
  ),
  'inventory actions execute with the caller RLS context'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.multibusiness_inventory_action(uuid,text,jsonb)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated users can call the inventory gateway'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.multibusiness_inventory_action(uuid,text,jsonb)'::regprocedure,
    'EXECUTE'
  ),
  'anonymous users cannot call the inventory gateway'
);

SELECT ok(
  (
    SELECT prosrc LIKE '%multibusiness_requested_business_id%'
      FROM pg_proc
     WHERE oid = 'private.multibusiness_assign_inventory_scope()'::regprocedure
  ),
  'new inventory rows receive the selected business context'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%multibusiness_requested_business_id%'
      FROM pg_proc
     WHERE oid = 'private.multibusiness_assign_receipt_scope()'::regprocedure
  ),
  'new receipts receive the selected business context'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%multibusiness_requested_business_id%'
      FROM pg_proc
     WHERE oid = 'private.multibusiness_can_view_business(uuid)'::regprocedure
  ),
  'inventory RLS can narrow visible rows to the selected business'
);

SELECT ok(
  to_regprocedure('private.multibusiness_inventory_write_context(uuid)') IS NOT NULL,
  'inventory writes have a dedicated context guard'
);
SELECT ok(
  (
    SELECT with_check LIKE '%multibusiness_inventory_write_context%'
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'inventory_items'
       AND policyname = 'multibusiness_inventory_items_manage'
  ),
  'new inventory items require the selected business context'
);
SELECT ok(
  (
    SELECT with_check LIKE '%multibusiness_inventory_write_context%'
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'inventory_counts'
       AND policyname = 'multibusiness_inventory_counts_insert'
  ),
  'new inventory counts require the selected business context'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.delete_inventory_item_permanently(uuid,text)'::regprocedure,
    'EXECUTE'
  ),
  'the destructive public delete RPC is not an alternate entry point'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%business.manage_inventory%'
      FROM pg_proc
     WHERE oid = 'public.multibusiness_inventory_action(uuid,text,jsonb)'::regprocedure
  ),
  'the gateway checks the inventory capability'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%set_config%'
      FROM pg_proc
     WHERE oid = 'public.multibusiness_inventory_action(uuid,text,jsonb)'::regprocedure
  ),
  'the gateway scopes old procedures transactionally'
);

SELECT * FROM finish();

ROLLBACK;
