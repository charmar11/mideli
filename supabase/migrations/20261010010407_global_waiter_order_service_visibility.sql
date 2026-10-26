-- Global waiters may observe dine-in orders throughout their organization,
-- while delivery and takeout require an explicit order grant for that business.

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
    IF p_order_type = 'comedor'::public.order_type THEN
      RETURN true;
    END IF;

    RETURN private.multibusiness_has_capability(
      'business.operate_orders', v_organization_id, p_business_id
    ) OR private.multibusiness_has_capability(
      'business.charge_orders', v_organization_id, p_business_id
    ) OR private.multibusiness_has_capability(
      'business.update_preparation', v_organization_id, p_business_id
    ) OR private.multibusiness_has_capability(
      'business.access_kitchen', v_organization_id, p_business_id
    );
  END IF;

  RETURN private.multibusiness_can_view_business(p_business_id);
END;
$$;

REVOKE ALL ON FUNCTION private.multibusiness_can_view_order(uuid, public.order_type)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.multibusiness_can_view_order(uuid, public.order_type)
  TO authenticated;

DROP POLICY IF EXISTS orders_viewed_by_business_membership ON public.orders;
CREATE POLICY orders_viewed_by_business_membership
  ON public.orders
  FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_order(business_id, type));

DROP POLICY IF EXISTS order_items_viewed_by_business_membership ON public.order_items;
CREATE POLICY order_items_viewed_by_business_membership
  ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.orders AS order_row
       WHERE order_row.id = order_items.order_id
         AND private.multibusiness_can_view_order(
           order_row.business_id, order_row.type
         )
    )
  );

DROP POLICY IF EXISTS order_status_log_viewed_by_business_membership
  ON public.order_status_log;
CREATE POLICY order_status_log_viewed_by_business_membership
  ON public.order_status_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.orders AS order_row
       WHERE order_row.id = order_status_log.order_id
         AND private.multibusiness_can_view_order(
           order_row.business_id, order_row.type
         )
    )
  );
