-- Eliminación administrativa segura de un cliente del canal de WhatsApp.
-- Los pedidos históricos se conservan y se desvinculan por sus FKs SET NULL.

CREATE OR REPLACE FUNCTION private.delete_whatsapp_customer(
  p_customer_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  customer_row public.customers%ROWTYPE;
  active_order_numbers text[] := ARRAY[]::text[];
  address_count integer := 0;
  conversation_count integer := 0;
  message_count integer := 0;
  order_count integer := 0;
BEGIN
  IF private.request_jwt_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Esta operación solo está disponible para el servidor';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_actor_id
      AND is_active
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Solo el propietario o un administrador puede eliminar clientes';
  END IF;

  SELECT * INTO customer_row
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF customer_row.id IS NULL THEN
    RAISE EXCEPTION 'El cliente ya no existe';
  END IF;

  SELECT COALESCE(array_agg(order_row.number::text ORDER BY order_row.number), ARRAY[]::text[])
  INTO active_order_numbers
  FROM public.orders AS order_row
  WHERE order_row.customer_id = customer_row.id
    AND (
      order_row.status NOT IN ('paid', 'cancelled')
      OR (
        order_row.type = 'domicilio'
        AND order_row.delivery_status <> 'customer_received'
      )
    );

  IF cardinality(active_order_numbers) > 0 THEN
    RAISE EXCEPTION 'No se puede eliminar este cliente porque tiene pedidos activos: %',
      array_to_string(active_order_numbers, ', ');
  END IF;

  SELECT count(*)::integer INTO address_count
  FROM public.customer_addresses
  WHERE customer_id = customer_row.id;

  SELECT count(*)::integer INTO conversation_count
  FROM public.channel_conversations
  WHERE customer_id = customer_row.id;

  SELECT count(*)::integer INTO message_count
  FROM public.channel_messages AS message_row
  JOIN public.channel_conversations AS conversation_row
    ON conversation_row.id = message_row.conversation_id
  WHERE conversation_row.customer_id = customer_row.id;

  SELECT count(*)::integer INTO order_count
  FROM public.orders
  WHERE customer_id = customer_row.id;

  -- Las conversaciones eliminan en cascada mensajes, cotizaciones y eventos.
  -- Los pedidos conservan su información histórica mediante ON DELETE SET NULL.
  DELETE FROM public.channel_conversations
  WHERE customer_id = customer_row.id;

  DELETE FROM public.customer_addresses
  WHERE customer_id = customer_row.id;

  DELETE FROM public.customers
  WHERE id = customer_row.id;

  INSERT INTO public.whatsapp_admin_audit (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    p_actor_id,
    'delete_customer',
    'customer',
    customer_row.id::text,
    jsonb_build_object(
      'phone', customer_row.phone,
      'displayName', customer_row.display_name,
      'addressesDeleted', address_count,
      'conversationsDeleted', conversation_count,
      'messagesDeleted', message_count,
      'ordersPreserved', order_count
    )
  );

  RETURN jsonb_build_object(
    'id', customer_row.id,
    'displayName', customer_row.display_name,
    'phone', customer_row.phone,
    'addressesDeleted', address_count,
    'conversationsDeleted', conversation_count,
    'messagesDeleted', message_count,
    'ordersPreserved', order_count
  );
END;
$$;

REVOKE ALL ON FUNCTION private.delete_whatsapp_customer(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.delete_whatsapp_customer(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.delete_whatsapp_customer(
  p_customer_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.delete_whatsapp_customer(p_customer_id, p_actor_id);
$$;

REVOKE ALL ON FUNCTION public.delete_whatsapp_customer(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_whatsapp_customer(uuid, uuid)
  TO service_role;
