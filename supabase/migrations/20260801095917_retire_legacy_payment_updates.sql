DROP FUNCTION IF EXISTS public.mark_orders_paid(
  uuid[],
  public.payment_method,
  integer,
  integer
);

CREATE FUNCTION private.guard_order_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND (
    NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
    NEW.paid_amount IS DISTINCT FROM OLD.paid_amount OR
    NEW.payment_method IS DISTINCT FROM OLD.payment_method OR
    NEW.cash_received IS DISTINCT FROM OLD.cash_received OR
    NEW.change_given IS DISTINCT FROM OLD.change_given OR
    NEW.paid_at IS DISTINCT FROM OLD.paid_at
  ) THEN
    RAISE EXCEPTION 'Los datos de pago solo pueden cambiarse mediante el flujo de cobro';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_order_payment_fields_before_update
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_order_payment_fields();

REVOKE ALL ON FUNCTION private.guard_order_payment_fields()
  FROM PUBLIC, anon, authenticated;
