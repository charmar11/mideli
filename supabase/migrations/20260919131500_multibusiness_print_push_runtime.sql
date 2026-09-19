-- Keep kitchen printing and operational Push delivery inside the business
-- boundary. The printer remains a Mideli-only station for the first rollout;
-- Just Dipping is intentionally not sent to it until its station is approved.

ALTER TABLE public.print_jobs
  ADD COLUMN IF NOT EXISTS business_id uuid;

UPDATE public.print_jobs AS job
   SET business_id = order_row.business_id
  FROM public.orders AS order_row
 WHERE job.business_id IS NULL
   AND order_row.id = job.order_id;

ALTER TABLE public.print_jobs
  ADD CONSTRAINT print_jobs_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS print_jobs_business_queue_idx
  ON public.print_jobs (business_id, status, created_at)
  WHERE status IN ('queued', 'printing');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.businesses AS business
      JOIN public.organizations AS organization
        ON organization.id = business.organization_id
     WHERE organization.slug = 'rincon-404-food-park'
       AND business.slug = 'mideli'
       AND business.lifecycle_status NOT IN ('archived', 'retired')
  ) THEN
    IF EXISTS (
      SELECT 1
        FROM public.print_jobs
       WHERE business_id IS NULL
    ) THEN
      RAISE EXCEPTION 'Hay trabajos de impresión sin negocio';
    END IF;

    ALTER TABLE public.print_jobs
      ALTER COLUMN business_id SET NOT NULL;
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Staff read print settings" ON public.print_station_settings;
DROP POLICY IF EXISTS "Admins update print settings" ON public.print_station_settings;
DROP POLICY IF EXISTS "Print operators read jobs" ON public.print_jobs;

CREATE POLICY "Mideli staff read print settings"
  ON public.print_station_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.businesses AS business
       WHERE business.id = private.multibusiness_mideli_business_id()
         AND (
           private.multibusiness_has_capability(
             'business.manage_catalog', business.organization_id, business.id
           )
           OR private.multibusiness_has_capability(
             'business.update_preparation', business.organization_id, business.id
           )
         )
    )
  );

CREATE POLICY "Mideli owners update print settings"
  ON public.print_station_settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.businesses AS business
       WHERE business.id = private.multibusiness_mideli_business_id()
         AND private.multibusiness_has_capability(
           'business.manage_catalog', business.organization_id, business.id
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.businesses AS business
       WHERE business.id = private.multibusiness_mideli_business_id()
         AND private.multibusiness_has_capability(
           'business.manage_catalog', business.organization_id, business.id
         )
    )
  );

CREATE POLICY "Print operators read jobs by business"
  ON public.print_jobs
  FOR SELECT TO authenticated
  USING (
    business_id IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.businesses AS business
       WHERE business.id = print_jobs.business_id
         AND (
           private.multibusiness_has_capability(
             'business.update_preparation', business.organization_id, business.id
           )
           OR private.multibusiness_has_capability(
             'business.operate_orders', business.organization_id, business.id
           )
         )
    )
  );

CREATE OR REPLACE FUNCTION private.enqueue_kitchen_print_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- The current physical printer belongs to Mideli. Do not enqueue orders
  -- from a future business into this station by reusing the old singleton.
  IF NEW.business_id IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.businesses AS business
        WHERE business.id = NEW.business_id
          AND business.slug = 'mideli'
          AND business.lifecycle_status NOT IN ('archived', 'retired')
     )
     AND EXISTS (
       SELECT 1
         FROM public.print_station_settings AS settings
        WHERE settings.singleton
          AND settings.auto_print_kitchen
     ) THEN
    INSERT INTO public.print_jobs (order_id, business_id, kind)
    VALUES (NEW.id, NEW.business_id, 'kitchen')
    ON CONFLICT (order_id, kind) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_next_print_job(
  p_device_id text,
  p_business_id uuid
)
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
  v_organization_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR NULLIF(BTRIM(COALESCE(p_device_id, '')), '') IS NULL
     OR p_business_id IS NULL THEN
    RAISE EXCEPTION 'No se puede operar la impresión sin sesión, dispositivo y negocio';
  END IF;

  SELECT business.organization_id
    INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.lifecycle_status NOT IN ('archived', 'retired');

  IF v_organization_id IS NULL
     OR NOT (
       private.multibusiness_has_capability(
         'business.update_preparation', v_organization_id, p_business_id
       )
       OR private.multibusiness_has_capability(
         'business.operate_orders', v_organization_id, p_business_id
       )
     ) THEN
    RAISE EXCEPTION 'No tienes permiso para operar la impresión de este negocio';
  END IF;

  UPDATE public.print_jobs
  SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'queued' END,
      claimed_by = NULL,
      claimed_at = NULL,
      last_error = CASE
        WHEN attempts >= 5 THEN COALESCE(last_error, 'La estación dejó el trabajo incompleto')
        ELSE last_error
      END,
      updated_at = now()
  WHERE status = 'printing'
    AND business_id = p_business_id
    AND claimed_at < now() - interval '3 minutes';

  SELECT *
    INTO v_job
    FROM public.print_jobs
   WHERE status = 'queued'
     AND business_id = p_business_id
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

  SELECT *
    INTO v_order
    FROM public.orders
   WHERE id = v_job.order_id
     AND business_id = p_business_id;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'El pedido de impresión no pertenece al negocio';
  END IF;

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

  SELECT profile.full_name
    INTO v_created_by_name
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

-- Keep older deployed printer tabs working during the additive rollout, but
-- bind their unscoped request to the only physical station currently
-- approved: Mideli. A future business must use the two-argument gateway.
CREATE OR REPLACE FUNCTION public.claim_next_print_job(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  mideli_business_id uuid := private.multibusiness_mideli_business_id();
BEGIN
  IF mideli_business_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la estación de impresión de Mideli';
  END IF;

  RETURN public.claim_next_print_job(p_device_id, mideli_business_id);
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
  v_business_id uuid;
  v_organization_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR NULLIF(BTRIM(COALESCE(p_device_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'No tienes permiso para operar la impresión';
  END IF;

  SELECT job.attempts, job.business_id
    INTO v_attempts, v_business_id
    FROM public.print_jobs AS job
   WHERE job.id = p_job_id
     AND job.status = 'printing'
     AND job.claimed_by = BTRIM(p_device_id)
   FOR UPDATE;

  IF v_attempts IS NULL OR v_business_id IS NULL THEN
    RAISE EXCEPTION 'El trabajo ya no pertenece a este dispositivo o negocio';
  END IF;

  SELECT business.organization_id
    INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = v_business_id
     AND business.lifecycle_status NOT IN ('archived', 'retired');

  IF v_organization_id IS NULL
     OR NOT (
       private.multibusiness_has_capability(
         'business.update_preparation', v_organization_id, v_business_id
       )
       OR private.multibusiness_has_capability(
         'business.operate_orders', v_organization_id, v_business_id
       )
     ) THEN
    RAISE EXCEPTION 'No tienes permiso para cerrar esta impresión';
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
      last_error = CASE
        WHEN p_success THEN NULL
        ELSE LEFT(COALESCE(p_error, 'Error de impresión'), 500)
      END,
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
DECLARE
  v_business_id uuid;
  v_organization_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'No tienes permiso para reintentar impresiones';
  END IF;

  SELECT job.business_id
    INTO v_business_id
    FROM public.print_jobs AS job
   WHERE job.id = p_job_id
     AND job.status = 'failed'
   FOR UPDATE;

  SELECT business.organization_id
    INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = v_business_id
     AND business.lifecycle_status NOT IN ('archived', 'retired');

  IF v_organization_id IS NULL
     OR NOT private.multibusiness_has_capability(
       'business.manage_catalog', v_organization_id, v_business_id
     ) THEN
    RAISE EXCEPTION 'No tienes permiso para reintentar esta impresión';
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
    RAISE EXCEPTION 'El trabajo no está disponible para reintento';
  END IF;
END;
$$;

ALTER TABLE public.push_notification_events
  ADD COLUMN IF NOT EXISTS business_id uuid;

UPDATE public.push_notification_events AS event
   SET business_id = order_row.business_id
  FROM public.orders AS order_row
 WHERE event.business_id IS NULL
   AND order_row.id = event.order_id;

ALTER TABLE public.push_notification_events
  ADD CONSTRAINT push_notification_events_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS push_notification_events_business_idx
  ON public.push_notification_events (business_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.businesses AS business
      JOIN public.organizations AS organization
        ON organization.id = business.organization_id
     WHERE organization.slug = 'rincon-404-food-park'
       AND business.slug = 'mideli'
       AND business.lifecycle_status NOT IN ('archived', 'retired')
  ) THEN
    IF EXISTS (
      SELECT 1
        FROM public.push_notification_events
       WHERE business_id IS NULL
    ) THEN
      RAISE EXCEPTION 'Hay eventos Push sin negocio';
    END IF;

    ALTER TABLE public.push_notification_events
      ALTER COLUMN business_id SET NOT NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_push_notification_event(
  p_event_key text,
  p_order_id uuid,
  p_topic text,
  p_transition_log_id uuid,
  p_business_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed_event_id uuid;
  order_business_id uuid;
BEGIN
  IF COALESCE(p_event_key, '') = '' OR p_order_id IS NULL THEN
    RAISE EXCEPTION 'Evento de aviso incompleto';
  END IF;

  IF p_topic NOT IN ('ready', 'kitchen') THEN
    RAISE EXCEPTION 'Tipo de aviso no válido';
  END IF;

  SELECT order_row.business_id
    INTO order_business_id
    FROM public.orders AS order_row
   WHERE order_row.id = p_order_id;

  IF order_business_id IS DISTINCT FROM p_business_id THEN
    RAISE EXCEPTION 'El aviso y el pedido no pertenecen al mismo negocio';
  END IF;

  INSERT INTO public.push_notification_events (
    event_key,
    order_id,
    business_id,
    transition_log_id,
    topic
  ) VALUES (
    p_event_key,
    p_order_id,
    p_business_id,
    p_transition_log_id,
    p_topic
  )
  ON CONFLICT (event_key)
  DO UPDATE SET
    status = 'processing',
    attempt_count = public.push_notification_events.attempt_count + 1,
    claimed_at = now(),
    completed_at = NULL,
    error_message = '',
    updated_at = now()
  WHERE public.push_notification_events.status = 'failed'
     OR (
       public.push_notification_events.status = 'processing'
       AND public.push_notification_events.claimed_at < now() - interval '2 minutes'
     )
  RETURNING id INTO claimed_event_id;

  RETURN claimed_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_push_notification_event(
  p_event_key text,
  p_order_id uuid,
  p_topic text,
  p_transition_log_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  order_business_id uuid;
BEGIN
  SELECT order_row.business_id
    INTO order_business_id
    FROM public.orders AS order_row
   WHERE order_row.id = p_order_id;

  RETURN public.claim_push_notification_event(
    p_event_key,
    p_order_id,
    p_topic,
    p_transition_log_id,
    order_business_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_print_job(text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_next_print_job(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_next_print_job(text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_print_job(text, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.finish_print_job(uuid, text, boolean, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_print_job(uuid, text, boolean, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.requeue_print_job(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.requeue_print_job(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.claim_push_notification_event(text, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_push_notification_event(text, uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_notification_event(text, uuid, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_push_notification_event(text, uuid, text, uuid, uuid)
  TO service_role;
