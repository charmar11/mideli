-- Associate every operational order with exactly one business.
--
-- The current POS and WhatsApp flows still create one order at a time. This
-- migration keeps those entry points compatible while making the business
-- boundary explicit. Splitting a mixed table account into one order per
-- business will be added in a later migration; an order can never contain
-- products from different businesses.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS business_id uuid;

CREATE OR REPLACE FUNCTION private.multibusiness_mideli_business_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT business.id
    FROM public.businesses AS business
    JOIN public.organizations AS organization
      ON organization.id = business.organization_id
   WHERE organization.slug = 'rincon-404-food-park'
     AND business.slug = 'mideli'
     AND business.lifecycle_status NOT IN ('archived', 'retired');
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_assign_order_business()
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
    RAISE EXCEPTION 'El negocio de un pedido no se puede cambiar';
  END IF;

  IF NEW.business_id IS NULL THEN
    SELECT private.multibusiness_mideli_business_id()
      INTO v_business_id;

    IF v_business_id IS NULL THEN
      RAISE EXCEPTION
        'No se encontró el negocio Mideli para asignar el pedido';
    END IF;

    NEW.business_id := v_business_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.businesses AS business
     WHERE business.id = NEW.business_id
       AND business.lifecycle_status NOT IN ('archived', 'retired')
  ) THEN
    RAISE EXCEPTION 'El negocio del pedido no está disponible';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_assign_multibusiness_scope
  ON public.orders;
CREATE TRIGGER orders_assign_multibusiness_scope
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.multibusiness_assign_order_business();

-- Existing operational history belongs to Mideli because the application was
-- single-business until this migration. Resolve it by stable slugs instead of
-- copying an environment-specific UUID into the migration.
UPDATE public.orders AS order_row
   SET business_id = business.id
  FROM public.businesses AS business
  JOIN public.organizations AS organization
    ON organization.id = business.organization_id
 WHERE order_row.business_id IS NULL
   AND organization.slug = 'rincon-404-food-park'
   AND business.slug = 'mideli';

DO $$
DECLARE
  v_null_orders integer;
  v_mismatched_items integer;
BEGIN
  SELECT count(*)
    INTO v_null_orders
    FROM public.orders
   WHERE business_id IS NULL;

  IF v_null_orders > 0 THEN
    RAISE EXCEPTION
      'Hay pedidos sin negocio asignado: %',
      v_null_orders;
  END IF;

  SELECT count(*)
    INTO v_mismatched_items
    FROM public.order_items AS order_item
    JOIN public.orders AS order_row
      ON order_row.id = order_item.order_id
    JOIN public.menu_items AS menu_item
      ON menu_item.id = order_item.menu_item_id
   WHERE menu_item.business_id IS DISTINCT FROM order_row.business_id;

  IF v_mismatched_items > 0 THEN
    RAISE EXCEPTION
      'Hay productos de un negocio distinto al pedido: %',
      v_mismatched_items;
  END IF;
END;
$$;

ALTER TABLE public.orders
  ALTER COLUMN business_id SET NOT NULL;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_business_id_fkey
  FOREIGN KEY (business_id)
  REFERENCES public.businesses(id)
  ON DELETE RESTRICT;

CREATE INDEX orders_business_created_at_idx
  ON public.orders (business_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.multibusiness_validate_order_item_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order_business_id uuid;
  v_menu_business_id uuid;
BEGIN
  SELECT order_row.business_id
    INTO v_order_business_id
    FROM public.orders AS order_row
   WHERE order_row.id = NEW.order_id;

  SELECT menu_item.business_id
    INTO v_menu_business_id
    FROM public.menu_items AS menu_item
   WHERE menu_item.id = NEW.menu_item_id;

  IF v_order_business_id IS NULL OR v_menu_business_id IS NULL THEN
    RAISE EXCEPTION 'El pedido y el producto deben pertenecer a un negocio';
  END IF;

  IF v_order_business_id IS DISTINCT FROM v_menu_business_id THEN
    RAISE EXCEPTION
      'No se pueden mezclar productos de distintos negocios en un pedido';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_items_validate_multibusiness_scope
  ON public.order_items;
CREATE TRIGGER order_items_validate_multibusiness_scope
  BEFORE INSERT OR UPDATE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION private.multibusiness_validate_order_item_business();

REVOKE ALL ON FUNCTION private.multibusiness_mideli_business_id()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_assign_order_business()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_validate_order_item_business()
  FROM PUBLIC, anon, authenticated;

