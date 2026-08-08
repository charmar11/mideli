-- Migration: delete_cash_shift RPC
-- Allows owner/admin to hard-delete a closed cash shift and all its related records.
-- Deletion order:
--   1. Nullify FK on orders and payment_transactions (RESTRICT becomes safe)
--   2. Delete cash_shift_pending_orders (closing_shift_id / next_shift_id)
--   3. Delete cash_movements
--   4. Delete cash_shift_adjustments (would cascade, but be explicit)
--   5. Delete private.cash_action_authorizations (cascade, but explicit)
--   6. Delete cash_shifts row

CREATE OR REPLACE FUNCTION public.delete_cash_shift(
  p_shift_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_role text;
  v_shift_status text;
BEGIN
  -- 1. Verify caller is owner or admin
  v_role := private.active_profile_role();
  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Solo el propietario o administrador puede eliminar cortes';
  END IF;

  -- 2. Verify the shift exists and is closed (cannot delete open shifts)
  SELECT status INTO v_shift_status
  FROM public.cash_shifts
  WHERE id = p_shift_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El corte no existe';
  END IF;

  IF v_shift_status = 'open' THEN
    RAISE EXCEPTION 'No se puede eliminar un corte que sigue abierto';
  END IF;

  -- 3. Nullify FK references in orders
  UPDATE public.orders
  SET cash_shift_id = NULL
  WHERE cash_shift_id = p_shift_id;

  -- 4. Nullify FK references in payment_transactions
  UPDATE public.payment_transactions
  SET cash_shift_id = NULL
  WHERE cash_shift_id = p_shift_id;

  -- 5. Delete pending orders snapshot (RESTRICT on closing_shift_id and next_shift_id)
  DELETE FROM public.cash_shift_pending_orders
  WHERE closing_shift_id = p_shift_id OR next_shift_id = p_shift_id;

  -- 6. Delete cash movements
  DELETE FROM public.cash_movements
  WHERE shift_id = p_shift_id;

  -- 7. Delete adjustments (RESTRICT FK, not CASCADE)
  DELETE FROM public.cash_shift_adjustments
  WHERE shift_id = p_shift_id;

  -- 8. Delete action authorizations (CASCADE, but be explicit)
  DELETE FROM private.cash_action_authorizations
  WHERE shift_id = p_shift_id;

  -- 9. Finally delete the shift itself
  DELETE FROM public.cash_shifts
  WHERE id = p_shift_id;
END;
$$;

-- Permissions: only authenticated users can call it; the function itself checks role internally.
REVOKE ALL ON FUNCTION public.delete_cash_shift(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_cash_shift(uuid) TO authenticated;
