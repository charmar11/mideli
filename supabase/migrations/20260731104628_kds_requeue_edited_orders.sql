CREATE OR REPLACE FUNCTION public.update_order_with_items(
  p_order_id uuid,
  p_items jsonb,
  p_total integer,
  p_table_number text DEFAULT NULL,
  p_table_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_order public.orders%ROWTYPE;
BEGIN
  IF public.get_user_role() NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para editar pedidos';
  END IF;

  SELECT *
  INTO current_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF current_order.id IS NULL THEN
    RAISE EXCEPTION 'Pedido no encontrado';
  END IF;

  IF current_order.status IN ('paid', 'cancelled') THEN
    RAISE EXCEPTION 'Este pedido ya no se puede editar';
  END IF;

  UPDATE public.orders
  SET total = p_total,
      status = CASE
        WHEN current_order.status IN ('ready', 'served') THEN 'pending'::public.order_status
        ELSE current_order.status
      END,
      table_number = p_table_number,
      table_id = p_table_id,
      customer_name = p_customer_name,
      updated_at = now()
  WHERE id = p_order_id;

  DELETE FROM public.order_items
  WHERE order_id = p_order_id;

  INSERT INTO public.order_items (
    order_id,
    menu_item_id,
    quantity,
    unit_price,
    notes,
    selected_modifiers
  )
  SELECT
    p_order_id,
    (item->>'menu_item_id')::uuid,
    COALESCE((item->>'quantity')::integer, 1),
    COALESCE((item->>'unit_price')::integer, 0),
    COALESCE(item->>'notes', ''),
    COALESCE(item->'selected_modifiers', '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS item;
END;
$$;
