-- Only an explicit preparation permission may move a ticket into the kitchen
-- or mark it ready. Order-taking permission is intentionally not sufficient.
CREATE OR REPLACE FUNCTION private.multibusiness_can_update_order_status(
  p_business_id uuid,
  p_status public.order_status
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_organization_id uuid;
BEGIN
  IF private.request_jwt_role() = 'service_role' THEN
    RETURN true;
  END IF;

  IF auth.uid() IS NULL OR p_business_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT business.organization_id
    INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.lifecycle_status = 'active';

  IF v_organization_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_status IN ('in_kitchen', 'ready') THEN
    RETURN private.multibusiness_has_capability(
      'business.update_preparation', v_organization_id, p_business_id
    );
  END IF;

  IF p_status IN ('pending', 'served', 'cancelled') THEN
    RETURN private.multibusiness_has_capability(
      'organization.operate_orders', v_organization_id, NULL
    )
    OR private.multibusiness_has_capability(
      'business.operate_orders', v_organization_id, p_business_id
    )
    OR private.multibusiness_has_capability(
      'organization.charge_orders', v_organization_id, NULL
    )
    OR private.multibusiness_has_capability(
      'business.charge_orders', v_organization_id, p_business_id
    );
  END IF;

  IF p_status = 'paid' THEN
    RETURN private.multibusiness_has_capability(
      'organization.charge_orders', v_organization_id, NULL
    )
    OR private.multibusiness_has_capability(
      'business.charge_orders', v_organization_id, p_business_id
    );
  END IF;

  RETURN false;
END;
$$;
