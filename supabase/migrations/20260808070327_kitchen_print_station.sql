-- Cola durable para una estacion de impresion conectada por USB.
-- El navegador de la laptop reclama cada trabajo una sola vez y conserva
-- los pendientes cuando la estacion esta cerrada o sin conexion.

CREATE TABLE public.print_station_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  auto_print_kitchen boolean NOT NULL DEFAULT false,
  paper_width_mm smallint NOT NULL DEFAULT 48 CHECK (paper_width_mm = 48),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.print_station_settings (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE public.print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'kitchen' CHECK (kind IN ('kitchen')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'printing', 'printed', 'failed', 'cancelled')),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claimed_by text,
  claimed_at timestamptz,
  printed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, kind)
);

CREATE INDEX print_jobs_queue_idx
  ON public.print_jobs(status, created_at)
  WHERE status IN ('queued', 'printing');

ALTER TABLE public.print_station_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read print settings"
  ON public.print_station_settings
  FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('owner', 'admin', 'kitchen', 'supervisor'));

CREATE POLICY "Admins update print settings"
  ON public.print_station_settings
  FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('owner', 'admin'))
  WITH CHECK (public.get_user_role() IN ('owner', 'admin'));

CREATE POLICY "Print operators read jobs"
  ON public.print_jobs
  FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('owner', 'admin', 'kitchen', 'supervisor'));

REVOKE ALL ON public.print_station_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.print_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.print_station_settings TO authenticated;
GRANT UPDATE (auto_print_kitchen, updated_by, updated_at)
  ON public.print_station_settings TO authenticated;
GRANT SELECT ON public.print_jobs TO authenticated;

CREATE OR REPLACE FUNCTION private.enqueue_kitchen_print_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.print_station_settings
    WHERE singleton
      AND auto_print_kitchen
  ) THEN
    INSERT INTO public.print_jobs (order_id, kind)
    VALUES (NEW.id, 'kitchen')
    ON CONFLICT (order_id, kind) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enqueue_kitchen_print_job ON public.orders;
CREATE TRIGGER trigger_enqueue_kitchen_print_job
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.enqueue_kitchen_print_job();

REVOKE ALL ON FUNCTION private.enqueue_kitchen_print_job() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.claim_next_print_job(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.print_jobs%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_items jsonb;
  v_created_by_name text;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR public.get_user_role() NOT IN ('owner', 'admin', 'kitchen', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para operar la impresion';
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_device_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Falta identificar este dispositivo';
  END IF;

  UPDATE public.print_jobs
  SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'queued' END,
      claimed_by = NULL,
      claimed_at = NULL,
      last_error = CASE
        WHEN attempts >= 5 THEN COALESCE(last_error, 'La estacion dejo el trabajo incompleto')
        ELSE last_error
      END,
      updated_at = now()
  WHERE status = 'printing'
    AND claimed_at < now() - interval '3 minutes';

  SELECT * INTO v_job
  FROM public.print_jobs
  WHERE status = 'queued'
  ORDER BY created_at, id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_job.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.print_jobs
  SET status = 'printing',
      attempts = attempts + 1,
      claimed_by = BTRIM(p_device_id),
      claimed_at = now(),
      updated_at = now(),
      last_error = NULL
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_job.order_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', item.id,
      'name', menu_item.name,
      'quantity', item.quantity,
      'notes', item.notes,
      'selected_modifiers', item.selected_modifiers
    ) ORDER BY item.created_at, item.id
  ), '[]'::jsonb)
  INTO v_items
  FROM public.order_items AS item
  JOIN public.menu_items AS menu_item ON menu_item.id = item.menu_item_id
  WHERE item.order_id = v_order.id;

  SELECT profile.full_name INTO v_created_by_name
  FROM public.profiles AS profile
  WHERE profile.id = v_order.created_by;

  RETURN jsonb_build_object(
    'job_id', v_job.id,
    'attempt', v_job.attempts,
    'order', jsonb_build_object(
      'id', v_order.id,
      'number', v_order.number,
      'type', v_order.type,
      'notes', v_order.notes,
      'table_number', v_order.table_number,
      'table_zone_name', v_order.table_zone_name,
      'customer_name', v_order.customer_name,
      'created_at', v_order.created_at,
      'created_by_name', v_created_by_name
    ),
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_print_job(
  p_job_id uuid,
  p_device_id text,
  p_success boolean,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempts smallint;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR public.get_user_role() NOT IN ('owner', 'admin', 'kitchen', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para operar la impresion';
  END IF;

  SELECT attempts INTO v_attempts
  FROM public.print_jobs
  WHERE id = p_job_id
    AND status = 'printing'
    AND claimed_by = BTRIM(p_device_id)
  FOR UPDATE;

  IF v_attempts IS NULL THEN
    RAISE EXCEPTION 'El trabajo ya no pertenece a este dispositivo';
  END IF;

  UPDATE public.print_jobs
  SET status = CASE
        WHEN p_success THEN 'printed'
        WHEN v_attempts >= 5 THEN 'failed'
        ELSE 'queued'
      END,
      printed_at = CASE WHEN p_success THEN now() ELSE NULL END,
      claimed_by = CASE WHEN p_success THEN claimed_by ELSE NULL END,
      claimed_at = CASE WHEN p_success THEN claimed_at ELSE NULL END,
      last_error = CASE WHEN p_success THEN NULL ELSE LEFT(COALESCE(p_error, 'Error de impresion'), 500) END,
      updated_at = now()
  WHERE id = p_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.requeue_print_job(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR public.get_user_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Solo administracion puede reintentar impresiones';
  END IF;

  UPDATE public.print_jobs
  SET status = 'queued',
      attempts = 0,
      claimed_by = NULL,
      claimed_at = NULL,
      printed_at = NULL,
      last_error = NULL,
      updated_at = now()
  WHERE id = p_job_id
    AND status = 'failed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El trabajo no esta disponible para reintento';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_print_job(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finish_print_job(uuid, text, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.requeue_print_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_next_print_job(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_print_job(uuid, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_print_job(uuid) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'print_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;
  END IF;
END
$$;
