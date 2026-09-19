-- Read-only production invariant checks after the Mideli multibusiness cutover.
-- This script intentionally returns counts and stable slugs only, never PII.

DO $$
DECLARE
  v_organization_id uuid;
  v_business_id uuid;
  v_count bigint;
  v_table text;
  v_null_count bigint;
  v_expected_business_tables text[] := ARRAY[
    'categories',
    'menu_items',
    'orders',
    'inventory_items',
    'inventory_recipes',
    'inventory_movements',
    'inventory_counts',
    'inventory_purchase_orders',
    'inventory_receipts',
    'inventory_lots',
    'cash_shifts',
    'cash_movements',
    'cash_shift_pending_orders',
    'cash_shift_adjustments',
    'cash_shift_opening_float_changes',
    'cash_movement_corrections',
    'payment_transactions',
    'payment_tenders',
    'payment_order_allocations',
    'payment_item_allocations',
    'payment_tender_method_changes',
    'print_jobs',
    'push_notification_events',
    'business_accounts'
  ];
BEGIN
  SELECT id
    INTO v_organization_id
    FROM public.organizations
   WHERE slug = 'rincon-404-food-park'
     AND name = 'Rincón 404 Food Park'
     AND timezone = 'America/Hermosillo'
     AND lifecycle_status = 'active';

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'No existe una organización activa compatible para Rincón 404 Food Park';
  END IF;

  SELECT id
    INTO v_business_id
    FROM public.businesses
   WHERE organization_id = v_organization_id
     AND slug = 'mideli'
     AND display_name = 'Mideli'
     AND timezone = 'America/Hermosillo'
     AND lifecycle_status = 'active';

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'No existe un negocio Mideli activo compatible';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.organizations
   WHERE slug = 'rincon-404-food-park';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Debe existir una sola organización Rincón 404: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.businesses
   WHERE organization_id = v_organization_id
     AND slug = 'mideli';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Debe existir un solo negocio Mideli: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.memberships
   WHERE organization_id = v_organization_id
     AND business_id = v_business_id
     AND role_code = 'business_owner'
     AND scope_type = 'business'
     AND status = 'active';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'La membresía activa del dueño de Mideli no es única: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.memberships
   WHERE organization_id = v_organization_id
     AND business_id IS NULL
     AND role_code = 'global_waiter'
     AND scope_type = 'organization'
     AND status = 'active';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'La membresía global de mesera no es única: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.memberships
   WHERE organization_id = v_organization_id
     AND business_id = v_business_id
     AND role_code = 'local_kitchen'
     AND scope_type = 'business'
     AND status = 'active';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'La membresía local de cocina no es única: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.memberships
   WHERE organization_id = v_organization_id
     AND business_id = v_business_id
     AND role_code = 'legacy_account'
     AND status <> 'active';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'La cuenta heredada de Mideli no quedó desactivada: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.membership_capabilities AS capability
    JOIN public.memberships AS membership
      ON membership.id = capability.membership_id
   WHERE membership.organization_id = v_organization_id
     AND membership.business_id = v_business_id
     AND membership.role_code = 'legacy_account'
     AND capability.revoked_at IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'La cuenta heredada conserva capacidades activas: %', v_count;
  END IF;

  FOREACH v_table IN ARRAY v_expected_business_tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE business_id IS NULL', v_table)
      INTO v_null_count;
    IF v_null_count <> 0 THEN
      RAISE EXCEPTION 'La tabla % tiene % filas sin negocio', v_table, v_null_count;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_count
    FROM public.categories AS category
    JOIN public.menu_items AS menu_item
      ON menu_item.category_id = category.id
   WHERE category.business_id IS DISTINCT FROM menu_item.business_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Hay categorías y productos cruzados: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.orders AS order_row
    JOIN public.order_items AS order_item
      ON order_item.order_id = order_row.id
    JOIN public.menu_items AS menu_item
      ON menu_item.id = order_item.menu_item_id
   WHERE order_row.business_id IS DISTINCT FROM menu_item.business_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Hay pedidos con productos de otro negocio: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.inventory_recipes AS recipe
    JOIN public.menu_items AS menu_item
      ON menu_item.id = recipe.menu_item_id
    JOIN public.inventory_items AS inventory_item
      ON inventory_item.id = recipe.inventory_item_id
   WHERE recipe.business_id IS DISTINCT FROM menu_item.business_id
      OR recipe.business_id IS DISTINCT FROM inventory_item.business_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Hay recetas que cruzan negocios: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.payment_order_allocations AS allocation
    JOIN public.payment_transactions AS transaction
      ON transaction.id = allocation.transaction_id
    JOIN public.orders AS order_row
      ON order_row.id = allocation.order_id
   WHERE transaction.business_id IS DISTINCT FROM order_row.business_id
      OR allocation.business_id IS DISTINCT FROM transaction.business_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Hay cobros asignados a otro negocio: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.orders
   WHERE business_id = v_business_id;
  IF v_count <> 214 THEN
    RAISE EXCEPTION 'El conteo histórico de pedidos cambió: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.payment_transactions
   WHERE business_id = v_business_id;
  IF v_count <> 215 THEN
    RAISE EXCEPTION 'El conteo histórico de transacciones cambió: %', v_count;
  END IF;
END;
$$;

SELECT jsonb_build_object(
  'organization_slug', organization.slug,
  'organization_status', organization.lifecycle_status,
  'business_slug', business.slug,
  'business_status', business.lifecycle_status,
  'business_count_in_org', (
    SELECT count(*)
      FROM public.businesses AS all_businesses
     WHERE all_businesses.organization_id = organization.id
  ),
  'active_memberships', (
    SELECT count(*)
      FROM public.memberships AS membership
     WHERE membership.organization_id = organization.id
       AND membership.status = 'active'
  ),
  'categories', (SELECT count(*) FROM public.categories WHERE business_id = business.id),
  'menu_items', (SELECT count(*) FROM public.menu_items WHERE business_id = business.id),
  'orders', (SELECT count(*) FROM public.orders WHERE business_id = business.id),
  'payment_transactions', (
    SELECT count(*) FROM public.payment_transactions WHERE business_id = business.id
  ),
  'inventory_items', (
    SELECT count(*) FROM public.inventory_items WHERE business_id = business.id
  ),
  'open_cash_shifts', (
    SELECT count(*)
      FROM public.cash_shifts
     WHERE business_id = business.id
       AND status = 'open'
  )
)
  FROM public.organizations AS organization
  JOIN public.businesses AS business
    ON business.organization_id = organization.id
 WHERE organization.slug = 'rincon-404-food-park'
   AND business.slug = 'mideli';
