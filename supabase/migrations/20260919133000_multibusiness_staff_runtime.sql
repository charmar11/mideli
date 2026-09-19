-- Give business owners and the organization coordinator audited staff
-- operations. Auth users are still created by the server action; these RPCs
-- attach an existing auth user to the correct scope and grant only the
-- capabilities implied by the selected role.

CREATE OR REPLACE FUNCTION private.multibusiness_staff_capability_codes(
  p_role_code text
)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_role_code
    WHEN 'global_waiter' THEN ARRAY[
      'organization.operate_orders',
      'organization.charge_orders'
    ]::text[]
    WHEN 'local_waiter' THEN ARRAY[
      'business.operate_orders',
      'business.charge_orders'
    ]::text[]
    WHEN 'local_kitchen' THEN ARRAY[
      'business.update_preparation'
    ]::text[]
    WHEN 'local_supervisor' THEN ARRAY[
      'business.operate_orders',
      'business.update_preparation',
      'business.charge_orders'
    ]::text[]
    ELSE ARRAY[]::text[]
  END;
$$;

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
  organization_id uuid;
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
    INTO organization_id
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.lifecycle_status = 'active';

  IF organization_id IS NULL THEN
    RAISE EXCEPTION 'El negocio no está disponible';
  END IF;

  IF NOT private.multibusiness_can_manage_membership(
    'business', organization_id, p_business_id, p_role_code
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para administrar personal de este negocio';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'La cuenta de acceso no existe';
  END IF;

  SELECT membership.id, membership.status
    INTO membership_id, existing_status
    FROM public.memberships AS membership
   WHERE membership.user_id = p_user_id
     AND membership.scope_type = 'business'
     AND membership.organization_id = organization_id
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
      organization_id,
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
      organization_id,
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
    organization_id,
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

CREATE OR REPLACE FUNCTION public.create_global_waiter_membership(
  p_user_id uuid,
  p_organization_id uuid,
  p_must_change_password boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
DECLARE
  caller_id uuid := auth.uid();
  membership_id uuid;
  existing_status text;
  action_name text := 'created';
  capability_code text;
BEGIN
  IF caller_id IS NULL OR p_user_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Faltan datos para crear la mesera global';
  END IF;

  IF p_user_id = caller_id THEN
    RAISE EXCEPTION 'No puedes asignarte como mesera global';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.organizations AS organization
     WHERE organization.id = p_organization_id
       AND organization.lifecycle_status = 'active'
  ) THEN
    RAISE EXCEPTION 'La organización no está disponible';
  END IF;

  IF NOT private.multibusiness_can_manage_membership(
    'organization', p_organization_id, NULL, 'global_waiter'
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para administrar meseras globales';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'La cuenta de acceso no existe';
  END IF;

  SELECT membership.id, membership.status
    INTO membership_id, existing_status
    FROM public.memberships AS membership
   WHERE membership.user_id = p_user_id
     AND membership.scope_type = 'organization'
     AND membership.organization_id = p_organization_id
     AND membership.business_id IS NULL
     AND membership.role_code = 'global_waiter'
   FOR UPDATE;

  IF existing_status = 'active' THEN
    RAISE EXCEPTION 'La cuenta ya tiene acceso global activo';
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
      'organization',
      p_organization_id,
      NULL,
      'global_waiter',
      'active',
      p_must_change_password,
      caller_id
    )
    RETURNING id INTO membership_id;
  END IF;

  FOREACH capability_code IN ARRAY private.multibusiness_staff_capability_codes('global_waiter')
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
      p_organization_id,
      NULL,
      caller_id,
      'Permisos derivados del rol de mesera global'
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  INSERT INTO public.audit_events (
    actor_user_id,
    organization_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  ) VALUES (
    caller_id,
    p_organization_id,
    action_name,
    'membership',
    membership_id,
    'Mesera global administrada por el Coordinador',
    jsonb_build_object('role_code', 'global_waiter', 'user_id', p_user_id)
  );

  RETURN membership_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_multibusiness_membership_status(
  p_membership_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  caller_id uuid := auth.uid();
  target public.memberships%ROWTYPE;
  reason text := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
BEGIN
  IF caller_id IS NULL OR p_membership_id IS NULL THEN
    RAISE EXCEPTION 'Faltan datos para cambiar el acceso';
  END IF;

  IF p_status NOT IN ('active', 'inactive', 'revoked') THEN
    RAISE EXCEPTION 'El estado del acceso no es válido';
  END IF;

  SELECT *
    INTO target
    FROM public.memberships AS membership
   WHERE membership.id = p_membership_id
   FOR UPDATE;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el acceso';
  END IF;

  IF target.user_id = caller_id THEN
    RAISE EXCEPTION 'No puedes desactivar tu propio acceso';
  END IF;

  IF NOT private.multibusiness_can_manage_membership(
    target.scope_type,
    target.organization_id,
    target.business_id,
    target.role_code
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para modificar este acceso';
  END IF;

  IF p_status = 'active' THEN
    UPDATE public.memberships
       SET status = 'active',
           deactivated_by = NULL,
           deactivated_at = NULL,
           deactivation_reason = NULL,
           updated_at = now()
     WHERE id = target.id;
  ELSE
    IF reason IS NULL THEN
      RAISE EXCEPTION 'Escribe el motivo de la desactivación';
    END IF;

    UPDATE public.memberships
       SET status = p_status,
           deactivated_by = caller_id,
           deactivated_at = now(),
           deactivation_reason = reason,
           updated_at = now()
     WHERE id = target.id;
  END IF;

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
    target.organization_id,
    target.business_id,
    CASE WHEN p_status = 'active' THEN 'reactivated' ELSE p_status END,
    'membership',
    target.id,
    COALESCE(reason, 'Acceso reactivado por un responsable autorizado'),
    jsonb_build_object('user_id', target.user_id, 'role_code', target.role_code)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_business_staff_membership_role(
  p_membership_id uuid,
  p_role_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  caller_id uuid := auth.uid();
  target public.memberships%ROWTYPE;
  capability_code text;
BEGIN
  IF caller_id IS NULL OR p_membership_id IS NULL THEN
    RAISE EXCEPTION 'Faltan datos para cambiar el rol';
  END IF;

  IF p_role_code NOT IN ('local_waiter', 'local_kitchen', 'local_supervisor') THEN
    RAISE EXCEPTION 'El rol local no es válido';
  END IF;

  SELECT *
    INTO target
    FROM public.memberships AS membership
   WHERE membership.id = p_membership_id
     AND membership.scope_type = 'business'
   FOR UPDATE;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el acceso local';
  END IF;

  IF target.role_code = 'business_owner' THEN
    RAISE EXCEPTION 'El rol del dueño del negocio no se cambia desde Personal';
  END IF;

  IF target.user_id = caller_id THEN
    RAISE EXCEPTION 'No puedes cambiar tu propio rol';
  END IF;

  IF NOT private.multibusiness_can_manage_membership(
    'business', target.organization_id, target.business_id, p_role_code
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar este rol';
  END IF;

  IF target.role_code = p_role_code THEN
    RETURN;
  END IF;

  UPDATE public.memberships
     SET role_code = p_role_code,
         updated_at = now()
   WHERE id = target.id;

  UPDATE public.membership_capabilities
     SET revoked_by = caller_id,
         revoked_at = now(),
         revocation_reason = 'Capacidades reemplazadas al cambiar el rol'
   WHERE membership_id = target.id
     AND revoked_at IS NULL;

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
      target.id,
      capability_code,
      target.organization_id,
      target.business_id,
      caller_id,
      'Permisos derivados del cambio al rol local ' || p_role_code
    );
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
    target.organization_id,
    target.business_id,
    'role_changed',
    'membership',
    target.id,
    'Rol local actualizado por el dueño del negocio',
    jsonb_build_object(
      'user_id', target.user_id,
      'previous_role_code', target.role_code,
      'role_code', p_role_code
    )
  );
END;
$$;

-- Membership changes must go through the audited gateways below. The
-- foundation migration granted column-level INSERT/UPDATE privileges for an
-- earlier bootstrap path, so revoke both table and column privileges here.
REVOKE INSERT, UPDATE, DELETE ON public.memberships FROM authenticated;
REVOKE INSERT (
  id,
  user_id,
  scope_type,
  organization_id,
  business_id,
  role_code,
  status,
  must_change_password,
  created_by,
  deactivated_by,
  created_at,
  updated_at,
  deactivated_at,
  deactivation_reason
) ON public.memberships FROM authenticated;
REVOKE UPDATE (
  id,
  user_id,
  scope_type,
  organization_id,
  business_id,
  role_code,
  status,
  must_change_password,
  created_by,
  deactivated_by,
  created_at,
  updated_at,
  deactivated_at,
  deactivation_reason
) ON public.memberships FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_staff_membership(uuid, uuid, text, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_global_waiter_membership(uuid, uuid, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_multibusiness_membership_status(uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_business_staff_membership_role(uuid, text)
  TO authenticated;

REVOKE ALL ON FUNCTION private.multibusiness_staff_capability_codes(text)
  FROM PUBLIC, anon, authenticated;
