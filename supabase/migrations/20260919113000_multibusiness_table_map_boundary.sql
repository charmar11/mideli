-- Make the physical table map belong to the organization, not to a single
-- restaurant. The floor is shared by all businesses in Rincón 404 Food Park;
-- orders and accounts remain business-scoped inside each table visit.

ALTER TABLE public.table_zones
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.restaurant_tables
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.table_map_labels
  ADD COLUMN IF NOT EXISTS organization_id uuid;

DO $$
DECLARE
  v_organization_id uuid;
BEGIN
  SELECT id
    INTO v_organization_id
    FROM public.organizations
   WHERE slug = 'rincon-404-food-park';

  IF v_organization_id IS NULL THEN
    RAISE NOTICE
      'Se difiere la asociación del plano: todavía no existe Rincón 404 Food Park';
    RETURN;
  END IF;

  UPDATE public.table_zones
     SET organization_id = v_organization_id
   WHERE organization_id IS NULL;

  UPDATE public.restaurant_tables AS restaurant_table
     SET organization_id = COALESCE(zone.organization_id, v_organization_id)
    FROM public.table_zones AS zone
   WHERE restaurant_table.organization_id IS NULL
     AND zone.id = restaurant_table.zone_id;

  UPDATE public.restaurant_tables
     SET organization_id = v_organization_id
   WHERE organization_id IS NULL;

  UPDATE public.table_map_labels
     SET organization_id = v_organization_id
   WHERE organization_id IS NULL;

  IF EXISTS (
    SELECT 1 FROM public.table_zones WHERE organization_id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.restaurant_tables WHERE organization_id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.table_map_labels WHERE organization_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'No se pudo asociar todo el plano a la organización de Rincón 404 Food Park';
  END IF;

  EXECUTE 'ALTER TABLE public.table_zones ALTER COLUMN organization_id SET NOT NULL';
  EXECUTE 'ALTER TABLE public.restaurant_tables ALTER COLUMN organization_id SET NOT NULL';
  EXECUTE 'ALTER TABLE public.table_map_labels ALTER COLUMN organization_id SET NOT NULL';
END;
$$;

ALTER TABLE public.table_zones
  ADD CONSTRAINT table_zones_organization_id_fkey
  FOREIGN KEY (organization_id)
  REFERENCES public.organizations(id)
  ON DELETE RESTRICT;

ALTER TABLE public.table_zones
  ADD CONSTRAINT table_zones_organization_id_id_key
  UNIQUE (organization_id, id);

ALTER TABLE public.restaurant_tables
  ADD CONSTRAINT restaurant_tables_organization_id_fkey
  FOREIGN KEY (organization_id)
  REFERENCES public.organizations(id)
  ON DELETE RESTRICT;

ALTER TABLE public.restaurant_tables
  ADD CONSTRAINT restaurant_tables_organization_id_id_key
  UNIQUE (organization_id, id);

ALTER TABLE public.restaurant_tables
  ADD CONSTRAINT restaurant_tables_zone_organization_fkey
  FOREIGN KEY (organization_id, zone_id)
  REFERENCES public.table_zones(organization_id, id)
  ON DELETE RESTRICT;

ALTER TABLE public.table_map_labels
  ADD CONSTRAINT table_map_labels_organization_id_fkey
  FOREIGN KEY (organization_id)
  REFERENCES public.organizations(id)
  ON DELETE RESTRICT;

ALTER TABLE public.table_visits
  ADD CONSTRAINT table_visits_table_organization_fkey
  FOREIGN KEY (organization_id, table_id)
  REFERENCES public.restaurant_tables(organization_id, id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS table_zones_organization_active_idx
  ON public.table_zones(organization_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS restaurant_tables_organization_active_idx
  ON public.restaurant_tables(organization_id, is_active, created_at);
CREATE INDEX IF NOT EXISTS table_map_labels_organization_active_idx
  ON public.table_map_labels(organization_id, is_active, sort_order, created_at);

CREATE OR REPLACE FUNCTION private.multibusiness_assign_table_map_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_zone_organization_id uuid;
  v_mideli_organization_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.organization_id IS NOT NULL
     AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'El plano no puede cambiar de organización';
  END IF;

  IF TG_TABLE_NAME = 'restaurant_tables' AND NEW.zone_id IS NOT NULL THEN
    SELECT zone.organization_id
      INTO v_zone_organization_id
      FROM public.table_zones AS zone
     WHERE zone.id = NEW.zone_id;

    IF v_zone_organization_id IS NULL THEN
      RAISE EXCEPTION 'La zona de la mesa no existe o no tiene organización';
    END IF;

    IF NEW.organization_id IS NULL THEN
      NEW.organization_id := v_zone_organization_id;
    ELSIF NEW.organization_id IS DISTINCT FROM v_zone_organization_id THEN
      RAISE EXCEPTION 'La mesa y su zona no pertenecen a la misma organización';
    END IF;
  END IF;

  IF NEW.organization_id IS NULL THEN
    SELECT organization.id
      INTO v_mideli_organization_id
      FROM public.organizations AS organization
     WHERE organization.slug = 'rincon-404-food-park';
    NEW.organization_id := v_mideli_organization_id;
  END IF;

  IF TG_TABLE_NAME = 'restaurant_tables'
     AND NEW.zone_id IS NOT NULL
     AND NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo resolver la organización de la mesa';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS table_zones_assign_organization
  ON public.table_zones;
CREATE TRIGGER table_zones_assign_organization
  BEFORE INSERT OR UPDATE ON public.table_zones
  FOR EACH ROW
  EXECUTE FUNCTION private.multibusiness_assign_table_map_organization();

DROP TRIGGER IF EXISTS restaurant_tables_assign_organization
  ON public.restaurant_tables;
CREATE TRIGGER restaurant_tables_assign_organization
  BEFORE INSERT OR UPDATE ON public.restaurant_tables
  FOR EACH ROW
  EXECUTE FUNCTION private.multibusiness_assign_table_map_organization();

DROP TRIGGER IF EXISTS table_map_labels_assign_organization
  ON public.table_map_labels;
CREATE TRIGGER table_map_labels_assign_organization
  BEFORE INSERT OR UPDATE ON public.table_map_labels
  FOR EACH ROW
  EXECUTE FUNCTION private.multibusiness_assign_table_map_organization();

CREATE OR REPLACE FUNCTION private.multibusiness_validate_table_visit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.restaurant_tables AS restaurant_table
     WHERE restaurant_table.id = NEW.table_id
       AND restaurant_table.organization_id = NEW.organization_id
       AND restaurant_table.is_active
  ) THEN
    RAISE EXCEPTION 'La mesa no está disponible en esta organización';
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Table zones viewable by staff" ON public.table_zones;
DROP POLICY IF EXISTS "Table zones insertable by admins" ON public.table_zones;
DROP POLICY IF EXISTS "Table zones updatable by admins" ON public.table_zones;
DROP POLICY IF EXISTS "Restaurant tables viewable by staff" ON public.restaurant_tables;
DROP POLICY IF EXISTS "Restaurant tables insertable by admins" ON public.restaurant_tables;
DROP POLICY IF EXISTS "Restaurant tables updatable by admins" ON public.restaurant_tables;
DROP POLICY IF EXISTS "Table map labels viewable by staff" ON public.table_map_labels;
DROP POLICY IF EXISTS "Table map labels insertable by admins" ON public.table_map_labels;
DROP POLICY IF EXISTS "Table map labels updatable by admins" ON public.table_map_labels;

CREATE POLICY table_zones_viewed_by_organization_membership
  ON public.table_zones FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_organization(organization_id));
CREATE POLICY table_zones_managed_by_organization
  ON public.table_zones FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_has_capability(
      'organization.manage_tables', organization_id, NULL
    )
  );
CREATE POLICY table_zones_updated_by_organization
  ON public.table_zones FOR UPDATE TO authenticated
  USING (
    private.multibusiness_has_capability(
      'organization.manage_tables', organization_id, NULL
    )
  )
  WITH CHECK (
    private.multibusiness_has_capability(
      'organization.manage_tables', organization_id, NULL
    )
  );

CREATE POLICY restaurant_tables_viewed_by_organization_membership
  ON public.restaurant_tables FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_organization(organization_id));
CREATE POLICY restaurant_tables_managed_by_organization
  ON public.restaurant_tables FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_has_capability(
      'organization.manage_tables', organization_id, NULL
    )
  );
CREATE POLICY restaurant_tables_updated_by_organization
  ON public.restaurant_tables FOR UPDATE TO authenticated
  USING (
    private.multibusiness_has_capability(
      'organization.manage_tables', organization_id, NULL
    )
  )
  WITH CHECK (
    private.multibusiness_has_capability(
      'organization.manage_tables', organization_id, NULL
    )
  );

CREATE POLICY table_map_labels_viewed_by_organization_membership
  ON public.table_map_labels FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_organization(organization_id));
CREATE POLICY table_map_labels_managed_by_organization
  ON public.table_map_labels FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_has_capability(
      'organization.manage_tables', organization_id, NULL
    )
  );
CREATE POLICY table_map_labels_updated_by_organization
  ON public.table_map_labels FOR UPDATE TO authenticated
  USING (
    private.multibusiness_has_capability(
      'organization.manage_tables', organization_id, NULL
    )
  )
  WITH CHECK (
    private.multibusiness_has_capability(
      'organization.manage_tables', organization_id, NULL
    )
  );

REVOKE ALL ON TABLE
  public.table_zones,
  public.restaurant_tables,
  public.table_map_labels
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE
  public.table_zones,
  public.restaurant_tables,
  public.table_map_labels
  TO authenticated;

-- The first Mideli owner currently administers the shared floor. This is an
-- additive transition membership, not a new login. A future organization
-- coordinator can receive the same capability without changing this map.
INSERT INTO public.memberships (
  user_id,
  scope_type,
  organization_id,
  role_code,
  status,
  created_by
)
SELECT
  membership.user_id,
  'organization',
  membership.organization_id,
  'organization_owner',
  'active',
  membership.user_id
  FROM public.memberships AS membership
  JOIN public.businesses AS business
    ON business.id = membership.business_id
   AND business.organization_id = membership.organization_id
 WHERE membership.scope_type = 'business'
   AND membership.role_code = 'business_owner'
   AND membership.status = 'active'
   AND business.slug = 'mideli'
   AND business.organization_id = (
     SELECT id FROM public.organizations WHERE slug = 'rincon-404-food-park'
   )
ON CONFLICT DO NOTHING;

INSERT INTO public.membership_capabilities (
  membership_id,
  capability_code,
  organization_id,
  business_id,
  granted_by,
  grant_reason
)
SELECT
  membership.id,
  'organization.manage_tables',
  membership.organization_id,
  NULL,
  membership.user_id,
  'Permiso transitorio del dueño actual para administrar el plano compartido'
  FROM public.memberships AS membership
 WHERE membership.scope_type = 'organization'
   AND membership.role_code = 'organization_owner'
   AND membership.status = 'active'
   AND membership.organization_id = (
     SELECT id FROM public.organizations WHERE slug = 'rincon-404-food-park'
   )
ON CONFLICT DO NOTHING;

REVOKE ALL ON FUNCTION private.multibusiness_assign_table_map_organization()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_validate_table_visit()
  FROM PUBLIC, anon, authenticated;
