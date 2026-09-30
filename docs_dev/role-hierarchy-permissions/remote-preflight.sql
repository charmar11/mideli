-- Read-only aggregate checks before applying the staff-role migration.
-- Deliberately returns counts only, never user names or account identifiers.
WITH active_global AS (
  SELECT m.id, m.user_id, m.organization_id
  FROM public.memberships AS m
  WHERE m.scope_type = 'organization'
    AND m.role_code = 'global_waiter'
    AND m.status = 'active'
), active_businesses AS (
  SELECT b.id AS business_id, b.organization_id
  FROM public.businesses AS b
  WHERE b.lifecycle_status = 'active'
), grants AS (
  SELECT
    ag.id AS membership_id,
    ag.user_id,
    ag.organization_id,
    mc.business_id,
    mc.capability_code
  FROM active_global AS ag
  JOIN public.membership_capabilities AS mc
    ON mc.membership_id = ag.id
  WHERE mc.revoked_at IS NULL
    AND mc.capability_code IN (
      'business.open_cash',
      'business.close_cash',
      'business.operate_orders',
      'business.charge_orders'
    )
), organization_grants AS (
  SELECT ag.id AS membership_id, ag.organization_id, mc.capability_code
  FROM active_global AS ag
  JOIN public.membership_capabilities AS mc
    ON mc.membership_id = ag.id
  WHERE mc.revoked_at IS NULL
    AND mc.business_id IS NULL
    AND mc.capability_code IN (
      'organization.operate_orders',
      'organization.charge_orders'
    )
), missing_explicit AS (
  SELECT og.membership_id, ab.business_id, og.capability_code
  FROM organization_grants AS og
  JOIN active_businesses AS ab USING (organization_id)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.membership_capabilities AS mc
    WHERE mc.membership_id = og.membership_id
      AND mc.organization_id = ab.organization_id
      AND mc.business_id = ab.business_id
      AND mc.revoked_at IS NULL
      AND mc.capability_code = CASE og.capability_code
        WHEN 'organization.operate_orders' THEN 'business.operate_orders'
        ELSE 'business.charge_orders'
      END
  )
)
SELECT
  (SELECT count(*) FROM active_global) AS active_global_waiter_memberships,
  (
    SELECT count(*)
    FROM grants
    WHERE capability_code IN ('business.open_cash', 'business.close_cash')
  ) AS active_global_cash_grants,
  (
    SELECT count(DISTINCT (g.membership_id, g.business_id))
    FROM grants AS g
    JOIN public.memberships AS local_staff
      ON local_staff.user_id = g.user_id
     AND local_staff.scope_type = 'business'
     AND local_staff.business_id = g.business_id
     AND local_staff.status = 'active'
     AND local_staff.role_code <> 'business_owner'
    WHERE g.capability_code IN ('business.open_cash', 'business.close_cash')
  ) AS cash_grants_overlapping_local_staff,
  (SELECT count(*) FROM organization_grants) AS active_organization_order_grants,
  (SELECT count(*) FROM missing_explicit) AS missing_business_scoped_equivalents;

-- Compact scope breakdown to identify why a preflight count is nonzero.
SELECT
  m.scope_type,
  m.role_code,
  m.status,
  COALESCE(b.slug, '(organización)') AS scope,
  mc.capability_code,
  count(*) AS active_grants
FROM public.memberships AS m
JOIN public.membership_capabilities AS mc
  ON mc.membership_id = m.id
LEFT JOIN public.businesses AS b
  ON b.id = mc.business_id
WHERE m.role_code = 'global_waiter'
  AND mc.revoked_at IS NULL
  AND mc.capability_code IN (
    'organization.operate_orders',
    'organization.charge_orders',
    'business.operate_orders',
    'business.charge_orders',
    'business.open_cash',
    'business.close_cash'
  )
GROUP BY m.scope_type, m.role_code, m.status, b.slug, mc.capability_code
ORDER BY scope, mc.capability_code, m.status;
