-- Keep inventory operations inside the business selected by the operator.
-- The old inventory procedures remain the source of truth, but this gateway
-- supplies a transaction-local scope and validates every object boundary
-- before delegating to them.

CREATE OR REPLACE FUNCTION private.multibusiness_can_view_business(
  p_business_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_requested_business_id uuid;
BEGIN
  v_requested_business_id := private.multibusiness_requested_business_id();

  IF v_requested_business_id IS NOT NULL
     AND p_business_id IS DISTINCT FROM v_requested_business_id THEN
    RETURN false;
  END IF;

  RETURN auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.memberships AS membership
       WHERE membership.user_id = auth.uid()
         AND membership.status = 'active'
         AND (
           membership.scope_type = 'platform'
           OR membership.business_id = p_business_id
           OR EXISTS (
             SELECT 1
               FROM public.businesses AS business
              WHERE business.id = p_business_id
                AND business.organization_id = membership.organization_id
           )
         )
    );
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_assign_inventory_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.business_id IS NOT NULL
     AND NEW.business_id IS DISTINCT FROM OLD.business_id THEN
    RAISE EXCEPTION 'El negocio de un registro de inventario no se puede cambiar';
  END IF;

  IF NEW.business_id IS NULL THEN
    v_business_id := COALESCE(
      private.multibusiness_requested_business_id(),
      private.multibusiness_mideli_business_id()
    );
    IF v_business_id IS NULL THEN
      RAISE EXCEPTION 'No se encontró el negocio del inventario';
    END IF;
    NEW.business_id := v_business_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.businesses AS business
     WHERE business.id = NEW.business_id
       AND business.lifecycle_status NOT IN ('archived', 'retired')
  ) THEN
    RAISE EXCEPTION 'El negocio del inventario no está disponible';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_assign_receipt_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF NEW.purchase_order_id IS NOT NULL THEN
    SELECT purchase_order.business_id
      INTO v_business_id
      FROM public.inventory_purchase_orders AS purchase_order
     WHERE purchase_order.id = NEW.purchase_order_id;
  END IF;

  IF NEW.business_id IS NULL THEN
    NEW.business_id := COALESCE(
      v_business_id,
      private.multibusiness_requested_business_id(),
      private.multibusiness_mideli_business_id()
    );
  ELSIF v_business_id IS NOT NULL AND NEW.business_id IS DISTINCT FROM v_business_id THEN
    RAISE EXCEPTION 'El recibo no coincide con su orden de compra';
  END IF;

  IF NEW.business_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.businesses AS business
     WHERE business.id = NEW.business_id
       AND business.lifecycle_status NOT IN ('archived', 'retired')
  ) THEN
    RAISE EXCEPTION 'El negocio del recibo no está disponible';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_inventory_write_context(
  p_business_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.multibusiness_requested_business_id() = p_business_id
    AND private.multibusiness_has_capability(
      'business.manage_inventory',
      private.multibusiness_business_organization_id(p_business_id),
      p_business_id
    );
$$;

-- Write policies require the transaction-local context. Reads remain available
-- to the selected UI query, while an old RPC called directly without context
-- cannot update a record from another business.
DROP POLICY IF EXISTS multibusiness_inventory_items_manage ON public.inventory_items;
DROP POLICY IF EXISTS multibusiness_inventory_items_update ON public.inventory_items;
CREATE POLICY multibusiness_inventory_items_manage
  ON public.inventory_items FOR INSERT TO authenticated
  WITH CHECK (private.multibusiness_inventory_write_context(business_id));
CREATE POLICY multibusiness_inventory_items_update
  ON public.inventory_items FOR UPDATE TO authenticated
  USING (private.multibusiness_inventory_write_context(business_id))
  WITH CHECK (private.multibusiness_inventory_write_context(business_id));

DROP POLICY IF EXISTS multibusiness_inventory_recipes_manage ON public.inventory_recipes;
CREATE POLICY multibusiness_inventory_recipes_manage
  ON public.inventory_recipes FOR ALL TO authenticated
  USING (private.multibusiness_inventory_write_context(business_id))
  WITH CHECK (private.multibusiness_inventory_write_context(business_id));

DROP POLICY IF EXISTS multibusiness_inventory_movements_insert ON public.inventory_movements;
CREATE POLICY multibusiness_inventory_movements_insert
  ON public.inventory_movements FOR INSERT TO authenticated
  WITH CHECK (private.multibusiness_inventory_write_context(business_id));

DROP POLICY IF EXISTS multibusiness_inventory_counts_insert ON public.inventory_counts;
DROP POLICY IF EXISTS multibusiness_inventory_counts_update ON public.inventory_counts;
CREATE POLICY multibusiness_inventory_counts_insert
  ON public.inventory_counts FOR INSERT TO authenticated
  WITH CHECK (private.multibusiness_inventory_write_context(business_id));
CREATE POLICY multibusiness_inventory_counts_update
  ON public.inventory_counts FOR UPDATE TO authenticated
  USING (private.multibusiness_inventory_write_context(business_id))
  WITH CHECK (private.multibusiness_inventory_write_context(business_id));

DROP POLICY IF EXISTS multibusiness_inventory_count_lines_manage ON public.inventory_count_lines;
CREATE POLICY multibusiness_inventory_count_lines_manage
  ON public.inventory_count_lines FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.inventory_counts AS count_row
       WHERE count_row.id = inventory_count_lines.count_id
         AND private.multibusiness_inventory_write_context(count_row.business_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.inventory_counts AS count_row
       WHERE count_row.id = inventory_count_lines.count_id
         AND private.multibusiness_inventory_write_context(count_row.business_id)
    )
  );

DROP POLICY IF EXISTS multibusiness_inventory_purchase_orders_insert ON public.inventory_purchase_orders;
DROP POLICY IF EXISTS multibusiness_inventory_purchase_orders_update ON public.inventory_purchase_orders;
CREATE POLICY multibusiness_inventory_purchase_orders_insert
  ON public.inventory_purchase_orders FOR INSERT TO authenticated
  WITH CHECK (private.multibusiness_inventory_write_context(business_id));
CREATE POLICY multibusiness_inventory_purchase_orders_update
  ON public.inventory_purchase_orders FOR UPDATE TO authenticated
  USING (private.multibusiness_inventory_write_context(business_id))
  WITH CHECK (private.multibusiness_inventory_write_context(business_id));

DROP POLICY IF EXISTS multibusiness_inventory_purchase_lines_manage ON public.inventory_purchase_order_lines;
CREATE POLICY multibusiness_inventory_purchase_lines_manage
  ON public.inventory_purchase_order_lines FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.inventory_purchase_orders AS purchase_order
       WHERE purchase_order.id = inventory_purchase_order_lines.purchase_order_id
         AND private.multibusiness_inventory_write_context(purchase_order.business_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.inventory_purchase_orders AS purchase_order
       WHERE purchase_order.id = inventory_purchase_order_lines.purchase_order_id
         AND private.multibusiness_inventory_write_context(purchase_order.business_id)
    )
  );

DROP POLICY IF EXISTS multibusiness_inventory_receipts_insert ON public.inventory_receipts;
CREATE POLICY multibusiness_inventory_receipts_insert
  ON public.inventory_receipts FOR INSERT TO authenticated
  WITH CHECK (private.multibusiness_inventory_write_context(business_id));

DROP POLICY IF EXISTS multibusiness_inventory_receipt_lines_insert ON public.inventory_receipt_lines;
CREATE POLICY multibusiness_inventory_receipt_lines_insert
  ON public.inventory_receipt_lines FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.inventory_receipts AS receipt
       WHERE receipt.id = inventory_receipt_lines.receipt_id
         AND private.multibusiness_inventory_write_context(receipt.business_id)
    )
  );

DROP POLICY IF EXISTS multibusiness_inventory_lots_manage ON public.inventory_lots;
CREATE POLICY multibusiness_inventory_lots_manage
  ON public.inventory_lots FOR ALL TO authenticated
  USING (private.multibusiness_inventory_write_context(business_id))
  WITH CHECK (private.multibusiness_inventory_write_context(business_id));

ALTER FUNCTION public.record_inventory_movement(uuid, numeric, text, text, text)
  SECURITY INVOKER;
ALTER FUNCTION public.start_inventory_count(text) SECURITY INVOKER;
ALTER FUNCTION public.cancel_inventory_count(uuid) SECURITY INVOKER;
ALTER FUNCTION public.complete_inventory_count(uuid, jsonb, text) SECURITY INVOKER;
ALTER FUNCTION public.review_inventory_count(uuid) SECURITY INVOKER;
ALTER FUNCTION public.create_inventory_purchase_order(text, jsonb, text, timestamptz)
  SECURITY INVOKER;
ALTER FUNCTION public.receive_inventory(uuid, text, jsonb, text) SECURITY INVOKER;
ALTER FUNCTION public.replace_inventory_recipe(uuid, text, jsonb, boolean)
  SECURITY INVOKER;
ALTER FUNCTION public.delete_inventory_item_permanently(uuid, text)
  SECURITY INVOKER;

CREATE OR REPLACE FUNCTION public.multibusiness_inventory_action(
  p_business_id uuid,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_action text := lower(btrim(COALESCE(p_action, '')));
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_item_id uuid;
  v_menu_item_id uuid;
  v_count_id uuid;
  v_purchase_order_id uuid;
  v_result jsonb;
  v_result_text text;
  v_result_id uuid;
  v_components jsonb;
  v_menu_business_id uuid;
  v_component_count integer;
  v_movement public.inventory_movements%ROWTYPE;
  v_item public.inventory_items%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  IF jsonb_typeof(v_payload) <> 'object' THEN
    RAISE EXCEPTION 'Los datos de inventario deben enviarse como objeto';
  END IF;

  PERFORM private.multibusiness_require_business_capability(
    p_business_id,
    'business.manage_inventory'
  );
  PERFORM pg_catalog.set_config(
    'mideli.business_id',
    p_business_id::text,
    true
  );

  IF v_action = 'create_item' THEN
    INSERT INTO public.inventory_items (
      business_id,
      name,
      unit,
      current_stock,
      minimum_stock,
      target_stock,
      cost_per_unit,
      purchase_unit,
      purchase_conversion_factor,
      minimum_purchase_quantity,
      preferred_supplier,
      preferred_supplier_phone,
      storage_location,
      count_frequency_days,
      tracks_expiry,
      last_purchase_package_cost
    ) VALUES (
      p_business_id,
      COALESCE(v_payload->>'name', ''),
      COALESCE(v_payload->>'unit', ''),
      COALESCE((v_payload->>'current_stock')::numeric, 0),
      COALESCE((v_payload->>'minimum_stock')::numeric, 0),
      COALESCE((v_payload->>'target_stock')::numeric, 0),
      COALESCE((v_payload->>'cost_per_unit')::numeric, 0),
      COALESCE(v_payload->>'purchase_unit', ''),
      COALESCE((v_payload->>'purchase_conversion_factor')::numeric, 1),
      COALESCE((v_payload->>'minimum_purchase_quantity')::numeric, 1),
      COALESCE(v_payload->>'preferred_supplier', ''),
      COALESCE(v_payload->>'preferred_supplier_phone', ''),
      COALESCE(v_payload->>'storage_location', ''),
      COALESCE((v_payload->>'count_frequency_days')::integer, 7),
      COALESCE((v_payload->>'tracks_expiry')::boolean, false),
      COALESCE((v_payload->>'last_purchase_package_cost')::numeric, 0)
    )
    RETURNING * INTO v_item;
    RETURN to_jsonb(v_item);
  END IF;

  IF v_action = 'update_item' THEN
    v_item_id := (v_payload->>'inventory_item_id')::uuid;
    IF NOT EXISTS (
      SELECT 1
        FROM public.inventory_items AS item
       WHERE item.id = v_item_id
         AND item.business_id = p_business_id
    ) THEN
      RAISE EXCEPTION 'El insumo no pertenece al negocio seleccionado';
    END IF;

    UPDATE public.inventory_items AS item
       SET name = COALESCE(NULLIF(v_payload->>'name', ''), item.name),
           unit = COALESCE(NULLIF(v_payload->>'unit', ''), item.unit),
           current_stock = COALESCE((v_payload->>'current_stock')::numeric, item.current_stock),
           minimum_stock = COALESCE((v_payload->>'minimum_stock')::numeric, item.minimum_stock),
           target_stock = COALESCE((v_payload->>'target_stock')::numeric, item.target_stock),
           cost_per_unit = COALESCE((v_payload->>'cost_per_unit')::numeric, item.cost_per_unit),
           purchase_unit = COALESCE(NULLIF(v_payload->>'purchase_unit', ''), item.purchase_unit),
           purchase_conversion_factor = COALESCE((v_payload->>'purchase_conversion_factor')::numeric, item.purchase_conversion_factor),
           minimum_purchase_quantity = COALESCE((v_payload->>'minimum_purchase_quantity')::numeric, item.minimum_purchase_quantity),
           preferred_supplier = COALESCE(v_payload->>'preferred_supplier', item.preferred_supplier),
           preferred_supplier_phone = COALESCE(v_payload->>'preferred_supplier_phone', item.preferred_supplier_phone),
           storage_location = COALESCE(v_payload->>'storage_location', item.storage_location),
           count_frequency_days = COALESCE((v_payload->>'count_frequency_days')::integer, item.count_frequency_days),
           tracks_expiry = COALESCE((v_payload->>'tracks_expiry')::boolean, item.tracks_expiry),
           last_purchase_package_cost = COALESCE((v_payload->>'last_purchase_package_cost')::numeric, item.last_purchase_package_cost),
           is_active = COALESCE((v_payload->>'is_active')::boolean, item.is_active),
           updated_at = now()
     WHERE item.id = v_item_id
       AND item.business_id = p_business_id
    RETURNING item.* INTO v_item;
    RETURN to_jsonb(v_item);
  END IF;

  IF v_action = 'delete_item' THEN
    v_item_id := (v_payload->>'inventory_item_id')::uuid;
    IF NOT EXISTS (
      SELECT 1
        FROM public.inventory_items AS item
       WHERE item.id = v_item_id
         AND item.business_id = p_business_id
    ) THEN
      RAISE EXCEPTION 'El insumo no pertenece al negocio seleccionado';
    END IF;

    SELECT private.delete_inventory_item_permanently(
      v_item_id,
      v_payload->>'confirmation'
    ) INTO v_result;
    RETURN v_result;
  END IF;

  IF v_action = 'movement' THEN
    v_item_id := (v_payload->>'inventory_item_id')::uuid;
    IF NOT EXISTS (
      SELECT 1
        FROM public.inventory_items AS item
       WHERE item.id = v_item_id
         AND item.business_id = p_business_id
    ) THEN
      RAISE EXCEPTION 'El insumo no pertenece al negocio seleccionado';
    END IF;

    SELECT * INTO v_movement
      FROM public.record_inventory_movement(
        v_item_id,
        (v_payload->>'quantity_change')::numeric,
        v_payload->>'movement_type',
        COALESCE(v_payload->>'reason_code', ''),
        COALESCE(v_payload->>'note', '')
      );
    RETURN to_jsonb(v_movement);
  END IF;

  IF v_action = 'replace_recipe' THEN
    v_menu_item_id := (v_payload->>'menu_item_id')::uuid;
    v_components := COALESCE(v_payload->'components', '[]'::jsonb);

    SELECT menu_item.business_id
      INTO v_menu_business_id
      FROM public.menu_items AS menu_item
     WHERE menu_item.id = v_menu_item_id;
    IF v_menu_business_id IS DISTINCT FROM p_business_id THEN
      RAISE EXCEPTION 'El producto no pertenece al negocio seleccionado';
    END IF;

    IF jsonb_typeof(v_components) <> 'array' THEN
      RAISE EXCEPTION 'Los ingredientes deben enviarse como una lista';
    END IF;

    SELECT count(*)
      INTO v_component_count
      FROM jsonb_to_recordset(v_components) AS component(
        inventory_item_id uuid,
        quantity numeric
      )
      JOIN public.inventory_items AS item
        ON item.id = component.inventory_item_id
       AND item.business_id = p_business_id
       AND item.is_active;

    IF v_component_count <> jsonb_array_length(v_components) THEN
      RAISE EXCEPTION 'Uno o más ingredientes no pertenecen al negocio seleccionado';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(saved)), '[]'::jsonb)
      INTO v_result
      FROM public.replace_inventory_recipe(
        v_menu_item_id,
        NULLIF(v_payload->>'modifier_option_id', ''),
        v_components,
        COALESCE((v_payload->>'delete_recipe')::boolean, false)
      ) AS saved;
    RETURN v_result;
  END IF;

  IF v_action = 'start_count' THEN
    SELECT public.start_inventory_count(
      COALESCE(NULLIF(v_payload->>'scope', ''), 'full')
    ) INTO v_result_id;
    RETURN to_jsonb(v_result_id);
  END IF;

  IF v_action IN ('cancel_count', 'complete_count', 'review_count') THEN
    v_count_id := (v_payload->>'count_id')::uuid;
    IF NOT EXISTS (
      SELECT 1
        FROM public.inventory_counts AS count_row
       WHERE count_row.id = v_count_id
         AND count_row.business_id = p_business_id
    ) THEN
      RAISE EXCEPTION 'El conteo no pertenece al negocio seleccionado';
    END IF;

    IF v_action = 'cancel_count' THEN
      PERFORM public.cancel_inventory_count(v_count_id);
      RETURN jsonb_build_object('ok', true);
    ELSIF v_action = 'complete_count' THEN
      SELECT public.complete_inventory_count(
        v_count_id,
        COALESCE(v_payload->'lines', '[]'::jsonb),
        COALESCE(v_payload->>'notes', '')
      ) INTO v_result_text;
      RETURN to_jsonb(v_result_text);
    ELSE
      PERFORM public.review_inventory_count(v_count_id);
      RETURN jsonb_build_object('ok', true);
    END IF;
  END IF;

  IF v_action = 'create_purchase' THEN
    SELECT public.create_inventory_purchase_order(
      COALESCE(v_payload->>'supplier', ''),
      COALESCE(v_payload->'lines', '[]'::jsonb),
      COALESCE(v_payload->>'notes', ''),
      NULLIF(v_payload->>'expected_at', '')::timestamptz
    ) INTO v_result_id;
    RETURN to_jsonb(v_result_id);
  END IF;

  IF v_action = 'receive_inventory' THEN
    v_purchase_order_id := NULLIF(v_payload->>'purchase_order_id', '')::uuid;
    IF v_purchase_order_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
        FROM public.inventory_purchase_orders AS purchase_order
       WHERE purchase_order.id = v_purchase_order_id
         AND purchase_order.business_id = p_business_id
    ) THEN
      RAISE EXCEPTION 'La compra no pertenece al negocio seleccionado';
    END IF;

    SELECT public.receive_inventory(
      v_purchase_order_id,
      COALESCE(v_payload->>'supplier', ''),
      COALESCE(v_payload->'lines', '[]'::jsonb),
      COALESCE(v_payload->>'notes', '')
    ) INTO v_result_id;
    RETURN to_jsonb(v_result_id);
  END IF;

  RAISE EXCEPTION 'Acción de inventario no permitida';
END;
$$;

REVOKE ALL ON FUNCTION public.multibusiness_inventory_action(uuid, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.multibusiness_inventory_action(uuid, text, jsonb)
  TO authenticated;

-- Legacy authenticated procedures remain callable only for the gradual
-- rollout. Their writes now require the transaction-local context policies
-- above; the permanently destructive public wrapper is disabled because its
-- protected implementation intentionally bypasses RLS.
REVOKE ALL ON FUNCTION public.delete_inventory_item_permanently(uuid, text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.multibusiness_can_view_business(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_assign_inventory_scope()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_assign_receipt_scope()
  FROM PUBLIC, anon, authenticated;
