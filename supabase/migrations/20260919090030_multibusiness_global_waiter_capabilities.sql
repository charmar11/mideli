-- Capabilities inherited by global waiters across every business in the
-- organization. They are separate from local business permissions so a
-- business owner cannot accidentally grant organization-wide access.

INSERT INTO public.capabilities (code, scope_type, description)
VALUES
  (
    'organization.operate_orders',
    'organization',
    'Crear y operar pedidos de todos los negocios de la organización'
  ),
  (
    'organization.charge_orders',
    'organization',
    'Cobrar pedidos de todos los negocios de la organización'
  )
ON CONFLICT (code) DO UPDATE
SET
  scope_type = EXCLUDED.scope_type,
  description = EXCLUDED.description,
  updated_at = now();
