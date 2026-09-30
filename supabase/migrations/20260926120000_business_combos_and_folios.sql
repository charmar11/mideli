-- Catalog combos remain one sellable order line, while the selected component
-- snapshots drive kitchen display and inventory consumption. Operational
-- folios advance independently inside each business.

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_combo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS combo_definition jsonb NOT NULL
    DEFAULT '{"fixed_components":[],"choice_groups":[]}'::jsonb;

ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_combo_definition_shape_check
  CHECK (
    jsonb_typeof(combo_definition) = 'object'
    AND jsonb_typeof(combo_definition->'fixed_components') = 'array'
    AND jsonb_typeof(combo_definition->'choice_groups') = 'array'
  );

CREATE OR REPLACE FUNCTION private.validate_menu_item_combo_definition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_component jsonb;
  v_group jsonb;
  v_option jsonb;
  v_product public.menu_items%ROWTYPE;
  v_component_id uuid;
  v_quantity integer;
  v_adjustment integer;
  v_referenced boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.menu_items AS combo
       WHERE combo.is_combo
         AND combo.id <> OLD.id
         AND combo.business_id = OLD.business_id
         AND (
           EXISTS (
             SELECT 1
               FROM jsonb_array_elements(combo.combo_definition->'fixed_components') AS fixed
              WHERE fixed->>'menu_item_id' = OLD.id::text
           )
           OR EXISTS (
             SELECT 1
               FROM jsonb_array_elements(combo.combo_definition->'choice_groups') AS group_row
               CROSS JOIN LATERAL jsonb_array_elements(group_row->'options') AS option_row
              WHERE option_row->>'menu_item_id' = OLD.id::text
           )
         )
    ) INTO v_referenced;
    IF v_referenced THEN
      RAISE EXCEPTION
        'Este producto está incluido en un combo. Quita primero esa referencia.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT NEW.is_active
       OR NEW.is_combo
       OR (OLD.is_combo AND NOT NEW.is_combo)
       OR NEW.business_id IS DISTINCT FROM OLD.business_id THEN
      SELECT EXISTS (
        SELECT 1
          FROM public.menu_items AS combo
         WHERE combo.is_combo
           AND combo.id <> OLD.id
           AND combo.business_id = OLD.business_id
           AND (
             EXISTS (
               SELECT 1
                 FROM jsonb_array_elements(combo.combo_definition->'fixed_components') AS fixed
                WHERE fixed->>'menu_item_id' = OLD.id::text
             )
             OR EXISTS (
               SELECT 1
                 FROM jsonb_array_elements(combo.combo_definition->'choice_groups') AS group_row
                 CROSS JOIN LATERAL jsonb_array_elements(group_row->'options') AS option_row
                WHERE option_row->>'menu_item_id' = OLD.id::text
             )
           )
      ) INTO v_referenced;
      IF v_referenced THEN
        RAISE EXCEPTION
          'Este producto está incluido en un combo. Quita primero esa referencia.';
      END IF;
    END IF;
  END IF;

  IF NOT NEW.is_combo THEN
    NEW.combo_definition := '{"fixed_components":[],"choice_groups":[]}'::jsonb;
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.combo_definition) IS DISTINCT FROM 'object'
     OR jsonb_typeof(NEW.combo_definition->'fixed_components') IS DISTINCT FROM 'array'
     OR jsonb_typeof(NEW.combo_definition->'choice_groups') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'La definición del combo no es válida';
  END IF;

  IF jsonb_array_length(NEW.combo_definition->'fixed_components') = 0
     AND jsonb_array_length(NEW.combo_definition->'choice_groups') = 0 THEN
    RAISE EXCEPTION 'El combo debe tener al menos un componente u opción';
  END IF;

  IF jsonb_array_length(NEW.combo_definition->'fixed_components') > 100
     OR jsonb_array_length(NEW.combo_definition->'choice_groups') > 30 THEN
    RAISE EXCEPTION 'El combo supera el límite de componentes u opciones';
  END IF;

  IF jsonb_array_length(COALESCE(NEW.modifiers, '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'Un combo no puede tener variaciones propias';
  END IF;

  FOR v_component IN
    SELECT value FROM jsonb_array_elements(NEW.combo_definition->'fixed_components')
  LOOP
    BEGIN
      v_component_id := (v_component->>'menu_item_id')::uuid;
      v_quantity := (v_component->>'quantity')::integer;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Un componente fijo del combo no es válido';
    END;

    IF NULLIF(btrim(v_component->>'id'), '') IS NULL
       OR length(v_component->>'id') > 100
       OR v_quantity < 1 OR v_quantity > 20 THEN
      RAISE EXCEPTION 'Un componente fijo del combo no es válido';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM jsonb_array_elements(NEW.combo_definition->'fixed_components') AS other_component
       WHERE other_component->>'id' = v_component->>'id'
       GROUP BY other_component->>'id'
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'Los componentes fijos del combo deben tener identificadores únicos';
    END IF;

    SELECT * INTO v_product
      FROM public.menu_items AS product
     WHERE product.id = v_component_id
       AND product.business_id = NEW.business_id
       AND product.is_active
       AND NOT product.is_combo;

    IF v_product.id IS NULL THEN
      RAISE EXCEPTION 'Los componentes deben ser productos activos del mismo negocio';
    END IF;
  END LOOP;

  FOR v_group IN
    SELECT value FROM jsonb_array_elements(NEW.combo_definition->'choice_groups')
  LOOP
    IF NULLIF(btrim(v_group->>'id'), '') IS NULL
       OR length(v_group->>'id') > 100
       OR NULLIF(btrim(v_group->>'name'), '') IS NULL
       OR length(v_group->>'name') > 100
       OR jsonb_typeof(v_group->'options') IS DISTINCT FROM 'array'
       OR jsonb_typeof(v_group->'required') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Un grupo de opciones del combo no es válido';
    END IF;

    IF jsonb_array_length(v_group->'options') = 0 THEN
      RAISE EXCEPTION 'Un grupo de opciones del combo no puede estar vacío';
    END IF;

    IF jsonb_array_length(v_group->'options') > 100
       OR EXISTS (
         SELECT 1
           FROM jsonb_array_elements(NEW.combo_definition->'choice_groups') AS other_group
          WHERE other_group->>'id' = v_group->>'id'
          GROUP BY other_group->>'id'
         HAVING count(*) > 1
       ) THEN
      RAISE EXCEPTION 'Los grupos de opciones del combo no son válidos';
    END IF;

    FOR v_option IN
      SELECT value FROM jsonb_array_elements(v_group->'options')
    LOOP
      BEGIN
        v_component_id := (v_option->>'menu_item_id')::uuid;
        v_quantity := (v_option->>'quantity')::integer;
        v_adjustment := COALESCE((v_option->>'price_adjustment')::integer, 0);
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Una opción del combo no es válida';
      END;

      IF NULLIF(btrim(v_option->>'id'), '') IS NULL
         OR length(v_option->>'id') > 100
         OR length(COALESCE(v_option->>'label', '')) > 160
         OR v_quantity < 1 OR v_quantity > 20
         OR v_adjustment < 0 OR v_adjustment > 100000 THEN
        RAISE EXCEPTION 'Una opción del combo no es válida';
      END IF;

      IF EXISTS (
        SELECT 1
          FROM jsonb_array_elements(v_group->'options') AS other_option
         WHERE other_option->>'id' = v_option->>'id'
         GROUP BY other_option->>'id'
        HAVING count(*) > 1
      ) THEN
        RAISE EXCEPTION 'Las opciones del combo deben tener identificadores únicos';
      END IF;

      SELECT * INTO v_product
        FROM public.menu_items AS product
       WHERE product.id = v_component_id
         AND product.business_id = NEW.business_id
         AND product.is_active
         AND NOT product.is_combo;

      IF v_product.id IS NULL THEN
        RAISE EXCEPTION 'Las opciones deben ser productos activos del mismo negocio';
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS menu_items_validate_combo_definition ON public.menu_items;
CREATE TRIGGER menu_items_validate_combo_definition
  BEFORE INSERT OR UPDATE OR DELETE ON public.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_menu_item_combo_definition();

REVOKE ALL ON FUNCTION private.validate_menu_item_combo_definition()
  FROM PUBLIC, anon, authenticated;

-- Canonicalize fixed pieces and choices from the catalog definition. Names,
-- quantities, products and surcharges are always read from the database.
CREATE OR REPLACE FUNCTION private.multibusiness_canonicalize_order_item(
  p_item jsonb
)
RETURNS TABLE (
  menu_item_id uuid,
  business_id uuid,
  quantity integer,
  unit_price integer,
  notes text,
  selected_modifiers jsonb,
  line_total bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_menu_item_id uuid;
  v_quantity integer;
  v_menu_item public.menu_items%ROWTYPE;
  v_component_item public.menu_items%ROWTYPE;
  v_selected jsonb;
  v_submitted jsonb;
  v_group jsonb;
  v_option jsonb;
  v_combo_component jsonb;
  v_combo_group jsonb;
  v_combo_option jsonb;
  v_canonical jsonb := '[]'::jsonb;
  v_group_id text;
  v_option_id text;
  v_component_quantity integer;
  v_component_id uuid;
  v_group_count integer;
  v_minimum integer;
  v_maximum integer;
  v_modifier_total bigint := 0;
  v_unit_price integer;
  v_component_name text;
BEGIN
  IF jsonb_typeof(p_item) <> 'object' THEN
    RAISE EXCEPTION 'Una línea del pedido no es válida';
  END IF;

  BEGIN
    v_menu_item_id := (p_item->>'menu_item_id')::uuid;
    v_quantity := COALESCE((p_item->>'quantity')::integer, 1);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Un producto contiene datos no válidos';
  END;

  IF v_quantity < 1 OR v_quantity > 99 THEN
    RAISE EXCEPTION 'Cantidad de producto no válida';
  END IF;

  SELECT menu_item.*
    INTO v_menu_item
    FROM public.menu_items AS menu_item
    LEFT JOIN public.categories AS category
      ON category.id = menu_item.category_id
   WHERE menu_item.id = v_menu_item_id
     AND menu_item.is_active
     AND menu_item.business_id IS NOT NULL
     AND (menu_item.category_id IS NULL OR category.is_active)
     AND (
       menu_item.category_id IS NULL
       OR category.business_id = menu_item.business_id
     );

  IF v_menu_item.id IS NULL THEN
    RAISE EXCEPTION 'Uno de los productos ya no está disponible';
  END IF;

  v_selected := COALESCE(p_item->'selected_modifiers', '[]'::jsonb);
  IF v_selected = 'null'::jsonb THEN
    v_selected := '[]'::jsonb;
  END IF;
  IF jsonb_typeof(v_selected) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Las variaciones del producto no son válidas';
  END IF;

  FOR v_submitted IN
    SELECT value FROM jsonb_array_elements(v_selected)
  LOOP
    IF jsonb_typeof(v_submitted) <> 'object' THEN
      RAISE EXCEPTION 'Una variación del producto no es válida';
    END IF;

    v_group_id := NULLIF(v_submitted->>'group_id', '');
    v_option_id := NULLIF(v_submitted->>'option_id', '');

    IF v_group_id LIKE 'combo-fixed:%' THEN
      IF NOT v_menu_item.is_combo THEN
        RAISE EXCEPTION 'Este producto no acepta componentes de combo';
      END IF;

      SELECT value INTO v_combo_component
        FROM jsonb_array_elements(v_menu_item.combo_definition->'fixed_components')
       WHERE value->>'id' = substring(v_group_id FROM length('combo-fixed:') + 1)
         AND value->>'menu_item_id' = v_option_id;

      IF v_combo_component IS NULL THEN
        RAISE EXCEPTION 'Un componente fijo ya no pertenece al combo';
      END IF;

      v_component_id := (v_combo_component->>'menu_item_id')::uuid;
      v_component_quantity := (v_combo_component->>'quantity')::integer;
      SELECT * INTO v_component_item
        FROM public.menu_items AS component
       WHERE component.id = v_component_id
         AND component.business_id = v_menu_item.business_id
         AND component.is_active
         AND NOT component.is_combo;

      IF v_component_item.id IS NULL THEN
        RAISE EXCEPTION 'Un componente del combo ya no está disponible';
      END IF;
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_canonical) AS selected
         WHERE selected->>'group_id' = v_group_id
      ) THEN
        RAISE EXCEPTION 'Un componente del combo está repetido';
      END IF;

      v_canonical := v_canonical || jsonb_build_array(jsonb_build_object(
        'group_id', v_group_id,
        'option_id', v_component_id,
        'group', 'Incluye',
        'option', v_component_quantity::text || ' × ' || v_component_item.name,
        'price', 0,
        'combo_component_menu_item_id', v_component_id,
        'combo_component_quantity', v_component_quantity
      ));
      CONTINUE;
    ELSIF v_group_id LIKE 'combo-choice:%' THEN
      IF NOT v_menu_item.is_combo THEN
        RAISE EXCEPTION 'Este producto no acepta opciones de combo';
      END IF;

      SELECT value INTO v_combo_group
        FROM jsonb_array_elements(v_menu_item.combo_definition->'choice_groups')
       WHERE value->>'id' = substring(v_group_id FROM length('combo-choice:') + 1);
      IF v_combo_group IS NULL THEN
        RAISE EXCEPTION 'Un grupo de opciones ya no pertenece al combo';
      END IF;

      SELECT value INTO v_combo_option
        FROM jsonb_array_elements(v_combo_group->'options')
       WHERE value->>'id' = v_option_id;
      IF v_combo_option IS NULL THEN
        RAISE EXCEPTION 'Una opción ya no pertenece al combo';
      END IF;

      v_component_id := (v_combo_option->>'menu_item_id')::uuid;
      v_component_quantity := (v_combo_option->>'quantity')::integer;
      v_component_name := COALESCE(NULLIF(btrim(v_combo_option->>'label'), ''), '');
      SELECT * INTO v_component_item
        FROM public.menu_items AS component
       WHERE component.id = v_component_id
         AND component.business_id = v_menu_item.business_id
         AND component.is_active
         AND NOT component.is_combo;

      IF v_component_item.id IS NULL THEN
        RAISE EXCEPTION 'Una opción del combo ya no está disponible';
      END IF;
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_canonical) AS selected
         WHERE selected->>'group_id' = v_group_id
      ) THEN
        RAISE EXCEPTION 'Elige una sola opción por grupo del combo';
      END IF;

      v_canonical := v_canonical || jsonb_build_array(jsonb_build_object(
        'group_id', v_group_id,
        'option_id', v_option_id,
        'group', v_combo_group->>'name',
        'option', v_component_quantity::text || ' × ' ||
          COALESCE(NULLIF(v_component_name, ''), v_component_item.name),
        'price', COALESCE((v_combo_option->>'price_adjustment')::integer, 0),
        'description', CASE
          WHEN NULLIF(v_component_name, '') IS NOT NULL
            AND v_component_name <> v_component_item.name
          THEN v_component_item.name ELSE '' END,
        'combo_component_menu_item_id', v_component_id,
        'combo_component_quantity', v_component_quantity
      ));
      CONTINUE;
    END IF;

    v_group := NULL;
    SELECT candidate
      INTO v_group
      FROM jsonb_array_elements(COALESCE(v_menu_item.modifiers, '[]'::jsonb)) AS candidate
     WHERE (
       v_group_id IS NOT NULL
       AND candidate->>'id' = v_group_id
     )
     OR (
       v_group_id IS NULL
       AND lower(candidate->>'name') = lower(COALESCE(v_submitted->>'group', ''))
       AND NULLIF(candidate->>'name', '') IS NOT NULL
     )
     LIMIT 1;

    IF v_group IS NULL THEN
      RAISE EXCEPTION 'Una variación no pertenece al producto';
    END IF;

    v_option := NULL;
    SELECT candidate
      INTO v_option
      FROM jsonb_array_elements(COALESCE(v_group->'options', '[]'::jsonb)) AS candidate
     WHERE (
       v_option_id IS NOT NULL
       AND candidate->>'id' = v_option_id
     )
     OR (
       v_option_id IS NULL
       AND lower(candidate->>'name') = lower(COALESCE(v_submitted->>'option', ''))
       AND NULLIF(candidate->>'name', '') IS NOT NULL
     )
     LIMIT 1;

    IF v_option IS NULL THEN
      RAISE EXCEPTION 'Una opción no pertenece al producto';
    END IF;

    v_group_id := NULLIF(v_group->>'id', '');
    v_option_id := NULLIF(v_option->>'id', '');
    IF EXISTS (
      SELECT 1
        FROM jsonb_array_elements(v_canonical) AS selected
       WHERE (
         v_option_id IS NOT NULL
         AND selected->>'option_id' = v_option_id
       )
       OR (
         v_option_id IS NULL
         AND lower(selected->>'group') = lower(v_group->>'name')
         AND lower(selected->>'option') = lower(v_option->>'name')
       )
    ) THEN
      RAISE EXCEPTION 'Una opción está repetida';
    END IF;

    v_canonical := v_canonical || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'group_id', v_group_id,
        'option_id', v_option_id,
        'group', v_group->>'name',
        'option', v_option->>'name',
        'price', COALESCE((v_option->>'price')::integer, 0),
        'description', COALESCE(v_option->>'description', '')
      ))
    );
  END LOOP;

  IF v_menu_item.is_combo THEN
    IF jsonb_array_length(v_menu_item.combo_definition->'fixed_components') <>
       (SELECT count(*)::integer
          FROM jsonb_array_elements(v_canonical) AS selected
         WHERE selected->>'group_id' LIKE 'combo-fixed:%') THEN
      RAISE EXCEPTION 'Falta un componente fijo del combo';
    END IF;

    FOR v_combo_group IN
      SELECT value FROM jsonb_array_elements(v_menu_item.combo_definition->'choice_groups')
    LOOP
      SELECT count(*)::integer
        INTO v_group_count
        FROM jsonb_array_elements(v_canonical) AS selected
       WHERE selected->>'group_id' = 'combo-choice:' || (v_combo_group->>'id');

      IF v_group_count > 1
         OR (COALESCE((v_combo_group->>'required')::boolean, false) AND v_group_count <> 1) THEN
        RAISE EXCEPTION 'Elige una opción válida para cada grupo obligatorio del combo';
      END IF;
    END LOOP;
  END IF;

  FOR v_group IN
    SELECT value FROM jsonb_array_elements(COALESCE(v_menu_item.modifiers, '[]'::jsonb))
  LOOP
    SELECT count(*)::integer
      INTO v_group_count
      FROM jsonb_array_elements(v_canonical) AS selected
     WHERE (
       NULLIF(v_group->>'id', '') IS NOT NULL
       AND selected->>'group_id' = v_group->>'id'
     )
     OR (
       NULLIF(v_group->>'id', '') IS NULL
       AND lower(selected->>'group') = lower(v_group->>'name')
     );

    v_minimum := CASE
      WHEN COALESCE((v_group->>'required')::boolean, false)
        THEN GREATEST(1, COALESCE((v_group->>'min_selections')::integer, 1))
      ELSE COALESCE((v_group->>'min_selections')::integer, 0)
    END;
    v_maximum := CASE
      WHEN COALESCE(v_group->>'selection_mode', 'single') = 'single' THEN 1
      WHEN NULLIF(v_group->>'max_selections', '') IS NULL THEN 1000
      ELSE (v_group->>'max_selections')::integer
    END;

    IF v_group_count < v_minimum OR v_group_count > v_maximum THEN
      RAISE EXCEPTION 'Falta completar correctamente una variación requerida';
    END IF;
  END LOOP;

  SELECT COALESCE(sum((selected->>'price')::bigint), 0)::bigint
    INTO v_modifier_total
    FROM jsonb_array_elements(v_canonical) AS selected;

  v_unit_price := v_menu_item.price;
  IF v_unit_price::bigint + v_modifier_total > 2147483647 THEN
    RAISE EXCEPTION 'El precio del combo excede el límite permitido';
  END IF;

  RETURN QUERY SELECT
    v_menu_item.id,
    v_menu_item.business_id,
    v_quantity,
    v_unit_price,
    left(COALESCE(p_item->>'notes', ''), 500),
    v_canonical,
    ((v_unit_price::bigint + v_modifier_total) * v_quantity);
END;
$$;

REVOKE ALL ON FUNCTION private.multibusiness_canonicalize_order_item(jsonb)
  FROM PUBLIC, anon, authenticated;

-- The table also has an authenticated INSERT policy for compatibility with
-- existing clients. Canonicalize again in the row trigger so direct inserts
-- cannot forge combo components, modifiers, quantities, or unit prices.
CREATE OR REPLACE FUNCTION private.multibusiness_validate_order_item_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order_business_id uuid;
  v_item_business_id uuid;
  v_canonical_item_id uuid;
  v_canonical_quantity integer;
  v_canonical_unit_price integer;
  v_canonical_notes text;
  v_canonical_modifiers jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.menu_item_id IS NOT DISTINCT FROM OLD.menu_item_id
       AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity
       AND NEW.unit_price IS NOT DISTINCT FROM OLD.unit_price
       AND NEW.selected_modifiers IS NOT DISTINCT FROM OLD.selected_modifiers THEN
      SELECT order_row.business_id, menu_item.business_id
        INTO v_order_business_id, v_item_business_id
        FROM public.orders AS order_row
        JOIN public.menu_items AS menu_item ON menu_item.id = NEW.menu_item_id
       WHERE order_row.id = NEW.order_id;
      IF v_order_business_id IS NULL OR v_item_business_id IS NULL
         OR v_order_business_id IS DISTINCT FROM v_item_business_id THEN
        RAISE EXCEPTION
          'No se pueden mezclar productos de distintos negocios en un pedido';
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  SELECT order_row.business_id
    INTO v_order_business_id
    FROM public.orders AS order_row
   WHERE order_row.id = NEW.order_id;

  SELECT canonical.menu_item_id,
         canonical.business_id,
         canonical.quantity,
         canonical.unit_price,
         canonical.notes,
         canonical.selected_modifiers
    INTO v_canonical_item_id,
         v_item_business_id,
         v_canonical_quantity,
         v_canonical_unit_price,
         v_canonical_notes,
         v_canonical_modifiers
    FROM private.multibusiness_canonicalize_order_item(jsonb_build_object(
      'menu_item_id', NEW.menu_item_id,
      'quantity', NEW.quantity,
      'notes', NEW.notes,
      'selected_modifiers', NEW.selected_modifiers
    )) AS canonical;

  IF v_order_business_id IS NULL OR v_item_business_id IS NULL THEN
    RAISE EXCEPTION 'El pedido y el producto deben pertenecer a un negocio';
  END IF;
  IF v_order_business_id IS DISTINCT FROM v_item_business_id THEN
    RAISE EXCEPTION
      'No se pueden mezclar productos de distintos negocios en un pedido';
  END IF;

  NEW.menu_item_id := v_canonical_item_id;
  NEW.quantity := v_canonical_quantity;
  NEW.unit_price := v_canonical_unit_price;
  NEW.notes := v_canonical_notes;
  NEW.selected_modifiers := v_canonical_modifiers;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.multibusiness_validate_order_item_business()
  FROM PUBLIC, anon, authenticated;

-- Combos consume the recipes of each selected component, not the recipe of
-- the parent price-bearing menu item. Component and option IDs were already
-- validated and snapshotted by the order RPC.
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
    SELECT component.inventory_item_id,
           SUM(component.quantity)::numeric(14,4) AS quantity
      FROM (
        SELECT inventory_item_id, quantity
          FROM public.inventory_recipes
         WHERE menu_item_id = NEW.menu_item_id
           AND modifier_option_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM public.menu_items AS parent
              WHERE parent.id = NEW.menu_item_id AND parent.is_combo
           )
        UNION ALL
        SELECT configured.inventory_item_id, configured.quantity
          FROM public.inventory_recipes AS configured
         WHERE configured.menu_item_id = NEW.menu_item_id
           AND configured.modifier_option_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM public.menu_items AS parent
              WHERE parent.id = NEW.menu_item_id AND parent.is_combo
           )
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
        UNION ALL
        SELECT configured.inventory_item_id,
               configured.quantity *
                 (selected->>'combo_component_quantity')::numeric AS quantity
          FROM jsonb_array_elements(COALESCE(NEW.selected_modifiers, '[]'::jsonb)) AS selected
          JOIN public.inventory_recipes AS configured
            ON configured.menu_item_id =
               (selected->>'combo_component_menu_item_id')::uuid
           AND configured.modifier_option_id IS NULL
         WHERE NULLIF(selected->>'combo_component_menu_item_id', '') IS NOT NULL
           AND NULLIF(selected->>'combo_component_quantity', '') IS NOT NULL
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

REVOKE ALL ON FUNCTION private.consume_inventory_for_order_item()
  FROM PUBLIC, anon, authenticated;

-- Each counter holds the last issued number. The upsert serializes concurrent
-- orders/cash operations for the same business without a global lock.
CREATE TABLE private.business_document_counters (
  business_id uuid NOT NULL
    REFERENCES public.businesses(id) ON DELETE RESTRICT,
  document_kind text NOT NULL
    CHECK (document_kind IN ('order', 'cash_shift', 'payment')),
  last_issued_number bigint NOT NULL DEFAULT 0
    CHECK (last_issued_number >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, document_kind)
);

REVOKE ALL ON private.business_document_counters FROM PUBLIC, anon, authenticated;

INSERT INTO private.business_document_counters (
  business_id, document_kind, last_issued_number
)
SELECT business_id, 'order', COALESCE(MAX(number), 0)::bigint
  FROM public.orders
 GROUP BY business_id
ON CONFLICT (business_id, document_kind) DO UPDATE
  SET last_issued_number = GREATEST(
        private.business_document_counters.last_issued_number,
        EXCLUDED.last_issued_number
      ),
      updated_at = now();

INSERT INTO private.business_document_counters (
  business_id, document_kind, last_issued_number
)
SELECT business_id, 'cash_shift', COALESCE(MAX(number), 0)::bigint
  FROM public.cash_shifts
 GROUP BY business_id
ON CONFLICT (business_id, document_kind) DO UPDATE
  SET last_issued_number = GREATEST(
        private.business_document_counters.last_issued_number,
        EXCLUDED.last_issued_number
      ),
      updated_at = now();

INSERT INTO private.business_document_counters (
  business_id, document_kind, last_issued_number
)
SELECT business_id, 'payment', COALESCE(MAX(folio), 0)::bigint
  FROM public.payment_transactions
 GROUP BY business_id
ON CONFLICT (business_id, document_kind) DO UPDATE
  SET last_issued_number = GREATEST(
        private.business_document_counters.last_issued_number,
        EXCLUDED.last_issued_number
      ),
      updated_at = now();

CREATE OR REPLACE FUNCTION private.next_business_document_number(
  p_business_id uuid,
  p_document_kind text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private
AS $$
DECLARE
  v_number bigint;
BEGIN
  IF p_business_id IS NULL
     OR p_document_kind NOT IN ('order', 'cash_shift', 'payment') THEN
    RAISE EXCEPTION 'No se pudo asignar el folio del negocio';
  END IF;

  INSERT INTO private.business_document_counters AS counter (
    business_id, document_kind, last_issued_number
  ) VALUES (p_business_id, p_document_kind, 1)
  ON CONFLICT (business_id, document_kind) DO UPDATE
    SET last_issued_number = counter.last_issued_number + 1,
        updated_at = now()
  RETURNING last_issued_number INTO v_number;

  IF v_number IS NULL THEN
    RAISE EXCEPTION 'No se pudo asignar el folio del negocio';
  END IF;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION private.assign_order_folio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private
AS $$
DECLARE
  v_number bigint;
BEGIN
  v_number := private.next_business_document_number(NEW.business_id, 'order');
  IF v_number > 2147483647 THEN
    RAISE EXCEPTION 'Se agotaron los folios de pedidos de este negocio';
  END IF;
  NEW.number := v_number::integer;
  RETURN NEW;
END;
$$;

ALTER TABLE public.cash_shifts
  ALTER COLUMN number DROP IDENTITY IF EXISTS;
ALTER TABLE public.cash_shifts
  DROP CONSTRAINT IF EXISTS cash_shifts_number_key;
ALTER TABLE public.cash_shifts
  ADD CONSTRAINT cash_shifts_business_number_key UNIQUE (business_id, number);

CREATE OR REPLACE FUNCTION private.assign_cash_shift_business_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private
AS $$
BEGIN
  NEW.number := private.next_business_document_number(NEW.business_id, 'cash_shift');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cash_shifts_assign_business_number ON public.cash_shifts;
CREATE TRIGGER cash_shifts_assign_business_number
  BEFORE INSERT ON public.cash_shifts
  FOR EACH ROW
  EXECUTE FUNCTION private.assign_cash_shift_business_number();

ALTER TABLE public.payment_transactions
  ALTER COLUMN folio DROP IDENTITY IF EXISTS;
ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_folio_key;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_business_folio_key UNIQUE (business_id, folio);

CREATE OR REPLACE FUNCTION private.assign_payment_business_folio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private
AS $$
BEGIN
  NEW.folio := private.next_business_document_number(NEW.business_id, 'payment');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_transactions_assign_business_folio
  ON public.payment_transactions;
CREATE TRIGGER payment_transactions_assign_business_folio
  BEFORE INSERT ON public.payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION private.assign_payment_business_folio();

DROP INDEX IF EXISTS public.orders_number_key;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_business_number_key UNIQUE (business_id, number);

REVOKE ALL ON FUNCTION private.next_business_document_number(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.assign_order_folio()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.assign_cash_shift_business_number()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.assign_payment_business_folio()
  FROM PUBLIC, anon, authenticated;
