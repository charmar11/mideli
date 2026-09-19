-- Keep staff authorization PINs inside the operator's real business scope.
-- The legacy role check remains part of the contract, but it is no longer
-- sufficient once memberships exist because profile.role is global history.

CREATE OR REPLACE FUNCTION private.set_staff_authorization_pin(
  p_user_id uuid,
  p_pin text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := (SELECT auth.uid());
  v_caller_role text := public.get_user_role();
  v_target_role text;
BEGIN
  IF v_caller_id IS NULL OR v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'No tienes permiso para configurar PIN de autorización';
  END IF;

  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'El PIN debe tener exactamente 4 dígitos';
  END IF;

  SELECT profile.role
    INTO v_target_role
    FROM public.profiles AS profile
   WHERE profile.id = p_user_id
     AND profile.is_active;

  IF v_target_role NOT IN ('owner', 'admin', 'supervisor') THEN
    RAISE EXCEPTION 'Solo dueño, administradores y supervisores pueden tener PIN';
  END IF;

  IF v_target_role = 'owner'
     AND v_caller_role <> 'owner'
     AND p_user_id <> v_caller_id THEN
    RAISE EXCEPTION 'Solo el dueño puede configurar el PIN de otro dueño';
  END IF;

  -- A membership is the source of truth after the multibusiness foundation.
  -- A business owner may configure credentials for staff in that business;
  -- a platform manager may do so globally. No profile-only lookup can cross
  -- into another business anymore.
  IF NOT EXISTS (
    SELECT 1
      FROM public.memberships AS target_membership
     WHERE target_membership.user_id = p_user_id
       AND target_membership.status = 'active'
       AND target_membership.business_id IS NOT NULL
       AND (
         private.multibusiness_has_capability(
           'platform.manage_businesses', NULL, NULL
         )
         OR private.multibusiness_has_capability(
           'business.manage_staff',
           target_membership.organization_id,
           target_membership.business_id
         )
       )
  ) THEN
    RAISE EXCEPTION 'La cuenta no pertenece a un negocio que puedas administrar';
  END IF;

  INSERT INTO private.staff_authorization_pins (
    user_id,
    pin_hash,
    failed_attempts,
    locked_until,
    updated_by,
    updated_at
  )
  VALUES (
    p_user_id,
    extensions.crypt(p_pin, extensions.gen_salt('bf')),
    0,
    NULL,
    v_caller_id,
    now()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    pin_hash = EXCLUDED.pin_hash,
    failed_attempts = 0,
    locked_until = NULL,
    updated_by = v_caller_id,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION private.set_staff_authorization_pin(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.set_staff_authorization_pin(uuid, text)
  TO authenticated;
