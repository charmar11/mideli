BEGIN;

DO $$
DECLARE
  v_inventory_item_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'menu_items'
      AND column_name LIKE 'availability%'
  ) THEN
    RAISE EXCEPTION 'Availability columns still exist';
  END IF;

  IF to_regclass('public.menu_item_availability_log') IS NOT NULL
     OR to_regclass('public.menu_item_availability_reservations') IS NOT NULL THEN
    RAISE EXCEPTION 'Availability tables still exist';
  END IF;

  SELECT id INTO v_inventory_item_id
  FROM public.inventory_items
  ORDER BY created_at
  LIMIT 1;

  IF v_inventory_item_id IS NOT NULL THEN
    UPDATE public.inventory_items
    SET current_stock = -1
    WHERE id = v_inventory_item_id;

    IF NOT EXISTS (
      SELECT 1
      FROM public.inventory_items
      WHERE id = v_inventory_item_id AND current_stock = -1
    ) THEN
      RAISE EXCEPTION 'Inventory stock did not accept a negative value';
    END IF;
  END IF;
END;
$$;

CREATE TEMP TABLE owner_cleanup_test_context (
  owner_id uuid NOT NULL,
  empty_shift_id uuid NOT NULL,
  protected_shift_id uuid
);

DO $$
DECLARE
  v_owner_id uuid;
  v_empty_shift_id uuid;
  v_protected_shift_id uuid;
BEGIN
  SELECT id INTO v_owner_id
  FROM public.profiles
  WHERE is_active = true AND role IN ('owner', 'admin')
  ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, created_at
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'An active owner or admin is required for this smoke test';
  END IF;

  INSERT INTO public.cash_shifts (
    status,
    opening_float,
    opened_by,
    opened_at,
    count_mode,
    counted_cash,
    expected_cash,
    difference,
    closed_by,
    closed_at,
    archived_at,
    archived_by,
    archive_reason
  ) VALUES (
    'closed',
    0,
    v_owner_id,
    now() - interval '1 minute',
    'total',
    0,
    0,
    0,
    v_owner_id,
    now(),
    now(),
    v_owner_id,
    'Corte temporal de prueba automatizada'
  )
  RETURNING id INTO v_empty_shift_id;

  SELECT shift.id INTO v_protected_shift_id
  FROM public.cash_shifts AS shift
  WHERE shift.archived_at IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.orders WHERE cash_shift_id = shift.id)
      OR EXISTS (SELECT 1 FROM public.payment_transactions WHERE cash_shift_id = shift.id)
      OR EXISTS (SELECT 1 FROM public.cash_movements WHERE shift_id = shift.id)
      OR EXISTS (SELECT 1 FROM public.cash_shift_adjustments WHERE shift_id = shift.id)
      OR EXISTS (
        SELECT 1
        FROM public.cash_shift_pending_orders
        WHERE closing_shift_id = shift.id OR next_shift_id = shift.id
      )
    )
  ORDER BY shift.archived_at
  LIMIT 1;

  INSERT INTO owner_cleanup_test_context VALUES (
    v_owner_id,
    v_empty_shift_id,
    v_protected_shift_id
  );

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

GRANT SELECT ON owner_cleanup_test_context TO authenticated;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_empty_shift_id uuid;
  v_protected_shift_id uuid;
  v_impact jsonb;
  v_updated_settings integer;
BEGIN
  SELECT empty_shift_id, protected_shift_id
  INTO v_empty_shift_id, v_protected_shift_id
  FROM owner_cleanup_test_context;

  v_impact := public.get_cash_shift_deletion_impact(v_empty_shift_id);
  IF NOT COALESCE((v_impact ->> 'deletable')::boolean, false) THEN
    RAISE EXCEPTION 'An empty archived shift was not marked deletable';
  END IF;

  PERFORM public.permanently_delete_cash_shift(
    v_empty_shift_id,
    'Corte temporal vacío de prueba',
    'ELIMINAR DEFINITIVAMENTE'
  );

  IF EXISTS (SELECT 1 FROM public.cash_shifts WHERE id = v_empty_shift_id) THEN
    RAISE EXCEPTION 'The empty archived shift was not deleted';
  END IF;

  IF v_protected_shift_id IS NOT NULL THEN
    BEGIN
      PERFORM public.permanently_delete_cash_shift(
        v_protected_shift_id,
        'Intento protegido de prueba',
        'ELIMINAR DEFINITIVAMENTE'
      );
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = 'A protected shift was deleted unexpectedly';
    EXCEPTION
      WHEN SQLSTATE 'P0002' THEN
        RAISE;
      WHEN OTHERS THEN
        NULL;
    END;

    IF NOT EXISTS (
      SELECT 1 FROM public.cash_shifts WHERE id = v_protected_shift_id
    ) THEN
      RAISE EXCEPTION 'The protected shift was not preserved';
    END IF;
  END IF;

  UPDATE public.owner_report_settings
  SET recipient_email = 'destinatario-prueba@mideli.test',
      updated_at = now()
  WHERE id = 1;
  GET DIAGNOSTICS v_updated_settings = ROW_COUNT;

  IF v_updated_settings <> 1 THEN
    RAISE EXCEPTION 'The owner report recipient was not replaceable';
  END IF;
END;
$$;

RESET ROLE;

SELECT jsonb_build_object(
  'availability_removed', true,
  'negative_inventory_allowed', true,
  'report_email_replaceable', true,
  'empty_shift_deletion', 'passed',
  'protected_shift_preserved', true,
  'active_closed_shifts',
    (SELECT count(*) FROM public.cash_shifts
     WHERE status = 'closed' AND archived_at IS NULL),
  'archived_closed_shifts',
    (SELECT count(*) FROM public.cash_shifts
     WHERE status = 'closed' AND archived_at IS NOT NULL),
  'active_cash_difference',
    (SELECT COALESCE(sum(difference), 0) FROM public.cash_shifts
     WHERE status = 'closed' AND archived_at IS NULL),
  'archived_cash_difference_excluded',
    (SELECT COALESCE(sum(difference), 0) FROM public.cash_shifts
     WHERE status = 'closed' AND archived_at IS NOT NULL)
) AS verification;

ROLLBACK;
