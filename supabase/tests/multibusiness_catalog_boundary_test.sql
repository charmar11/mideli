-- Structural checks for the first operational multibusiness slice.

BEGIN;

SELECT plan(15);

SELECT has_column('public', 'categories', 'business_id', 'categories has a business boundary');
SELECT has_column('public', 'menu_items', 'business_id', 'menu_items has a business boundary');

SELECT is(
  (SELECT is_nullable = 'NO'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'business_id')
  OR NOT EXISTS (
    SELECT 1
      FROM public.businesses AS business
      JOIN public.organizations AS organization
        ON organization.id = business.organization_id
     WHERE organization.slug = 'rincon-404-food-park'
       AND business.slug = 'mideli'
  ),
  true,
  'category business_id is required once the target business exists'
);
SELECT is(
  (SELECT is_nullable = 'NO'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'business_id')
  OR NOT EXISTS (
    SELECT 1
      FROM public.businesses AS business
      JOIN public.organizations AS organization
        ON organization.id = business.organization_id
     WHERE organization.slug = 'rincon-404-food-park'
       AND business.slug = 'mideli'
  ),
  true,
  'menu item business_id is required once the target business exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'categories_business_id_fkey'
       AND conrelid = 'public.categories'::regclass
  ),
  'categories reference a business'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'menu_items_business_id_fkey'
       AND conrelid = 'public.menu_items'::regclass
  ),
  'menu items reference a business'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'menu_items_business_category_fkey'
       AND conrelid = 'public.menu_items'::regclass
  ),
  'menu items cannot point to a category from another business'
);

SELECT ok(
  to_regclass('public.categories_business_sort_order_idx') IS NOT NULL,
  'categories have a business-scoped ordering index'
);
SELECT ok(
  to_regclass('public.menu_items_business_sort_order_idx') IS NOT NULL,
  'menu items have a business-scoped ordering index'
);

SELECT ok(
  to_regprocedure('private.multibusiness_business_organization_id(uuid)') IS NOT NULL,
  'business organization resolver exists'
);
SELECT ok(
  to_regprocedure('private.reorder_categories(uuid[])') IS NOT NULL,
  'business-scoped category reorder function exists'
);

SELECT is(
  (SELECT count(*)::integer FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'categories'
      AND policyname LIKE 'categories_%'),
  4,
  'categories have four scoped policies'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_items'
      AND policyname LIKE 'menu_items_%'),
  4,
  'menu items have four scoped policies'
);

SELECT is(
  (SELECT count(*)::integer FROM public.categories WHERE business_id IS NULL),
  CASE WHEN EXISTS (
    SELECT 1
      FROM public.businesses AS business
      JOIN public.organizations AS organization
        ON organization.id = business.organization_id
     WHERE organization.slug = 'rincon-404-food-park'
       AND business.slug = 'mideli'
  ) THEN 0 ELSE (SELECT count(*)::integer FROM public.categories) END,
  'categories are scoped when the target business exists'
);
SELECT is(
  (SELECT count(*)::integer FROM public.menu_items WHERE business_id IS NULL),
  CASE WHEN EXISTS (
    SELECT 1
      FROM public.businesses AS business
      JOIN public.organizations AS organization
        ON organization.id = business.organization_id
     WHERE organization.slug = 'rincon-404-food-park'
       AND business.slug = 'mideli'
  ) THEN 0 ELSE (SELECT count(*)::integer FROM public.menu_items) END,
  'menu items are scoped when the target business exists'
);

SELECT * FROM finish();

ROLLBACK;
