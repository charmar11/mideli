-- Business-aware order status transitions.
--
-- The UI may show orders from one selected business, but the database must
-- enforce the same boundary. Kitchen preparation is intentionally separate
-- from the organization-wide waiter capability: a global waiter can create,
-- deliver and charge orders, but cannot mark another business's order as
-- ready unless that business grants preparation access.

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
    )
    OR private.multibusiness_has_capability(
      'business.operate_orders', v_organization_id, p_business_id
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

CREATE OR REPLACE FUNCTION private.validate_multibusiness_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Keep the pre-migration compatibility window harmless if this trigger is
  -- ever installed against an older database snapshot.
  IF NEW.business_id IS NULL
     OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT private.multibusiness_can_update_order_status(
    NEW.business_id,
    NEW.status
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar este pedido a %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_validate_multibusiness_status ON public.orders;
CREATE TRIGGER orders_validate_multibusiness_status
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_multibusiness_order_status();

CREATE OR REPLACE FUNCTION public.update_business_order_status(
  p_business_id uuid,
  p_order_id uuid,
  p_status public.order_status
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF p_business_id IS NULL OR p_order_id IS NULL THEN
    RAISE EXCEPTION 'Falta el negocio o el pedido';
  END IF;

  SELECT order_row.*
    INTO v_order
    FROM public.orders AS order_row
   WHERE order_row.id = p_order_id
     AND order_row.business_id = p_business_id
   FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'El pedido no pertenece al negocio seleccionado';
  END IF;

  IF NOT private.multibusiness_can_update_order_status(
    p_business_id,
    p_status
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para actualizar este estado';
  END IF;

  UPDATE public.orders
     SET status = p_status,
         cancelled_at = CASE
           WHEN p_status = 'cancelled' THEN COALESCE(cancelled_at, now())
           WHEN status = 'cancelled' THEN NULL
           ELSE cancelled_at
         END,
         updated_at = now()
   WHERE id = p_order_id
     AND business_id = p_business_id;

  SELECT order_row.*
    INTO v_order
    FROM public.orders AS order_row
   WHERE order_row.id = p_order_id
     AND order_row.business_id = p_business_id;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION private.multibusiness_can_update_order_status(
  uuid, public.order_status
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.validate_multibusiness_order_status()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_business_order_status(
  uuid, uuid, public.order_status
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_business_order_status(
  uuid, uuid, public.order_status
) TO authenticated, service_role;
