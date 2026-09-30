-- Initial role assignment approved for Rincón 404 Food Park.
-- Resolve every identity by current business/profile relationships instead of
-- embedding generated IDs; abort if the verified target is no longer unique.
DO $$
DECLARE
  v_organization_id uuid;
  v_mideli_business_id uuid;
  v_coordinator_user_id uuid;
  v_coordinator_membership_id uuid;
  v_coordinator_count integer;
  v_andrea_user_id uuid;
  v_andrea_membership_id uuid;
  v_andrea_count integer;
  v_existing_andrea_cash_count integer;
  v_inserted_capability_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles AS profile
     WHERE profile.is_active
  ) THEN
    RAISE NOTICE 'Se omite la asignación inicial: esta base de datos todavía no tiene perfiles reales';
    RETURN;
  END IF;

  SELECT organization.id
    INTO v_organization_id
    FROM public.organizations AS organization
   WHERE organization.slug = 'rincon-404-food-park'
     AND organization.lifecycle_status <> 'retired';

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la organización vigente de Rincón 404 Food Park';
  END IF;

  SELECT business.id
    INTO v_mideli_business_id
    FROM public.businesses AS business
   WHERE business.organization_id = v_organization_id
     AND business.slug = 'mideli'
     AND business.lifecycle_status = 'active';

  IF v_mideli_business_id IS NULL THEN
    RAISE EXCEPTION 'Mideli debe existir y estar activo antes de asignar la caja';
  END IF;

  SELECT count(*)::integer
    INTO v_coordinator_count
    FROM public.memberships AS membership
    JOIN public.profiles AS profile
      ON profile.id = membership.user_id
    JOIN public.membership_capabilities AS platform_capability
      ON platform_capability.membership_id = membership.id
     AND platform_capability.capability_code = 'platform.manage_businesses'
     AND platform_capability.revoked_at IS NULL
     AND platform_capability.organization_id IS NULL
     AND platform_capability.business_id IS NULL
   WHERE membership.scope_type = 'platform'
     AND membership.role_code = 'platform_admin'
     AND membership.status = 'active'
     AND profile.full_name = 'Administrador de plataforma'
     AND profile.is_active;

  IF v_coordinator_count <> 1 THEN
    RAISE EXCEPTION 'Se esperaba exactamente una cuenta rincon404 con administración de plataforma activa; se encontraron %',
      v_coordinator_count;
  END IF;

  SELECT membership.id, membership.user_id
    INTO v_coordinator_membership_id, v_coordinator_user_id
    FROM public.memberships AS membership
    JOIN public.profiles AS profile
      ON profile.id = membership.user_id
    JOIN public.membership_capabilities AS platform_capability
      ON platform_capability.membership_id = membership.id
     AND platform_capability.capability_code = 'platform.manage_businesses'
     AND platform_capability.revoked_at IS NULL
     AND platform_capability.organization_id IS NULL
     AND platform_capability.business_id IS NULL
   WHERE membership.scope_type = 'platform'
     AND membership.role_code = 'platform_admin'
     AND membership.status = 'active'
     AND profile.full_name = 'Administrador de plataforma'
     AND profile.is_active;

  SELECT count(*)::integer
    INTO v_andrea_count
    FROM public.memberships AS membership
    JOIN public.profiles AS profile
      ON profile.id = membership.user_id
   WHERE membership.scope_type = 'organization'
     AND membership.organization_id = v_organization_id
     AND membership.business_id IS NULL
     AND membership.role_code = 'global_waiter'
     AND membership.status = 'active'
     AND profile.is_active
     AND lower(btrim(profile.full_name)) = 'andrea';

  IF v_andrea_count <> 1 THEN
    RAISE EXCEPTION 'Se esperaba exactamente una mesera global activa llamada Andrea; se encontraron %',
      v_andrea_count;
  END IF;

  SELECT membership.id, membership.user_id
    INTO v_andrea_membership_id, v_andrea_user_id
    FROM public.memberships AS membership
    JOIN public.profiles AS profile
      ON profile.id = membership.user_id
   WHERE membership.scope_type = 'organization'
     AND membership.organization_id = v_organization_id
     AND membership.business_id IS NULL
     AND membership.role_code = 'global_waiter'
     AND membership.status = 'active'
     AND profile.is_active
     AND lower(btrim(profile.full_name)) = 'andrea';

  SELECT count(*)::integer
    INTO v_existing_andrea_cash_count
    FROM public.membership_capabilities AS membership_capability
   WHERE membership_capability.membership_id = v_andrea_membership_id
     AND membership_capability.revoked_at IS NULL
     AND membership_capability.capability_code IN (
       'business.manage_cash', 'business.open_cash', 'business.close_cash'
     );

  IF v_existing_andrea_cash_count <> 0 THEN
    RAISE EXCEPTION 'Andrea ya tiene permisos de caja activos; revisa esas asignaciones antes de ejecutar esta migración';
  END IF;

  INSERT INTO public.membership_capabilities (
    membership_id, capability_code, organization_id, business_id,
    granted_by, grant_reason
  )
  SELECT
    v_coordinator_membership_id,
    'organization.manage_global_waiters',
    v_organization_id,
    NULL,
    v_coordinator_user_id,
    'Función de Coordinador de Rincón 404 asignada a la cuenta existente rincon404'
  WHERE NOT EXISTS (
    SELECT 1
      FROM public.membership_capabilities AS existing
     WHERE existing.membership_id = v_coordinator_membership_id
       AND existing.capability_code = 'organization.manage_global_waiters'
       AND existing.organization_id = v_organization_id
       AND existing.business_id IS NULL
       AND existing.revoked_at IS NULL
  )
  RETURNING id INTO v_inserted_capability_id;

  IF v_inserted_capability_id IS NOT NULL THEN
    INSERT INTO public.audit_events (
      actor_user_id, organization_id, action, entity_type, entity_id,
      reason, metadata
    ) VALUES (
      v_coordinator_user_id,
      v_organization_id,
      'organization.coordinator_assigned',
      'membership_capability',
      v_inserted_capability_id,
      'Se habilitó la coordinación de meseras globales para la cuenta existente rincon404',
      jsonb_build_object(
        'membership_id', v_coordinator_membership_id,
        'capability_code', 'organization.manage_global_waiters'
      )
    );
  END IF;

  WITH inserted_capabilities AS (
    INSERT INTO public.membership_capabilities (
      membership_id, capability_code, organization_id, business_id,
      granted_by, grant_reason
    ) VALUES
      (
        v_andrea_membership_id,
        'business.open_cash',
        v_organization_id,
        v_mideli_business_id,
        v_coordinator_user_id,
        'Asignación inicial de caja operativa en Mideli aprobada por el usuario'
      ),
      (
        v_andrea_membership_id,
        'business.close_cash',
        v_organization_id,
        v_mideli_business_id,
        v_coordinator_user_id,
        'Asignación inicial de caja operativa en Mideli aprobada por el usuario'
      )
    RETURNING id, capability_code
  )
  INSERT INTO public.audit_events (
    actor_user_id, organization_id, business_id, action, entity_type,
    entity_id, reason, metadata
  )
  SELECT
    v_coordinator_user_id,
    v_organization_id,
    v_mideli_business_id,
    'global_waiter.cash_permission.granted',
    'membership_capability',
    inserted.id,
    'Asignación inicial de caja operativa en Mideli aprobada por el usuario',
    jsonb_build_object(
      'membership_id', v_andrea_membership_id,
      'user_id', v_andrea_user_id,
      'capability_code', inserted.capability_code,
      'business_slug', 'mideli'
    )
    FROM inserted_capabilities AS inserted;
END;
$$;
