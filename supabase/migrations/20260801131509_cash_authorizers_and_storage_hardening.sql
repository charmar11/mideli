DROP POLICY IF EXISTS "Menu product images are publicly readable" ON storage.objects;

CREATE OR REPLACE FUNCTION private.list_cash_authorizers()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := private.active_profile_role();
  v_result jsonb;
BEGIN
  IF v_role NOT IN ('owner', 'admin', 'waiter', 'supervisor') THEN
    RAISE EXCEPTION 'No tienes permiso para consultar autorizadores de caja';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', profile.id,
    'full_name', profile.full_name,
    'role', profile.role,
    'pin_configured', pin.user_id IS NOT NULL
  ) ORDER BY
    CASE profile.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
    profile.full_name
  ), '[]'::jsonb)
  INTO v_result
  FROM public.profiles AS profile
  LEFT JOIN private.staff_authorization_pins AS pin ON pin.user_id = profile.id
  WHERE profile.is_active
    AND profile.role IN ('owner', 'admin', 'supervisor');

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_cash_authorizers()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.list_cash_authorizers();
$$;

REVOKE ALL ON FUNCTION private.list_cash_authorizers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.list_cash_authorizers() TO authenticated;
REVOKE ALL ON FUNCTION public.list_cash_authorizers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_cash_authorizers() TO authenticated;
