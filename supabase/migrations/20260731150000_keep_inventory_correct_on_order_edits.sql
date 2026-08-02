-- Keep recipe-based stock correct when an open order is edited or cancelled.

DROP INDEX IF EXISTS public.inventory_returns_unique;

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
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_order public.orders%ROWTYPE;
  consumed record;
  previous_stock numeric(12,3);
  returned_stock numeric(12,3);
BEGIN
  IF public.get_user_role() NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para editar pedidos';
  END IF;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'El pedido debe contener al menos un producto';
  END IF;

  IF p_total < 0 THEN
    RAISE EXCEPTION 'El total del pedido no es válido';
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

  FOR consumed IN
    SELECT
      movement.inventory_item_id,
      movement.order_item_id,
      ABS(SUM(movement.quantity_change))::numeric(12,3) AS quantity_to_return
    FROM public.inventory_movements movement
    JOIN public.order_items order_item ON order_item.id = movement.order_item_id
    WHERE order_item.order_id = p_order_id
      AND movement.movement_type = 'consumption'
    GROUP BY movement.inventory_item_id, movement.order_item_id
  LOOP
    SELECT current_stock INTO previous_stock
    FROM public.inventory_items
    WHERE id = consumed.inventory_item_id
    FOR UPDATE;

    IF previous_stock IS NOT NULL AND consumed.quantity_to_return > 0 THEN
      returned_stock := previous_stock + consumed.quantity_to_return;

      UPDATE public.inventory_items
      SET current_stock = returned_stock,
          updated_at = now()
      WHERE id = consumed.inventory_item_id;

      INSERT INTO public.inventory_movements (
        inventory_item_id,
        order_id,
        order_item_id,
        movement_type,
        quantity_change,
        note,
        created_by,
        previous_stock,
        resulting_stock,
        reason_code
      ) VALUES (
        consumed.inventory_item_id,
        p_order_id,
        consumed.order_item_id,
        'return',
        consumed.quantity_to_return,
        'Reposición antes de editar pedido',
        (SELECT auth.uid()),
        previous_stock,
        returned_stock,
        'order_edited'
      );
    END IF;
  END LOOP;

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
  FROM jsonb_array_elements(p_items) AS item;
END;
$$;

CREATE OR REPLACE FUNCTION private.return_inventory_for_cancelled_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  consumed record;
  delta numeric(12,3);
  previous_stock numeric(12,3);
  returned_stock numeric(12,3);
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    FOR consumed IN
      SELECT
        inventory_item_id,
        SUM(quantity_change)::numeric(12,3) AS net_change
      FROM public.inventory_movements
      WHERE order_id = NEW.id
        AND movement_type IN ('consumption', 'return')
      GROUP BY inventory_item_id
      HAVING SUM(quantity_change) < 0
    LOOP
      delta := -consumed.net_change;

      SELECT current_stock INTO previous_stock
      FROM public.inventory_items
      WHERE id = consumed.inventory_item_id
      FOR UPDATE;

      IF previous_stock IS NOT NULL AND delta > 0 THEN
        returned_stock := previous_stock + delta;

        UPDATE public.inventory_items
        SET current_stock = returned_stock,
            updated_at = now()
        WHERE id = consumed.inventory_item_id;

        INSERT INTO public.inventory_movements (
          inventory_item_id,
          order_id,
          movement_type,
          quantity_change,
          note,
          created_by,
          previous_stock,
          resulting_stock,
          reason_code
        ) VALUES (
          consumed.inventory_item_id,
          NEW.id,
          'return',
          delta,
          'Reposición por cancelación',
          (SELECT auth.uid()),
          previous_stock,
          returned_stock,
          'order_cancelled'
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.update_order_with_items(uuid, jsonb, integer, text, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_order_with_items(uuid, jsonb, integer, text, uuid, text)
  TO authenticated;
REVOKE ALL ON FUNCTION private.return_inventory_for_cancelled_order() FROM PUBLIC;
