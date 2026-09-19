-- Bootstrap the existing Mideli operation into the multibusiness boundary.
--
-- This migration deliberately does not create auth users, change profiles or
-- touch operational data. It resolves the exact profiles that already exist,
-- creates only Rincón 404 Food Park and Mideli, and fails loudly if the
-- expected profile names are missing or ambiguous.

DO $$
DECLARE
  v_organization_id uuid;
  v_business_id uuid;
  v_administrator_id uuid;
  v_andrea_id uuid;
  v_mauro_id uuid;
  v_legacy_mideli_id uuid;
  v_match_count integer;
  v_expected_owner_capabilities integer := 7;
  v_expected_global_waiter_capabilities integer := 2;
BEGIN
  -- A clean local Supabase instance has no auth users or profiles yet. Do
  -- not invent fixtures inside a migration that can run against production;
  -- the real environment continues only when at least one active profile is
  -- present, and then validates every expected profile strictly below.
  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles
     WHERE is_active = true
  ) THEN
    RAISE NOTICE
      'Se omite el bootstrap multinegocio: no hay perfiles activos en esta base todavía';
    RETURN;
  END IF;

  -- Resolve existing profiles by the names documented for the first slice.
  -- We do not hardcode auth UUIDs into a migration that will be committed.
  SELECT count(*)
    INTO v_match_count
    FROM public.profiles
   WHERE full_name = 'Administrador'
     AND is_active = true;
  IF v_match_count <> 1 THEN
    RAISE EXCEPTION
      'No se pudo resolver exactamente un perfil activo llamado Administrador (encontrados: %)',
      v_match_count;
  END IF;
  SELECT id
    INTO v_administrator_id
    FROM public.profiles
   WHERE full_name = 'Administrador'
     AND is_active = true;

  SELECT count(*)
    INTO v_match_count
    FROM public.profiles
   WHERE full_name = 'andrea'
     AND is_active = true;
  IF v_match_count <> 1 THEN
    RAISE EXCEPTION
      'No se pudo resolver exactamente un perfil activo llamado andrea (encontrados: %)',
      v_match_count;
  END IF;
  SELECT id
    INTO v_andrea_id
    FROM public.profiles
   WHERE full_name = 'andrea'
     AND is_active = true;

  SELECT count(*)
    INTO v_match_count
    FROM public.profiles
   WHERE full_name = 'mauro'
     AND is_active = true;
  IF v_match_count <> 1 THEN
    RAISE EXCEPTION
      'No se pudo resolver exactamente un perfil activo llamado mauro (encontrados: %)',
      v_match_count;
  END IF;
  SELECT id
    INTO v_mauro_id
    FROM public.profiles
   WHERE full_name = 'mauro'
     AND is_active = true;

  SELECT count(*)
    INTO v_match_count
    FROM public.profiles
   WHERE full_name = 'Mideli'
     AND is_active = true;
  IF v_match_count <> 1 THEN
    RAISE EXCEPTION
      'No se pudo resolver exactamente un perfil activo llamado Mideli (encontrados: %)',
      v_match_count;
  END IF;
  SELECT id
    INTO v_legacy_mideli_id
    FROM public.profiles
   WHERE full_name = 'Mideli'
     AND is_active = true;

  INSERT INTO public.organizations (
    slug,
    name,
    timezone,
    lifecycle_status,
    created_by
  )
  VALUES (
    'rincon-404-food-park',
    'Rincón 404 Food Park',
    'America/Hermosillo',
    'active',
    v_administrator_id
  )
  ON CONFLICT (slug) DO NOTHING;

  SELECT id
    INTO v_organization_id
    FROM public.organizations
   WHERE slug = 'rincon-404-food-park';

  IF v_organization_id IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM public.organizations
        WHERE id = v_organization_id
          AND name = 'Rincón 404 Food Park'
          AND timezone = 'America/Hermosillo'
          AND lifecycle_status = 'active'
     ) THEN
    RAISE EXCEPTION
      'La organización rincon-404-food-park ya existe con datos incompatibles';
  END IF;

  INSERT INTO public.businesses (
    organization_id,
    slug,
    display_name,
    timezone,
    lifecycle_status,
    created_by
  )
  VALUES (
    v_organization_id,
    'mideli',
    'Mideli',
    'America/Hermosillo',
    'active',
    v_administrator_id
  )
  ON CONFLICT (organization_id, slug) DO NOTHING;

  SELECT id
    INTO v_business_id
    FROM public.businesses
   WHERE organization_id = v_organization_id
     AND slug = 'mideli';

  IF v_business_id IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM public.businesses
        WHERE id = v_business_id
          AND organization_id = v_organization_id
          AND display_name = 'Mideli'
          AND timezone = 'America/Hermosillo'
          AND lifecycle_status = 'active'
     ) THEN
    RAISE EXCEPTION
      'El negocio mideli ya existe con datos incompatibles';
  END IF;

  -- Current owner of Mideli. The existing profile and its login remain
  -- untouched; this is an additive membership used by the future policies.
  INSERT INTO public.memberships (
    user_id,
    scope_type,
    organization_id,
    business_id,
    role_code,
    status,
    created_by
  )
  SELECT
    v_administrator_id,
    'business',
    v_organization_id,
    v_business_id,
    'business_owner',
    'active',
    v_administrator_id
  WHERE NOT EXISTS (
    SELECT 1
      FROM public.memberships
     WHERE user_id = v_administrator_id
       AND scope_type = 'business'
       AND organization_id = v_organization_id
       AND business_id = v_business_id
       AND role_code = 'business_owner'
       AND status = 'active'
  );

  -- Andrea is an organization-wide waiter. The organization-scoped order and
  -- charge capabilities will cover this role when more businesses are added.
  INSERT INTO public.memberships (
    user_id,
    scope_type,
    organization_id,
    role_code,
    status,
    created_by
  )
  SELECT
    v_andrea_id,
    'organization',
    v_organization_id,
    'global_waiter',
    'active',
    v_administrator_id
  WHERE NOT EXISTS (
    SELECT 1
      FROM public.memberships
     WHERE user_id = v_andrea_id
       AND scope_type = 'organization'
       AND organization_id = v_organization_id
       AND business_id IS NULL
       AND role_code = 'global_waiter'
       AND status = 'active'
  );

  -- Mauro is local preparation staff for Mideli. Kitchen visibility and
  -- preparation transitions will be migrated separately from this bootstrap.
  INSERT INTO public.memberships (
    user_id,
    scope_type,
    organization_id,
    business_id,
    role_code,
    status,
    created_by
  )
  SELECT
    v_mauro_id,
    'business',
    v_organization_id,
    v_business_id,
    'local_kitchen',
    'active',
    v_administrator_id
  WHERE NOT EXISTS (
    SELECT 1
      FROM public.memberships
     WHERE user_id = v_mauro_id
       AND scope_type = 'business'
       AND organization_id = v_organization_id
       AND business_id = v_business_id
       AND role_code = 'local_kitchen'
       AND status = 'active'
  );

  -- The old profile named Mideli is kept only as a disabled historical
  -- membership. No login or profile row is deleted and no capability is
  -- granted to it.
  INSERT INTO public.memberships (
    user_id,
    scope_type,
    organization_id,
    business_id,
    role_code,
    status,
    created_by,
    deactivated_by,
    deactivated_at,
    deactivation_reason
  )
  SELECT
    v_legacy_mideli_id,
    'business',
    v_organization_id,
    v_business_id,
    'legacy_account',
    'inactive',
    v_administrator_id,
    v_administrator_id,
    now(),
    'Cuenta heredada sin uso; no habilitada en el modelo multinegocio'
  WHERE NOT EXISTS (
    SELECT 1
      FROM public.memberships
     WHERE user_id = v_legacy_mideli_id
       AND scope_type = 'business'
       AND organization_id = v_organization_id
       AND business_id = v_business_id
       AND role_code = 'legacy_account'
  );

  -- Business owner permissions for the existing Mideli operation.
  INSERT INTO public.membership_capabilities (
    membership_id,
    capability_code,
    organization_id,
    business_id,
    granted_by,
    grant_reason
  )
  SELECT
    m.id,
    c.code,
    v_organization_id,
    v_business_id,
    v_administrator_id,
    'Permisos iniciales del dueño del negocio Mideli'
    FROM public.memberships AS m
    JOIN public.capabilities AS c
      ON c.code IN (
        'business.manage_staff',
        'business.manage_catalog',
        'business.manage_inventory',
        'business.operate_orders',
        'business.update_preparation',
        'business.charge_orders',
        'business.manage_cash'
      )
   WHERE m.user_id = v_administrator_id
     AND m.scope_type = 'business'
     AND m.organization_id = v_organization_id
     AND m.business_id = v_business_id
     AND m.role_code = 'business_owner'
     AND m.status = 'active'
  ON CONFLICT DO NOTHING;

  -- Global waiter permissions apply to every business in this organization.
  INSERT INTO public.membership_capabilities (
    membership_id,
    capability_code,
    organization_id,
    business_id,
    granted_by,
    grant_reason
  )
  SELECT
    m.id,
    c.code,
    v_organization_id,
    NULL,
    v_administrator_id,
    'Permisos iniciales de mesera global para todos los negocios'
    FROM public.memberships AS m
    JOIN public.capabilities AS c
      ON c.code IN (
        'organization.operate_orders',
        'organization.charge_orders'
      )
   WHERE m.user_id = v_andrea_id
     AND m.scope_type = 'organization'
     AND m.organization_id = v_organization_id
     AND m.business_id IS NULL
     AND m.role_code = 'global_waiter'
     AND m.status = 'active'
  ON CONFLICT DO NOTHING;

  -- Local kitchen permission for Mideli.
  INSERT INTO public.membership_capabilities (
    membership_id,
    capability_code,
    organization_id,
    business_id,
    granted_by,
    grant_reason
  )
  SELECT
    m.id,
    'business.update_preparation',
    v_organization_id,
    v_business_id,
    v_administrator_id,
    'Permiso inicial de preparación para cocina de Mideli'
    FROM public.memberships AS m
   WHERE m.user_id = v_mauro_id
     AND m.scope_type = 'business'
     AND m.organization_id = v_organization_id
     AND m.business_id = v_business_id
     AND m.role_code = 'local_kitchen'
     AND m.status = 'active'
  ON CONFLICT DO NOTHING;

  -- Record the bootstrap as a migration event without attributing it to a
  -- person who did not perform an interactive action in the application.
  INSERT INTO public.audit_events (
    organization_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  )
  SELECT
    v_organization_id,
    'created',
    'organization',
    v_organization_id,
    'Migración inicial multinegocio de Mideli',
    jsonb_build_object('source', 'migration', 'business_slug', 'mideli')
  WHERE NOT EXISTS (
    SELECT 1
      FROM public.audit_events
     WHERE organization_id = v_organization_id
       AND action = 'created'
       AND entity_type = 'organization'
       AND entity_id = v_organization_id
       AND reason = 'Migración inicial multinegocio de Mideli'
  );

  INSERT INTO public.audit_events (
    organization_id,
    business_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  )
  SELECT
    v_organization_id,
    v_business_id,
    'created',
    'business',
    v_business_id,
    'Migración inicial multinegocio de Mideli',
    jsonb_build_object('source', 'migration', 'business_slug', 'mideli')
  WHERE NOT EXISTS (
    SELECT 1
      FROM public.audit_events
     WHERE organization_id = v_organization_id
       AND business_id = v_business_id
       AND action = 'created'
       AND entity_type = 'business'
       AND entity_id = v_business_id
       AND reason = 'Migración inicial multinegocio de Mideli'
  );

  -- Fail the migration if the expected boundary was not completely seeded.
  SELECT count(*)
    INTO v_match_count
    FROM public.memberships AS m
   WHERE m.user_id = v_administrator_id
     AND m.organization_id = v_organization_id
     AND m.business_id = v_business_id
     AND m.scope_type = 'business'
     AND m.role_code = 'business_owner'
     AND m.status = 'active';
  IF v_match_count <> 1 THEN
    RAISE EXCEPTION 'La membresía del dueño de Mideli no quedó exactamente una vez';
  END IF;

  SELECT count(*)
    INTO v_match_count
    FROM public.memberships AS m
   WHERE m.user_id = v_andrea_id
     AND m.organization_id = v_organization_id
     AND m.business_id IS NULL
     AND m.scope_type = 'organization'
     AND m.role_code = 'global_waiter'
     AND m.status = 'active';
  IF v_match_count <> 1 THEN
    RAISE EXCEPTION 'La membresía global de andrea no quedó exactamente una vez';
  END IF;

  SELECT count(*)
    INTO v_match_count
    FROM public.membership_capabilities AS mc
    JOIN public.memberships AS m ON m.id = mc.membership_id
   WHERE m.user_id = v_administrator_id
     AND m.business_id = v_business_id
     AND m.role_code = 'business_owner'
     AND m.status = 'active'
     AND mc.business_id = v_business_id
     AND mc.revoked_at IS NULL;
  IF v_match_count <> v_expected_owner_capabilities THEN
    RAISE EXCEPTION
      'El dueño de Mideli no recibió exactamente las capacidades esperadas (encontradas: %)',
      v_match_count;
  END IF;

  SELECT count(*)
    INTO v_match_count
    FROM public.membership_capabilities AS mc
    JOIN public.memberships AS m ON m.id = mc.membership_id
   WHERE m.user_id = v_andrea_id
     AND m.organization_id = v_organization_id
     AND m.role_code = 'global_waiter'
     AND m.status = 'active'
     AND mc.organization_id = v_organization_id
     AND mc.business_id IS NULL
     AND mc.revoked_at IS NULL;
  IF v_match_count <> v_expected_global_waiter_capabilities THEN
    RAISE EXCEPTION
      'La mesera global no recibió exactamente las capacidades esperadas (encontradas: %)',
      v_match_count;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.membership_capabilities AS mc
      JOIN public.memberships AS m ON m.id = mc.membership_id
     WHERE m.user_id = v_legacy_mideli_id
       AND mc.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'La cuenta heredada Mideli no debe tener capacidades activas';
  END IF;
END;
$$;
