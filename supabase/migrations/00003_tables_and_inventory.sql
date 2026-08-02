-- Configurable table map and recipe-based inventory

CREATE SCHEMA IF NOT EXISTS private;

-- Orders already exist in the initial schema. These columns keep the current
-- POS fields compatible while adding a durable table reference.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS table_number text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS cash_received integer,
  ADD COLUMN IF NOT EXISTS change_given integer,
  ADD COLUMN IF NOT EXISTS table_id uuid;

-- =====================================================
-- TABLE MAP
-- =====================================================

CREATE TABLE IF NOT EXISTS public.table_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.restaurant_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid REFERENCES public.table_zones(id) ON DELETE SET NULL,
  name text NOT NULL,
  shape text NOT NULL DEFAULT 'square'
    CHECK (shape = ANY (ARRAY['round', 'square', 'rectangle', 'bar'])),
  position_x numeric(6,5) NOT NULL DEFAULT 0.5 CHECK (position_x >= 0 AND position_x <= 1),
  position_y numeric(6,5) NOT NULL DEFAULT 0.5 CHECK (position_y >= 0 AND position_y <= 1),
  width numeric(6,5) NOT NULL DEFAULT 0.16 CHECK (width > 0 AND width <= 1),
  height numeric(6,5) NOT NULL DEFAULT 0.12 CHECK (height > 0 AND height <= 1),
  rotation smallint NOT NULL DEFAULT 0 CHECK (rotation >= -360 AND rotation <= 360),
  capacity smallint NOT NULL DEFAULT 2 CHECK (capacity > 0 AND capacity <= 100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_table_id_fkey;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_table_id_fkey
  FOREIGN KEY (table_id) REFERENCES public.restaurant_tables(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS restaurant_tables_zone_id_idx
  ON public.restaurant_tables(zone_id);
CREATE INDEX IF NOT EXISTS restaurant_tables_active_idx
  ON public.restaurant_tables(is_active);

-- =====================================================
-- INVENTORY
-- =====================================================

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'pieza',
  current_stock numeric(12,3) NOT NULL DEFAULT 0,
  minimum_stock numeric(12,3) NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  cost_per_unit numeric(12,2) NOT NULL DEFAULT 0 CHECK (cost_per_unit >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_current_stock_check;

CREATE TABLE IF NOT EXISTS public.inventory_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id, inventory_item_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  movement_type text NOT NULL
    CHECK (movement_type = ANY (ARRAY['purchase', 'adjustment', 'consumption', 'return'])),
  quantity_change numeric(12,3) NOT NULL CHECK (quantity_change <> 0),
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, order_item_id, inventory_item_id, movement_type)
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_returns_unique
  ON public.inventory_movements(order_id, inventory_item_id)
  WHERE movement_type = 'return';

CREATE INDEX IF NOT EXISTS inventory_movements_item_idx
  ON public.inventory_movements(inventory_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_order_idx
  ON public.inventory_movements(order_id);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.table_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Table zones viewable by staff" ON public.table_zones
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Table zones insertable by admins" ON public.table_zones
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Table zones updatable by admins" ON public.table_zones
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Restaurant tables viewable by staff" ON public.restaurant_tables
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Restaurant tables insertable by admins" ON public.restaurant_tables
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Restaurant tables updatable by admins" ON public.restaurant_tables
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Inventory items viewable by staff" ON public.inventory_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Inventory items insertable by admins" ON public.inventory_items
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Inventory items updatable by admins" ON public.inventory_items
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Inventory recipes viewable by staff" ON public.inventory_recipes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Inventory recipes managed by admins" ON public.inventory_recipes
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Inventory movements viewable by staff" ON public.inventory_movements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Inventory movements created by admins" ON public.inventory_movements
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- New projects no longer expose new public tables automatically. Explicit
-- grants keep the Data API usable while RLS remains the authorization layer.
GRANT SELECT, INSERT, UPDATE ON public.table_zones TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.restaurant_tables TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.inventory_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_recipes TO authenticated;
GRANT SELECT, INSERT ON public.inventory_movements TO authenticated;

-- =====================================================
-- AUTOMATIC INVENTORY MOVEMENTS
-- =====================================================

CREATE OR REPLACE FUNCTION private.consume_inventory_for_order_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  recipe record;
  movement_id uuid;
  delta numeric(12,3);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  FOR recipe IN
    SELECT inventory_item_id, quantity
    FROM public.inventory_recipes
    WHERE menu_item_id = NEW.menu_item_id
  LOOP
    delta := -(recipe.quantity * NEW.quantity);
    movement_id := NULL;

    INSERT INTO public.inventory_movements (
      inventory_item_id,
      order_id,
      order_item_id,
      movement_type,
      quantity_change,
      note,
      created_by
    )
    VALUES (
      recipe.inventory_item_id,
      NEW.order_id,
      NEW.id,
      'consumption',
      delta,
      'Consumo por pedido',
      auth.uid()
    )
    ON CONFLICT (order_id, order_item_id, inventory_item_id, movement_type)
    DO NOTHING
    RETURNING id INTO movement_id;

    IF movement_id IS NOT NULL THEN
      UPDATE public.inventory_items
      SET current_stock = current_stock + delta,
          updated_at = now()
      WHERE id = recipe.inventory_item_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.return_inventory_for_cancelled_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  consumed record;
  movement_id uuid;
  delta numeric(12,3);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    FOR consumed IN
      SELECT inventory_item_id, SUM(quantity_change) AS total_consumed
      FROM public.inventory_movements
      WHERE order_id = NEW.id AND movement_type = 'consumption'
      GROUP BY inventory_item_id
    LOOP
      delta := -consumed.total_consumed;
      movement_id := NULL;

      INSERT INTO public.inventory_movements (
        inventory_item_id,
        order_id,
        movement_type,
        quantity_change,
        note,
        created_by
      )
      VALUES (
        consumed.inventory_item_id,
        NEW.id,
        'return',
        delta,
        'Reposición por cancelación',
        auth.uid()
      )
      ON CONFLICT (order_id, inventory_item_id) WHERE movement_type = 'return'
      DO NOTHING
      RETURNING id INTO movement_id;

      IF movement_id IS NOT NULL THEN
        UPDATE public.inventory_items
        SET current_stock = current_stock + delta,
            updated_at = now()
        WHERE id = consumed.inventory_item_id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_consume_inventory_for_order_item
  ON public.order_items;
CREATE TRIGGER trigger_consume_inventory_for_order_item
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION private.consume_inventory_for_order_item();

DROP TRIGGER IF EXISTS trigger_return_inventory_for_cancelled_order
  ON public.orders;
CREATE TRIGGER trigger_return_inventory_for_cancelled_order
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.return_inventory_for_cancelled_order();

REVOKE ALL ON FUNCTION private.consume_inventory_for_order_item() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.return_inventory_for_cancelled_order() FROM PUBLIC;
