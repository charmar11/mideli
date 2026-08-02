-- Resolve a PL/pgSQL identifier collision and allow the public invoker wrapper
-- to call the protected implementation in the non-exposed private schema.

CREATE OR REPLACE FUNCTION public.start_inventory_count(p_scope text DEFAULT 'full')
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count_id uuid;
  v_matching_items integer;
  v_existing_lines integer;
  v_caller_id uuid := (SELECT auth.uid());
  v_caller_role text := public.get_user_role();
BEGIN
  IF v_caller_id IS NULL OR v_caller_role NOT IN ('owner', 'admin', 'kitchen', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para contar inventario';
  END IF;

  IF p_scope NOT IN ('full', 'critical') THEN
    RAISE EXCEPTION 'Tipo de conteo inválido';
  END IF;

  SELECT count(*)::integer INTO v_matching_items
  FROM public.inventory_items AS item
  WHERE item.is_active
    AND (p_scope = 'full' OR item.current_stock <= item.minimum_stock);

  IF v_matching_items = 0 THEN
    IF p_scope = 'critical' AND EXISTS (
      SELECT 1 FROM public.inventory_items AS item WHERE item.is_active
    ) THEN
      RAISE EXCEPTION 'No hay insumos críticos por contar';
    END IF;
    RAISE EXCEPTION 'Primero agrega al menos un insumo activo';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_caller_id::text, 0)
  );

  SELECT count_record.id INTO v_count_id
  FROM public.inventory_counts AS count_record
  WHERE count_record.status = 'draft'
    AND count_record.started_by = v_caller_id
  ORDER BY count_record.started_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_count_id IS NOT NULL THEN
    SELECT count(*)::integer INTO v_existing_lines
    FROM public.inventory_count_lines AS line
    WHERE line.count_id = v_count_id;

    IF v_existing_lines > 0 THEN
      RETURN v_count_id;
    END IF;

    UPDATE public.inventory_counts
    SET scope = p_scope,
        notes = '',
        updated_at = now()
    WHERE id = v_count_id;
  ELSE
    INSERT INTO public.inventory_counts (scope, started_by)
    VALUES (p_scope, v_caller_id)
    RETURNING id INTO v_count_id;
  END IF;

  INSERT INTO public.inventory_count_lines (
    count_id,
    inventory_item_id,
    expected_stock,
    expected_stock_version
  )
  SELECT v_count_id, item.id, item.current_stock, item.stock_version
  FROM public.inventory_items AS item
  WHERE item.is_active
    AND (p_scope = 'full' OR item.current_stock <= item.minimum_stock)
  ORDER BY item.name;

  RETURN v_count_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_inventory_count(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_inventory_count(text) TO authenticated;

GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE ALL ON FUNCTION private.delete_inventory_item_permanently(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.delete_inventory_item_permanently(uuid, text)
  TO authenticated;
