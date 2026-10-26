-- One-time data import from the owner's current Uber Eats and Didi Food menus.
-- Unlisted products intentionally receive no row, which means unavailable.
CREATE TEMP TABLE just_dipping_marketplace_seed (
  platform text NOT NULL,
  product_name text NOT NULL,
  platform_price integer NOT NULL CHECK (platform_price >= 0),
  PRIMARY KEY (platform, product_name)
);

INSERT INTO just_dipping_marketplace_seed (platform, product_name, platform_price) VALUES
  ('uber_eats', 'Regular Box', 170),
  ('uber_eats', 'Supreme box', 200),
  ('uber_eats', 'Mega Box', 280),
  ('uber_eats', 'Dipping Burger', 150),
  ('uber_eats', 'Munchies Burger', 200),
  ('uber_eats', 'Chicken Bbq', 230),
  ('uber_eats', 'Coca', 45),
  ('uber_eats', 'Te helado', 70),
  ('uber_eats', 'Limonada de fresa', 85),
  ('uber_eats', 'Limonada', 70),
  ('uber_eats', 'Chicken finger', 45),
  ('uber_eats', 'Coleslaw', 30),
  ('uber_eats', 'Mac&chesse', 45),
  ('uber_eats', 'Texas toast', 25),
  ('uber_eats', 'Dipping sauce', 20),
  ('uber_eats', 'Ranch parmesano', 20),
  ('uber_eats', 'Spicy jalapeño', 20),
  ('uber_eats', 'Mostaza miel', 20),
  ('didi_food', 'Regular Box', 160),
  ('didi_food', 'Supreme box', 200),
  ('didi_food', 'Mega Box', 280),
  ('didi_food', 'Dipping Burger', 150),
  ('didi_food', 'Munchies Burger', 190),
  ('didi_food', 'Chicken Bbq', 230),
  ('didi_food', 'Te helado', 70),
  ('didi_food', 'Limonada', 70),
  ('didi_food', 'Limonada de fresa', 70);

DO $$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT business.id
    INTO v_business_id
    FROM public.businesses AS business
   WHERE business.slug = 'just-dipping';

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró Just Dipping para preparar el catálogo de plataformas';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_temp.just_dipping_marketplace_seed AS seed
      LEFT JOIN public.menu_items AS menu_item
        ON menu_item.business_id = v_business_id
       AND lower(menu_item.name) = lower(seed.product_name)
       AND menu_item.is_active
     GROUP BY seed.platform, seed.product_name
    HAVING count(menu_item.id) <> 1
  ) THEN
    RAISE EXCEPTION 'El catálogo de Just Dipping cambió; no se aplicaron precios de plataforma';
  END IF;

  -- Keep an existing owner setup intact if it was created before this import.
  IF EXISTS (
    SELECT 1 FROM public.business_marketplace_settings AS setting
     WHERE setting.business_id = v_business_id
  ) OR EXISTS (
    SELECT 1 FROM public.business_marketplace_prices AS saved_product
     WHERE saved_product.business_id = v_business_id
  ) THEN
    RAISE NOTICE 'Se conservó la configuración de plataformas existente de Just Dipping';
    RETURN;
  END IF;

  INSERT INTO public.business_marketplace_prices (
    business_id, platform, menu_item_id, platform_price, is_available
  )
  SELECT v_business_id, seed.platform, menu_item.id, seed.platform_price, true
    FROM pg_temp.just_dipping_marketplace_seed AS seed
    JOIN public.menu_items AS menu_item
      ON menu_item.business_id = v_business_id
     AND lower(menu_item.name) = lower(seed.product_name)
     AND menu_item.is_active;
END;
$$;

DROP TABLE pg_temp.just_dipping_marketplace_seed;
