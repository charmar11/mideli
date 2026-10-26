BEGIN;

SELECT plan(19);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_attribute AS attribute
      JOIN pg_attrdef AS default_value
        ON default_value.adrelid = attribute.attrelid
       AND default_value.adnum = attribute.attnum
     WHERE attribute.attrelid = 'public.businesses'::regclass
       AND attribute.attname = 'marketplace_orders_enabled'
       AND attribute.attnotnull
       AND pg_get_expr(default_value.adbin, default_value.adrelid) = 'false'
  ),
  'new businesses have marketplace orders disabled by default'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_attribute AS attribute
     JOIN pg_attrdef AS default_value
       ON default_value.adrelid = attribute.attrelid
      AND default_value.adnum = attribute.attnum
     WHERE attribute.attrelid = 'public.business_marketplace_prices'::regclass
       AND attribute.attname = 'is_available'
       AND attribute.attnotnull
       AND pg_get_expr(default_value.adbin, default_value.adrelid) = 'false'
  )
  AND EXISTS (
    SELECT 1 FROM pg_attribute AS attribute
     WHERE attribute.attrelid = 'public.business_marketplace_prices'::regclass
       AND attribute.attname = 'platform_price'
       AND NOT attribute.attnotnull
  ),
  'products default to unavailable and can use the normal menu price when no override exists'
);

SELECT ok(
  (SELECT prosrc LIKE '%price.is_available%'
          AND prosrc LIKE '%COALESCE(price.platform_price, menu_item.price)%'
     FROM pg_proc WHERE oid = 'public.get_marketplace_order_price_map(uuid,text,text)'::regprocedure),
  'the order price map includes only available products and safely falls back to the menu price'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.orders'::regclass
       AND tgname = 'orders_guard_marketplace_product_availability_insert'
       AND NOT tgisinternal
  )
  AND EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.orders'::regclass
       AND tgname = 'orders_guard_marketplace_product_availability_update'
       AND NOT tgisinternal
  )
  AND (SELECT prosrc LIKE '%MARKETPLACE_PRODUCT_NOT_AVAILABLE%'
          AND prosrc LIKE '%channel_product.is_available%'
         FROM pg_proc WHERE oid = 'private.guard_marketplace_order_product_availability()'::regprocedure),
  'the database rejects unavailable or unconfigured products even if the POS is bypassed'
);

SELECT ok(
  (SELECT count(*) = 18
     FROM public.business_marketplace_prices AS price
     JOIN public.businesses AS business ON business.id = price.business_id
    WHERE business.slug = 'just-dipping'
      AND price.platform = 'uber_eats'
      AND price.is_available)
  AND (SELECT count(*) = 9
         FROM public.business_marketplace_prices AS price
         JOIN public.businesses AS business ON business.id = price.business_id
        WHERE business.slug = 'just-dipping'
          AND price.platform = 'didi_food'
          AND price.is_available)
  AND EXISTS (
    SELECT 1 FROM public.business_marketplace_prices AS price
     JOIN public.businesses AS business ON business.id = price.business_id
     JOIN public.menu_items AS menu_item ON menu_item.id = price.menu_item_id
    WHERE business.slug = 'just-dipping'
      AND price.platform = 'uber_eats'
      AND menu_item.name = 'Regular Box'
      AND price.platform_price = 170
      AND price.is_available
  )
  AND EXISTS (
    SELECT 1 FROM public.business_marketplace_prices AS price
     JOIN public.businesses AS business ON business.id = price.business_id
     JOIN public.menu_items AS menu_item ON menu_item.id = price.menu_item_id
    WHERE business.slug = 'just-dipping'
      AND price.platform = 'didi_food'
      AND menu_item.name = 'Regular Box'
      AND price.platform_price = 160
      AND price.is_available
  ),
  'the screenshot prices and different product lists are seeded for Just Dipping without enabling either channel'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.business_marketplace_settings'::regclass)
  AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.business_marketplace_prices'::regclass),
  'marketplace configuration tables have row-level security enabled'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.business_marketplace_settings', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.business_marketplace_prices', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.business_marketplace_settings', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.business_marketplace_prices', 'SELECT'),
  'marketplace pricing cannot be read directly through the Data API'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.get_marketplace_order_price_map(uuid,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.get_marketplace_order_price_map(uuid,text,text)', 'EXECUTE'),
  'only signed-in staff may request the validated platform price map'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.save_business_marketplace_settings(uuid,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.save_business_marketplace_settings(uuid,jsonb)', 'EXECUTE'),
  'only signed-in staff may call the permission-checked marketplace settings RPC'
);

SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.save_business_marketplace_settings(uuid,jsonb)'::regprocedure)
  AND (SELECT prosrc LIKE '%business.manage_catalog%' AND prosrc LIKE '%platform.manage_businesses%'
         FROM pg_proc WHERE oid = 'public.save_business_marketplace_settings(uuid,jsonb)'::regprocedure),
  'saving platform settings checks local catalog or platform administration permission'
);

SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.create_business_order_with_details(uuid,uuid,jsonb,text,text,text,uuid,text,jsonb)'::regprocedure)
  AND has_function_privilege('authenticated', 'public.create_business_order_with_details(uuid,uuid,jsonb,text,text,text,uuid,text,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.create_business_order_with_details(uuid,uuid,jsonb,text,text,text,uuid,text,jsonb)', 'EXECUTE'),
  'marketplace orders keep the atomic POS entry point under caller RLS'
);

SELECT ok(
  (SELECT prosrc LIKE '%get_marketplace_order_price_map%'
          AND prosrc LIKE '%marketplace_platform%'
          AND prosrc LIKE '%marketplace_payment_mode%'
          AND prosrc LIKE '%p_order_type IS DISTINCT FROM ''para_llevar''%'
          AND prosrc LIKE '%v_has_delivery OR v_has_schedule%'
          FROM pg_proc WHERE oid = 'public.create_business_order_with_details(uuid,uuid,jsonb,text,text,text,uuid,text,jsonb)'::regprocedure),
  'platform creation uses server prices and cannot become local delivery or scheduled pickup'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.handoff_marketplace_order(uuid,uuid,uuid,integer)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.handoff_marketplace_order(uuid,uuid,uuid,integer)', 'EXECUTE')
  AND (SELECT prosecdef FROM pg_proc WHERE oid = 'public.handoff_marketplace_order(uuid,uuid,uuid,integer)'::regprocedure),
  'platform handoff is an authenticated server-validated operation'
);

SELECT ok(
  (SELECT prosrc LIKE '%business.operate_orders%'
          AND prosrc LIKE '%business_license_is_available%'
          AND prosrc LIKE '%marketplace_cash_received%'
          AND prosrc LIKE '%shift.business_id = p_business_id%'
          AND prosrc LIKE '%v_order.status <> ''ready''%'
          AND prosrc LIKE '%FOR UPDATE%'
          AND prosrc LIKE '%v_order.marketplace_handed_off_at IS NOT NULL THEN RETURN v_order%'
          FROM pg_proc WHERE oid = 'public.handoff_marketplace_order(uuid,uuid,uuid,integer)'::regprocedure),
  'handoff validates permission, license, ready status, business cash scope, and idempotent retries'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.orders'::regclass
       AND tgname = 'log_order_status_transition'
       AND NOT tgisinternal
  )
  AND (SELECT prosrc NOT LIKE '%INSERT INTO public.order_status_log%'
         FROM pg_proc WHERE oid = 'public.handoff_marketplace_order(uuid,uuid,uuid,integer)'::regprocedure),
  'handoff relies on the existing status trigger and does not duplicate history entries'
);

SELECT ok(
  (SELECT prosrc LIKE '%marketplace_cash_total%'
          AND prosrc LIKE '%order_row.business_id = shift.business_id%'
          AND prosrc LIKE '%marketplace_handed_off_at IS NOT NULL%'
          AND prosrc LIKE '%marketplace_totals.marketplace_cash_total%'
          AND prosrc LIKE '%order_row.marketplace_platform IS NULL%'
          FROM pg_proc WHERE oid = 'private.cash_shift_totals(uuid)'::regprocedure),
  'Didi cash is counted once in its own business shift and excluded from local pending balances'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.orders'::regclass
       AND tgname = 'orders_block_marketplace_delete'
       AND NOT tgisinternal
  )
  AND (SELECT prosrc LIKE '%marketplace_platform IS NOT NULL%'
          FROM pg_proc WHERE oid = 'private.block_marketplace_order_delete()'::regprocedure),
  'marketplace order tickets and handoff receipts cannot be permanently deleted'
);

SELECT ok(
  (SELECT prosrc LIKE '%OLD.marketplace_handed_off_at IS NOT NULL%'
          AND prosrc LIKE '%NEW.status = ''cancelled''%'
          FROM pg_proc WHERE oid = 'private.guard_marketplace_order_fields()'::regprocedure),
  'a platform order cannot be cancelled after it has been handed to the courier'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.orders', 'SELECT')
  AND EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_marketplace_handoff_key_key'
       AND contype = 'u'
  ),
  'orders remain readable through normal authorization and handoff uses a unique idempotency key'
);

SELECT * FROM finish();

ROLLBACK;
