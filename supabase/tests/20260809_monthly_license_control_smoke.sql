BEGIN;

DELETE FROM public.license_control_events;
DELETE FROM public.license_control_credentials;

DO $$
DECLARE
  credential_version integer;
  locked_until_value timestamptz;
BEGIN
  SELECT public.vendor_store_license_credential(
    repeat('a', 128),
    repeat('b', 32),
    'create'
  ) INTO credential_version;

  IF credential_version <> 1 THEN
    RAISE EXCEPTION 'Unexpected credential version: %', credential_version;
  END IF;

  PERFORM public.vendor_record_license_login_attempt(false);
  PERFORM public.vendor_record_license_login_attempt(false);
  PERFORM public.vendor_record_license_login_attempt(false);
  PERFORM public.vendor_record_license_login_attempt(false);
  PERFORM public.vendor_record_license_login_attempt(false);

  SELECT locked_until
  INTO locked_until_value
  FROM public.license_control_credentials
  WHERE id = 1;

  IF locked_until_value IS NULL THEN
    RAISE EXCEPTION 'Five failed attempts did not lock access';
  END IF;

  PERFORM public.vendor_update_app_license('renew', 1, NULL, NULL, 'smoke');
  PERFORM public.vendor_update_app_license(
    'suspend',
    NULL,
    NULL,
    'Prueba transaccional',
    NULL
  );

  BEGIN
    UPDATE public.owner_report_settings
    SET updated_at = now()
    WHERE id = 1;
    RAISE EXCEPTION 'Inactive license did not block writes';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'MIDELI_LICENSE_INACTIVE' THEN
        RAISE;
      END IF;
  END;

  PERFORM public.vendor_update_app_license('reactivate', NULL, NULL, NULL, NULL);

  UPDATE public.owner_report_settings
  SET updated_at = now()
  WHERE id = 1;
END;
$$;

ROLLBACK;
