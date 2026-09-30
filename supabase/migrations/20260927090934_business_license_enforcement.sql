-- Replace the all-or-nothing statement trigger with business-aware row checks.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_schedule_status_check,
  ADD CONSTRAINT orders_schedule_status_check
    CHECK (schedule_status IN ('none', 'scheduled', 'released', 'review_required'));

CREATE OR REPLACE FUNCTION private.business_license_allows_read(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.business_license_is_available(p_business_id);
$$;
REVOKE ALL ON FUNCTION private.business_license_allows_read(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.business_license_allows_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.business_id_for_license_row(
  p_table_name text,
  p_row jsonb
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_parent_id uuid;
BEGIN
  IF NULLIF(p_row->>'business_id', '') IS NOT NULL THEN
    RETURN (p_row->>'business_id')::uuid;
  END IF;

  CASE
    WHEN p_table_name = 'inventory_count_lines' THEN
      v_parent_id := NULLIF(p_row->>'count_id', '')::uuid;
      SELECT count_row.business_id INTO v_id
        FROM public.inventory_counts AS count_row WHERE count_row.id = v_parent_id;
    WHEN p_table_name = 'inventory_purchase_order_lines' THEN
      v_parent_id := NULLIF(p_row->>'purchase_order_id', '')::uuid;
      SELECT parent.business_id INTO v_id
        FROM public.inventory_purchase_orders AS parent WHERE parent.id = v_parent_id;
    WHEN p_table_name = 'inventory_receipt_lines' THEN
      v_parent_id := NULLIF(p_row->>'receipt_id', '')::uuid;
      SELECT parent.business_id INTO v_id
        FROM public.inventory_receipts AS parent WHERE parent.id = v_parent_id;
    WHEN p_table_name = 'order_items' THEN
      v_parent_id := NULLIF(p_row->>'order_id', '')::uuid;
      SELECT parent.business_id INTO v_id
        FROM public.orders AS parent WHERE parent.id = v_parent_id;
    WHEN p_table_name = 'order_status_log' THEN
      v_parent_id := NULLIF(p_row->>'order_id', '')::uuid;
      SELECT parent.business_id INTO v_id
        FROM public.orders AS parent WHERE parent.id = v_parent_id;
    WHEN p_table_name IN (
      'cash_movement_corrections', 'cash_shift_opening_float_changes',
      'cash_shift_adjustments', 'cash_movements'
    ) THEN
      v_parent_id := NULLIF(p_row->>'shift_id', '')::uuid;
      SELECT parent.business_id INTO v_id
        FROM public.cash_shifts AS parent WHERE parent.id = v_parent_id;
    WHEN p_table_name = 'cash_shift_pending_orders' THEN
      v_parent_id := COALESCE(
        NULLIF(p_row->>'closing_shift_id', '')::uuid,
        NULLIF(p_row->>'next_shift_id', '')::uuid
      );
      SELECT parent.business_id INTO v_id
        FROM public.cash_shifts AS parent WHERE parent.id = v_parent_id;
    WHEN p_table_name = 'payment_order_allocations' THEN
      v_parent_id := NULLIF(p_row->>'order_id', '')::uuid;
      SELECT parent.business_id INTO v_id
        FROM public.orders AS parent WHERE parent.id = v_parent_id;
    WHEN p_table_name = 'print_jobs' THEN
      v_parent_id := NULLIF(p_row->>'order_id', '')::uuid;
      SELECT parent.business_id INTO v_id
        FROM public.orders AS parent WHERE parent.id = v_parent_id;
    WHEN p_table_name = 'payment_tender_method_changes' THEN
      v_parent_id := NULLIF(p_row->>'tender_id', '')::uuid;
      SELECT parent.business_id INTO v_id
        FROM public.payment_tenders AS parent WHERE parent.id = v_parent_id;
    ELSE
      RETURN NULL;
  END CASE;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION private.business_id_for_license_row(text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.enforce_business_license_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_business_id uuid;
  v_new_business_id uuid;
  v_business_id uuid;
  v_checked boolean := false;
  v_allow_draft_setup boolean := TG_TABLE_NAME IN (
    'categories', 'menu_items', 'inventory_items', 'inventory_recipes',
    'inventory_lots', 'inventory_movements', 'inventory_counts',
    'inventory_count_lines', 'inventory_purchase_orders',
    'inventory_purchase_order_lines', 'inventory_receipts', 'inventory_receipt_lines'
  );
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old_business_id := private.business_id_for_license_row(TG_TABLE_NAME, to_jsonb(OLD));
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_business_id := private.business_id_for_license_row(TG_TABLE_NAME, to_jsonb(NEW));
  END IF;

  FOREACH v_business_id IN ARRAY ARRAY[v_old_business_id, v_new_business_id]
  LOOP
    IF v_business_id IS NOT NULL THEN
      v_checked := true;
      IF v_allow_draft_setup THEN
        IF NOT private.business_license_allows_setup(v_business_id) THEN
          RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BUSINESS_LICENSE_INACTIVE';
        END IF;
      ELSIF NOT private.business_license_is_available(v_business_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BUSINESS_LICENSE_INACTIVE';
      END IF;
    END IF;
  END LOOP;
  IF NOT v_checked THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BUSINESS_LICENSE_CONTEXT_UNAVAILABLE';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_business_license_write() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_table text;
  v_direct_business_tables text[] := ARRAY[
    'business_accounts',
    'cash_movement_corrections',
    'cash_movements',
    'cash_shift_adjustments',
    'cash_shift_opening_float_changes',
    'cash_shift_pending_orders',
    'cash_shifts',
    'categories',
    'inventory_counts',
    'inventory_items',
    'inventory_lots',
    'inventory_movements',
    'inventory_purchase_orders',
    'inventory_receipts',
    'inventory_recipes',
    'legacy_sales_tickets',
    'menu_items',
    'orders',
    'payment_item_allocations',
    'payment_order_allocations',
    'payment_tender_method_changes',
    'payment_tenders',
    'payment_transactions',
    'print_jobs'
  ];
  v_child_tables text[] := ARRAY[
    'inventory_count_lines', 'inventory_purchase_order_lines',
    'inventory_receipt_lines', 'order_items', 'order_status_log'
  ];
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cash_movements', 'cash_shift_adjustments', 'cash_shift_pending_orders',
    'cash_shifts', 'categories', 'inventory_count_lines', 'inventory_counts',
    'inventory_items', 'inventory_lots', 'inventory_movements',
    'inventory_purchase_order_lines', 'inventory_purchase_orders',
    'inventory_receipt_lines', 'inventory_receipts', 'inventory_recipes',
    'menu_items', 'order_folio_counter', 'order_items', 'order_status_log',
    'orders', 'owner_daily_report_runs', 'owner_report_settings',
    'payment_item_allocations', 'payment_order_allocations',
    'payment_tender_method_changes', 'payment_tenders', 'payment_transactions',
    'print_jobs', 'print_station_settings', 'profiles', 'push_subscriptions',
    'restaurant_tables', 'table_map_labels', 'table_zones', 'user_onboarding_progress'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS aaa_enforce_app_license_write ON public.%I', v_table);
  END LOOP;

  FOREACH v_table IN ARRAY v_direct_business_tables LOOP
    EXECUTE format(
      'CREATE TRIGGER zzzz_enforce_business_license_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.enforce_business_license_write()',
      v_table
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS business_license_read_gate ON public.%I', v_table
    );
    IF v_table IN (
      'categories', 'menu_items', 'inventory_counts', 'inventory_items',
      'inventory_lots', 'inventory_movements', 'inventory_purchase_orders',
      'inventory_receipts', 'inventory_recipes'
    ) THEN
      EXECUTE format(
        'CREATE POLICY business_license_read_gate ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (private.business_license_allows_setup(business_id))',
        v_table
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY business_license_read_gate ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (private.business_license_allows_read(business_id))',
        v_table
      );
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY v_child_tables LOOP
    EXECUTE format(
      'CREATE TRIGGER zzzz_enforce_business_license_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.enforce_business_license_write()',
      v_table
    );
  END LOOP;

  EXECUTE 'DROP POLICY IF EXISTS business_license_read_gate ON public.inventory_count_lines';
  EXECUTE 'CREATE POLICY business_license_read_gate ON public.inventory_count_lines AS RESTRICTIVE FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.inventory_counts parent WHERE parent.id = count_id AND private.business_license_allows_setup(parent.business_id)))';
  EXECUTE 'DROP POLICY IF EXISTS business_license_read_gate ON public.inventory_purchase_order_lines';
  EXECUTE 'CREATE POLICY business_license_read_gate ON public.inventory_purchase_order_lines AS RESTRICTIVE FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.inventory_purchase_orders parent WHERE parent.id = purchase_order_id AND private.business_license_allows_setup(parent.business_id)))';
  EXECUTE 'DROP POLICY IF EXISTS business_license_read_gate ON public.inventory_receipt_lines';
  EXECUTE 'CREATE POLICY business_license_read_gate ON public.inventory_receipt_lines AS RESTRICTIVE FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.inventory_receipts parent WHERE parent.id = receipt_id AND private.business_license_allows_setup(parent.business_id)))';
  EXECUTE 'DROP POLICY IF EXISTS business_license_read_gate ON public.order_items';
  EXECUTE 'CREATE POLICY business_license_read_gate ON public.order_items AS RESTRICTIVE FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders parent WHERE parent.id = order_id AND private.business_license_allows_read(parent.business_id)))';
  EXECUTE 'DROP POLICY IF EXISTS business_license_read_gate ON public.order_status_log';
  EXECUTE 'CREATE POLICY business_license_read_gate ON public.order_status_log AS RESTRICTIVE FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders parent WHERE parent.id = order_id AND private.business_license_allows_read(parent.business_id)))';
END;
$$;

-- The public image bucket is retained for compatibility. Mutations now require
-- a catalog item that belongs to a licensed business or an unlicensed draft.
CREATE OR REPLACE FUNCTION private.business_license_allows_product_image(p_path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product_id uuid;
  v_business_id uuid;
BEGIN
  BEGIN
    v_product_id := split_part(COALESCE(p_path, ''), '/', 1)::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  SELECT item.business_id INTO v_business_id
    FROM public.menu_items AS item WHERE item.id = v_product_id;
  RETURN v_business_id IS NOT NULL
    AND private.business_license_allows_setup(v_business_id);
END;
$$;
REVOKE ALL ON FUNCTION private.business_license_allows_product_image(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.business_license_allows_product_image(text) TO authenticated;

DROP POLICY IF EXISTS "Active license required for menu image inserts" ON storage.objects;
DROP POLICY IF EXISTS "Active license required for menu image updates" ON storage.objects;
DROP POLICY IF EXISTS "Active license required for menu image deletes" ON storage.objects;

CREATE POLICY "Business license required for menu image inserts"
  ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id <> 'menu-product-images'
    OR private.business_license_allows_product_image(name)
  );
CREATE POLICY "Business license required for menu image updates"
  ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    bucket_id <> 'menu-product-images'
    OR private.business_license_allows_product_image(name)
  )
  WITH CHECK (
    bucket_id <> 'menu-product-images'
    OR private.business_license_allows_product_image(name)
  );
CREATE POLICY "Business license required for menu image deletes"
  ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    bucket_id <> 'menu-product-images'
    OR private.business_license_allows_product_image(name)
  );

DROP POLICY IF EXISTS "Active license required for menu image inserts" ON storage.objects;
DROP POLICY IF EXISTS "Active license required for menu image updates" ON storage.objects;
DROP POLICY IF EXISTS "Active license required for menu image deletes" ON storage.objects;

CREATE OR REPLACE FUNCTION public.create_business_order_with_items(
  p_business_id uuid,
  p_creation_key uuid,
  p_items jsonb,
  p_order_type text,
  p_notes text DEFAULT '',
  p_table_number text DEFAULT NULL,
  p_table_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_existing public.orders%ROWTYPE;
  v_created public.orders%ROWTYPE;
  v_total bigint := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión'; END IF;
  IF p_business_id IS NULL OR p_creation_key IS NULL THEN
    RAISE EXCEPTION 'Falta seleccionar el negocio o la clave de pedido';
  END IF;
  IF p_order_type NOT IN ('comedor', 'domicilio', 'para_llevar') THEN
    RAISE EXCEPTION 'Tipo de pedido no válido';
  END IF;
  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'El pedido debe contener al menos un producto';
  END IF;
  IF NOT private.business_license_is_available(p_business_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BUSINESS_LICENSE_INACTIVE';
  END IF;

  SELECT business.organization_id INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = p_business_id AND business.lifecycle_status = 'active';
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'El negocio no está disponible para recibir pedidos';
  END IF;
  IF NOT (
    private.multibusiness_has_capability('organization.operate_orders', v_organization_id, NULL)
    OR private.multibusiness_has_capability('business.operate_orders', v_organization_id, p_business_id)
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para operar este negocio';
  END IF;
  IF p_table_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.restaurant_tables AS restaurant_table
     WHERE restaurant_table.id = p_table_id
       AND restaurant_table.organization_id = v_organization_id
       AND restaurant_table.is_active
  ) THEN
    RAISE EXCEPTION 'La mesa no está disponible en esta organización';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS license_order_lines (
    line_number bigint NOT NULL,
    menu_item_id uuid NOT NULL,
    business_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price integer NOT NULL,
    notes text NOT NULL,
    selected_modifiers jsonb NOT NULL,
    line_total bigint NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.license_order_lines;
  INSERT INTO pg_temp.license_order_lines
  SELECT input_line.ordinality, canonical.menu_item_id, canonical.business_id,
         canonical.quantity, canonical.unit_price, canonical.notes,
         canonical.selected_modifiers, canonical.line_total
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS input_line(value, ordinality)
    CROSS JOIN LATERAL private.multibusiness_canonicalize_order_item(input_line.value) AS canonical;
  IF EXISTS (SELECT 1 FROM pg_temp.license_order_lines WHERE business_id IS DISTINCT FROM p_business_id) THEN
    RAISE EXCEPTION 'El carrito contiene productos de otro negocio';
  END IF;
  SELECT COALESCE(SUM(line_total), 0)::bigint INTO v_total FROM pg_temp.license_order_lines;
  IF v_total > 2147483647 THEN RAISE EXCEPTION 'El total del pedido excede el límite permitido'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_creation_key::text, 406));
  SELECT * INTO v_existing FROM public.orders WHERE creation_key = p_creation_key FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.business_id IS DISTINCT FROM p_business_id THEN
      RAISE EXCEPTION 'La clave del pedido ya fue utilizada por otro negocio';
    END IF;
    RETURN v_existing;
  END IF;

  INSERT INTO public.orders (
    creation_key, status, type, total, notes, table_number, table_id,
    customer_name, created_by, business_id
  ) VALUES (
    p_creation_key, 'pending', p_order_type::public.order_type, v_total::integer,
    left(COALESCE(p_notes, ''), 1000), NULLIF(btrim(COALESCE(p_table_number, '')), ''),
    p_table_id, NULLIF(btrim(COALESCE(p_customer_name, '')), ''), v_user_id, p_business_id
  ) RETURNING * INTO v_created;
  INSERT INTO public.order_items (order_id, menu_item_id, quantity, unit_price, notes, selected_modifiers)
  SELECT v_created.id, line.menu_item_id, line.quantity, line.unit_price,
         line.notes, line.selected_modifiers
    FROM pg_temp.license_order_lines AS line ORDER BY line.line_number;
  INSERT INTO public.order_status_log (order_id, to_status, changed_by)
  VALUES (v_created.id, 'pending', v_user_id);
  RETURN v_created;
END;
$$;
REVOKE ALL ON FUNCTION public.create_business_order_with_items(uuid, uuid, jsonb, text, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_order_with_items(uuid, uuid, jsonb, text, text, text, uuid, text)
  TO authenticated;

-- Restrict local activation until a first license exists. Draft businesses can
-- still be configured; only the platform can activate them after assignment.
CREATE OR REPLACE FUNCTION private.require_license_before_business_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.lifecycle_status = 'active'
     AND OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status
     AND NOT private.business_license_term_is_current(NEW.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BUSINESS_LICENSE_REQUIRED_TO_ACTIVATE';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.require_license_before_business_activation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS businesses_require_license_before_activation ON public.businesses;
CREATE TRIGGER businesses_require_license_before_activation
  BEFORE UPDATE OF lifecycle_status ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION private.require_license_before_business_activation();

-- Retain only the technical emergency switch in the legacy singleton.
CREATE OR REPLACE FUNCTION private.is_app_license_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_license WHERE id = 1 AND status = 'active');
$$;
REVOKE ALL ON FUNCTION private.is_app_license_active() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.enforce_app_license_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_app_license_active() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_EMERGENCY_SUSPENDED';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_app_license_active() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.mideli_license_is_available()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.businesses AS business
     WHERE business.slug = 'mideli'
       AND private.business_license_is_available(business.id)
  );
$$;
REVOKE ALL ON FUNCTION private.mideli_license_is_available() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.mideli_license_is_available() TO authenticated;

CREATE OR REPLACE FUNCTION private.enforce_mideli_license_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.mideli_license_is_available() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BUSINESS_LICENSE_INACTIVE';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_mideli_license_write() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'order_folio_counter', 'owner_daily_report_runs', 'owner_report_settings',
    'print_station_settings'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER zzzz_enforce_mideli_license_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.enforce_mideli_license_write()',
      v_table
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS business_license_read_gate ON public.%I', v_table
    );
    EXECUTE format(
      'CREATE POLICY business_license_read_gate ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (private.mideli_license_is_available())',
      v_table
    );
  END LOOP;
END;
$$;

-- Direct memberships and audit data stay available for authentication and
-- platform management, while rows tied to an unavailable business are hidden.
DO $$
BEGIN
  DROP POLICY IF EXISTS business_license_membership_read_gate ON public.memberships;
  CREATE POLICY business_license_membership_read_gate
    ON public.memberships AS RESTRICTIVE FOR SELECT TO authenticated
    USING (business_id IS NULL OR private.business_license_allows_read(business_id));

  DROP POLICY IF EXISTS business_license_membership_write_gate ON public.memberships;
  CREATE POLICY business_license_membership_write_gate
    ON public.memberships AS RESTRICTIVE FOR ALL TO authenticated
    USING (business_id IS NULL OR private.business_license_allows_read(business_id))
    WITH CHECK (business_id IS NULL OR private.business_license_allows_read(business_id));

  DROP POLICY IF EXISTS business_license_membership_capability_read_gate ON public.membership_capabilities;
  CREATE POLICY business_license_membership_capability_read_gate
    ON public.membership_capabilities AS RESTRICTIVE FOR SELECT TO authenticated
    USING (business_id IS NULL OR private.business_license_allows_read(business_id));

  DROP POLICY IF EXISTS business_license_membership_capability_write_gate ON public.membership_capabilities;
  CREATE POLICY business_license_membership_capability_write_gate
    ON public.membership_capabilities AS RESTRICTIVE FOR ALL TO authenticated
    USING (business_id IS NULL OR private.business_license_allows_read(business_id))
    WITH CHECK (business_id IS NULL OR private.business_license_allows_read(business_id));

  DROP POLICY IF EXISTS business_license_audit_read_gate ON public.audit_events;
  CREATE POLICY business_license_audit_read_gate
    ON public.audit_events AS RESTRICTIVE FOR SELECT TO authenticated
    USING (business_id IS NULL OR private.business_license_allows_read(business_id));
END;
$$;
