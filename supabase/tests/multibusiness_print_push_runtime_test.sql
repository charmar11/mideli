-- Structural checks for business-scoped printing and operational Push events.

BEGIN;

SELECT plan(16);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'print_jobs'
       AND column_name = 'business_id'
  ),
  'print jobs carry a business boundary'
);
SELECT ok(
  EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'push_notification_events'
       AND column_name = 'business_id'
  ),
  'push events carry a business boundary'
);
SELECT ok(
  to_regprocedure('public.claim_next_print_job(text,uuid)') IS NOT NULL,
  'print claim gateway requires a business'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%multibusiness_mideli_business_id%'
      AND prosrc LIKE '%claim_next_print_job(p_device_id, mideli_business_id)%'
      FROM pg_proc
     WHERE oid = 'public.claim_next_print_job(text)'::regprocedure
  ),
  'legacy printer claim is restricted to Mideli during rollout'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.claim_next_print_job(text,uuid)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated operators can claim a scoped print job'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%business.update_preparation%'
      AND prosrc LIKE '%p_business_id%'
      FROM pg_proc
     WHERE oid = 'public.claim_next_print_job(text,uuid)'::regprocedure
  ),
  'print claim checks the selected business capability'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%business_id = p_business_id%'
      FROM pg_proc
     WHERE oid = 'public.claim_next_print_job(text,uuid)'::regprocedure
  ),
  'print claim filters its queue by business'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%v_business_id%'
      AND prosrc LIKE '%multibusiness_has_capability%'
      FROM pg_proc
     WHERE oid = 'public.finish_print_job(uuid,text,boolean,text)'::regprocedure
  ),
  'finishing a print job rechecks its business capability'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%v_business_id%'
      AND prosrc LIKE '%business.manage_catalog%'
      FROM pg_proc
     WHERE oid = 'public.requeue_print_job(uuid)'::regprocedure
  ),
  'requeueing a print job is scoped to its business'
);
SELECT ok(
  to_regprocedure('public.claim_push_notification_event(text,uuid,text,uuid,uuid)') IS NOT NULL,
  'push event claim accepts the order business'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.claim_push_notification_event(text,uuid,text,uuid,uuid)'::regprocedure,
    'EXECUTE'
  ),
  'only the notification worker can claim scoped push events'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.claim_push_notification_event(text,uuid,text,uuid,uuid)'::regprocedure,
    'EXECUTE'
  ),
  'staff cannot claim push delivery events directly'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%order_business_id%'
      AND prosrc LIKE '%business_id%'
      FROM pg_proc
     WHERE oid = 'public.claim_push_notification_event(text,uuid,text,uuid,uuid)'::regprocedure
  ),
  'push event claim validates order ownership'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%NEW.business_id%'
      AND prosrc LIKE '%business.slug = ''mideli''%'
      FROM pg_proc
     WHERE oid = 'private.enqueue_kitchen_print_job()'::regprocedure
  ),
  'the current printer only enqueues Mideli orders'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%business.update_preparation%'
      AND prosrc LIKE '%business.operate_orders%'
      FROM pg_proc
     WHERE oid = 'public.claim_next_print_job(text,uuid)'::regprocedure
  ),
  'printing supports local preparation and business operations staff'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%p_business_id%'
      FROM pg_proc
     WHERE oid = 'public.claim_push_notification_event(text,uuid,text,uuid,uuid)'::regprocedure
  ),
  'push claim stores the requested business boundary'
);

SELECT * FROM finish();

ROLLBACK;
