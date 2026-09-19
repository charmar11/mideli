-- Gate de migración: seguridad, aislamiento y precondiciones de operación.
-- No crea datos reales. Se puede ejecutar en la base efímera de CI.

BEGIN;

SELECT plan(22);

SELECT ok(
  NOT EXISTS (
    SELECT 1
      FROM pg_class
     WHERE relname = 'cash_shifts_single_open_idx'
       AND relnamespace = 'public'::regnamespace
  ),
  'la regla global de una sola caja abierta fue retirada'
);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_class
     WHERE relname = 'cash_shifts_open_per_business_idx'
       AND relnamespace = 'public'::regnamespace
       AND relkind = 'i'
  ),
  'cada negocio puede tener una caja abierta independiente'
);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_class
     WHERE relname = 'cash_shifts_open_legacy_idx'
       AND relnamespace = 'public'::regnamespace
       AND relkind = 'i'
  ),
  'el fallback legado conserva una sola caja sin negocio'
);

SELECT ok(
  to_regprocedure('private.multibusiness_validate_batch_business()') IS NOT NULL,
  'la comanda mixta tiene una validación de negocio y caja'
);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgrelid = 'public.orders'::regclass
       AND tgname = 'orders_validate_batch_business'
       AND NOT tgisinternal
  ),
  'la validación de negocio y caja corre antes de insertar la comanda'
);

SELECT ok(
  pg_get_functiondef(
    'private.multibusiness_validate_batch_business()'::regprocedure
  ) LIKE '%business_status <> ''active''%',
  'una comanda no puede apuntar a un negocio pausado o archivado'
);

SELECT ok(
  pg_get_functiondef(
    'private.multibusiness_validate_batch_business()'::regprocedure
  ) LIKE '%shift.status = ''open''%',
  'una comanda exige una caja abierta del negocio'
);

SELECT ok(
  pg_get_functiondef(
    'private.multibusiness_can_view_business(uuid)'::regprocedure
  ) LIKE '%business.lifecycle_status NOT IN%',
  'la visibilidad de negocios excluye archivados y retirados'
);

SELECT ok(
  pg_get_functiondef(
    'private.multibusiness_can_view_organization(uuid)'::regprocedure
  ) LIKE '%organization.lifecycle_status <> ''retired''%',
  'la visibilidad de organizaciones excluye retiradas'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.get_user_role()', 'EXECUTE'),
  'anon no puede consultar el rol interno'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.get_user_role()', 'EXECUTE'),
  'authenticated conserva el helper interno de rol'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.is_admin()', 'EXECUTE'),
  'anon no puede invocar el helper de administración'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE'),
  'authenticated conserva el helper de administración'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.set_order_created_by()', 'EXECUTE'),
  'anon no puede invocar la función de trigger de pedidos'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.set_order_created_by()', 'EXECUTE'),
  'authenticated no puede invocar directamente la función de trigger'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_multibusiness_table_orders(uuid,uuid,text,jsonb,text,text)',
    'EXECUTE'
  ),
  'anon no puede crear comandas mixtas'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.create_multibusiness_table_orders(uuid,uuid,text,jsonb,text,text)',
    'EXECUTE'
  ),
  'authenticated puede crear comandas mixtas'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
      FROM public.orders AS order_row
      JOIN public.businesses AS business
        ON business.id = order_row.business_id
     WHERE order_row.business_id IS NOT NULL
       AND business.lifecycle_status IN ('archived', 'retired')
  ),
  'no hay pedidos ligados a negocios archivados o retirados'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
      FROM public.orders AS order_row
      JOIN public.table_visits AS visit
        ON visit.id = order_row.table_visit_id
     WHERE order_row.table_visit_id IS NOT NULL
       AND order_row.business_id IS NOT NULL
       AND visit.organization_id IS DISTINCT FROM (
         SELECT business.organization_id
           FROM public.businesses AS business
          WHERE business.id = order_row.business_id
       )
  ),
  'los pedidos y las visitas de mesa no cruzan organizaciones'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
      FROM public.orders AS order_row
      JOIN public.business_accounts AS account
        ON account.id = order_row.business_account_id
     WHERE order_row.business_account_id IS NOT NULL
       AND order_row.business_id IS DISTINCT FROM account.business_id
  ),
  'los pedidos y las cuentas por negocio mantienen el mismo negocio'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
      FROM public.payment_order_allocations AS allocation
      JOIN public.orders AS order_row
        ON order_row.id = allocation.order_id
     WHERE allocation.business_id IS NOT NULL
       AND allocation.business_id IS DISTINCT FROM order_row.business_id
  ),
  'los cobros no cruzan el negocio del pedido'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
      FROM public.cash_shifts AS shift
     WHERE shift.status = 'open'
     GROUP BY shift.business_id
    HAVING count(*) > 1
  ),
  'no hay más de una caja abierta por negocio'
);

SELECT * FROM finish();

ROLLBACK;
