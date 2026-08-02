-- Operators use audited RPCs. Direct table mutations remain administrative.

CREATE INDEX IF NOT EXISTS inventory_movements_created_by_idx
  ON public.inventory_movements(created_by);
CREATE INDEX IF NOT EXISTS inventory_counts_completed_by_idx
  ON public.inventory_counts(completed_by);
CREATE INDEX IF NOT EXISTS inventory_counts_reviewed_by_idx
  ON public.inventory_counts(reviewed_by);

ALTER POLICY "Inventory items updatable by admins" ON public.inventory_items
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER POLICY "Inventory movements created by admins" ON public.inventory_movements
  WITH CHECK (
    public.is_admin()
    AND created_by = (SELECT auth.uid())
  );

ALTER POLICY "Inventory counts created by operators" ON public.inventory_counts
  WITH CHECK (
    public.is_admin()
    AND started_by = (SELECT auth.uid())
  );
ALTER POLICY "Inventory counts updated by operators" ON public.inventory_counts
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
ALTER POLICY "Inventory count lines managed by operators" ON public.inventory_count_lines
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER POLICY "Purchase orders created by operators" ON public.inventory_purchase_orders
  WITH CHECK (
    public.is_admin()
    AND created_by = (SELECT auth.uid())
  );
ALTER POLICY "Purchase orders updated by operators" ON public.inventory_purchase_orders
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
ALTER POLICY "Purchase order lines managed by operators" ON public.inventory_purchase_order_lines
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER POLICY "Receipts created by operators" ON public.inventory_receipts
  WITH CHECK (
    public.is_admin()
    AND received_by = (SELECT auth.uid())
  );
ALTER POLICY "Receipt lines created by operators" ON public.inventory_receipt_lines
  WITH CHECK (public.is_admin());
ALTER POLICY "Inventory lots managed by operators" ON public.inventory_lots
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER FUNCTION public.start_inventory_count(text) SECURITY DEFINER;
ALTER FUNCTION public.start_inventory_count(text) SET search_path TO '';
ALTER FUNCTION public.complete_inventory_count(uuid, jsonb, text) SECURITY DEFINER;
ALTER FUNCTION public.complete_inventory_count(uuid, jsonb, text) SET search_path TO '';
ALTER FUNCTION public.review_inventory_count(uuid) SECURITY DEFINER;
ALTER FUNCTION public.review_inventory_count(uuid) SET search_path TO '';
ALTER FUNCTION public.create_inventory_purchase_order(text, jsonb, text, timestamptz) SECURITY DEFINER;
ALTER FUNCTION public.create_inventory_purchase_order(text, jsonb, text, timestamptz) SET search_path TO '';
ALTER FUNCTION public.receive_inventory(uuid, text, jsonb, text) SECURITY DEFINER;
ALTER FUNCTION public.receive_inventory(uuid, text, jsonb, text) SET search_path TO '';

CREATE OR REPLACE FUNCTION public.record_inventory_movement(
  p_inventory_item_id uuid,
  p_quantity_change numeric,
  p_movement_type text,
  p_reason_code text DEFAULT '',
  p_note text DEFAULT ''
)
RETURNS public.inventory_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_item public.inventory_items%ROWTYPE;
  movement public.inventory_movements%ROWTYPE;
  next_stock numeric(12,3);
  caller_role text;
BEGIN
  caller_role := public.get_user_role();
  IF caller_role NOT IN ('owner', 'admin', 'kitchen', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para modificar inventario';
  END IF;

  IF p_quantity_change = 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser diferente de cero';
  END IF;

  IF p_movement_type NOT IN (
    'purchase', 'adjustment', 'waste', 'internal_use', 'damage', 'expired'
  ) THEN
    RAISE EXCEPTION 'Tipo de movimiento no permitido';
  END IF;

  IF p_movement_type IN ('waste', 'internal_use', 'damage', 'expired')
    AND p_quantity_change >= 0
  THEN
    RAISE EXCEPTION 'Las salidas deben usar una cantidad negativa';
  END IF;

  IF p_movement_type = 'purchase' AND p_quantity_change <= 0 THEN
    RAISE EXCEPTION 'Las entradas deben usar una cantidad positiva';
  END IF;

  IF caller_role IN ('kitchen', 'supervisor')
    AND p_movement_type IN ('purchase', 'adjustment')
  THEN
    RAISE EXCEPTION 'Usa Recibir o Conteo para modificar esta existencia';
  END IF;

  SELECT * INTO current_item
  FROM public.inventory_items
  WHERE id = p_inventory_item_id AND is_active
  FOR UPDATE;

  IF current_item.id IS NULL THEN
    RAISE EXCEPTION 'Insumo no encontrado';
  END IF;

  next_stock := current_item.current_stock + p_quantity_change;
  IF next_stock < 0 THEN
    RAISE EXCEPTION 'La existencia no puede quedar en negativo';
  END IF;

  UPDATE public.inventory_items
  SET current_stock = next_stock,
      updated_at = now()
  WHERE id = current_item.id;

  INSERT INTO public.inventory_movements (
    inventory_item_id,
    movement_type,
    quantity_change,
    note,
    created_by,
    previous_stock,
    resulting_stock,
    reason_code
  ) VALUES (
    current_item.id,
    p_movement_type,
    p_quantity_change,
    COALESCE(p_note, ''),
    (SELECT auth.uid()),
    current_item.current_stock,
    next_stock,
    COALESCE(p_reason_code, '')
  )
  RETURNING * INTO movement;

  RETURN movement;
END;
$$;

REVOKE ALL ON FUNCTION public.record_inventory_movement(uuid, numeric, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_inventory_movement(uuid, numeric, text, text, text)
  TO authenticated;
