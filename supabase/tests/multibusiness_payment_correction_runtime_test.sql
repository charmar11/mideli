-- Structural checks for business-scoped payment method corrections.

BEGIN;

SELECT plan(8);

SELECT ok(
  to_regprocedure('public.multibusiness_payment_correction_action(uuid,text,jsonb)') IS NOT NULL,
  'payment correction gateway exists'
);
SELECT ok(
  (
    SELECT prosecdef
      FROM pg_proc
     WHERE oid = 'public.multibusiness_payment_correction_action(uuid,text,jsonb)'::regprocedure
  ),
  'payment correction gateway owns its authorization boundary'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.multibusiness_payment_correction_action(uuid,text,jsonb)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated users can call the correction gateway'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.multibusiness_payment_correction_action(uuid,text,jsonb)'::regprocedure,
    'EXECUTE'
  ),
  'anonymous users cannot call the correction gateway'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.correct_payment_tender_method(uuid,public.payment_method,text,uuid)'::regprocedure,
    'EXECUTE'
  ),
  'the legacy correction wrapper is closed'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.authorize_payment_method_correction(uuid,uuid,text,uuid)'::regprocedure,
    'EXECUTE'
  ),
  'the legacy authorization wrapper is closed'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%v_tender_business_id%'
      AND prosrc LIKE '%p_business_id%'
      AND prosrc LIKE '%multibusiness_has_capability%'
      FROM pg_proc
     WHERE oid = 'public.multibusiness_payment_correction_action(uuid,text,jsonb)'::regprocedure
  ),
  'the gateway validates payment ownership and capability'
);
SELECT ok(
  (
    SELECT prosrc LIKE '%mideli.business_id%'
      FROM pg_proc
     WHERE oid = 'public.multibusiness_payment_correction_action(uuid,text,jsonb)'::regprocedure
  ),
  'correction implementation receives a transaction-local business context'
);

SELECT * FROM finish();

ROLLBACK;
