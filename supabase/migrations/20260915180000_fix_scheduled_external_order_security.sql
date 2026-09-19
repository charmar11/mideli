-- El wrapper de pedidos programados consulta private.request_jwt_role().
-- Debe ejecutarse con privilegios del servidor para que el RPC de WhatsApp
-- no falle antes de crear el pedido.

ALTER FUNCTION public.create_scheduled_external_order_from_channel(
  text, uuid, jsonb, text, text, text, text, text, text, integer, text, integer, timestamptz, timestamptz
)
  SECURITY DEFINER;

ALTER FUNCTION public.create_scheduled_external_order_from_channel(
  text, uuid, jsonb, text, text, text, text, text, text, integer, text, integer, timestamptz, timestamptz
)
  SET search_path = '';

REVOKE ALL ON FUNCTION public.create_scheduled_external_order_from_channel(
  text, uuid, jsonb, text, text, text, text, text, text, integer, text, integer, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_scheduled_external_order_from_channel(
  text, uuid, jsonb, text, text, text, text, text, text, integer, text, integer, timestamptz, timestamptz
) TO service_role;
