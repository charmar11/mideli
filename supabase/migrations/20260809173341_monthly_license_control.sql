-- Monthly vendor-controlled license, private credential storage, and a
-- database-level write gate for inactive installations.

CREATE TABLE public.license_control_credentials (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  password_hash text NOT NULL CHECK (char_length(password_hash) = 128),
  password_salt text NOT NULL CHECK (char_length(password_salt) = 32),
  credential_version integer NOT NULL DEFAULT 1 CHECK (credential_version > 0),
  failed_attempts smallint NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.license_control_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (
    event_type IN (
      'credential_created',
      'credential_changed',
      'credential_recovered',
      'access_locked',
      'license_renewed',
      'license_date_changed',
      'license_suspended',
      'license_reactivated'
    )
  ),
  previous_status text CHECK (previous_status IS NULL OR previous_status IN ('active', 'suspended')),
  next_status text CHECK (next_status IS NULL OR next_status IN ('active', 'suspended')),
  previous_valid_until timestamptz,
  next_valid_until timestamptz,
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 500),
  payment_reference text NOT NULL DEFAULT '' CHECK (char_length(payment_reference) <= 160),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX license_control_events_created_at_idx
  ON public.license_control_events (created_at DESC);

ALTER TABLE public.license_control_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_control_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.license_control_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.license_control_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.license_control_credentials TO service_role;
GRANT SELECT, INSERT ON TABLE public.license_control_events TO service_role;

COMMENT ON TABLE public.license_control_credentials IS
  'Server-only singleton containing the vendor password hash and lockout state.';
COMMENT ON TABLE public.license_control_events IS
  'Append-only audit history for vendor credential and license operations.';

-- Preserve the paid date while normalizing the historical timestamp to the
-- end of that calendar day in Hermosillo.
UPDATE public.app_license
SET
  valid_until = (
    (
      ((valid_until AT TIME ZONE 'America/Hermosillo')::date + 1)::timestamp
      AT TIME ZONE 'America/Hermosillo'
    ) - interval '1 millisecond'
  ),
  updated_at = now()
WHERE id = 1;

-- Email delivery stays explicitly disabled until a verified sender exists.
UPDATE public.owner_report_settings
SET enabled = false, updated_at = now()
WHERE id = 1 AND enabled = true;

CREATE OR REPLACE FUNCTION private.is_app_license_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_license
    WHERE id = 1
      AND status = 'active'
      AND valid_until > now()
  );
$$;

REVOKE ALL ON FUNCTION private.is_app_license_active() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.enforce_app_license_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_app_license_active() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MIDELI_LICENSE_INACTIVE';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_app_license_active() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'cash_movements',
    'cash_shift_adjustments',
    'cash_shift_pending_orders',
    'cash_shifts',
    'categories',
    'inventory_count_lines',
    'inventory_counts',
    'inventory_items',
    'inventory_lots',
    'inventory_movements',
    'inventory_purchase_order_lines',
    'inventory_purchase_orders',
    'inventory_receipt_lines',
    'inventory_receipts',
    'inventory_recipes',
    'menu_items',
    'order_folio_counter',
    'order_items',
    'order_status_log',
    'orders',
    'owner_daily_report_runs',
    'owner_report_settings',
    'payment_item_allocations',
    'payment_order_allocations',
    'payment_tender_method_changes',
    'payment_tenders',
    'payment_transactions',
    'print_jobs',
    'print_station_settings',
    'profiles',
    'push_subscriptions',
    'restaurant_tables',
    'table_map_labels',
    'table_zones',
    'user_onboarding_progress'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS aaa_enforce_app_license_write ON public.%I',
      target_table
    );
    EXECUTE format(
      'CREATE TRIGGER aaa_enforce_app_license_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION private.enforce_app_license_active()',
      target_table
    );
  END LOOP;
END;
$$;

-- Storage policies are permissive by default. A restrictive policy adds the
-- license requirement without changing the existing owner/admin checks.
DROP POLICY IF EXISTS "Active license required for menu image inserts" ON storage.objects;
CREATE POLICY "Active license required for menu image inserts"
  ON storage.objects
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id <> 'menu-product-images'
    OR EXISTS (
      SELECT 1
      FROM public.app_license
      WHERE id = 1 AND status = 'active' AND valid_until > now()
    )
  );

DROP POLICY IF EXISTS "Active license required for menu image updates" ON storage.objects;
CREATE POLICY "Active license required for menu image updates"
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id <> 'menu-product-images'
    OR EXISTS (
      SELECT 1
      FROM public.app_license
      WHERE id = 1 AND status = 'active' AND valid_until > now()
    )
  )
  WITH CHECK (
    bucket_id <> 'menu-product-images'
    OR EXISTS (
      SELECT 1
      FROM public.app_license
      WHERE id = 1 AND status = 'active' AND valid_until > now()
    )
  );

DROP POLICY IF EXISTS "Active license required for menu image deletes" ON storage.objects;
CREATE POLICY "Active license required for menu image deletes"
  ON storage.objects
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (
    bucket_id <> 'menu-product-images'
    OR EXISTS (
      SELECT 1
      FROM public.app_license
      WHERE id = 1 AND status = 'active' AND valid_until > now()
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_license'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_license;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.hermosillo_end_of_day(target_date date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT (
    ((target_date + 1)::timestamp AT TIME ZONE 'America/Hermosillo')
    - interval '1 millisecond'
  );
$$;

REVOKE ALL ON FUNCTION private.hermosillo_end_of_day(date) FROM PUBLIC, anon, authenticated;

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
DECLARE
  current_license public.app_license%ROWTYPE;
  updated_license public.app_license%ROWTYPE;
  next_status text;
  next_valid_until timestamptz;
  base_date date;
  event_type text;
  clean_reason text := left(trim(COALESCE(p_reason, '')), 500);
  clean_reference text := left(trim(COALESCE(p_payment_reference, '')), 160);
BEGIN
  SELECT *
  INTO current_license
  FROM public.app_license
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MIDELI_LICENSE_NOT_CONFIGURED';
  END IF;

  next_status := current_license.status;
  next_valid_until := current_license.valid_until;

  CASE p_operation
    WHEN 'renew' THEN
      IF p_months IS NULL OR p_months NOT IN (1, 3, 6, 12) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MIDELI_LICENSE_INVALID_MONTHS';
      END IF;

      base_date := CASE
        WHEN current_license.valid_until > now()
          THEN (current_license.valid_until AT TIME ZONE 'America/Hermosillo')::date
        ELSE (now() AT TIME ZONE 'America/Hermosillo')::date
      END;
      next_valid_until := private.hermosillo_end_of_day(
        (base_date + make_interval(months => p_months))::date
      );
      next_status := 'active';
      event_type := 'license_renewed';

    WHEN 'set_date' THEN
      IF p_target_date IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MIDELI_LICENSE_INVALID_DATE';
      END IF;
      next_valid_until := private.hermosillo_end_of_day(p_target_date);
      IF next_valid_until <= now() THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MIDELI_LICENSE_INVALID_DATE';
      END IF;
      next_status := 'active';
      event_type := 'license_date_changed';

    WHEN 'suspend' THEN
      IF clean_reason = '' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MIDELI_LICENSE_REASON_REQUIRED';
      END IF;
      next_status := 'suspended';
      event_type := 'license_suspended';

    WHEN 'reactivate' THEN
      IF current_license.valid_until <= now() THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MIDELI_LICENSE_RENEWAL_REQUIRED';
      END IF;
      next_status := 'active';
      event_type := 'license_reactivated';

    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MIDELI_LICENSE_INVALID_OPERATION';
  END CASE;

  UPDATE public.app_license
  SET
    status = next_status,
    valid_until = next_valid_until,
    updated_at = now()
  WHERE id = 1
  RETURNING * INTO updated_license;

  INSERT INTO public.license_control_events (
    event_type,
    previous_status,
    next_status,
    previous_valid_until,
    next_valid_until,
    reason,
    payment_reference
  ) VALUES (
    event_type,
    current_license.status,
    updated_license.status,
    current_license.valid_until,
    updated_license.valid_until,
    clean_reason,
    clean_reference
  );

  RETURN updated_license;
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_update_app_license(text, integer, date, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_update_app_license(text, integer, date, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.vendor_store_license_credential(
  p_password_hash text,
  p_password_salt text,
  p_mode text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_credential public.license_control_credentials%ROWTYPE;
  next_version integer;
  event_type text;
BEGIN
  IF char_length(p_password_hash) <> 128 OR char_length(p_password_salt) <> 32 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MIDELI_LICENSE_INVALID_CREDENTIAL';
  END IF;

  SELECT *
  INTO current_credential
  FROM public.license_control_credentials
  WHERE id = 1
  FOR UPDATE;

  IF p_mode = 'create' THEN
    IF FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MIDELI_LICENSE_CREDENTIAL_EXISTS';
    END IF;

    INSERT INTO public.license_control_credentials (
      id,
      password_hash,
      password_salt
    ) VALUES (
      1,
      p_password_hash,
      p_password_salt
    )
    RETURNING credential_version INTO next_version;
    event_type := 'credential_created';
  ELSE
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MIDELI_LICENSE_CREDENTIAL_MISSING';
    END IF;
    IF p_mode NOT IN ('change', 'recover') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MIDELI_LICENSE_INVALID_CREDENTIAL_MODE';
    END IF;

    UPDATE public.license_control_credentials
    SET
      password_hash = p_password_hash,
      password_salt = p_password_salt,
      credential_version = credential_version + 1,
      failed_attempts = 0,
      locked_until = NULL,
      password_changed_at = now(),
      updated_at = now()
    WHERE id = 1
    RETURNING credential_version INTO next_version;
    event_type := CASE p_mode
      WHEN 'change' THEN 'credential_changed'
      ELSE 'credential_recovered'
    END;
  END IF;

  INSERT INTO public.license_control_events (event_type)
  VALUES (event_type);

  RETURN next_version;
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_store_license_credential(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_store_license_credential(text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.vendor_record_license_login_attempt(p_success boolean)
RETURNS TABLE (failed_attempts smallint, locked_until timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_credential public.license_control_credentials%ROWTYPE;
  next_attempts smallint;
  next_locked_until timestamptz;
BEGIN
  SELECT *
  INTO current_credential
  FROM public.license_control_credentials
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MIDELI_LICENSE_CREDENTIAL_MISSING';
  END IF;

  IF p_success THEN
    next_attempts := 0;
    next_locked_until := NULL;
  ELSE
    next_attempts := CASE
      WHEN current_credential.locked_until IS NOT NULL
        AND current_credential.locked_until <= now() THEN 1
      ELSE current_credential.failed_attempts + 1
    END;
    next_locked_until := CASE
      WHEN next_attempts >= 5 THEN now() + interval '15 minutes'
      ELSE NULL
    END;
  END IF;

  UPDATE public.license_control_credentials
  SET
    failed_attempts = next_attempts,
    locked_until = next_locked_until,
    updated_at = now()
  WHERE id = 1;

  IF NOT p_success AND next_locked_until IS NOT NULL THEN
    INSERT INTO public.license_control_events (event_type, reason)
    VALUES ('access_locked', 'Cinco intentos incorrectos');
  END IF;

  RETURN QUERY SELECT next_attempts, next_locked_until;
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_record_license_login_attempt(boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_record_license_login_attempt(boolean)
  TO service_role;
