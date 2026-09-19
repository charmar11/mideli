-- Give inventory and its derived records the same business boundary as the
-- catalog and orders. Existing inventory is assigned to Mideli by stable
-- slugs; future writes may name another active business through a server RPC.

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.inventory_recipes
  ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.inventory_counts
  ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.inventory_purchase_orders
  ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.inventory_receipts
  ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.inventory_lots
  ADD COLUMN IF NOT EXISTS business_id uuid;

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
    SELECT private.multibusiness_mideli_business_id()
      INTO v_business_id;
    IF v_business_id IS NULL THEN
      RAISE EXCEPTION 'No se encontró el negocio Mideli para el inventario';
    END IF;
    NEW.business_id := v_business_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.businesses AS business
     WHERE business.id = NEW.business_id
       AND business.lifecycle_status NOT IN ('archived', 'retired')
  ) THEN
    RAISE EXCEPTION 'El negocio del inventario no está disponible';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_assign_inventory_item_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_item_business_id uuid;
BEGIN
  SELECT item.business_id
    INTO v_item_business_id
    FROM public.inventory_items AS item
   WHERE item.id = NEW.inventory_item_id;

  IF v_item_business_id IS NULL THEN
    RAISE EXCEPTION 'El insumo del registro no tiene negocio';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.business_id IS NOT NULL
     AND OLD.business_id IS DISTINCT FROM v_item_business_id THEN
    RAISE EXCEPTION 'El negocio del movimiento o lote no coincide con el insumo';
  END IF;

  IF NEW.business_id IS NOT NULL
     AND NEW.business_id IS DISTINCT FROM v_item_business_id THEN
    RAISE EXCEPTION 'El negocio no coincide con el insumo';
  END IF;

  NEW.business_id := v_item_business_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_validate_inventory_recipe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_menu_business_id uuid;
  v_item_business_id uuid;
BEGIN
  SELECT menu_item.business_id
    INTO v_menu_business_id
    FROM public.menu_items AS menu_item
   WHERE menu_item.id = NEW.menu_item_id;
  SELECT item.business_id
    INTO v_item_business_id
    FROM public.inventory_items AS item
   WHERE item.id = NEW.inventory_item_id;

  IF v_menu_business_id IS NULL OR v_item_business_id IS NULL THEN
    RAISE EXCEPTION 'La receta requiere producto e insumo con negocio';
  END IF;
  IF v_menu_business_id IS DISTINCT FROM v_item_business_id THEN
    RAISE EXCEPTION 'No se puede crear una receta entre negocios distintos';
  END IF;
  IF NEW.business_id IS NOT NULL
     AND NEW.business_id IS DISTINCT FROM v_menu_business_id THEN
    RAISE EXCEPTION 'El negocio de la receta no coincide con sus componentes';
  END IF;

  NEW.business_id := v_menu_business_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_validate_inventory_count_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count_business_id uuid;
  v_item_business_id uuid;
BEGIN
  SELECT count_row.business_id
    INTO v_count_business_id
    FROM public.inventory_counts AS count_row
   WHERE count_row.id = NEW.count_id;
  SELECT item.business_id
    INTO v_item_business_id
    FROM public.inventory_items AS item
   WHERE item.id = NEW.inventory_item_id;

  IF v_count_business_id IS NULL OR v_item_business_id IS NULL
     OR v_count_business_id IS DISTINCT FROM v_item_business_id THEN
    RAISE EXCEPTION 'El conteo y el insumo deben pertenecer al mismo negocio';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_validate_purchase_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order_business_id uuid;
  v_item_business_id uuid;
BEGIN
  SELECT purchase_order.business_id
    INTO v_order_business_id
    FROM public.inventory_purchase_orders AS purchase_order
   WHERE purchase_order.id = NEW.purchase_order_id;
  SELECT item.business_id
    INTO v_item_business_id
    FROM public.inventory_items AS item
   WHERE item.id = NEW.inventory_item_id;

  IF v_order_business_id IS NULL OR v_item_business_id IS NULL
     OR v_order_business_id IS DISTINCT FROM v_item_business_id THEN
    RAISE EXCEPTION 'La compra y el insumo deben pertenecer al mismo negocio';
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
    NEW.business_id := COALESCE(v_business_id, private.multibusiness_mideli_business_id());
  ELSIF v_business_id IS NOT NULL AND NEW.business_id IS DISTINCT FROM v_business_id THEN
    RAISE EXCEPTION 'El recibo no coincide con su orden de compra';
  END IF;

  IF NEW.business_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.businesses AS business
     WHERE business.id = NEW.business_id
       AND business.lifecycle_status NOT IN ('archived', 'retired')
  ) THEN
    RAISE EXCEPTION 'El negocio del recibo no está disponible';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_validate_receipt_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_receipt_business_id uuid;
  v_item_business_id uuid;
  v_purchase_business_id uuid;
BEGIN
  SELECT receipt.business_id
    INTO v_receipt_business_id
    FROM public.inventory_receipts AS receipt
   WHERE receipt.id = NEW.receipt_id;
  SELECT item.business_id
    INTO v_item_business_id
    FROM public.inventory_items AS item
   WHERE item.id = NEW.inventory_item_id;

  IF NEW.purchase_order_line_id IS NOT NULL THEN
    SELECT purchase_order.business_id
      INTO v_purchase_business_id
      FROM public.inventory_purchase_order_lines AS purchase_line
      JOIN public.inventory_purchase_orders AS purchase_order
        ON purchase_order.id = purchase_line.purchase_order_id
     WHERE purchase_line.id = NEW.purchase_order_line_id;
  END IF;

  IF v_receipt_business_id IS NULL OR v_item_business_id IS NULL
     OR v_receipt_business_id IS DISTINCT FROM v_item_business_id
     OR (v_purchase_business_id IS NOT NULL
         AND v_purchase_business_id IS DISTINCT FROM v_receipt_business_id)
  THEN
    RAISE EXCEPTION 'El recibo, la compra y el insumo deben coincidir';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_validate_lot_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_item_business_id uuid;
  v_receipt_business_id uuid;
  v_receipt_item_business_id uuid;
BEGIN
  SELECT item.business_id
    INTO v_item_business_id
    FROM public.inventory_items AS item
   WHERE item.id = NEW.inventory_item_id;

  IF NEW.receipt_line_id IS NOT NULL THEN
    SELECT receipt.business_id, item.business_id
      INTO v_receipt_business_id, v_receipt_item_business_id
      FROM public.inventory_receipt_lines AS receipt_line
      JOIN public.inventory_receipts AS receipt
        ON receipt.id = receipt_line.receipt_id
      JOIN public.inventory_items AS item
        ON item.id = receipt_line.inventory_item_id
     WHERE receipt_line.id = NEW.receipt_line_id;
  END IF;

  IF v_item_business_id IS NULL
     OR (v_receipt_business_id IS NOT NULL
         AND v_receipt_business_id IS DISTINCT FROM v_item_business_id)
     OR (v_receipt_item_business_id IS NOT NULL
         AND v_receipt_item_business_id IS DISTINCT FROM v_item_business_id)
  THEN
    RAISE EXCEPTION 'El lote no coincide con el recibo y el insumo';
  END IF;

  IF NEW.business_id IS NOT NULL
     AND NEW.business_id IS DISTINCT FROM v_item_business_id THEN
    RAISE EXCEPTION 'El negocio del lote no coincide con el insumo';
  END IF;
  NEW.business_id := v_item_business_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_items_assign_business
  BEFORE INSERT OR UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_assign_inventory_scope();
CREATE TRIGGER inventory_counts_assign_business
  BEFORE INSERT OR UPDATE ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_assign_inventory_scope();
CREATE TRIGGER inventory_purchase_orders_assign_business
  BEFORE INSERT OR UPDATE ON public.inventory_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_assign_inventory_scope();
CREATE TRIGGER inventory_receipts_assign_business
  BEFORE INSERT OR UPDATE ON public.inventory_receipts
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_assign_receipt_scope();
CREATE TRIGGER inventory_recipes_validate_business
  BEFORE INSERT OR UPDATE ON public.inventory_recipes
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_validate_inventory_recipe();
CREATE TRIGGER inventory_movements_assign_business
  BEFORE INSERT OR UPDATE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_assign_inventory_item_scope();
CREATE TRIGGER inventory_lots_assign_business
  BEFORE INSERT OR UPDATE ON public.inventory_lots
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_validate_lot_scope();
CREATE TRIGGER inventory_count_lines_validate_business
  BEFORE INSERT OR UPDATE ON public.inventory_count_lines
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_validate_inventory_count_line();
CREATE TRIGGER inventory_purchase_lines_validate_business
  BEFORE INSERT OR UPDATE ON public.inventory_purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_validate_purchase_line();
CREATE TRIGGER inventory_receipt_lines_validate_business
  BEFORE INSERT OR UPDATE ON public.inventory_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_validate_receipt_line();

UPDATE public.inventory_items AS item
   SET business_id = business.id
  FROM public.businesses AS business
  JOIN public.organizations AS organization
    ON organization.id = business.organization_id
 WHERE item.business_id IS NULL
   AND organization.slug = 'rincon-404-food-park'
   AND business.slug = 'mideli';

UPDATE public.inventory_recipes AS recipe
   SET business_id = menu_item.business_id
  FROM public.menu_items AS menu_item
 WHERE recipe.business_id IS NULL
   AND menu_item.id = recipe.menu_item_id;

UPDATE public.inventory_movements AS movement
   SET business_id = item.business_id
  FROM public.inventory_items AS item
 WHERE movement.business_id IS NULL
   AND item.id = movement.inventory_item_id;

UPDATE public.inventory_counts AS count_row
   SET business_id = business.id
  FROM public.businesses AS business
  JOIN public.organizations AS organization
    ON organization.id = business.organization_id
 WHERE count_row.business_id IS NULL
   AND organization.slug = 'rincon-404-food-park'
   AND business.slug = 'mideli';

UPDATE public.inventory_purchase_orders AS purchase_order
   SET business_id = business.id
  FROM public.businesses AS business
  JOIN public.organizations AS organization
    ON organization.id = business.organization_id
 WHERE purchase_order.business_id IS NULL
   AND organization.slug = 'rincon-404-food-park'
   AND business.slug = 'mideli';

UPDATE public.inventory_receipts AS receipt
   SET business_id = COALESCE(
     (
       SELECT purchase_order.business_id
         FROM public.inventory_purchase_orders AS purchase_order
        WHERE purchase_order.id = receipt.purchase_order_id
     ),
     business.id
   )
  FROM public.businesses AS business
  JOIN public.organizations AS organization
    ON organization.id = business.organization_id
 WHERE receipt.business_id IS NULL
   AND organization.slug = 'rincon-404-food-park'
   AND business.slug = 'mideli';

UPDATE public.inventory_lots AS lot
   SET business_id = item.business_id
  FROM public.inventory_items AS item
 WHERE lot.business_id IS NULL
   AND item.id = lot.inventory_item_id;

DO $$
DECLARE
  v_business_exists boolean;
  v_null_count integer;
  v_invalid_count integer;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM public.businesses AS business
      JOIN public.organizations AS organization
        ON organization.id = business.organization_id
     WHERE organization.slug = 'rincon-404-food-park'
       AND business.slug = 'mideli'
       AND business.lifecycle_status NOT IN ('archived', 'retired')
  ) INTO v_business_exists;

  IF NOT v_business_exists THEN
    RAISE NOTICE
      'Se difiere el backfill de inventario: todavía no existe el negocio Mideli';
    RETURN;
  END IF;

  SELECT count(*) INTO v_null_count
    FROM (
      SELECT business_id FROM public.inventory_items
      UNION ALL SELECT business_id FROM public.inventory_recipes
      UNION ALL SELECT business_id FROM public.inventory_movements
      UNION ALL SELECT business_id FROM public.inventory_counts
      UNION ALL SELECT business_id FROM public.inventory_purchase_orders
      UNION ALL SELECT business_id FROM public.inventory_receipts
      UNION ALL SELECT business_id FROM public.inventory_lots
    ) AS scoped_rows
   WHERE business_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'Hay registros de inventario sin negocio: %', v_null_count;
  END IF;

  SELECT count(*) INTO v_invalid_count
    FROM public.inventory_recipes AS recipe
    JOIN public.menu_items AS menu_item ON menu_item.id = recipe.menu_item_id
    JOIN public.inventory_items AS item ON item.id = recipe.inventory_item_id
   WHERE recipe.business_id IS DISTINCT FROM menu_item.business_id
      OR recipe.business_id IS DISTINCT FROM item.business_id;
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Hay recetas con componentes de negocios distintos: %', v_invalid_count;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.businesses AS business
      JOIN public.organizations AS organization
        ON organization.id = business.organization_id
     WHERE organization.slug = 'rincon-404-food-park'
       AND business.slug = 'mideli'
  ) THEN
    ALTER TABLE public.inventory_items ALTER COLUMN business_id SET NOT NULL;
    ALTER TABLE public.inventory_recipes ALTER COLUMN business_id SET NOT NULL;
    ALTER TABLE public.inventory_movements ALTER COLUMN business_id SET NOT NULL;
    ALTER TABLE public.inventory_counts ALTER COLUMN business_id SET NOT NULL;
    ALTER TABLE public.inventory_purchase_orders ALTER COLUMN business_id SET NOT NULL;
    ALTER TABLE public.inventory_receipts ALTER COLUMN business_id SET NOT NULL;
    ALTER TABLE public.inventory_lots ALTER COLUMN business_id SET NOT NULL;
  END IF;
END;
$$;

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_recipes
  ADD CONSTRAINT inventory_recipes_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_counts
  ADD CONSTRAINT inventory_counts_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_purchase_orders
  ADD CONSTRAINT inventory_purchase_orders_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_receipts
  ADD CONSTRAINT inventory_receipts_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_lots
  ADD CONSTRAINT inventory_lots_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;

CREATE INDEX inventory_items_business_idx
  ON public.inventory_items (business_id, is_active, name);
CREATE INDEX inventory_recipes_business_idx
  ON public.inventory_recipes (business_id, menu_item_id);
CREATE INDEX inventory_movements_business_created_idx
  ON public.inventory_movements (business_id, created_at DESC);
CREATE INDEX inventory_counts_business_started_idx
  ON public.inventory_counts (business_id, started_at DESC);
CREATE INDEX inventory_purchase_orders_business_created_idx
  ON public.inventory_purchase_orders (business_id, created_at DESC);
CREATE INDEX inventory_receipts_business_created_idx
  ON public.inventory_receipts (business_id, created_at DESC);
CREATE INDEX inventory_lots_business_fifo_idx
  ON public.inventory_lots (business_id, inventory_item_id, expires_on, received_at)
  WHERE quantity_remaining > 0;

REVOKE ALL ON FUNCTION private.multibusiness_assign_inventory_scope()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_assign_inventory_item_scope()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_validate_inventory_recipe()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_validate_inventory_count_line()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_validate_purchase_line()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_assign_receipt_scope()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_validate_receipt_line()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_validate_lot_scope()
  FROM PUBLIC, anon, authenticated;
