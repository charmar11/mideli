-- Keep the existing Kitchen station on businesses and memberships that
-- already had explicit preparation access before the capability split.
-- Just Dipping is intentionally excluded because it operates from Estado.
INSERT INTO public.business_staff_role_capabilities (
  business_id, role_id, capability_code
)
SELECT DISTINCT
  preparation.business_id,
  preparation.role_id,
  'business.access_kitchen'
FROM public.business_staff_role_capabilities AS preparation
JOIN public.businesses AS business
  ON business.id = preparation.business_id
JOIN public.organizations AS organization
  ON organization.id = business.organization_id
WHERE preparation.capability_code = 'business.update_preparation'
  AND NOT (
    organization.slug = 'rincon-404-food-park'
    AND business.slug = 'just-dipping'
  )
  AND (
    EXISTS (
      SELECT 1
        FROM public.memberships AS staff
        JOIN public.membership_capabilities AS grant_row
          ON grant_row.membership_id = staff.id
       WHERE staff.business_id = preparation.business_id
         AND staff.staff_role_id = preparation.role_id
         AND staff.status = 'active'
         AND grant_row.capability_code = 'business.update_preparation'
         AND grant_row.organization_id = staff.organization_id
         AND grant_row.business_id = staff.business_id
         AND grant_row.revoked_at IS NULL
    )
    OR EXISTS (
      SELECT 1
        FROM public.memberships AS owner
        JOIN public.membership_capabilities AS grant_row
          ON grant_row.membership_id = owner.id
       WHERE owner.business_id = preparation.business_id
         AND owner.role_code = 'business_owner'
         AND owner.status = 'active'
         AND grant_row.capability_code = 'business.update_preparation'
         AND grant_row.organization_id = owner.organization_id
         AND grant_row.business_id = owner.business_id
         AND grant_row.revoked_at IS NULL
    )
  )
ON CONFLICT DO NOTHING;

WITH preparation_memberships AS (
  SELECT DISTINCT
    membership.id,
    grant_row.organization_id,
    grant_row.business_id
    FROM public.memberships AS membership
    JOIN public.membership_capabilities AS grant_row
      ON grant_row.membership_id = membership.id
   WHERE membership.scope_type IN ('business', 'organization')
     AND membership.status = 'active'
     AND membership.organization_id = grant_row.organization_id
     AND grant_row.capability_code = 'business.update_preparation'
     AND grant_row.business_id IS NOT NULL
     AND grant_row.revoked_at IS NULL
     AND (
       (membership.scope_type = 'business' AND membership.business_id = grant_row.business_id)
       OR (membership.scope_type = 'organization' AND membership.business_id IS NULL)
     )
  UNION
  SELECT DISTINCT membership.id, membership.organization_id, membership.business_id
    FROM public.memberships AS membership
    JOIN public.business_staff_role_capabilities AS role_capability
      ON role_capability.role_id = membership.staff_role_id
     AND role_capability.business_id = membership.business_id
   WHERE membership.scope_type = 'business'
     AND membership.status = 'active'
     AND membership.organization_id IS NOT NULL
     AND membership.business_id IS NOT NULL
     AND role_capability.capability_code = 'business.update_preparation'
), eligible_memberships AS (
  SELECT preparation_memberships.*
    FROM preparation_memberships
    JOIN public.businesses AS business
      ON business.id = preparation_memberships.business_id
    JOIN public.organizations AS organization
      ON organization.id = preparation_memberships.organization_id
   WHERE NOT (
     organization.slug = 'rincon-404-food-park'
     AND business.slug = 'just-dipping'
   )
)
INSERT INTO public.membership_capabilities (
  membership_id,
  capability_code,
  organization_id,
  business_id,
  granted_by,
  grant_reason
)
SELECT
  preparation.id,
  'business.access_kitchen',
  preparation.organization_id,
  preparation.business_id,
  NULL,
  'Pantalla Cocina conservada para el acceso de preparación existente'
FROM eligible_memberships AS preparation
ON CONFLICT DO NOTHING;
