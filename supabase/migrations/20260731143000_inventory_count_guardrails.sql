-- Prevent empty inventory counts and provide a safe audited cancellation flow.

CREATE OR REPLACE FUNCTION public.start_inventory_count(p_scope text DEFAULT 'full')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  count_id uuid;
  matching_items integer;
  caller_role text;
BEGIN
  caller_role := public.get_user_role();
  IF caller_role NOT IN ('owner', 'admin', 'kitchen', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para contar inventario';
  END IF;

  IF p_scope NOT IN ('full', 'critical') THEN
    RAISE EXCEPTION 'Tipo de conteo inválido';
  END IF;

  SELECT count(*)::integer INTO matching_items
  FROM public.inventory_items item
  WHERE item.is_active
    AND (p_scope = 'full' OR item.current_stock <= item.minimum_stock);

  IF matching_items = 0 THEN
    IF p_scope = 'critical' AND EXISTS (
      SELECT 1 FROM public.inventory_items WHERE is_active
    ) THEN
      RAISE EXCEPTION 'No hay insumos críticos por contar';
    END IF;
    RAISE EXCEPTION 'Primero agrega al menos un insumo activo';
  END IF;

  SELECT id INTO count_id
  FROM public.inventory_counts
  WHERE status = 'draft'
    AND started_by = (SELECT auth.uid())
  ORDER BY started_at DESC
  LIMIT 1;

  IF count_id IS NOT NULL THEN
    RETURN count_id;
  END IF;

  INSERT INTO public.inventory_counts (scope, started_by)
  VALUES (p_scope, (SELECT auth.uid()))
  RETURNING id INTO count_id;

  INSERT INTO public.inventory_count_lines (
    count_id,
    inventory_item_id,
    expected_stock
  )
  SELECT count_id, item.id, item.current_stock
  FROM public.inventory_items item
  WHERE item.is_active
    AND (p_scope = 'full' OR item.current_stock <= item.minimum_stock)
  ORDER BY item.name;

  RETURN count_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_inventory_count(p_count_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  count_row public.inventory_counts%ROWTYPE;
  caller_role text;
BEGIN
  caller_role := public.get_user_role();
  IF caller_role NOT IN ('owner', 'admin', 'kitchen', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para cancelar conteos';
  END IF;

  SELECT * INTO count_row
  FROM public.inventory_counts
  WHERE id = p_count_id
  FOR UPDATE;

  IF count_row.id IS NULL OR count_row.status <> 'draft' THEN
    RAISE EXCEPTION 'El conteo ya no se puede cancelar';
  END IF;

  IF count_row.started_by <> (SELECT auth.uid())
     AND caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Solo quien inició el conteo puede cancelarlo';
  END IF;

  UPDATE public.inventory_counts
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_count_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_inventory_count(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_inventory_count(text) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_inventory_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_inventory_count(uuid) TO authenticated;
