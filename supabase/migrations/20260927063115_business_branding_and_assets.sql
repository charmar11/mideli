ALTER TABLE public.businesses
  ADD COLUMN brand_logo_path text,
  ADD COLUMN brand_primary_color text,
  ADD COLUMN brand_accent_color text;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_brand_primary_color_check
    CHECK (brand_primary_color IS NULL OR brand_primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT businesses_brand_accent_color_check
    CHECK (brand_accent_color IS NULL OR brand_accent_color ~ '^#[0-9A-Fa-f]{6}$');

COMMENT ON COLUMN public.businesses.brand_logo_path IS
  'Object path in the public business-brand-assets bucket; uploads are authorized server-side.';
COMMENT ON COLUMN public.businesses.brand_primary_color IS
  'Primary hex color for the business identity.';
COMMENT ON COLUMN public.businesses.brand_accent_color IS
  'Supporting hex color for the business identity.';

UPDATE public.businesses
   SET brand_primary_color = COALESCE(
         brand_primary_color,
         CASE lower(slug)
           WHEN 'mideli' THEN '#F5145F'
           WHEN 'just-dipping' THEN '#FFD500'
           ELSE '#36C275'
         END
       ),
       brand_accent_color = COALESCE(
         brand_accent_color,
         CASE lower(slug)
           WHEN 'mideli' THEN '#F6DDA4'
           WHEN 'just-dipping' THEN '#FFD500'
           ELSE '#F6DDA4'
         END
       )
 WHERE brand_primary_color IS NULL OR brand_accent_color IS NULL;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'business-brand-assets',
  'business-brand-assets',
  true,
  3145728,
  ARRAY['image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.get_my_business_branding()
RETURNS TABLE (
  business_id uuid,
  brand_logo_path text,
  brand_primary_color text,
  brand_accent_color text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT business.id,
         business.brand_logo_path,
         business.brand_primary_color,
         business.brand_accent_color
    FROM public.get_my_multibusiness_context() AS context
    JOIN public.businesses AS business
      ON business.id = context.business_id;
$$;

REVOKE ALL ON FUNCTION public.get_my_business_branding()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_business_branding()
  TO authenticated;
