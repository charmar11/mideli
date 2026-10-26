-- Separate permission to open the Kitchen display from permission to move
-- orders through preparation. New businesses can run the workflow from
-- Mesero -> Estado without enabling a dedicated KDS screen.

INSERT INTO public.capabilities (code, scope_type, description)
VALUES (
  'business.access_kitchen',
  'business',
  'Abrir la pantalla de Cocina independiente del permiso para cambiar estados'
)
ON CONFLICT (code) DO UPDATE
SET scope_type = EXCLUDED.scope_type,
    description = EXCLUDED.description,
    is_active = true,
    updated_at = now();

UPDATE public.capabilities
   SET description = 'Iniciar preparación y marcar listos desde Mesero o la pantalla Cocina',
       updated_at = now()
 WHERE code = 'business.update_preparation';

CREATE OR REPLACE FUNCTION private.business_staff_delegable_capability_codes()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    'business.operate_orders',
    'business.charge_orders',
    'business.update_preparation',
    'business.access_kitchen',
    'business.open_cash',
    'business.close_cash',
    'business.manage_catalog',
    'business.manage_inventory',
    'business.manage_staff'
  ]::text[];
$$;

-- Keep the integrated role useful for a no-KDS business: it can operate the
-- order lifecycle through Estado, but does not expose the separate KDS screen
-- unless a responsible owner explicitly includes that capability in a role.
CREATE OR REPLACE FUNCTION private.seed_business_staff_roles(
  p_business_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role record;
  v_role_id uuid;
  v_capability_code text;
BEGIN
  FOR v_role IN
    SELECT *
      FROM (VALUES
        ('local_waiter', 'Mesero', 'Toma pedidos y registra cobros.', ARRAY['business.operate_orders', 'business.charge_orders']::text[]),
        ('local_kitchen', 'Cocina', 'Inicia preparación y marca pedidos listos desde Estado.', ARRAY['business.update_preparation']::text[]),
        ('local_supervisor', 'Supervisor', 'Opera pedidos, cobros y preparación desde Estado.', ARRAY['business.operate_orders', 'business.charge_orders', 'business.update_preparation']::text[]),
        ('cash_open', 'Caja · apertura', 'Puede abrir la caja de este negocio.', ARRAY['business.open_cash']::text[]),
        ('cash_close', 'Caja · cierre', 'Puede cerrar la caja de este negocio.', ARRAY['business.close_cash']::text[]),
        ('cash_operator', 'Caja operativa', 'Puede abrir y cerrar la caja de este negocio.', ARRAY['business.open_cash', 'business.close_cash']::text[])
      ) AS roles(system_code, name, description, capability_codes)
  LOOP
    INSERT INTO public.business_staff_roles (
      business_id, role_key, name, description, is_system, system_code
    ) VALUES (
      p_business_id,
      'system:' || v_role.system_code,
      v_role.name,
      v_role.description,
      true,
      v_role.system_code
    )
    ON CONFLICT (business_id, role_key) DO UPDATE
      SET name = EXCLUDED.name,
          description = EXCLUDED.description,
          is_active = true,
          archived_at = NULL
    RETURNING id INTO v_role_id;

    FOREACH v_capability_code IN ARRAY v_role.capability_codes
    LOOP
      INSERT INTO public.business_staff_role_capabilities (
        business_id, role_id, capability_code
      ) VALUES (p_business_id, v_role_id, v_capability_code)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;
