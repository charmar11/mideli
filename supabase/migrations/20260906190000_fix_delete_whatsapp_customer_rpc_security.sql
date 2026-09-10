-- La envoltura pública necesita ejecutar la función privada con sus privilegios
-- para no exponer el esquema private al rol service_role.
CREATE OR REPLACE FUNCTION public.delete_whatsapp_customer(
  p_customer_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.delete_whatsapp_customer(p_customer_id, p_actor_id);
$$;

REVOKE ALL ON FUNCTION public.delete_whatsapp_customer(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_whatsapp_customer(uuid, uuid)
  TO service_role;
