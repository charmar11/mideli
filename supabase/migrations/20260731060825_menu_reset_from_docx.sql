-- Rebuild the menu from Menu_Mideli_Completo_Provisional.docx.
-- The source document does not include prices for Low Carb and four basic
-- drinks. Those values are retained from the previous approved catalog:
-- Low Carb 150, Limonada Natural 40, Limonada Mineral 45, Te Helado 40 and
-- Refrescos de temporada 30.
-- The current project has no orders, but this guard prevents this migration
-- from deleting live orders if it is ever tested against another database.

BEGIN;

DO $$
DECLARE
  existing_orders integer;
BEGIN
  SELECT count(*) INTO existing_orders FROM public.orders;
  IF existing_orders > 0 THEN
    RAISE EXCEPTION 'Menu reset aborted: public.orders contains % rows', existing_orders;
  END IF;
END $$;

DELETE FROM public.order_items;
DELETE FROM public.orders;
DELETE FROM public.menu_items;
DELETE FROM public.categories;

INSERT INTO public.categories (name, sort_order, is_active)
VALUES
  ('Hamburguesas', 1, true),
  ('Papas / Para Compartir', 2, true),
  ('Boneless y Alitas', 3, true),
  ('Sushis', 4, true),
  ('Bowls', 5, true),
  ('Toppings', 6, true),
  ('Bebidas', 7, true);

WITH catalog(category_name, item_name, description, price, sort_order, modifiers) AS (
  VALUES
    ('Hamburguesas', 'Sencilla', 'Incluye papas.', 135, 1, '[]'::jsonb),
    ('Hamburguesas', 'Doble', 'Incluye papas.', 160, 2, '[]'::jsonb),
    ('Hamburguesas', 'Triple', 'Incluye papas.', 190, 3, '[]'::jsonb),
    ('Hamburguesas', 'Low Carb', 'Lechuga en lugar de pan.', 150, 4, '[]'::jsonb),
    ('Hamburguesas', 'Burger Onion', '', 150, 5, '[]'::jsonb),

    ('Papas / Para Compartir', 'Extra', '', 40, 1, '[]'::jsonb),
    ('Papas / Para Compartir', 'Orden', '', 65, 2, '[]'::jsonb),
    ('Papas / Para Compartir', 'Animal Style', '', 75, 3, '[]'::jsonb),
    ('Papas / Para Compartir', 'Bacon Papas', '', 95, 4, '[]'::jsonb),
    ('Papas / Para Compartir', 'Ultimate', '', 105, 5, '[]'::jsonb),
    ('Papas / Para Compartir', 'Pizza Fries', '', 130, 6, '[]'::jsonb),
    ('Papas / Para Compartir', 'Buffalo Chicken Fries', '', 150, 7, '[]'::jsonb),
    ('Papas / Para Compartir', 'Taco Loaded Fries', '', 150, 8, '[]'::jsonb),

    (
      'Boneless y Alitas',
      'Boneless',
      '10 a 12 piezas.',
      159,
      1,
      '[{"name":"Presentación","options":[{"name":"Con papas","price":30},{"name":"Sin papas","price":0}],"required":true},{"name":"Sabor","options":[{"name":"Buffalo","price":0},{"name":"BBQ","price":0},{"name":"Buffalo Ranch","price":0},{"name":"Cajun","price":0},{"name":"Ajo Parmesano","price":0},{"name":"Honey Mustard","price":0}],"required":true}]'::jsonb
    ),
    (
      'Boneless y Alitas',
      'Alitas',
      '10 a 12 piezas.',
      159,
      2,
      '[{"name":"Presentación","options":[{"name":"Con papas","price":30},{"name":"Sin papas","price":0}],"required":true},{"name":"Sabor","options":[{"name":"Buffalo","price":0},{"name":"BBQ","price":0},{"name":"Buffalo Ranch","price":0},{"name":"Cajun","price":0},{"name":"Ajo Parmesano","price":0},{"name":"Honey Mustard","price":0}],"required":true}]'::jsonb
    ),

    (
      'Sushis',
      'California',
      'Res, pollo, camarón, tocino, tampico o surimi.',
      125,
      1,
      '[{"name":"Proteína","options":[{"name":"Res","price":0},{"name":"Pollo","price":0},{"name":"Camarón","price":0},{"name":"Tocino","price":0},{"name":"Tampico","price":0},{"name":"Surimi","price":0}],"required":true}]'::jsonb
    ),
    (
      'Sushis',
      'California Especial',
      'Atún o salmón.',
      145,
      2,
      '[{"name":"Proteína","options":[{"name":"Atún","price":0},{"name":"Salmón","price":0}],"required":true}]'::jsonb
    ),
    ('Sushis', 'California Atuna', 'Tampico y atún; ajonjolí negro.', 150, 3, '[]'::jsonb),
    ('Sushis', 'Rainbow Roll', 'Tampico y aguacate; salmón, atún y aguacate.', 160, 4, '[]'::jsonb),
    ('Sushis', 'Serranito Roll', 'Atún; topping de atún spicy, serrano y ajonjolí.', 175, 5, '[]'::jsonb),
    ('Sushis', 'Subarachi', 'Camarón; tampico y aguacate.', 145, 6, '[]'::jsonb),
    ('Sushis', 'Tres Ríos', 'Camarón roca spicy y cebollín.', 155, 7, '[]'::jsonb),
    ('Sushis', 'Mr. Crab', 'Surimi empanizado y camarón; topping de queso, zanahoria, surimi empanizado y spicy.', 175, 8, '[]'::jsonb),
    ('Sushis', 'Paradise', 'Salmón; láminas de atún y aguacate.', 160, 9, '[]'::jsonb),
    ('Sushis', 'Dracarys', 'Horneado; salmón empanizado, queso, tocino y spicy.', 185, 10, '[]'::jsonb),
    ('Sushis', 'Tokio Bacon Roll', 'Camarón; enrollado en tocino, frito y salsa de anguila.', 185, 11, '[]'::jsonb),
    ('Sushis', 'Vegas Roll', 'Salmón y tampico; alga y capeado.', 170, 12, '[]'::jsonb),
    ('Sushis', 'Cordon Blue Especial', 'Pollo; queso, serrano y tocino.', 155, 13, '[]'::jsonb),
    ('Sushis', 'Luigi', 'Tocino, carne, camarón empanizado, cebollín y queso gratinado.', 165, 14, '[]'::jsonb),
    ('Sushis', 'Avocado Roll', 'Camarón empanizado, tampico, tocino y aguacate.', 160, 15, '[]'::jsonb),

    ('Bowls', 'Pokebowl', '', 165, 1, '[]'::jsonb),
    ('Bowls', 'Yakimeshi', '', 175, 2, '[]'::jsonb),
    ('Bowls', 'Gohan', '', 175, 3, '[]'::jsonb),

    ('Toppings', 'Dracarys', 'Queso, tocino y spicy.', 30, 1, '[]'::jsonb),
    ('Toppings', 'Mr. Crab', 'Queso, zanahoria, surimi empanizado y spicy.', 35, 2, '[]'::jsonb),
    ('Toppings', 'Cordon Blue', 'Queso, tocino y serrano.', 30, 3, '[]'::jsonb),
    ('Toppings', 'Gratinado', 'Queso.', 25, 4, '[]'::jsonb),
    ('Toppings', 'Especial', 'Philadelphia y spicy.', 35, 5, '[]'::jsonb),

    ('Bebidas', 'Limonada Natural', '', 40, 1, '[]'::jsonb),
    ('Bebidas', 'Limonada Mineral', '', 45, 2, '[]'::jsonb),
    ('Bebidas', 'Té Helado', '', 40, 3, '[]'::jsonb),
    ('Bebidas', 'Malteadas', '', 75, 4, '[]'::jsonb),
    (
      'Bebidas',
      'Sodas Italianas',
      'Manzana Verde, Mora Azul o Frambuesa.',
      45,
      5,
      '[{"name":"Sabor","options":[{"name":"Manzana Verde","price":0},{"name":"Mora Azul","price":0},{"name":"Frambuesa","price":0}],"required":true}]'::jsonb
    ),
    ('Bebidas', 'Refrescos de temporada', '', 30, 6, '[]'::jsonb)
)
INSERT INTO public.menu_items (
  category_id,
  name,
  description,
  price,
  is_active,
  sort_order,
  modifiers,
  image_url
)
SELECT
  categories.id,
  catalog.item_name,
  catalog.description,
  catalog.price,
  true,
  catalog.sort_order,
  catalog.modifiers,
  ''
FROM catalog
JOIN public.categories AS categories
  ON categories.name = catalog.category_name;

COMMIT;
