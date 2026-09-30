-- Avoid PL/pgSQL variable/column ambiguity while assigning local staff access.
CREATE OR REPLACE FUNCTION public.create_business_staff_membership(
  p_user_id uuid,
  p_business_id uuid,
  p_role_code text,
  p_must_change_password boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
DECLARE
  caller_id uuid := auth.uid();
  v_organization_id uuid;
  membership_id uuid;
  existing_status text;
  action_name text := 'created';
  capability_code text;
BEGIN
  IF caller_id IS NULL OR p_user_id IS NULL OR p_business_id IS NULL THEN
    RAISE EXCEPTION 'Faltan datos para crear el acceso';
  END IF;

  IF p_user_id = caller_id THEN
    RAISE EXCEPTION 'No puedes asignarte como personal';
  END IF;

  IF p_role_code NOT IN ('local_waiter', 'local_kitchen', 'local_supervisor') THEN
    RAISE EXCEPTION 'El rol local no es válido';
  END IF;

  SELECT business.organization_id
    INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.lifecycle_status = 'active';

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'El negocio no está disponible';
  END IF;

  IF NOT private.multibusiness_can_manage_membership(
    'business', v_organization_id, p_business_id, p_role_code
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para administrar personal de este negocio';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users AS app_user WHERE app_user.id = p_user_id) THEN
    RAISE EXCEPTION 'La cuenta de acceso no existe';
  END IF;

  SELECT membership.id, membership.status
    INTO membership_id, existing_status
    FROM public.memberships AS membership
   WHERE membership.user_id = p_user_id
     AND membership.scope_type = 'business'
     AND membership.organization_id = v_organization_id
     AND membership.business_id = p_business_id
     AND membership.role_code = p_role_code
   FOR UPDATE;

  IF existing_status = 'active' THEN
    RAISE EXCEPTION 'La cuenta ya tiene este acceso activo';
  ELSIF membership_id IS NOT NULL THEN
    action_name := 'reactivated';
    UPDATE public.memberships
       SET status = 'active',
           must_change_password = p_must_change_password,
           deactivated_by = NULL,
           deactivated_at = NULL,
           deactivation_reason = NULL,
           updated_at = now()
     WHERE id = membership_id;
  ELSE
    INSERT INTO public.memberships (
      user_id,
      scope_type,
      organization_id,
      business_id,
      role_code,
      status,
      must_change_password,
      created_by
    ) VALUES (
      p_user_id,
      'business',
      v_organization_id,
      p_business_id,
      p_role_code,
      'active',
      p_must_change_password,
      caller_id
    )
    RETURNING id INTO membership_id;
  END IF;

  FOREACH capability_code IN ARRAY private.multibusiness_staff_capability_codes(p_role_code)
  LOOP
    INSERT INTO public.membership_capabilities (
      membership_id,
      capability_code,
      organization_id,
      business_id,
      granted_by,
      grant_reason
    ) VALUES (
      membership_id,
      capability_code,
      v_organization_id,
      p_business_id,
      caller_id,
      'Permisos derivados del rol local ' || p_role_code
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  INSERT INTO public.audit_events (
    actor_user_id,
    organization_id,
    business_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  ) VALUES (
    caller_id,
    v_organization_id,
    p_business_id,
    action_name,
    'membership',
    membership_id,
    'Acceso local administrado por el dueño del negocio',
    jsonb_build_object('role_code', p_role_code, 'user_id', p_user_id)
  );

  RETURN membership_id;
END;
$$;
