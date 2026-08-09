-- Daily owner control, audited menu availability and transactional limited stock.

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS availability_status text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS available_quantity integer,
  ADD COLUMN IF NOT EXISTS availability_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS availability_updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.menu_items
  DROP CONSTRAINT IF EXISTS menu_items_availability_status_check,
  DROP CONSTRAINT IF EXISTS menu_items_available_quantity_check,
  DROP CONSTRAINT IF EXISTS menu_items_availability_state_check;

ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_availability_status_check
    CHECK (availability_status IN ('available', 'limited', 'out_of_stock')),
  ADD CONSTRAINT menu_items_available_quantity_check
    CHECK (available_quantity IS NULL OR available_quantity >= 0),
  ADD CONSTRAINT menu_items_availability_state_check
    CHECK (
      (availability_status = 'available' AND available_quantity IS NULL)
      OR (availability_status = 'limited' AND available_quantity > 0)
      OR (availability_status = 'out_of_stock')
    );

CREATE INDEX IF NOT EXISTS menu_items_availability_idx
  ON public.menu_items (availability_status, is_active);

CREATE TABLE public.menu_item_availability_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  previous_status text NOT NULL
    CHECK (previous_status IN ('available', 'limited', 'out_of_stock')),
  previous_quantity integer,
  new_status text NOT NULL
    CHECK (new_status IN ('available', 'limited', 'out_of_stock')),
  new_quantity integer,
  source text NOT NULL DEFAULT 'menu'
    CHECK (source IN ('menu', 'kitchen', 'pos', 'system')),
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX menu_item_availability_log_item_idx
  ON public.menu_item_availability_log (menu_item_id, created_at DESC);

CREATE TABLE public.menu_item_availability_reservations (
  order_item_id uuid PRIMARY KEY REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX menu_item_availability_reservations_order_idx
  ON public.menu_item_availability_reservations (order_id);

CREATE TABLE public.owner_report_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  recipient_email text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_report_recipient_check CHECK (
    enabled = false
    OR recipient_email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
  )
);

INSERT INTO public.owner_report_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.owner_daily_report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'sent', 'failed')),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  error_message text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.menu_item_availability_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_availability_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_report_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_daily_report_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Availability log viewable by staff"
  ON public.menu_item_availability_log
  FOR SELECT TO authenticated
  USING ((SELECT public.get_user_role()) IN ('owner', 'admin', 'supervisor', 'waiter', 'kitchen'));

CREATE POLICY "Owner report settings viewable by admins"
  ON public.owner_report_settings
  FOR SELECT TO authenticated
  USING ((SELECT public.get_user_role()) IN ('owner', 'admin'));

CREATE POLICY "Owner report settings insertable by admins"
  ON public.owner_report_settings
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) IN ('owner', 'admin'));

CREATE POLICY "Owner report settings updatable by admins"
  ON public.owner_report_settings
  FOR UPDATE TO authenticated
  USING ((SELECT public.get_user_role()) IN ('owner', 'admin'))
  WITH CHECK ((SELECT public.get_user_role()) IN ('owner', 'admin'));

CREATE POLICY "Owner report runs viewable by admins"
  ON public.owner_daily_report_runs
  FOR SELECT TO authenticated
  USING ((SELECT public.get_user_role()) IN ('owner', 'admin'));

GRANT SELECT ON public.menu_item_availability_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.owner_report_settings TO authenticated;
GRANT SELECT ON public.owner_daily_report_runs TO authenticated;
GRANT ALL ON public.menu_item_availability_log TO service_role;
GRANT ALL ON public.menu_item_availability_reservations TO service_role;
GRANT ALL ON public.owner_report_settings TO service_role;
GRANT ALL ON public.owner_daily_report_runs TO service_role;

REVOKE ALL ON public.menu_item_availability_reservations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.menu_item_availability_log FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.owner_daily_report_runs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.reserve_limited_menu_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item_name text;
  item_status text;
  remaining integer;
  next_remaining integer;
BEGIN
  SELECT name, availability_status, available_quantity
  INTO item_name, item_status, remaining
  FROM public.menu_items
  WHERE id = NEW.menu_item_id
  FOR UPDATE;

  IF item_name IS NULL THEN
    RAISE EXCEPTION 'El producto ya no existe';
  END IF;

  IF item_status = 'out_of_stock' THEN
    RAISE EXCEPTION '% está agotado', item_name;
  END IF;

  IF item_status = 'limited' THEN
    IF remaining IS NULL OR remaining < NEW.quantity THEN
      RAISE EXCEPTION 'Solo quedan % unidades de %', COALESCE(remaining, 0), item_name;
    END IF;

    next_remaining := remaining - NEW.quantity;

    UPDATE public.menu_items
    SET availability_status = CASE
          WHEN next_remaining = 0 THEN 'out_of_stock'
          ELSE 'limited'
        END,
        available_quantity = next_remaining,
        availability_updated_at = now(),
        availability_updated_by = (SELECT auth.uid()),
        updated_at = now()
    WHERE id = NEW.menu_item_id;

    INSERT INTO public.menu_item_availability_reservations (
      order_item_id,
      order_id,
      menu_item_id,
      quantity
    ) VALUES (
      NEW.id,
      NEW.order_id,
      NEW.menu_item_id,
      NEW.quantity
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.restore_limited_menu_item_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item_status text;
  remaining integer;
BEGIN
  SELECT availability_status, available_quantity
  INTO item_status, remaining
  FROM public.menu_items
  WHERE id = OLD.menu_item_id
  FOR UPDATE;

  -- A NULL quantity means the product was manually changed to unlimited or
  -- manually blocked. In that case the operator's latest decision wins.
  IF remaining IS NOT NULL AND item_status IN ('limited', 'out_of_stock') THEN
    UPDATE public.menu_items
    SET availability_status = 'limited',
        available_quantity = remaining + OLD.quantity,
        availability_updated_at = now(),
        availability_updated_by = (SELECT auth.uid()),
        updated_at = now()
    WHERE id = OLD.menu_item_id;
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION private.release_cancelled_order_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    DELETE FROM public.menu_item_availability_reservations
    WHERE order_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_menu_item_availability(
  p_menu_item_id uuid,
  p_status text,
  p_quantity integer DEFAULT NULL,
  p_source text DEFAULT 'menu'
)
RETURNS public.menu_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := (SELECT auth.uid());
  previous_item public.menu_items%ROWTYPE;
  updated_item public.menu_items%ROWTYPE;
  normalized_quantity integer;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  IF public.get_user_role() NOT IN ('owner', 'admin', 'supervisor', 'waiter', 'kitchen') THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar la disponibilidad';
  END IF;

  IF p_status NOT IN ('available', 'limited', 'out_of_stock') THEN
    RAISE EXCEPTION 'Estado de disponibilidad no válido';
  END IF;

  IF p_source NOT IN ('menu', 'kitchen', 'pos', 'system') THEN
    RAISE EXCEPTION 'Origen de disponibilidad no válido';
  END IF;

  IF p_status = 'limited' THEN
    IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 9999 THEN
      RAISE EXCEPTION 'La cantidad disponible debe estar entre 1 y 9999';
    END IF;
    normalized_quantity := p_quantity;
  ELSE
    normalized_quantity := NULL;
  END IF;

  SELECT * INTO previous_item
  FROM public.menu_items
  WHERE id = p_menu_item_id
  FOR UPDATE;

  IF previous_item.id IS NULL THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  IF previous_item.availability_status = p_status
     AND previous_item.available_quantity IS NOT DISTINCT FROM normalized_quantity THEN
    RETURN previous_item;
  END IF;

  UPDATE public.menu_items
  SET availability_status = p_status,
      available_quantity = normalized_quantity,
      availability_updated_at = now(),
      availability_updated_by = current_user_id,
      updated_at = now()
  WHERE id = p_menu_item_id
  RETURNING * INTO updated_item;

  INSERT INTO public.menu_item_availability_log (
    menu_item_id,
    previous_status,
    previous_quantity,
    new_status,
    new_quantity,
    source,
    changed_by
  ) VALUES (
    p_menu_item_id,
    previous_item.availability_status,
    previous_item.available_quantity,
    updated_item.availability_status,
    updated_item.available_quantity,
    p_source,
    current_user_id
  );

  RETURN updated_item;
END;
$$;

DROP TRIGGER IF EXISTS trigger_reserve_limited_menu_item ON public.order_items;
CREATE TRIGGER trigger_reserve_limited_menu_item
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION private.reserve_limited_menu_item();

DROP TRIGGER IF EXISTS trigger_restore_limited_menu_item_reservation
  ON public.menu_item_availability_reservations;
CREATE TRIGGER trigger_restore_limited_menu_item_reservation
  BEFORE DELETE ON public.menu_item_availability_reservations
  FOR EACH ROW
  EXECUTE FUNCTION private.restore_limited_menu_item_reservation();

DROP TRIGGER IF EXISTS trigger_release_cancelled_order_availability ON public.orders;
CREATE TRIGGER trigger_release_cancelled_order_availability
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.release_cancelled_order_availability();

REVOKE ALL ON FUNCTION private.reserve_limited_menu_item() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.restore_limited_menu_item_reservation() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.release_cancelled_order_availability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_menu_item_availability(uuid, text, integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_menu_item_availability(uuid, text, integer, text)
  TO authenticated;
