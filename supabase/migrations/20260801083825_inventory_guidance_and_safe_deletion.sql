-- Recover empty inventory counts and add an explicit, guarded cleanup path
-- for archived inventory items created by mistake or during testing.

UPDATE public.inventory_counts AS count_record
SET status = 'cancelled',
    notes = CASE
      WHEN count_record.notes = '' THEN 'Conteo vacío cancelado automáticamente'
      ELSE count_record.notes
    END,
    updated_at = now()
WHERE count_record.status = 'draft'
  AND NOT EXISTS (
    SELECT 1
    FROM public.inventory_count_lines AS line
    WHERE line.count_id = count_record.id
  );

CREATE OR REPLACE FUNCTION public.start_inventory_count(p_scope text DEFAULT 'full')
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  count_id uuid;
  matching_items integer;
  existing_lines integer;
  caller_id uuid := (SELECT auth.uid());
  caller_role text := public.get_user_role();
BEGIN
  IF caller_id IS NULL OR caller_role NOT IN ('owner', 'admin', 'kitchen', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para contar inventario';
  END IF;

  IF p_scope NOT IN ('full', 'critical') THEN
    RAISE EXCEPTION 'Tipo de conteo inválido';
  END IF;

  SELECT count(*)::integer INTO matching_items
  FROM public.inventory_items AS item
  WHERE item.is_active
    AND (p_scope = 'full' OR item.current_stock <= item.minimum_stock);

  IF matching_items = 0 THEN
    IF p_scope = 'critical' AND EXISTS (
      SELECT 1 FROM public.inventory_items AS item WHERE item.is_active
    ) THEN
      RAISE EXCEPTION 'No hay insumos críticos por contar';
    END IF;
    RAISE EXCEPTION 'Primero agrega al menos un insumo activo';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller_id::text, 0)
  );

  SELECT count_record.id INTO count_id
  FROM public.inventory_counts AS count_record
  WHERE count_record.status = 'draft'
    AND count_record.started_by = caller_id
  ORDER BY count_record.started_at DESC
  LIMIT 1
  FOR UPDATE;

  IF count_id IS NOT NULL THEN
    SELECT count(*)::integer INTO existing_lines
    FROM public.inventory_count_lines AS line
    WHERE line.count_id = count_id;

    IF existing_lines > 0 THEN
      RETURN count_id;
    END IF;

    UPDATE public.inventory_counts
    SET scope = p_scope,
        notes = '',
        updated_at = now()
    WHERE id = count_id;
  ELSE
    INSERT INTO public.inventory_counts (scope, started_by)
    VALUES (p_scope, caller_id)
    RETURNING id INTO count_id;
  END IF;

  INSERT INTO public.inventory_count_lines (
    count_id,
    inventory_item_id,
    expected_stock,
    expected_stock_version
  )
  SELECT count_id, item.id, item.current_stock, item.stock_version
  FROM public.inventory_items AS item
  WHERE item.is_active
    AND (p_scope = 'full' OR item.current_stock <= item.minimum_stock)
  ORDER BY item.name;

  RETURN count_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_inventory_count(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_inventory_count(text) TO authenticated;

CREATE OR REPLACE FUNCTION private.delete_inventory_item_permanently(
  p_inventory_item_id uuid,
  p_confirmation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item_row public.inventory_items%ROWTYPE;
  caller_role text := public.get_user_role();
  recipe_count integer := 0;
  movement_count integer := 0;
  lot_count integer := 0;
  count_line_count integer := 0;
  receipt_line_count integer := 0;
  purchase_line_count integer := 0;
  count_ids uuid[] := ARRAY[]::uuid[];
  receipt_ids uuid[] := ARRAY[]::uuid[];
  purchase_order_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF (SELECT auth.uid()) IS NULL OR caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'No tienes permiso para eliminar insumos definitivamente';
  END IF;

  SELECT * INTO item_row
  FROM public.inventory_items
  WHERE id = p_inventory_item_id
  FOR UPDATE;

  IF item_row.id IS NULL THEN
    RAISE EXCEPTION 'El insumo ya no existe';
  END IF;

  IF item_row.is_active THEN
    RAISE EXCEPTION 'Primero archiva el insumo antes de eliminarlo definitivamente';
  END IF;

  IF p_confirmation IS DISTINCT FROM item_row.name THEN
    RAISE EXCEPTION 'El nombre de confirmación no coincide';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT line.count_id), ARRAY[]::uuid[])
  INTO count_ids
  FROM public.inventory_count_lines AS line
  WHERE line.inventory_item_id = item_row.id;

  SELECT COALESCE(array_agg(DISTINCT line.receipt_id), ARRAY[]::uuid[])
  INTO receipt_ids
  FROM public.inventory_receipt_lines AS line
  WHERE line.inventory_item_id = item_row.id;

  SELECT COALESCE(array_agg(DISTINCT line.purchase_order_id), ARRAY[]::uuid[])
  INTO purchase_order_ids
  FROM public.inventory_purchase_order_lines AS line
  WHERE line.inventory_item_id = item_row.id;

  DELETE FROM public.inventory_movements
  WHERE inventory_item_id = item_row.id;
  GET DIAGNOSTICS movement_count = ROW_COUNT;

  DELETE FROM public.inventory_lots
  WHERE inventory_item_id = item_row.id;
  GET DIAGNOSTICS lot_count = ROW_COUNT;

  DELETE FROM public.inventory_receipt_lines
  WHERE inventory_item_id = item_row.id;
  GET DIAGNOSTICS receipt_line_count = ROW_COUNT;

  DELETE FROM public.inventory_purchase_order_lines
  WHERE inventory_item_id = item_row.id;
  GET DIAGNOSTICS purchase_line_count = ROW_COUNT;

  DELETE FROM public.inventory_count_lines
  WHERE inventory_item_id = item_row.id;
  GET DIAGNOSTICS count_line_count = ROW_COUNT;

  DELETE FROM public.inventory_recipes
  WHERE inventory_item_id = item_row.id;
  GET DIAGNOSTICS recipe_count = ROW_COUNT;

  DELETE FROM public.inventory_items
  WHERE id = item_row.id;

  DELETE FROM public.inventory_counts AS count_record
  WHERE count_record.id = ANY(count_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM public.inventory_count_lines AS line
      WHERE line.count_id = count_record.id
    );

  DELETE FROM public.inventory_receipts AS receipt
  WHERE receipt.id = ANY(receipt_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM public.inventory_receipt_lines AS line
      WHERE line.receipt_id = receipt.id
    );

  DELETE FROM public.inventory_purchase_orders AS purchase_order
  WHERE purchase_order.id = ANY(purchase_order_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM public.inventory_purchase_order_lines AS line
      WHERE line.purchase_order_id = purchase_order.id
    );

  RETURN jsonb_build_object(
    'id', item_row.id,
    'name', item_row.name,
    'recipes', recipe_count,
    'movements', movement_count,
    'lots', lot_count,
    'count_lines', count_line_count,
    'receipt_lines', receipt_line_count,
    'purchase_lines', purchase_line_count
  );
END;
$$;

REVOKE ALL ON FUNCTION private.delete_inventory_item_permanently(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.delete_inventory_item_permanently(uuid, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_inventory_item_permanently(
  p_inventory_item_id uuid,
  p_confirmation text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.delete_inventory_item_permanently(
    p_inventory_item_id,
    p_confirmation
  );
$$;

REVOKE ALL ON FUNCTION public.delete_inventory_item_permanently(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_inventory_item_permanently(uuid, text)
  TO authenticated;
