-- Keep the existing business order RPC unchanged for older clients. The POS
-- uses this wrapper so order lines and optional delivery/schedule data commit
-- together. A failed metadata update rolls back the whole RPC call.
CREATE FUNCTION public.create_business_order_with_details(
  p_business_id uuid,
  p_creation_key uuid,
  p_items jsonb,
  p_order_type text,
  p_notes text DEFAULT '',
  p_table_number text DEFAULT NULL,
  p_table_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_prior_id uuid;
  v_order public.orders%ROWTYPE;
  v_has_delivery boolean;
  v_has_schedule boolean;
  v_scheduled_for timestamptz;
  v_kitchen_release_at timestamptz;
BEGIN
  IF p_creation_key IS NULL THEN
    RAISE EXCEPTION 'Falta la clave del pedido';
  END IF;
  IF jsonb_typeof(COALESCE(p_details, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Los detalles del pedido no son válidos';
  END IF;
  IF p_details ? 'delivery'
     AND jsonb_typeof(p_details->'delivery') NOT IN ('object', 'null') THEN
    RAISE EXCEPTION 'Los datos de entrega no son válidos';
  END IF;
  IF p_details ? 'schedule'
     AND jsonb_typeof(p_details->'schedule') NOT IN ('object', 'null') THEN
    RAISE EXCEPTION 'La programación no es válida';
  END IF;

  v_has_delivery := jsonb_typeof(p_details->'delivery') = 'object';
  v_has_schedule := jsonb_typeof(p_details->'schedule') = 'object';
  IF v_has_delivery AND p_order_type IS DISTINCT FROM 'domicilio' THEN
    RAISE EXCEPTION 'La entrega sólo aplica a pedidos a domicilio';
  END IF;
  IF v_has_schedule THEN
    v_scheduled_for := NULLIF(p_details #>> '{schedule,scheduled_for}', '')::timestamptz;
    v_kitchen_release_at := NULLIF(p_details #>> '{schedule,kitchen_release_at}', '')::timestamptz;
    IF v_scheduled_for IS NULL OR v_kitchen_release_at IS NULL THEN
      RAISE EXCEPTION 'La programación del pedido está incompleta';
    END IF;
  END IF;

  -- Match the lock in create_business_order_with_items. Replays return the
  -- persisted order without overwriting later edits or kitchen release.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_creation_key::text, 406));
  SELECT id INTO v_prior_id
    FROM public.orders
   WHERE creation_key = p_creation_key
   FOR UPDATE;

  v_order := public.create_business_order_with_items(
    p_business_id, p_creation_key, p_items, p_order_type, p_notes,
    p_table_number, p_table_id, p_customer_name
  );
  IF v_prior_id IS NOT NULL OR p_details IS NULL OR p_details = '{}'::jsonb THEN
    RETURN v_order;
  END IF;

  UPDATE public.orders
     SET customer_id = NULLIF(p_details->>'customer_id', '')::uuid,
         customer_phone = CASE
           WHEN v_has_delivery THEN NULLIF(btrim(p_details #>> '{delivery,phone}'), '')
           ELSE NULLIF(btrim(p_details->>'customer_phone'), '')
         END,
         source_channel = CASE
           WHEN NULLIF(p_details->>'channel_conversation_id', '') IS NOT NULL
             THEN 'whatsapp'
           ELSE source_channel
         END,
         channel_conversation_id = NULLIF(p_details->>'channel_conversation_id', '')::uuid,
         whatsapp_status_opt_in = CASE WHEN v_has_delivery
           THEN COALESCE((p_details #>> '{delivery,whatsapp_status_opt_in}')::boolean, false)
           ELSE whatsapp_status_opt_in END,
         delivery_address = CASE WHEN v_has_delivery
           THEN btrim(COALESCE(p_details #>> '{delivery,address}', ''))
           ELSE delivery_address END,
         delivery_colony = CASE WHEN v_has_delivery
           THEN NULLIF(btrim(p_details #>> '{delivery,colony}'), '')
           ELSE delivery_colony END,
         delivery_reference = CASE WHEN v_has_delivery
           THEN NULLIF(btrim(p_details #>> '{delivery,reference}'), '')
           ELSE delivery_reference END,
         delivery_fee = CASE WHEN v_has_delivery
           THEN COALESCE((p_details #>> '{delivery,fee}')::integer, 0)
           ELSE delivery_fee END,
         delivery_distance_meters = CASE WHEN v_has_delivery
           THEN (p_details #>> '{delivery,distance_meters}')::integer
           ELSE delivery_distance_meters END,
         delivery_latitude = CASE WHEN v_has_delivery
           THEN (p_details #>> '{delivery,latitude}')::numeric
           ELSE delivery_latitude END,
         delivery_longitude = CASE WHEN v_has_delivery
           THEN (p_details #>> '{delivery,longitude}')::numeric
           ELSE delivery_longitude END,
         payment_method_requested = CASE WHEN v_has_delivery
           THEN NULLIF(p_details #>> '{delivery,payment_method}', '')
           ELSE payment_method_requested END,
         requested_cash_tendered = CASE WHEN v_has_delivery
           THEN (p_details #>> '{delivery,cash_tendered}')::integer
           ELSE requested_cash_tendered END,
         scheduled_for = CASE WHEN v_has_schedule THEN v_scheduled_for ELSE scheduled_for END,
         kitchen_release_at = CASE WHEN v_has_schedule THEN v_kitchen_release_at ELSE kitchen_release_at END,
         kitchen_released_at = CASE WHEN v_has_schedule THEN NULL ELSE kitchen_released_at END,
         schedule_status = CASE WHEN v_has_schedule THEN 'scheduled' ELSE schedule_status END,
         updated_at = now()
   WHERE id = v_order.id AND business_id = p_business_id
   RETURNING * INTO v_order;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudieron guardar los detalles del pedido';
  END IF;
  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.create_business_order_with_details(
  uuid, uuid, jsonb, text, text, text, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_order_with_details(
  uuid, uuid, jsonb, text, text, text, uuid, text, jsonb
) TO authenticated;
