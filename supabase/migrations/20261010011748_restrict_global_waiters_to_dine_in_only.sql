-- Global waiters are a cross-business dining-room role. Business grants may
-- still enable POS operations and cash permissions, but never expose local
-- delivery, takeout, or marketplace orders in State or History.

CREATE OR REPLACE FUNCTION private.multibusiness_can_view_order(
  p_business_id uuid,
  p_order_type public.order_type
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_requested_business_id uuid;
  v_organization_id uuid;
  v_is_global_waiter boolean;
BEGIN
  IF v_user_id IS NULL OR p_business_id IS NULL OR p_order_type IS NULL THEN
    RETURN false;
  END IF;

  v_requested_business_id := private.multibusiness_requested_business_id();
  IF v_requested_business_id IS NOT NULL
     AND p_business_id IS DISTINCT FROM v_requested_business_id THEN
    RETURN false;
  END IF;

  SELECT business.organization_id
    INTO v_organization_id
    FROM public.businesses AS business
    JOIN public.organizations AS organization
      ON organization.id = business.organization_id
   WHERE business.id = p_business_id
     AND business.lifecycle_status NOT IN ('archived', 'retired')
     AND organization.lifecycle_status <> 'retired';

  IF v_organization_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT membership.scope_type = 'organization'
         AND membership.role_code = 'global_waiter'
    INTO v_is_global_waiter
    FROM public.memberships AS membership
   WHERE membership.user_id = v_user_id
     AND membership.status = 'active'
     AND (
       membership.scope_type = 'platform'
       OR membership.business_id = p_business_id
       OR membership.organization_id = v_organization_id
     )
   ORDER BY CASE membership.scope_type
     WHEN 'platform' THEN 1
     WHEN 'organization' THEN 2
     ELSE 3
   END, membership.created_at
   LIMIT 1;

  IF v_is_global_waiter THEN
    RETURN p_order_type = 'comedor'::public.order_type;
  END IF;

  RETURN private.multibusiness_can_view_business(p_business_id);
END;
$$;

REVOKE ALL ON FUNCTION private.multibusiness_can_view_order(uuid, public.order_type)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.multibusiness_can_view_order(uuid, public.order_type)
  TO authenticated;
