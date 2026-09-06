-- Permite que quien cerró una caja consulte brevemente el corte digital y
-- enriquece los tickets del historial sin duplicar importes contables.

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
        OR (
          profile.role = 'waiter'
          AND shift.status = 'closed'
          AND shift.closed_by = profile.id
          AND shift.closed_at >= now() - interval '2 hours'
        )
      )
  );
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
    'opening_float_changes', COALESCE((
      SELECT jsonb_agg(to_jsonb(change) || jsonb_build_object(
        'changed_by_name', changer.full_name
      ) ORDER BY change.created_at DESC)
      FROM public.cash_shift_opening_float_changes AS change
      JOIN public.profiles AS changer ON changer.id = change.changed_by
      WHERE change.shift_id = p_shift_id
    ), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', transaction.id,
        'folio', transaction.folio,
        'status', transaction.status,
        'total_amount', transaction.total_amount,
        'order_type', COALESCE(transaction.order_type, (
          SELECT orders.type
          FROM public.payment_order_allocations AS allocation
          JOIN public.orders AS orders ON orders.id = allocation.order_id
          WHERE allocation.transaction_id = transaction.id
          ORDER BY allocation.created_at, allocation.id
          LIMIT 1
        )),
        'order_numbers', COALESCE((
          SELECT jsonb_agg(source.number ORDER BY source.number)
          FROM (
            SELECT DISTINCT orders.number
            FROM public.payment_order_allocations AS allocation
            JOIN public.orders AS orders ON orders.id = allocation.order_id
            WHERE allocation.transaction_id = transaction.id
          ) AS source
        ), '[]'::jsonb),
        'item_count', COALESCE((
          SELECT sum(item.quantity)
          FROM public.payment_item_allocations AS item
          WHERE item.transaction_id = transaction.id
        ), 0),
        'payment_methods', COALESCE((
          SELECT jsonb_agg(source.method ORDER BY source.method)
          FROM (
            SELECT DISTINCT tender.method::text AS method
            FROM public.payment_tenders AS tender
            WHERE tender.transaction_id = transaction.id
          ) AS source
        ), '[]'::jsonb),
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

REVOKE ALL ON FUNCTION private.can_view_cash_shift(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.get_cash_shift_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_view_cash_shift(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_cash_shift_detail(uuid) TO authenticated;
