-- Shared cash shifts, blind closeouts, immutable cash movements, historical
-- table locations, and managed menu product images.

CREATE TABLE public.cash_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_float numeric(12,2) NOT NULL DEFAULT 0 CHECK (opening_float >= 0),
  opening_denominations jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(opening_denominations) = 'object'),
  opening_note text NOT NULL DEFAULT '',
  opened_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL DEFAULT now(),
  count_mode text CHECK (count_mode IS NULL OR count_mode IN ('denominations', 'total')),
  count_denominations jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(count_denominations) = 'object'),
  counted_cash numeric(12,2) CHECK (counted_cash IS NULL OR counted_cash >= 0),
  expected_cash numeric(12,2),
  difference numeric(12,2),
  gross_sales numeric(12,2) NOT NULL DEFAULT 0 CHECK (gross_sales >= 0),
  net_sales numeric(12,2) NOT NULL DEFAULT 0 CHECK (net_sales >= 0),
  discount_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tip_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (tip_total >= 0),
  collected_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (collected_total >= 0),
  cash_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (cash_total >= 0),
  card_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (card_total >= 0),
  transfer_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (transfer_total >= 0),
  voided_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (voided_total >= 0),
  fund_in_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (fund_in_total >= 0),
  withdrawal_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (withdrawal_total >= 0),
  expense_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (expense_total >= 0),
  correction_total numeric(12,2) NOT NULL DEFAULT 0,
  payment_count integer NOT NULL DEFAULT 0 CHECK (payment_count >= 0),
  pending_order_count integer NOT NULL DEFAULT 0 CHECK (pending_order_count >= 0),
  pending_balance numeric(12,2) NOT NULL DEFAULT 0 CHECK (pending_balance >= 0),
  close_note text NOT NULL DEFAULT '',
  closed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  difference_authorized_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_shifts_close_state_check CHECK (
    (
      status = 'open'
      AND count_mode IS NULL
      AND counted_cash IS NULL
      AND expected_cash IS NULL
      AND difference IS NULL
      AND closed_by IS NULL
      AND closed_at IS NULL
    ) OR (
      status = 'closed'
      AND count_mode IS NOT NULL
      AND counted_cash IS NOT NULL
      AND expected_cash IS NOT NULL
      AND difference IS NOT NULL
      AND closed_by IS NOT NULL
      AND closed_at IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX cash_shifts_single_open_idx
  ON public.cash_shifts (status)
  WHERE status = 'open';
CREATE INDEX cash_shifts_closed_at_idx
  ON public.cash_shifts (closed_at DESC)
  WHERE status = 'closed';
CREATE INDEX cash_shifts_opened_by_opened_at_idx
  ON public.cash_shifts (opened_by, opened_at DESC);
CREATE INDEX cash_shifts_closed_by_closed_at_idx
  ON public.cash_shifts (closed_by, closed_at DESC)
  WHERE closed_by IS NOT NULL;

CREATE TABLE public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.cash_shifts(id) ON DELETE RESTRICT,
  movement_type text NOT NULL
    CHECK (movement_type IN ('fund_addition', 'withdrawal', 'expense', 'correction')),
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 300),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  authorized_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_movements_type_direction_check CHECK (
    (movement_type = 'fund_addition' AND direction = 'in')
    OR (movement_type IN ('withdrawal', 'expense') AND direction = 'out')
    OR movement_type = 'correction'
  )
);

CREATE INDEX cash_movements_shift_created_at_idx
  ON public.cash_movements (shift_id, created_at DESC);
CREATE INDEX cash_movements_created_by_created_at_idx
  ON public.cash_movements (created_by, created_at DESC);

CREATE TABLE public.cash_shift_pending_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_shift_id uuid NOT NULL REFERENCES public.cash_shifts(id) ON DELETE RESTRICT,
  next_shift_id uuid REFERENCES public.cash_shifts(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  order_number integer NOT NULL,
  order_type public.order_type NOT NULL,
  table_zone_name text,
  table_number text,
  customer_name text,
  outstanding_amount numeric(12,2) NOT NULL CHECK (outstanding_amount > 0),
  items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(items_snapshot) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (closing_shift_id, order_id)
);

CREATE INDEX cash_shift_pending_orders_closing_idx
  ON public.cash_shift_pending_orders (closing_shift_id, created_at);
CREATE INDEX cash_shift_pending_orders_next_idx
  ON public.cash_shift_pending_orders (next_shift_id)
  WHERE next_shift_id IS NOT NULL;
CREATE INDEX cash_shift_pending_orders_order_idx
  ON public.cash_shift_pending_orders (order_id)
  WHERE order_id IS NOT NULL;

CREATE TABLE public.cash_shift_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.cash_shifts(id) ON DELETE RESTRICT,
  payment_method text NOT NULL
    CHECK (payment_method IN ('efectivo', 'tarjeta', 'transferencia', 'otro')),
  direction text NOT NULL CHECK (direction IN ('increase', 'decrease')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 300),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  authorized_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cash_shift_adjustments_shift_created_at_idx
  ON public.cash_shift_adjustments (shift_id, created_at DESC);

CREATE TABLE private.cash_action_authorizations (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.cash_shifts(id) ON DELETE CASCADE,
  action text NOT NULL
    CHECK (action IN ('cash_movement', 'close_difference', 'shift_adjustment')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  authorized_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cash_action_authorizations_lookup_idx
  ON private.cash_action_authorizations
  (requested_by, shift_id, action, expires_at)
  WHERE used_at IS NULL;

ALTER TABLE public.orders
  ADD COLUMN cash_shift_id uuid REFERENCES public.cash_shifts(id) ON DELETE RESTRICT,
  ADD COLUMN table_zone_id uuid REFERENCES public.table_zones(id) ON DELETE SET NULL,
  ADD COLUMN table_zone_name text;

CREATE INDEX orders_cash_shift_created_at_idx
  ON public.orders (cash_shift_id, created_at DESC)
  WHERE cash_shift_id IS NOT NULL;
CREATE INDEX orders_table_zone_id_idx
  ON public.orders (table_zone_id)
  WHERE table_zone_id IS NOT NULL;

ALTER TABLE public.payment_transactions
  ADD COLUMN cash_shift_id uuid REFERENCES public.cash_shifts(id) ON DELETE RESTRICT,
  ADD COLUMN table_zone_name text;

CREATE INDEX payment_transactions_cash_shift_created_at_idx
  ON public.payment_transactions (cash_shift_id, created_at DESC)
  WHERE cash_shift_id IS NOT NULL;

UPDATE public.orders AS orders
SET table_zone_id = restaurant_table.zone_id,
    table_zone_name = zone.name
FROM public.restaurant_tables AS restaurant_table
LEFT JOIN public.table_zones AS zone ON zone.id = restaurant_table.zone_id
WHERE orders.table_id = restaurant_table.id
  AND (orders.table_zone_id IS NULL OR orders.table_zone_name IS NULL);

UPDATE public.payment_transactions AS transaction
SET table_zone_name = source.table_zone_name
FROM (
  SELECT DISTINCT ON (allocation.transaction_id)
    allocation.transaction_id,
    orders.table_zone_name
  FROM public.payment_order_allocations AS allocation
  JOIN public.orders AS orders ON orders.id = allocation.order_id
  ORDER BY allocation.transaction_id, allocation.created_at, allocation.id
) AS source
WHERE source.transaction_id = transaction.id
  AND transaction.table_zone_name IS NULL;

CREATE OR REPLACE FUNCTION private.active_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profile.role
  FROM public.profiles AS profile
  WHERE profile.id = (SELECT auth.uid())
    AND profile.is_active;
$$;

CREATE OR REPLACE FUNCTION private.can_view_cash_shift(p_shift_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cash_shifts AS shift
    JOIN public.profiles AS profile
      ON profile.id = (SELECT auth.uid())
     AND profile.is_active
    WHERE shift.id = p_shift_id
      AND (
        profile.role IN ('owner', 'admin')
        OR (profile.role IN ('waiter', 'supervisor') AND shift.status = 'open')
        OR (
          profile.role = 'supervisor'
          AND (
            shift.opened_by = profile.id
            OR shift.closed_by = profile.id
            OR shift.difference_authorized_by = profile.id
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.cash_shift_totals(p_shift_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH shift AS (
    SELECT opening_float
    FROM public.cash_shifts
    WHERE id = p_shift_id
  ), transaction_totals AS (
    SELECT
      count(*) FILTER (WHERE status = 'completed')::integer AS payment_count,
      COALESCE(sum(subtotal_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS gross_sales,
      COALESCE(sum(discount_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS discount_total,
      COALESCE(sum(tip_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS tip_total,
      COALESCE(sum(subtotal_amount - discount_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS net_sales,
      COALESCE(sum(total_amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS collected_total,
      COALESCE(sum(total_amount) FILTER (WHERE status = 'voided'), 0)::numeric(12,2) AS voided_total
    FROM public.payment_transactions
    WHERE cash_shift_id = p_shift_id
  ), tender_totals AS (
    SELECT
      COALESCE(sum(tender.amount) FILTER (WHERE tender.method = 'efectivo'), 0)::numeric(12,2) AS cash_total,
      COALESCE(sum(tender.amount) FILTER (WHERE tender.method = 'tarjeta'), 0)::numeric(12,2) AS card_total,
      COALESCE(sum(tender.amount) FILTER (WHERE tender.method = 'transferencia'), 0)::numeric(12,2) AS transfer_total
    FROM public.payment_tenders AS tender
    JOIN public.payment_transactions AS transaction
      ON transaction.id = tender.transaction_id
     AND transaction.status = 'completed'
    WHERE transaction.cash_shift_id = p_shift_id
  ), movement_totals AS (
    SELECT
      COALESCE(sum(amount) FILTER (WHERE movement_type = 'fund_addition'), 0)::numeric(12,2) AS fund_in_total,
      COALESCE(sum(amount) FILTER (WHERE movement_type = 'withdrawal'), 0)::numeric(12,2) AS withdrawal_total,
      COALESCE(sum(amount) FILTER (WHERE movement_type = 'expense'), 0)::numeric(12,2) AS expense_total,
      COALESCE(sum(
        CASE
          WHEN movement_type = 'correction' AND direction = 'in' THEN amount
          WHEN movement_type = 'correction' AND direction = 'out' THEN -amount
          ELSE 0
        END
      ), 0)::numeric(12,2) AS correction_total
    FROM public.cash_movements
    WHERE shift_id = p_shift_id
  ), pending_totals AS (
    SELECT
      count(*)::integer AS pending_order_count,
      COALESCE(sum(GREATEST(orders.total::numeric - orders.paid_amount, 0)), 0)::numeric(12,2) AS pending_balance
    FROM public.orders AS orders
    WHERE orders.status <> 'cancelled'
      AND orders.payment_status <> 'paid'
      AND orders.total::numeric > orders.paid_amount
  )
  SELECT jsonb_build_object(
    'payment_count', transaction_totals.payment_count,
    'gross_sales', transaction_totals.gross_sales,
    'discount_total', transaction_totals.discount_total,
    'tip_total', transaction_totals.tip_total,
    'net_sales', transaction_totals.net_sales,
    'collected_total', transaction_totals.collected_total,
    'voided_total', transaction_totals.voided_total,
    'cash_total', tender_totals.cash_total,
    'card_total', tender_totals.card_total,
    'transfer_total', tender_totals.transfer_total,
    'fund_in_total', movement_totals.fund_in_total,
    'withdrawal_total', movement_totals.withdrawal_total,
    'expense_total', movement_totals.expense_total,
    'correction_total', movement_totals.correction_total,
    'pending_order_count', pending_totals.pending_order_count,
    'pending_balance', pending_totals.pending_balance,
    'expected_cash', ROUND(
      shift.opening_float
      + tender_totals.cash_total
      + movement_totals.fund_in_total
      - movement_totals.withdrawal_total
      - movement_totals.expense_total
      + movement_totals.correction_total,
      2
    )
  )
  FROM shift
  CROSS JOIN transaction_totals
  CROSS JOIN tender_totals
  CROSS JOIN movement_totals
  CROSS JOIN pending_totals;
$$;

CREATE OR REPLACE FUNCTION private.cash_shift_json(
  p_shift_id uuid,
  p_reveal_cash boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_shift public.cash_shifts%ROWTYPE;
  v_result jsonb;
  v_totals jsonb;
  v_opened_by_name text;
  v_closed_by_name text;
  v_authorized_by_name text;
BEGIN
  SELECT * INTO v_shift
  FROM public.cash_shifts
  WHERE id = p_shift_id;

  IF v_shift.id IS NULL THEN RETURN NULL; END IF;

  SELECT full_name INTO v_opened_by_name FROM public.profiles WHERE id = v_shift.opened_by;
  SELECT full_name INTO v_closed_by_name FROM public.profiles WHERE id = v_shift.closed_by;
  SELECT full_name INTO v_authorized_by_name FROM public.profiles WHERE id = v_shift.difference_authorized_by;

  v_result := to_jsonb(v_shift) || jsonb_build_object(
    'opened_by_name', COALESCE(v_opened_by_name, 'Personal'),
    'closed_by_name', v_closed_by_name,
    'difference_authorized_by_name', v_authorized_by_name
  );

  IF v_shift.status = 'open' THEN
    v_totals := private.cash_shift_totals(v_shift.id);
    IF NOT p_reveal_cash THEN
      v_totals := v_totals
        - ARRAY['cash_total', 'expected_cash', 'gross_sales', 'net_sales', 'collected_total'];
    END IF;
    v_result := v_result || jsonb_build_object('operating_totals', v_totals);
  END IF;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION private.assign_order_cash_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := private.active_profile_role();
  v_zone_id uuid;
  v_zone_name text;
  v_table_name text;
BEGIN
  IF v_role NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para operar pedidos';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT shift.id INTO NEW.cash_shift_id
    FROM public.cash_shifts AS shift
    WHERE shift.status = 'open'
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

CREATE TRIGGER assign_order_cash_context_before_insert
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.assign_order_cash_context();

CREATE TRIGGER assign_order_location_before_update
BEFORE UPDATE OF table_id, table_number, cash_shift_id ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.assign_order_cash_context();

CREATE OR REPLACE FUNCTION private.assign_payment_cash_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := private.active_profile_role();
BEGIN
  IF v_role NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar pagos';
  END IF;

  SELECT shift.id INTO NEW.cash_shift_id
  FROM public.cash_shifts AS shift
  WHERE shift.status = 'open'
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

CREATE TRIGGER assign_payment_cash_context_before_insert
BEFORE INSERT ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION private.assign_payment_cash_context();

CREATE OR REPLACE FUNCTION private.guard_financial_cash_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.cash_shift_id IS DISTINCT FROM OLD.cash_shift_id
     OR NEW.table_zone_name IS DISTINCT FROM OLD.table_zone_name THEN
    RAISE EXCEPTION 'El contexto de caja del cobro es inmutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_payment_cash_context_before_update
BEFORE UPDATE OF cash_shift_id, table_zone_name ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION private.guard_financial_cash_context();

CREATE OR REPLACE FUNCTION private.get_current_cash_shift()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_shift_id uuid;
  v_role text := private.active_profile_role();
BEGIN
  IF v_role NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_shift_id
  FROM public.cash_shifts
  WHERE status = 'open'
  LIMIT 1;

  IF v_shift_id IS NULL THEN RETURN NULL; END IF;
  RETURN private.cash_shift_json(v_shift_id, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_cash_shift()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.get_current_cash_shift();
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
  v_shift_id uuid;
BEGIN
  IF v_user_id IS NULL OR v_role NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para abrir caja';
  END IF;
  IF p_opening_float IS NULL OR ROUND(p_opening_float, 2) < 0 THEN
    RAISE EXCEPTION 'El fondo inicial no es válido';
  END IF;
  IF jsonb_typeof(COALESCE(p_opening_denominations, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'El conteo inicial no es válido';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('mideli-shared-cash-shift', 0));

  SELECT id INTO v_shift_id
  FROM public.cash_shifts
  WHERE status = 'open'
  LIMIT 1;

  IF v_shift_id IS NOT NULL THEN
    RETURN private.cash_shift_json(v_shift_id, false);
  END IF;

  INSERT INTO public.cash_shifts (
    opening_float,
    opening_denominations,
    opening_note,
    opened_by
  ) VALUES (
    ROUND(p_opening_float, 2),
    COALESCE(p_opening_denominations, '{}'::jsonb),
    COALESCE(btrim(p_note), ''),
    v_user_id
  )
  RETURNING id INTO v_shift_id;

  UPDATE public.cash_shift_pending_orders AS pending
  SET next_shift_id = v_shift_id
  WHERE pending.next_shift_id IS NULL
    AND pending.order_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.orders AS orders
      WHERE orders.id = pending.order_id
        AND orders.status <> 'cancelled'
        AND orders.payment_status <> 'paid'
        AND orders.total::numeric > orders.paid_amount
    );

  RETURN private.cash_shift_json(v_shift_id, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.open_cash_shift(
  p_opening_float numeric,
  p_opening_denominations jsonb DEFAULT '{}'::jsonb,
  p_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.open_cash_shift(p_opening_float, p_opening_denominations, p_note);
$$;

CREATE OR REPLACE FUNCTION private.set_staff_authorization_pin(
  p_user_id uuid,
  p_pin text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := (SELECT auth.uid());
  v_caller_role text := public.get_user_role();
  v_target_role text;
BEGIN
  IF v_caller_id IS NULL OR v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'No tienes permiso para configurar PIN de autorización';
  END IF;
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'El PIN debe tener exactamente 4 dígitos';
  END IF;

  SELECT role INTO v_target_role
  FROM public.profiles
  WHERE id = p_user_id AND is_active;

  IF v_target_role NOT IN ('owner', 'admin', 'supervisor') THEN
    RAISE EXCEPTION 'Solo dueño, administradores y supervisores pueden tener PIN';
  END IF;
  IF v_target_role = 'owner' AND v_caller_role <> 'owner' AND p_user_id <> v_caller_id THEN
    RAISE EXCEPTION 'Solo el dueño puede configurar el PIN de otro dueño';
  END IF;

  INSERT INTO private.staff_authorization_pins (
    user_id, pin_hash, failed_attempts, locked_until, updated_by, updated_at
  ) VALUES (
    p_user_id,
    extensions.crypt(p_pin, extensions.gen_salt('bf')),
    0,
    NULL,
    v_caller_id,
    now()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    pin_hash = EXCLUDED.pin_hash,
    failed_attempts = 0,
    locked_until = NULL,
    updated_by = v_caller_id,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION private.authorize_cash_action(
  p_authorizer_id uuid,
  p_pin text,
  p_shift_id uuid,
  p_action text,
  p_amount numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := (SELECT auth.uid());
  v_caller_role text := private.active_profile_role();
  v_authorizer_role text;
  v_pin private.staff_authorization_pins%ROWTYPE;
  v_token uuid;
BEGIN
  IF v_caller_id IS NULL OR v_caller_role NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para solicitar autorización de caja';
  END IF;
  IF p_action NOT IN ('cash_movement', 'close_difference', 'shift_adjustment')
     OR p_shift_id IS NULL OR p_amount IS NULL OR ROUND(p_amount, 2) < 0
     OR p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'La autorización de caja no es válida';
  END IF;

  SELECT role INTO v_authorizer_role
  FROM public.profiles
  WHERE id = p_authorizer_id AND is_active;

  IF v_authorizer_role NOT IN ('owner', 'admin', 'supervisor') THEN
    RAISE EXCEPTION 'El autorizador no tiene permisos de caja';
  END IF;

  SELECT * INTO v_pin
  FROM private.staff_authorization_pins
  WHERE user_id = p_authorizer_id
  FOR UPDATE;

  IF v_pin.user_id IS NULL THEN
    RAISE EXCEPTION 'El responsable aún no configura su PIN';
  END IF;
  IF v_pin.locked_until IS NOT NULL AND v_pin.locked_until > now() THEN
    RAISE EXCEPTION 'PIN bloqueado temporalmente por varios intentos';
  END IF;

  IF extensions.crypt(p_pin, v_pin.pin_hash) <> v_pin.pin_hash THEN
    UPDATE private.staff_authorization_pins
    SET failed_attempts = CASE WHEN failed_attempts >= 4 THEN 0 ELSE failed_attempts + 1 END,
        locked_until = CASE WHEN failed_attempts >= 4 THEN now() + interval '10 minutes' ELSE NULL END,
        updated_at = now()
    WHERE user_id = p_authorizer_id;
    RAISE EXCEPTION 'PIN incorrecto';
  END IF;

  UPDATE private.staff_authorization_pins
  SET failed_attempts = 0, locked_until = NULL, updated_at = now()
  WHERE user_id = p_authorizer_id;

  INSERT INTO private.cash_action_authorizations (
    shift_id, action, amount, requested_by, authorized_by
  ) VALUES (
    p_shift_id, p_action, ROUND(p_amount, 2), v_caller_id, p_authorizer_id
  )
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_cash_action(
  p_authorizer_id uuid,
  p_pin text,
  p_shift_id uuid,
  p_action text,
  p_amount numeric
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.authorize_cash_action(
    p_authorizer_id, p_pin, p_shift_id, p_action, p_amount
  );
$$;

CREATE OR REPLACE FUNCTION private.record_cash_movement(
  p_shift_id uuid,
  p_movement_type text,
  p_direction text,
  p_amount numeric,
  p_reason text,
  p_authorization uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := (SELECT auth.uid());
  v_role text := private.active_profile_role();
  v_shift public.cash_shifts%ROWTYPE;
  v_authorized_by uuid;
  v_movement_id uuid;
BEGIN
  IF v_caller_id IS NULL OR v_role NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar movimientos';
  END IF;
  IF p_movement_type NOT IN ('fund_addition', 'withdrawal', 'expense', 'correction')
     OR p_direction NOT IN ('in', 'out')
     OR (p_movement_type = 'fund_addition' AND p_direction <> 'in')
     OR (p_movement_type IN ('withdrawal', 'expense') AND p_direction <> 'out') THEN
    RAISE EXCEPTION 'El tipo de movimiento no es válido';
  END IF;
  IF p_amount IS NULL OR ROUND(p_amount, 2) <= 0 THEN
    RAISE EXCEPTION 'El importe debe ser mayor a cero';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Escribe el motivo del movimiento';
  END IF;

  SELECT * INTO v_shift
  FROM public.cash_shifts
  WHERE id = p_shift_id
  FOR UPDATE;

  IF v_shift.id IS NULL OR v_shift.status <> 'open' THEN
    RAISE EXCEPTION 'El turno de caja ya no está abierto';
  END IF;

  SELECT authz.authorized_by INTO v_authorized_by
  FROM private.cash_action_authorizations AS authz
  WHERE authz.token = p_authorization
    AND authz.shift_id = p_shift_id
    AND authz.action = 'cash_movement'
    AND authz.requested_by = v_caller_id
    AND authz.amount = ROUND(p_amount, 2)
    AND authz.used_at IS NULL
    AND authz.expires_at > now()
  FOR UPDATE;

  IF v_authorized_by IS NULL THEN
    RAISE EXCEPTION 'El movimiento necesita autorización vigente';
  END IF;

  INSERT INTO public.cash_movements (
    shift_id, movement_type, direction, amount, reason, created_by, authorized_by
  ) VALUES (
    p_shift_id, p_movement_type, p_direction, ROUND(p_amount, 2),
    btrim(p_reason), v_caller_id, v_authorized_by
  )
  RETURNING id INTO v_movement_id;

  UPDATE private.cash_action_authorizations
  SET used_at = now()
  WHERE token = p_authorization;

  UPDATE public.cash_shifts SET updated_at = now() WHERE id = p_shift_id;

  RETURN jsonb_build_object(
    'movement_id', v_movement_id,
    'shift', private.cash_shift_json(p_shift_id, false)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_cash_movement(
  p_shift_id uuid,
  p_movement_type text,
  p_direction text,
  p_amount numeric,
  p_reason text,
  p_authorization uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.record_cash_movement(
    p_shift_id, p_movement_type, p_direction, p_amount, p_reason, p_authorization
  );
$$;

CREATE OR REPLACE FUNCTION private.counted_cash_from_input(
  p_count_mode text,
  p_denominations jsonb,
  p_counted_cash numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_total numeric(12,2);
BEGIN
  IF p_count_mode = 'total' THEN
    IF p_counted_cash IS NULL OR ROUND(p_counted_cash, 2) < 0 THEN
      RAISE EXCEPTION 'El efectivo contado no es válido';
    END IF;
    RETURN ROUND(p_counted_cash, 2);
  END IF;

  IF p_count_mode <> 'denominations'
     OR jsonb_typeof(COALESCE(p_denominations, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'El conteo por denominaciones no es válido';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_each_text(COALESCE(p_denominations, '{}'::jsonb)) AS denomination(key, value)
    WHERE denomination.key NOT IN ('1000', '500', '200', '100', '50', '20', '10', '5', '2', '1', '0.5')
      OR denomination.value !~ '^[0-9]+$'
  ) THEN
    RAISE EXCEPTION 'El conteo contiene una denominación no válida';
  END IF;

  SELECT COALESCE(sum(denomination.key::numeric * denomination.value::numeric), 0)
  INTO v_total
  FROM jsonb_each_text(COALESCE(p_denominations, '{}'::jsonb)) AS denomination(key, value);

  RETURN ROUND(v_total, 2);
END;
$$;

CREATE OR REPLACE FUNCTION private.preview_cash_shift_close(
  p_shift_id uuid,
  p_count_mode text,
  p_denominations jsonb DEFAULT '{}'::jsonb,
  p_counted_cash numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := private.active_profile_role();
  v_shift public.cash_shifts%ROWTYPE;
  v_counted numeric(12,2);
  v_totals jsonb;
  v_expected numeric(12,2);
BEGIN
  IF v_role NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para preparar el cierre';
  END IF;

  SELECT * INTO v_shift FROM public.cash_shifts WHERE id = p_shift_id;
  IF v_shift.id IS NULL OR v_shift.status <> 'open' THEN
    RAISE EXCEPTION 'El turno de caja ya no está abierto';
  END IF;

  v_counted := private.counted_cash_from_input(p_count_mode, p_denominations, p_counted_cash);
  v_totals := private.cash_shift_totals(p_shift_id);
  v_expected := ROUND((v_totals->>'expected_cash')::numeric, 2);

  RETURN v_totals || jsonb_build_object(
    'counted_cash', v_counted,
    'difference', ROUND(v_counted - v_expected, 2),
    'requires_authorization', ABS(ROUND(v_counted - v_expected, 2)) > 20
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_cash_shift_close(
  p_shift_id uuid,
  p_count_mode text,
  p_denominations jsonb DEFAULT '{}'::jsonb,
  p_counted_cash numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.preview_cash_shift_close(
    p_shift_id, p_count_mode, p_denominations, p_counted_cash
  );
$$;

CREATE OR REPLACE FUNCTION private.close_cash_shift(
  p_shift_id uuid,
  p_count_mode text,
  p_denominations jsonb DEFAULT '{}'::jsonb,
  p_counted_cash numeric DEFAULT NULL,
  p_note text DEFAULT '',
  p_authorization uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := (SELECT auth.uid());
  v_role text := private.active_profile_role();
  v_shift public.cash_shifts%ROWTYPE;
  v_counted numeric(12,2);
  v_totals jsonb;
  v_expected numeric(12,2);
  v_difference numeric(12,2);
  v_authorized_by uuid;
BEGIN
  IF v_caller_id IS NULL OR v_role NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para cerrar caja';
  END IF;

  SELECT * INTO v_shift
  FROM public.cash_shifts
  WHERE id = p_shift_id
  FOR UPDATE;

  IF v_shift.id IS NULL THEN RAISE EXCEPTION 'Turno de caja no encontrado'; END IF;
  IF v_shift.status = 'closed' THEN RETURN private.cash_shift_json(v_shift.id, true); END IF;

  v_counted := private.counted_cash_from_input(p_count_mode, p_denominations, p_counted_cash);
  v_totals := private.cash_shift_totals(p_shift_id);
  v_expected := ROUND((v_totals->>'expected_cash')::numeric, 2);
  v_difference := ROUND(v_counted - v_expected, 2);

  IF ABS(v_difference) > 20 THEN
    SELECT authz.authorized_by INTO v_authorized_by
    FROM private.cash_action_authorizations AS authz
    WHERE authz.token = p_authorization
      AND authz.shift_id = p_shift_id
      AND authz.action = 'close_difference'
      AND authz.requested_by = v_caller_id
      AND authz.amount = ABS(v_difference)
      AND authz.used_at IS NULL
      AND authz.expires_at > now()
    FOR UPDATE;

    IF v_authorized_by IS NULL THEN
      RAISE EXCEPTION 'El cierre necesita autorización por una diferencia de $%', ABS(v_difference);
    END IF;
  END IF;

  INSERT INTO public.cash_shift_pending_orders (
    closing_shift_id,
    order_id,
    order_number,
    order_type,
    table_zone_name,
    table_number,
    customer_name,
    outstanding_amount,
    items_snapshot
  )
  SELECT
    p_shift_id,
    orders.id,
    orders.number,
    orders.type,
    orders.table_zone_name,
    orders.table_number,
    orders.customer_name,
    ROUND(orders.total::numeric - orders.paid_amount, 2),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'quantity', order_item.quantity,
        'name', COALESCE(menu_item.name, 'Producto eliminado'),
        'notes', order_item.notes,
        'selected_modifiers', order_item.selected_modifiers
      ) ORDER BY order_item.created_at, order_item.id)
      FROM public.order_items AS order_item
      LEFT JOIN public.menu_items AS menu_item ON menu_item.id = order_item.menu_item_id
      WHERE order_item.order_id = orders.id
    ), '[]'::jsonb)
  FROM public.orders AS orders
  WHERE orders.status <> 'cancelled'
    AND orders.payment_status <> 'paid'
    AND orders.total::numeric > orders.paid_amount
  ON CONFLICT (closing_shift_id, order_id) DO NOTHING;

  UPDATE public.cash_shifts
  SET status = 'closed',
      count_mode = p_count_mode,
      count_denominations = CASE
        WHEN p_count_mode = 'denominations' THEN COALESCE(p_denominations, '{}'::jsonb)
        ELSE '{}'::jsonb
      END,
      counted_cash = v_counted,
      expected_cash = v_expected,
      difference = v_difference,
      gross_sales = (v_totals->>'gross_sales')::numeric,
      net_sales = (v_totals->>'net_sales')::numeric,
      discount_total = (v_totals->>'discount_total')::numeric,
      tip_total = (v_totals->>'tip_total')::numeric,
      collected_total = (v_totals->>'collected_total')::numeric,
      cash_total = (v_totals->>'cash_total')::numeric,
      card_total = (v_totals->>'card_total')::numeric,
      transfer_total = (v_totals->>'transfer_total')::numeric,
      voided_total = (v_totals->>'voided_total')::numeric,
      fund_in_total = (v_totals->>'fund_in_total')::numeric,
      withdrawal_total = (v_totals->>'withdrawal_total')::numeric,
      expense_total = (v_totals->>'expense_total')::numeric,
      correction_total = (v_totals->>'correction_total')::numeric,
      payment_count = (v_totals->>'payment_count')::integer,
      pending_order_count = (v_totals->>'pending_order_count')::integer,
      pending_balance = (v_totals->>'pending_balance')::numeric,
      close_note = COALESCE(btrim(p_note), ''),
      closed_by = v_caller_id,
      difference_authorized_by = v_authorized_by,
      closed_at = now(),
      updated_at = now()
  WHERE id = p_shift_id;

  IF p_authorization IS NOT NULL AND v_authorized_by IS NOT NULL THEN
    UPDATE private.cash_action_authorizations SET used_at = now() WHERE token = p_authorization;
  END IF;

  RETURN private.cash_shift_json(p_shift_id, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cash_shift(
  p_shift_id uuid,
  p_count_mode text,
  p_denominations jsonb DEFAULT '{}'::jsonb,
  p_counted_cash numeric DEFAULT NULL,
  p_note text DEFAULT '',
  p_authorization uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.close_cash_shift(
    p_shift_id, p_count_mode, p_denominations, p_counted_cash, p_note, p_authorization
  );
$$;

CREATE OR REPLACE FUNCTION private.list_cash_shifts(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := private.active_profile_role();
  v_result jsonb;
BEGIN
  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'No tienes permiso para consultar el historial de caja';
  END IF;

  SELECT COALESCE(jsonb_agg(private.cash_shift_json(source.id, true) ORDER BY source.opened_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT id, opened_at
    FROM public.cash_shifts
    ORDER BY opened_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  ) AS source;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_cash_shifts(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.list_cash_shifts(p_limit, p_offset);
$$;

CREATE OR REPLACE FUNCTION private.get_cash_shift_detail(p_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT private.can_view_cash_shift(p_shift_id) THEN
    RAISE EXCEPTION 'No tienes permiso para consultar este turno';
  END IF;

  v_result := private.cash_shift_json(
    p_shift_id,
    (SELECT status = 'closed' FROM public.cash_shifts WHERE id = p_shift_id)
  );

  RETURN v_result || jsonb_build_object(
    'movements', COALESCE((
      SELECT jsonb_agg(to_jsonb(movement) || jsonb_build_object(
        'created_by_name', creator.full_name,
        'authorized_by_name', authorizer.full_name
      ) ORDER BY movement.created_at DESC)
      FROM public.cash_movements AS movement
      JOIN public.profiles AS creator ON creator.id = movement.created_by
      JOIN public.profiles AS authorizer ON authorizer.id = movement.authorized_by
      WHERE movement.shift_id = p_shift_id
    ), '[]'::jsonb),
    'pending_orders', COALESCE((
      SELECT jsonb_agg(to_jsonb(pending) ORDER BY pending.order_number)
      FROM public.cash_shift_pending_orders AS pending
      WHERE pending.closing_shift_id = p_shift_id
    ), '[]'::jsonb),
    'adjustments', COALESCE((
      SELECT jsonb_agg(to_jsonb(adjustment) || jsonb_build_object(
        'created_by_name', creator.full_name,
        'authorized_by_name', authorizer.full_name
      ) ORDER BY adjustment.created_at DESC)
      FROM public.cash_shift_adjustments AS adjustment
      JOIN public.profiles AS creator ON creator.id = adjustment.created_by
      JOIN public.profiles AS authorizer ON authorizer.id = adjustment.authorized_by
      WHERE adjustment.shift_id = p_shift_id
    ), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', transaction.id,
        'folio', transaction.folio,
        'status', transaction.status,
        'total_amount', transaction.total_amount,
        'table_zone_name', transaction.table_zone_name,
        'table_number', transaction.table_number,
        'customer_name', transaction.customer_name,
        'charged_by', transaction.charged_by,
        'charged_by_name', profile.full_name,
        'created_at', transaction.created_at
      ) ORDER BY transaction.created_at DESC)
      FROM public.payment_transactions AS transaction
      JOIN public.profiles AS profile ON profile.id = transaction.charged_by
      WHERE transaction.cash_shift_id = p_shift_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cash_shift_detail(p_shift_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.get_cash_shift_detail(p_shift_id);
$$;

CREATE OR REPLACE FUNCTION private.record_cash_shift_adjustment(
  p_shift_id uuid,
  p_payment_method text,
  p_direction text,
  p_amount numeric,
  p_reason text,
  p_authorization uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := (SELECT auth.uid());
  v_role text := private.active_profile_role();
  v_shift public.cash_shifts%ROWTYPE;
  v_authorized_by uuid;
BEGIN
  IF v_caller_id IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'No tienes permiso para corregir cortes';
  END IF;
  IF p_payment_method NOT IN ('efectivo', 'tarjeta', 'transferencia', 'otro')
     OR p_direction NOT IN ('increase', 'decrease')
     OR p_amount IS NULL OR ROUND(p_amount, 2) <= 0
     OR length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Completa correctamente la corrección';
  END IF;

  SELECT * INTO v_shift FROM public.cash_shifts WHERE id = p_shift_id FOR UPDATE;
  IF v_shift.id IS NULL OR v_shift.status <> 'closed' THEN
    RAISE EXCEPTION 'Solo se pueden corregir turnos cerrados';
  END IF;

  SELECT authz.authorized_by INTO v_authorized_by
  FROM private.cash_action_authorizations AS authz
  WHERE authz.token = p_authorization
    AND authz.shift_id = p_shift_id
    AND authz.action = 'shift_adjustment'
    AND authz.requested_by = v_caller_id
    AND authz.amount = ROUND(p_amount, 2)
    AND authz.used_at IS NULL
    AND authz.expires_at > now()
  FOR UPDATE;

  IF v_authorized_by IS NULL THEN
    RAISE EXCEPTION 'La corrección necesita autorización vigente';
  END IF;

  INSERT INTO public.cash_shift_adjustments (
    shift_id, payment_method, direction, amount, reason, created_by, authorized_by
  ) VALUES (
    p_shift_id, p_payment_method, p_direction, ROUND(p_amount, 2),
    btrim(p_reason), v_caller_id, v_authorized_by
  );

  UPDATE private.cash_action_authorizations SET used_at = now() WHERE token = p_authorization;
  RETURN private.get_cash_shift_detail(p_shift_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_cash_shift_adjustment(
  p_shift_id uuid,
  p_payment_method text,
  p_direction text,
  p_amount numeric,
  p_reason text,
  p_authorization uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.record_cash_shift_adjustment(
    p_shift_id, p_payment_method, p_direction, p_amount, p_reason, p_authorization
  );
$$;

ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_shift_pending_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_shift_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.cash_action_authorizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cash shifts visible to authorized staff"
  ON public.cash_shifts FOR SELECT TO authenticated
  USING ((SELECT private.can_view_cash_shift(id)));

CREATE POLICY "Cash movements visible with shift"
  ON public.cash_movements FOR SELECT TO authenticated
  USING ((SELECT private.can_view_cash_shift(shift_id)));

CREATE POLICY "Transferred orders visible with shift"
  ON public.cash_shift_pending_orders FOR SELECT TO authenticated
  USING ((SELECT private.can_view_cash_shift(closing_shift_id)));

CREATE POLICY "Cash adjustments visible with shift"
  ON public.cash_shift_adjustments FOR SELECT TO authenticated
  USING ((SELECT private.can_view_cash_shift(shift_id)));

REVOKE ALL ON public.cash_shifts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.cash_movements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.cash_shift_pending_orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.cash_shift_adjustments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cash_shifts TO authenticated;
GRANT SELECT ON public.cash_movements TO authenticated;
GRANT SELECT ON public.cash_shift_pending_orders TO authenticated;
GRANT SELECT ON public.cash_shift_adjustments TO authenticated;

REVOKE ALL ON private.cash_action_authorizations FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.active_profile_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.can_view_cash_shift(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cash_shift_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cash_shift_json(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.assign_order_cash_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.assign_payment_cash_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_financial_cash_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.get_current_cash_shift() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.open_cash_shift(numeric, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.authorize_cash_action(uuid, text, uuid, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.record_cash_movement(uuid, text, text, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.counted_cash_from_input(text, jsonb, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.preview_cash_shift_close(uuid, text, jsonb, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.close_cash_shift(uuid, text, jsonb, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.list_cash_shifts(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.get_cash_shift_detail(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.record_cash_shift_adjustment(uuid, text, text, numeric, text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.active_profile_role() TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_view_cash_shift(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.cash_shift_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.cash_shift_json(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_current_cash_shift() TO authenticated;
GRANT EXECUTE ON FUNCTION private.open_cash_shift(numeric, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.authorize_cash_action(uuid, text, uuid, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION private.record_cash_movement(uuid, text, text, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.counted_cash_from_input(text, jsonb, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION private.preview_cash_shift_close(uuid, text, jsonb, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION private.close_cash_shift(uuid, text, jsonb, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.list_cash_shifts(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_cash_shift_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.record_cash_shift_adjustment(uuid, text, text, numeric, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_current_cash_shift() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.open_cash_shift(numeric, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.authorize_cash_action(uuid, text, uuid, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_cash_movement(uuid, text, text, numeric, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.preview_cash_shift_close(uuid, text, jsonb, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_cash_shift(uuid, text, jsonb, numeric, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_cash_shifts(integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_cash_shift_detail(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_cash_shift_adjustment(uuid, text, text, numeric, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_current_cash_shift() TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_cash_shift(numeric, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_cash_action(uuid, text, uuid, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_cash_movement(uuid, text, text, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_cash_shift_close(uuid, text, jsonb, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_shift(uuid, text, jsonb, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_cash_shifts(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_shift_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_cash_shift_adjustment(uuid, text, text, numeric, text, uuid) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'cash_shifts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_shifts;
  END IF;
END;
$$;

INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) VALUES (
  'menu-product-images',
  'menu-product-images',
  true,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Menu product images are publicly readable" ON storage.objects;
CREATE POLICY "Menu product images are publicly readable"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'menu-product-images');

DROP POLICY IF EXISTS "Admins upload menu product images" ON storage.objects;
CREATE POLICY "Admins upload menu product images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'menu-product-images'
    AND EXISTS (
      SELECT 1 FROM public.profiles AS profile
      WHERE profile.id = (SELECT auth.uid())
        AND profile.is_active
        AND profile.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins update menu product images" ON storage.objects;
CREATE POLICY "Admins update menu product images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'menu-product-images'
    AND EXISTS (
      SELECT 1 FROM public.profiles AS profile
      WHERE profile.id = (SELECT auth.uid())
        AND profile.is_active
        AND profile.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    bucket_id = 'menu-product-images'
    AND EXISTS (
      SELECT 1 FROM public.profiles AS profile
      WHERE profile.id = (SELECT auth.uid())
        AND profile.is_active
        AND profile.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins delete menu product images" ON storage.objects;
CREATE POLICY "Admins delete menu product images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'menu-product-images'
    AND EXISTS (
      SELECT 1 FROM public.profiles AS profile
      WHERE profile.id = (SELECT auth.uid())
        AND profile.is_active
        AND profile.role IN ('owner', 'admin')
    )
  );
