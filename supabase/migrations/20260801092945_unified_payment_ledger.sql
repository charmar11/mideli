CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_status_check,
  DROP CONSTRAINT IF EXISTS orders_paid_amount_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  ADD CONSTRAINT orders_paid_amount_check
    CHECK (paid_amount >= 0 AND paid_amount <= total::numeric);

UPDATE public.orders
SET payment_status = CASE WHEN status = 'paid' THEN 'paid' ELSE 'unpaid' END,
    paid_amount = CASE WHEN status = 'paid' THEN total::numeric ELSE 0 END
WHERE payment_status = 'unpaid'
  AND paid_amount = 0;

CREATE INDEX IF NOT EXISTS orders_payment_status_created_at_idx
  ON public.orders (payment_status, created_at DESC);

CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'voided')),
  idempotency_key uuid NOT NULL UNIQUE,
  subtotal_amount numeric(12,2) NOT NULL CHECK (subtotal_amount > 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tip_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (tip_amount >= 0),
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  cash_received numeric(12,2) NOT NULL DEFAULT 0 CHECK (cash_received >= 0),
  change_given numeric(12,2) NOT NULL DEFAULT 0 CHECK (change_given >= 0),
  table_id uuid,
  table_number text,
  customer_name text,
  order_type public.order_type,
  charged_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  discount_authorized_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  receipt_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(receipt_snapshot) = 'object'),
  voided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_transaction_total_check
    CHECK (total_amount = subtotal_amount - discount_amount + tip_amount),
  CONSTRAINT payment_transaction_discount_check
    CHECK (discount_amount <= subtotal_amount),
  CONSTRAINT payment_transaction_void_check
    CHECK (
      (status = 'completed' AND voided_at IS NULL AND voided_by IS NULL)
      OR (status = 'voided' AND voided_at IS NOT NULL AND voided_by IS NOT NULL)
    )
);

CREATE TABLE public.payment_tenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  method public.payment_method NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  cash_received numeric(12,2) CHECK (cash_received IS NULL OR cash_received >= 0),
  change_given numeric(12,2) CHECK (change_given IS NULL OR change_given >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_tender_cash_check CHECK (
    (method = 'efectivo' AND cash_received IS NOT NULL AND change_given IS NOT NULL
      AND cash_received >= amount AND change_given = cash_received - amount)
    OR (method <> 'efectivo' AND cash_received IS NULL AND change_given IS NULL)
  )
);

CREATE TABLE public.payment_order_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  gross_amount numeric(12,2) NOT NULL CHECK (gross_amount > 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  net_amount numeric(12,2) NOT NULL CHECK (net_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_id, order_id),
  CONSTRAINT payment_order_allocation_total_check
    CHECK (net_amount = gross_amount - discount_amount),
  CONSTRAINT payment_order_allocation_discount_check
    CHECK (discount_amount <= gross_amount)
);

CREATE TABLE public.payment_item_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  order_item_id uuid,
  menu_item_id uuid,
  item_name text NOT NULL,
  quantity numeric(12,4) NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  selected_modifiers jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(selected_modifiers) = 'array'),
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_transactions_created_at_idx
  ON public.payment_transactions (created_at DESC);
CREATE INDEX payment_transactions_charged_by_created_at_idx
  ON public.payment_transactions (charged_by, created_at DESC);
CREATE INDEX payment_transactions_completed_created_at_idx
  ON public.payment_transactions (created_at DESC)
  WHERE status = 'completed';
CREATE INDEX payment_tenders_transaction_id_idx
  ON public.payment_tenders (transaction_id);
CREATE INDEX payment_order_allocations_order_id_idx
  ON public.payment_order_allocations (order_id);
CREATE INDEX payment_order_allocations_transaction_id_idx
  ON public.payment_order_allocations (transaction_id);
CREATE INDEX payment_item_allocations_transaction_id_idx
  ON public.payment_item_allocations (transaction_id);
CREATE INDEX payment_item_allocations_order_item_id_idx
  ON public.payment_item_allocations (order_item_id);

CREATE TABLE private.staff_authorization_pins (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  updated_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE private.payment_discount_authorizations (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  authorized_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requested_by, idempotency_key)
);

CREATE INDEX payment_discount_authorizations_lookup_idx
  ON private.payment_discount_authorizations (requested_by, idempotency_key, expires_at);

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_order_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_item_allocations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.can_view_payment(p_transaction_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.payment_transactions AS transaction
    JOIN public.profiles AS profile
      ON profile.id = (SELECT auth.uid())
    WHERE transaction.id = p_transaction_id
      AND profile.is_active
      AND (
        profile.role IN ('owner', 'admin')
        OR (
          profile.role IN ('waiter', 'supervisor')
          AND transaction.created_at >= (
            date_trunc('day', now() AT TIME ZONE 'America/Hermosillo')
            AT TIME ZONE 'America/Hermosillo'
          )
        )
      )
  );
$$;

CREATE POLICY "Payments visible by authorized staff"
  ON public.payment_transactions
  FOR SELECT TO authenticated
  USING ((SELECT private.can_view_payment(id)));

CREATE POLICY "Payment tenders visible with transaction"
  ON public.payment_tenders
  FOR SELECT TO authenticated
  USING ((SELECT private.can_view_payment(transaction_id)));

CREATE POLICY "Payment order allocations visible with transaction"
  ON public.payment_order_allocations
  FOR SELECT TO authenticated
  USING ((SELECT private.can_view_payment(transaction_id)));

CREATE POLICY "Payment item allocations visible with transaction"
  ON public.payment_item_allocations
  FOR SELECT TO authenticated
  USING ((SELECT private.can_view_payment(transaction_id)));

REVOKE ALL ON public.payment_transactions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.payment_tenders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.payment_order_allocations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.payment_item_allocations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_transactions TO authenticated;
GRANT SELECT ON public.payment_tenders TO authenticated;
GRANT SELECT ON public.payment_order_allocations TO authenticated;
GRANT SELECT ON public.payment_item_allocations TO authenticated;

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

  IF v_target_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Solo dueño y administradores pueden tener PIN de autorización';
  END IF;

  IF v_target_role = 'owner' AND v_caller_role <> 'owner' AND p_user_id <> v_caller_id THEN
    RAISE EXCEPTION 'Solo el dueño puede configurar el PIN de otro dueño';
  END IF;

  INSERT INTO private.staff_authorization_pins (
    user_id,
    pin_hash,
    failed_attempts,
    locked_until,
    updated_by,
    updated_at
  )
  VALUES (
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

CREATE OR REPLACE FUNCTION public.set_staff_authorization_pin(
  p_user_id uuid,
  p_pin text
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.set_staff_authorization_pin(p_user_id, p_pin);
$$;

CREATE OR REPLACE FUNCTION private.authorize_payment_discount(
  p_authorizer_id uuid,
  p_pin text,
  p_idempotency_key uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := (SELECT auth.uid());
  v_caller_role text := public.get_user_role();
  v_authorizer_role text;
  v_pin private.staff_authorization_pins%ROWTYPE;
  v_token uuid;
BEGIN
  IF v_caller_id IS NULL OR v_caller_role NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para solicitar descuentos';
  END IF;

  IF p_idempotency_key IS NULL OR p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'La autorización no es válida';
  END IF;

  SELECT role INTO v_authorizer_role
  FROM public.profiles
  WHERE id = p_authorizer_id AND is_active;

  IF v_authorizer_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'El autorizador no tiene permisos administrativos';
  END IF;

  SELECT * INTO v_pin
  FROM private.staff_authorization_pins
  WHERE user_id = p_authorizer_id
  FOR UPDATE;

  IF v_pin.user_id IS NULL THEN
    RAISE EXCEPTION 'El administrador aún no configura su PIN';
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
  SET failed_attempts = 0,
      locked_until = NULL,
      updated_at = now()
  WHERE user_id = p_authorizer_id;

  INSERT INTO private.payment_discount_authorizations (
    requested_by,
    authorized_by,
    idempotency_key
  )
  VALUES (v_caller_id, p_authorizer_id, p_idempotency_key)
  ON CONFLICT (requested_by, idempotency_key)
  DO UPDATE SET
    authorized_by = EXCLUDED.authorized_by,
    expires_at = now() + interval '10 minutes',
    used_at = NULL
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_payment_discount(
  p_authorizer_id uuid,
  p_pin text,
  p_idempotency_key uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.authorize_payment_discount(
    p_authorizer_id,
    p_pin,
    p_idempotency_key
  );
$$;

CREATE OR REPLACE FUNCTION private.payment_receipt_json(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'transaction', jsonb_build_object(
      'id', transaction.id,
      'folio', transaction.folio,
      'status', transaction.status,
      'subtotal_amount', transaction.subtotal_amount,
      'discount_amount', transaction.discount_amount,
      'tip_amount', transaction.tip_amount,
      'total_amount', transaction.total_amount,
      'cash_received', transaction.cash_received,
      'change_given', transaction.change_given,
      'table_id', transaction.table_id,
      'table_number', transaction.table_number,
      'customer_name', transaction.customer_name,
      'order_type', transaction.order_type,
      'charged_by', transaction.charged_by,
      'charged_by_name', profile.full_name,
      'discount_authorized_by', transaction.discount_authorized_by,
      'voided_by', transaction.voided_by,
      'voided_at', transaction.voided_at,
      'created_at', transaction.created_at
    ),
    'orders', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'order_id', allocation.order_id,
          'number', orders.number,
          'gross_amount', allocation.gross_amount,
          'discount_amount', allocation.discount_amount,
          'net_amount', allocation.net_amount
        ) ORDER BY orders.number
      )
      FROM public.payment_order_allocations AS allocation
      JOIN public.orders AS orders ON orders.id = allocation.order_id
      WHERE allocation.transaction_id = transaction.id
    ), '[]'::jsonb),
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'order_id', item.order_id,
          'order_item_id', item.order_item_id,
          'menu_item_id', item.menu_item_id,
          'item_name', item.item_name,
          'quantity', item.quantity,
          'unit_price', item.unit_price,
          'selected_modifiers', item.selected_modifiers,
          'line_total', item.line_total
        ) ORDER BY item.created_at, item.id
      )
      FROM public.payment_item_allocations AS item
      WHERE item.transaction_id = transaction.id
    ), '[]'::jsonb),
    'tenders', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'method', tender.method,
          'amount', tender.amount,
          'cash_received', tender.cash_received,
          'change_given', tender.change_given
        ) ORDER BY tender.created_at, tender.id
      )
      FROM public.payment_tenders AS tender
      WHERE tender.transaction_id = transaction.id
    ), '[]'::jsonb)
  )
  FROM public.payment_transactions AS transaction
  LEFT JOIN public.profiles AS profile ON profile.id = transaction.charged_by
  WHERE transaction.id = p_transaction_id;
$$;

CREATE OR REPLACE FUNCTION private.finalize_payment(
  p_idempotency_key uuid,
  p_order_allocations jsonb,
  p_item_allocations jsonb,
  p_tenders jsonb,
  p_tip_amount numeric DEFAULT 0,
  p_discount_authorization uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := (SELECT auth.uid());
  v_caller_role text := public.get_user_role();
  v_existing_id uuid;
  v_transaction public.payment_transactions%ROWTYPE;
  v_allocation jsonb;
  v_item jsonb;
  v_tender jsonb;
  v_order public.orders%ROWTYPE;
  v_order_item public.order_items%ROWTYPE;
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
  v_tip numeric(12,2) := ROUND(COALESCE(p_tip_amount, 0), 2);
  v_total numeric(12,2);
  v_tender_total numeric(12,2);
  v_item_total numeric(12,2);
  v_gross numeric(12,2);
  v_order_discount numeric(12,2);
  v_net numeric(12,2);
  v_outstanding numeric(12,2);
  v_method public.payment_method;
  v_amount numeric(12,2);
  v_received numeric(12,2);
  v_change numeric(12,2);
  v_cash_received numeric(12,2) := 0;
  v_change_total numeric(12,2) := 0;
  v_quantity numeric(12,4);
  v_line_total numeric(12,2);
  v_used_quantity numeric(12,4);
  v_item_name text;
  v_snapshot jsonb;
  v_authorized_by uuid;
  v_first_order public.orders%ROWTYPE;
  v_single_method public.payment_method;
BEGIN
  IF v_caller_id IS NULL OR v_caller_role NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar pagos';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Falta la clave segura del cobro';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.payment_transactions
  WHERE idempotency_key = p_idempotency_key;

  IF v_existing_id IS NOT NULL THEN
    RETURN private.payment_receipt_json(v_existing_id);
  END IF;

  IF jsonb_typeof(COALESCE(p_order_allocations, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_order_allocations, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'No hay pedidos para cobrar';
  END IF;

  IF jsonb_typeof(COALESCE(p_item_allocations, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_item_allocations, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'No hay productos para el ticket';
  END IF;

  IF jsonb_typeof(COALESCE(p_tenders, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_tenders, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Selecciona un método de pago';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT value->>'order_id' AS order_id, count(*) AS occurrences
      FROM jsonb_array_elements(p_order_allocations)
      GROUP BY value->>'order_id'
    ) AS duplicates
    WHERE duplicates.order_id IS NULL OR duplicates.occurrences > 1
  ) THEN
    RAISE EXCEPTION 'La distribución de pedidos está duplicada';
  END IF;

  PERFORM 1
  FROM public.orders
  WHERE id IN (
    SELECT (value->>'order_id')::uuid
    FROM jsonb_array_elements(p_order_allocations)
  )
  ORDER BY id
  FOR UPDATE;

  IF (SELECT count(*) FROM public.orders WHERE id IN (
        SELECT (value->>'order_id')::uuid FROM jsonb_array_elements(p_order_allocations)
      )) <> jsonb_array_length(p_order_allocations) THEN
    RAISE EXCEPTION 'Uno de los pedidos ya no existe';
  END IF;

  v_subtotal := 0;
  v_discount := 0;
  FOR v_allocation IN SELECT value FROM jsonb_array_elements(p_order_allocations)
  LOOP
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = (v_allocation->>'order_id')::uuid;

    IF v_order.status = 'cancelled' THEN
      RAISE EXCEPTION 'La cuenta contiene un pedido cancelado';
    END IF;

    v_gross := ROUND(COALESCE((v_allocation->>'gross_amount')::numeric, 0), 2);
    v_order_discount := ROUND(COALESCE((v_allocation->>'discount_amount')::numeric, 0), 2);
    IF v_gross <= 0 OR v_order_discount < 0 OR v_order_discount > v_gross THEN
      RAISE EXCEPTION 'La distribución del cobro no es válida';
    END IF;

    SELECT ROUND(v_order.total::numeric - COALESCE(SUM(allocation.gross_amount), 0), 2)
    INTO v_outstanding
    FROM public.payment_order_allocations AS allocation
    JOIN public.payment_transactions AS transaction
      ON transaction.id = allocation.transaction_id
     AND transaction.status = 'completed'
    WHERE allocation.order_id = v_order.id;

    IF v_gross > v_outstanding + 0.001 THEN
      RAISE EXCEPTION 'El saldo del pedido #% cambió. Actualiza la cuenta', v_order.number;
    END IF;

    v_subtotal := v_subtotal + v_gross;
    v_discount := v_discount + v_order_discount;
    IF v_first_order.id IS NULL THEN v_first_order := v_order; END IF;
  END LOOP;

  v_subtotal := ROUND(v_subtotal, 2);
  v_discount := ROUND(v_discount, 2);
  IF v_tip < 0 OR v_discount > v_subtotal THEN
    RAISE EXCEPTION 'Los importes de propina o descuento no son válidos';
  END IF;
  v_total := ROUND(v_subtotal - v_discount + v_tip, 2);

  IF v_discount > 0 THEN
    SELECT authz.authorized_by
    INTO v_authorized_by
    FROM private.payment_discount_authorizations AS authz
    WHERE authz.token = p_discount_authorization
      AND authz.requested_by = v_caller_id
      AND authz.idempotency_key = p_idempotency_key
      AND authz.used_at IS NULL
      AND authz.expires_at > now()
    FOR UPDATE;

    IF v_authorized_by IS NULL THEN
      RAISE EXCEPTION 'El descuento necesita autorización vigente';
    END IF;
  END IF;

  v_tender_total := 0;
  FOR v_tender IN SELECT value FROM jsonb_array_elements(p_tenders)
  LOOP
    BEGIN
      v_method := (v_tender->>'method')::public.payment_method;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Método de pago no válido';
    END;
    v_amount := ROUND(COALESCE((v_tender->>'amount')::numeric, 0), 2);
    IF v_amount <= 0 THEN RAISE EXCEPTION 'El importe de pago no es válido'; END IF;
    v_tender_total := v_tender_total + v_amount;
    IF v_method = 'efectivo' THEN
      v_received := ROUND(COALESCE((v_tender->>'cash_received')::numeric, 0), 2);
      IF v_received < v_amount THEN RAISE EXCEPTION 'El efectivo recibido no cubre su parte'; END IF;
      v_cash_received := v_cash_received + v_received;
      v_change_total := v_change_total + (v_received - v_amount);
    END IF;
  END LOOP;

  IF ROUND(v_tender_total, 2) <> v_total THEN
    RAISE EXCEPTION 'Los métodos de pago deben sumar exactamente $%', v_total;
  END IF;

  v_item_total := 0;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_item_allocations)
  LOOP
    v_quantity := ROUND(COALESCE((v_item->>'quantity')::numeric, 0), 4);
    v_line_total := ROUND(COALESCE((v_item->>'line_total')::numeric, 0), 2);
    IF v_quantity <= 0 OR v_line_total < 0 THEN
      RAISE EXCEPTION 'La distribución de productos no es válida';
    END IF;

    SELECT * INTO v_order_item
    FROM public.order_items
    WHERE id = (v_item->>'order_item_id')::uuid;

    IF v_order_item.id IS NULL OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_order_allocations) AS allocation
      WHERE (allocation.value->>'order_id')::uuid = v_order_item.order_id
    ) THEN
      RAISE EXCEPTION 'Uno de los productos no pertenece a la cuenta';
    END IF;

    SELECT COALESCE(SUM(item.quantity), 0)
    INTO v_used_quantity
    FROM public.payment_item_allocations AS item
    JOIN public.payment_transactions AS transaction
      ON transaction.id = item.transaction_id
     AND transaction.status = 'completed'
    WHERE item.order_item_id = v_order_item.id;

    IF v_quantity > v_order_item.quantity::numeric - v_used_quantity + 0.0001 THEN
      RAISE EXCEPTION 'Una cantidad del producto ya fue pagada';
    END IF;

    v_item_total := v_item_total + v_line_total;
  END LOOP;

  IF ROUND(v_item_total, 2) <> v_subtotal THEN
    RAISE EXCEPTION 'Los productos deben sumar exactamente el consumo seleccionado';
  END IF;

  INSERT INTO public.payment_transactions (
    idempotency_key,
    subtotal_amount,
    discount_amount,
    tip_amount,
    total_amount,
    cash_received,
    change_given,
    table_id,
    table_number,
    customer_name,
    order_type,
    charged_by,
    discount_authorized_by
  ) VALUES (
    p_idempotency_key,
    v_subtotal,
    v_discount,
    v_tip,
    v_total,
    v_cash_received,
    v_change_total,
    v_first_order.table_id,
    v_first_order.table_number,
    v_first_order.customer_name,
    v_first_order.type,
    v_caller_id,
    v_authorized_by
  )
  RETURNING * INTO v_transaction;

  FOR v_allocation IN SELECT value FROM jsonb_array_elements(p_order_allocations)
  LOOP
    v_gross := ROUND((v_allocation->>'gross_amount')::numeric, 2);
    v_order_discount := ROUND(COALESCE((v_allocation->>'discount_amount')::numeric, 0), 2);
    v_net := v_gross - v_order_discount;
    INSERT INTO public.payment_order_allocations (
      transaction_id, order_id, gross_amount, discount_amount, net_amount
    ) VALUES (
      v_transaction.id,
      (v_allocation->>'order_id')::uuid,
      v_gross,
      v_order_discount,
      v_net
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_item_allocations)
  LOOP
    SELECT order_item.*
    INTO v_order_item
    FROM public.order_items AS order_item
    WHERE order_item.id = (v_item->>'order_item_id')::uuid;

    SELECT COALESCE(menu_item.name, 'Producto eliminado')
    INTO v_item_name
    FROM public.menu_items AS menu_item
    WHERE menu_item.id = v_order_item.menu_item_id;

    v_item_name := COALESCE(v_item_name, 'Producto eliminado');

    INSERT INTO public.payment_item_allocations (
      transaction_id,
      order_id,
      order_item_id,
      menu_item_id,
      item_name,
      quantity,
      unit_price,
      selected_modifiers,
      line_total
    ) VALUES (
      v_transaction.id,
      v_order_item.order_id,
      v_order_item.id,
      v_order_item.menu_item_id,
      v_item_name,
      ROUND((v_item->>'quantity')::numeric, 4),
      v_order_item.unit_price::numeric,
      COALESCE(v_order_item.selected_modifiers, '[]'::jsonb),
      ROUND((v_item->>'line_total')::numeric, 2)
    );
  END LOOP;

  FOR v_tender IN SELECT value FROM jsonb_array_elements(p_tenders)
  LOOP
    v_method := (v_tender->>'method')::public.payment_method;
    v_amount := ROUND((v_tender->>'amount')::numeric, 2);
    IF v_method = 'efectivo' THEN
      v_received := ROUND((v_tender->>'cash_received')::numeric, 2);
      v_change := v_received - v_amount;
    ELSE
      v_received := NULL;
      v_change := NULL;
    END IF;
    INSERT INTO public.payment_tenders (
      transaction_id, method, amount, cash_received, change_given
    ) VALUES (
      v_transaction.id, v_method, v_amount, v_received, v_change
    );
  END LOOP;

  IF v_discount > 0 THEN
    UPDATE private.payment_discount_authorizations
    SET used_at = now()
    WHERE token = p_discount_authorization;
  END IF;

  FOR v_allocation IN SELECT value FROM jsonb_array_elements(p_order_allocations)
  LOOP
    SELECT COALESCE(SUM(allocation.gross_amount), 0)
    INTO v_gross
    FROM public.payment_order_allocations AS allocation
    JOIN public.payment_transactions AS transaction
      ON transaction.id = allocation.transaction_id
     AND transaction.status = 'completed'
    WHERE allocation.order_id = (v_allocation->>'order_id')::uuid;

    SELECT CASE
      WHEN count(DISTINCT tender.method) = 1
        THEN min(tender.method::text)::public.payment_method
      ELSE NULL
    END
    INTO v_single_method
    FROM public.payment_tenders AS tender
    JOIN public.payment_transactions AS transaction ON transaction.id = tender.transaction_id
    JOIN public.payment_order_allocations AS allocation ON allocation.transaction_id = transaction.id
    WHERE allocation.order_id = (v_allocation->>'order_id')::uuid
      AND transaction.status = 'completed';

    UPDATE public.orders
    SET paid_amount = LEAST(total::numeric, ROUND(v_gross, 2)),
        payment_status = CASE
          WHEN ROUND(v_gross, 2) >= total::numeric THEN 'paid'
          WHEN ROUND(v_gross, 2) > 0 THEN 'partial'
          ELSE 'unpaid'
        END,
        status = CASE
          WHEN ROUND(v_gross, 2) >= total::numeric AND status = 'served'
            THEN 'paid'::public.order_status
          ELSE status
        END,
        payment_method = CASE WHEN ROUND(v_gross, 2) >= total::numeric THEN v_single_method ELSE NULL END,
        paid_at = CASE WHEN ROUND(v_gross, 2) >= total::numeric THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = (v_allocation->>'order_id')::uuid;
  END LOOP;

  v_snapshot := private.payment_receipt_json(v_transaction.id);
  UPDATE public.payment_transactions
  SET receipt_snapshot = v_snapshot
  WHERE id = v_transaction.id;

  RETURN v_snapshot;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_payment(
  p_idempotency_key uuid,
  p_order_allocations jsonb,
  p_item_allocations jsonb,
  p_tenders jsonb,
  p_tip_amount numeric DEFAULT 0,
  p_discount_authorization uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.finalize_payment(
    p_idempotency_key,
    p_order_allocations,
    p_item_allocations,
    p_tenders,
    p_tip_amount,
    p_discount_authorization
  );
$$;

CREATE OR REPLACE FUNCTION private.void_payment(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := (SELECT auth.uid());
  v_caller_role text := public.get_user_role();
  v_transaction public.payment_transactions%ROWTYPE;
  v_order_id uuid;
  v_paid numeric(12,2);
  v_single_method public.payment_method;
BEGIN
  IF v_caller_id IS NULL OR v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Solo dueño y administrador pueden anular pagos';
  END IF;

  SELECT * INTO v_transaction
  FROM public.payment_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF v_transaction.id IS NULL THEN RAISE EXCEPTION 'Ticket no encontrado'; END IF;
  IF v_transaction.status = 'voided' THEN RETURN private.payment_receipt_json(v_transaction.id); END IF;

  PERFORM 1
  FROM public.orders
  WHERE id IN (
    SELECT allocation.order_id
    FROM public.payment_order_allocations AS allocation
    WHERE allocation.transaction_id = p_transaction_id
  )
  ORDER BY id
  FOR UPDATE;

  UPDATE public.payment_transactions
  SET status = 'voided',
      voided_by = v_caller_id,
      voided_at = now()
  WHERE id = p_transaction_id;

  FOR v_order_id IN
    SELECT allocation.order_id
    FROM public.payment_order_allocations AS allocation
    WHERE allocation.transaction_id = p_transaction_id
  LOOP
    SELECT COALESCE(SUM(allocation.gross_amount), 0)
    INTO v_paid
    FROM public.payment_order_allocations AS allocation
    JOIN public.payment_transactions AS transaction
      ON transaction.id = allocation.transaction_id
     AND transaction.status = 'completed'
    WHERE allocation.order_id = v_order_id;

    SELECT CASE
      WHEN count(DISTINCT tender.method) = 1
        THEN min(tender.method::text)::public.payment_method
      ELSE NULL
    END
    INTO v_single_method
    FROM public.payment_tenders AS tender
    JOIN public.payment_transactions AS transaction ON transaction.id = tender.transaction_id
    JOIN public.payment_order_allocations AS allocation ON allocation.transaction_id = transaction.id
    WHERE allocation.order_id = v_order_id
      AND transaction.status = 'completed';

    UPDATE public.orders
    SET paid_amount = LEAST(total::numeric, ROUND(v_paid, 2)),
        payment_status = CASE
          WHEN ROUND(v_paid, 2) >= total::numeric THEN 'paid'
          WHEN ROUND(v_paid, 2) > 0 THEN 'partial'
          ELSE 'unpaid'
        END,
        status = CASE WHEN status = 'paid' AND ROUND(v_paid, 2) < total::numeric
          THEN 'served'::public.order_status ELSE status END,
        payment_method = CASE WHEN ROUND(v_paid, 2) >= total::numeric THEN v_single_method ELSE NULL END,
        paid_at = CASE WHEN ROUND(v_paid, 2) >= total::numeric THEN paid_at ELSE NULL END,
        cash_received = CASE WHEN ROUND(v_paid, 2) >= total::numeric THEN cash_received ELSE NULL END,
        change_given = CASE WHEN ROUND(v_paid, 2) >= total::numeric THEN change_given ELSE NULL END,
        updated_at = now()
    WHERE id = v_order_id;
  END LOOP;

  RETURN private.payment_receipt_json(p_transaction_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.void_payment(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.void_payment(p_transaction_id);
$$;

CREATE OR REPLACE FUNCTION private.get_payment_receipt(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.can_view_payment(p_transaction_id) THEN
    RAISE EXCEPTION 'No tienes permiso para consultar este ticket';
  END IF;
  RETURN private.payment_receipt_json(p_transaction_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_payment_receipt(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.get_payment_receipt(p_transaction_id);
$$;

REVOKE ALL ON FUNCTION private.can_view_payment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.set_staff_authorization_pin(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.authorize_payment_discount(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.payment_receipt_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.finalize_payment(uuid, jsonb, jsonb, jsonb, numeric, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.void_payment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.get_payment_receipt(uuid) FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_view_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.set_staff_authorization_pin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.authorize_payment_discount(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.finalize_payment(uuid, jsonb, jsonb, jsonb, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.void_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_payment_receipt(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_staff_authorization_pin(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.authorize_payment_discount(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_payment(uuid, jsonb, jsonb, jsonb, numeric, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_payment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_payment_receipt(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_staff_authorization_pin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_payment_discount(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_payment(uuid, jsonb, jsonb, jsonb, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_receipt(uuid) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'payment_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_transactions;
  END IF;
END;
$$;
