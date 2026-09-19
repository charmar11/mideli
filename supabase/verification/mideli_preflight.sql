-- Read-only production preflight for the Mideli multibusiness migration.
-- It intentionally returns counts and schema metadata only. It must not be
-- used as a substitute for a restorable backup or for identity verification.

SELECT jsonb_build_object(
  'multibusiness_tables', (
    SELECT count(*)
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('organizations', 'businesses', 'memberships')
  ),
  'orders', (SELECT count(*) FROM public.orders),
  'menu_items', (SELECT count(*) FROM public.menu_items),
  'categories', (SELECT count(*) FROM public.categories),
  'inventory_items', (SELECT count(*) FROM public.inventory_items),
  'cash_shifts', (SELECT count(*) FROM public.cash_shifts),
  'payment_transactions', (SELECT count(*) FROM public.payment_transactions),
  'customers', (SELECT count(*) FROM public.customers),
  'customer_addresses', (SELECT count(*) FROM public.customer_addresses),
  'profiles', (SELECT count(*) FROM public.profiles),
  'expected_active_profiles', (
    SELECT count(*)
      FROM public.profiles
     WHERE is_active
       AND full_name IN ('Administrador', 'andrea', 'mauro', 'Mideli')
  ),
  'expected_profiles_linked_to_auth', (
    SELECT count(*)
      FROM public.profiles AS profile
     WHERE profile.is_active
       AND profile.full_name IN ('Administrador', 'andrea', 'mauro', 'Mideli')
       AND EXISTS (SELECT 1 FROM auth.users AS auth_user WHERE auth_user.id = profile.id)
  ),
  'open_cash_shifts', (
    SELECT count(*) FROM public.cash_shifts WHERE status = 'open'
  ),
  'order_items_without_order', (
    SELECT count(*)
      FROM public.order_items AS item
     WHERE NOT EXISTS (SELECT 1 FROM public.orders AS order_row WHERE order_row.id = item.order_id)
  ),
  'order_items_without_menu_item', (
    SELECT count(*)
      FROM public.order_items AS item
     WHERE NOT EXISTS (SELECT 1 FROM public.menu_items AS menu_item WHERE menu_item.id = item.menu_item_id)
  ),
  'inventory_recipe_orphans', (
    SELECT count(*)
      FROM public.inventory_recipes AS recipe
     WHERE NOT EXISTS (SELECT 1 FROM public.menu_items AS menu_item WHERE menu_item.id = recipe.menu_item_id)
        OR NOT EXISTS (SELECT 1 FROM public.inventory_items AS inventory_item WHERE inventory_item.id = recipe.inventory_item_id)
  ),
  'inventory_movement_orphans', (
    SELECT count(*)
      FROM public.inventory_movements AS movement
     WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items AS inventory_item WHERE inventory_item.id = movement.inventory_item_id)
  ),
  'inventory_count_line_orphans', (
    SELECT count(*)
      FROM public.inventory_count_lines AS line
     WHERE NOT EXISTS (SELECT 1 FROM public.inventory_counts AS count_row WHERE count_row.id = line.count_id)
        OR NOT EXISTS (SELECT 1 FROM public.inventory_items AS inventory_item WHERE inventory_item.id = line.inventory_item_id)
  ),
  'purchase_line_orphans', (
    SELECT count(*)
      FROM public.inventory_purchase_order_lines AS line
     WHERE NOT EXISTS (SELECT 1 FROM public.inventory_purchase_orders AS purchase_order WHERE purchase_order.id = line.purchase_order_id)
        OR NOT EXISTS (SELECT 1 FROM public.inventory_items AS inventory_item WHERE inventory_item.id = line.inventory_item_id)
  ),
  'receipt_line_orphans', (
    SELECT count(*)
      FROM public.inventory_receipt_lines AS line
     WHERE NOT EXISTS (SELECT 1 FROM public.inventory_receipts AS receipt WHERE receipt.id = line.receipt_id)
        OR NOT EXISTS (SELECT 1 FROM public.inventory_items AS inventory_item WHERE inventory_item.id = line.inventory_item_id)
  ),
  'lot_item_orphans', (
    SELECT count(*)
      FROM public.inventory_lots AS lot
     WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items AS inventory_item WHERE inventory_item.id = lot.inventory_item_id)
  ),
  'payments_without_shift_or_order_allocation', (
    SELECT count(*)
      FROM public.payment_transactions AS transaction
     WHERE NOT EXISTS (
             SELECT 1
               FROM public.cash_shifts AS shift
              WHERE shift.id = transaction.cash_shift_id
           )
       AND NOT EXISTS (
             SELECT 1
               FROM public.payment_order_allocations AS allocation
              WHERE allocation.transaction_id = transaction.id
           )
  ),
  'print_jobs_without_order', (
    SELECT count(*)
      FROM public.print_jobs AS job
     WHERE NOT EXISTS (SELECT 1 FROM public.orders AS order_row WHERE order_row.id = job.order_id)
  ),
  'push_events_without_order', (
    SELECT count(*)
      FROM public.push_notification_events AS event
     WHERE NOT EXISTS (SELECT 1 FROM public.orders AS order_row WHERE order_row.id = event.order_id)
  )
) AS preflight;
