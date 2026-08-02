-- Replace one product recipe target atomically.
-- Existing direct table grants remain for compatibility with the deployed client.

CREATE OR REPLACE FUNCTION public.replace_inventory_recipe(
  p_menu_item_id uuid,
  p_modifier_option_id text DEFAULT NULL,
  p_components jsonb DEFAULT '[]'::jsonb,
  p_delete boolean DEFAULT false
)
RETURNS SETOF public.inventory_recipes
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_modifiers jsonb;
  v_modifier_group_id text;
  v_modifier_group_name text;
  v_modifier_option_name text;
  v_component_count integer;
  v_active_item_count integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT (SELECT public.is_admin()) THEN
    RAISE EXCEPTION 'Solo administración puede modificar recetas'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(COALESCE(p_components, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Los ingredientes deben enviarse como una lista'
      USING ERRCODE = '22023';
  END IF;

  SELECT menu_item.modifiers
  INTO v_modifiers
  FROM public.menu_items AS menu_item
  WHERE menu_item.id = p_menu_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El producto seleccionado ya no existe'
      USING ERRCODE = 'P0002';
  END IF;

  IF NULLIF(p_modifier_option_id, '') IS NOT NULL THEN
    SELECT
      modifier_group->>'id',
      modifier_group->>'name',
      modifier_option->>'name'
    INTO
      v_modifier_group_id,
      v_modifier_group_name,
      v_modifier_option_name
    FROM jsonb_array_elements(COALESCE(v_modifiers, '[]'::jsonb)) AS modifier_group
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(modifier_group->'options', '[]'::jsonb)
    ) AS modifier_option
    WHERE modifier_option->>'id' = p_modifier_option_id
    LIMIT 1;

    IF v_modifier_option_name IS NULL THEN
      RAISE EXCEPTION 'La opción seleccionada ya no existe en el producto'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  v_component_count := jsonb_array_length(COALESCE(p_components, '[]'::jsonb));

  IF p_delete AND v_component_count > 0 THEN
    RAISE EXCEPTION 'Para eliminar una receta no envíes ingredientes'
      USING ERRCODE = '22023';
  END IF;

  IF NOT p_delete AND v_component_count = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un ingrediente antes de guardar'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_components, '[]'::jsonb)) AS component
    WHERE jsonb_typeof(component) <> 'object'
       OR COALESCE(component->>'inventory_item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR COALESCE(component->>'quantity', '') !~ '^[0-9]+([.][0-9]{1,4})?$'
       OR (component->>'quantity')::numeric <= 0
  ) THEN
    RAISE EXCEPTION 'Revisa los ingredientes y sus cantidades'
      USING ERRCODE = '23514';
  END IF;

  IF (
    SELECT count(*)
    FROM (
      SELECT component->>'inventory_item_id'
      FROM jsonb_array_elements(COALESCE(p_components, '[]'::jsonb)) AS component
      GROUP BY component->>'inventory_item_id'
      HAVING count(*) > 1
    ) AS duplicate_items
  ) > 0 THEN
    RAISE EXCEPTION 'Un ingrediente no puede aparecer dos veces en la misma receta'
      USING ERRCODE = '23505';
  END IF;

  SELECT count(inventory_item.id)
  INTO v_active_item_count
  FROM jsonb_array_elements(COALESCE(p_components, '[]'::jsonb)) AS component
  JOIN public.inventory_items AS inventory_item
    ON inventory_item.id = (component->>'inventory_item_id')::uuid
   AND inventory_item.is_active;

  IF v_active_item_count <> v_component_count THEN
    RAISE EXCEPTION 'Uno o más ingredientes ya no están disponibles'
      USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.inventory_recipes AS recipe
  WHERE recipe.menu_item_id = p_menu_item_id
    AND (
      (NULLIF(p_modifier_option_id, '') IS NULL AND recipe.modifier_option_id IS NULL)
      OR recipe.modifier_option_id = NULLIF(p_modifier_option_id, '')
    );

  IF NOT p_delete THEN
    INSERT INTO public.inventory_recipes (
      menu_item_id,
      inventory_item_id,
      quantity,
      modifier_group_id,
      modifier_option_id,
      modifier_group_name,
      modifier_option_name
    )
    SELECT
      p_menu_item_id,
      (component->>'inventory_item_id')::uuid,
      (component->>'quantity')::numeric(14,4),
      v_modifier_group_id,
      NULLIF(p_modifier_option_id, ''),
      v_modifier_group_name,
      v_modifier_option_name
    FROM jsonb_array_elements(p_components) AS component;
  END IF;

  RETURN QUERY
  SELECT recipe.*
  FROM public.inventory_recipes AS recipe
  WHERE recipe.menu_item_id = p_menu_item_id
    AND (
      (NULLIF(p_modifier_option_id, '') IS NULL AND recipe.modifier_option_id IS NULL)
      OR recipe.modifier_option_id = NULLIF(p_modifier_option_id, '')
    )
  ORDER BY recipe.created_at, recipe.inventory_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_inventory_recipe(uuid, text, jsonb, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_inventory_recipe(uuid, text, jsonb, boolean)
  TO authenticated;
