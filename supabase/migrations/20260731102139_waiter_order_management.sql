-- Allow POS staff to permanently remove a mistaken order from the open workflow.
-- The UI always asks for confirmation before calling this policy.
CREATE POLICY "Orders deleted by staff" ON public.orders
  FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('owner', 'admin', 'waiter', 'supervisor'));

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

CREATE OR REPLACE FUNCTION public.mark_orders_paid(
  p_order_ids uuid[],
  p_payment_method public.payment_method,
  p_cash_received integer DEFAULT NULL,
  p_change_given integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_order_ids IS NULL OR cardinality(p_order_ids) = 0 THEN
    RAISE EXCEPTION 'No hay pedidos para cobrar';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orders
    WHERE id = ANY(p_order_ids)
      AND status = 'cancelled'
  ) THEN
    RAISE EXCEPTION 'La cuenta contiene un pedido cancelado';
  END IF;

  UPDATE public.orders
  SET status = 'paid',
      payment_method = p_payment_method,
      cash_received = p_cash_received,
      change_given = p_change_given,
      paid_at = now(),
      updated_at = now()
  WHERE id = ANY(p_order_ids)
    AND status <> 'paid';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo registrar el pago';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_order_with_items(uuid, jsonb, integer, text, uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_orders_paid(uuid[], public.payment_method, integer, integer)
  TO authenticated;
