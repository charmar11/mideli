-- Prevent a crafted receipt payload from linking one ordered line to another
-- inventory item. Validate both the item and the parent purchase order.
CREATE OR REPLACE FUNCTION private.validate_inventory_receipt_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  linked_item_id uuid;
  linked_purchase_order_id uuid;
  receipt_purchase_order_id uuid;
BEGIN
  IF NEW.purchase_order_line_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT inventory_item_id, purchase_order_id
  INTO linked_item_id, linked_purchase_order_id
  FROM public.inventory_purchase_order_lines
  WHERE id = NEW.purchase_order_line_id;

  IF linked_item_id IS NULL THEN
    RAISE EXCEPTION 'La línea de compra no existe';
  END IF;

  IF linked_item_id <> NEW.inventory_item_id THEN
    RAISE EXCEPTION 'La línea de compra no corresponde al insumo recibido';
  END IF;

  SELECT purchase_order_id
  INTO receipt_purchase_order_id
  FROM public.inventory_receipts
  WHERE id = NEW.receipt_id;

  IF receipt_purchase_order_id IS NULL
     OR receipt_purchase_order_id <> linked_purchase_order_id THEN
    RAISE EXCEPTION 'La línea no corresponde a la compra que se está recibiendo';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validate_inventory_receipt_line
  ON public.inventory_receipt_lines;
CREATE TRIGGER trigger_validate_inventory_receipt_line
  BEFORE INSERT OR UPDATE OF receipt_id, purchase_order_line_id, inventory_item_id
  ON public.inventory_receipt_lines
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_inventory_receipt_line();

REVOKE ALL ON FUNCTION private.validate_inventory_receipt_line() FROM PUBLIC, anon, authenticated;

-- Loss-type movements can only reduce stock. The constraint also protects
-- direct inserts, while transaction rollback keeps the item stock unchanged.
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_loss_direction_check
  CHECK (
    movement_type NOT IN ('waste', 'internal_use', 'damage', 'expired')
    OR quantity_change < 0
  ) NOT VALID;

ALTER TABLE public.inventory_movements
  VALIDATE CONSTRAINT inventory_movements_loss_direction_check;
