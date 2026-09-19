-- Give the catalog an explicit business boundary while keeping the current
-- Mideli UI compatible. Orders, inventory and payments are migrated in later
-- slices; this migration only protects categories and menu items.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS business_id uuid;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS business_id uuid;

CREATE OR REPLACE FUNCTION private.multibusiness_business_organization_id(
  p_business_id uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT b.organization_id
    FROM public.businesses AS b
   WHERE b.id = p_business_id;
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_assign_mideli_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.business_id IS NOT NULL
     AND NEW.business_id IS DISTINCT FROM OLD.business_id THEN
    RAISE EXCEPTION 'El negocio de un elemento del catálogo no se puede cambiar';
  END IF;

  IF NEW.business_id IS NULL THEN
    SELECT b.id
      INTO v_business_id
      FROM public.businesses AS b
      JOIN public.organizations AS o
        ON o.id = b.organization_id
     WHERE o.slug = 'rincon-404-food-park'
       AND b.slug = 'mideli'
       AND b.lifecycle_status NOT IN ('archived', 'retired');

    IF v_business_id IS NULL THEN
      RAISE EXCEPTION
        'No se encontró el negocio Mideli para asignar el elemento del catálogo';
    END IF;

    NEW.business_id := v_business_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS categories_assign_multibusiness_scope
  ON public.categories;
CREATE TRIGGER categories_assign_multibusiness_scope
  BEFORE INSERT OR UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION private.multibusiness_assign_mideli_business();

DROP TRIGGER IF EXISTS menu_items_assign_multibusiness_scope
  ON public.menu_items;
CREATE TRIGGER menu_items_assign_multibusiness_scope
  BEFORE INSERT OR UPDATE ON public.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION private.multibusiness_assign_mideli_business();

-- Backfill the existing single-business catalog using the stable business
-- slug, never a copied UUID.
UPDATE public.categories AS category
   SET business_id = business.id
  FROM public.businesses AS business
  JOIN public.organizations AS organization
    ON organization.id = business.organization_id
 WHERE category.business_id IS NULL
   AND organization.slug = 'rincon-404-food-park'
   AND business.slug = 'mideli';

UPDATE public.menu_items AS menu_item
   SET business_id = business.id
  FROM public.businesses AS business
  JOIN public.organizations AS organization
    ON organization.id = business.organization_id
 WHERE menu_item.business_id IS NULL
   AND organization.slug = 'rincon-404-food-park'
   AND business.slug = 'mideli';

DO $$
DECLARE
  v_null_categories integer;
  v_null_menu_items integer;
  v_mismatched_items integer;
BEGIN
  SELECT count(*)
    INTO v_null_categories
    FROM public.categories
   WHERE business_id IS NULL;
  SELECT count(*)
    INTO v_null_menu_items
    FROM public.menu_items
   WHERE business_id IS NULL;

  IF v_null_categories > 0 OR v_null_menu_items > 0 THEN
    RAISE EXCEPTION
      'El catálogo no se pudo asociar completamente (categorías sin negocio: %, productos sin negocio: %)',
      v_null_categories,
      v_null_menu_items;
  END IF;

  SELECT count(*)
    INTO v_mismatched_items
    FROM public.menu_items AS menu_item
    JOIN public.categories AS category
      ON category.id = menu_item.category_id
   WHERE menu_item.business_id IS DISTINCT FROM category.business_id;

  IF v_mismatched_items > 0 THEN
    RAISE EXCEPTION
      'Hay productos cuya categoría pertenece a otro negocio (filas: %)',
      v_mismatched_items;
  END IF;
END;
$$;

ALTER TABLE public.categories
  ALTER COLUMN business_id SET NOT NULL;

ALTER TABLE public.menu_items
  ALTER COLUMN business_id SET NOT NULL;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_business_id_fkey
  FOREIGN KEY (business_id)
  REFERENCES public.businesses(id)
  ON DELETE RESTRICT;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_business_id_id_key
  UNIQUE (business_id, id);

ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_business_id_fkey
  FOREIGN KEY (business_id)
  REFERENCES public.businesses(id)
  ON DELETE RESTRICT;

ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_business_category_fkey
  FOREIGN KEY (business_id, category_id)
  REFERENCES public.categories(business_id, id)
  ON DELETE RESTRICT;

CREATE INDEX menu_items_business_sort_order_idx
  ON public.menu_items (business_id, sort_order, name);

CREATE INDEX categories_business_sort_order_idx
  ON public.categories (business_id, sort_order, name);

-- The old policies exposed the entire catalog to every authenticated profile.
-- Replace them with business membership/capability checks.
DROP POLICY IF EXISTS "Categories viewable by staff" ON public.categories;
DROP POLICY IF EXISTS "Categories managed by admins" ON public.categories;
DROP POLICY IF EXISTS "Categories managed by active admins" ON public.categories;
DROP POLICY IF EXISTS "Menu items viewable by staff" ON public.menu_items;
DROP POLICY IF EXISTS "Menu items managed by admins" ON public.menu_items;

CREATE POLICY categories_viewed_by_business_membership
  ON public.categories
  FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));

CREATE POLICY categories_created_with_catalog_capability
  ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_catalog',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY categories_updated_with_catalog_capability
  ON public.categories
  FOR UPDATE TO authenticated
  USING (
    private.multibusiness_has_capability(
      'business.manage_catalog',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  )
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_catalog',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY categories_deleted_with_catalog_capability
  ON public.categories
  FOR DELETE TO authenticated
  USING (
    private.multibusiness_has_capability(
      'business.manage_catalog',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY menu_items_viewed_by_business_membership
  ON public.menu_items
  FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));

CREATE POLICY menu_items_created_with_catalog_capability
  ON public.menu_items
  FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_catalog',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY menu_items_updated_with_catalog_capability
  ON public.menu_items
  FOR UPDATE TO authenticated
  USING (
    private.multibusiness_has_capability(
      'business.manage_catalog',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  )
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_catalog',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY menu_items_deleted_with_catalog_capability
  ON public.menu_items
  FOR DELETE TO authenticated
  USING (
    private.multibusiness_has_capability(
      'business.manage_catalog',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

-- Reorder only the complete category list for one business. The previous
-- function locked and reordered every category in the database.
CREATE OR REPLACE FUNCTION private.reorder_categories(p_category_ids uuid[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_organization_id uuid;
  v_requested_count integer;
  v_distinct_count integer;
  v_existing_count integer;
  v_matched_count integer;
BEGIN
  IF p_category_ids IS NULL OR cardinality(p_category_ids) = 0 THEN
    RAISE EXCEPTION 'Envía el orden completo de categorías';
  END IF;

  IF array_position(p_category_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'El orden contiene una categoría inválida';
  END IF;

  SELECT category.business_id
    INTO v_business_id
    FROM public.categories AS category
   WHERE category.id = p_category_ids[1];

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'La categoría no pertenece a un negocio válido';
  END IF;

  SELECT private.multibusiness_business_organization_id(v_business_id)
    INTO v_organization_id;

  IF NOT private.multibusiness_has_capability(
    'business.manage_catalog',
    v_organization_id,
    v_business_id
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para ordenar categorías de este negocio';
  END IF;

  LOCK TABLE public.categories IN SHARE ROW EXCLUSIVE MODE;

  SELECT
    COUNT(*)::integer,
    COUNT(DISTINCT requested.category_id)::integer
  INTO v_requested_count, v_distinct_count
  FROM unnest(p_category_ids) AS requested(category_id);

  SELECT COUNT(*)::integer
    INTO v_existing_count
    FROM public.categories AS category
   WHERE category.business_id = v_business_id;

  SELECT COUNT(*)::integer
    INTO v_matched_count
    FROM public.categories AS category
   WHERE category.id = ANY(p_category_ids)
     AND category.business_id = v_business_id;

  IF v_requested_count <> v_distinct_count
     OR v_requested_count <> v_existing_count
     OR v_matched_count <> v_existing_count THEN
    RAISE EXCEPTION 'El orden ya no coincide con las categorías actuales de este negocio';
  END IF;

  UPDATE public.categories AS category
     SET sort_order = requested.position - 1,
         updated_at = now()
    FROM unnest(p_category_ids) WITH ORDINALITY AS requested(category_id, position)
   WHERE category.id = requested.category_id
     AND category.business_id = v_business_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_categories(p_category_ids uuid[])
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.reorder_categories(p_category_ids);
$$;

REVOKE ALL ON FUNCTION private.multibusiness_business_organization_id(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.multibusiness_business_organization_id(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION private.multibusiness_assign_mideli_business()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.reorder_categories(uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.reorder_categories(uuid[])
  TO authenticated;
