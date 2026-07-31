-- Toppings are add-ons for sushi, not standalone menu products.
-- Move their prices into an optional modifier group on every sushi item.

BEGIN;

DO $$
DECLARE
  existing_orders integer;
BEGIN
  SELECT count(*) INTO existing_orders FROM public.orders;
  IF existing_orders > 0 THEN
    RAISE EXCEPTION 'Toppings migration aborted: public.orders contains % rows', existing_orders;
  END IF;
END $$;

DELETE FROM public.menu_items
WHERE category_id = (
  SELECT id FROM public.categories WHERE name = 'Toppings' LIMIT 1
);

DELETE FROM public.categories
WHERE name = 'Toppings';

UPDATE public.categories
SET sort_order = 6,
    updated_at = now()
WHERE name = 'Bebidas';

UPDATE public.menu_items AS menu_item
SET modifiers = COALESCE(menu_item.modifiers, '[]'::jsonb) ||
  '[{"name":"Toppings","options":[{"name":"Dracarys","price":30},{"name":"Mr. Crab","price":35},{"name":"Cordon Blue","price":30},{"name":"Gratinado","price":25},{"name":"Especial","price":35}],"required":false}]'::jsonb,
    updated_at = now()
WHERE menu_item.category_id = (
  SELECT id FROM public.categories WHERE name = 'Sushis' LIMIT 1
)
AND NOT EXISTS (
  SELECT 1
  FROM jsonb_array_elements(COALESCE(menu_item.modifiers, '[]'::jsonb)) AS modifier_group
  WHERE modifier_group->>'name' = 'Toppings'
);

COMMIT;
