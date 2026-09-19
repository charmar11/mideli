-- Replace legacy global staff policies with business-scoped access for
-- inventory, cash and payments. The server RPCs remain the write boundary
-- for sensitive operations; these policies protect direct browser queries.

-- =====================================================
-- INVENTORY
-- =====================================================

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Inventory items viewable by staff" ON public.inventory_items;
DROP POLICY IF EXISTS "Inventory items insertable by admins" ON public.inventory_items;
DROP POLICY IF EXISTS "Inventory items updatable by admins" ON public.inventory_items;
DROP POLICY IF EXISTS "Inventory recipes viewable by staff" ON public.inventory_recipes;
DROP POLICY IF EXISTS "Inventory recipes managed by admins" ON public.inventory_recipes;
DROP POLICY IF EXISTS "Inventory movements viewable by staff" ON public.inventory_movements;
DROP POLICY IF EXISTS "Inventory movements created by admins" ON public.inventory_movements;
DROP POLICY IF EXISTS "Inventory counts viewable by operators" ON public.inventory_counts;
DROP POLICY IF EXISTS "Inventory counts created by operators" ON public.inventory_counts;
DROP POLICY IF EXISTS "Inventory counts updated by operators" ON public.inventory_counts;
DROP POLICY IF EXISTS "Inventory count lines viewable by operators" ON public.inventory_count_lines;
DROP POLICY IF EXISTS "Inventory count lines managed by operators" ON public.inventory_count_lines;
DROP POLICY IF EXISTS "Purchase orders viewable by operators" ON public.inventory_purchase_orders;
DROP POLICY IF EXISTS "Purchase orders created by operators" ON public.inventory_purchase_orders;
DROP POLICY IF EXISTS "Purchase orders updated by operators" ON public.inventory_purchase_orders;
DROP POLICY IF EXISTS "Purchase order lines viewable by operators" ON public.inventory_purchase_order_lines;
DROP POLICY IF EXISTS "Purchase order lines managed by operators" ON public.inventory_purchase_order_lines;
DROP POLICY IF EXISTS "Receipts viewable by operators" ON public.inventory_receipts;
DROP POLICY IF EXISTS "Receipts created by operators" ON public.inventory_receipts;
DROP POLICY IF EXISTS "Receipt lines viewable by operators" ON public.inventory_receipt_lines;
DROP POLICY IF EXISTS "Receipt lines created by operators" ON public.inventory_receipt_lines;
DROP POLICY IF EXISTS "Inventory lots viewable by staff" ON public.inventory_lots;
DROP POLICY IF EXISTS "Inventory lots managed by operators" ON public.inventory_lots;

CREATE POLICY multibusiness_inventory_items_view
  ON public.inventory_items FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));
CREATE POLICY multibusiness_inventory_items_manage
  ON public.inventory_items FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_inventory',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );
CREATE POLICY multibusiness_inventory_items_update
  ON public.inventory_items FOR UPDATE TO authenticated
  USING (
    private.multibusiness_has_capability(
      'business.manage_inventory',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  )
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_inventory',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY multibusiness_inventory_recipes_view
  ON public.inventory_recipes FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));
CREATE POLICY multibusiness_inventory_recipes_manage
  ON public.inventory_recipes FOR ALL TO authenticated
  USING (
    private.multibusiness_has_capability(
      'business.manage_inventory',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  )
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_inventory',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY multibusiness_inventory_movements_view
  ON public.inventory_movements FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));
CREATE POLICY multibusiness_inventory_movements_insert
  ON public.inventory_movements FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_inventory',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY multibusiness_inventory_counts_view
  ON public.inventory_counts FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));
CREATE POLICY multibusiness_inventory_counts_insert
  ON public.inventory_counts FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_inventory',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );
CREATE POLICY multibusiness_inventory_counts_update
  ON public.inventory_counts FOR UPDATE TO authenticated
  USING (
    private.multibusiness_has_capability(
      'business.manage_inventory',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  )
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_inventory',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY multibusiness_inventory_count_lines_view
  ON public.inventory_count_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_counts AS count_row
       WHERE count_row.id = inventory_count_lines.count_id
         AND private.multibusiness_can_view_business(count_row.business_id)
    )
  );
CREATE POLICY multibusiness_inventory_count_lines_manage
  ON public.inventory_count_lines FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_counts AS count_row
       WHERE count_row.id = inventory_count_lines.count_id
         AND private.multibusiness_has_capability(
           'business.manage_inventory',
           private.multibusiness_business_organization_id(count_row.business_id),
           count_row.business_id
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inventory_counts AS count_row
       WHERE count_row.id = inventory_count_lines.count_id
         AND private.multibusiness_has_capability(
           'business.manage_inventory',
           private.multibusiness_business_organization_id(count_row.business_id),
           count_row.business_id
         )
    )
  );

CREATE POLICY multibusiness_inventory_purchase_orders_view
  ON public.inventory_purchase_orders FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));
CREATE POLICY multibusiness_inventory_purchase_orders_insert
  ON public.inventory_purchase_orders FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_inventory',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );
CREATE POLICY multibusiness_inventory_purchase_orders_update
  ON public.inventory_purchase_orders FOR UPDATE TO authenticated
  USING (
    private.multibusiness_has_capability(
      'business.manage_inventory',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  )
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_inventory',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY multibusiness_inventory_purchase_lines_view
  ON public.inventory_purchase_order_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_purchase_orders AS purchase_order
       WHERE purchase_order.id = inventory_purchase_order_lines.purchase_order_id
         AND private.multibusiness_can_view_business(purchase_order.business_id)
    )
  );
CREATE POLICY multibusiness_inventory_purchase_lines_manage
  ON public.inventory_purchase_order_lines FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_purchase_orders AS purchase_order
       WHERE purchase_order.id = inventory_purchase_order_lines.purchase_order_id
         AND private.multibusiness_has_capability(
           'business.manage_inventory',
           private.multibusiness_business_organization_id(purchase_order.business_id),
           purchase_order.business_id
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inventory_purchase_orders AS purchase_order
       WHERE purchase_order.id = inventory_purchase_order_lines.purchase_order_id
         AND private.multibusiness_has_capability(
           'business.manage_inventory',
           private.multibusiness_business_organization_id(purchase_order.business_id),
           purchase_order.business_id
         )
    )
  );

CREATE POLICY multibusiness_inventory_receipts_view
  ON public.inventory_receipts FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));
CREATE POLICY multibusiness_inventory_receipts_insert
  ON public.inventory_receipts FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_inventory',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY multibusiness_inventory_receipt_lines_view
  ON public.inventory_receipt_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_receipts AS receipt
       WHERE receipt.id = inventory_receipt_lines.receipt_id
         AND private.multibusiness_can_view_business(receipt.business_id)
    )
  );
CREATE POLICY multibusiness_inventory_receipt_lines_insert
  ON public.inventory_receipt_lines FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inventory_receipts AS receipt
       WHERE receipt.id = inventory_receipt_lines.receipt_id
         AND private.multibusiness_has_capability(
           'business.manage_inventory',
           private.multibusiness_business_organization_id(receipt.business_id),
           receipt.business_id
         )
    )
  );

CREATE POLICY multibusiness_inventory_lots_view
  ON public.inventory_lots FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));
CREATE POLICY multibusiness_inventory_lots_manage
  ON public.inventory_lots FOR ALL TO authenticated
  USING (
    private.multibusiness_has_capability(
      'business.manage_inventory',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  )
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_inventory',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

REVOKE ALL ON TABLE
  public.inventory_items,
  public.inventory_recipes,
  public.inventory_movements,
  public.inventory_counts,
  public.inventory_count_lines,
  public.inventory_purchase_orders,
  public.inventory_purchase_order_lines,
  public.inventory_receipts,
  public.inventory_receipt_lines,
  public.inventory_lots
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE
  public.inventory_items,
  public.inventory_recipes,
  public.inventory_movements,
  public.inventory_counts,
  public.inventory_count_lines,
  public.inventory_purchase_orders,
  public.inventory_purchase_order_lines,
  public.inventory_receipts,
  public.inventory_receipt_lines,
  public.inventory_lots
  TO authenticated;
GRANT INSERT, UPDATE ON TABLE
  public.inventory_items,
  public.inventory_recipes,
  public.inventory_counts,
  public.inventory_count_lines,
  public.inventory_purchase_orders,
  public.inventory_purchase_order_lines,
  public.inventory_receipts,
  public.inventory_receipt_lines,
  public.inventory_lots
  TO authenticated;
GRANT INSERT ON TABLE public.inventory_movements TO authenticated;

-- =====================================================
-- CASH AND PAYMENTS
-- =====================================================

ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_shift_pending_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_shift_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_shift_opening_float_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movement_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_order_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_item_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_tender_method_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cash shifts visible to authorized staff" ON public.cash_shifts;
DROP POLICY IF EXISTS "Cash movements visible with shift" ON public.cash_movements;
DROP POLICY IF EXISTS "Transferred orders visible with shift" ON public.cash_shift_pending_orders;
DROP POLICY IF EXISTS "Cash adjustments visible with shift" ON public.cash_shift_adjustments;
DROP POLICY IF EXISTS "Opening float changes visible with shift" ON public.cash_shift_opening_float_changes;
DROP POLICY IF EXISTS "Payment corrections visible to administrators" ON public.payment_tender_method_changes;
DROP POLICY IF EXISTS "Payments visible by authorized staff" ON public.payment_transactions;
DROP POLICY IF EXISTS "Payment tenders visible with transaction" ON public.payment_tenders;
DROP POLICY IF EXISTS "Payment order allocations visible with transaction" ON public.payment_order_allocations;
DROP POLICY IF EXISTS "Payment item allocations visible with transaction" ON public.payment_item_allocations;

CREATE POLICY multibusiness_cash_shifts_view
  ON public.cash_shifts FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));
CREATE POLICY multibusiness_cash_shifts_manage
  ON public.cash_shifts FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_cash',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );
CREATE POLICY multibusiness_cash_shifts_update
  ON public.cash_shifts FOR UPDATE TO authenticated
  USING (
    private.multibusiness_has_capability(
      'business.manage_cash',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  )
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_cash',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY multibusiness_cash_movements_view
  ON public.cash_movements FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));
CREATE POLICY multibusiness_cash_movements_insert
  ON public.cash_movements FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_cash',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY multibusiness_pending_cash_orders_view
  ON public.cash_shift_pending_orders FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));
CREATE POLICY multibusiness_pending_cash_orders_manage
  ON public.cash_shift_pending_orders FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_cash',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );
CREATE POLICY multibusiness_pending_cash_orders_update
  ON public.cash_shift_pending_orders FOR UPDATE TO authenticated
  USING (
    private.multibusiness_has_capability(
      'business.manage_cash',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  )
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_cash',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY multibusiness_cash_adjustments_view
  ON public.cash_shift_adjustments FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));
CREATE POLICY multibusiness_cash_adjustments_insert
  ON public.cash_shift_adjustments FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_cash',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY multibusiness_opening_float_changes_view
  ON public.cash_shift_opening_float_changes FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));
CREATE POLICY multibusiness_opening_float_changes_insert
  ON public.cash_shift_opening_float_changes FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_cash',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY multibusiness_cash_corrections_view
  ON public.cash_movement_corrections FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));
CREATE POLICY multibusiness_cash_corrections_insert
  ON public.cash_movement_corrections FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_has_capability(
      'business.manage_cash',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY multibusiness_payment_transactions_view
  ON public.payment_transactions FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));
CREATE POLICY multibusiness_payment_transactions_manage
  ON public.payment_transactions FOR INSERT TO authenticated
  WITH CHECK (
    private.multibusiness_has_capability(
      'organization.charge_orders',
      private.multibusiness_business_organization_id(business_id),
      NULL
    )
    OR private.multibusiness_has_capability(
      'business.charge_orders',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );
CREATE POLICY multibusiness_payment_transactions_update
  ON public.payment_transactions FOR UPDATE TO authenticated
  USING (
    private.multibusiness_has_capability(
      'organization.charge_orders',
      private.multibusiness_business_organization_id(business_id),
      NULL
    )
    OR private.multibusiness_has_capability(
      'business.charge_orders',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  )
  WITH CHECK (
    private.multibusiness_has_capability(
      'organization.charge_orders',
      private.multibusiness_business_organization_id(business_id),
      NULL
    )
    OR private.multibusiness_has_capability(
      'business.charge_orders',
      private.multibusiness_business_organization_id(business_id),
      business_id
    )
  );

CREATE POLICY multibusiness_payment_tenders_view
  ON public.payment_tenders FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.payment_transactions AS transaction
       WHERE transaction.id = payment_tenders.transaction_id
         AND private.multibusiness_can_view_business(transaction.business_id)
    )
  );

CREATE POLICY multibusiness_payment_order_allocations_view
  ON public.payment_order_allocations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.payment_transactions AS transaction
       WHERE transaction.id = payment_order_allocations.transaction_id
         AND private.multibusiness_can_view_business(transaction.business_id)
    )
  );
CREATE POLICY multibusiness_payment_order_allocations_manage
  ON public.payment_order_allocations FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.payment_transactions AS transaction
       WHERE transaction.id = payment_order_allocations.transaction_id
         AND (
           private.multibusiness_has_capability(
             'organization.charge_orders',
             private.multibusiness_business_organization_id(transaction.business_id),
             NULL
           )
           OR private.multibusiness_has_capability(
             'business.charge_orders',
             private.multibusiness_business_organization_id(transaction.business_id),
             transaction.business_id
           )
         )
    )
  );

CREATE POLICY multibusiness_payment_item_allocations_view
  ON public.payment_item_allocations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.payment_transactions AS transaction
       WHERE transaction.id = payment_item_allocations.transaction_id
         AND private.multibusiness_can_view_business(transaction.business_id)
    )
  );
CREATE POLICY multibusiness_payment_item_allocations_manage
  ON public.payment_item_allocations FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.payment_transactions AS transaction
       WHERE transaction.id = payment_item_allocations.transaction_id
         AND (
           private.multibusiness_has_capability(
             'organization.charge_orders',
             private.multibusiness_business_organization_id(transaction.business_id),
             NULL
           )
           OR private.multibusiness_has_capability(
             'business.charge_orders',
             private.multibusiness_business_organization_id(transaction.business_id),
             transaction.business_id
           )
         )
    )
  );

CREATE POLICY multibusiness_payment_tender_changes_view
  ON public.payment_tender_method_changes FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));

REVOKE ALL ON TABLE
  public.cash_shifts,
  public.cash_movements,
  public.cash_shift_pending_orders,
  public.cash_shift_adjustments,
  public.cash_shift_opening_float_changes,
  public.cash_movement_corrections,
  public.payment_transactions,
  public.payment_tenders,
  public.payment_order_allocations,
  public.payment_item_allocations,
  public.payment_tender_method_changes
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE
  public.cash_shifts,
  public.cash_movements,
  public.cash_shift_pending_orders,
  public.cash_shift_adjustments,
  public.cash_shift_opening_float_changes,
  public.cash_movement_corrections,
  public.payment_transactions,
  public.payment_tenders,
  public.payment_order_allocations,
  public.payment_item_allocations,
  public.payment_tender_method_changes
  TO authenticated;
GRANT INSERT, UPDATE ON TABLE
  public.cash_shifts,
  public.cash_movements,
  public.cash_shift_pending_orders,
  public.cash_shift_adjustments,
  public.cash_shift_opening_float_changes,
  public.cash_movement_corrections,
  public.payment_transactions,
  public.payment_order_allocations,
  public.payment_item_allocations
  TO authenticated;
