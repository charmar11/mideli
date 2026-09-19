-- Stable capability catalog for the multibusiness foundation.
-- No organizations, businesses or real user memberships are seeded here.

INSERT INTO public.capabilities (code, scope_type, description)
VALUES
  (
    'platform.manage_businesses',
    'platform',
    'Crear, activar, pausar, archivar y retirar organizaciones y negocios'
  ),
  (
    'organization.manage_global_waiters',
    'organization',
    'Crear, activar y desactivar meseras globales de la organización'
  ),
  (
    'organization.manage_tables',
    'organization',
    'Administrar zonas, mesas y el plano compartido de la organización'
  ),
  (
    'business.manage_staff',
    'business',
    'Administrar personal local y sus permisos dentro del negocio'
  ),
  (
    'business.manage_catalog',
    'business',
    'Administrar categorías, productos, precios y variaciones del negocio'
  ),
  (
    'business.manage_inventory',
    'business',
    'Administrar insumos, recetas, existencias y movimientos del negocio'
  ),
  (
    'business.operate_orders',
    'business',
    'Crear y operar pedidos del negocio'
  ),
  (
    'business.update_preparation',
    'business',
    'Actualizar los estados de preparación de los pedidos del negocio'
  ),
  (
    'business.charge_orders',
    'business',
    'Cobrar pedidos y registrar pagos del negocio'
  ),
  (
    'business.manage_cash',
    'business',
    'Abrir, operar, ajustar y cerrar la caja del negocio'
  )
ON CONFLICT (code) DO UPDATE
SET
  scope_type = EXCLUDED.scope_type,
  description = EXCLUDED.description,
  updated_at = now();
