-- Remove the manual product availability feature and add guarded permanent
-- deletion for archived cash shifts that contain no operational records.

DROP TRIGGER IF EXISTS trigger_reserve_limited_menu_item ON public.order_items;
DROP TRIGGER IF EXISTS trigger_release_cancelled_order_availability ON public.orders;
DROP TRIGGER IF EXISTS trigger_restore_limited_menu_item_reservation
  ON public.menu_item_availability_reservations;

DROP FUNCTION IF EXISTS public.set_menu_item_availability(uuid, text, integer, text);
DROP FUNCTION IF EXISTS private.reserve_limited_menu_item();
DROP FUNCTION IF EXISTS private.restore_limited_menu_item_reservation();
DROP FUNCTION IF EXISTS private.release_cancelled_order_availability();

DROP TABLE IF EXISTS public.menu_item_availability_reservations;
DROP TABLE IF EXISTS public.menu_item_availability_log;

DROP INDEX IF EXISTS public.menu_items_availability_idx;

ALTER TABLE public.menu_items
  DROP CONSTRAINT IF EXISTS menu_items_availability_status_check,
  DROP CONSTRAINT IF EXISTS menu_items_available_quantity_check,
  DROP CONSTRAINT IF EXISTS menu_items_availability_state_check,
  DROP COLUMN IF EXISTS availability_status,
  DROP COLUMN IF EXISTS available_quantity,
  DROP COLUMN IF EXISTS availability_updated_at,
  DROP COLUMN IF EXISTS availability_updated_by;

CREATE TABLE private.cash_shift_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_shift_id uuid NOT NULL,
  cash_shift_number bigint NOT NULL,
  shift_snapshot jsonb NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 4 AND 500),
  deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cash_shift_deletion_log_deleted_at_idx
  ON private.cash_shift_deletion_log (deleted_at DESC);

ALTER TABLE private.cash_shift_deletion_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON private.cash_shift_deletion_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.cash_shift_deletion_log TO service_role;

CREATE OR REPLACE FUNCTION private.cash_shift_deletion_impact(p_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := (SELECT auth.uid());
  v_role text := private.active_profile_role();
  v_shift public.cash_shifts%ROWTYPE;
  v_orders integer;
  v_payments integer;
  v_movements integer;
  v_adjustments integer;
  v_transfers integer;
BEGIN
  IF v_caller_id IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Solo el propietario o administrador puede revisar esta eliminación';
  END IF;

  SELECT * INTO v_shift
  FROM public.cash_shifts
  WHERE id = p_shift_id;

  IF v_shift.id IS NULL THEN
    RAISE EXCEPTION 'El corte no existe';
  END IF;

  SELECT count(*)::integer INTO v_orders
  FROM public.orders
  WHERE cash_shift_id = p_shift_id;

  SELECT count(*)::integer INTO v_payments
  FROM public.payment_transactions
  WHERE cash_shift_id = p_shift_id;

  SELECT count(*)::integer INTO v_movements
  FROM public.cash_movements
  WHERE shift_id = p_shift_id;

  SELECT count(*)::integer INTO v_adjustments
  FROM public.cash_shift_adjustments
  WHERE shift_id = p_shift_id;

  SELECT count(*)::integer INTO v_transfers
  FROM public.cash_shift_pending_orders
  WHERE closing_shift_id = p_shift_id OR next_shift_id = p_shift_id;

  RETURN jsonb_build_object(
    'id', v_shift.id,
    'number', v_shift.number,
    'status', v_shift.status,
    'archived_at', v_shift.archived_at,
    'orders', v_orders,
    'payments', v_payments,
    'movements', v_movements,
    'adjustments', v_adjustments,
    'transfers', v_transfers,
    'deletable',
      v_shift.status = 'closed'
      AND v_shift.archived_at IS NOT NULL
      AND v_orders = 0
      AND v_payments = 0
      AND v_movements = 0
      AND v_adjustments = 0
      AND v_transfers = 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cash_shift_deletion_impact(p_shift_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.cash_shift_deletion_impact(p_shift_id);
$$;

CREATE OR REPLACE FUNCTION private.permanently_delete_cash_shift(
  p_shift_id uuid,
  p_reason text,
  p_confirmation text
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
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_impact jsonb;
BEGIN
  IF v_caller_id IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Solo el propietario o administrador puede eliminar cortes definitivamente';
  END IF;

  IF length(v_reason) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION 'Escribe un motivo de 4 a 500 caracteres';
  END IF;

  IF btrim(COALESCE(p_confirmation, '')) <> 'ELIMINAR DEFINITIVAMENTE' THEN
    RAISE EXCEPTION 'La confirmación escrita no coincide';
  END IF;

  SELECT * INTO v_shift
  FROM public.cash_shifts
  WHERE id = p_shift_id
  FOR UPDATE;

  IF v_shift.id IS NULL THEN
    RAISE EXCEPTION 'El corte no existe';
  END IF;

  IF v_shift.status <> 'closed' OR v_shift.archived_at IS NULL THEN
    RAISE EXCEPTION 'Primero archiva un corte cerrado antes de eliminarlo definitivamente';
  END IF;

  v_impact := private.cash_shift_deletion_impact(p_shift_id);

  IF NOT COALESCE((v_impact ->> 'deletable')::boolean, false) THEN
    RAISE EXCEPTION 'Este corte conserva pedidos, pagos o movimientos y no se puede eliminar definitivamente';
  END IF;

  INSERT INTO private.cash_shift_deletion_log (
    cash_shift_id,
    cash_shift_number,
    shift_snapshot,
    reason,
    deleted_by
  ) VALUES (
    v_shift.id,
    v_shift.number,
    to_jsonb(v_shift),
    v_reason,
    v_caller_id
  );

  DELETE FROM private.cash_action_authorizations
  WHERE shift_id = p_shift_id;

  DELETE FROM public.cash_shifts
  WHERE id = p_shift_id;

  RETURN jsonb_build_object(
    'id', p_shift_id,
    'number', v_shift.number,
    'deleted', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.permanently_delete_cash_shift(
  p_shift_id uuid,
  p_reason text,
  p_confirmation text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.permanently_delete_cash_shift(
    p_shift_id,
    p_reason,
    p_confirmation
  );
$$;

REVOKE ALL ON FUNCTION private.cash_shift_deletion_impact(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.permanently_delete_cash_shift(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cash_shift_deletion_impact(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.permanently_delete_cash_shift(uuid, text, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_cash_shift_deletion_impact(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.permanently_delete_cash_shift(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_shift_deletion_impact(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.permanently_delete_cash_shift(uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.get_cash_shift_deletion_impact(uuid) IS
  'Counts operational records before a permanent archived cash shift deletion.';
COMMENT ON FUNCTION public.permanently_delete_cash_shift(uuid, text, text) IS
  'Permanently deletes an archived cash shift only when it has no operational records.';
