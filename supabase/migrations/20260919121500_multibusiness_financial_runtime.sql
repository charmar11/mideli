-- Runtime boundary for cash shifts and payments.
--
-- The first multibusiness migrations intentionally kept the existing public
-- RPCs working for Mideli. This migration adds an explicit business context
-- for the financial workflow so a future business selector cannot open,
-- close, or charge against another business by accident.

CREATE OR REPLACE FUNCTION private.multibusiness_requested_business_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_raw text;
BEGIN
  v_raw := pg_catalog.current_setting('mideli.business_id', true);
  IF v_raw IS NULL OR btrim(v_raw) = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_raw::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_require_business_capability(
  p_business_id uuid,
  p_capability text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organization_id uuid;
BEGIN
  SELECT business.organization_id
    INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.lifecycle_status NOT IN ('archived', 'retired');

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'El negocio seleccionado no está disponible';
  END IF;

  IF NOT private.multibusiness_has_capability(
    p_capability,
    v_organization_id,
    p_business_id
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para operar este negocio';
  END IF;

  RETURN v_organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_can_operate_business(
  p_business_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.businesses AS business
     WHERE business.id = p_business_id
       AND business.lifecycle_status NOT IN ('archived', 'retired')
       AND (
         private.multibusiness_has_capability(
           'business.operate_orders', business.organization_id, business.id
         )
         OR private.multibusiness_has_capability(
           'business.charge_orders', business.organization_id, business.id
         )
         OR private.multibusiness_has_capability(
           'business.manage_cash', business.organization_id, business.id
         )
         OR private.multibusiness_has_capability(
           'organization.operate_orders', business.organization_id, NULL
         )
         OR private.multibusiness_has_capability(
           'organization.charge_orders', business.organization_id, NULL
         )
       )
  );
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_assert_shift_business(
  p_shift_id uuid,
  p_business_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_shift_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.cash_shifts AS shift
     WHERE shift.id = p_shift_id
       AND shift.business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'El turno de caja no pertenece al negocio seleccionado';
  END IF;
END;
$$;

-- A transaction-local setting lets the old internal procedures remain the
-- single source of truth while a guarded RPC supplies the selected business.
-- It is never persisted and is not exposed as a public function.
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

  IF NEW.business_id IS NULL THEN
    v_business_id := private.multibusiness_requested_business_id();
    NEW.business_id := v_business_id;
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

CREATE OR REPLACE FUNCTION private.assign_payment_cash_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := private.active_profile_role();
  v_business_id uuid := COALESCE(
    NEW.business_id,
    private.multibusiness_requested_business_id(),
    private.multibusiness_mideli_business_id()
  );
BEGIN
  IF v_role NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar pagos';
  END IF;

  NEW.business_id := v_business_id;

  SELECT shift.id
    INTO NEW.cash_shift_id
    FROM public.cash_shifts AS shift
   WHERE shift.status = 'open'
     AND shift.business_id = v_business_id
   LIMIT 1
   FOR SHARE;

  IF NEW.cash_shift_id IS NULL THEN
    RAISE EXCEPTION 'Abre un turno de caja antes de cobrar';
  END IF;

  IF NEW.table_id IS NOT NULL THEN
    SELECT zone.name
      INTO NEW.table_zone_name
      FROM public.restaurant_tables AS restaurant_table
      LEFT JOIN public.table_zones AS zone
        ON zone.id = restaurant_table.zone_id
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
  v_business_id uuid := COALESCE(
    private.multibusiness_requested_business_id(),
    private.multibusiness_mideli_business_id()
  );
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
  v_business_id uuid := COALESCE(
    private.multibusiness_requested_business_id(),
    private.multibusiness_mideli_business_id()
  );
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

-- The legacy totals helper counted all unpaid orders in the organization.
-- Scope that part to the shift's business before any business-aware close.
CREATE OR REPLACE FUNCTION private.cash_shift_totals(p_shift_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH shift AS (
    SELECT opening_float, business_id
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
      COALESCE(sum(GREATEST(order_row.total::numeric - order_row.paid_amount, 0)), 0)::numeric(12,2) AS pending_balance
    FROM public.orders AS order_row
    CROSS JOIN shift
    WHERE order_row.business_id = shift.business_id
      AND order_row.status <> 'cancelled'
      AND order_row.payment_status <> 'paid'
      AND order_row.total::numeric > order_row.paid_amount
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

CREATE OR REPLACE FUNCTION private.multibusiness_close_cash_shift(
  p_business_id uuid,
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
    FROM public.cash_shifts AS shift
   WHERE shift.id = p_shift_id
     AND shift.business_id = p_business_id
   FOR UPDATE;

  IF v_shift.id IS NULL THEN
    RAISE EXCEPTION 'Turno de caja no encontrado';
  END IF;
  IF v_shift.status = 'closed' THEN
    RETURN private.cash_shift_json(v_shift.id, true);
  END IF;

  v_counted := private.counted_cash_from_input(
    p_count_mode,
    p_denominations,
    p_counted_cash
  );
  v_totals := private.cash_shift_totals(p_shift_id);
  v_expected := ROUND((v_totals->>'expected_cash')::numeric, 2);
  v_difference := ROUND(v_counted - v_expected, 2);

  IF ABS(v_difference) > 20 THEN
    SELECT authz.authorized_by
      INTO v_authorized_by
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
    order_row.id,
    order_row.number,
    order_row.type,
    order_row.table_zone_name,
    order_row.table_number,
    order_row.customer_name,
    ROUND(order_row.total::numeric - order_row.paid_amount, 2),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'quantity', order_item.quantity,
        'name', COALESCE(menu_item.name, 'Producto eliminado'),
        'notes', order_item.notes,
        'selected_modifiers', order_item.selected_modifiers
      ) ORDER BY order_item.created_at, order_item.id)
      FROM public.order_items AS order_item
      LEFT JOIN public.menu_items AS menu_item
        ON menu_item.id = order_item.menu_item_id
      WHERE order_item.order_id = order_row.id
    ), '[]'::jsonb)
  FROM public.orders AS order_row
  WHERE order_row.business_id = p_business_id
    AND order_row.status <> 'cancelled'
    AND order_row.payment_status <> 'paid'
    AND order_row.total::numeric > order_row.paid_amount
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
   WHERE id = p_shift_id
     AND business_id = p_business_id;

  IF p_authorization IS NOT NULL AND v_authorized_by IS NOT NULL THEN
    UPDATE private.cash_action_authorizations
       SET used_at = now()
     WHERE token = p_authorization;
  END IF;

  RETURN private.cash_shift_json(p_shift_id, true);
END;
$$;

-- Keep discount authorization tied to the same business as the final ticket.
ALTER TABLE private.payment_discount_authorizations
  ADD COLUMN IF NOT EXISTS business_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'payment_discount_authorizations_business_fkey'
       AND conrelid = 'private.payment_discount_authorizations'::regclass
  ) THEN
    ALTER TABLE private.payment_discount_authorizations
      ADD CONSTRAINT payment_discount_authorizations_business_fkey
      FOREIGN KEY (business_id)
      REFERENCES public.businesses(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

UPDATE private.payment_discount_authorizations AS authorization
   SET business_id = private.multibusiness_mideli_business_id()
 WHERE authorization.business_id IS NULL
   AND private.multibusiness_mideli_business_id() IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_discount_authorizations_business_idx
  ON private.payment_discount_authorizations (business_id, expires_at DESC);

CREATE OR REPLACE FUNCTION private.multibusiness_assign_discount_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.business_id IS NULL THEN
    NEW.business_id := COALESCE(
      private.multibusiness_requested_business_id(),
      private.multibusiness_mideli_business_id()
    );
  END IF;

  IF NEW.business_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.businesses AS business
     WHERE business.id = NEW.business_id
       AND business.lifecycle_status NOT IN ('archived', 'retired')
  ) THEN
    RAISE EXCEPTION 'El negocio de la autorización no está disponible';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_discount_authorizations_assign_business
  ON private.payment_discount_authorizations;
CREATE TRIGGER payment_discount_authorizations_assign_business
  BEFORE INSERT OR UPDATE ON private.payment_discount_authorizations
  FOR EACH ROW
  EXECUTE FUNCTION private.multibusiness_assign_discount_business();

CREATE OR REPLACE FUNCTION private.validate_payment_discount_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.discount_amount <= 0 THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM private.payment_discount_authorizations AS authorization
     WHERE authorization.requested_by = NEW.charged_by
       AND authorization.authorized_by = NEW.discount_authorized_by
       AND authorization.idempotency_key = NEW.idempotency_key
       AND authorization.discount_amount = NEW.discount_amount
       AND authorization.business_id = NEW.business_id
       AND authorization.used_at IS NULL
       AND authorization.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'El descuento autorizado no coincide con el negocio o el cobro';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.multibusiness_cash_action(
  p_business_id uuid,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_organization_id uuid;
  v_shift_id uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  SELECT business.organization_id
    INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.lifecycle_status NOT IN ('archived', 'retired');
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'El negocio seleccionado no está disponible';
  END IF;

  IF p_action IN (
    'open',
    'correct_opening',
    'close',
    'list_history',
    'list_movements',
    'correct_movement',
    'adjustment',
    'archive',
    'restore',
    'deletion_impact',
    'delete'
  ) THEN
    PERFORM private.multibusiness_require_business_capability(
      p_business_id,
      'business.manage_cash'
    );
  ELSIF NOT private.multibusiness_can_operate_business(p_business_id) THEN
    RAISE EXCEPTION 'No tienes permiso para operar este negocio';
  END IF;

  PERFORM pg_catalog.set_config(
    'mideli.business_id',
    p_business_id::text,
    true
  );

  CASE p_action
    WHEN 'current' THEN
      v_result := private.get_current_cash_shift();
    WHEN 'open' THEN
      v_result := private.open_cash_shift(
        (v_payload->>'p_opening_float')::numeric,
        COALESCE(v_payload->'p_opening_denominations', '{}'::jsonb),
        COALESCE(v_payload->>'p_note', '')
      );
    WHEN 'correct_opening' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.correct_cash_shift_opening_float(
        v_shift_id,
        (v_payload->>'p_new_amount')::numeric,
        COALESCE(v_payload->>'p_reason', '')
      );
    WHEN 'list_authorizers' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', profile.id,
        'full_name', profile.full_name,
        'role', profile.role,
        'pin_configured', pin.user_id IS NOT NULL
      ) ORDER BY
        CASE profile.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
        profile.full_name
      ), '[]'::jsonb)
        INTO v_result
        FROM public.profiles AS profile
        LEFT JOIN private.staff_authorization_pins AS pin
          ON pin.user_id = profile.id
       WHERE profile.is_active
         AND profile.role IN ('owner', 'admin', 'supervisor')
         AND EXISTS (
           SELECT 1
             FROM public.memberships AS membership
            WHERE membership.user_id = profile.id
              AND membership.status = 'active'
              AND (
                membership.business_id = p_business_id
                OR (
                  membership.organization_id = v_organization_id
                  AND membership.scope_type IN ('organization', 'platform')
                )
              )
         );
    WHEN 'authorize' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      IF NOT EXISTS (
        SELECT 1
          FROM public.profiles AS profile
         WHERE profile.id = (v_payload->>'p_authorizer_id')::uuid
           AND profile.is_active
           AND profile.role IN ('owner', 'admin', 'supervisor')
           AND EXISTS (
             SELECT 1
               FROM public.memberships AS membership
              WHERE membership.user_id = profile.id
                AND membership.status = 'active'
                AND (
                  membership.business_id = p_business_id
                  OR (
                    membership.organization_id = v_organization_id
                    AND membership.scope_type IN ('organization', 'platform')
                  )
                )
           )
      ) THEN
        RAISE EXCEPTION 'El autorizador no pertenece al negocio seleccionado';
      END IF;
      v_result := to_jsonb(private.authorize_cash_action(
        (v_payload->>'p_authorizer_id')::uuid,
        COALESCE(v_payload->>'p_pin', ''),
        v_shift_id,
        COALESCE(v_payload->>'p_action', ''),
        (v_payload->>'p_amount')::numeric
      ));
    WHEN 'record_movement' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.record_cash_movement(
        v_shift_id,
        COALESCE(v_payload->>'p_movement_type', ''),
        COALESCE(v_payload->>'p_direction', ''),
        (v_payload->>'p_amount')::numeric,
        COALESCE(v_payload->>'p_reason', ''),
        (v_payload->>'p_authorization')::uuid
      );
    WHEN 'preview_close' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.preview_cash_shift_close(
        v_shift_id,
        COALESCE(v_payload->>'p_count_mode', ''),
        COALESCE(v_payload->'p_denominations', '{}'::jsonb),
        (v_payload->>'p_counted_cash')::numeric
      );
    WHEN 'close' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.multibusiness_close_cash_shift(
        p_business_id,
        v_shift_id,
        COALESCE(v_payload->>'p_count_mode', ''),
        COALESCE(v_payload->'p_denominations', '{}'::jsonb),
        (v_payload->>'p_counted_cash')::numeric,
        COALESCE(v_payload->>'p_note', ''),
        (v_payload->>'p_authorization')::uuid
      );
    WHEN 'list_history' THEN
      SELECT COALESCE(jsonb_agg(
        private.cash_shift_json(source.id, true)
        ORDER BY source.opened_at DESC
      ), '[]'::jsonb)
        INTO v_result
        FROM (
          SELECT shift.id, shift.opened_at
            FROM public.cash_shifts AS shift
           WHERE shift.business_id = p_business_id
           ORDER BY shift.opened_at DESC
           LIMIT LEAST(GREATEST(COALESCE((v_payload->>'p_limit')::integer, 50), 1), 200)
           OFFSET GREATEST(COALESCE((v_payload->>'p_offset')::integer, 0), 0)
        ) AS source;
    WHEN 'detail' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.get_cash_shift_detail(v_shift_id);
    WHEN 'list_movements' THEN
      SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC), '[]'::jsonb)
        INTO v_result
        FROM (
          SELECT
            to_jsonb(movement)
            || jsonb_build_object(
              'shift_number', shift.number,
              'shift_status', shift.status,
              'shift_archived_at', shift.archived_at,
              'created_by_name', creator.full_name,
              'authorized_by_name', authorizer.full_name,
              'corrected_amount', correction.corrected_amount,
              'correction_reason', correction.reason,
              'corrected_by', correction.created_by,
              'corrected_by_name', correction_creator.full_name,
              'correction_authorized_by', correction.authorized_by,
              'correction_authorized_by_name', correction_authorizer.full_name,
              'corrected_at', correction.created_at,
              'correction_status', CASE
                WHEN correction.id IS NULL THEN 'active'
                WHEN correction.corrected_amount = 0 THEN 'voided'
                ELSE 'corrected'
              END
            ) AS row_data,
            movement.created_at
            FROM public.cash_movements AS movement
            JOIN public.cash_shifts AS shift ON shift.id = movement.shift_id
            JOIN public.profiles AS creator ON creator.id = movement.created_by
            JOIN public.profiles AS authorizer ON authorizer.id = movement.authorized_by
            LEFT JOIN public.cash_movement_corrections AS correction
              ON correction.movement_id = movement.id
            LEFT JOIN public.profiles AS correction_creator
              ON correction_creator.id = correction.created_by
            LEFT JOIN public.profiles AS correction_authorizer
              ON correction_authorizer.id = correction.authorized_by
           WHERE movement.business_id = p_business_id
             AND (
               v_payload->>'p_since' IS NULL
               OR movement.created_at >= (v_payload->>'p_since')::timestamptz
             )
             AND (
               v_payload->>'p_until' IS NULL
               OR movement.created_at < (v_payload->>'p_until')::timestamptz
             )
           ORDER BY movement.created_at DESC
           LIMIT LEAST(GREATEST(COALESCE((v_payload->>'p_limit')::integer, 250), 1), 500)
           OFFSET GREATEST(COALESCE((v_payload->>'p_offset')::integer, 0), 0)
        ) AS rows;
    WHEN 'correct_movement' THEN
      IF NOT EXISTS (
        SELECT 1
          FROM public.cash_movements AS movement
         WHERE movement.id = (v_payload->>'p_movement_id')::uuid
           AND movement.business_id = p_business_id
      ) THEN
        RAISE EXCEPTION 'El movimiento no pertenece al negocio seleccionado';
      END IF;
      v_result := private.correct_cash_movement(
        (v_payload->>'p_movement_id')::uuid,
        (v_payload->>'p_corrected_amount')::numeric,
        COALESCE(v_payload->>'p_reason', ''),
        (v_payload->>'p_authorization')::uuid
      );
    WHEN 'adjustment' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.record_cash_shift_adjustment(
        v_shift_id,
        COALESCE(v_payload->>'p_payment_method', ''),
        COALESCE(v_payload->>'p_direction', ''),
        (v_payload->>'p_amount')::numeric,
        COALESCE(v_payload->>'p_reason', ''),
        (v_payload->>'p_authorization')::uuid
      );
    WHEN 'archive' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.archive_cash_shift(
        v_shift_id,
        COALESCE(v_payload->>'p_reason', '')
      );
    WHEN 'restore' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.restore_cash_shift(v_shift_id);
    WHEN 'deletion_impact' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.cash_shift_deletion_impact(v_shift_id);
    WHEN 'delete' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.permanently_delete_cash_shift(
        v_shift_id,
        COALESCE(v_payload->>'p_reason', ''),
        COALESCE(v_payload->>'p_confirmation', '')
      );
    ELSE
      RAISE EXCEPTION 'La operación de caja no es válida';
  END CASE;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.multibusiness_payment_action(
  p_business_id uuid,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_organization_id uuid;
  v_existing_id uuid;
  v_order_business_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  SELECT business.organization_id
    INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.lifecycle_status NOT IN ('archived', 'retired');
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'El negocio seleccionado no está disponible';
  END IF;

  IF NOT (
    private.multibusiness_has_capability(
      'business.charge_orders', v_organization_id, p_business_id
    )
    OR private.multibusiness_has_capability(
      'organization.charge_orders', v_organization_id, NULL
    )
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para cobrar en este negocio';
  END IF;

  PERFORM pg_catalog.set_config(
    'mideli.business_id',
    p_business_id::text,
    true
  );

  IF p_action = 'authorize_discount' THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.profiles AS profile
       WHERE profile.id = (v_payload->>'p_authorizer_id')::uuid
         AND profile.is_active
         AND profile.role IN ('owner', 'admin')
         AND EXISTS (
           SELECT 1
             FROM public.memberships AS membership
            WHERE membership.user_id = profile.id
              AND membership.status = 'active'
              AND (
                membership.business_id = p_business_id
                OR (
                  membership.organization_id = v_organization_id
                  AND membership.scope_type IN ('organization', 'platform')
                )
              )
         )
    ) THEN
      RAISE EXCEPTION 'El autorizador no pertenece al negocio seleccionado';
    END IF;

    RETURN to_jsonb(private.authorize_payment_discount(
      (v_payload->>'p_authorizer_id')::uuid,
      COALESCE(v_payload->>'p_pin', ''),
      (v_payload->>'p_idempotency_key')::uuid,
      (v_payload->>'p_discount_amount')::numeric
    ));
  END IF;

  IF p_action <> 'finalize' THEN
    RAISE EXCEPTION 'La operación de pago no es válida';
  END IF;

  SELECT transaction.id, transaction.business_id
    INTO v_existing_id, v_order_business_id
    FROM public.payment_transactions AS transaction
   WHERE transaction.idempotency_key = (v_payload->>'p_idempotency_key')::uuid;
  IF v_existing_id IS NOT NULL THEN
    IF v_order_business_id IS DISTINCT FROM p_business_id THEN
      RAISE EXCEPTION 'La clave del cobro ya pertenece a otro negocio';
    END IF;
    RETURN private.payment_receipt_json(v_existing_id);
  END IF;

  IF jsonb_typeof(COALESCE(v_payload->'p_order_allocations', '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(v_payload->'p_order_allocations', '[]'::jsonb)) = 0
     OR jsonb_typeof(COALESCE(v_payload->'p_item_allocations', '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(v_payload->'p_item_allocations', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'No hay productos para el ticket';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_payload->'p_order_allocations') AS allocation
      LEFT JOIN public.orders AS order_row
        ON order_row.id = (allocation->>'order_id')::uuid
     WHERE order_row.id IS NULL
        OR order_row.business_id IS DISTINCT FROM p_business_id
  ) THEN
    RAISE EXCEPTION 'El cobro contiene un pedido de otro negocio';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_payload->'p_item_allocations') AS item
      LEFT JOIN public.order_items AS order_item
        ON order_item.id = (item->>'order_item_id')::uuid
      LEFT JOIN public.orders AS order_row
        ON order_row.id = order_item.order_id
     WHERE order_item.id IS NULL
        OR order_row.business_id IS DISTINCT FROM p_business_id
        OR NOT EXISTS (
          SELECT 1
            FROM jsonb_array_elements(v_payload->'p_order_allocations') AS allocation
           WHERE (allocation->>'order_id')::uuid = order_item.order_id
        )
  ) THEN
    RAISE EXCEPTION 'El cobro contiene un producto de otro negocio';
  END IF;

  IF (v_payload->>'p_discount_authorization') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM private.payment_discount_authorizations AS authorization
        WHERE authorization.token = (v_payload->>'p_discount_authorization')::uuid
          AND authorization.business_id = p_business_id
          AND authorization.used_at IS NULL
          AND authorization.expires_at > now()
     ) THEN
    RAISE EXCEPTION 'La autorización del descuento no pertenece al negocio seleccionado';
  END IF;

  RETURN private.finalize_payment(
    (v_payload->>'p_idempotency_key')::uuid,
    v_payload->'p_order_allocations',
    v_payload->'p_item_allocations',
    v_payload->'p_tenders',
    COALESCE((v_payload->>'p_tip_amount')::numeric, 0),
    (v_payload->>'p_discount_authorization')::uuid
  );
END;
$$;

REVOKE ALL ON FUNCTION private.multibusiness_requested_business_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_require_business_capability(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_can_operate_business(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_assert_shift_business(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_assign_discount_business() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_close_cash_shift(uuid, uuid, text, jsonb, numeric, text, uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.multibusiness_cash_action(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.multibusiness_payment_action(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.multibusiness_cash_action(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.multibusiness_payment_action(uuid, text, jsonb) TO authenticated;

