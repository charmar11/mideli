-- Add the ingredient details from the source menu to sushi topping options.
-- Toppings remain optional modifier options, not standalone menu products.

BEGIN;

DO $$
DECLARE
  existing_orders integer;
BEGIN
  SELECT count(*) INTO existing_orders FROM public.orders;
  IF existing_orders > 0 THEN
    RAISE EXCEPTION 'Topping descriptions migration aborted: public.orders contains % rows', existing_orders;
  END IF;
END $$;

UPDATE public.menu_items AS menu_item
SET modifiers = (
  SELECT jsonb_agg(
    CASE
      WHEN modifier_group->>'name' = 'Toppings' THEN
        jsonb_set(
          modifier_group,
          '{options}',
          (
            SELECT jsonb_agg(
              CASE option_item->>'name'
                WHEN 'Dracarys' THEN jsonb_set(option_item, '{description}', to_jsonb('Queso, tocino y spicy'::text))
                WHEN 'Mr. Crab' THEN jsonb_set(option_item, '{description}', to_jsonb('Queso, zanahoria, surimi empanizado y spicy'::text))
                WHEN 'Cordon Blue' THEN jsonb_set(option_item, '{description}', to_jsonb('Queso, tocino y serrano'::text))
                WHEN 'Gratinado' THEN jsonb_set(option_item, '{description}', to_jsonb('Queso'::text))
                WHEN 'Especial' THEN jsonb_set(option_item, '{description}', to_jsonb('Philadelphia y spicy'::text))
                ELSE option_item
              END
            )
            FROM jsonb_array_elements(modifier_group->'options') AS option_item
          )
        )
      ELSE modifier_group
    END
  )
  FROM jsonb_array_elements(COALESCE(menu_item.modifiers, '[]'::jsonb)) AS modifier_group
),
updated_at = now()
WHERE menu_item.category_id = (
  SELECT id FROM public.categories WHERE name = 'Sushis' LIMIT 1
)
AND EXISTS (
  SELECT 1
  FROM jsonb_array_elements(COALESCE(menu_item.modifiers, '[]'::jsonb)) AS modifier_group
  WHERE modifier_group->>'name' = 'Toppings'
);

COMMIT;
