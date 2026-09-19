-- Keep table accounts synchronized with the payments recorded on their
-- business-scoped orders. An account is never shared across businesses.

CREATE OR REPLACE FUNCTION private.multibusiness_refresh_business_account(
  p_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_current_status text;
  v_active_orders integer;
  v_total numeric := 0;
  v_paid numeric := 0;
BEGIN
  IF p_account_id IS NULL THEN
    RETURN;
  END IF;

  SELECT account.status
    INTO v_current_status
    FROM public.business_accounts AS account
   WHERE account.id = p_account_id
   FOR UPDATE;

  IF NOT FOUND OR v_current_status IN ('closed', 'cancelled') THEN
    RETURN;
  END IF;

  SELECT
    count(*) FILTER (WHERE order_row.status <> 'cancelled'),
    COALESCE(
      sum(order_row.total::numeric)
      FILTER (WHERE order_row.status <> 'cancelled'),
      0
    ),
    COALESCE(
      sum(
        LEAST(
          GREATEST(COALESCE(order_row.paid_amount, 0)::numeric, 0),
          order_row.total::numeric
        )
      ) FILTER (WHERE order_row.status <> 'cancelled'),
      0
    )
    INTO v_active_orders, v_total, v_paid
    FROM public.orders AS order_row
   WHERE order_row.business_account_id = p_account_id;

  IF v_active_orders = 0 THEN
    UPDATE public.business_accounts AS account
       SET status = 'cancelled',
           paid_at = NULL,
           closed_at = COALESCE(account.closed_at, now())
     WHERE account.id = p_account_id
       AND account.status IN ('open', 'partially_paid');
    RETURN;
  END IF;

  IF v_paid + 0.001 >= v_total THEN
    UPDATE public.business_accounts AS account
       SET status = 'paid',
           paid_at = COALESCE(account.paid_at, now()),
           closed_at = NULL
     WHERE account.id = p_account_id
       AND account.status NOT IN ('closed', 'cancelled');
  ELSIF v_paid > 0 THEN
    UPDATE public.business_accounts AS account
       SET status = 'partially_paid',
           paid_at = NULL,
           closed_at = NULL
     WHERE account.id = p_account_id
       AND account.status NOT IN ('closed', 'cancelled');
  ELSE
    UPDATE public.business_accounts AS account
       SET status = 'open',
           paid_at = NULL,
           closed_at = NULL
     WHERE account.id = p_account_id
       AND account.status NOT IN ('closed', 'cancelled');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_sync_business_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM private.multibusiness_refresh_business_account(NEW.business_account_id);

  IF TG_OP = 'UPDATE'
     AND OLD.business_account_id IS DISTINCT FROM NEW.business_account_id
  THEN
    PERFORM private.multibusiness_refresh_business_account(OLD.business_account_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_sync_multibusiness_account
  ON public.orders;
CREATE TRIGGER orders_sync_multibusiness_account
  AFTER INSERT OR UPDATE OF business_account_id, paid_amount, payment_status, status
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.multibusiness_sync_business_account();

-- Prevent a new order from being attached to an account that was already
-- paid, closed or cancelled. The batch RPC will create the next account for
-- that business when a later order reaches the same table.
CREATE OR REPLACE FUNCTION private.multibusiness_validate_open_business_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NEW.business_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT account.status
    INTO v_status
    FROM public.business_accounts AS account
   WHERE account.id = NEW.business_account_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'La cuenta del negocio no existe';
  END IF;

  IF v_status NOT IN ('open', 'partially_paid') THEN
    RAISE EXCEPTION 'La cuenta del negocio ya está cerrada';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_validate_open_multibusiness_account
  ON public.orders;
CREATE TRIGGER orders_validate_open_multibusiness_account
  BEFORE INSERT OR UPDATE OF business_account_id
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.multibusiness_validate_open_business_account();

REVOKE ALL ON FUNCTION private.multibusiness_refresh_business_account(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_sync_business_account()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_validate_open_business_account()
  FROM PUBLIC, anon, authenticated;
