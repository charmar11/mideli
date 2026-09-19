-- Give cash, payments, expenses and their audit records the same business
-- boundary as orders. The existing Mideli-only procedures remain compatible
-- through a controlled Mideli fallback until the business-aware UI is ready.

ALTER TABLE public.cash_shifts
  ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.cash_shift_pending_orders
  ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.cash_shift_adjustments
  ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.cash_shift_opening_float_changes
  ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.cash_movement_corrections
  ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.payment_tenders
  ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.payment_order_allocations
  ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.payment_item_allocations
  ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.payment_tender_method_changes
  ADD COLUMN IF NOT EXISTS business_id uuid;

-- Existing operational data belongs to Mideli. Each update resolves the
-- business by stable slugs so the migration is portable between environments.
UPDATE public.cash_shifts AS shift
   SET business_id = business.id
  FROM public.businesses AS business
  JOIN public.organizations AS organization
    ON organization.id = business.organization_id
 WHERE shift.business_id IS NULL
   AND organization.slug = 'rincon-404-food-park'
   AND business.slug = 'mideli';

UPDATE public.cash_movements AS movement
   SET business_id = shift.business_id
  FROM public.cash_shifts AS shift
 WHERE movement.business_id IS NULL
   AND shift.id = movement.shift_id;

UPDATE public.cash_shift_pending_orders AS pending
   SET business_id = COALESCE(
     shift.business_id,
     (
       SELECT order_row.business_id
         FROM public.orders AS order_row
        WHERE order_row.id = pending.order_id
     )
   )
  FROM public.cash_shifts AS shift
 WHERE pending.business_id IS NULL
   AND shift.id = pending.closing_shift_id;

UPDATE public.cash_shift_adjustments AS adjustment
   SET business_id = shift.business_id
  FROM public.cash_shifts AS shift
 WHERE adjustment.business_id IS NULL
   AND shift.id = adjustment.shift_id;

UPDATE public.cash_shift_opening_float_changes AS change_row
   SET business_id = shift.business_id
  FROM public.cash_shifts AS shift
 WHERE change_row.business_id IS NULL
   AND shift.id = change_row.shift_id;

UPDATE public.cash_movement_corrections AS correction
   SET business_id = shift.business_id
  FROM public.cash_shifts AS shift
 WHERE correction.business_id IS NULL
   AND shift.id = correction.shift_id;

UPDATE public.payment_transactions AS transaction
   SET business_id = COALESCE(
     shift.business_id,
     (
       SELECT order_row.business_id
         FROM public.payment_order_allocations AS allocation
         JOIN public.orders AS order_row
           ON order_row.id = allocation.order_id
        WHERE allocation.transaction_id = transaction.id
        ORDER BY allocation.created_at, allocation.id
        LIMIT 1
     )
   )
  FROM public.cash_shifts AS shift
 WHERE transaction.business_id IS NULL
   AND shift.id = transaction.cash_shift_id;

UPDATE public.payment_transactions AS transaction
   SET business_id = (
     SELECT order_row.business_id
       FROM public.payment_order_allocations AS allocation
       JOIN public.orders AS order_row
         ON order_row.id = allocation.order_id
      WHERE allocation.transaction_id = transaction.id
      ORDER BY allocation.created_at, allocation.id
      LIMIT 1
   )
 WHERE transaction.business_id IS NULL;

UPDATE public.payment_order_allocations AS allocation
   SET business_id = transaction.business_id
  FROM public.payment_transactions AS transaction
 WHERE allocation.business_id IS NULL
   AND transaction.id = allocation.transaction_id;

UPDATE public.payment_item_allocations AS allocation
   SET business_id = transaction.business_id
  FROM public.payment_transactions AS transaction
 WHERE allocation.business_id IS NULL
   AND transaction.id = allocation.transaction_id;

UPDATE public.payment_tenders AS tender
   SET business_id = transaction.business_id
  FROM public.payment_transactions AS transaction
 WHERE tender.business_id IS NULL
   AND transaction.id = tender.transaction_id;

UPDATE public.payment_tender_method_changes AS change_row
   SET business_id = transaction.business_id
  FROM public.payment_transactions AS transaction
 WHERE change_row.business_id IS NULL
   AND transaction.id = change_row.transaction_id;

DO $$
DECLARE
  v_business_exists boolean;
  v_null_count integer;
  v_cross_business_count integer;
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
      'Se difiere el backfill financiero: todavía no existe el negocio Mideli';
    RETURN;
  END IF;

  SELECT count(*) INTO v_null_count
    FROM (
      SELECT business_id FROM public.cash_shifts
      UNION ALL SELECT business_id FROM public.cash_movements
      UNION ALL SELECT business_id FROM public.cash_shift_pending_orders
      UNION ALL SELECT business_id FROM public.cash_shift_adjustments
      UNION ALL SELECT business_id FROM public.cash_shift_opening_float_changes
      UNION ALL SELECT business_id FROM public.cash_movement_corrections
      UNION ALL SELECT business_id FROM public.payment_transactions
      UNION ALL SELECT business_id FROM public.payment_tenders
      UNION ALL SELECT business_id FROM public.payment_order_allocations
      UNION ALL SELECT business_id FROM public.payment_item_allocations
      UNION ALL SELECT business_id FROM public.payment_tender_method_changes
    ) AS scoped_rows
   WHERE business_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'Hay registros financieros sin negocio: %', v_null_count;
  END IF;

  SELECT count(*) INTO v_cross_business_count
    FROM public.payment_order_allocations AS allocation
    JOIN public.orders AS order_row
      ON order_row.id = allocation.order_id
   WHERE allocation.business_id IS DISTINCT FROM order_row.business_id;
  IF v_cross_business_count > 0 THEN
    RAISE EXCEPTION 'Hay cobros ligados a pedidos de otro negocio: %', v_cross_business_count;
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
    ALTER TABLE public.cash_shifts ALTER COLUMN business_id SET NOT NULL;
    ALTER TABLE public.cash_movements ALTER COLUMN business_id SET NOT NULL;
    ALTER TABLE public.cash_shift_pending_orders ALTER COLUMN business_id SET NOT NULL;
    ALTER TABLE public.cash_shift_adjustments ALTER COLUMN business_id SET NOT NULL;
    ALTER TABLE public.cash_shift_opening_float_changes ALTER COLUMN business_id SET NOT NULL;
    ALTER TABLE public.cash_movement_corrections ALTER COLUMN business_id SET NOT NULL;
    ALTER TABLE public.payment_transactions ALTER COLUMN business_id SET NOT NULL;
    ALTER TABLE public.payment_tenders ALTER COLUMN business_id SET NOT NULL;
    ALTER TABLE public.payment_order_allocations ALTER COLUMN business_id SET NOT NULL;
    ALTER TABLE public.payment_item_allocations ALTER COLUMN business_id SET NOT NULL;
    ALTER TABLE public.payment_tender_method_changes ALTER COLUMN business_id SET NOT NULL;
  END IF;
END;
$$;

ALTER TABLE public.cash_shifts
  ADD CONSTRAINT cash_shifts_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.cash_movements
  ADD CONSTRAINT cash_movements_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.cash_shift_pending_orders
  ADD CONSTRAINT cash_shift_pending_orders_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.cash_shift_adjustments
  ADD CONSTRAINT cash_shift_adjustments_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.cash_shift_opening_float_changes
  ADD CONSTRAINT cash_shift_opening_float_changes_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.cash_movement_corrections
  ADD CONSTRAINT cash_movement_corrections_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.payment_tenders
  ADD CONSTRAINT payment_tenders_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.payment_order_allocations
  ADD CONSTRAINT payment_order_allocations_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.payment_item_allocations
  ADD CONSTRAINT payment_item_allocations_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.payment_tender_method_changes
  ADD CONSTRAINT payment_tender_method_changes_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;

DROP INDEX IF EXISTS public.cash_shifts_single_open_idx;
CREATE UNIQUE INDEX cash_shifts_single_open_business_idx
  ON public.cash_shifts (business_id)
  WHERE status = 'open' AND business_id IS NOT NULL;

CREATE INDEX cash_shifts_business_opened_idx
  ON public.cash_shifts (business_id, opened_at DESC);
CREATE INDEX cash_movements_business_created_idx
  ON public.cash_movements (business_id, created_at DESC);
CREATE INDEX cash_shift_pending_orders_business_created_idx
  ON public.cash_shift_pending_orders (business_id, created_at DESC);
CREATE INDEX cash_shift_adjustments_business_created_idx
  ON public.cash_shift_adjustments (business_id, created_at DESC);
CREATE INDEX cash_shift_opening_float_business_created_idx
  ON public.cash_shift_opening_float_changes (business_id, created_at DESC);
CREATE INDEX cash_movement_corrections_business_created_idx
  ON public.cash_movement_corrections (business_id, created_at DESC);
CREATE INDEX payment_transactions_business_created_idx
  ON public.payment_transactions (business_id, created_at DESC);
CREATE INDEX payment_tenders_business_created_idx
  ON public.payment_tenders (business_id, created_at DESC);
CREATE INDEX payment_order_allocations_business_created_idx
  ON public.payment_order_allocations (business_id, created_at DESC);
CREATE INDEX payment_item_allocations_business_created_idx
  ON public.payment_item_allocations (business_id, created_at DESC);
CREATE INDEX payment_tender_changes_business_created_idx
  ON public.payment_tender_method_changes (business_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.multibusiness_assign_cash_shift_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_mideli_business_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.business_id IS NOT NULL
     AND NEW.business_id IS DISTINCT FROM OLD.business_id THEN
    RAISE EXCEPTION 'El negocio del corte de caja no se puede cambiar';
  END IF;

  IF NEW.business_id IS NULL THEN
    SELECT private.multibusiness_mideli_business_id()
      INTO v_mideli_business_id;
    IF v_mideli_business_id IS NULL THEN
      RAISE EXCEPTION 'No se encontró el negocio Mideli para la caja';
    END IF;
    NEW.business_id := v_mideli_business_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.businesses AS business
     WHERE business.id = NEW.business_id
       AND business.lifecycle_status NOT IN ('archived', 'retired')
  ) THEN
    RAISE EXCEPTION 'El negocio de la caja no está disponible';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_assign_shift_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_shift_business_id uuid;
BEGIN
  SELECT shift.business_id
    INTO v_shift_business_id
    FROM public.cash_shifts AS shift
   WHERE shift.id = NEW.shift_id;

  IF v_shift_business_id IS NULL THEN
    RAISE EXCEPTION 'El corte de caja no tiene negocio';
  END IF;
  IF NEW.business_id IS NOT NULL
     AND NEW.business_id IS DISTINCT FROM v_shift_business_id THEN
    RAISE EXCEPTION 'El registro no coincide con el negocio del corte';
  END IF;

  NEW.business_id := v_shift_business_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_validate_pending_order_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_shift_business_id uuid;
  v_order_business_id uuid;
BEGIN
  SELECT shift.business_id
    INTO v_shift_business_id
    FROM public.cash_shifts AS shift
   WHERE shift.id = NEW.closing_shift_id;
  IF v_shift_business_id IS NULL THEN
    RAISE EXCEPTION 'El corte pendiente no tiene negocio';
  END IF;

  IF NEW.order_id IS NOT NULL THEN
    SELECT order_row.business_id
      INTO v_order_business_id
      FROM public.orders AS order_row
     WHERE order_row.id = NEW.order_id;
    IF v_order_business_id IS DISTINCT FROM v_shift_business_id THEN
      RAISE EXCEPTION 'El pedido pendiente no coincide con el negocio del corte';
    END IF;
  END IF;

  IF NEW.business_id IS NOT NULL
     AND NEW.business_id IS DISTINCT FROM v_shift_business_id THEN
    RAISE EXCEPTION 'El pedido pendiente no coincide con su corte';
  END IF;

  NEW.business_id := v_shift_business_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_assign_payment_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_business_id uuid;
  v_mideli_business_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.business_id IS NOT NULL
     AND NEW.business_id IS DISTINCT FROM OLD.business_id THEN
    RAISE EXCEPTION 'El negocio del cobro no se puede cambiar';
  END IF;

  IF NEW.business_id IS NULL AND NEW.cash_shift_id IS NOT NULL THEN
    SELECT shift.business_id
      INTO v_business_id
      FROM public.cash_shifts AS shift
     WHERE shift.id = NEW.cash_shift_id;
    NEW.business_id := v_business_id;
  END IF;

  IF NEW.business_id IS NULL THEN
    SELECT private.multibusiness_mideli_business_id()
      INTO v_mideli_business_id;
    NEW.business_id := v_mideli_business_id;
  END IF;

  IF NEW.business_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.businesses AS business
     WHERE business.id = NEW.business_id
       AND business.lifecycle_status NOT IN ('archived', 'retired')
  ) THEN
    RAISE EXCEPTION 'El negocio del cobro no está disponible';
  END IF;

  IF NEW.cash_shift_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.cash_shifts AS shift
     WHERE shift.id = NEW.cash_shift_id
       AND shift.business_id = NEW.business_id
  ) THEN
    RAISE EXCEPTION 'El cobro y la caja no pertenecen al mismo negocio';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_validate_payment_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_transaction_business_id uuid;
  v_order_business_id uuid;
BEGIN
  SELECT transaction.business_id
    INTO v_transaction_business_id
    FROM public.payment_transactions AS transaction
   WHERE transaction.id = NEW.transaction_id;
  SELECT order_row.business_id
    INTO v_order_business_id
    FROM public.orders AS order_row
   WHERE order_row.id = NEW.order_id;

  IF v_transaction_business_id IS NULL OR v_order_business_id IS NULL
     OR v_transaction_business_id IS DISTINCT FROM v_order_business_id THEN
    RAISE EXCEPTION 'El cobro y el pedido no pertenecen al mismo negocio';
  END IF;
  IF NEW.business_id IS NOT NULL
     AND NEW.business_id IS DISTINCT FROM v_transaction_business_id THEN
    RAISE EXCEPTION 'La asignación del cobro no coincide con su transacción';
  END IF;

  NEW.business_id := v_transaction_business_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_validate_payment_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_transaction_business_id uuid;
  v_order_business_id uuid;
BEGIN
  SELECT transaction.business_id
    INTO v_transaction_business_id
    FROM public.payment_transactions AS transaction
   WHERE transaction.id = NEW.transaction_id;
  SELECT order_row.business_id
    INTO v_order_business_id
    FROM public.orders AS order_row
   WHERE order_row.id = NEW.order_id;

  IF v_transaction_business_id IS NULL OR v_order_business_id IS NULL
     OR v_transaction_business_id IS DISTINCT FROM v_order_business_id THEN
    RAISE EXCEPTION 'El artículo cobrado y el pedido no pertenecen al mismo negocio';
  END IF;
  IF NEW.business_id IS NOT NULL
     AND NEW.business_id IS DISTINCT FROM v_transaction_business_id THEN
    RAISE EXCEPTION 'La asignación del artículo cobrado no coincide';
  END IF;

  NEW.business_id := v_transaction_business_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_assign_payment_child_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_transaction_business_id uuid;
BEGIN
  SELECT transaction.business_id
    INTO v_transaction_business_id
    FROM public.payment_transactions AS transaction
   WHERE transaction.id = NEW.transaction_id;
  IF v_transaction_business_id IS NULL THEN
    RAISE EXCEPTION 'La transacción no tiene negocio';
  END IF;
  IF NEW.business_id IS NOT NULL
     AND NEW.business_id IS DISTINCT FROM v_transaction_business_id THEN
    RAISE EXCEPTION 'El registro de pago no coincide con su transacción';
  END IF;
  NEW.business_id := v_transaction_business_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cash_shifts_assign_business
  BEFORE INSERT OR UPDATE ON public.cash_shifts
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_assign_cash_shift_business();
CREATE TRIGGER cash_movements_assign_business
  BEFORE INSERT OR UPDATE ON public.cash_movements
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_assign_shift_business();
CREATE TRIGGER cash_shift_adjustments_assign_business
  BEFORE INSERT OR UPDATE ON public.cash_shift_adjustments
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_assign_shift_business();
CREATE TRIGGER cash_shift_opening_float_assign_business
  BEFORE INSERT OR UPDATE ON public.cash_shift_opening_float_changes
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_assign_shift_business();
CREATE TRIGGER cash_movement_corrections_assign_business
  BEFORE INSERT OR UPDATE ON public.cash_movement_corrections
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_assign_shift_business();
CREATE TRIGGER cash_shift_pending_orders_validate_business
  BEFORE INSERT OR UPDATE ON public.cash_shift_pending_orders
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_validate_pending_order_business();
CREATE TRIGGER payment_transactions_assign_business
  BEFORE INSERT OR UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_assign_payment_business();
CREATE TRIGGER payment_order_allocations_validate_business
  BEFORE INSERT OR UPDATE ON public.payment_order_allocations
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_validate_payment_order();
CREATE TRIGGER payment_item_allocations_validate_business
  BEFORE INSERT OR UPDATE ON public.payment_item_allocations
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_validate_payment_item();
CREATE TRIGGER payment_tenders_assign_business
  BEFORE INSERT OR UPDATE ON public.payment_tenders
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_assign_payment_child_business();
CREATE TRIGGER payment_tender_changes_assign_business
  BEFORE INSERT OR UPDATE ON public.payment_tender_method_changes
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_assign_payment_child_business();

-- Legacy Mideli procedures select the current business implicitly. The
-- business-aware UI can provide NEW.business_id and will receive its own shift.
CREATE OR REPLACE FUNCTION private.assign_order_cash_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := private.active_profile_role();
  v_business_id uuid := NEW.business_id;
  v_zone_id uuid;
  v_zone_name text;
  v_table_name text;
BEGIN
  IF v_role NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para operar pedidos';
  END IF;

  IF v_business_id IS NULL THEN
    v_business_id := private.multibusiness_mideli_business_id();
    NEW.business_id := v_business_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT shift.id INTO NEW.cash_shift_id
      FROM public.cash_shifts AS shift
     WHERE shift.status = 'open'
       AND shift.business_id = v_business_id
     LIMIT 1
     FOR SHARE;
    IF NEW.cash_shift_id IS NULL THEN
      RAISE EXCEPTION 'Abre un turno de caja antes de crear pedidos';
    END IF;
  ELSIF NEW.cash_shift_id IS DISTINCT FROM OLD.cash_shift_id THEN
    RAISE EXCEPTION 'El turno original del pedido no se puede cambiar';
  END IF;

  IF NEW.table_id IS NOT NULL THEN
    SELECT restaurant_table.zone_id, zone.name, restaurant_table.name
      INTO v_zone_id, v_zone_name, v_table_name
      FROM public.restaurant_tables AS restaurant_table
      LEFT JOIN public.table_zones AS zone ON zone.id = restaurant_table.zone_id
     WHERE restaurant_table.id = NEW.table_id;
    NEW.table_zone_id := v_zone_id;
    NEW.table_zone_name := v_zone_name;
    NEW.table_number := COALESCE(NULLIF(btrim(NEW.table_number), ''), v_table_name);
  ELSE
    NEW.table_zone_id := NULL;
    NEW.table_zone_name := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.assign_payment_cash_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := private.active_profile_role();
  v_business_id uuid := NEW.business_id;
BEGIN
  IF v_role NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar pagos';
  END IF;
  IF v_business_id IS NULL THEN
    v_business_id := private.multibusiness_mideli_business_id();
    NEW.business_id := v_business_id;
  END IF;

  SELECT shift.id INTO NEW.cash_shift_id
    FROM public.cash_shifts AS shift
   WHERE shift.status = 'open'
     AND shift.business_id = v_business_id
   LIMIT 1
   FOR SHARE;
  IF NEW.cash_shift_id IS NULL THEN
    RAISE EXCEPTION 'Abre un turno de caja antes de cobrar';
  END IF;

  IF NEW.table_id IS NOT NULL THEN
    SELECT zone.name INTO NEW.table_zone_name
      FROM public.restaurant_tables AS restaurant_table
      LEFT JOIN public.table_zones AS zone ON zone.id = restaurant_table.zone_id
     WHERE restaurant_table.id = NEW.table_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.get_current_cash_shift()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_shift_id uuid;
  v_business_id uuid := private.multibusiness_mideli_business_id();
  v_role text := private.active_profile_role();
BEGIN
  IF v_role NOT IN ('owner', 'admin', 'waiter', 'supervisor')
     OR v_business_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT shift.id
    INTO v_shift_id
    FROM public.cash_shifts AS shift
   WHERE shift.status = 'open'
     AND shift.business_id = v_business_id
   LIMIT 1;

  IF v_shift_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN private.cash_shift_json(v_shift_id, false);
END;
$$;

CREATE OR REPLACE FUNCTION private.open_cash_shift(
  p_opening_float numeric,
  p_opening_denominations jsonb DEFAULT '{}'::jsonb,
  p_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_role text := private.active_profile_role();
  v_business_id uuid := private.multibusiness_mideli_business_id();
  v_shift_id uuid;
BEGIN
  IF v_user_id IS NULL
     OR v_role NOT IN ('owner', 'admin', 'waiter', 'supervisor')
     OR v_business_id IS NULL THEN
    RAISE EXCEPTION 'No tienes permiso para abrir caja';
  END IF;
  IF p_opening_float IS NULL OR ROUND(p_opening_float, 2) < 0 THEN
    RAISE EXCEPTION 'El fondo inicial no es válido';
  END IF;
  IF jsonb_typeof(COALESCE(p_opening_denominations, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'El conteo inicial no es válido';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_business_id::text, 406));

  SELECT shift.id
    INTO v_shift_id
    FROM public.cash_shifts AS shift
   WHERE shift.status = 'open'
     AND shift.business_id = v_business_id
   LIMIT 1;

  IF v_shift_id IS NOT NULL THEN
    RETURN private.cash_shift_json(v_shift_id, false);
  END IF;

  INSERT INTO public.cash_shifts (
    business_id,
    opening_float,
    opening_denominations,
    opening_note,
    opened_by
  ) VALUES (
    v_business_id,
    ROUND(p_opening_float, 2),
    COALESCE(p_opening_denominations, '{}'::jsonb),
    COALESCE(btrim(p_note), ''),
    v_user_id
  )
  RETURNING id INTO v_shift_id;

  UPDATE public.cash_shift_pending_orders AS pending
     SET next_shift_id = v_shift_id
   WHERE pending.next_shift_id IS NULL
     AND pending.business_id = v_business_id
     AND pending.order_id IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.orders AS order_row
        WHERE order_row.id = pending.order_id
          AND order_row.business_id = v_business_id
          AND order_row.status <> 'cancelled'
          AND order_row.payment_status <> 'paid'
          AND order_row.total::numeric > order_row.paid_amount
     );

  RETURN private.cash_shift_json(v_shift_id, false);
END;
$$;

REVOKE ALL ON FUNCTION private.multibusiness_assign_cash_shift_business()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_assign_shift_business()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_validate_pending_order_business()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_assign_payment_business()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_validate_payment_order()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_validate_payment_item()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_assign_payment_child_business()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.assign_order_cash_context()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.assign_payment_cash_context()
  FROM PUBLIC, anon, authenticated;
