-- Mideli multibusiness foundation
--
-- This migration is intentionally additive. It creates the security and
-- lifecycle boundary for Rincón 404 Food Park without changing operational
-- tables such as orders, catalog, cash or inventory. Those tables will be
-- migrated in separate, tested slices after Mideli has a verified business
-- association.

CREATE SCHEMA IF NOT EXISTS private;

-- =====================================================
-- ORGANIZATION AND BUSINESS LIFECYCLE
-- =====================================================

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Hermosillo',
  lifecycle_status text NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_status IN ('draft', 'active', 'paused', 'archived', 'retired')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_slug_not_blank CHECK (btrim(slug) <> ''),
  CONSTRAINT organizations_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT organizations_timezone_not_blank CHECK (btrim(timezone) <> '')
);

CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  display_name text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Hermosillo',
  lifecycle_status text NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_status IN ('draft', 'active', 'paused', 'archived', 'retired')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paused_at timestamptz,
  archived_at timestamptz,
  retired_at timestamptz,
  CONSTRAINT businesses_slug_per_organization UNIQUE (organization_id, slug),
  CONSTRAINT businesses_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT businesses_slug_not_blank CHECK (btrim(slug) <> ''),
  CONSTRAINT businesses_display_name_not_blank CHECK (btrim(display_name) <> ''),
  CONSTRAINT businesses_timezone_not_blank CHECK (btrim(timezone) <> '')
);

CREATE INDEX organizations_created_by_idx ON public.organizations (created_by);
CREATE INDEX businesses_organization_lifecycle_idx
  ON public.businesses (organization_id, lifecycle_status);
CREATE INDEX businesses_created_by_idx ON public.businesses (created_by);

-- =====================================================
-- MEMBERSHIPS AND CAPABILITY CATALOG
-- =====================================================

CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  scope_type text NOT NULL
    CHECK (scope_type IN ('platform', 'organization', 'business')),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
  business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT,
  role_code text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'revoked')),
  must_change_password boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  deactivated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  deactivation_reason text,
  CONSTRAINT memberships_scope_shape CHECK (
    (scope_type = 'platform' AND organization_id IS NULL AND business_id IS NULL)
    OR (scope_type = 'organization' AND organization_id IS NOT NULL AND business_id IS NULL)
    OR (scope_type = 'business' AND organization_id IS NOT NULL AND business_id IS NOT NULL)
  ),
  CONSTRAINT memberships_role_not_blank CHECK (btrim(role_code) <> ''),
  CONSTRAINT memberships_business_organization_fkey
    FOREIGN KEY (organization_id, business_id)
    REFERENCES public.businesses (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT memberships_deactivation_shape CHECK (
    (status = 'active' AND deactivated_at IS NULL)
    OR (status IN ('inactive', 'revoked') AND deactivated_at IS NOT NULL)
  ),
  CONSTRAINT memberships_deactivation_reason_shape CHECK (
    (deactivated_at IS NULL AND deactivation_reason IS NULL)
    OR (deactivated_at IS NOT NULL AND deactivation_reason IS NOT NULL AND btrim(deactivation_reason) <> '')
  )
);

CREATE INDEX memberships_user_status_idx ON public.memberships (user_id, status);
CREATE INDEX memberships_organization_status_idx
  ON public.memberships (organization_id, status);
CREATE INDEX memberships_business_status_idx
  ON public.memberships (business_id, status);
CREATE INDEX memberships_created_by_idx ON public.memberships (created_by);
CREATE INDEX memberships_deactivated_by_idx ON public.memberships (deactivated_by);

CREATE UNIQUE INDEX memberships_active_platform_role_uidx
  ON public.memberships (user_id, role_code)
  WHERE status = 'active' AND scope_type = 'platform';

CREATE UNIQUE INDEX memberships_active_organization_role_uidx
  ON public.memberships (user_id, organization_id, role_code)
  WHERE status = 'active' AND scope_type = 'organization';

CREATE UNIQUE INDEX memberships_active_business_role_uidx
  ON public.memberships (user_id, business_id, role_code)
  WHERE status = 'active' AND scope_type = 'business';

CREATE TABLE public.capabilities (
  code text PRIMARY KEY,
  scope_type text NOT NULL
    CHECK (scope_type IN ('platform', 'organization', 'business')),
  description text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capabilities_code_not_blank CHECK (btrim(code) <> ''),
  CONSTRAINT capabilities_description_not_blank CHECK (btrim(description) <> '')
);

CREATE TABLE public.membership_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL
    REFERENCES public.memberships(id) ON DELETE RESTRICT,
  capability_code text NOT NULL
    REFERENCES public.capabilities(code) ON DELETE RESTRICT,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
  business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  granted_at timestamptz NOT NULL DEFAULT now(),
  grant_reason text NOT NULL,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revocation_reason text,
  CONSTRAINT membership_capabilities_grant_reason_not_blank
    CHECK (btrim(grant_reason) <> ''),
  CONSTRAINT membership_capabilities_revocation_shape CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
    OR (
      revoked_at IS NOT NULL
      AND revoked_by IS NOT NULL
      AND revocation_reason IS NOT NULL
      AND btrim(revocation_reason) <> ''
    )
  ),
  CONSTRAINT membership_capabilities_target_shape CHECK (
    (organization_id IS NULL AND business_id IS NULL)
    OR organization_id IS NOT NULL
  ),
  CONSTRAINT membership_capabilities_business_organization_fkey
    FOREIGN KEY (organization_id, business_id)
    REFERENCES public.businesses (organization_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX membership_capabilities_membership_idx
  ON public.membership_capabilities (membership_id);
CREATE INDEX membership_capabilities_capability_idx
  ON public.membership_capabilities (capability_code);
CREATE INDEX membership_capabilities_organization_idx
  ON public.membership_capabilities (organization_id);
CREATE INDEX membership_capabilities_business_idx
  ON public.membership_capabilities (business_id);
CREATE INDEX membership_capabilities_granted_by_idx
  ON public.membership_capabilities (granted_by);
CREATE INDEX membership_capabilities_revoked_by_idx
  ON public.membership_capabilities (revoked_by);

CREATE UNIQUE INDEX membership_capabilities_active_target_uidx
  ON public.membership_capabilities (
    membership_id,
    capability_code,
    COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE revoked_at IS NULL;

-- =====================================================
-- AUDIT TRAIL
-- =====================================================

CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
  business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_events_scope_shape CHECK (
    business_id IS NULL OR organization_id IS NOT NULL
  ),
  CONSTRAINT audit_events_action_not_blank CHECK (btrim(action) <> ''),
  CONSTRAINT audit_events_entity_type_not_blank CHECK (btrim(entity_type) <> ''),
  CONSTRAINT audit_events_reason_not_blank CHECK (btrim(reason) <> ''),
  CONSTRAINT audit_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT audit_events_business_organization_fkey
    FOREIGN KEY (organization_id, business_id)
    REFERENCES public.businesses (organization_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX audit_events_actor_idx ON public.audit_events (actor_user_id);
CREATE INDEX audit_events_organization_created_idx
  ON public.audit_events (organization_id, created_at DESC);
CREATE INDEX audit_events_business_created_idx
  ON public.audit_events (business_id, created_at DESC);
CREATE INDEX audit_events_entity_idx
  ON public.audit_events (entity_type, entity_id, created_at DESC);

-- =====================================================
-- PRIVATE SECURITY HELPERS
-- =====================================================

CREATE OR REPLACE FUNCTION private.multibusiness_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.validate_multibusiness_membership_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  business_organization_id uuid;
BEGIN
  IF NEW.scope_type = 'business' THEN
    SELECT b.organization_id
      INTO business_organization_id
      FROM public.businesses AS b
     WHERE b.id = NEW.business_id;

    IF business_organization_id IS NULL
       OR business_organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'La membresía no coincide con la organización del negocio';
    END IF;
  END IF;

  IF NEW.status = 'active' THEN
    NEW.deactivated_at := NULL;
    NEW.deactivation_reason := NULL;
    NEW.deactivated_by := NULL;
  ELSIF NEW.deactivated_at IS NULL THEN
    NEW.deactivated_at := now();
    NEW.deactivated_by := COALESCE(NEW.deactivated_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.validate_multibusiness_capability_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  capability_scope text;
  membership_scope text;
  membership_organization_id uuid;
  membership_business_id uuid;
BEGIN
  SELECT c.scope_type
    INTO capability_scope
    FROM public.capabilities AS c
   WHERE c.code = NEW.capability_code;

  IF capability_scope IS NULL THEN
    RAISE EXCEPTION 'La capacidad solicitada no existe';
  END IF;

  SELECT m.scope_type, m.organization_id, m.business_id
    INTO membership_scope, membership_organization_id, membership_business_id
    FROM public.memberships AS m
   WHERE m.id = NEW.membership_id;

  IF membership_scope IS NULL THEN
    RAISE EXCEPTION 'La membresía solicitada no existe';
  END IF;

  IF capability_scope = 'platform' THEN
    IF membership_scope <> 'platform'
       OR NEW.organization_id IS NOT NULL
       OR NEW.business_id IS NOT NULL THEN
      RAISE EXCEPTION 'Una capacidad de plataforma requiere una membresía de plataforma';
    END IF;
  ELSIF capability_scope = 'organization' THEN
    IF NEW.organization_id IS NULL OR NEW.business_id IS NOT NULL THEN
      RAISE EXCEPTION 'Una capacidad de organización requiere una organización';
    END IF;

    IF membership_scope = 'organization'
       AND membership_organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'La capacidad no coincide con la organización de la membresía';
    ELSIF membership_scope NOT IN ('platform', 'organization') THEN
      RAISE EXCEPTION 'La membresía no puede recibir una capacidad de organización';
    END IF;
  ELSIF capability_scope = 'business' THEN
    IF NEW.organization_id IS NULL OR NEW.business_id IS NULL THEN
      RAISE EXCEPTION 'Una capacidad de negocio requiere organización y negocio';
    END IF;

    IF membership_scope = 'organization'
       AND membership_organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'La capacidad no coincide con la organización de la membresía';
    ELSIF membership_scope = 'business'
       AND membership_business_id <> NEW.business_id THEN
      RAISE EXCEPTION 'La capacidad no coincide con el negocio de la membresía';
    ELSIF membership_scope NOT IN ('platform', 'organization', 'business') THEN
      RAISE EXCEPTION 'La membresía no puede recibir una capacidad de negocio';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.validate_multibusiness_audit_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.business_id IS NOT NULL AND NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Un evento de negocio requiere una organización';
  END IF;

  IF NEW.business_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.businesses AS b
     WHERE b.id = NEW.business_id
       AND b.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'El negocio del evento no pertenece a la organización';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_has_capability(
  p_code text,
  p_organization_id uuid,
  p_business_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  capability_scope text;
BEGIN
  IF current_user_id IS NULL OR p_code IS NULL OR btrim(p_code) = '' THEN
    RETURN false;
  END IF;

  SELECT c.scope_type
    INTO capability_scope
    FROM public.capabilities AS c
   WHERE c.code = p_code
     AND c.is_active = true;

  IF capability_scope IS NULL THEN
    RETURN false;
  END IF;

  IF capability_scope = 'platform' THEN
    IF p_organization_id IS NOT NULL OR p_business_id IS NOT NULL THEN
      RETURN false;
    END IF;
  ELSIF capability_scope = 'organization' THEN
    IF p_organization_id IS NULL OR p_business_id IS NOT NULL THEN
      RETURN false;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM public.organizations AS o
       WHERE o.id = p_organization_id
         AND o.lifecycle_status <> 'retired'
    ) THEN
      RETURN false;
    END IF;
  ELSIF capability_scope = 'business' THEN
    IF p_organization_id IS NULL OR p_business_id IS NULL THEN
      RETURN false;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM public.businesses AS b
       WHERE b.id = p_business_id
         AND b.organization_id = p_organization_id
         AND b.lifecycle_status NOT IN ('archived', 'retired')
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.memberships AS m
      JOIN public.membership_capabilities AS mc
        ON mc.membership_id = m.id
      JOIN public.capabilities AS c
        ON c.code = mc.capability_code
     WHERE m.user_id = current_user_id
       AND m.status = 'active'
       AND mc.capability_code = p_code
       AND mc.revoked_at IS NULL
       AND c.is_active = true
       AND (
         (
           capability_scope = 'platform'
           AND m.scope_type = 'platform'
           AND mc.organization_id IS NULL
           AND mc.business_id IS NULL
         )
         OR (
           capability_scope = 'organization'
           AND mc.organization_id = p_organization_id
           AND mc.business_id IS NULL
           AND (
             m.scope_type = 'platform'
             OR (
               m.scope_type = 'organization'
               AND m.organization_id = p_organization_id
             )
           )
         )
         OR (
           capability_scope = 'business'
           AND mc.organization_id = p_organization_id
           AND mc.business_id = p_business_id
           AND (
             m.scope_type = 'platform'
             OR (
               m.scope_type = 'organization'
               AND m.organization_id = p_organization_id
             )
             OR (
               m.scope_type = 'business'
               AND m.business_id = p_business_id
             )
           )
         )
       )
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_can_view_organization(
  p_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.memberships AS m
       WHERE m.user_id = auth.uid()
         AND m.status = 'active'
         AND (
           m.scope_type = 'platform'
           OR m.organization_id = p_organization_id
           OR EXISTS (
             SELECT 1
               FROM public.businesses AS b
              WHERE b.id = m.business_id
                AND b.organization_id = p_organization_id
           )
         )
    );
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_can_view_business(
  p_business_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.memberships AS m
       WHERE m.user_id = auth.uid()
         AND m.status = 'active'
         AND (
           m.scope_type = 'platform'
           OR m.business_id = p_business_id
           OR EXISTS (
             SELECT 1
               FROM public.businesses AS b
              WHERE b.id = p_business_id
                AND b.organization_id = m.organization_id
           )
         )
    );
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_can_view_membership(
  p_organization_id uuid,
  p_business_id uuid,
  p_target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      p_target_user_id = auth.uid()
      OR EXISTS (
        SELECT 1
          FROM public.memberships AS viewer
         WHERE viewer.user_id = auth.uid()
           AND viewer.status = 'active'
           AND (
             viewer.scope_type = 'platform'
             OR (
               viewer.scope_type = 'organization'
               AND viewer.organization_id = p_organization_id
               AND p_business_id IS NULL
             )
             OR (
               viewer.scope_type = 'business'
               AND viewer.business_id = p_business_id
             )
           )
      )
    );
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_can_manage_membership(
  p_scope_type text,
  p_organization_id uuid,
  p_business_id uuid,
  p_role_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_role_code IS NULL THEN
    RETURN false;
  END IF;

  IF private.multibusiness_has_capability('platform.manage_businesses', NULL, NULL) THEN
    RETURN true;
  END IF;

  -- The coordinator can only create or maintain global waiters. It cannot
  -- mint another coordinator, an owner, or a local business role.
  IF p_scope_type = 'organization'
     AND p_business_id IS NULL
     AND p_role_code = 'global_waiter'
     AND private.multibusiness_has_capability(
       'organization.manage_global_waiters',
       p_organization_id,
       NULL
     ) THEN
    RETURN true;
  END IF;

  -- A business owner or supervisor can maintain local staff, but cannot
  -- promote a person to a business owner through this policy.
  IF p_scope_type = 'business'
     AND p_business_id IS NOT NULL
     AND (
       p_role_code = 'business_staff'
       OR p_role_code LIKE 'local_%'
     )
     AND private.multibusiness_has_capability(
       'business.manage_staff',
       p_organization_id,
       p_business_id
     ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_set_updated_at();

CREATE TRIGGER businesses_set_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_set_updated_at();

CREATE TRIGGER memberships_set_updated_at
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_set_updated_at();

CREATE TRIGGER memberships_validate_scope
  BEFORE INSERT OR UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION private.validate_multibusiness_membership_scope();

CREATE TRIGGER membership_capabilities_validate_scope
  BEFORE INSERT OR UPDATE ON public.membership_capabilities
  FOR EACH ROW EXECUTE FUNCTION private.validate_multibusiness_capability_scope();

CREATE TRIGGER audit_events_validate_scope
  BEFORE INSERT OR UPDATE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION private.validate_multibusiness_audit_scope();

-- =====================================================
-- ROW LEVEL SECURITY AND EXPLICIT PRIVILEGES
-- =====================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.organizations,
  public.businesses,
  public.memberships,
  public.capabilities,
  public.membership_capabilities,
  public.audit_events
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.organizations,
  public.businesses,
  public.memberships,
  public.capabilities,
  public.membership_capabilities,
  public.audit_events
TO authenticated;

REVOKE INSERT, UPDATE ON TABLE public.organizations, public.businesses FROM authenticated;
GRANT INSERT (
  slug,
  name,
  timezone,
  lifecycle_status
) ON TABLE public.organizations TO authenticated;
GRANT UPDATE (
  slug,
  name,
  timezone,
  lifecycle_status
) ON TABLE public.organizations TO authenticated;

GRANT INSERT (
  organization_id,
  slug,
  display_name,
  timezone,
  lifecycle_status,
  paused_at,
  archived_at,
  retired_at
) ON TABLE public.businesses TO authenticated;
GRANT UPDATE (
  slug,
  display_name,
  timezone,
  lifecycle_status,
  paused_at,
  archived_at,
  retired_at
) ON TABLE public.businesses TO authenticated;

REVOKE INSERT ON TABLE public.memberships FROM authenticated;
GRANT INSERT (
  user_id,
  scope_type,
  organization_id,
  business_id,
  role_code,
  status,
  must_change_password,
  deactivation_reason
) ON TABLE public.memberships TO authenticated;
GRANT UPDATE (
  scope_type,
  organization_id,
  business_id,
  role_code,
  status,
  must_change_password,
  deactivation_reason
) ON TABLE public.memberships TO authenticated;

GRANT USAGE ON SCHEMA private TO authenticated;

CREATE POLICY organizations_view_by_membership
  ON public.organizations
  FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_organization(id));

CREATE POLICY organizations_managed_by_platform
  ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (private.multibusiness_has_capability('platform.manage_businesses', NULL, NULL));

CREATE POLICY organizations_updated_by_platform
  ON public.organizations
  FOR UPDATE TO authenticated
  USING (private.multibusiness_has_capability('platform.manage_businesses', NULL, NULL))
  WITH CHECK (private.multibusiness_has_capability('platform.manage_businesses', NULL, NULL));

CREATE POLICY businesses_view_by_membership
  ON public.businesses
  FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(id));

CREATE POLICY businesses_managed_by_platform
  ON public.businesses
  FOR INSERT TO authenticated
  WITH CHECK (private.multibusiness_has_capability('platform.manage_businesses', NULL, NULL));

CREATE POLICY businesses_updated_by_platform
  ON public.businesses
  FOR UPDATE TO authenticated
  USING (private.multibusiness_has_capability('platform.manage_businesses', NULL, NULL))
  WITH CHECK (private.multibusiness_has_capability('platform.manage_businesses', NULL, NULL));

CREATE POLICY memberships_viewed_by_scope
  ON public.memberships
  FOR SELECT TO authenticated
  USING (
    private.multibusiness_can_view_membership(
      organization_id,
      business_id,
      user_id
    )
  );

CREATE POLICY memberships_created_by_authorized_manager
  ON public.memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_can_manage_membership(
      scope_type,
      organization_id,
      business_id,
      role_code
    )
  );

CREATE POLICY memberships_updated_by_authorized_manager
  ON public.memberships
  FOR UPDATE TO authenticated
  USING (
    private.multibusiness_can_manage_membership(
      scope_type,
      organization_id,
      business_id,
      role_code
    )
  )
  WITH CHECK (
    private.multibusiness_can_manage_membership(
      scope_type,
      organization_id,
      business_id,
      role_code
    )
  );

CREATE POLICY capabilities_visible_to_authenticated
  ON public.capabilities
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY membership_capabilities_viewed_by_scope
  ON public.membership_capabilities
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.memberships AS m
       WHERE m.id = membership_id
         AND private.multibusiness_can_view_membership(
           m.organization_id,
           m.business_id,
           m.user_id
         )
    )
  );

CREATE POLICY audit_events_viewed_by_scope
  ON public.audit_events
  FOR SELECT TO authenticated
  USING (
    (
      organization_id IS NULL
      AND business_id IS NULL
      AND EXISTS (
        SELECT 1
          FROM public.memberships AS platform_membership
         WHERE platform_membership.user_id = auth.uid()
           AND platform_membership.scope_type = 'platform'
           AND platform_membership.status = 'active'
      )
    )
    OR (
      organization_id IS NOT NULL
      AND business_id IS NULL
      AND private.multibusiness_can_view_organization(organization_id)
    )
    OR (
      business_id IS NOT NULL
      AND private.multibusiness_can_view_business(business_id)
    )
  );

-- RLS policies call these helpers, but direct invocation is still limited to
-- authenticated sessions. Writes to grants and audit events remain server
-- side/service-role operations until their audited RPCs are implemented.
REVOKE ALL ON FUNCTION private.multibusiness_has_capability(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_can_view_organization(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_can_view_business(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_can_view_membership(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_can_manage_membership(text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.multibusiness_has_capability(text, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.multibusiness_can_view_organization(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.multibusiness_can_view_business(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.multibusiness_can_view_membership(uuid, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.multibusiness_can_manage_membership(text, uuid, uuid, text)
  TO authenticated;

REVOKE ALL ON FUNCTION private.multibusiness_set_updated_at()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.validate_multibusiness_membership_scope()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.validate_multibusiness_capability_scope()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.validate_multibusiness_audit_scope()
  FROM PUBLIC, anon, authenticated;
