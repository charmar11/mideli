-- Archive closed cash shifts without deleting financial records.

ALTER TABLE public.cash_shifts
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD COLUMN archive_reason text;

ALTER TABLE public.cash_shifts
  ADD CONSTRAINT cash_shifts_archive_state_check CHECK (
    (
      archived_at IS NULL
      AND archived_by IS NULL
      AND archive_reason IS NULL
    ) OR (
      archived_at IS NOT NULL
      AND archived_by IS NOT NULL
      AND archive_reason IS NOT NULL
      AND status = 'closed'
      AND length(btrim(archive_reason)) BETWEEN 4 AND 500
    )
  );

CREATE INDEX cash_shifts_archived_at_idx
  ON public.cash_shifts (archived_at DESC)
  WHERE archived_at IS NOT NULL;

CREATE OR REPLACE FUNCTION private.cash_shift_json(
  p_shift_id uuid,
  p_reveal_cash boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_shift public.cash_shifts%ROWTYPE;
  v_result jsonb;
  v_totals jsonb;
  v_opened_by_name text;
  v_closed_by_name text;
  v_authorized_by_name text;
  v_archived_by_name text;
BEGIN
  SELECT * INTO v_shift
  FROM public.cash_shifts
  WHERE id = p_shift_id;

  IF v_shift.id IS NULL THEN RETURN NULL; END IF;

  SELECT full_name INTO v_opened_by_name FROM public.profiles WHERE id = v_shift.opened_by;
  SELECT full_name INTO v_closed_by_name FROM public.profiles WHERE id = v_shift.closed_by;
  SELECT full_name INTO v_authorized_by_name FROM public.profiles WHERE id = v_shift.difference_authorized_by;
  SELECT full_name INTO v_archived_by_name FROM public.profiles WHERE id = v_shift.archived_by;

  v_result := to_jsonb(v_shift) || jsonb_build_object(
    'opened_by_name', COALESCE(v_opened_by_name, 'Personal'),
    'closed_by_name', v_closed_by_name,
    'difference_authorized_by_name', v_authorized_by_name,
    'archived_by_name', v_archived_by_name
  );

  IF v_shift.status = 'open' THEN
    v_totals := private.cash_shift_totals(v_shift.id);
    IF NOT p_reveal_cash THEN
      v_totals := v_totals
        - ARRAY['cash_total', 'expected_cash', 'gross_sales', 'net_sales', 'collected_total'];
    END IF;
    v_result := v_result || jsonb_build_object('operating_totals', v_totals);
  END IF;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION private.archive_cash_shift(
  p_shift_id uuid,
  p_reason text
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
  v_archived_at timestamptz := now();
BEGIN
  IF v_caller_id IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Solo el propietario o administrador puede eliminar cortes';
  END IF;

  IF length(v_reason) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION 'Escribe un motivo de 4 a 500 caracteres';
  END IF;

  SELECT * INTO v_shift
  FROM public.cash_shifts
  WHERE id = p_shift_id
  FOR UPDATE;

  IF v_shift.id IS NULL THEN
    RAISE EXCEPTION 'El corte no existe';
  END IF;

  IF v_shift.status <> 'closed' THEN
    RAISE EXCEPTION 'No se puede eliminar un corte que sigue abierto';
  END IF;

  IF v_shift.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'El corte ya está archivado';
  END IF;

  UPDATE public.cash_shifts
  SET archived_at = v_archived_at,
      archived_by = v_caller_id,
      archive_reason = v_reason,
      updated_at = now()
  WHERE id = p_shift_id;

  RETURN jsonb_build_object(
    'id', p_shift_id,
    'archived_at', v_archived_at,
    'archived_by', v_caller_id,
    'archive_reason', v_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_cash_shift(
  p_shift_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.archive_cash_shift(p_shift_id, p_reason);
$$;

CREATE OR REPLACE FUNCTION private.restore_cash_shift(p_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := (SELECT auth.uid());
  v_role text := private.active_profile_role();
  v_shift public.cash_shifts%ROWTYPE;
BEGIN
  IF v_caller_id IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Solo el propietario o administrador puede restaurar cortes';
  END IF;

  SELECT * INTO v_shift
  FROM public.cash_shifts
  WHERE id = p_shift_id
  FOR UPDATE;

  IF v_shift.id IS NULL THEN
    RAISE EXCEPTION 'El corte no existe';
  END IF;

  IF v_shift.status <> 'closed' THEN
    RAISE EXCEPTION 'Solo se pueden restaurar cortes cerrados';
  END IF;

  IF v_shift.archived_at IS NULL THEN
    RAISE EXCEPTION 'El corte no está archivado';
  END IF;

  UPDATE public.cash_shifts
  SET archived_at = NULL,
      archived_by = NULL,
      archive_reason = NULL,
      updated_at = now()
  WHERE id = p_shift_id;

  RETURN jsonb_build_object('id', p_shift_id, 'restored', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_cash_shift(p_shift_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.restore_cash_shift(p_shift_id);
$$;

DO $$
BEGIN
  IF to_regprocedure('public.delete_cash_shift(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.delete_cash_shift(uuid) FROM PUBLIC, anon, authenticated';
    EXECUTE 'COMMENT ON FUNCTION public.delete_cash_shift(uuid) IS ''Deprecated hard-delete function. Execution is revoked from application users.''';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.archive_cash_shift(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.restore_cash_shift(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.archive_cash_shift(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.restore_cash_shift(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.archive_cash_shift(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_cash_shift(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_cash_shift(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_cash_shift(uuid) TO authenticated;

COMMENT ON FUNCTION public.archive_cash_shift(uuid, text) IS
  'Archives a closed cash shift while preserving all related financial records.';
COMMENT ON FUNCTION public.restore_cash_shift(uuid) IS
  'Restores a previously archived closed cash shift.';
