-- Inventory purchase units, role-aware onboarding, and concurrency-safe order folios.
-- Additive and backward-compatible with the currently deployed frontend.

-- =====================================================
-- SAFE RESET OF THE ONLY CONFIRMED TEST ORDER
-- =====================================================

DO $$
DECLARE
  v_order_count integer;
  v_order_id uuid;
  v_item_count integer;
  v_log_count integer;
  v_movement_count integer;
BEGIN
  SELECT COUNT(*) INTO v_order_count FROM public.orders;

  IF v_order_count = 0 THEN
    RETURN;
  END IF;

  IF v_order_count <> 1 THEN
    RAISE EXCEPTION 'Order reset aborted: expected zero or one test order, found %', v_order_count;
  END IF;

  SELECT id INTO v_order_id
  FROM public.orders
  WHERE id = '5b76c898-8ccc-4a7d-a767-638dccf7782b'::uuid
    AND number = 101
    AND status = 'ready';

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Order reset aborted: the only order is not the confirmed #101 test order';
  END IF;

  SELECT COUNT(*) INTO v_item_count
  FROM public.order_items
  WHERE order_id = v_order_id;

  SELECT COUNT(*) INTO v_log_count
  FROM public.order_status_log
  WHERE order_id = v_order_id;

  SELECT COUNT(*) INTO v_movement_count
  FROM public.inventory_movements
  WHERE order_id = v_order_id;

  IF v_item_count <> 1 OR v_log_count <> 0 OR v_movement_count <> 0 THEN
    RAISE EXCEPTION
      'Order reset aborted: dependencies changed (items %, logs %, movements %)',
      v_item_count,
      v_log_count,
      v_movement_count;
  END IF;

  DELETE FROM public.orders WHERE id = v_order_id;
END
$$;

-- =====================================================
-- ORDER FOLIOS AND ATOMIC ORDER CREATION
-- =====================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS creation_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS orders_creation_key_unique
  ON public.orders(creation_key)
  WHERE creation_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.order_folio_counter (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  next_number integer NOT NULL CHECK (next_number > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.order_folio_counter (singleton, next_number)
VALUES (
  true,
  (SELECT COALESCE(MAX(number), 0) + 1 FROM public.orders)
)
ON CONFLICT (singleton) DO UPDATE
SET next_number = EXCLUDED.next_number,
    updated_at = now();

ALTER TABLE public.order_folio_counter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_folio_counter FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.assign_order_folio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.order_folio_counter
  SET next_number = next_number + 1,
      updated_at = now()
  WHERE singleton
  RETURNING next_number - 1 INTO NEW.number;

  IF NEW.number IS NULL THEN
    RAISE EXCEPTION 'No se pudo asignar el folio del pedido';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_assign_order_folio ON public.orders;
CREATE TRIGGER trigger_assign_order_folio
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.assign_order_folio();

REVOKE ALL ON FUNCTION private.assign_order_folio() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_creation_key uuid,
  p_items jsonb,
  p_order_type text,
  p_total integer,
  p_notes text DEFAULT '',
  p_table_number text DEFAULT NULL,
  p_table_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  created_order public.orders%ROWTYPE;
  current_user_id uuid := (SELECT auth.uid());
  was_created boolean := false;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  IF public.get_user_role() NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para crear pedidos';
  END IF;

  IF p_creation_key IS NULL THEN
    RAISE EXCEPTION 'Falta la clave de creación del pedido';
  END IF;

  IF p_order_type NOT IN ('comedor', 'domicilio', 'para_llevar') THEN
    RAISE EXCEPTION 'Tipo de pedido no válido';
  END IF;

  IF p_total < 0 THEN
    RAISE EXCEPTION 'Total de pedido no válido';
  END IF;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'El pedido debe contener al menos un producto';
  END IF;

  SELECT * INTO created_order
  FROM public.orders
  WHERE creation_key = p_creation_key;

  IF created_order.id IS NULL THEN
    BEGIN
      INSERT INTO public.orders (
        creation_key,
        status,
        type,
        total,
        notes,
        table_number,
        table_id,
        customer_name,
        created_by
      ) VALUES (
        p_creation_key,
        'pending',
        p_order_type::public.order_type,
        p_total,
        COALESCE(p_notes, ''),
        NULLIF(p_table_number, ''),
        p_table_id,
        NULLIF(p_customer_name, ''),
        current_user_id
      )
      RETURNING * INTO created_order;
      was_created := true;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO created_order
      FROM public.orders
      WHERE creation_key = p_creation_key;
    END;
  END IF;

  IF created_order.id IS NULL THEN
    RAISE EXCEPTION 'No se pudo crear el pedido';
  END IF;

  IF was_created THEN
    INSERT INTO public.order_items (
      order_id,
      menu_item_id,
      quantity,
      unit_price,
      notes,
      selected_modifiers
    )
    SELECT
      created_order.id,
      (item->>'menu_item_id')::uuid,
      COALESCE((item->>'quantity')::integer, 1),
      COALESCE((item->>'unit_price')::integer, 0),
      COALESCE(item->>'notes', ''),
      COALESCE(item->'selected_modifiers', '[]'::jsonb)
    FROM jsonb_array_elements(p_items) AS item
    WHERE (item->>'menu_item_id') IS NOT NULL
      AND COALESCE((item->>'quantity')::integer, 1) > 0
      AND COALESCE((item->>'unit_price')::integer, 0) >= 0;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Los productos del pedido no son válidos';
    END IF;
  END IF;

  RETURN created_order;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_with_items(uuid, jsonb, text, integer, text, text, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(uuid, jsonb, text, integer, text, text, uuid, text)
  TO authenticated;

-- =====================================================
-- PURCHASE UNITS, COST PRECISION, AND SUPPLIER DETAILS
-- =====================================================

ALTER TABLE public.inventory_items
  ALTER COLUMN current_stock TYPE numeric(14,4) USING current_stock::numeric(14,4),
  ALTER COLUMN minimum_stock TYPE numeric(14,4) USING minimum_stock::numeric(14,4),
  ALTER COLUMN target_stock TYPE numeric(14,4) USING target_stock::numeric(14,4),
  ALTER COLUMN cost_per_unit TYPE numeric(18,6) USING cost_per_unit::numeric(18,6),
  ADD COLUMN IF NOT EXISTS purchase_unit text NOT NULL DEFAULT 'pieza',
  ADD COLUMN IF NOT EXISTS purchase_conversion_factor numeric(14,4) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS minimum_purchase_quantity numeric(14,4) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS preferred_supplier_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_purchase_package_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_purchase_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_version bigint NOT NULL DEFAULT 0;

UPDATE public.inventory_items
SET purchase_unit = unit
WHERE purchase_unit = 'pieza' AND unit <> 'pieza';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_items_purchase_conversion_check'
      AND conrelid = 'public.inventory_items'::regclass
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_purchase_conversion_check
      CHECK (purchase_conversion_factor > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_items_minimum_purchase_check'
      AND conrelid = 'public.inventory_items'::regclass
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_minimum_purchase_check
      CHECK (minimum_purchase_quantity >= 1);
  END IF;
END
$$;

ALTER TABLE public.inventory_recipes
  ALTER COLUMN quantity TYPE numeric(14,4) USING quantity::numeric(14,4),
  ADD COLUMN IF NOT EXISTS modifier_group_id text,
  ADD COLUMN IF NOT EXISTS modifier_option_id text,
  ADD COLUMN IF NOT EXISTS modifier_group_name text,
  ADD COLUMN IF NOT EXISTS modifier_option_name text;

ALTER TABLE public.inventory_recipes
  DROP CONSTRAINT IF EXISTS inventory_recipes_menu_item_id_inventory_item_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_recipes_base_unique
  ON public.inventory_recipes(menu_item_id, inventory_item_id)
  WHERE modifier_option_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_recipes_modifier_unique
  ON public.inventory_recipes(menu_item_id, modifier_option_id, inventory_item_id)
  WHERE modifier_option_id IS NOT NULL;

UPDATE public.menu_items AS menu_item
SET modifiers = COALESCE((
  SELECT jsonb_agg(
    (modifier_group - 'options')
    || jsonb_build_object(
      'id', COALESCE(NULLIF(modifier_group->>'id', ''), gen_random_uuid()::text),
      'options', COALESCE((
        SELECT jsonb_agg(
          modifier_option
          || jsonb_build_object(
            'id', COALESCE(NULLIF(modifier_option->>'id', ''), gen_random_uuid()::text)
          )
        )
        FROM jsonb_array_elements(COALESCE(modifier_group->'options', '[]'::jsonb)) AS modifier_option
      ), '[]'::jsonb)
    )
  )
  FROM jsonb_array_elements(COALESCE(menu_item.modifiers, '[]'::jsonb)) AS modifier_group
), '[]'::jsonb)
WHERE jsonb_typeof(COALESCE(menu_item.modifiers, '[]'::jsonb)) = 'array';

ALTER TABLE public.inventory_purchase_order_lines
  ALTER COLUMN ordered_quantity TYPE numeric(14,4) USING ordered_quantity::numeric(14,4),
  ALTER COLUMN received_quantity TYPE numeric(14,4) USING received_quantity::numeric(14,4),
  ALTER COLUMN expected_unit_cost TYPE numeric(18,6) USING expected_unit_cost::numeric(18,6),
  ADD COLUMN IF NOT EXISTS ordered_purchase_quantity numeric(14,4),
  ADD COLUMN IF NOT EXISTS received_purchase_quantity numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_unit_snapshot text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS conversion_factor_snapshot numeric(14,4),
  ADD COLUMN IF NOT EXISTS expected_package_cost numeric(14,2) NOT NULL DEFAULT 0;

UPDATE public.inventory_purchase_order_lines AS line
SET ordered_purchase_quantity = COALESCE(line.ordered_purchase_quantity, line.ordered_quantity),
    purchase_unit_snapshot = COALESCE(NULLIF(line.purchase_unit_snapshot, ''), item.purchase_unit),
    conversion_factor_snapshot = COALESCE(line.conversion_factor_snapshot, item.purchase_conversion_factor),
    expected_package_cost = CASE
      WHEN line.expected_package_cost > 0 THEN line.expected_package_cost
      ELSE ROUND((line.expected_unit_cost * item.purchase_conversion_factor)::numeric, 2)
    END
FROM public.inventory_items AS item
WHERE item.id = line.inventory_item_id;

ALTER TABLE public.inventory_purchase_order_lines
  ALTER COLUMN ordered_purchase_quantity SET NOT NULL,
  ALTER COLUMN conversion_factor_snapshot SET NOT NULL;

ALTER TABLE public.inventory_receipt_lines
  ALTER COLUMN received_quantity TYPE numeric(14,4) USING received_quantity::numeric(14,4),
  ALTER COLUMN unit_cost TYPE numeric(18,6) USING unit_cost::numeric(18,6),
  ADD COLUMN IF NOT EXISTS received_purchase_quantity numeric(14,4),
  ADD COLUMN IF NOT EXISTS total_cost numeric(14,2),
  ADD COLUMN IF NOT EXISTS purchase_unit_snapshot text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS conversion_factor_snapshot numeric(14,4),
  ADD COLUMN IF NOT EXISTS update_reference_price boolean NOT NULL DEFAULT true;

UPDATE public.inventory_receipt_lines AS line
SET received_purchase_quantity = COALESCE(line.received_purchase_quantity, line.received_quantity),
    total_cost = COALESCE(line.total_cost, ROUND((line.received_quantity * line.unit_cost)::numeric, 2)),
    purchase_unit_snapshot = COALESCE(NULLIF(line.purchase_unit_snapshot, ''), item.purchase_unit),
    conversion_factor_snapshot = COALESCE(line.conversion_factor_snapshot, item.purchase_conversion_factor)
FROM public.inventory_items AS item
WHERE item.id = line.inventory_item_id;

ALTER TABLE public.inventory_receipt_lines
  ALTER COLUMN received_purchase_quantity SET NOT NULL,
  ALTER COLUMN total_cost SET NOT NULL,
  ALTER COLUMN conversion_factor_snapshot SET NOT NULL;

ALTER TABLE public.inventory_lots
  ALTER COLUMN quantity_received TYPE numeric(14,4) USING quantity_received::numeric(14,4),
  ALTER COLUMN quantity_remaining TYPE numeric(14,4) USING quantity_remaining::numeric(14,4),
  ALTER COLUMN unit_cost TYPE numeric(18,6) USING unit_cost::numeric(18,6);

ALTER TABLE public.inventory_movements
  ALTER COLUMN quantity_change TYPE numeric(14,4) USING quantity_change::numeric(14,4),
  ALTER COLUMN previous_stock TYPE numeric(14,4) USING previous_stock::numeric(14,4),
  ALTER COLUMN resulting_stock TYPE numeric(14,4) USING resulting_stock::numeric(14,4),
  ADD COLUMN IF NOT EXISTS unit_cost_snapshot numeric(18,6),
  ADD COLUMN IF NOT EXISTS order_number_snapshot integer,
  ADD COLUMN IF NOT EXISTS reference_label text NOT NULL DEFAULT '';

ALTER TABLE public.inventory_count_lines
  DROP COLUMN IF EXISTS variance;

ALTER TABLE public.inventory_count_lines
  ALTER COLUMN expected_stock TYPE numeric(14,4) USING expected_stock::numeric(14,4),
  ALTER COLUMN counted_stock TYPE numeric(14,4) USING counted_stock::numeric(14,4),
  ADD COLUMN IF NOT EXISTS expected_stock_version bigint NOT NULL DEFAULT 0;

ALTER TABLE public.inventory_count_lines
  ADD COLUMN variance numeric(14,4)
  GENERATED ALWAYS AS (counted_stock - expected_stock) STORED;

-- =====================================================
-- ROLE-AWARE ONBOARDING
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_onboarding_progress (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role = ANY (ARRAY['owner', 'admin', 'waiter', 'kitchen', 'supervisor'])),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status = ANY (ARRAY['not_started', 'in_progress', 'skipped', 'completed'])),
  current_step integer NOT NULL DEFAULT 0 CHECK (current_step >= 0),
  completed_steps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(completed_steps) = 'array'),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role, version)
);

ALTER TABLE public.user_onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own onboarding" ON public.user_onboarding_progress
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users create own onboarding" ON public.user_onboarding_progress
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users update own onboarding" ON public.user_onboarding_progress
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.user_onboarding_progress TO authenticated;

-- =====================================================
-- OPENING STOCK AND ROLE HARDENING
-- =====================================================

CREATE OR REPLACE FUNCTION private.record_inventory_opening_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.current_stock > 0 THEN
    INSERT INTO public.inventory_movements (
      inventory_item_id,
      movement_type,
      quantity_change,
      note,
      created_by,
      previous_stock,
      resulting_stock,
      reason_code,
      unit_cost_snapshot,
      reference_label
    ) VALUES (
      NEW.id,
      'adjustment',
      NEW.current_stock,
      'Existencia inicial',
      (SELECT auth.uid()),
      0,
      NEW.current_stock,
      'opening_stock',
      NEW.cost_per_unit,
      'Apertura de inventario'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_record_inventory_opening_stock ON public.inventory_items;
CREATE TRIGGER trigger_record_inventory_opening_stock
  AFTER INSERT ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION private.record_inventory_opening_stock();

REVOKE ALL ON FUNCTION private.record_inventory_opening_stock() FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.sync_inventory_lots_from_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  remaining numeric(14,4);
  lot_row record;
  take_quantity numeric(14,4);
  generated_lot_id uuid;
BEGIN
  IF NEW.quantity_change < 0 THEN
    remaining := ABS(NEW.quantity_change);

    FOR lot_row IN
      SELECT id, quantity_remaining
      FROM public.inventory_lots
      WHERE inventory_item_id = NEW.inventory_item_id
        AND quantity_remaining > 0
      ORDER BY expires_on ASC NULLS LAST, received_at ASC, id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN remaining <= 0;
      take_quantity := LEAST(remaining, lot_row.quantity_remaining);

      UPDATE public.inventory_lots
      SET quantity_remaining = quantity_remaining - take_quantity
      WHERE id = lot_row.id;

      remaining := remaining - take_quantity;
    END LOOP;
  ELSIF NEW.quantity_change > 0
    AND NEW.lot_id IS NULL
    AND NEW.movement_type IN ('purchase', 'adjustment', 'return', 'count_correction')
  THEN
    INSERT INTO public.inventory_lots (
      inventory_item_id,
      lot_code,
      quantity_received,
      quantity_remaining,
      unit_cost,
      received_at
    )
    SELECT
      NEW.inventory_item_id,
      UPPER(NEW.movement_type),
      NEW.quantity_change,
      NEW.quantity_change,
      item.cost_per_unit,
      COALESCE(NEW.created_at, now())
    FROM public.inventory_items AS item
    WHERE item.id = NEW.inventory_item_id
    RETURNING id INTO generated_lot_id;

    NEW.lot_id := generated_lot_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_inventory_movement(
  p_inventory_item_id uuid,
  p_quantity_change numeric,
  p_movement_type text,
  p_reason_code text DEFAULT '',
  p_note text DEFAULT ''
)
RETURNS public.inventory_movements
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_item public.inventory_items%ROWTYPE;
  movement public.inventory_movements%ROWTYPE;
  next_stock numeric(14,4);
  caller_role text := public.get_user_role();
BEGIN
  IF caller_role NOT IN ('owner', 'admin', 'kitchen', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para modificar inventario';
  END IF;

  IF p_movement_type IN ('purchase', 'adjustment')
     AND caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Solo administración puede registrar compras o ajustes';
  END IF;

  IF p_quantity_change = 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser diferente de cero';
  END IF;

  IF p_movement_type NOT IN (
    'purchase', 'adjustment', 'waste', 'internal_use', 'damage', 'expired'
  ) THEN
    RAISE EXCEPTION 'Tipo de movimiento no permitido';
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
      stock_version = stock_version + 1,
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
    reason_code,
    unit_cost_snapshot,
    reference_label
  ) VALUES (
    current_item.id,
    p_movement_type,
    p_quantity_change,
    COALESCE(p_note, ''),
    (SELECT auth.uid()),
    current_item.current_stock,
    next_stock,
    COALESCE(p_reason_code, ''),
    current_item.cost_per_unit,
    COALESCE(NULLIF(p_note, ''), p_reason_code, '')
  )
  RETURNING * INTO movement;

  RETURN movement;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_inventory_count(p_scope text DEFAULT 'full')
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  count_id uuid;
BEGIN
  IF public.get_user_role() NOT IN ('owner', 'admin', 'kitchen', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para contar inventario';
  END IF;

  IF p_scope NOT IN ('full', 'critical') THEN
    RAISE EXCEPTION 'Tipo de conteo inválido';
  END IF;

  INSERT INTO public.inventory_counts (scope, started_by)
  VALUES (p_scope, (SELECT auth.uid()))
  RETURNING id INTO count_id;

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

CREATE OR REPLACE FUNCTION public.complete_inventory_count(
  p_count_id uuid,
  p_lines jsonb,
  p_notes text DEFAULT ''
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  count_row public.inventory_counts%ROWTYPE;
  line_input record;
  line_row public.inventory_count_lines%ROWTYPE;
  item_row public.inventory_items%ROWTYPE;
  delta numeric(14,4);
  next_stock numeric(14,4);
  material_difference boolean := false;
  final_status text;
  caller_role text := public.get_user_role();
BEGIN
  IF caller_role NOT IN ('owner', 'admin', 'kitchen', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para completar conteos';
  END IF;

  SELECT * INTO count_row
  FROM public.inventory_counts
  WHERE id = p_count_id
  FOR UPDATE;

  IF count_row.id IS NULL OR count_row.status <> 'draft' THEN
    RAISE EXCEPTION 'El conteo ya no se puede modificar';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'El conteo no contiene insumos';
  END IF;

  FOR line_input IN
    SELECT *
    FROM jsonb_to_recordset(p_lines) AS entry(
      line_id uuid,
      counted_stock numeric,
      reason_code text,
      note text
    )
    ORDER BY line_id
  LOOP
    SELECT * INTO line_row
    FROM public.inventory_count_lines
    WHERE id = line_input.line_id AND count_id = p_count_id
    FOR UPDATE;

    IF line_row.id IS NULL OR line_input.counted_stock IS NULL OR line_input.counted_stock < 0 THEN
      RAISE EXCEPTION 'Hay una cantidad de conteo inválida';
    END IF;

    SELECT * INTO item_row
    FROM public.inventory_items
    WHERE id = line_row.inventory_item_id
    FOR UPDATE;

    IF item_row.stock_version <> line_row.expected_stock_version THEN
      RAISE EXCEPTION 'La existencia de % cambió durante el conteo. Actualiza e inicia de nuevo', item_row.name;
    END IF;

    next_stock := line_input.counted_stock;
    delta := next_stock - item_row.current_stock;

    IF delta <> 0 AND COALESCE(line_input.reason_code, '') = '' THEN
      RAISE EXCEPTION 'Selecciona un motivo para cada diferencia';
    END IF;

    UPDATE public.inventory_count_lines
    SET counted_stock = line_input.counted_stock,
        reason_code = COALESCE(line_input.reason_code, ''),
        note = COALESCE(line_input.note, ''),
        updated_at = now()
    WHERE id = line_row.id;

    IF delta <> 0 THEN
      UPDATE public.inventory_items
      SET current_stock = next_stock,
          stock_version = stock_version + 1,
          last_counted_at = now(),
          updated_at = now()
      WHERE id = item_row.id;

      INSERT INTO public.inventory_movements (
        inventory_item_id,
        movement_type,
        quantity_change,
        note,
        created_by,
        previous_stock,
        resulting_stock,
        reason_code,
        count_id,
        unit_cost_snapshot,
        reference_label
      ) VALUES (
        item_row.id,
        'count_correction',
        delta,
        COALESCE(line_input.note, 'Corrección por conteo físico'),
        (SELECT auth.uid()),
        item_row.current_stock,
        next_stock,
        line_input.reason_code,
        p_count_id,
        item_row.cost_per_unit,
        'Conteo físico'
      );

      IF ABS(delta * item_row.cost_per_unit) >= 300
        OR (
          line_row.expected_stock > 0
          AND ABS(delta) / line_row.expected_stock >= 0.20
        )
      THEN
        material_difference := true;
      END IF;
    ELSE
      UPDATE public.inventory_items
      SET last_counted_at = now(), updated_at = now()
      WHERE id = item_row.id;
    END IF;
  END LOOP;

  final_status := CASE
    WHEN material_difference AND caller_role NOT IN ('owner', 'admin') THEN 'submitted'
    ELSE 'reconciled'
  END;

  UPDATE public.inventory_counts
  SET status = final_status,
      notes = COALESCE(p_notes, ''),
      requires_review = material_difference,
      completed_by = (SELECT auth.uid()),
      completed_at = now(),
      reviewed_by = CASE WHEN final_status = 'reconciled' THEN (SELECT auth.uid()) ELSE NULL END,
      reviewed_at = CASE WHEN final_status = 'reconciled' THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_count_id;

  RETURN final_status;
END;
$$;

ALTER POLICY "Inventory items updatable by admins" ON public.inventory_items
  USING (public.get_user_role() IN ('owner', 'admin'))
  WITH CHECK (public.get_user_role() IN ('owner', 'admin'));

ALTER POLICY "Purchase orders created by operators" ON public.inventory_purchase_orders
  WITH CHECK (
    public.get_user_role() IN ('owner', 'admin')
    AND created_by = (SELECT auth.uid())
  );

ALTER POLICY "Purchase orders updated by operators" ON public.inventory_purchase_orders
  USING (public.get_user_role() IN ('owner', 'admin'))
  WITH CHECK (public.get_user_role() IN ('owner', 'admin'));

ALTER POLICY "Purchase order lines managed by operators" ON public.inventory_purchase_order_lines
  USING (public.get_user_role() IN ('owner', 'admin'))
  WITH CHECK (public.get_user_role() IN ('owner', 'admin'));

ALTER POLICY "Receipts created by operators" ON public.inventory_receipts
  WITH CHECK (
    public.get_user_role() IN ('owner', 'admin')
    AND received_by = (SELECT auth.uid())
  );

ALTER POLICY "Receipt lines created by operators" ON public.inventory_receipt_lines
  WITH CHECK (public.get_user_role() IN ('owner', 'admin'));

ALTER POLICY "Inventory lots managed by operators" ON public.inventory_lots
  USING (public.get_user_role() IN ('owner', 'admin'))
  WITH CHECK (public.get_user_role() IN ('owner', 'admin'));

-- =====================================================
-- PURCHASE RPCS WITH PRESENTATION CONVERSION
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_inventory_purchase_order(
  p_supplier text,
  p_lines jsonb,
  p_notes text DEFAULT '',
  p_expected_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  order_id uuid;
  line_input record;
  item_row public.inventory_items%ROWTYPE;
  package_quantity numeric(14,4);
  base_quantity numeric(14,4);
  conversion_factor numeric(14,4);
  package_cost numeric(14,2);
  base_unit_cost numeric(18,6);
BEGIN
  IF public.get_user_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'No tienes permiso para crear compras';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un insumo';
  END IF;

  INSERT INTO public.inventory_purchase_orders (
    status,
    supplier,
    notes,
    created_by,
    ordered_at,
    expected_at
  ) VALUES (
    'ordered',
    COALESCE(p_supplier, ''),
    COALESCE(p_notes, ''),
    (SELECT auth.uid()),
    now(),
    p_expected_at
  )
  RETURNING id INTO order_id;

  FOR line_input IN
    SELECT *
    FROM jsonb_to_recordset(p_lines) AS entry(
      inventory_item_id uuid,
      ordered_quantity numeric,
      expected_unit_cost numeric,
      ordered_purchase_quantity numeric,
      expected_package_cost numeric
    )
  LOOP
    SELECT * INTO item_row
    FROM public.inventory_items
    WHERE id = line_input.inventory_item_id AND is_active;

    IF item_row.id IS NULL THEN
      RAISE EXCEPTION 'Insumo de compra no encontrado';
    END IF;

    conversion_factor := item_row.purchase_conversion_factor;
    package_quantity := COALESCE(
      line_input.ordered_purchase_quantity,
      CASE
        WHEN line_input.ordered_quantity IS NOT NULL
          THEN line_input.ordered_quantity / conversion_factor
        ELSE NULL
      END
    );

    IF package_quantity IS NULL OR package_quantity <= 0 THEN
      RAISE EXCEPTION 'Cantidad de compra inválida';
    END IF;

    base_quantity := package_quantity * conversion_factor;
    package_cost := GREATEST(COALESCE(
      line_input.expected_package_cost,
      line_input.expected_unit_cost * conversion_factor,
      item_row.last_purchase_package_cost,
      item_row.cost_per_unit * conversion_factor,
      0
    ), 0);
    base_unit_cost := CASE
      WHEN conversion_factor > 0 THEN package_cost / conversion_factor
      ELSE 0
    END;

    INSERT INTO public.inventory_purchase_order_lines (
      purchase_order_id,
      inventory_item_id,
      ordered_quantity,
      received_quantity,
      expected_unit_cost,
      ordered_purchase_quantity,
      received_purchase_quantity,
      purchase_unit_snapshot,
      conversion_factor_snapshot,
      expected_package_cost
    ) VALUES (
      order_id,
      item_row.id,
      base_quantity,
      0,
      base_unit_cost,
      package_quantity,
      0,
      item_row.purchase_unit,
      conversion_factor,
      package_cost
    );
  END LOOP;

  RETURN order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_inventory(
  p_purchase_order_id uuid,
  p_supplier text,
  p_lines jsonb,
  p_notes text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  receipt_id uuid;
  receipt_line_id uuid;
  lot_id uuid;
  line_input record;
  item_row public.inventory_items%ROWTYPE;
  package_quantity numeric(14,4);
  base_quantity numeric(14,4);
  conversion_factor numeric(14,4);
  package_cost numeric(14,2);
  total_cost numeric(14,2);
  incoming_unit_cost numeric(18,6);
  next_stock numeric(14,4);
  next_cost numeric(18,6);
  should_update_reference boolean;
BEGIN
  IF public.get_user_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'No tienes permiso para recibir inventario';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un insumo recibido';
  END IF;

  IF p_purchase_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.inventory_purchase_orders
    WHERE id = p_purchase_order_id
      AND status IN ('ordered', 'partially_received')
  ) THEN
    RAISE EXCEPTION 'La compra ya no está disponible para recepción';
  END IF;

  INSERT INTO public.inventory_receipts (
    purchase_order_id,
    supplier,
    notes,
    received_by
  ) VALUES (
    p_purchase_order_id,
    COALESCE(p_supplier, ''),
    COALESCE(p_notes, ''),
    (SELECT auth.uid())
  )
  RETURNING id INTO receipt_id;

  FOR line_input IN
    SELECT *
    FROM jsonb_to_recordset(p_lines) AS entry(
      purchase_order_line_id uuid,
      inventory_item_id uuid,
      received_quantity numeric,
      unit_cost numeric,
      received_purchase_quantity numeric,
      total_cost numeric,
      expires_on date,
      storage_location text,
      update_reference_price boolean
    )
    ORDER BY inventory_item_id
  LOOP
    SELECT * INTO item_row
    FROM public.inventory_items
    WHERE id = line_input.inventory_item_id AND is_active
    FOR UPDATE;

    IF item_row.id IS NULL THEN
      RAISE EXCEPTION 'Insumo recibido no encontrado';
    END IF;

    conversion_factor := item_row.purchase_conversion_factor;
    package_quantity := COALESCE(
      line_input.received_purchase_quantity,
      CASE
        WHEN line_input.received_quantity IS NOT NULL
          THEN line_input.received_quantity / conversion_factor
        ELSE NULL
      END
    );

    IF package_quantity IS NULL OR package_quantity <= 0 THEN
      RAISE EXCEPTION 'Cantidad recibida inválida';
    END IF;

    IF item_row.tracks_expiry AND line_input.expires_on IS NULL THEN
      RAISE EXCEPTION 'Captura la caducidad de %', item_row.name;
    END IF;

    base_quantity := package_quantity * conversion_factor;
    total_cost := GREATEST(COALESCE(
      line_input.total_cost,
      line_input.unit_cost * base_quantity,
      item_row.last_purchase_package_cost * package_quantity,
      0
    ), 0);
    incoming_unit_cost := CASE
      WHEN base_quantity > 0 THEN total_cost / base_quantity
      ELSE 0
    END;
    package_cost := CASE
      WHEN package_quantity > 0 THEN ROUND(total_cost / package_quantity, 2)
      ELSE 0
    END;
    should_update_reference := COALESCE(line_input.update_reference_price, true);

    INSERT INTO public.inventory_receipt_lines (
      receipt_id,
      purchase_order_line_id,
      inventory_item_id,
      received_quantity,
      unit_cost,
      expires_on,
      storage_location,
      received_purchase_quantity,
      total_cost,
      purchase_unit_snapshot,
      conversion_factor_snapshot,
      update_reference_price
    ) VALUES (
      receipt_id,
      line_input.purchase_order_line_id,
      item_row.id,
      base_quantity,
      incoming_unit_cost,
      line_input.expires_on,
      COALESCE(NULLIF(line_input.storage_location, ''), item_row.storage_location),
      package_quantity,
      total_cost,
      item_row.purchase_unit,
      conversion_factor,
      should_update_reference
    )
    RETURNING id INTO receipt_line_id;

    INSERT INTO public.inventory_lots (
      inventory_item_id,
      receipt_line_id,
      lot_code,
      quantity_received,
      quantity_remaining,
      unit_cost,
      expires_on,
      storage_location,
      received_at
    ) VALUES (
      item_row.id,
      receipt_line_id,
      'REC-' || LEFT(receipt_id::text, 8),
      base_quantity,
      base_quantity,
      incoming_unit_cost,
      line_input.expires_on,
      COALESCE(NULLIF(line_input.storage_location, ''), item_row.storage_location),
      now()
    )
    RETURNING id INTO lot_id;

    next_stock := item_row.current_stock + base_quantity;
    next_cost := CASE
      WHEN incoming_unit_cost = 0 THEN item_row.cost_per_unit
      WHEN item_row.current_stock <= 0 THEN incoming_unit_cost
      ELSE ROUND(
        (
          (item_row.current_stock * item_row.cost_per_unit)
          + total_cost
        ) / next_stock,
        6
      )
    END;

    UPDATE public.inventory_items
    SET current_stock = next_stock,
        cost_per_unit = next_cost,
        storage_location = COALESCE(NULLIF(line_input.storage_location, ''), storage_location),
        tracks_expiry = tracks_expiry OR line_input.expires_on IS NOT NULL,
        last_purchase_package_cost = CASE
          WHEN should_update_reference THEN package_cost
          ELSE last_purchase_package_cost
        END,
        last_purchase_at = CASE
          WHEN should_update_reference THEN now()
          ELSE last_purchase_at
        END,
        preferred_supplier = CASE
          WHEN should_update_reference AND COALESCE(p_supplier, '') <> '' THEN p_supplier
          ELSE preferred_supplier
        END,
        stock_version = stock_version + 1,
        updated_at = now()
    WHERE id = item_row.id;

    INSERT INTO public.inventory_movements (
      inventory_item_id,
      movement_type,
      quantity_change,
      note,
      created_by,
      previous_stock,
      resulting_stock,
      reason_code,
      receipt_id,
      lot_id,
      unit_cost_snapshot,
      reference_label
    ) VALUES (
      item_row.id,
      'purchase',
      base_quantity,
      'Recepción de mercancía',
      (SELECT auth.uid()),
      item_row.current_stock,
      next_stock,
      'receipt',
      receipt_id,
      lot_id,
      incoming_unit_cost,
      package_quantity || ' ' || item_row.purchase_unit
    );

    IF line_input.purchase_order_line_id IS NOT NULL THEN
      UPDATE public.inventory_purchase_order_lines
      SET received_quantity = received_quantity + base_quantity,
          received_purchase_quantity = received_purchase_quantity + package_quantity,
          updated_at = now()
      WHERE id = line_input.purchase_order_line_id
        AND purchase_order_id = p_purchase_order_id;
    END IF;
  END LOOP;

  IF p_purchase_order_id IS NOT NULL THEN
    UPDATE public.inventory_purchase_orders AS purchase_order
    SET status = CASE
          WHEN NOT EXISTS (
            SELECT 1
            FROM public.inventory_purchase_order_lines AS line
            WHERE line.purchase_order_id = purchase_order.id
              AND line.received_quantity < line.ordered_quantity
          ) THEN 'received'
          ELSE 'partially_received'
        END,
        updated_at = now()
    WHERE purchase_order.id = p_purchase_order_id;
  END IF;

  RETURN receipt_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_inventory_purchase_order(text, jsonb, text, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_inventory_purchase_order(text, jsonb, text, timestamptz)
  TO authenticated;

REVOKE ALL ON FUNCTION public.receive_inventory(uuid, text, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_inventory(uuid, text, jsonb, text)
  TO authenticated;

-- =====================================================
-- RECIPE CONSUMPTION INCLUDING MODIFIER OPTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION private.consume_inventory_for_order_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  recipe record;
  movement_id uuid;
  delta numeric(14,4);
  previous_stock numeric(14,4);
  resulting_stock numeric(14,4);
  current_cost numeric(18,6);
  order_number integer;
  order_creator uuid;
BEGIN
  SELECT number, created_by
  INTO order_number, order_creator
  FROM public.orders
  WHERE id = NEW.order_id;

  FOR recipe IN
    SELECT component.inventory_item_id, SUM(component.quantity)::numeric(14,4) AS quantity
    FROM (
      SELECT inventory_item_id, quantity
      FROM public.inventory_recipes
      WHERE menu_item_id = NEW.menu_item_id
        AND modifier_option_id IS NULL

      UNION ALL

      SELECT configured.inventory_item_id, configured.quantity
      FROM public.inventory_recipes AS configured
      WHERE configured.menu_item_id = NEW.menu_item_id
        AND configured.modifier_option_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(NEW.selected_modifiers, '[]'::jsonb)) AS selected
          WHERE selected->>'option_id' = configured.modifier_option_id
             OR (
               COALESCE(selected->>'option_id', '') = ''
               AND selected->>'group' = configured.modifier_group_name
               AND selected->>'option' = configured.modifier_option_name
             )
        )
    ) AS component
    GROUP BY component.inventory_item_id
  LOOP
    SELECT current_stock, cost_per_unit
    INTO previous_stock, current_cost
    FROM public.inventory_items
    WHERE id = recipe.inventory_item_id
    FOR UPDATE;

    IF previous_stock IS NULL THEN
      CONTINUE;
    END IF;

    delta := -(recipe.quantity * NEW.quantity);
    resulting_stock := previous_stock + delta;
    movement_id := NULL;

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
      reason_code,
      unit_cost_snapshot,
      order_number_snapshot,
      reference_label
    ) VALUES (
      recipe.inventory_item_id,
      NEW.order_id,
      NEW.id,
      'consumption',
      delta,
      'Consumo por pedido',
      COALESCE((SELECT auth.uid()), order_creator),
      previous_stock,
      resulting_stock,
      'order_sent',
      current_cost,
      order_number,
      'Pedido #' || order_number
    )
    ON CONFLICT (order_id, order_item_id, inventory_item_id, movement_type)
    DO NOTHING
    RETURNING id INTO movement_id;

    IF movement_id IS NOT NULL THEN
      UPDATE public.inventory_items
      SET current_stock = resulting_stock,
          stock_version = stock_version + 1,
          updated_at = now()
      WHERE id = recipe.inventory_item_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

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
  previous_stock numeric(14,4);
  returned_stock numeric(14,4);
  current_cost numeric(18,6);
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

  SELECT * INTO current_order
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
      ABS(SUM(movement.quantity_change))::numeric(14,4) AS quantity_to_return
    FROM public.inventory_movements AS movement
    JOIN public.order_items AS order_item ON order_item.id = movement.order_item_id
    WHERE order_item.order_id = p_order_id
      AND movement.movement_type = 'consumption'
    GROUP BY movement.inventory_item_id, movement.order_item_id
  LOOP
    SELECT current_stock, cost_per_unit
    INTO previous_stock, current_cost
    FROM public.inventory_items
    WHERE id = consumed.inventory_item_id
    FOR UPDATE;

    IF previous_stock IS NOT NULL AND consumed.quantity_to_return > 0 THEN
      returned_stock := previous_stock + consumed.quantity_to_return;

      UPDATE public.inventory_items
      SET current_stock = returned_stock,
          stock_version = stock_version + 1,
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
        reason_code,
        unit_cost_snapshot,
        order_number_snapshot,
        reference_label
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
        'order_edited',
        current_cost,
        current_order.number,
        'Pedido #' || current_order.number
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
  delta numeric(14,4);
  previous_stock numeric(14,4);
  returned_stock numeric(14,4);
  current_cost numeric(18,6);
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    FOR consumed IN
      SELECT
        inventory_item_id,
        SUM(quantity_change)::numeric(14,4) AS net_change
      FROM public.inventory_movements
      WHERE order_id = NEW.id
        AND movement_type IN ('consumption', 'return')
      GROUP BY inventory_item_id
      HAVING SUM(quantity_change) < 0
    LOOP
      delta := -consumed.net_change;

      SELECT current_stock, cost_per_unit
      INTO previous_stock, current_cost
      FROM public.inventory_items
      WHERE id = consumed.inventory_item_id
      FOR UPDATE;

      IF previous_stock IS NOT NULL AND delta > 0 THEN
        returned_stock := previous_stock + delta;

        UPDATE public.inventory_items
        SET current_stock = returned_stock,
            stock_version = stock_version + 1,
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
          reason_code,
          unit_cost_snapshot,
          order_number_snapshot,
          reference_label
        ) VALUES (
          consumed.inventory_item_id,
          NEW.id,
          'return',
          delta,
          'Reposición por cancelación',
          (SELECT auth.uid()),
          previous_stock,
          returned_stock,
          'order_cancelled',
          current_cost,
          NEW.number,
          'Pedido #' || NEW.number
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.return_inventory_for_deleted_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  consumed record;
  previous_stock numeric(14,4);
  returned_stock numeric(14,4);
BEGIN
  IF OLD.status IN ('paid', 'cancelled') THEN
    RETURN OLD;
  END IF;

  FOR consumed IN
    SELECT
      inventory_item_id,
      SUM(quantity_change)::numeric(14,4) AS net_change
    FROM public.inventory_movements
    WHERE order_id = OLD.id
      AND movement_type IN ('consumption', 'return')
    GROUP BY inventory_item_id
    HAVING SUM(quantity_change) < 0
  LOOP
    SELECT current_stock INTO previous_stock
    FROM public.inventory_items
    WHERE id = consumed.inventory_item_id
    FOR UPDATE;

    IF previous_stock IS NOT NULL THEN
      returned_stock := previous_stock - consumed.net_change;

      UPDATE public.inventory_items
      SET current_stock = returned_stock,
          stock_version = stock_version + 1,
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
        reason_code,
        unit_cost_snapshot,
        order_number_snapshot,
        reference_label
      )
      SELECT
        item.id,
        OLD.id,
        'return',
        -consumed.net_change,
        'Reposición por eliminación de pedido activo',
        (SELECT auth.uid()),
        previous_stock,
        returned_stock,
        'order_deleted',
        item.cost_per_unit,
        OLD.number,
        'Pedido #' || OLD.number
      FROM public.inventory_items AS item
      WHERE item.id = consumed.inventory_item_id;
    END IF;
  END LOOP;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_return_inventory_for_deleted_order ON public.orders;
CREATE TRIGGER trigger_return_inventory_for_deleted_order
  BEFORE DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.return_inventory_for_deleted_order();

REVOKE ALL ON FUNCTION private.consume_inventory_for_order_item() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_order_with_items(uuid, jsonb, integer, text, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_order_with_items(uuid, jsonb, integer, text, uuid, text)
  TO authenticated;
REVOKE ALL ON FUNCTION private.return_inventory_for_cancelled_order() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.return_inventory_for_deleted_order() FROM PUBLIC;
