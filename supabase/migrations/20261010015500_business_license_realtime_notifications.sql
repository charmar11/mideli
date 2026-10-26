-- Notify authorized sessions as soon as an individual business license changes.
-- Only business ID and availability are broadcast; payment notes and dates stay private.

CREATE POLICY business_license_private_channel_read
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    private.multibusiness_can_view_business(
      substring(
        realtime.topic()
        FROM '^business:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):license$'
      )::uuid
    )
  );

CREATE OR REPLACE FUNCTION private.publish_business_license_availability(
  p_business_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_business_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM realtime.send(
    pg_catalog.jsonb_build_object(
      'business_id', p_business_id,
      'is_available', private.business_license_is_available(p_business_id)
    ),
    'license_changed',
    'business:' || p_business_id::text || ':license',
    true
  );
END;
$$;
REVOKE ALL ON FUNCTION private.publish_business_license_availability(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.on_business_license_row_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM private.publish_business_license_availability(OLD.business_id);
  ELSE
    PERFORM private.publish_business_license_availability(NEW.business_id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.on_business_license_row_changed()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.on_business_lifecycle_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.publish_business_license_availability(NEW.id);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.on_business_lifecycle_changed()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS business_licenses_broadcast_insert_delete
  ON public.business_licenses;
CREATE TRIGGER business_licenses_broadcast_insert_delete
  AFTER INSERT OR DELETE ON public.business_licenses
  FOR EACH ROW
  EXECUTE FUNCTION private.on_business_license_row_changed();

DROP TRIGGER IF EXISTS business_licenses_broadcast_update
  ON public.business_licenses;
CREATE TRIGGER business_licenses_broadcast_update
  AFTER UPDATE OF status, valid_until ON public.business_licenses
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.valid_until IS DISTINCT FROM NEW.valid_until
  )
  EXECUTE FUNCTION private.on_business_license_row_changed();

DROP TRIGGER IF EXISTS businesses_broadcast_license_availability
  ON public.businesses;
CREATE TRIGGER businesses_broadcast_license_availability
  AFTER UPDATE OF lifecycle_status ON public.businesses
  FOR EACH ROW
  WHEN (OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status)
  EXECUTE FUNCTION private.on_business_lifecycle_changed();
