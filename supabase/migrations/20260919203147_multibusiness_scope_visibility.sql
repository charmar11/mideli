-- A business membership is local to that business.  An organization-scoped
-- membership may see all businesses only when it carries an explicitly
-- organization-wide operational/coordination capability.  In particular,
-- the transitional organization.manage_tables membership of the current
-- Mideli owner must not expose another business's private data.

CREATE OR REPLACE FUNCTION private.multibusiness_can_view_business(
  p_business_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_requested_business_id uuid;
BEGIN
  v_requested_business_id := private.multibusiness_requested_business_id();

  IF v_requested_business_id IS NOT NULL
     AND p_business_id IS DISTINCT FROM v_requested_business_id THEN
    RETURN false;
  END IF;

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
                  AND EXISTS (
                    SELECT 1
                      FROM public.membership_capabilities AS membership_capability
                      JOIN public.capabilities AS capability
                        ON capability.code = membership_capability.capability_code
                     WHERE membership_capability.membership_id = membership.id
                       AND membership_capability.organization_id = business.organization_id
                       AND membership_capability.business_id IS NULL
                       AND membership_capability.revoked_at IS NULL
                       AND capability.is_active
                       AND capability.scope_type = 'organization'
                       AND capability.code IN (
                         'organization.manage_global_waiters',
                         'organization.operate_orders',
                         'organization.charge_orders'
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
SET search_path = pg_catalog, public
AS $$
WITH visible_businesses AS (
  SELECT business.*
    FROM public.businesses AS business
    JOIN public.organizations AS organization
      ON organization.id = business.organization_id
   WHERE auth.uid() IS NOT NULL
     AND organization.lifecycle_status <> 'retired'
     AND business.lifecycle_status NOT IN ('archived', 'retired')
     AND private.multibusiness_can_view_business(business.id)
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
     ORDER BY CASE membership.scope_type
       WHEN 'platform' THEN 1
       WHEN 'organization' THEN 2
       ELSE 3
     END, membership.created_at
     LIMIT 1
  ) AS effective_membership ON true
 ORDER BY organization.name, business.display_name;
$$;

REVOKE ALL ON FUNCTION private.multibusiness_can_view_business(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_multibusiness_context()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_multibusiness_context()
  TO authenticated;
