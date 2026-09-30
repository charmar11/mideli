-- Keep catalog RLS aligned with per-business global waiter grants. The menu
-- selector can expose a business from its capability context, so this helper
-- must authorize the same scoped grants before categories/products are read.
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
                  AND (
                    EXISTS (
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
                         AND capability.code = 'organization.manage_global_waiters'
                    )
                    OR EXISTS (
                      SELECT 1
                        FROM public.membership_capabilities AS membership_capability
                        JOIN public.capabilities AS capability
                          ON capability.code = membership_capability.capability_code
                       WHERE membership_capability.membership_id = membership.id
                         AND membership_capability.organization_id = business.organization_id
                         AND membership_capability.business_id = business.id
                         AND membership_capability.revoked_at IS NULL
                         AND capability.is_active
                         AND capability.scope_type = 'business'
                         AND capability.code IN (
                           'business.operate_orders', 'business.charge_orders'
                         )
                    )
                  )
                )
              )
         )
    );
END;
$$;
