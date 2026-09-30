-- One-time, idempotent Firebase catalog import. This migration is deliberately
-- data-only and scoped to Just Dipping. It never touches orders, inventory,
-- cash shifts, payments, or any Mideli row.
DO $$
DECLARE
  v_business_id uuid;
  v_count integer;
  v_exact_count integer;
BEGIN
  SELECT business.id
    INTO STRICT v_business_id
    FROM public.businesses AS business
   WHERE business.slug = 'just-dipping'
     AND business.lifecycle_status = 'active';

  -- Reuse the lone seed product only when it is an unambiguous match to the
  -- source identity (name, price, active state, empty modifiers and old Box
  -- category). Any other pre-existing same-name row stops the import safely.
  SELECT count(*)::integer,
         count(*) FILTER (
           WHERE menu_item.price = 110
             AND menu_item.is_active
             AND menu_item.description = ''
             AND menu_item.modifiers = '[]'::jsonb
             AND NOT menu_item.is_combo
             AND menu_item.sale_mode = 'both'
             AND category.name IN ('Box', 'Box Combos')
         )::integer
    INTO v_count, v_exact_count
    FROM public.menu_items AS menu_item
    LEFT JOIN public.categories AS category ON category.id = menu_item.category_id
   WHERE menu_item.business_id = v_business_id
     AND lower(menu_item.name) = lower('Regular Box')
     AND menu_item.source_catalog_id IS NULL;

  IF v_count > 1 OR (v_count = 1 AND v_exact_count <> 1) THEN
    RAISE EXCEPTION
      'No se importó Just Dipping: el producto Regular Box existente no coincide de forma segura';
  END IF;

  -- Avoid duplicate products if the catalog has been partly entered by hand.
  IF EXISTS (
    SELECT 1
      FROM public.menu_items AS menu_item
     WHERE menu_item.business_id = v_business_id
       AND menu_item.source_catalog_id IS NULL
       AND lower(menu_item.name) = ANY (ARRAY[
         lower('Chicken finger'), lower('Sprite'), lower('Dipping Burger'),
         lower('Limonada de fresa'), lower('Cambio a mac en promo'),
         lower('Coca'), lower('Mac&chesse'), lower('Munchies fries'),
         lower('Chicken Bbq'), lower('Mostaza miel'), lower('Ranch parmesano'),
         lower('Spicy jalapeño'), lower('Promo Martes'), lower('Agua natural'),
         lower('Dipping sauce'), lower('Limonada'), lower('Te helado'),
         lower('Texas toast'), lower('Supreme box'), lower('Mega Box'),
         lower('Munchies Burger'), lower('Cheesecake de Tortuga'),
         lower('Fanta'), lower('Coca Zero'), lower('Promo Jueves'),
         lower('Coleslaw'), lower('Promo Lunes')
       ])
  ) THEN
    RAISE EXCEPTION
      'No se importó Just Dipping: ya existe un producto del catálogo fuente sin vínculo verificable';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.categories AS category
     WHERE category.business_id = v_business_id
       AND category.source_catalog_id IS NULL
       AND lower(category.name) IN (
         'bebidas', 'box combos', 'postre', 'aderezos',
         'burgers', 'extras', 'promociones'
       )
     GROUP BY lower(category.name)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'No se importó Just Dipping: hay categorías duplicadas con un nombre del catálogo fuente';
  END IF;

  -- Map Firebase's "Box Combos" category onto the existing "Box" category
  -- only when it is the exact, sole category of the verified seed product.
  UPDATE public.categories AS category
     SET name = 'Box Combos',
         sort_order = 0,
         is_active = true,
         source_catalog_id = '67524e41-4d74-40ac-a192-94eeb949fe45'
    FROM public.menu_items AS regular_box
   WHERE category.id = regular_box.category_id
     AND category.business_id = v_business_id
     AND regular_box.business_id = v_business_id
     AND lower(category.name) = 'box'
     AND category.source_catalog_id IS NULL
     AND regular_box.source_catalog_id IS NULL
     AND regular_box.name = 'Regular Box'
     AND regular_box.price = 110
     AND regular_box.is_active
     AND regular_box.description = ''
     AND regular_box.modifiers = '[]'::jsonb
     AND NOT regular_box.is_combo
     AND regular_box.sale_mode = 'both'
     AND NOT EXISTS (
       SELECT 1
         FROM public.menu_items AS other_item
        WHERE other_item.business_id = v_business_id
          AND other_item.category_id = category.id
          AND other_item.id <> regular_box.id
     );

  -- Category document IDs are retained as source_catalog_id. The three source
  -- category IDs that were human-readable slugs receive stable UUIDs here.
  UPDATE public.categories AS category
     SET name = source.name,
         sort_order = source.sort_order,
         is_active = source.is_active,
         source_catalog_id = source.source_id
    FROM (VALUES
      ('016f6391-f0f2-4d58-959e-421bc875578c', '016f6391-f0f2-4d58-959e-421bc875578c'::uuid, 'Bebidas', 2, true),
      ('67524e41-4d74-40ac-a192-94eeb949fe45', '67524e41-4d74-40ac-a192-94eeb949fe45'::uuid, 'Box Combos', 0, true),
      ('8218876b-f65f-4f7b-b8c3-df0ecb6717ac', '8218876b-f65f-4f7b-b8c3-df0ecb6717ac'::uuid, 'Postre', 6, false),
      ('aderezos', '70b79015-e98f-45b2-a152-742167183004'::uuid, 'Aderezos', 3, false),
      ('d31de24f-21b0-49fe-a3ee-0a658a85a377', 'd31de24f-21b0-49fe-a3ee-0a658a85a377'::uuid, 'Burgers', 1, true),
      ('extras', '8e8df6a3-c482-4f72-a658-c8de5b301005'::uuid, 'Extras', 4, true),
      ('promociones', '55ad64bd-978f-4ebf-9d4e-97ae6922e006'::uuid, 'Promociones', 3, true)
    ) AS source(source_id, id, name, sort_order, is_active)
   WHERE category.business_id = v_business_id
     AND lower(category.name) = lower(source.name)
     AND category.source_catalog_id IS NULL;

  INSERT INTO public.categories (
    id, business_id, name, sort_order, is_active, source_catalog_id
  )
  SELECT source.id, v_business_id, source.name, source.sort_order,
         source.is_active, source.source_id
    FROM (VALUES
      ('016f6391-f0f2-4d58-959e-421bc875578c', '016f6391-f0f2-4d58-959e-421bc875578c'::uuid, 'Bebidas', 2, true),
      ('67524e41-4d74-40ac-a192-94eeb949fe45', '67524e41-4d74-40ac-a192-94eeb949fe45'::uuid, 'Box Combos', 0, true),
      ('8218876b-f65f-4f7b-b8c3-df0ecb6717ac', '8218876b-f65f-4f7b-b8c3-df0ecb6717ac'::uuid, 'Postre', 6, false),
      ('aderezos', '70b79015-e98f-45b2-a152-742167183004'::uuid, 'Aderezos', 3, false),
      ('d31de24f-21b0-49fe-a3ee-0a658a85a377', 'd31de24f-21b0-49fe-a3ee-0a658a85a377'::uuid, 'Burgers', 1, true),
      ('extras', '8e8df6a3-c482-4f72-a658-c8de5b301005'::uuid, 'Extras', 4, true),
      ('promociones', '55ad64bd-978f-4ebf-9d4e-97ae6922e006'::uuid, 'Promociones', 3, true)
    ) AS source(source_id, id, name, sort_order, is_active)
   WHERE NOT EXISTS (
           SELECT 1 FROM public.categories AS linked
            WHERE linked.business_id = v_business_id
              AND linked.source_catalog_id = source.source_id
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.categories AS same_name
            WHERE same_name.business_id = v_business_id
              AND lower(same_name.name) = lower(source.name)
         )
  ON CONFLICT DO NOTHING;

  IF (SELECT count(*) FROM public.categories AS category
       WHERE category.business_id = v_business_id
         AND category.source_catalog_id IS NOT NULL) <> 7 THEN
    RAISE EXCEPTION
      'No se importó Just Dipping: las siete categorías fuente no pudieron vincularse sin ambigüedad';
  END IF;

  -- Map the verified Regular Box row to its Firebase identity; keep its ID and
  -- image untouched while bringing over the source description/category.
  UPDATE public.menu_items AS regular_box
     SET source_catalog_id = '318de2a7-9dc0-4748-961c-57e5d7055121',
         category_id = category.id,
         description = '3pz chicken fingers, Texas toast, papas, 2oz Dipping sauce',
         sort_order = 0
    FROM public.categories AS category
   WHERE category.business_id = v_business_id
     AND category.source_catalog_id = '67524e41-4d74-40ac-a192-94eeb949fe45'
     AND regular_box.business_id = v_business_id
     AND regular_box.source_catalog_id IS NULL
     AND regular_box.name = 'Regular Box'
     AND regular_box.price = 110
     AND regular_box.is_active
     AND regular_box.description = ''
     AND regular_box.modifiers = '[]'::jsonb
     AND NOT regular_box.is_combo
     AND regular_box.sale_mode = 'both'
     AND regular_box.category_id IN (
       SELECT prior_category.id
         FROM public.categories AS prior_category
        WHERE prior_category.business_id = v_business_id
          AND prior_category.name IN ('Box', 'Box Combos')
     );

  IF EXISTS (
    SELECT 1
      FROM public.menu_items AS item
     WHERE item.id = ANY (ARRAY[
       '06e5b680-a4a8-4893-8ecb-2b3b930b4d6e'::uuid,
       '103d991e-a02e-45d3-bc2d-b292149ae90d'::uuid,
       '19a7bc53-bccd-46ca-8dcf-9a82efe9ef82'::uuid,
       '301571c2-76c4-4038-9703-baafc457d1dc'::uuid,
       '318de2a7-9dc0-4748-961c-57e5d7055121'::uuid,
       '41dcf8cb-d348-4c21-9e3e-95c5c34abef7'::uuid,
       '52635ae4-8c57-4437-9cac-b8857a766df9'::uuid,
       '53d23791-f4e0-46fa-8046-eee4fe9460ca'::uuid,
       '55448f8c-4f1f-4f87-98e9-ea893422c20a'::uuid,
       '6025bafe-8511-400d-8e91-3d0223ac250e'::uuid,
       '611d1183-47bd-448f-80be-2be53317d9ce'::uuid,
       '63360eb0-8d32-4497-bc86-7de84241e9b9'::uuid,
       '64cac371-1dac-4511-bd36-09e7a3056818'::uuid,
       '67b94a98-7cd1-4d2f-8362-f0feda7387b7'::uuid,
       '6b943b54-bf0e-4622-8f84-792b52010302'::uuid,
       '7170c315-c0d2-48a4-a6aa-30ef5fda2757'::uuid,
       '82066d9a-732b-4528-8465-1b07745a5180'::uuid,
       '8558ef49-635c-4605-b81b-17797e16ca04'::uuid,
       '914e4099-c614-4ec2-9015-bd09afd6777e'::uuid,
       '95c915f7-6811-403f-9833-1eb5face78d3'::uuid,
       'a207494f-f2d7-49a2-a386-ee1d037494b6'::uuid,
       'a7dc9a2d-b235-40cd-92a8-6dd8d2cd4ba0'::uuid,
       'a87659ee-5463-4a67-9147-af8cde3a9ca2'::uuid,
       'aadcaf93-7476-4d17-b16c-04c1e3868197'::uuid,
       'd0aa5f94-53a6-4798-89ad-de43a69ded69'::uuid,
       'd5fe6d3c-08bf-428a-8edb-9a545ed2cabd'::uuid,
       'e7e246cd-181b-4e08-b7e4-1c61c385fef7'::uuid,
       'f49d6317-76b8-47dd-9ffc-2666a0bd9262'::uuid
     ])
       AND (item.business_id <> v_business_id
            OR item.source_catalog_id IS DISTINCT FROM item.id::text)
  ) THEN
    RAISE EXCEPTION
      'No se importó Just Dipping: un identificador fuente ya pertenece a otro producto';
  END IF;

  INSERT INTO public.menu_items (
    id, business_id, category_id, name, description, price, is_active,
    sort_order, modifiers, is_combo, combo_definition, sale_mode,
    source_catalog_id
  )
  SELECT source.id,
         v_business_id,
         category.id,
         source.name,
         source.description,
         source.price,
         source.is_active,
         source.sort_order,
         source.modifiers,
         false,
         '{"fixed_components": [], "choice_groups": []}'::jsonb,
         source.sale_mode,
         source.source_id
    FROM (VALUES
      ('06e5b680-a4a8-4893-8ecb-2b3b930b4d6e', '06e5b680-a4a8-4893-8ecb-2b3b930b4d6e'::uuid, 'Chicken finger', '1pz extra', 30, 'extras', 12, true, false, 'both', '[]'::jsonb),
      ('103d991e-a02e-45d3-bc2d-b292149ae90d', '103d991e-a02e-45d3-bc2d-b292149ae90d'::uuid, 'Sprite', '', 30, '016f6391-f0f2-4d58-959e-421bc875578c', 29, true, false, 'both', '[]'::jsonb),
      ('19a7bc53-bccd-46ca-8dcf-9a82efe9ef82', '19a7bc53-bccd-46ca-8dcf-9a82efe9ef82'::uuid, 'Dipping Burger', '3pz chicken fingers, lechuga, tomate y Dipping sauce', 120, 'd31de24f-21b0-49fe-a3ee-0a658a85a377', 4, true, false, 'both', '[]'::jsonb),
      ('301571c2-76c4-4038-9703-baafc457d1dc', '301571c2-76c4-4038-9703-baafc457d1dc'::uuid, 'Limonada de fresa', '', 30, '016f6391-f0f2-4d58-959e-421bc875578c', 9, true, false, 'both', '[{"id":"227d8f09-462a-4a3a-b9ac-1ff146cd01ea","name":"Tamaño","required":true,"selection_mode":"single","min_selections":1,"max_selections":1,"options":[{"id":"6cde8998-025f-42fe-9b27-168dcc09661d","name":"Chico (ch)","price":0},{"id":"62bbe70d-9f01-4659-a60f-5ea39b4f1812","name":"Grande (gr)","price":20}]}]'::jsonb),
      ('318de2a7-9dc0-4748-961c-57e5d7055121', '318de2a7-9dc0-4748-961c-57e5d7055121'::uuid, 'Regular Box', '3pz chicken fingers, Texas toast, papas, 2oz Dipping sauce', 110, '67524e41-4d74-40ac-a192-94eeb949fe45', 0, true, false, 'both', '[]'::jsonb),
      ('41dcf8cb-d348-4c21-9e3e-95c5c34abef7', '41dcf8cb-d348-4c21-9e3e-95c5c34abef7'::uuid, 'Cambio a mac en promo', '', 10, 'extras', 28, false, false, 'both', '[]'::jsonb),
      ('52635ae4-8c57-4437-9cac-b8857a766df9', '52635ae4-8c57-4437-9cac-b8857a766df9'::uuid, 'Coca', '', 30, '016f6391-f0f2-4d58-959e-421bc875578c', 7, true, false, 'both', '[]'::jsonb),
      ('53d23791-f4e0-46fa-8046-eee4fe9460ca', '53d23791-f4e0-46fa-8046-eee4fe9460ca'::uuid, 'Mac&chesse', '', 30, 'extras', 14, true, false, 'both', '[]'::jsonb),
      ('55448f8c-4f1f-4f87-98e9-ea893422c20a', '55448f8c-4f1f-4f87-98e9-ea893422c20a'::uuid, 'Munchies fries', 'Orden de papas, cheesedip, Dipping sauce, 3pz cut chicken fingers', 140, '67524e41-4d74-40ac-a192-94eeb949fe45', 3, true, false, 'both', '[]'::jsonb),
      ('6025bafe-8511-400d-8e91-3d0223ac250e', '6025bafe-8511-400d-8e91-3d0223ac250e'::uuid, 'Chicken Bbq', '3pz chicken fingers, aros de cebolla, tocino, Chessedip y bbq sauce', 160, 'd31de24f-21b0-49fe-a3ee-0a658a85a377', 6, true, false, 'both', '[]'::jsonb),
      ('611d1183-47bd-448f-80be-2be53317d9ce', '611d1183-47bd-448f-80be-2be53317d9ce'::uuid, 'Mostaza miel', 'Aderezo extra', 15, 'extras', 20, true, false, 'both', '[]'::jsonb),
      ('63360eb0-8d32-4497-bc86-7de84241e9b9', '63360eb0-8d32-4497-bc86-7de84241e9b9'::uuid, 'Ranch parmesano', 'Aderezo extra', 15, 'extras', 18, true, false, 'both', '[]'::jsonb),
      ('64cac371-1dac-4511-bd36-09e7a3056818', '64cac371-1dac-4511-bd36-09e7a3056818'::uuid, 'Spicy jalapeño', 'Aderezo extra', 15, 'extras', 19, true, false, 'both', '[]'::jsonb),
      ('67b94a98-7cd1-4d2f-8362-f0feda7387b7', '67b94a98-7cd1-4d2f-8362-f0feda7387b7'::uuid, 'Promo Martes', '2 Regular Box + 1 Lt Bebida', 220, 'promociones', 24, true, true, 'both', '[]'::jsonb),
      ('6b943b54-bf0e-4622-8f84-792b52010302', '6b943b54-bf0e-4622-8f84-792b52010302'::uuid, 'Agua natural', '', 20, '016f6391-f0f2-4d58-959e-421bc875578c', 27, true, false, 'both', '[]'::jsonb),
      ('7170c315-c0d2-48a4-a6aa-30ef5fda2757', '7170c315-c0d2-48a4-a6aa-30ef5fda2757'::uuid, 'Dipping sauce', 'Aderezo extra', 15, 'extras', 17, true, false, 'both', '[]'::jsonb),
      ('82066d9a-732b-4528-8465-1b07745a5180', '82066d9a-732b-4528-8465-1b07745a5180'::uuid, 'Limonada', '', 30, '016f6391-f0f2-4d58-959e-421bc875578c', 8, true, false, 'both', '[{"id":"1890f955-76d8-47c6-ad37-dcba23c81e09","name":"Tamaño","required":true,"selection_mode":"single","min_selections":1,"max_selections":1,"options":[{"id":"899dd63b-2c82-4767-a308-a191b472b655","name":"Chico (ch)","price":0},{"id":"b25c5118-659b-412e-8a29-aa0eda8ef3f1","name":"Grande (gr)","price":20}]}]'::jsonb),
      ('8558ef49-635c-4605-b81b-17797e16ca04', '8558ef49-635c-4605-b81b-17797e16ca04'::uuid, 'Te helado', '', 30, '016f6391-f0f2-4d58-959e-421bc875578c', 10, true, false, 'both', '[{"id":"551056c9-da4d-44e5-b7c7-78111be8b645","name":"Tamaño","required":true,"selection_mode":"single","min_selections":1,"max_selections":1,"options":[{"id":"0eb55b65-a336-49d9-ade1-c43a95fcdbe2","name":"Chico (ch)","price":0},{"id":"6dbc8068-e526-452f-b1f4-73369fc3baf5","name":"Grande (gr)","price":20}]}]'::jsonb),
      ('914e4099-c614-4ec2-9015-bd09afd6777e', '914e4099-c614-4ec2-9015-bd09afd6777e'::uuid, 'Texas toast', 'Pan extra', 15, 'extras', 13, true, false, 'both', '[]'::jsonb),
      ('95c915f7-6811-403f-9833-1eb5face78d3', '95c915f7-6811-403f-9833-1eb5face78d3'::uuid, 'Supreme box', '4pz chicken fingers, Texas toast, papas, coleslaw, 2oz Dipping sauce', 140, '67524e41-4d74-40ac-a192-94eeb949fe45', 1, true, false, 'both', '[{"id":"b0f1a99d-3876-483d-9d6a-2f67d2c12377","name":"Cambio","required":false,"selection_mode":"single","min_selections":0,"max_selections":1,"options":[{"id":"c5658636-59e6-4c6c-a93e-86cad806946b","name":"Cambio Mac & Cheese","price":10}]}]'::jsonb),
      ('a207494f-f2d7-49a2-a386-ee1d037494b6', 'a207494f-f2d7-49a2-a386-ee1d037494b6'::uuid, 'Mega Box', '6pz chicken fingers, Texas toast, papas, coleslaw, 4oz Dipping sauce', 190, '67524e41-4d74-40ac-a192-94eeb949fe45', 2, true, false, 'both', '[{"id":"953bda47-a169-4ec8-9e23-c7dccff04e70","name":"Cambio","required":false,"selection_mode":"single","min_selections":0,"max_selections":1,"options":[{"id":"5ab5a138-a77d-42b3-8ad8-73e5490afdd1","name":"Cambio Mac & Cheese","price":10}]}]'::jsonb),
      ('a7dc9a2d-b235-40cd-92a8-6dd8d2cd4ba0', 'a7dc9a2d-b235-40cd-92a8-6dd8d2cd4ba0'::uuid, 'Munchies Burger', '3pz chicken fingers, coleslaw, Cheesedip y Dipping sauce', 140, 'd31de24f-21b0-49fe-a3ee-0a658a85a377', 5, true, false, 'both', '[]'::jsonb),
      ('a87659ee-5463-4a67-9147-af8cde3a9ca2', 'a87659ee-5463-4a67-9147-af8cde3a9ca2'::uuid, 'Cheesecake de Tortuga', '', 0, 'extras', 23, true, false, 'combo_only', '[]'::jsonb),
      ('aadcaf93-7476-4d17-b16c-04c1e3868197', 'aadcaf93-7476-4d17-b16c-04c1e3868197'::uuid, 'Fanta', '', 30, '016f6391-f0f2-4d58-959e-421bc875578c', 26, true, false, 'both', '[]'::jsonb),
      ('d0aa5f94-53a6-4798-89ad-de43a69ded69', 'd0aa5f94-53a6-4798-89ad-de43a69ded69'::uuid, 'Coca Zero', '', 30, '016f6391-f0f2-4d58-959e-421bc875578c', 21, true, false, 'both', '[]'::jsonb),
      ('d5fe6d3c-08bf-428a-8edb-9a545ed2cabd', 'd5fe6d3c-08bf-428a-8edb-9a545ed2cabd'::uuid, 'Promo Jueves', 'Chicken BBQ Burger + Muchies Burger + 1 Lt Bebida', 300, 'promociones', 25, true, true, 'both', '[]'::jsonb),
      ('e7e246cd-181b-4e08-b7e4-1c61c385fef7', 'e7e246cd-181b-4e08-b7e4-1c61c385fef7'::uuid, 'Coleslaw', '', 20, 'extras', 16, true, false, 'both', '[]'::jsonb),
      ('f49d6317-76b8-47dd-9ffc-2666a0bd9262', 'f49d6317-76b8-47dd-9ffc-2666a0bd9262'::uuid, 'Promo Lunes', 'Supreme box + Bebida Pequeña + Cheesecake de Tortuga', 150, 'promociones', 23, true, true, 'both', '[]'::jsonb)
    ) AS source(source_id, id, name, description, price, category_source_id,
                sort_order, is_active, is_combo, sale_mode, modifiers)
    JOIN public.categories AS category
      ON category.business_id = v_business_id
     AND category.source_catalog_id = source.category_source_id
   WHERE NOT EXISTS (
     SELECT 1 FROM public.menu_items AS linked
      WHERE linked.business_id = v_business_id
        AND linked.source_catalog_id = source.source_id
   )
  ON CONFLICT DO NOTHING;

  -- The former Firebase app stored combos as repeated component documents.
  -- Convert those into one fixed line for repeated products and one choice
  -- group for beverage options. The combo price remains the only revenue line.
  UPDATE public.menu_items AS combo
     SET is_combo = true,
         combo_definition = pg_catalog.jsonb_build_object(
       'fixed_components', pg_catalog.jsonb_build_array(
         pg_catalog.jsonb_build_object(
           'id', 'lunes-supreme', 'menu_item_id', (
             SELECT product.id::text FROM public.menu_items AS product
              WHERE product.business_id = v_business_id
                AND product.source_catalog_id = '95c915f7-6811-403f-9833-1eb5face78d3'
           ), 'quantity', 1
         ),
         pg_catalog.jsonb_build_object(
           'id', 'lunes-cheesecake-gift', 'menu_item_id', (
             SELECT product.id::text FROM public.menu_items AS product
              WHERE product.business_id = v_business_id
                AND product.source_catalog_id = 'a87659ee-5463-4a67-9147-af8cde3a9ca2'
           ), 'quantity', 1, 'is_gift', true
         )
       ),
       'choice_groups', pg_catalog.jsonb_build_array(
         pg_catalog.jsonb_build_object(
           'id', 'lunes-drink', 'name', 'Elige tu bebida chica', 'required', true,
           'options', pg_catalog.jsonb_build_array(
             pg_catalog.jsonb_build_object('id', 'lunes-limonada-chica', 'menu_item_id', (SELECT product.id::text FROM public.menu_items AS product WHERE product.business_id = v_business_id AND product.source_catalog_id = '82066d9a-732b-4528-8465-1b07745a5180'), 'label', 'Limonada chica', 'quantity', 1, 'price_adjustment', 0),
             pg_catalog.jsonb_build_object('id', 'lunes-fresa-chica', 'menu_item_id', (SELECT product.id::text FROM public.menu_items AS product WHERE product.business_id = v_business_id AND product.source_catalog_id = '301571c2-76c4-4038-9703-baafc457d1dc'), 'label', 'Limonada de fresa chica', 'quantity', 1, 'price_adjustment', 0),
             pg_catalog.jsonb_build_object('id', 'lunes-te-chico', 'menu_item_id', (SELECT product.id::text FROM public.menu_items AS product WHERE product.business_id = v_business_id AND product.source_catalog_id = '8558ef49-635c-4605-b81b-17797e16ca04'), 'label', 'Té helado chico', 'quantity', 1, 'price_adjustment', 0)
           )
         )
       )
     )
   WHERE combo.business_id = v_business_id
     AND combo.source_catalog_id = 'f49d6317-76b8-47dd-9ffc-2666a0bd9262'
     AND combo.combo_definition = '{"fixed_components": [], "choice_groups": []}'::jsonb;

  UPDATE public.menu_items AS combo
     SET is_combo = true,
         combo_definition = pg_catalog.jsonb_build_object(
       'fixed_components', pg_catalog.jsonb_build_array(
         pg_catalog.jsonb_build_object('id', 'martes-regular-boxes', 'menu_item_id', (SELECT product.id::text FROM public.menu_items AS product WHERE product.business_id = v_business_id AND product.source_catalog_id = '318de2a7-9dc0-4748-961c-57e5d7055121'), 'quantity', 2)
       ),
       'choice_groups', pg_catalog.jsonb_build_array(
         pg_catalog.jsonb_build_object(
           'id', 'martes-drink', 'name', 'Elige tu bebida grande', 'required', true,
           'options', pg_catalog.jsonb_build_array(
             pg_catalog.jsonb_build_object('id', 'martes-limonada-grande', 'menu_item_id', (SELECT product.id::text FROM public.menu_items AS product WHERE product.business_id = v_business_id AND product.source_catalog_id = '82066d9a-732b-4528-8465-1b07745a5180'), 'label', 'Limonada grande', 'quantity', 1, 'price_adjustment', 0),
             pg_catalog.jsonb_build_object('id', 'martes-fresa-grande', 'menu_item_id', (SELECT product.id::text FROM public.menu_items AS product WHERE product.business_id = v_business_id AND product.source_catalog_id = '301571c2-76c4-4038-9703-baafc457d1dc'), 'label', 'Limonada de fresa grande', 'quantity', 1, 'price_adjustment', 0),
             pg_catalog.jsonb_build_object('id', 'martes-te-grande', 'menu_item_id', (SELECT product.id::text FROM public.menu_items AS product WHERE product.business_id = v_business_id AND product.source_catalog_id = '8558ef49-635c-4605-b81b-17797e16ca04'), 'label', 'Té helado grande', 'quantity', 1, 'price_adjustment', 0)
           )
         )
       )
     )
   WHERE combo.business_id = v_business_id
     AND combo.source_catalog_id = '67b94a98-7cd1-4d2f-8362-f0feda7387b7'
     AND combo.combo_definition = '{"fixed_components": [], "choice_groups": []}'::jsonb;

  UPDATE public.menu_items AS combo
     SET is_combo = true,
         combo_definition = pg_catalog.jsonb_build_object(
       'fixed_components', pg_catalog.jsonb_build_array(
         pg_catalog.jsonb_build_object('id', 'jueves-chicken-bbq', 'menu_item_id', (SELECT product.id::text FROM public.menu_items AS product WHERE product.business_id = v_business_id AND product.source_catalog_id = '6025bafe-8511-400d-8e91-3d0223ac250e'), 'quantity', 1),
         pg_catalog.jsonb_build_object('id', 'jueves-munchies-burger', 'menu_item_id', (SELECT product.id::text FROM public.menu_items AS product WHERE product.business_id = v_business_id AND product.source_catalog_id = 'a7dc9a2d-b235-40cd-92a8-6dd8d2cd4ba0'), 'quantity', 1)
       ),
       'choice_groups', pg_catalog.jsonb_build_array(
         pg_catalog.jsonb_build_object(
           'id', 'jueves-drink', 'name', 'Elige tu bebida grande', 'required', true,
           'options', pg_catalog.jsonb_build_array(
             pg_catalog.jsonb_build_object('id', 'jueves-limonada-grande', 'menu_item_id', (SELECT product.id::text FROM public.menu_items AS product WHERE product.business_id = v_business_id AND product.source_catalog_id = '82066d9a-732b-4528-8465-1b07745a5180'), 'label', 'Limonada grande', 'quantity', 1, 'price_adjustment', 0),
             pg_catalog.jsonb_build_object('id', 'jueves-fresa-grande', 'menu_item_id', (SELECT product.id::text FROM public.menu_items AS product WHERE product.business_id = v_business_id AND product.source_catalog_id = '301571c2-76c4-4038-9703-baafc457d1dc'), 'label', 'Limonada de fresa grande', 'quantity', 1, 'price_adjustment', 0),
             pg_catalog.jsonb_build_object('id', 'jueves-te-grande', 'menu_item_id', (SELECT product.id::text FROM public.menu_items AS product WHERE product.business_id = v_business_id AND product.source_catalog_id = '8558ef49-635c-4605-b81b-17797e16ca04'), 'label', 'Té helado grande', 'quantity', 1, 'price_adjustment', 0)
           )
         )
       )
     )
   WHERE combo.business_id = v_business_id
     AND combo.source_catalog_id = 'd5fe6d3c-08bf-428a-8edb-9a545ed2cabd'
     AND combo.combo_definition = '{"fixed_components": [], "choice_groups": []}'::jsonb;

  IF (SELECT count(*) FROM public.menu_items AS item
       WHERE item.business_id = v_business_id
         AND item.source_catalog_id IS NOT NULL) <> 28 THEN
    RAISE EXCEPTION
      'La importación no quedó completa: se esperaban 28 productos vinculados del catálogo fuente';
  END IF;

  IF (SELECT count(*) FROM public.menu_items AS item
       WHERE item.business_id = v_business_id
         AND item.is_combo
         AND item.combo_definition <> '{"fixed_components": [], "choice_groups": []}'::jsonb) <> 3 THEN
    RAISE EXCEPTION
      'La importación no quedó completa: no se configuraron los tres combos fuente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.menu_items AS gift
     WHERE gift.business_id = v_business_id
       AND gift.source_catalog_id = 'a87659ee-5463-4a67-9147-af8cde3a9ca2'
       AND gift.is_active
       AND gift.sale_mode = 'combo_only'
  ) THEN
    RAISE EXCEPTION
      'La importación no quedó completa: el cheesecake de regalo no quedó disponible sólo dentro del combo';
  END IF;
END;
$$;
