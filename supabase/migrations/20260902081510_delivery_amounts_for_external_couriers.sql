-- Domicilio: el total operativo de Mideli cubre solo los productos.
-- delivery_fee se conserva para mostrar el importe que cobra el repartidor.

UPDATE public.orders
SET total = GREATEST(total - COALESCE(delivery_fee, 0), 0)
WHERE type = 'domicilio'
  AND COALESCE(delivery_fee, 0) > 0;

-- Mantén consistente el libro de pagos si una orden histórica ya incluía el envío.
UPDATE public.orders
SET paid_amount = LEAST(paid_amount, total),
    payment_status = CASE
      WHEN LEAST(paid_amount, total) >= total THEN 'paid'
      WHEN LEAST(paid_amount, total) > 0 THEN 'partial'
      ELSE 'unpaid'
    END,
    paid_at = CASE
      WHEN LEAST(paid_amount, total) >= total THEN paid_at
      ELSE NULL
    END,
    payment_method = CASE
      WHEN LEAST(paid_amount, total) >= total THEN payment_method
      ELSE NULL
    END
WHERE type = 'domicilio'
  AND paid_amount > total;

-- La RPC histórica de pedidos externos todavía calcula total + envío. Normalízalo
-- únicamente al insertar pedidos automáticos de WhatsApp; el POS ya enviará el
-- subtotal operativo directamente.
CREATE OR REPLACE FUNCTION private.normalize_external_delivery_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     AND NEW.type = 'domicilio'
     AND NEW.source_channel = 'whatsapp'
     AND NEW.external_order_id IS NOT NULL
     AND COALESCE(NEW.delivery_fee, 0) > 0
  THEN
    NEW.total := GREATEST(NEW.total - NEW.delivery_fee, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_external_delivery_total ON public.orders;
CREATE TRIGGER normalize_external_delivery_total
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.normalize_external_delivery_total();

REVOKE ALL ON FUNCTION private.normalize_external_delivery_total() FROM PUBLIC;
