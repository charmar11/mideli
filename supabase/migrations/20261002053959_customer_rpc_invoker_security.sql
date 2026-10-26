BEGIN;

ALTER FUNCTION public.create_multibusiness_table_orders_with_customers(
  uuid, uuid, text, jsonb, text, text, text, jsonb
) SECURITY INVOKER;

COMMIT;
