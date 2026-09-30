-- Per-business commercial licenses. The old singleton remains only as a
-- technical emergency switch; its date is no longer a commercial expiry.
-- This migration is forward-only. Recovery uses compensating migrations and
-- never deletes license records or operational data.

CREATE TABLE public.business_licenses (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  valid_until date NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT business_licenses_date_range CHECK (
    valid_until >= DATE '2000-01-01' AND valid_until <= DATE '9999-12-31'
  )
);

CREATE TABLE public.business_license_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (
    event_type IN ('activated', 'renewed', 'date_changed', 'suspended', 'reactivated', 'migrated')
  ),
  previous_status text CHECK (previous_status IS NULL OR previous_status IN ('active', 'suspended')),
  next_status text NOT NULL CHECK (next_status IN ('active', 'suspended')),
  previous_valid_until date,
  next_valid_until date NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX business_license_events_business_created_idx
  ON public.business_license_events (business_id, created_at DESC);

CREATE TABLE public.platform_emergency_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_status text NOT NULL CHECK (previous_status IN ('active', 'suspended')),
  next_status text NOT NULL CHECK (next_status IN ('active', 'suspended')),
  note text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_license_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_emergency_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_licenses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_license_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.platform_emergency_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.business_licenses TO service_role;
GRANT SELECT, INSERT ON TABLE public.business_license_events TO service_role;
GRANT SELECT, INSERT ON TABLE public.platform_emergency_events TO service_role;

COMMENT ON TABLE public.business_licenses IS
  'One independent manual license per business. Missing row means not activated.';
COMMENT ON TABLE public.business_license_events IS
  'Append-only history of business license changes; contains no billing amounts.';
COMMENT ON TABLE public.platform_emergency_events IS
  'Append-only audit for the Rincón 404 technical emergency switch.';

CREATE OR REPLACE FUNCTION private.reject_license_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LICENSE_HISTORY_APPEND_ONLY';
END;
$$;
REVOKE ALL ON FUNCTION private.reject_license_event_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER business_license_events_append_only
  BEFORE UPDATE OR DELETE ON public.business_license_events
  FOR EACH ROW EXECUTE FUNCTION private.reject_license_event_mutation();
CREATE TRIGGER platform_emergency_events_append_only
  BEFORE UPDATE OR DELETE ON public.platform_emergency_events
  FOR EACH ROW EXECUTE FUNCTION private.reject_license_event_mutation();

INSERT INTO public.capabilities (code, scope_type, description)
VALUES (
  'platform.manage_business_licenses',
  'platform',
  'Activar, renovar, suspender y consultar vigencias independientes por negocio'
)
ON CONFLICT (code) DO UPDATE
SET scope_type = EXCLUDED.scope_type,
    description = EXCLUDED.description,
    is_active = true,
    updated_at = now();

DO $$
DECLARE
  v_user_id uuid;
  v_membership_id uuid;
  v_count integer;
BEGIN
  SELECT id INTO v_user_id
    FROM auth.users
   WHERE lower(email) = 'rincon404@mideli.com';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la cuenta rincon404 para asignar la administración de licencias';
  END IF;

  SELECT count(*)::integer, (array_agg(membership.id))[1]
    INTO v_count, v_membership_id
    FROM public.memberships AS membership
    JOIN public.membership_capabilities AS grant_row
      ON grant_row.membership_id = membership.id
    JOIN public.capabilities AS capability
      ON capability.code = grant_row.capability_code
   WHERE membership.user_id = v_user_id
     AND membership.scope_type = 'platform'
     AND membership.status = 'active'
     AND grant_row.capability_code = 'platform.manage_businesses'
     AND grant_row.organization_id IS NULL
     AND grant_row.business_id IS NULL
     AND grant_row.revoked_at IS NULL
     AND capability.scope_type = 'platform'
     AND capability.is_active;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'La cuenta rincon404 debe tener exactamente una membresía activa de administración de plataforma';
  END IF;

  INSERT INTO public.membership_capabilities (
    membership_id, capability_code, granted_by, grant_reason
  )
  SELECT v_membership_id, 'platform.manage_business_licenses', v_user_id,
         'Capacidad exclusiva para administrar licencias por negocio'
   WHERE NOT EXISTS (
     SELECT 1 FROM public.membership_capabilities AS existing
      WHERE existing.membership_id = v_membership_id
        AND existing.capability_code = 'platform.manage_business_licenses'
        AND existing.organization_id IS NULL
        AND existing.business_id IS NULL
        AND existing.revoked_at IS NULL
   );
END;
$$;

CREATE OR REPLACE FUNCTION private.has_platform_license_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.memberships AS membership
      JOIN public.membership_capabilities AS grant_row
        ON grant_row.membership_id = membership.id
      JOIN public.capabilities AS capability
        ON capability.code = grant_row.capability_code
     WHERE membership.user_id = auth.uid()
       AND membership.scope_type = 'platform'
       AND membership.status = 'active'
       AND grant_row.capability_code = 'platform.manage_business_licenses'
       AND grant_row.organization_id IS NULL
       AND grant_row.business_id IS NULL
       AND grant_row.revoked_at IS NULL
       AND capability.scope_type = 'platform'
       AND capability.is_active
  );
$$;
REVOKE ALL ON FUNCTION private.has_platform_license_manager() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.business_license_term_is_current(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_business_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.businesses AS business
      JOIN public.business_licenses AS license
        ON license.business_id = business.id
      JOIN public.app_license AS emergency
        ON emergency.id = 1
     WHERE business.id = p_business_id
       AND emergency.status = 'active'
       AND license.status = 'active'
       AND license.valid_until >= (
         now() AT TIME ZONE CASE
           WHEN EXISTS (
             SELECT 1 FROM pg_catalog.pg_timezone_names AS zone
              WHERE zone.name = business.timezone
           ) THEN business.timezone
           ELSE 'America/Hermosillo'
         END
       )::date
  );
$$;
REVOKE ALL ON FUNCTION private.business_license_term_is_current(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.business_license_is_available(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.businesses AS business
     WHERE business.id = p_business_id
       AND business.lifecycle_status = 'active'
       AND private.business_license_term_is_current(business.id)
  );
$$;
REVOKE ALL ON FUNCTION private.business_license_is_available(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.business_license_allows_setup(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.business_license_is_available(p_business_id)
    OR EXISTS (
      SELECT 1
        FROM public.businesses AS business
        JOIN public.app_license AS emergency ON emergency.id = 1
       WHERE business.id = p_business_id
         AND business.lifecycle_status = 'draft'
         AND emergency.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM public.business_licenses AS license
            WHERE license.business_id = business.id
         )
    );
$$;
REVOKE ALL ON FUNCTION private.business_license_allows_setup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.business_license_allows_setup(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.add_license_calendar_months(p_start date, p_months integer)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_target_month date;
  v_last_day date;
BEGIN
  IF p_start IS NULL OR p_months IS NULL OR p_months NOT IN (1, 3, 6, 12) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LICENSE_INVALID_MONTHS';
  END IF;
  v_target_month := (
    date_trunc('month', p_start)::date + make_interval(months => p_months)
  )::date;
  v_last_day := ((v_target_month + interval '1 month')::date - 1);
  RETURN v_target_month + LEAST(
    EXTRACT(DAY FROM p_start)::integer - 1,
    EXTRACT(DAY FROM v_last_day)::integer - 1
  );
END;
$$;
REVOKE ALL ON FUNCTION private.add_license_calendar_months(date, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.hold_overdue_mideli_schedules()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mideli_id uuid;
  v_held integer := 0;
BEGIN
  SELECT business.id INTO v_mideli_id
    FROM public.businesses AS business
   WHERE business.slug = 'mideli'
   ORDER BY business.created_at
   LIMIT 1;
  IF v_mideli_id IS NULL OR NOT private.business_license_is_available(v_mideli_id) THEN
    RETURN 0;
  END IF;

  UPDATE public.orders
     SET schedule_status = 'review_required', updated_at = now()
   WHERE business_id = v_mideli_id
     AND source_channel = 'whatsapp'
     AND status = 'pending'
     AND schedule_status = 'scheduled'
     AND kitchen_release_at <= now()
     AND kitchen_released_at IS NULL;
  GET DIAGNOSTICS v_held = ROW_COUNT;
  RETURN v_held;
END;
$$;
REVOKE ALL ON FUNCTION private.hold_overdue_mideli_schedules() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.get_my_business_license_availability()
RETURNS TABLE (business_id uuid, is_available boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT context.business_id,
         private.business_license_is_available(context.business_id)
    FROM public.get_my_multibusiness_context() AS context
   WHERE auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION private.get_my_business_license_availability() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_my_business_license_availability() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_business_license_availability()
RETURNS TABLE (business_id uuid, is_available boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM private.get_my_business_license_availability();
$$;
REVOKE ALL ON FUNCTION public.get_my_business_license_availability() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_business_license_availability() TO authenticated;

CREATE OR REPLACE FUNCTION private.get_platform_business_licenses()
RETURNS TABLE (
  business_id uuid,
  organization_id uuid,
  slug text,
  display_name text,
  timezone text,
  lifecycle_status text,
  brand_logo_path text,
  brand_primary_color text,
  brand_accent_color text,
  license_status text,
  valid_until date,
  days_remaining integer,
  is_available boolean,
  global_emergency_suspended boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.has_platform_license_manager() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LICENSE_MANAGER_REQUIRED';
  END IF;

  RETURN QUERY
  SELECT business.id,
         business.organization_id,
         business.slug,
         business.display_name,
         business.timezone,
         business.lifecycle_status,
         business.brand_logo_path,
         business.brand_primary_color,
         business.brand_accent_color,
         CASE
           WHEN license.business_id IS NULL THEN 'unlicensed'
           WHEN license.status = 'suspended' THEN 'suspended'
           WHEN license.valid_until < local_clock.today THEN 'expired'
           WHEN license.valid_until <= local_clock.today + 7 THEN 'expiring'
           ELSE 'active'
         END,
         license.valid_until,
         CASE WHEN license.business_id IS NULL THEN NULL
              ELSE license.valid_until - local_clock.today END,
         private.business_license_is_available(business.id),
         emergency.status = 'suspended'
    FROM public.businesses AS business
    LEFT JOIN public.business_licenses AS license
      ON license.business_id = business.id
    CROSS JOIN public.app_license AS emergency
    CROSS JOIN LATERAL (
      SELECT (now() AT TIME ZONE CASE
        WHEN EXISTS (
          SELECT 1 FROM pg_catalog.pg_timezone_names AS zone
           WHERE zone.name = business.timezone
        ) THEN business.timezone
        ELSE 'America/Hermosillo'
      END)::date AS today
    ) AS local_clock
   WHERE emergency.id = 1
     AND business.lifecycle_status <> 'retired'
   ORDER BY business.display_name, business.created_at;
END;
$$;
REVOKE ALL ON FUNCTION private.get_platform_business_licenses() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_platform_business_licenses() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_platform_business_licenses()
RETURNS TABLE (
  business_id uuid,
  organization_id uuid,
  slug text,
  display_name text,
  timezone text,
  lifecycle_status text,
  brand_logo_path text,
  brand_primary_color text,
  brand_accent_color text,
  license_status text,
  valid_until date,
  days_remaining integer,
  is_available boolean,
  global_emergency_suspended boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM private.get_platform_business_licenses();
$$;
REVOKE ALL ON FUNCTION public.get_platform_business_licenses() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_business_licenses() TO authenticated;

CREATE OR REPLACE FUNCTION private.get_platform_business_license_events(p_business_id uuid)
RETURNS TABLE (
  id uuid,
  actor_name text,
  event_type text,
  previous_status text,
  next_status text,
  previous_valid_until date,
  next_valid_until date,
  note text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.has_platform_license_manager() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LICENSE_MANAGER_REQUIRED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = p_business_id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LICENSE_BUSINESS_NOT_FOUND';
  END IF;

  RETURN QUERY
  SELECT event.id,
         COALESCE(profile.full_name, 'Cuenta desactivada'),
         event.event_type,
         event.previous_status,
         event.next_status,
         event.previous_valid_until,
         event.next_valid_until,
         event.note,
         event.created_at
    FROM public.business_license_events AS event
    LEFT JOIN public.profiles AS profile ON profile.id = event.actor_user_id
   WHERE event.business_id = p_business_id
   ORDER BY event.created_at DESC
   LIMIT 100;
END;
$$;
REVOKE ALL ON FUNCTION private.get_platform_business_license_events(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_platform_business_license_events(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_platform_business_license_events(p_business_id uuid)
RETURNS TABLE (
  id uuid,
  actor_name text,
  event_type text,
  previous_status text,
  next_status text,
  previous_valid_until date,
  next_valid_until date,
  note text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM private.get_platform_business_license_events(p_business_id);
$$;
REVOKE ALL ON FUNCTION public.get_platform_business_license_events(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_business_license_events(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.manage_platform_business_license(
  p_business_id uuid,
  p_operation text,
  p_months integer DEFAULT NULL,
  p_target_date date DEFAULT NULL,
  p_note text DEFAULT ''
)
RETURNS public.business_licenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_timezone text;
  v_lifecycle text;
  v_today date;
  v_current public.business_licenses%ROWTYPE;
  v_next public.business_licenses%ROWTYPE;
  v_previous_available boolean := false;
  v_event text;
  v_date date;
  v_status text;
  v_note text := btrim(COALESCE(p_note, ''));
BEGIN
  IF v_actor_id IS NULL OR NOT private.has_platform_license_manager() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LICENSE_MANAGER_REQUIRED';
  END IF;
  IF p_business_id IS NULL OR p_operation NOT IN ('activate', 'renew', 'set_date', 'suspend', 'reactivate') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LICENSE_INVALID_OPERATION';
  END IF;
  IF char_length(v_note) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LICENSE_NOTE_TOO_LONG';
  END IF;

  SELECT business.timezone, business.lifecycle_status
    INTO v_timezone, v_lifecycle
    FROM public.businesses AS business
   WHERE business.id = p_business_id
   FOR UPDATE;
  IF v_timezone IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LICENSE_BUSINESS_NOT_FOUND';
  END IF;
  IF v_lifecycle IN ('archived', 'retired') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LICENSE_BUSINESS_NOT_OPERABLE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_timezone) THEN
    v_timezone := 'America/Hermosillo';
  END IF;
  v_today := (now() AT TIME ZONE v_timezone)::date;

  SELECT * INTO v_current
    FROM public.business_licenses
   WHERE business_id = p_business_id
   FOR UPDATE;
  v_previous_available := private.business_license_is_available(p_business_id);

  CASE p_operation
    WHEN 'activate' THEN
      IF v_current.business_id IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LICENSE_ALREADY_ASSIGNED';
      END IF;
      IF v_lifecycle NOT IN ('draft', 'paused') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LICENSE_REQUIRES_INACTIVE_BUSINESS';
      END IF;
      IF p_target_date IS NOT NULL THEN
        v_date := p_target_date;
      ELSE
        IF p_months IS NULL OR p_months NOT IN (1, 3, 6, 12) THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LICENSE_INVALID_MONTHS';
        END IF;
        v_date := private.add_license_calendar_months(v_today, p_months);
      END IF;
      v_status := 'active';
      v_event := 'activated';
      INSERT INTO public.business_licenses (
        business_id, status, valid_until, activated_at, updated_by
      ) VALUES (p_business_id, v_status, v_date, now(), v_actor_id)
      RETURNING * INTO v_next;

    WHEN 'renew' THEN
      IF v_current.business_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LICENSE_NOT_ASSIGNED';
      END IF;
      IF p_months IS NULL OR p_months NOT IN (1, 3, 6, 12) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LICENSE_INVALID_MONTHS';
      END IF;
      v_date := private.add_license_calendar_months(
        GREATEST(v_current.valid_until, v_today), p_months
      );
      v_event := 'renewed';
      UPDATE public.business_licenses
         SET valid_until = v_date, updated_at = now(), updated_by = v_actor_id
       WHERE business_id = p_business_id
      RETURNING * INTO v_next;

    WHEN 'set_date' THEN
      IF v_current.business_id IS NULL OR p_target_date IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LICENSE_TARGET_DATE_REQUIRED';
      END IF;
      v_date := p_target_date;
      v_event := 'date_changed';
      UPDATE public.business_licenses
         SET valid_until = v_date, updated_at = now(), updated_by = v_actor_id
       WHERE business_id = p_business_id
      RETURNING * INTO v_next;

    WHEN 'suspend' THEN
      IF v_current.business_id IS NULL OR v_current.status = 'suspended' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LICENSE_NOT_ACTIVE';
      END IF;
      IF v_note = '' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LICENSE_NOTE_REQUIRED';
      END IF;
      v_event := 'suspended';
      UPDATE public.business_licenses
         SET status = 'suspended', updated_at = now(), updated_by = v_actor_id
       WHERE business_id = p_business_id
      RETURNING * INTO v_next;

    WHEN 'reactivate' THEN
      IF v_current.business_id IS NULL OR v_current.status <> 'suspended' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LICENSE_NOT_SUSPENDED';
      END IF;
      IF v_current.valid_until < v_today THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LICENSE_RENEWAL_REQUIRED';
      END IF;
      v_event := 'reactivated';
      UPDATE public.business_licenses
         SET status = 'active', updated_at = now(), updated_by = v_actor_id
       WHERE business_id = p_business_id
      RETURNING * INTO v_next;
  END CASE;

  INSERT INTO public.business_license_events (
    business_id, actor_user_id, event_type, previous_status, next_status,
    previous_valid_until, next_valid_until, note
  ) VALUES (
    p_business_id, v_actor_id, v_event,
    NULLIF(v_current.status, ''), v_next.status,
    v_current.valid_until, v_next.valid_until, v_note
  );

  IF NOT v_previous_available
     AND private.business_license_is_available(p_business_id)
     AND EXISTS (SELECT 1 FROM public.businesses WHERE id = p_business_id AND slug = 'mideli') THEN
    PERFORM private.hold_overdue_mideli_schedules();
  END IF;
  RETURN v_next;
END;
$$;
REVOKE ALL ON FUNCTION private.manage_platform_business_license(uuid, text, integer, date, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.manage_platform_business_license(uuid, text, integer, date, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.manage_platform_business_license(
  p_business_id uuid,
  p_operation text,
  p_months integer DEFAULT NULL,
  p_target_date date DEFAULT NULL,
  p_note text DEFAULT ''
)
RETURNS public.business_licenses
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.manage_platform_business_license(
    p_business_id, p_operation, p_months, p_target_date, p_note
  );
$$;
REVOKE ALL ON FUNCTION public.manage_platform_business_license(uuid, text, integer, date, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_platform_business_license(uuid, text, integer, date, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION private.set_platform_emergency_suspension(
  p_suspended boolean,
  p_note text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_previous text;
  v_next text;
  v_note text := btrim(COALESCE(p_note, ''));
BEGIN
  IF v_actor_id IS NULL OR NOT private.has_platform_license_manager() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LICENSE_MANAGER_REQUIRED';
  END IF;
  IF char_length(v_note) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LICENSE_NOTE_REQUIRED';
  END IF;

  SELECT status INTO v_previous FROM public.app_license WHERE id = 1 FOR UPDATE;
  IF v_previous IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'LICENSE_SYSTEM_CONTROL_UNAVAILABLE';
  END IF;
  v_next := CASE WHEN p_suspended THEN 'suspended' ELSE 'active' END;
  IF v_previous = v_next THEN RETURN v_next; END IF;

  UPDATE public.app_license SET status = v_next, updated_at = now() WHERE id = 1;
  INSERT INTO public.platform_emergency_events (
    actor_user_id, previous_status, next_status, note
  ) VALUES (v_actor_id, v_previous, v_next, v_note);

  IF v_next = 'active' THEN
    PERFORM private.hold_overdue_mideli_schedules();
  END IF;
  RETURN v_next;
END;
$$;
REVOKE ALL ON FUNCTION private.set_platform_emergency_suspension(boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.set_platform_emergency_suspension(boolean, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.set_platform_emergency_suspension(
  p_suspended boolean,
  p_note text
)
RETURNS text
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.set_platform_emergency_suspension(p_suspended, p_note);
$$;
REVOKE ALL ON FUNCTION public.set_platform_emergency_suspension(boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_platform_emergency_suspension(boolean, text)
  TO authenticated;

-- Disable the old service-role commercial renewal RPC. Emergency suspension
-- is now exposed only through the dedicated platform capability above.
CREATE OR REPLACE FUNCTION public.vendor_update_app_license(
  p_operation text,
  p_months integer DEFAULT NULL,
  p_target_date date DEFAULT NULL,
  p_reason text DEFAULT '',
  p_payment_reference text DEFAULT ''
)
RETURNS public.app_license
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MIDELI_LICENSE_LEGACY_DISABLED';
END;
$$;
REVOKE ALL ON FUNCTION public.vendor_update_app_license(text, integer, date, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
