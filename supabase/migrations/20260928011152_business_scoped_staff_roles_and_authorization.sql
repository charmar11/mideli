-- Business-scoped staff roles and explicit global-waiter access.
-- This migration preserves the currently effective access for businesses that
-- already exist, but stops organization-wide order grants from authorizing a
-- business created in the future.

DO $preflight$
DECLARE
  v_duplicate_count integer;
  v_cash_overlap_count integer;
BEGIN
  SELECT count(*)
    INTO v_duplicate_count
    FROM (
      SELECT membership.user_id, membership.business_id
       FROM public.memberships AS membership
       WHERE membership.scope_type = 'business'
         AND membership.status <> 'revoked'
         AND membership.role_code <> 'business_owner'
       GROUP BY membership.user_id, membership.business_id
      HAVING count(*) > 1
    ) AS duplicates;

  IF v_duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Staff-role migration stopped: % users have multiple non-revoked local memberships; review and consolidate without losing capabilities first',
      v_duplicate_count;
  END IF;

  SELECT count(DISTINCT (cash_membership.user_id, cash_grant.business_id))
    INTO v_cash_overlap_count
    FROM public.memberships AS cash_membership
    JOIN public.membership_capabilities AS cash_grant
      ON cash_grant.membership_id = cash_membership.id
    JOIN public.memberships AS local_staff
      ON local_staff.user_id = cash_membership.user_id
     AND local_staff.scope_type = 'business'
     AND local_staff.business_id = cash_grant.business_id
     AND local_staff.status = 'active'
     AND local_staff.role_code <> 'business_owner'
   WHERE cash_membership.scope_type = 'organization'
     AND cash_membership.role_code = 'global_waiter'
     AND cash_membership.status = 'active'
     AND cash_grant.business_id IS NOT NULL
     AND cash_grant.revoked_at IS NULL
     AND cash_grant.capability_code IN ('business.open_cash', 'business.close_cash');

  IF v_cash_overlap_count > 0 THEN
    RAISE EXCEPTION
      'Staff-role migration stopped: % active global cash assignments overlap an existing local staff membership; review the combined local role first',
      v_cash_overlap_count;
  END IF;

END;
$preflight$;

CREATE TABLE public.business_staff_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  role_key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  system_code text,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_staff_roles_id_business_key UNIQUE (id, business_id),
  CONSTRAINT business_staff_roles_business_key UNIQUE (business_id, role_key),
  CONSTRAINT business_staff_roles_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT business_staff_roles_name_length CHECK (char_length(btrim(name)) <= 48),
  CONSTRAINT business_staff_roles_description_length CHECK (char_length(description) <= 180),
  CONSTRAINT business_staff_roles_system_shape CHECK (
    (is_system AND system_code IS NOT NULL)
    OR (NOT is_system AND system_code IS NULL)
  ),
  CONSTRAINT business_staff_roles_archive_shape CHECK (
    (is_active AND archived_at IS NULL)
    OR (NOT is_active AND archived_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX business_staff_roles_active_name_uidx
  ON public.business_staff_roles (business_id, lower(name))
  WHERE is_active;
CREATE INDEX business_staff_roles_business_active_idx
  ON public.business_staff_roles (business_id, is_active, name);

CREATE TABLE public.business_staff_role_capabilities (
  business_id uuid NOT NULL,
  role_id uuid NOT NULL,
  capability_code text NOT NULL REFERENCES public.capabilities(code) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, capability_code),
  CONSTRAINT business_staff_role_capabilities_role_business_fkey
    FOREIGN KEY (role_id, business_id)
    REFERENCES public.business_staff_roles(id, business_id)
    ON DELETE CASCADE
);
CREATE INDEX business_staff_role_capabilities_business_idx
  ON public.business_staff_role_capabilities (business_id, capability_code);

ALTER TABLE public.memberships
  ADD COLUMN staff_role_id uuid;

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_staff_role_business_fkey
    FOREIGN KEY (staff_role_id, business_id)
    REFERENCES public.business_staff_roles(id, business_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT memberships_staff_role_scope_check CHECK (
    staff_role_id IS NULL
    OR (
      scope_type = 'business'
      AND role_code <> 'business_owner'
      AND role_code IN ('business_staff', 'local_waiter', 'local_kitchen', 'local_supervisor')
    )
  );

CREATE UNIQUE INDEX memberships_active_local_staff_uidx
  ON public.memberships (user_id, business_id)
  WHERE scope_type = 'business'
    AND status = 'active'
    AND role_code <> 'business_owner';

ALTER TABLE public.business_staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_staff_role_capabilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_staff_roles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.business_staff_role_capabilities FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.business_staff_delegable_capability_codes()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    'business.operate_orders',
    'business.charge_orders',
    'business.update_preparation',
    'business.open_cash',
    'business.close_cash',
    'business.manage_catalog',
    'business.manage_inventory',
    'business.manage_staff'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION private.business_staff_actor_can_assign_role(
  p_actor_id uuid,
  p_business_id uuid,
  p_role_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organization_id uuid;
BEGIN
  SELECT business.organization_id
    INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.lifecycle_status = 'active';

  IF v_organization_id IS NULL
     OR NOT private.multibusiness_has_capability(
       'business.manage_staff', v_organization_id, p_business_id
     ) THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
      FROM public.business_staff_role_capabilities AS role_capability
      JOIN public.capabilities AS capability
        ON capability.code = role_capability.capability_code
     WHERE role_capability.role_id = p_role_id
       AND role_capability.business_id = p_business_id
       AND (
         NOT capability.is_active
         OR capability.scope_type <> 'business'
         OR role_capability.capability_code <> ALL (
           private.business_staff_delegable_capability_codes()
         )
         OR NOT (
           private.multibusiness_has_capability(
             role_capability.capability_code, v_organization_id, p_business_id
           )
           OR (
             role_capability.capability_code IN (
               'business.open_cash', 'business.close_cash'
             )
             AND private.multibusiness_has_capability(
               'business.manage_cash', v_organization_id, p_business_id
             )
           )
         )
       )
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_staff_role_membership_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role_id uuid;
  v_system_code text;
BEGIN
  IF NEW.scope_type <> 'business' OR NEW.role_code = 'business_owner' THEN
    IF NEW.staff_role_id IS NOT NULL THEN
      RAISE EXCEPTION 'Solo el personal local puede tener un rango de negocio';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.staff_role_id IS NULL THEN
    IF NEW.role_code = 'business_staff' THEN
      RAISE EXCEPTION 'El personal local debe tener un rango asignado';
    END IF;

    IF NEW.role_code IN ('local_waiter', 'local_kitchen', 'local_supervisor') THEN
      SELECT role.id
        INTO v_role_id
        FROM public.business_staff_roles AS role
       WHERE role.business_id = NEW.business_id
         AND role.system_code = NEW.role_code
         AND role.is_active;
      IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró el rango local integrado';
      END IF;
      NEW.staff_role_id := v_role_id;
    END IF;
  ELSE
    SELECT role.system_code
      INTO v_system_code
      FROM public.business_staff_roles AS role
     WHERE role.id = NEW.staff_role_id
       AND role.business_id = NEW.business_id
       AND role.is_active;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El rango no pertenece a este negocio o está archivado';
    END IF;

    IF v_system_code IS NULL THEN
      IF NEW.role_code <> 'business_staff' THEN
        NEW.role_code := 'business_staff';
      END IF;
    ELSIF NEW.role_code NOT IN (v_system_code, 'business_staff') THEN
      RAISE EXCEPTION 'El rango y la categoría de acceso no coinciden';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER memberships_sync_business_staff_role
  BEFORE INSERT OR UPDATE OF scope_type, business_id, role_code, staff_role_id
  ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION private.multibusiness_staff_role_membership_sync();

CREATE OR REPLACE FUNCTION private.seed_business_staff_roles(
  p_business_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role record;
  v_role_id uuid;
  v_capability_code text;
BEGIN
  FOR v_role IN
    SELECT *
      FROM (VALUES
        ('local_waiter', 'Mesero', 'Toma pedidos y registra cobros.', ARRAY['business.operate_orders', 'business.charge_orders']::text[]),
        ('local_kitchen', 'Cocina', 'Consulta y actualiza la preparación.', ARRAY['business.update_preparation']::text[]),
        ('local_supervisor', 'Supervisor', 'Opera pedidos, cobros y preparación.', ARRAY['business.operate_orders', 'business.charge_orders', 'business.update_preparation']::text[]),
        ('cash_open', 'Caja · apertura', 'Puede abrir la caja de este negocio.', ARRAY['business.open_cash']::text[]),
        ('cash_close', 'Caja · cierre', 'Puede cerrar la caja de este negocio.', ARRAY['business.close_cash']::text[]),
        ('cash_operator', 'Caja operativa', 'Puede abrir y cerrar la caja de este negocio.', ARRAY['business.open_cash', 'business.close_cash']::text[])
      ) AS roles(system_code, name, description, capability_codes)
  LOOP
    INSERT INTO public.business_staff_roles (
      business_id, role_key, name, description, is_system, system_code
    ) VALUES (
      p_business_id,
      'system:' || v_role.system_code,
      v_role.name,
      v_role.description,
      true,
      v_role.system_code
    )
    ON CONFLICT (business_id, role_key) DO UPDATE
      SET name = EXCLUDED.name,
          description = EXCLUDED.description,
          is_active = true,
          archived_at = NULL
    RETURNING id INTO v_role_id;

    FOREACH v_capability_code IN ARRAY v_role.capability_codes
    LOOP
      INSERT INTO public.business_staff_role_capabilities (
        business_id, role_id, capability_code
      ) VALUES (p_business_id, v_role_id, v_capability_code)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.business_staff_roles_seed_on_business_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.seed_business_staff_roles(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER businesses_seed_staff_roles
  AFTER INSERT ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION private.business_staff_roles_seed_on_business_create();

DO $seed_existing$
DECLARE
  v_business_id uuid;
BEGIN
  FOR v_business_id IN SELECT business.id FROM public.businesses AS business
  LOOP
    PERFORM private.seed_business_staff_roles(v_business_id);
  END LOOP;
END;
$seed_existing$;

UPDATE public.memberships AS membership
   SET staff_role_id = role.id
  FROM public.business_staff_roles AS role
 WHERE membership.scope_type = 'business'
   AND membership.role_code IN ('local_waiter', 'local_kitchen', 'local_supervisor')
   AND membership.staff_role_id IS NULL
   AND role.business_id = membership.business_id
   AND role.system_code = membership.role_code;

DO $staff_role_backfill_check$
DECLARE
  v_unmapped_staff_count integer;
BEGIN
  SELECT count(*)::integer
    INTO v_unmapped_staff_count
    FROM public.memberships AS membership
   WHERE membership.scope_type = 'business'
     AND membership.status = 'active'
     AND membership.role_code <> 'business_owner'
     AND membership.staff_role_id IS NULL;

  IF v_unmapped_staff_count > 0 THEN
    RAISE EXCEPTION
      'Staff-role migration stopped: % active local staff memberships have no known role to preserve; review them before migration',
      v_unmapped_staff_count;
  END IF;
END;
$staff_role_backfill_check$;

-- Convert the currently effective organization-wide waiter grants into a
-- finite allowlist for businesses that exist today. No future business is
-- included automatically. The scope report was checked before writing this
-- migration and the target is intentionally re-evaluated atomically here.
DO $explicit_access_backfill$
DECLARE
  v_missing_count integer;
BEGIN
  SELECT count(*)
    INTO v_missing_count
    FROM public.memberships AS membership
    JOIN public.membership_capabilities AS organization_grant
      ON organization_grant.membership_id = membership.id
    JOIN public.businesses AS business
      ON business.organization_id = membership.organization_id
     AND business.lifecycle_status NOT IN ('archived', 'retired')
   WHERE membership.scope_type = 'organization'
     AND membership.role_code = 'global_waiter'
     AND membership.status = 'active'
     AND organization_grant.organization_id = membership.organization_id
     AND organization_grant.business_id IS NULL
     AND organization_grant.revoked_at IS NULL
     AND organization_grant.capability_code IN (
       'organization.operate_orders', 'organization.charge_orders'
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.membership_capabilities AS scoped_grant
        WHERE scoped_grant.membership_id = membership.id
          AND scoped_grant.organization_id = membership.organization_id
          AND scoped_grant.business_id = business.id
          AND scoped_grant.revoked_at IS NULL
          AND scoped_grant.capability_code = CASE organization_grant.capability_code
            WHEN 'organization.operate_orders' THEN 'business.operate_orders'
            ELSE 'business.charge_orders'
          END
     );

  IF v_missing_count > 0 THEN
    INSERT INTO public.membership_capabilities (
      membership_id, capability_code, organization_id, business_id,
      granted_by, granted_at, grant_reason
    )
    SELECT
      membership.id,
      CASE organization_grant.capability_code
        WHEN 'organization.operate_orders' THEN 'business.operate_orders'
        ELSE 'business.charge_orders'
      END,
      membership.organization_id,
      business.id,
      organization_grant.granted_by,
      now(),
      'Migración: alcance global vigente convertido a permiso explícito por negocio existente'
    FROM public.memberships AS membership
    JOIN public.membership_capabilities AS organization_grant
      ON organization_grant.membership_id = membership.id
    JOIN public.businesses AS business
      ON business.organization_id = membership.organization_id
     AND business.lifecycle_status NOT IN ('archived', 'retired')
    WHERE membership.scope_type = 'organization'
      AND membership.role_code = 'global_waiter'
      AND membership.status = 'active'
      AND organization_grant.organization_id = membership.organization_id
      AND organization_grant.business_id IS NULL
      AND organization_grant.revoked_at IS NULL
      AND organization_grant.capability_code IN (
        'organization.operate_orders', 'organization.charge_orders'
      )
      AND NOT EXISTS (
        SELECT 1
          FROM public.membership_capabilities AS scoped_grant
         WHERE scoped_grant.membership_id = membership.id
           AND scoped_grant.organization_id = membership.organization_id
           AND scoped_grant.business_id = business.id
           AND scoped_grant.revoked_at IS NULL
           AND scoped_grant.capability_code = CASE organization_grant.capability_code
             WHEN 'organization.operate_orders' THEN 'business.operate_orders'
             ELSE 'business.charge_orders'
           END
      )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$explicit_access_backfill$;

-- Move existing global cashier grants into an equivalent local staff role.
DO $cash_backfill$
DECLARE
  v_grant_group record;
  v_role_code text;
  v_role_id uuid;
  v_local_membership_id uuid;
  v_local_membership_count integer;
  v_open boolean;
  v_close boolean;
BEGIN
  FOR v_grant_group IN
    SELECT
      global_membership.user_id,
      global_membership.organization_id,
      global_membership.id AS source_membership_id,
      capability.business_id,
      bool_or(capability.capability_code = 'business.open_cash') AS can_open,
      bool_or(capability.capability_code = 'business.close_cash') AS can_close,
      min(capability.granted_by::text)::uuid AS original_grant_actor
    FROM public.memberships AS global_membership
    JOIN public.membership_capabilities AS capability
      ON capability.membership_id = global_membership.id
    WHERE global_membership.scope_type = 'organization'
      AND global_membership.role_code = 'global_waiter'
      AND capability.business_id IS NOT NULL
      AND capability.revoked_at IS NULL
      AND capability.capability_code IN ('business.open_cash', 'business.close_cash')
    GROUP BY global_membership.user_id, global_membership.organization_id,
      global_membership.id, capability.business_id
  LOOP
    v_open := v_grant_group.can_open;
    v_close := v_grant_group.can_close;

    SELECT count(*)::integer
      INTO v_local_membership_count
      FROM public.memberships AS local_staff
     WHERE local_staff.user_id = v_grant_group.user_id
       AND local_staff.scope_type = 'business'
       AND local_staff.business_id = v_grant_group.business_id
       AND local_staff.status = 'active'
       AND local_staff.role_code <> 'business_owner';

    IF v_local_membership_count > 0 THEN
      RAISE EXCEPTION
        'Cash backfill stopped: a global cash grant now overlaps an active local staff membership. Review before migration.';
    END IF;

    v_role_code := CASE
      WHEN v_open AND v_close THEN 'cash_operator'
      WHEN v_open THEN 'cash_open'
      ELSE 'cash_close'
    END;

    SELECT role.id
      INTO v_role_id
      FROM public.business_staff_roles AS role
     WHERE role.business_id = v_grant_group.business_id
       AND role.system_code = v_role_code
       AND role.is_active;

    IF v_role_id IS NULL THEN
      RAISE EXCEPTION 'No se encontró el rango local equivalente de caja';
    END IF;

    INSERT INTO public.memberships (
      user_id, scope_type, organization_id, business_id, role_code,
      staff_role_id, status, must_change_password, created_by
    ) VALUES (
      v_grant_group.user_id,
      'business',
      v_grant_group.organization_id,
      v_grant_group.business_id,
      'business_staff',
      v_role_id,
      'active',
      false,
      NULL
    )
    RETURNING id INTO v_local_membership_id;

    INSERT INTO public.membership_capabilities (
      membership_id, capability_code, organization_id, business_id,
      granted_by, granted_at, grant_reason
    )
    SELECT
      v_local_membership_id,
      original.capability_code,
      v_grant_group.organization_id,
      v_grant_group.business_id,
      original.granted_by,
      now(),
      'Migración: permiso de caja local equivalente al acceso global previo; administrable por el dueño del negocio'
    FROM public.membership_capabilities AS original
    WHERE original.membership_id = v_grant_group.source_membership_id
      AND original.business_id = v_grant_group.business_id
      AND original.revoked_at IS NULL
      AND original.capability_code IN ('business.open_cash', 'business.close_cash');

    INSERT INTO public.audit_events (
      actor_user_id, organization_id, business_id, action,
      entity_type, entity_id, reason, metadata
    ) VALUES (
      NULL,
      v_grant_group.organization_id,
      v_grant_group.business_id,
      'global_waiter.cash_permission.migrated_local',
      'membership',
      v_local_membership_id,
      'Permisos locales de caja trasladados sin ampliar su alcance; cambios futuros corresponden al dueño del negocio',
      pg_catalog.jsonb_build_object(
        'source_membership_id', v_grant_group.source_membership_id,
        'user_id', v_grant_group.user_id,
        'source_grant_actor', v_grant_group.original_grant_actor,
        'role_code', v_role_code,
        'capabilities', pg_catalog.to_jsonb(ARRAY[
          CASE WHEN v_open THEN 'business.open_cash' END,
          CASE WHEN v_close THEN 'business.close_cash' END
        ])
      )
    );
  END LOOP;
END;
$cash_backfill$;

-- Mark automated migration revocations distinctly from human revocations.
ALTER TABLE public.membership_capabilities
  DROP CONSTRAINT membership_capabilities_revocation_shape;
ALTER TABLE public.membership_capabilities
  ADD CONSTRAINT membership_capabilities_revocation_shape CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
    OR (
      revoked_at IS NOT NULL
      AND revocation_reason IS NOT NULL
      AND btrim(revocation_reason) <> ''
      AND (
        revoked_by IS NOT NULL
        OR revocation_reason = 'Sistema: permisos globales sustituidos por asignaciones explícitas durante la migración de rangos locales'
      )
    )
  );

INSERT INTO public.audit_events (
  actor_user_id, organization_id, business_id, action,
  entity_type, entity_id, reason, metadata
)
SELECT
  NULL,
  membership.organization_id,
  capability.business_id,
  CASE
    WHEN capability.capability_code IN ('business.open_cash', 'business.close_cash')
      THEN 'global_waiter.cash_permission.retired'
    ELSE 'global_waiter.organization_permission.retired'
  END,
  'membership_capability',
  capability.id,
  'Sistema: permisos globales sustituidos por asignaciones explícitas durante la migración de rangos locales',
  pg_catalog.jsonb_build_object(
    'membership_id', membership.id,
    'user_id', membership.user_id,
    'capability_code', capability.capability_code,
    'previous_business_id', capability.business_id,
    'previous_granted_by', capability.granted_by
  )
FROM public.memberships AS membership
JOIN public.membership_capabilities AS capability
  ON capability.membership_id = membership.id
WHERE membership.scope_type = 'organization'
  AND membership.role_code = 'global_waiter'
  AND capability.revoked_at IS NULL
  AND capability.capability_code IN (
    'organization.operate_orders',
    'organization.charge_orders',
    'business.open_cash',
    'business.close_cash'
  );

UPDATE public.membership_capabilities AS capability
   SET revoked_at = now(),
       revoked_by = NULL,
       revocation_reason = 'Sistema: permisos globales sustituidos por asignaciones explícitas durante la migración de rangos locales'
  FROM public.memberships AS membership
 WHERE capability.membership_id = membership.id
   AND membership.scope_type = 'organization'
   AND membership.role_code = 'global_waiter'
   AND capability.revoked_at IS NULL
   AND capability.capability_code IN (
     'organization.operate_orders',
     'organization.charge_orders',
     'business.open_cash',
     'business.close_cash'
   );

CREATE OR REPLACE FUNCTION private.multibusiness_has_capability(
  p_code text,
  p_organization_id uuid,
  p_business_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_scope text;
BEGIN
  IF v_user_id IS NULL OR p_code IS NULL OR btrim(p_code) = '' THEN
    RETURN false;
  END IF;

  -- Legacy organization-wide order rights are intentionally inert. Orders
  -- and charges require a grant tied to the selected business.
  IF p_code IN ('organization.operate_orders', 'organization.charge_orders') THEN
    RETURN false;
  END IF;

  SELECT capability.scope_type
    INTO v_scope
    FROM public.capabilities AS capability
   WHERE capability.code = p_code
     AND capability.is_active;

  IF v_scope IS NULL THEN
    RETURN false;
  ELSIF v_scope = 'platform' THEN
    IF p_organization_id IS NOT NULL OR p_business_id IS NOT NULL THEN RETURN false; END IF;
  ELSIF v_scope = 'organization' THEN
    IF p_organization_id IS NULL OR p_business_id IS NOT NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.organizations AS organization
          WHERE organization.id = p_organization_id
            AND organization.lifecycle_status <> 'retired'
       ) THEN
      RETURN false;
    END IF;
  ELSIF v_scope = 'business' THEN
    IF p_organization_id IS NULL OR p_business_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.businesses AS business
          WHERE business.id = p_business_id
            AND business.organization_id = p_organization_id
            AND business.lifecycle_status NOT IN ('archived', 'retired')
       ) THEN
      RETURN false;
    END IF;
  ELSE
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.memberships AS membership
      JOIN public.membership_capabilities AS membership_capability
        ON membership_capability.membership_id = membership.id
      JOIN public.capabilities AS capability
        ON capability.code = membership_capability.capability_code
     WHERE membership.user_id = v_user_id
       AND membership.status = 'active'
       AND membership_capability.capability_code = p_code
       AND membership_capability.revoked_at IS NULL
       AND capability.is_active
       AND (
         (
           v_scope = 'platform'
           AND membership.scope_type = 'platform'
           AND membership_capability.organization_id IS NULL
           AND membership_capability.business_id IS NULL
         )
         OR (
           v_scope = 'organization'
           AND membership_capability.organization_id = p_organization_id
           AND membership_capability.business_id IS NULL
           AND (
             membership.scope_type = 'platform'
             OR (
               membership.scope_type = 'organization'
               AND membership.organization_id = p_organization_id
             )
           )
         )
         OR (
           v_scope = 'business'
           AND membership_capability.organization_id = p_organization_id
           AND membership_capability.business_id = p_business_id
           AND (
             membership.scope_type = 'platform'
             OR (
               membership.scope_type = 'organization'
               AND membership.organization_id = p_organization_id
             )
             OR (
               membership.scope_type = 'business'
               AND membership.business_id = p_business_id
             )
           )
         )
       )
  );
END;
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
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_role_code IS NULL THEN RETURN false; END IF;

  IF p_scope_type = 'organization'
     AND p_business_id IS NULL
     AND p_role_code = 'global_waiter' THEN
    RETURN private.multibusiness_has_capability(
      'organization.manage_global_waiters', p_organization_id, NULL
    );
  END IF;

  IF p_scope_type = 'business'
     AND p_business_id IS NOT NULL
     AND p_role_code IN (
       'business_staff', 'local_waiter', 'local_kitchen', 'local_supervisor'
     ) THEN
    RETURN private.multibusiness_has_capability(
      'business.manage_staff', p_organization_id, p_business_id
    );
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_can_list_business_context(
  p_business_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.businesses AS business
        JOIN public.organizations AS organization
          ON organization.id = business.organization_id
       WHERE business.id = p_business_id
         AND business.lifecycle_status NOT IN ('archived', 'retired')
         AND organization.lifecycle_status <> 'retired'
         AND EXISTS (
           SELECT 1
             FROM public.memberships AS membership
            WHERE membership.user_id = auth.uid()
              AND membership.status = 'active'
              AND (
                membership.scope_type = 'platform'
                OR (
                  membership.scope_type = 'business'
                  AND membership.business_id = business.id
                )
                OR (
                  membership.scope_type = 'organization'
                  AND membership.organization_id = business.organization_id
                  AND (
                    membership.role_code <> 'global_waiter'
                    AND EXISTS (
                      SELECT 1
                        FROM public.membership_capabilities AS scoped_management
                        JOIN public.capabilities AS capability
                          ON capability.code = scoped_management.capability_code
                       WHERE scoped_management.membership_id = membership.id
                         AND scoped_management.organization_id = business.organization_id
                         AND scoped_management.business_id IS NULL
                         AND scoped_management.revoked_at IS NULL
                         AND capability.is_active
                         AND capability.scope_type = 'organization'
                         AND capability.code IN (
                           'organization.manage_global_waiters',
                           'organization.manage_tables'
                         )
                    )
                  )
                  OR EXISTS (
                    SELECT 1
                      FROM public.membership_capabilities AS scoped_access
                      JOIN public.capabilities AS capability
                        ON capability.code = scoped_access.capability_code
                     WHERE scoped_access.membership_id = membership.id
                       AND scoped_access.organization_id = business.organization_id
                       AND scoped_access.business_id = business.id
                       AND scoped_access.revoked_at IS NULL
                       AND capability.is_active
                       AND capability.scope_type = 'business'
                       AND capability.code IN (
                         'business.operate_orders', 'business.charge_orders',
                         'business.open_cash', 'business.close_cash',
                         'business.update_preparation', 'business.manage_catalog',
                         'business.manage_inventory', 'business.manage_staff'
                       )
                  )
                )
              )
         )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_multibusiness_context()
RETURNS TABLE (
  organization_id uuid,
  organization_slug text,
  organization_name text,
  organization_timezone text,
  business_id uuid,
  business_slug text,
  business_display_name text,
  business_timezone text,
  business_lifecycle_status text,
  membership_id uuid,
  membership_scope_type text,
  membership_role_code text,
  capability_codes text[]
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
WITH visible_businesses AS (
  SELECT business.*
    FROM public.businesses AS business
    JOIN public.organizations AS organization
      ON organization.id = business.organization_id
   WHERE auth.uid() IS NOT NULL
     AND private.multibusiness_can_list_business_context(business.id)
)
SELECT
  organization.id,
  organization.slug,
  organization.name,
  organization.timezone,
  business.id,
  business.slug,
  business.display_name,
  business.timezone,
  business.lifecycle_status,
  effective_membership.id,
  effective_membership.scope_type,
  effective_membership.role_code,
  COALESCE(
    (
      SELECT array_agg(DISTINCT membership_capability.capability_code ORDER BY membership_capability.capability_code)
        FROM public.memberships AS membership
        JOIN public.membership_capabilities AS membership_capability
          ON membership_capability.membership_id = membership.id
        JOIN public.capabilities AS capability
          ON capability.code = membership_capability.capability_code
       WHERE membership.user_id = auth.uid()
         AND membership.status = 'active'
         AND membership_capability.revoked_at IS NULL
         AND capability.is_active
         AND membership_capability.capability_code NOT IN (
           'organization.operate_orders', 'organization.charge_orders'
         )
         AND (
           membership.scope_type = 'platform'
           OR (
             membership.scope_type = 'organization'
             AND membership.organization_id = business.organization_id
           )
           OR (
             membership.scope_type = 'business'
             AND membership.business_id = business.id
           )
         )
         AND (
           (
             capability.scope_type = 'platform'
             AND membership_capability.organization_id IS NULL
             AND membership_capability.business_id IS NULL
           )
           OR (
             capability.scope_type = 'organization'
             AND membership_capability.organization_id = business.organization_id
             AND membership_capability.business_id IS NULL
           )
           OR (
             capability.scope_type = 'business'
             AND membership_capability.organization_id = business.organization_id
             AND membership_capability.business_id = business.id
           )
         )
    ),
    ARRAY[]::text[]
  )
  FROM visible_businesses AS business
  JOIN public.organizations AS organization
    ON organization.id = business.organization_id
  LEFT JOIN LATERAL (
    SELECT membership.id, membership.scope_type, membership.role_code
      FROM public.memberships AS membership
     WHERE membership.user_id = auth.uid()
       AND membership.status = 'active'
       AND (
         membership.scope_type = 'platform'
         OR (
           membership.scope_type = 'organization'
           AND membership.organization_id = business.organization_id
         )
         OR (
           membership.scope_type = 'business'
           AND membership.business_id = business.id
         )
       )
     ORDER BY CASE
       WHEN membership.scope_type = 'business' AND membership.role_code = 'business_owner' THEN 1
       WHEN membership.scope_type = 'business' THEN 2
       WHEN membership.scope_type = 'organization' THEN 3
       ELSE 4
     END, membership.created_at DESC
     LIMIT 1
  ) AS effective_membership ON true
 ORDER BY organization.name, business.display_name;
$$;

-- Role creation is bounded by a fixed allowlist and by the actor's own
-- delegable capabilities. No caller-supplied capability can escape a
-- business scope or grant full owner/platform authority.
CREATE OR REPLACE FUNCTION public.save_business_staff_role(
  p_business_id uuid,
  p_role_id uuid,
  p_name text,
  p_description text,
  p_capability_codes text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_organization_id uuid;
  v_role public.business_staff_roles%ROWTYPE;
  v_name text := btrim(COALESCE(p_name, ''));
  v_description text := btrim(COALESCE(p_description, ''));
  v_affected_members integer := 0;
  v_requested text[] := ARRAY(
    SELECT DISTINCT code
      FROM pg_catalog.unnest(COALESCE(p_capability_codes, ARRAY[]::text[])) AS code
     ORDER BY code
  );
  v_before text[] := ARRAY[]::text[];
BEGIN
  IF v_actor_id IS NULL OR p_business_id IS NULL
     OR char_length(v_name) < 2 OR char_length(v_name) > 48
     OR char_length(v_description) > 180 THEN
    RAISE EXCEPTION 'Revisa el nombre y la descripción del rango';
  END IF;

  SELECT business.organization_id
    INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.lifecycle_status = 'active';

  IF v_organization_id IS NULL
     OR NOT private.multibusiness_has_capability(
       'business.manage_staff', v_organization_id, p_business_id
     ) THEN
    RAISE EXCEPTION 'No tienes permiso para administrar rangos de este negocio';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.unnest(v_requested) AS requested(code)
     WHERE requested.code <> ALL (private.business_staff_delegable_capability_codes())
  ) THEN
    RAISE EXCEPTION 'El rango contiene un permiso no permitido';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.unnest(v_requested) AS requested(code)
      LEFT JOIN public.capabilities AS capability
        ON capability.code = requested.code
     WHERE capability.code IS NULL
        OR NOT capability.is_active
        OR capability.scope_type <> 'business'
        OR NOT (
          private.multibusiness_has_capability(
            requested.code, v_organization_id, p_business_id
          )
          OR (
            requested.code IN ('business.open_cash', 'business.close_cash')
            AND private.multibusiness_has_capability(
              'business.manage_cash', v_organization_id, p_business_id
            )
          )
        )
  ) THEN
    RAISE EXCEPTION 'No puedes delegar uno o más permisos seleccionados';
  END IF;

  IF p_role_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.business_staff_roles AS existing_role
       WHERE existing_role.business_id = p_business_id
         AND existing_role.is_active
         AND lower(existing_role.name) = lower(v_name)
    ) THEN
      RAISE EXCEPTION 'Ya existe un rango con ese nombre';
    END IF;

    INSERT INTO public.business_staff_roles (
      business_id, role_key, name, description, created_by
    ) VALUES (
      p_business_id,
      'custom:' || pg_catalog.gen_random_uuid()::text,
      v_name,
      v_description,
      v_actor_id
    )
    RETURNING * INTO v_role;
  ELSE
    SELECT * INTO v_role
      FROM public.business_staff_roles AS existing_role
     WHERE existing_role.id = p_role_id
       AND existing_role.business_id = p_business_id
       AND existing_role.is_active
     FOR UPDATE;

    IF NOT FOUND OR v_role.is_system THEN
      RAISE EXCEPTION 'Ese rango no se puede editar';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.business_staff_roles AS other_role
       WHERE other_role.business_id = p_business_id
         AND other_role.is_active
         AND other_role.id <> p_role_id
         AND lower(other_role.name) = lower(v_name)
    ) THEN
      RAISE EXCEPTION 'Ya existe otro rango con ese nombre';
    END IF;

    SELECT COALESCE(array_agg(role_capability.capability_code ORDER BY role_capability.capability_code), ARRAY[]::text[])
      INTO v_before
      FROM public.business_staff_role_capabilities AS role_capability
     WHERE role_capability.role_id = p_role_id;

    UPDATE public.business_staff_roles
       SET name = v_name,
           description = v_description,
           updated_at = now()
     WHERE id = p_role_id
     RETURNING * INTO v_role;

    DELETE FROM public.business_staff_role_capabilities
     WHERE role_id = p_role_id;
  END IF;

  INSERT INTO public.business_staff_role_capabilities (
    business_id, role_id, capability_code
  )
  SELECT p_business_id, v_role.id, requested.code
    FROM pg_catalog.unnest(v_requested) AS requested(code);

  IF p_role_id IS NOT NULL THEN
    SELECT count(*)::integer
      INTO v_affected_members
      FROM public.memberships AS membership
     WHERE membership.staff_role_id = v_role.id
       AND membership.status = 'active';

    UPDATE public.membership_capabilities AS old_grant
       SET revoked_by = v_actor_id,
           revoked_at = now(),
           revocation_reason = 'Permisos reemplazados al actualizar el rango local'
      FROM public.memberships AS membership
     WHERE membership.id = old_grant.membership_id
       AND membership.staff_role_id = v_role.id
       AND membership.status <> 'revoked'
       AND old_grant.organization_id = v_organization_id
       AND old_grant.business_id = p_business_id
       AND old_grant.revoked_at IS NULL
       AND old_grant.capability_code = ANY (
         private.business_staff_delegable_capability_codes()
       );

    INSERT INTO public.membership_capabilities (
      membership_id, capability_code, organization_id, business_id,
      granted_by, grant_reason
    )
    SELECT
      membership.id,
      role_capability.capability_code,
      v_organization_id,
      p_business_id,
      v_actor_id,
      'Permiso local derivado del rango ' || v_role.name
    FROM public.memberships AS membership
    JOIN public.business_staff_role_capabilities AS role_capability
      ON role_capability.role_id = v_role.id
     AND role_capability.business_id = p_business_id
    WHERE membership.staff_role_id = v_role.id
      AND membership.status <> 'revoked';
  END IF;

  INSERT INTO public.audit_events (
    actor_user_id, organization_id, business_id, action,
    entity_type, entity_id, reason, metadata
  ) VALUES (
    v_actor_id, v_organization_id, p_business_id,
    CASE WHEN p_role_id IS NULL THEN 'staff_role.created' ELSE 'staff_role.updated' END,
    'business_staff_role', v_role.id,
    'Rango local configurado por un responsable autorizado',
    pg_catalog.jsonb_build_object(
      'name', v_name,
      'previous_capabilities', v_before,
      'capabilities', v_requested,
      'affected_active_members', v_affected_members
    )
  );

  RETURN v_role.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_business_staff_role(p_role_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_role public.business_staff_roles%ROWTYPE;
  v_organization_id uuid;
BEGIN
  SELECT role.* INTO v_role
    FROM public.business_staff_roles AS role
   WHERE role.id = p_role_id AND role.is_active
   FOR UPDATE;
  IF NOT FOUND OR v_role.is_system THEN
    RAISE EXCEPTION 'Ese rango integrado no se puede archivar';
  END IF;

  SELECT business.organization_id INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = v_role.business_id;
  IF v_actor_id IS NULL OR NOT private.multibusiness_has_capability(
    'business.manage_staff', v_organization_id, v_role.business_id
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para archivar rangos de este negocio';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.memberships AS membership
     WHERE membership.staff_role_id = v_role.id
       AND membership.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Primero reasigna al personal que usa este rango';
  END IF;

  UPDATE public.business_staff_roles
     SET is_active = false, archived_at = now(), updated_at = now()
   WHERE id = v_role.id;

  INSERT INTO public.audit_events (
    actor_user_id, organization_id, business_id, action,
    entity_type, entity_id, reason, metadata
  ) VALUES (
    v_actor_id, v_organization_id, v_role.business_id, 'staff_role.archived',
    'business_staff_role', v_role.id, 'Rango local archivado',
    pg_catalog.jsonb_build_object('name', v_role.name)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_business_staff_membership_with_role(
  p_user_id uuid,
  p_business_id uuid,
  p_role_id uuid,
  p_must_change_password boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_organization_id uuid;
  v_role public.business_staff_roles%ROWTYPE;
  v_membership_id uuid;
  v_existing_count integer;
  v_action text := 'staff_assignment.created';
  v_capability text;
BEGIN
  IF v_actor_id IS NULL OR p_user_id IS NULL OR p_business_id IS NULL OR p_role_id IS NULL THEN
    RAISE EXCEPTION 'Faltan datos para asignar personal';
  END IF;
  IF p_user_id = v_actor_id THEN RAISE EXCEPTION 'No puedes asignarte como personal'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users AS user_account WHERE user_account.id = p_user_id) THEN
    RAISE EXCEPTION 'La cuenta de acceso no existe';
  END IF;

  SELECT business.organization_id INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = p_business_id AND business.lifecycle_status = 'active';
  IF v_organization_id IS NULL THEN RAISE EXCEPTION 'El negocio no está disponible'; END IF;

  SELECT role.* INTO v_role
    FROM public.business_staff_roles AS role
   WHERE role.id = p_role_id AND role.business_id = p_business_id AND role.is_active;
  IF NOT FOUND OR NOT private.business_staff_actor_can_assign_role(
    v_actor_id, p_business_id, p_role_id
  ) THEN
    RAISE EXCEPTION 'No puedes asignar este rango o sus permisos';
  END IF;
  IF NOT private.multibusiness_can_manage_membership(
    'business', v_organization_id, p_business_id, 'business_staff'
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para administrar personal de este negocio';
  END IF;

  SELECT count(*)::integer, min(membership.id::text)::uuid
    INTO v_existing_count, v_membership_id
    FROM public.memberships AS membership
   WHERE membership.user_id = p_user_id
     AND membership.scope_type = 'business'
     AND membership.organization_id = v_organization_id
     AND membership.business_id = p_business_id
     AND membership.role_code <> 'business_owner'
     AND membership.status <> 'revoked';
  IF v_existing_count > 1 THEN
    RAISE EXCEPTION 'La cuenta tiene accesos locales duplicados; solicita revisión antes de cambiarla';
  END IF;
  IF v_existing_count = 1 AND EXISTS (
    SELECT 1 FROM public.memberships AS membership
     WHERE membership.id = v_membership_id AND membership.status = 'active'
  ) THEN
    RAISE EXCEPTION 'La cuenta ya pertenece al equipo. Selecciónala desde la lista para cambiar su rango.';
  END IF;

  IF v_membership_id IS NOT NULL THEN
    UPDATE public.memberships
       SET role_code = CASE WHEN v_role.system_code IN (
             'local_waiter', 'local_kitchen', 'local_supervisor'
           ) THEN v_role.system_code ELSE 'business_staff' END,
           staff_role_id = p_role_id,
           status = 'active',
           deactivated_by = NULL,
           deactivated_at = NULL,
           deactivation_reason = NULL,
           updated_at = now()
     WHERE id = v_membership_id;
    v_action := 'staff_assignment.reactivated';
  ELSE
    INSERT INTO public.memberships (
      user_id, scope_type, organization_id, business_id, role_code,
      staff_role_id, status, must_change_password, created_by
    ) VALUES (
      p_user_id, 'business', v_organization_id, p_business_id,
      CASE WHEN v_role.system_code IN (
        'local_waiter', 'local_kitchen', 'local_supervisor'
      ) THEN v_role.system_code ELSE 'business_staff' END,
      p_role_id, 'active', COALESCE(p_must_change_password, false), v_actor_id
    ) RETURNING id INTO v_membership_id;
  END IF;

  UPDATE public.membership_capabilities AS old_capability
     SET revoked_by = v_actor_id,
         revoked_at = now(),
         revocation_reason = 'Permisos reemplazados al asignar un rango local'
   WHERE old_capability.membership_id = v_membership_id
     AND old_capability.business_id = p_business_id
     AND old_capability.revoked_at IS NULL
     AND old_capability.capability_code = ANY (
       private.business_staff_delegable_capability_codes()
     );

  FOR v_capability IN
    SELECT role_capability.capability_code
      FROM public.business_staff_role_capabilities AS role_capability
     WHERE role_capability.role_id = p_role_id
       AND role_capability.business_id = p_business_id
  LOOP
    INSERT INTO public.membership_capabilities (
      membership_id, capability_code, organization_id, business_id,
      granted_by, grant_reason
    ) VALUES (
      v_membership_id, v_capability, v_organization_id, p_business_id,
      v_actor_id, 'Permiso local derivado del rango ' || v_role.name
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  INSERT INTO public.audit_events (
    actor_user_id, organization_id, business_id, action,
    entity_type, entity_id, reason, metadata
  ) VALUES (
    v_actor_id, v_organization_id, p_business_id, v_action,
    'membership', v_membership_id, 'Acceso local asignado por un responsable del negocio',
    pg_catalog.jsonb_build_object(
      'user_id', p_user_id,
      'role_id', p_role_id,
      'role_name', v_role.name,
      'capabilities', (
        SELECT COALESCE(pg_catalog.jsonb_agg(role_capability.capability_code ORDER BY role_capability.capability_code), '[]'::jsonb)
          FROM public.business_staff_role_capabilities AS role_capability
         WHERE role_capability.role_id = p_role_id
      )
    )
  );
  RETURN v_membership_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_business_staff_membership_role(
  p_membership_id uuid,
  p_role_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_target public.memberships%ROWTYPE;
  v_role public.business_staff_roles%ROWTYPE;
  v_capability text;
BEGIN
  SELECT * INTO v_target
    FROM public.memberships AS membership
   WHERE membership.id = p_membership_id
     AND membership.scope_type = 'business'
     AND membership.role_code <> 'business_owner'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró el acceso local'; END IF;
  IF v_target.user_id = v_actor_id THEN RAISE EXCEPTION 'No puedes cambiar tu propio rango'; END IF;

  SELECT * INTO v_role
    FROM public.business_staff_roles AS role
   WHERE role.id = p_role_id
     AND role.business_id = v_target.business_id
     AND role.is_active;
  IF NOT FOUND OR NOT private.business_staff_actor_can_assign_role(
    v_actor_id, v_target.business_id, p_role_id
  ) THEN
    RAISE EXCEPTION 'No puedes asignar este rango o sus permisos';
  END IF;
  IF NOT private.multibusiness_can_manage_membership(
    'business', v_target.organization_id, v_target.business_id, 'business_staff'
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para administrar personal de este negocio';
  END IF;

  UPDATE public.memberships
     SET role_code = CASE WHEN v_role.system_code IN (
           'local_waiter', 'local_kitchen', 'local_supervisor'
         ) THEN v_role.system_code ELSE 'business_staff' END,
         staff_role_id = p_role_id,
         updated_at = now()
   WHERE id = v_target.id;

  UPDATE public.membership_capabilities AS old_capability
     SET revoked_by = v_actor_id,
         revoked_at = now(),
         revocation_reason = 'Permisos reemplazados al asignar un rango local'
   WHERE old_capability.membership_id = v_target.id
     AND old_capability.organization_id = v_target.organization_id
     AND old_capability.business_id = v_target.business_id
     AND old_capability.revoked_at IS NULL
     AND old_capability.capability_code = ANY (
       private.business_staff_delegable_capability_codes()
     );

  FOR v_capability IN
    SELECT role_capability.capability_code
      FROM public.business_staff_role_capabilities AS role_capability
     WHERE role_capability.role_id = p_role_id
       AND role_capability.business_id = v_target.business_id
  LOOP
    INSERT INTO public.membership_capabilities (
      membership_id, capability_code, organization_id, business_id,
      granted_by, grant_reason
    ) VALUES (
      v_target.id, v_capability, v_target.organization_id, v_target.business_id,
      v_actor_id, 'Permiso local derivado del rango ' || v_role.name
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  INSERT INTO public.audit_events (
    actor_user_id, organization_id, business_id, action,
    entity_type, entity_id, reason, metadata
  ) VALUES (
    v_actor_id, v_target.organization_id, v_target.business_id, 'staff_assignment.role_changed',
    'membership', v_target.id, 'Rango local actualizado por un responsable del negocio',
    pg_catalog.jsonb_build_object(
      'user_id', v_target.user_id,
      'previous_role_id', v_target.staff_role_id,
      'role_id', p_role_id,
      'role_name', v_role.name,
      'capabilities', (
        SELECT COALESCE(pg_catalog.jsonb_agg(role_capability.capability_code ORDER BY role_capability.capability_code), '[]'::jsonb)
          FROM public.business_staff_role_capabilities AS role_capability
         WHERE role_capability.role_id = p_role_id
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_global_waiter_business_access(
  p_membership_id uuid,
  p_business_id uuid,
  p_enabled boolean,
  p_reason text DEFAULT 'Acceso por negocio ajustado desde Personal global'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_organization_id uuid;
  v_user_id uuid;
  v_business_name text;
  v_business_status text;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_code text;
  v_changed integer;
BEGIN
  IF v_actor_id IS NULL OR p_membership_id IS NULL OR p_business_id IS NULL
     OR p_enabled IS NULL OR char_length(v_reason) < 3 OR char_length(v_reason) > 240 THEN
    RAISE EXCEPTION 'La asignación enviada no es válida';
  END IF;

  SELECT membership.organization_id, membership.user_id
    INTO v_organization_id, v_user_id
    FROM public.memberships AS membership
   WHERE membership.id = p_membership_id
     AND membership.scope_type = 'organization'
     AND membership.role_code = 'global_waiter'
     AND membership.status = 'active'
     AND membership.user_id <> v_actor_id;
  IF v_organization_id IS NULL THEN RAISE EXCEPTION 'La mesera global no está activa'; END IF;
  IF NOT private.multibusiness_has_capability(
    'organization.manage_global_waiters', v_organization_id, NULL
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para administrar meseras globales';
  END IF;

  SELECT business.display_name, business.lifecycle_status
    INTO v_business_name, v_business_status
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.organization_id = v_organization_id
     AND business.lifecycle_status NOT IN ('archived', 'retired');
  IF v_business_name IS NULL THEN RAISE EXCEPTION 'El negocio no está disponible'; END IF;
  IF p_enabled AND v_business_status <> 'active' THEN
    RAISE EXCEPTION 'El negocio debe estar activo para habilitar el acceso';
  END IF;
  IF p_enabled AND NOT private.business_license_is_available(p_business_id) THEN
    RAISE EXCEPTION 'La licencia de este negocio no está vigente';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_membership_id::text || ':' || p_business_id::text, 782)
  );

  FOREACH v_code IN ARRAY ARRAY['business.operate_orders', 'business.charge_orders']::text[]
  LOOP
    IF p_enabled THEN
      INSERT INTO public.membership_capabilities (
        membership_id, capability_code, organization_id, business_id,
        granted_by, grant_reason
      ) VALUES (
        p_membership_id, v_code, v_organization_id, p_business_id,
        v_actor_id, v_reason
      ) ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_changed = ROW_COUNT;
    ELSE
      UPDATE public.membership_capabilities AS capability
         SET revoked_by = v_actor_id,
             revoked_at = now(),
             revocation_reason = v_reason
       WHERE capability.membership_id = p_membership_id
         AND capability.capability_code = v_code
         AND capability.organization_id = v_organization_id
         AND capability.business_id = p_business_id
         AND capability.revoked_at IS NULL;
      GET DIAGNOSTICS v_changed = ROW_COUNT;
    END IF;

    IF v_changed > 0 THEN
      INSERT INTO public.audit_events (
        actor_user_id, organization_id, business_id, action,
        entity_type, entity_id, reason, metadata
      ) VALUES (
        v_actor_id, v_organization_id, p_business_id,
        CASE WHEN p_enabled THEN 'global_waiter.business_access.granted' ELSE 'global_waiter.business_access.revoked' END,
        'membership', p_membership_id, v_reason,
        pg_catalog.jsonb_build_object(
          'user_id', v_user_id,
          'business_name', v_business_name,
          'capability_code', v_code
        )
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_business_owner(
  p_business_id uuid,
  p_new_owner_user_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_organization_id uuid;
  v_lifecycle_status text;
  v_active_owner_count integer;
  v_old_owner_membership_id uuid;
  v_old_owner_user_id uuid;
  v_new_owner_membership_id uuid;
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF v_actor_id IS NULL OR p_business_id IS NULL OR p_new_owner_user_id IS NULL
     OR char_length(v_reason) < 4 OR char_length(v_reason) > 240 THEN
    RAISE EXCEPTION 'El cambio de dueño requiere negocio, persona y motivo válidos';
  END IF;
  IF NOT private.multibusiness_has_capability('platform.manage_businesses', NULL, NULL) THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar al dueño de un negocio';
  END IF;

  SELECT business.organization_id, business.lifecycle_status
    INTO v_organization_id, v_lifecycle_status
    FROM public.businesses AS business
   WHERE business.id = p_business_id
   FOR UPDATE;
  IF v_organization_id IS NULL OR v_lifecycle_status IN ('archived', 'retired') THEN
    RAISE EXCEPTION 'El negocio no está disponible para transferir';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS profile
     WHERE profile.id = p_new_owner_user_id
       AND profile.is_active
       AND EXISTS (
         SELECT 1 FROM auth.users AS auth_user
          WHERE auth_user.id = profile.id
            AND auth_user.deleted_at IS NULL
            AND (auth_user.banned_until IS NULL OR auth_user.banned_until <= now())
       )
  ) THEN
    RAISE EXCEPTION 'La cuenta del nuevo dueño no existe o está desactivada';
  END IF;

  SELECT count(*)::integer
    INTO v_active_owner_count
    FROM public.memberships AS membership
   WHERE membership.scope_type = 'business'
     AND membership.organization_id = v_organization_id
     AND membership.business_id = p_business_id
     AND membership.role_code = 'business_owner'
     AND membership.status = 'active';
  IF v_active_owner_count <> 1 THEN
    RAISE EXCEPTION 'El negocio debe tener exactamente un dueño activo antes del cambio';
  END IF;

  SELECT membership.id, membership.user_id
    INTO v_old_owner_membership_id, v_old_owner_user_id
    FROM public.memberships AS membership
   WHERE membership.scope_type = 'business'
     AND membership.organization_id = v_organization_id
     AND membership.business_id = p_business_id
     AND membership.role_code = 'business_owner'
     AND membership.status = 'active'
   FOR UPDATE;
  IF v_old_owner_user_id = p_new_owner_user_id THEN
    RAISE EXCEPTION 'Esa persona ya es el dueño de este negocio';
  END IF;

  SELECT membership.id
    INTO v_new_owner_membership_id
    FROM public.memberships AS membership
   WHERE membership.user_id = p_new_owner_user_id
     AND membership.scope_type = 'business'
     AND membership.organization_id = v_organization_id
     AND membership.business_id = p_business_id
     AND membership.role_code = 'business_owner'
     AND membership.status = 'inactive'
   ORDER BY membership.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_new_owner_membership_id IS NULL THEN
    INSERT INTO public.memberships (
      user_id, scope_type, organization_id, business_id, role_code,
      status, created_by, must_change_password
    ) VALUES (
      p_new_owner_user_id, 'business', v_organization_id, p_business_id,
      'business_owner', 'active', v_actor_id, false
    )
    RETURNING id INTO v_new_owner_membership_id;
  ELSE
    UPDATE public.memberships
       SET status = 'active',
           deactivated_at = NULL,
           deactivation_reason = NULL,
           deactivated_by = NULL,
           updated_at = now()
     WHERE id = v_new_owner_membership_id;
  END IF;

  -- Match the new owner's module access to the current owner's active grants;
  -- keep all historical grant/revocation rows for both identities intact.
  UPDATE public.membership_capabilities AS target_capability
     SET revoked_by = v_actor_id,
         revoked_at = now(),
         revocation_reason = 'Permisos sustituidos durante transferencia del dueño'
   WHERE target_capability.membership_id = v_new_owner_membership_id
     AND target_capability.organization_id = v_organization_id
     AND target_capability.business_id = p_business_id
     AND target_capability.revoked_at IS NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.membership_capabilities AS current_capability
        WHERE current_capability.membership_id = v_old_owner_membership_id
          AND current_capability.organization_id = v_organization_id
          AND current_capability.business_id = p_business_id
          AND current_capability.capability_code = target_capability.capability_code
          AND current_capability.revoked_at IS NULL
     );

  INSERT INTO public.membership_capabilities (
    membership_id, capability_code, organization_id, business_id,
    granted_by, grant_reason
  )
  SELECT
    v_new_owner_membership_id, current_capability.capability_code,
    v_organization_id, p_business_id, v_actor_id,
    'Permiso de dueño transferido desde la membresía anterior'
    FROM public.membership_capabilities AS current_capability
   WHERE current_capability.membership_id = v_old_owner_membership_id
     AND current_capability.organization_id = v_organization_id
     AND current_capability.business_id = p_business_id
     AND current_capability.revoked_at IS NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.membership_capabilities AS target_capability
        WHERE target_capability.membership_id = v_new_owner_membership_id
          AND target_capability.capability_code = current_capability.capability_code
          AND target_capability.organization_id = v_organization_id
          AND target_capability.business_id = p_business_id
          AND target_capability.revoked_at IS NULL
     )
  ON CONFLICT DO NOTHING;

  UPDATE public.memberships
     SET status = 'revoked',
         deactivated_at = now(),
         deactivation_reason = v_reason,
         deactivated_by = v_actor_id,
         updated_at = now()
   WHERE id = v_old_owner_membership_id;

  INSERT INTO public.audit_events (
    actor_user_id, organization_id, business_id, action,
    entity_type, entity_id, reason, metadata
  ) VALUES (
    v_actor_id, v_organization_id, p_business_id, 'business.owner.transferred',
    'membership', v_new_owner_membership_id, v_reason,
    pg_catalog.jsonb_build_object(
      'previous_owner_user_id', v_old_owner_user_id,
      'previous_owner_membership_id', v_old_owner_membership_id,
      'new_owner_user_id', p_new_owner_user_id,
      'new_owner_membership_id', v_new_owner_membership_id,
      'preserved_capabilities', (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(capability.capability_code ORDER BY capability.capability_code),
          '[]'::jsonb
        )
          FROM public.membership_capabilities AS capability
         WHERE capability.membership_id = v_new_owner_membership_id
           AND capability.organization_id = v_organization_id
           AND capability.business_id = p_business_id
           AND capability.revoked_at IS NULL
      )
    )
  );
END;
$$;

-- The coordinator no longer grants local cash permissions. The local owner
-- assigns those through the role builder; legacy data has been transferred.
REVOKE ALL ON FUNCTION public.set_global_waiter_cash_permissions(uuid, uuid, boolean, boolean, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_business_staff_membership_role(uuid, text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.save_business_staff_role(uuid, uuid, text, text, text[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_business_staff_role(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_business_staff_membership_with_role(uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_business_staff_membership_role(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_global_waiter_business_access(uuid, uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transfer_business_owner(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_business_staff_role(uuid, uuid, text, text, text[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_business_staff_role(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_staff_membership_with_role(uuid, uuid, uuid, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_business_staff_membership_role(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_global_waiter_business_access(uuid, uuid, boolean, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_business_owner(uuid, uuid, text)
  TO authenticated;

REVOKE ALL ON FUNCTION private.business_staff_delegable_capability_codes()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.business_staff_actor_can_assign_role(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_staff_role_membership_sync()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.seed_business_staff_roles(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.business_staff_roles_seed_on_business_create()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_has_capability(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_can_manage_membership(text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_can_list_business_context(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_multibusiness_context()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_multibusiness_context() TO authenticated;
GRANT EXECUTE ON FUNCTION private.multibusiness_has_capability(text, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.multibusiness_can_manage_membership(text, uuid, uuid, text)
  TO authenticated;
