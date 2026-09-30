-- Product availability within the menu is separate from whether the product
-- is active. Gifts belong to a component in one specific combo definition.
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS sale_mode text NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS source_catalog_id text;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS source_catalog_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.menu_items'::regclass
       AND conname = 'menu_items_sale_mode_check'
  ) THEN
    ALTER TABLE public.menu_items
      ADD CONSTRAINT menu_items_sale_mode_check
      CHECK (sale_mode IN ('both', 'standalone_only', 'combo_only'));
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS menu_items_business_source_catalog_id_uq
  ON public.menu_items (business_id, source_catalog_id)
  WHERE source_catalog_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS categories_business_source_catalog_id_uq
  ON public.categories (business_id, source_catalog_id)
  WHERE source_catalog_id IS NOT NULL;

-- Keep combo definitions valid when a component is changed after it was
-- configured. This is authoritative even if a client bypasses the editor.
CREATE OR REPLACE FUNCTION private.validate_menu_item_sale_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_combo AND NEW.sale_mode = 'combo_only' THEN
    RAISE EXCEPTION
      'Un combo debe poder venderse desde el menú; usa solo combo para sus componentes';
  END IF;

  IF (
    NOT NEW.is_active
    OR NEW.is_combo
    OR NEW.sale_mode = 'standalone_only'
  ) AND EXISTS (
    SELECT 1
      FROM public.menu_items AS parent
     WHERE parent.id <> NEW.id
       AND parent.business_id = NEW.business_id
       AND parent.is_combo
       AND (
         EXISTS (
           SELECT 1
             FROM pg_catalog.jsonb_array_elements(
               COALESCE(parent.combo_definition->'fixed_components', '[]'::jsonb)
             ) AS fixed_component(value)
            WHERE fixed_component.value->>'menu_item_id' = NEW.id::text
         )
         OR EXISTS (
           SELECT 1
             FROM pg_catalog.jsonb_array_elements(
               COALESCE(parent.combo_definition->'choice_groups', '[]'::jsonb)
             ) AS choice_group(value)
             CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
               COALESCE(choice_group.value->'options', '[]'::jsonb)
             ) AS choice_option(value)
            WHERE choice_option.value->>'menu_item_id' = NEW.id::text
         )
       )
  ) THEN
    RAISE EXCEPTION
      'Este producto está incluido en un combo; primero actualiza ese combo antes de desactivarlo o cambiar dónde se vende';
  END IF;

  IF NEW.is_combo AND (
    EXISTS (
      SELECT 1
        FROM pg_catalog.jsonb_array_elements(
          COALESCE(NEW.combo_definition->'fixed_components', '[]'::jsonb)
        ) AS fixed_component(value)
        JOIN public.menu_items AS component
          ON component.id = (fixed_component.value->>'menu_item_id')::uuid
       WHERE component.business_id IS DISTINCT FROM NEW.business_id
          OR NOT component.is_active
          OR component.is_combo
          OR component.sale_mode = 'standalone_only'
    )
    OR EXISTS (
      SELECT 1
        FROM pg_catalog.jsonb_array_elements(
          COALESCE(NEW.combo_definition->'choice_groups', '[]'::jsonb)
        ) AS choice_group(value)
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
          COALESCE(choice_group.value->'options', '[]'::jsonb)
        ) AS choice_option(value)
        JOIN public.menu_items AS component
          ON component.id = (choice_option.value->>'menu_item_id')::uuid
       WHERE component.business_id IS DISTINCT FROM NEW.business_id
          OR NOT component.is_active
          OR component.is_combo
          OR component.sale_mode = 'standalone_only'
    )
  ) THEN
    RAISE EXCEPTION
      'Los componentes de un combo deben estar activos y permitidos como componente del mismo negocio';
  END IF;

  IF NEW.is_combo AND EXISTS (
    SELECT 1
      FROM pg_catalog.jsonb_array_elements(
        COALESCE(NEW.combo_definition->'choice_groups', '[]'::jsonb)
      ) AS choice_group(value)
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
        COALESCE(choice_group.value->'options', '[]'::jsonb)
      ) AS choice_option(value)
     WHERE COALESCE((choice_option.value->>'is_gift')::boolean, false)
       AND COALESCE((choice_option.value->>'price_adjustment')::integer, 0) <> 0
  ) THEN
    RAISE EXCEPTION 'Una opción marcada como regalo no puede tener un cargo extra';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS menu_items_validate_sale_policy ON public.menu_items;
CREATE TRIGGER menu_items_validate_sale_policy
  BEFORE INSERT OR UPDATE OF is_active, is_combo, sale_mode, business_id, combo_definition
  ON public.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_menu_item_sale_policy();

REVOKE ALL ON FUNCTION private.validate_menu_item_sale_policy()
  FROM PUBLIC, anon, authenticated;

-- The normal order-item trigger canonicalizes client input first. This later
-- trigger blocks direct sale of combo-only products and snapshots gift status
-- from the trusted combo definition, never from the submitted JSON.
CREATE OR REPLACE FUNCTION private.enforce_menu_item_sale_mode_and_snapshot_gifts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sale_mode text;
  v_is_combo boolean;
  v_definition jsonb;
  v_selection jsonb;
  v_group_id text;
  v_component jsonb;
  v_choice_group jsonb;
  v_choice_option jsonb;
  v_is_gift boolean;
  v_option_label text;
  v_canonical jsonb := '[]'::jsonb;
BEGIN
  SELECT menu_item.sale_mode, menu_item.is_combo, menu_item.combo_definition
    INTO v_sale_mode, v_is_combo, v_definition
    FROM public.menu_items AS menu_item
   WHERE menu_item.id = NEW.menu_item_id;

  IF v_sale_mode = 'combo_only' THEN
    RAISE EXCEPTION 'Este producto sólo puede venderse dentro de un combo';
  END IF;

  IF pg_catalog.jsonb_typeof(COALESCE(NEW.selected_modifiers, '[]'::jsonb)) <> 'array' THEN
    RETURN NEW;
  END IF;

  FOR v_selection IN
    SELECT value
      FROM pg_catalog.jsonb_array_elements(COALESCE(NEW.selected_modifiers, '[]'::jsonb))
  LOOP
    v_group_id := COALESCE(v_selection->>'group_id', '');
    v_component := NULL;
    v_choice_group := NULL;
    v_choice_option := NULL;
    v_is_gift := false;

    IF v_is_combo AND v_group_id LIKE 'combo-fixed:%' THEN
      SELECT value
        INTO v_component
        FROM pg_catalog.jsonb_array_elements(
          COALESCE(v_definition->'fixed_components', '[]'::jsonb)
        ) AS fixed_component(value)
       WHERE value->>'id' = pg_catalog.substr(
               v_group_id, pg_catalog.length('combo-fixed:') + 1
             )
         AND value->>'menu_item_id' = v_selection->>'option_id'
       LIMIT 1;
      v_is_gift := COALESCE((v_component->>'is_gift')::boolean, false);
    ELSIF v_is_combo AND v_group_id LIKE 'combo-choice:%' THEN
      SELECT value
        INTO v_choice_group
        FROM pg_catalog.jsonb_array_elements(
          COALESCE(v_definition->'choice_groups', '[]'::jsonb)
        ) AS choice_group(value)
       WHERE value->>'id' = pg_catalog.substr(
               v_group_id, pg_catalog.length('combo-choice:') + 1
             )
       LIMIT 1;

      SELECT value
        INTO v_choice_option
        FROM pg_catalog.jsonb_array_elements(
          COALESCE(v_choice_group->'options', '[]'::jsonb)
        ) AS choice_option(value)
       WHERE value->>'id' = v_selection->>'option_id'
       LIMIT 1;
      v_is_gift := COALESCE((v_choice_option->>'is_gift')::boolean, false);
    END IF;

    -- Remove any client-provided marker, then add the database-owned value.
    v_selection := v_selection - 'combo_component_is_gift';
    IF v_is_gift THEN
      v_selection := pg_catalog.jsonb_set(
        v_selection,
        '{combo_component_is_gift}',
        'true'::jsonb,
        true
      );
      v_option_label := v_selection->>'option';
      IF v_option_label IS NOT NULL
         AND pg_catalog.right(v_option_label, 8) <> ' (Regalo)' THEN
        v_selection := pg_catalog.jsonb_set(
          v_selection,
          '{option}',
          pg_catalog.to_jsonb(v_option_label || ' (Regalo)'),
          true
        );
      END IF;
    END IF;

    v_canonical := v_canonical || pg_catalog.jsonb_build_array(v_selection);
  END LOOP;

  NEW.selected_modifiers := v_canonical;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_order_items_sale_mode_and_gift_snapshot
  ON public.order_items;
CREATE TRIGGER zzz_order_items_sale_mode_and_gift_snapshot
  BEFORE INSERT OR UPDATE OF menu_item_id, order_id, selected_modifiers
  ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_menu_item_sale_mode_and_snapshot_gifts();

REVOKE ALL ON FUNCTION private.enforce_menu_item_sale_mode_and_snapshot_gifts()
  FROM PUBLIC, anon, authenticated;
