-- Enforce the business boundary for orders, order lines and status history.
-- The organization-scoped waiter capabilities deliberately grant Andrea
-- operation across businesses without granting catalog or inventory access.

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.orders, public.order_items, public.order_status_log
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_items TO authenticated;
GRANT SELECT, INSERT ON TABLE public.order_status_log TO authenticated;

DROP POLICY IF EXISTS "Orders viewable by staff" ON public.orders;
DROP POLICY IF EXISTS "Orders created by staff" ON public.orders;
DROP POLICY IF EXISTS "Orders updated by staff" ON public.orders;
DROP POLICY IF EXISTS "Orders deleted by admins" ON public.orders;
DROP POLICY IF EXISTS "Orders deleted by staff" ON public.orders;

DROP POLICY IF EXISTS "Order items viewable by staff" ON public.order_items;
DROP POLICY IF EXISTS "Order items managed by staff" ON public.order_items;

DROP POLICY IF EXISTS "Order status log viewable by staff" ON public.order_status_log;
DROP POLICY IF EXISTS "Order status log insert by staff" ON public.order_status_log;

CREATE POLICY orders_viewed_by_business_membership
  ON public.orders
  FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));

CREATE POLICY orders_created_with_operation_capability
  ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_has_capability(
      'organization.operate_orders',
      private.multibusiness_business_organization_id(business_id),
      NULL
    )
    OR private.multibusiness_has_capability(
      'business.operate_orders',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY orders_updated_with_operation_capability
  ON public.orders
  FOR UPDATE TO authenticated
  USING (
    private.multibusiness_has_capability(
      'organization.operate_orders',
      private.multibusiness_business_organization_id(business_id),
      NULL
    )
    OR private.multibusiness_has_capability(
      'business.operate_orders',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
    OR private.multibusiness_has_capability(
      'organization.charge_orders',
      private.multibusiness_business_organization_id(business_id),
      NULL
    )
    OR private.multibusiness_has_capability(
      'business.charge_orders',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
    OR private.multibusiness_has_capability(
      'business.update_preparation',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  )
  WITH CHECK (
    private.multibusiness_has_capability(
      'organization.operate_orders',
      private.multibusiness_business_organization_id(business_id),
      NULL
    )
    OR private.multibusiness_has_capability(
      'business.operate_orders',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
    OR private.multibusiness_has_capability(
      'organization.charge_orders',
      private.multibusiness_business_organization_id(business_id),
      NULL
    )
    OR private.multibusiness_has_capability(
      'business.charge_orders',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
    OR private.multibusiness_has_capability(
      'business.update_preparation',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

-- Order deletion is kept available to order operators for compatibility with
-- the current POS. The later audit/correction slice will replace destructive
-- deletion with a reasoned correction flow for closed orders.
CREATE POLICY orders_deleted_with_operation_capability
  ON public.orders
  FOR DELETE TO authenticated
  USING (
    private.multibusiness_has_capability(
      'organization.operate_orders',
      private.multibusiness_business_organization_id(business_id),
      NULL
    )
    OR private.multibusiness_has_capability(
      'business.operate_orders',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY order_items_viewed_by_business_membership
  ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.orders AS order_row
       WHERE order_row.id = order_items.order_id
         AND private.multibusiness_can_view_business(order_row.business_id)
    )
  );

CREATE POLICY order_items_created_with_operation_capability
  ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.orders AS order_row
       WHERE order_row.id = order_items.order_id
         AND (
           private.multibusiness_has_capability(
             'organization.operate_orders',
             private.multibusiness_business_organization_id(order_row.business_id),
             NULL
           )
           OR private.multibusiness_has_capability(
             'business.operate_orders',
             private.multibusiness_business_organization_id(order_row.business_id),
             order_row.business_id
           )
         )
    )
  );

CREATE POLICY order_items_updated_with_operation_capability
  ON public.order_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.orders AS order_row
       WHERE order_row.id = order_items.order_id
         AND private.multibusiness_can_view_business(order_row.business_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.orders AS order_row
       WHERE order_row.id = order_items.order_id
         AND (
           private.multibusiness_has_capability(
             'organization.operate_orders',
             private.multibusiness_business_organization_id(order_row.business_id),
             NULL
           )
           OR private.multibusiness_has_capability(
             'business.operate_orders',
             private.multibusiness_business_organization_id(order_row.business_id),
             order_row.business_id
           )
         )
    )
  );

CREATE POLICY order_items_deleted_with_operation_capability
  ON public.order_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.orders AS order_row
       WHERE order_row.id = order_items.order_id
         AND (
           private.multibusiness_has_capability(
             'organization.operate_orders',
             private.multibusiness_business_organization_id(order_row.business_id),
             NULL
           )
           OR private.multibusiness_has_capability(
             'business.operate_orders',
             private.multibusiness_business_organization_id(order_row.business_id),
             order_row.business_id
           )
         )
    )
  );

CREATE POLICY order_status_log_viewed_by_business_membership
  ON public.order_status_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.orders AS order_row
       WHERE order_row.id = order_status_log.order_id
         AND private.multibusiness_can_view_business(order_row.business_id)
    )
  );

CREATE POLICY order_status_log_inserted_with_operation_capability
  ON public.order_status_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.orders AS order_row
       WHERE order_row.id = order_status_log.order_id
         AND (
           private.multibusiness_has_capability(
             'organization.operate_orders',
             private.multibusiness_business_organization_id(order_row.business_id),
             NULL
           )
           OR private.multibusiness_has_capability(
             'business.operate_orders',
             private.multibusiness_business_organization_id(order_row.business_id),
             order_row.business_id
           )
           OR private.multibusiness_has_capability(
             'business.update_preparation',
             private.multibusiness_business_organization_id(order_row.business_id),
             order_row.business_id
           )
         )
    )
  );

