-- orders.total es el subtotal operativo de Mideli para pedidos con repartidor
-- externo. La tarifa permanece en delivery_fee y se informa al cliente.

CREATE OR REPLACE FUNCTION public.create_scheduled_external_order_from_channel(
  p_external_order_id text,
  p_conversation_id uuid,
  p_items jsonb,
  p_order_type text,
  p_customer_phone text,
  p_customer_name text DEFAULT '',
  p_delivery_address text DEFAULT '',
  p_delivery_reference text DEFAULT '',
  p_notes text DEFAULT '',
  p_delivery_fee integer DEFAULT 0,
  p_payment_method text DEFAULT NULL,
  p_cash_tendered integer DEFAULT NULL,
  p_scheduled_for timestamptz DEFAULT NULL,
  p_kitchen_release_at timestamptz DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF private.request_jwt_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Esta operación solo está disponible para el servidor';
  END IF;

  IF (p_scheduled_for IS NULL) <> (p_kitchen_release_at IS NULL) THEN
    RAISE EXCEPTION 'La programación del pedido está incompleta';
  END IF;

  v_order := public.create_external_order_from_channel(
    p_external_order_id,
    p_conversation_id,
    p_items,
    p_order_type,
    p_customer_phone,
    p_customer_name,
    p_delivery_address,
    p_delivery_reference,
    p_notes,
    p_delivery_fee,
    p_payment_method,
    p_cash_tendered
  );

  UPDATE public.orders
  SET total = GREATEST(v_order.total - COALESCE(p_delivery_fee, 0), 0),
      scheduled_for = p_scheduled_for,
      kitchen_release_at = p_kitchen_release_at,
      schedule_status = CASE WHEN p_scheduled_for IS NULL THEN 'none' ELSE 'scheduled' END
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.create_scheduled_external_order_from_channel(
  text, uuid, jsonb, text, text, text, text, text, text, integer, text, integer, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_scheduled_external_order_from_channel(
  text, uuid, jsonb, text, text, text, text, text, text, integer, text, integer, timestamptz, timestamptz
) TO service_role;
