-- Create the transaction boundary for a mixed table order.
--
-- A table visit is shared by the food park, but each business receives its
-- own order and account. The RPC below is intentionally additive: existing
-- POS and WhatsApp calls keep using create_order_with_items until the shared
-- menu selector is ready.

CREATE TABLE public.order_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creation_key uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  table_visit_id uuid NOT NULL
    REFERENCES public.table_visits(id) ON DELETE RESTRICT,
  order_type public.order_type NOT NULL DEFAULT 'comedor',
  table_id uuid NOT NULL
    REFERENCES public.restaurant_tables(id) ON DELETE RESTRICT,
  table_number text,
  customer_name text,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'committed'
    CHECK (status IN ('committed', 'cancelled')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  cancellation_reason text,
  CONSTRAINT order_batches_table_order_check
    CHECK (order_type = 'comedor'),
  CONSTRAINT order_batches_cancellation_shape CHECK (
    (status = 'committed'
      AND cancelled_at IS NULL
      AND cancelled_by IS NULL
      AND cancellation_reason IS NULL)
    OR (status = 'cancelled'
      AND cancelled_at IS NOT NULL
      AND cancelled_by IS NOT NULL
      AND cancellation_reason IS NOT NULL
      AND btrim(cancellation_reason) <> '')
  )
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_batch_id uuid;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_batch_fkey
  FOREIGN KEY (order_batch_id)
  REFERENCES public.order_batches(id)
  ON DELETE RESTRICT;

CREATE INDEX order_batches_organization_created_idx
  ON public.order_batches (organization_id, created_at DESC);
CREATE INDEX order_batches_table_visit_idx
  ON public.order_batches (table_visit_id, created_at DESC);
CREATE INDEX orders_order_batch_idx
  ON public.orders (order_batch_id, created_at DESC)
  WHERE order_batch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.multibusiness_validate_order_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_batch_organization_id uuid;
  v_batch_visit_id uuid;
  v_batch_order_type public.order_type;
  v_business_organization_id uuid;
BEGIN
  IF NEW.order_batch_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT batch.organization_id, batch.table_visit_id, batch.order_type
    INTO v_batch_organization_id, v_batch_visit_id, v_batch_order_type
    FROM public.order_batches AS batch
   WHERE batch.id = NEW.order_batch_id
     AND batch.status = 'committed';

  IF v_batch_organization_id IS NULL THEN
    RAISE EXCEPTION 'La comanda compartida no existe o está cancelada';
  END IF;

  SELECT business.organization_id
    INTO v_business_organization_id
    FROM public.businesses AS business
   WHERE business.id = NEW.business_id;

  IF v_business_organization_id IS DISTINCT FROM v_batch_organization_id THEN
    RAISE EXCEPTION 'El pedido y la comanda no pertenecen a la misma organización';
  END IF;

  IF NEW.table_visit_id IS NULL THEN
    NEW.table_visit_id := v_batch_visit_id;
  ELSIF NEW.table_visit_id IS DISTINCT FROM v_batch_visit_id THEN
    RAISE EXCEPTION 'El pedido y la comanda no pertenecen a la misma visita';
  END IF;

  IF NEW.type IS DISTINCT FROM v_batch_order_type THEN
    RAISE EXCEPTION 'El tipo de pedido no coincide con la comanda';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_validate_order_batch
  ON public.orders;
CREATE TRIGGER orders_validate_order_batch
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_validate_order_batch();

-- Canonicalize one line from the client cart. The server owns the price and
-- modifier values, so a stale or forged tablet payload cannot change the bill.
CREATE OR REPLACE FUNCTION private.multibusiness_canonicalize_order_item(
  p_item jsonb
)
RETURNS TABLE (
  menu_item_id uuid,
  business_id uuid,
  quantity integer,
  unit_price integer,
  notes text,
  selected_modifiers jsonb,
  line_total bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_menu_item_id uuid;
  v_quantity integer;
  v_menu_item public.menu_items%ROWTYPE;
  v_selected jsonb;
  v_submitted jsonb;
  v_group jsonb;
  v_option jsonb;
  v_canonical jsonb := '[]'::jsonb;
  v_group_id text;
  v_option_id text;
  v_group_count integer;
  v_minimum integer;
  v_maximum integer;
  v_modifier_total integer := 0;
  v_unit_price integer;
BEGIN
  IF jsonb_typeof(p_item) <> 'object' THEN
    RAISE EXCEPTION 'Una línea del pedido no es válida';
  END IF;

  BEGIN
    v_menu_item_id := (p_item->>'menu_item_id')::uuid;
    v_quantity := COALESCE((p_item->>'quantity')::integer, 1);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Un producto contiene datos no válidos';
  END;

  IF v_quantity < 1 OR v_quantity > 99 THEN
    RAISE EXCEPTION 'Cantidad de producto no válida';
  END IF;

  SELECT menu_item.*
    INTO v_menu_item
    FROM public.menu_items AS menu_item
    LEFT JOIN public.categories AS category
      ON category.id = menu_item.category_id
   WHERE menu_item.id = v_menu_item_id
     AND menu_item.is_active
     AND menu_item.business_id IS NOT NULL
     AND (menu_item.category_id IS NULL OR category.is_active)
     AND (
       menu_item.category_id IS NULL
       OR category.business_id = menu_item.business_id
     );

  IF v_menu_item.id IS NULL THEN
    RAISE EXCEPTION 'Uno de los productos ya no está disponible';
  END IF;

  v_selected := COALESCE(p_item->'selected_modifiers', '[]'::jsonb);
  IF jsonb_typeof(v_selected) <> 'array' THEN
    RAISE EXCEPTION 'Las variaciones del producto no son válidas';
  END IF;

  FOR v_submitted IN
    SELECT value FROM jsonb_array_elements(v_selected)
  LOOP
    IF jsonb_typeof(v_submitted) <> 'object' THEN
      RAISE EXCEPTION 'Una variación del producto no es válida';
    END IF;

    v_group := NULL;
    SELECT candidate
      INTO v_group
      FROM jsonb_array_elements(COALESCE(v_menu_item.modifiers, '[]'::jsonb)) AS candidate
     WHERE (
       NULLIF(v_submitted->>'group_id', '') IS NOT NULL
       AND candidate->>'id' = v_submitted->>'group_id'
     )
     OR (
       NULLIF(v_submitted->>'group_id', '') IS NULL
       AND lower(candidate->>'name') = lower(COALESCE(v_submitted->>'group', ''))
       AND NULLIF(candidate->>'name', '') IS NOT NULL
     )
     LIMIT 1;

    IF v_group IS NULL THEN
      RAISE EXCEPTION 'Una variación no pertenece al producto';
    END IF;

    v_option := NULL;
    SELECT candidate
      INTO v_option
      FROM jsonb_array_elements(COALESCE(v_group->'options', '[]'::jsonb)) AS candidate
     WHERE (
       NULLIF(v_submitted->>'option_id', '') IS NOT NULL
       AND candidate->>'id' = v_submitted->>'option_id'
     )
     OR (
       NULLIF(v_submitted->>'option_id', '') IS NULL
       AND lower(candidate->>'name') = lower(COALESCE(v_submitted->>'option', ''))
       AND NULLIF(candidate->>'name', '') IS NOT NULL
     )
     LIMIT 1;

    IF v_option IS NULL THEN
      RAISE EXCEPTION 'Una opción no pertenece al producto';
    END IF;

    v_group_id := NULLIF(v_group->>'id', '');
    v_option_id := NULLIF(v_option->>'id', '');

    IF EXISTS (
      SELECT 1
        FROM jsonb_array_elements(v_canonical) AS selected
       WHERE (
         v_option_id IS NOT NULL
         AND selected->>'option_id' = v_option_id
       )
       OR (
         v_option_id IS NULL
         AND lower(selected->>'group') = lower(v_group->>'name')
         AND lower(selected->>'option') = lower(v_option->>'name')
       )
    ) THEN
      RAISE EXCEPTION 'Una opción está repetida';
    END IF;

    v_canonical := v_canonical || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'group_id', v_group_id,
        'option_id', v_option_id,
        'group', v_group->>'name',
        'option', v_option->>'name',
        'price', COALESCE((v_option->>'price')::integer, 0),
        'description', COALESCE(v_option->>'description', '')
      ))
    );
  END LOOP;

  FOR v_group IN
    SELECT value FROM jsonb_array_elements(COALESCE(v_menu_item.modifiers, '[]'::jsonb))
  LOOP
    SELECT count(*)::integer
      INTO v_group_count
      FROM jsonb_array_elements(v_canonical) AS selected
     WHERE (
       NULLIF(v_group->>'id', '') IS NOT NULL
       AND selected->>'group_id' = v_group->>'id'
     )
     OR (
       NULLIF(v_group->>'id', '') IS NULL
       AND lower(selected->>'group') = lower(v_group->>'name')
     );

    v_minimum := CASE
      WHEN COALESCE((v_group->>'required')::boolean, false)
        THEN GREATEST(1, COALESCE((v_group->>'min_selections')::integer, 1))
      ELSE COALESCE((v_group->>'min_selections')::integer, 0)
    END;
    v_maximum := CASE
      WHEN COALESCE(v_group->>'selection_mode', 'single') = 'single' THEN 1
      WHEN NULLIF(v_group->>'max_selections', '') IS NULL THEN 1000
      ELSE (v_group->>'max_selections')::integer
    END;

    IF v_group_count < v_minimum OR v_group_count > v_maximum THEN
      RAISE EXCEPTION 'Falta completar correctamente una variación requerida';
    END IF;
  END LOOP;

  SELECT COALESCE(sum((selected->>'price')::integer), 0)::integer
    INTO v_modifier_total
    FROM jsonb_array_elements(v_canonical) AS selected;

  v_unit_price := v_menu_item.price;

  RETURN QUERY SELECT
    v_menu_item.id,
    v_menu_item.business_id,
    v_quantity,
    v_unit_price,
    left(COALESCE(p_item->>'notes', ''), 500),
    v_canonical,
    ((v_unit_price + v_modifier_total)::bigint * v_quantity);
END;
$$;

-- Create one order per business in a table cart. All writes happen inside one
-- database transaction because PostgreSQL functions are transactional by
-- default. The returned object is intentionally small and easy for the POS
-- to consume when the shared menu selector is introduced.
CREATE OR REPLACE FUNCTION public.create_multibusiness_table_orders(
  p_creation_key uuid,
  p_table_id uuid,
  p_table_number text,
  p_items jsonb,
  p_notes text DEFAULT '',
  p_customer_name text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_batch public.order_batches%ROWTYPE;
  v_visit public.table_visits%ROWTYPE;
  v_account public.business_accounts%ROWTYPE;
  v_line record;
  v_business_id uuid;
  v_organization_id uuid;
  v_first_business_id uuid;
  v_table_exists boolean;
  v_order_id uuid;
  v_order_number integer;
  v_total bigint;
  v_account_sequence integer;
  v_orders jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;
  IF p_creation_key IS NULL THEN
    RAISE EXCEPTION 'Falta la clave de creación de la comanda';
  END IF;
  IF p_table_id IS NULL THEN
    RAISE EXCEPTION 'Selecciona una mesa antes de enviar la comanda';
  END IF;
  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'La comanda debe contener al menos un producto';
  END IF;

  -- A retry with the same key returns the committed result instead of
  -- duplicating orders after a slow tablet response.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_creation_key::text, 404));
  SELECT * INTO v_batch
    FROM public.order_batches AS batch
   WHERE batch.creation_key = p_creation_key
   FOR UPDATE;

  IF v_batch.id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(order_row) ORDER BY order_row.number), '[]'::jsonb)
      INTO v_orders
      FROM public.orders AS order_row
     WHERE order_row.order_batch_id = v_batch.id;
    RETURN jsonb_build_object(
      'batch_id', v_batch.id,
      'table_visit_id', v_batch.table_visit_id,
      'orders', v_orders
    );
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS multibusiness_order_lines (
    line_number bigint NOT NULL,
    menu_item_id uuid NOT NULL,
    business_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price integer NOT NULL,
    notes text NOT NULL,
    selected_modifiers jsonb NOT NULL,
    line_total bigint NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.multibusiness_order_lines;

  INSERT INTO pg_temp.multibusiness_order_lines (
    line_number,
    menu_item_id,
    business_id,
    quantity,
    unit_price,
    notes,
    selected_modifiers,
    line_total
  )
  SELECT
    input_line.ordinality,
    canonical.menu_item_id,
    canonical.business_id,
    canonical.quantity,
    canonical.unit_price,
    canonical.notes,
    canonical.selected_modifiers,
    canonical.line_total
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS input_line(value, ordinality)
  CROSS JOIN LATERAL private.multibusiness_canonicalize_order_item(input_line.value) AS canonical;

  SELECT business_id
    INTO v_first_business_id
    FROM pg_temp.multibusiness_order_lines
   ORDER BY line_number
   LIMIT 1;

  SELECT business.organization_id
    INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = v_first_business_id
     AND business.lifecycle_status NOT IN ('archived', 'retired');

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'El negocio del producto no está disponible';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_temp.multibusiness_order_lines AS line
      JOIN public.businesses AS business
        ON business.id = line.business_id
     WHERE business.organization_id IS DISTINCT FROM v_organization_id
        OR business.lifecycle_status IN ('archived', 'retired')
  ) THEN
    RAISE EXCEPTION 'Todos los productos deben pertenecer a negocios activos de la misma organización';
  END IF;

  FOR v_business_id IN
    SELECT DISTINCT line.business_id
      FROM pg_temp.multibusiness_order_lines AS line
  LOOP
    IF NOT (
      private.multibusiness_has_capability(
        'organization.operate_orders', v_organization_id, NULL
      )
      OR private.multibusiness_has_capability(
        'business.operate_orders', v_organization_id, v_business_id
      )
    ) THEN
      RAISE EXCEPTION 'No tienes permiso para operar uno de los negocios de la comanda';
    END IF;
  END LOOP;

  SELECT EXISTS (
    SELECT 1
      FROM public.restaurant_tables AS restaurant_table
     WHERE restaurant_table.id = p_table_id
       AND restaurant_table.is_active
  ) INTO v_table_exists;
  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'La mesa no está disponible';
  END IF;

  -- Serialize the open visit and account creation for the physical table.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_table_id::text, 405));
  SELECT * INTO v_visit
    FROM public.table_visits AS visit
   WHERE visit.table_id = p_table_id
     AND visit.status = 'open'
   FOR UPDATE;

  IF v_visit.id IS NULL THEN
    INSERT INTO public.table_visits (
      organization_id,
      table_id,
      opened_by
    ) VALUES (
      v_organization_id,
      p_table_id,
      v_user_id
    )
    RETURNING * INTO v_visit;
  ELSIF v_visit.organization_id IS DISTINCT FROM v_organization_id THEN
    RAISE EXCEPTION 'La visita de la mesa pertenece a otra organización';
  END IF;

  INSERT INTO public.order_batches (
    creation_key,
    organization_id,
    table_visit_id,
    order_type,
    table_id,
    table_number,
    customer_name,
    notes,
    created_by
  ) VALUES (
    p_creation_key,
    v_organization_id,
    v_visit.id,
    'comedor',
    p_table_id,
    NULLIF(btrim(COALESCE(p_table_number, '')), ''),
    NULLIF(btrim(COALESCE(p_customer_name, '')), ''),
    left(COALESCE(p_notes, ''), 1000),
    v_user_id
  )
  RETURNING * INTO v_batch;

  FOR v_business_id IN
    SELECT DISTINCT line.business_id
      FROM pg_temp.multibusiness_order_lines AS line
    ORDER BY line.business_id
  LOOP
    SELECT * INTO v_account
      FROM public.business_accounts AS account
     WHERE account.table_visit_id = v_visit.id
       AND account.business_id = v_business_id
       AND account.status IN ('open', 'partially_paid')
     ORDER BY account.account_sequence DESC
     LIMIT 1
     FOR UPDATE;

    IF v_account.id IS NULL THEN
      SELECT COALESCE(MAX(account.account_sequence), 0) + 1
        INTO v_account_sequence
        FROM public.business_accounts AS account
       WHERE account.table_visit_id = v_visit.id
         AND account.business_id = v_business_id;

      INSERT INTO public.business_accounts (
        table_visit_id,
        organization_id,
        business_id,
        account_sequence,
        created_by
      ) VALUES (
        v_visit.id,
        v_organization_id,
        v_business_id,
        v_account_sequence,
        v_user_id
      )
      RETURNING * INTO v_account;
    END IF;

    SELECT COALESCE(SUM(line.line_total), 0)::bigint
      INTO v_total
      FROM pg_temp.multibusiness_order_lines AS line
     WHERE line.business_id = v_business_id;

    IF v_total > 2147483647 THEN
      RAISE EXCEPTION 'El total de uno de los pedidos excede el límite permitido';
    END IF;

    INSERT INTO public.orders (
      creation_key,
      status,
      type,
      total,
      notes,
      table_number,
      table_id,
      customer_name,
      created_by,
      business_id,
      table_visit_id,
      business_account_id,
      order_batch_id
    ) VALUES (
      gen_random_uuid(),
      'pending',
      'comedor',
      v_total::integer,
      left(COALESCE(p_notes, ''), 1000),
      NULLIF(btrim(COALESCE(p_table_number, '')), ''),
      p_table_id,
      NULLIF(btrim(COALESCE(p_customer_name, '')), ''),
      v_user_id,
      v_business_id,
      v_visit.id,
      v_account.id,
      v_batch.id
    )
    RETURNING id, number INTO v_order_id, v_order_number;

    INSERT INTO public.order_items (
      order_id,
      menu_item_id,
      quantity,
      unit_price,
      notes,
      selected_modifiers
    )
    SELECT
      v_order_id,
      line.menu_item_id,
      line.quantity,
      line.unit_price,
      line.notes,
      line.selected_modifiers
    FROM pg_temp.multibusiness_order_lines AS line
    WHERE line.business_id = v_business_id
    ORDER BY line.line_number;

    INSERT INTO public.order_status_log (order_id, to_status, changed_by)
    VALUES (v_order_id, 'pending', v_user_id);
  END LOOP;

  SELECT COALESCE(jsonb_agg(to_jsonb(order_row) ORDER BY order_row.number), '[]'::jsonb)
    INTO v_orders
    FROM public.orders AS order_row
   WHERE order_row.order_batch_id = v_batch.id;

  RETURN jsonb_build_object(
    'batch_id', v_batch.id,
    'table_visit_id', v_visit.id,
    'orders', v_orders
  );
END;
$$;

ALTER TABLE public.order_batches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.order_batches
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.order_batches TO authenticated;

CREATE POLICY order_batches_viewed_by_organization_membership
  ON public.order_batches
  FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_organization(organization_id));

REVOKE ALL ON FUNCTION private.multibusiness_validate_order_batch()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_canonicalize_order_item(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_multibusiness_table_orders(
  uuid, uuid, text, jsonb, text, text
)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_multibusiness_table_orders(
  uuid, uuid, text, jsonb, text, text
)
  TO authenticated;
