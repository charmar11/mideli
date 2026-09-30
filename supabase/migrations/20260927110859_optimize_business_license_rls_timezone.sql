-- Validate a business timezone when it is written, not once per row read by
-- the license RLS policies. pg_timezone_names is a set-returning catalog view;
-- probing it from the license predicate multiplied the scan cost by every menu
-- product and order row (81 menu items took over 6 seconds in production).
CREATE OR REPLACE FUNCTION private.validate_business_timezone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.timezone IS NULL
     OR pg_catalog.btrim(NEW.timezone) = ''
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_timezone_names AS zone
        WHERE zone.name = NEW.timezone
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BUSINESS_INVALID_TIMEZONE';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_business_timezone()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS businesses_validate_timezone_before_write
  ON public.businesses;
CREATE TRIGGER businesses_validate_timezone_before_write
  BEFORE INSERT OR UPDATE OF timezone ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_business_timezone();

-- Existing businesses were verified to use valid IANA timezone names. The
-- trigger above keeps that invariant true for every future create or edit.
-- This makes the per-row RLS predicate a single indexed license lookup instead
-- of repeatedly scanning pg_timezone_names.
CREATE OR REPLACE FUNCTION private.business_license_term_is_current(
  p_business_id uuid
)
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
         now() AT TIME ZONE business.timezone
       )::date
  );
$$;

REVOKE ALL ON FUNCTION private.business_license_term_is_current(uuid)
  FROM PUBLIC, anon, authenticated;
