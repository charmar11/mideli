-- Avoid a PL/pgSQL output-parameter collision: RETURNS TABLE exposes `id`.
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
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses AS business WHERE business.id = p_business_id
  ) THEN
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
