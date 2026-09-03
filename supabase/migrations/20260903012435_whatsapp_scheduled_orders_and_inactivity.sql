-- Pedidos programados para el mismo día y seguimiento de inactividad del bot.
-- Los campos son opcionales para conservar el comportamiento actual de pedidos inmediatos.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS kitchen_release_at timestamptz,
  ADD COLUMN IF NOT EXISTS kitchen_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS schedule_status text NOT NULL DEFAULT 'none';

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_schedule_status_check,
  ADD CONSTRAINT orders_schedule_status_check
    CHECK (schedule_status IN ('none', 'scheduled', 'released'));

CREATE INDEX IF NOT EXISTS orders_scheduled_release_idx
  ON public.orders(kitchen_release_at)
  WHERE source_channel = 'whatsapp'
    AND schedule_status = 'scheduled'
    AND kitchen_released_at IS NULL;

ALTER TABLE public.channel_conversations
  ADD COLUMN IF NOT EXISTS inactivity_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS inactivity_deadline_at timestamptz;

UPDATE public.whatsapp_channel_settings
SET create_orders_enabled = true,
    updated_at = now()
WHERE id = 1;

CREATE INDEX IF NOT EXISTS channel_conversations_inactivity_idx
  ON public.channel_conversations(last_inbound_at, inactivity_reminder_sent_at)
  WHERE provider = 'meta'
    AND bot_enabled
    AND status = 'active';

-- Envuelve la creación existente en una operación atómica para que la hora
-- solicitada y la liberación a cocina se guarden junto con el pedido.
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
SECURITY INVOKER
SET search_path = public
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
  SET total = v_order.total,
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
