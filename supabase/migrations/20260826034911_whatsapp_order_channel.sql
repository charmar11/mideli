-- Canal de pedidos por WhatsApp.
-- Las tablas permanecen cerradas para clientes y solo el servidor puede operarlas.

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE CHECK (phone ~ '^[0-9]{8,15}$'),
  display_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  address_text text NOT NULL CHECK (char_length(btrim(address_text)) >= 8),
  reference text NOT NULL DEFAULT '',
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_default boolean NOT NULL DEFAULT false,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE UNIQUE INDEX customer_addresses_normalized_unique
  ON public.customer_addresses(customer_id, lower(btrim(address_text)));

CREATE UNIQUE INDEX customer_addresses_one_default_idx
  ON public.customer_addresses(customer_id)
  WHERE is_default;

CREATE TABLE public.channel_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'meta' CHECK (provider IN ('meta')),
  external_contact_id text NOT NULL CHECK (external_contact_id ~ '^[0-9]{8,15}$'),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'handoff', 'confirmed', 'cancelled', 'closed')),
  stage text NOT NULL DEFAULT 'ordering'
    CHECK (stage IN (
      'ordering',
      'awaiting_modifiers',
      'awaiting_fulfillment',
      'awaiting_address',
      'awaiting_payment',
      'awaiting_confirmation',
      'handoff',
      'confirmed',
      'cancelled'
    )),
  state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(state) = 'object'),
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX channel_conversations_one_open_idx
  ON public.channel_conversations(provider, external_contact_id)
  WHERE status IN ('active', 'handoff');

CREATE INDEX channel_conversations_status_activity_idx
  ON public.channel_conversations(status, updated_at DESC);

CREATE INDEX channel_conversations_customer_idx
  ON public.channel_conversations(customer_id, created_at DESC);

CREATE INDEX channel_conversations_assigned_idx
  ON public.channel_conversations(assigned_to, updated_at DESC)
  WHERE assigned_to IS NOT NULL;

CREATE TABLE public.channel_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.channel_conversations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'meta' CHECK (provider IN ('meta')),
  external_message_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type text NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'location', 'unsupported', 'system')),
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'sent', 'delivered', 'read', 'failed', 'ignored')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_message_id)
);

CREATE INDEX channel_messages_conversation_created_idx
  ON public.channel_messages(conversation_id, created_at DESC);

ALTER TABLE public.orders
  ADD COLUMN source_channel text NOT NULL DEFAULT 'pos'
    CHECK (source_channel IN ('pos', 'whatsapp')),
  ADD COLUMN channel_conversation_id uuid
    REFERENCES public.channel_conversations(id) ON DELETE SET NULL,
  ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN customer_phone text,
  ADD COLUMN delivery_address text,
  ADD COLUMN delivery_reference text,
  ADD COLUMN delivery_fee integer NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  ADD COLUMN external_order_id text,
  ADD COLUMN payment_method_requested public.payment_method,
  ADD COLUMN requested_cash_tendered integer CHECK (requested_cash_tendered >= 0);

CREATE UNIQUE INDEX orders_source_external_order_unique
  ON public.orders(source_channel, external_order_id)
  WHERE external_order_id IS NOT NULL;

CREATE INDEX orders_channel_conversation_idx
  ON public.orders(channel_conversation_id, created_at DESC)
  WHERE channel_conversation_id IS NOT NULL;

CREATE INDEX orders_customer_phone_idx
  ON public.orders(customer_phone, created_at DESC)
  WHERE customer_phone IS NOT NULL;

CREATE INDEX orders_customer_idx
  ON public.orders(customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.customers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.customer_addresses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.channel_conversations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.channel_messages FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_addresses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.channel_conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.channel_messages TO service_role;

CREATE OR REPLACE FUNCTION private.set_whatsapp_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION private.set_whatsapp_updated_at();

CREATE TRIGGER set_customer_addresses_updated_at
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION private.set_whatsapp_updated_at();

CREATE TRIGGER set_channel_conversations_updated_at
  BEFORE UPDATE ON public.channel_conversations
  FOR EACH ROW EXECUTE FUNCTION private.set_whatsapp_updated_at();

REVOKE ALL ON FUNCTION private.set_whatsapp_updated_at() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.request_jwt_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_legacy_role text := nullif(current_setting('request.jwt.claim.role', true), '');
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
BEGIN
  IF v_legacy_role IS NOT NULL THEN
    RETURN v_legacy_role;
  END IF;
  IF v_claims IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (v_claims::jsonb)->>'role';
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.request_jwt_role() FROM PUBLIC, anon, authenticated;

-- Conserva la protección del turno actual y permite pedidos externos solo cuando
-- la solicitud usa la credencial privada del servidor.
CREATE OR REPLACE FUNCTION private.assign_order_cash_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := private.active_profile_role();
  v_is_service_request boolean := private.request_jwt_role() = 'service_role';
  v_zone_id uuid;
  v_zone_name text;
  v_table_name text;
BEGIN
  IF v_role NOT IN ('owner', 'admin', 'waiter', 'supervisor')
     AND NOT v_is_service_request THEN
    RAISE EXCEPTION 'No tienes permiso para operar pedidos';
  END IF;

  IF NEW.source_channel = 'whatsapp' AND NOT v_is_service_request THEN
    RAISE EXCEPTION 'El origen WhatsApp solo puede asignarlo el servidor';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT shift.id INTO NEW.cash_shift_id
    FROM public.cash_shifts AS shift
    WHERE shift.status = 'open'
    LIMIT 1
    FOR SHARE;

    IF NEW.cash_shift_id IS NULL THEN
      RAISE EXCEPTION 'Abre un turno de caja antes de crear pedidos';
    END IF;
  ELSIF NEW.cash_shift_id IS DISTINCT FROM OLD.cash_shift_id THEN
    RAISE EXCEPTION 'El turno original del pedido no se puede cambiar';
  END IF;

  IF NEW.table_id IS NOT NULL THEN
    SELECT restaurant_table.zone_id, zone.name, restaurant_table.name
    INTO v_zone_id, v_zone_name, v_table_name
    FROM public.restaurant_tables AS restaurant_table
    LEFT JOIN public.table_zones AS zone ON zone.id = restaurant_table.zone_id
    WHERE restaurant_table.id = NEW.table_id;

    NEW.table_zone_id := v_zone_id;
    NEW.table_zone_name := v_zone_name;
    NEW.table_number := COALESCE(NULLIF(btrim(NEW.table_number), ''), v_table_name);
  ELSE
    NEW.table_zone_id := NULL;
    NEW.table_zone_name := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_external_order_from_channel(
  p_external_order_id text,
  p_conversation_id uuid,
  p_items jsonb,
  p_order_type text,
  p_customer_phone text,
  p_customer_name text DEFAULT '',
  p_delivery_address text DEFAULT '',
  p_delivery_reference text DEFAULT '',
  p_notes text DEFAULT '',
  p_delivery_fee integer DEFAULT 0,
  p_payment_method text DEFAULT NULL,
  p_cash_tendered integer DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_order public.orders%ROWTYPE;
  v_created_order public.orders%ROWTYPE;
  v_customer_id uuid;
  v_conversation public.channel_conversations%ROWTYPE;
  v_item jsonb;
  v_menu_item public.menu_items%ROWTYPE;
  v_menu_item_id uuid;
  v_quantity integer;
  v_selected jsonb;
  v_submitted jsonb;
  v_group jsonb;
  v_option jsonb;
  v_group_id text;
  v_option_id text;
  v_group_count integer;
  v_minimum integer;
  v_maximum integer;
  v_canonical_selected jsonb;
  v_canonical_items jsonb := '[]'::jsonb;
  v_unit_price integer;
  v_total bigint := 0;
BEGIN
  IF private.request_jwt_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Esta operación solo está disponible para el servidor';
  END IF;

  IF NULLIF(btrim(COALESCE(p_external_order_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Falta el identificador externo del pedido';
  END IF;
  p_external_order_id := btrim(p_external_order_id);
  p_delivery_fee := COALESCE(p_delivery_fee, 0);

  SELECT * INTO v_existing_order
  FROM public.orders
  WHERE source_channel = 'whatsapp'
    AND external_order_id = p_external_order_id;

  IF v_existing_order.id IS NOT NULL THEN
    RETURN v_existing_order;
  END IF;

  SELECT * INTO v_conversation
  FROM public.channel_conversations
  WHERE id = p_conversation_id
    AND provider = 'meta'
  FOR UPDATE;

  IF v_conversation.id IS NULL THEN
    RAISE EXCEPTION 'La conversación no existe';
  END IF;

  IF p_customer_phone !~ '^[0-9]{8,15}$'
     OR p_customer_phone IS DISTINCT FROM v_conversation.external_contact_id THEN
    RAISE EXCEPTION 'El teléfono del pedido no coincide con la conversación';
  END IF;

  IF p_order_type IS NULL OR p_order_type NOT IN ('domicilio', 'para_llevar') THEN
    RAISE EXCEPTION 'Tipo de pedido externo no válido';
  END IF;

  IF p_order_type = 'domicilio'
     AND char_length(btrim(COALESCE(p_delivery_address, ''))) < 8 THEN
    RAISE EXCEPTION 'Falta una dirección de entrega válida';
  END IF;

  IF p_delivery_fee < 0 THEN
    RAISE EXCEPTION 'Costo de envío no válido';
  END IF;

  IF p_payment_method IS NOT NULL
     AND p_payment_method NOT IN ('efectivo', 'tarjeta', 'transferencia') THEN
    RAISE EXCEPTION 'Método de pago solicitado no válido';
  END IF;

  IF p_cash_tendered IS NOT NULL AND p_cash_tendered < 0 THEN
    RAISE EXCEPTION 'Cantidad de efectivo no válida';
  END IF;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'El pedido debe contener al menos un producto';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_menu_item_id := (v_item->>'menu_item_id')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Un producto contiene datos no válidos';
    END;

    IF v_quantity < 1 OR v_quantity > 99 THEN
      RAISE EXCEPTION 'Cantidad de producto no válida';
    END IF;

    SELECT menu_item.* INTO v_menu_item
    FROM public.menu_items AS menu_item
    LEFT JOIN public.categories AS category ON category.id = menu_item.category_id
    WHERE menu_item.id = v_menu_item_id
      AND menu_item.is_active
      AND (menu_item.category_id IS NULL OR category.is_active);

    IF v_menu_item.id IS NULL THEN
      RAISE EXCEPTION 'Uno de los productos ya no está disponible';
    END IF;

    v_selected := COALESCE(v_item->'selected_modifiers', '[]'::jsonb);
    IF jsonb_typeof(v_selected) <> 'array' THEN
      RAISE EXCEPTION 'Las variaciones del producto no son válidas';
    END IF;

    v_canonical_selected := '[]'::jsonb;
    FOR v_submitted IN SELECT value FROM jsonb_array_elements(v_selected)
    LOOP
      v_group := NULL;
      SELECT candidate INTO v_group
      FROM jsonb_array_elements(COALESCE(v_menu_item.modifiers, '[]'::jsonb)) AS candidate
      WHERE candidate->>'id' = v_submitted->>'group_id'
         OR lower(candidate->>'name') = lower(v_submitted->>'group')
      LIMIT 1;

      IF v_group IS NULL THEN
        RAISE EXCEPTION 'Una variación no pertenece al producto';
      END IF;

      v_option := NULL;
      SELECT candidate INTO v_option
      FROM jsonb_array_elements(COALESCE(v_group->'options', '[]'::jsonb)) AS candidate
      WHERE candidate->>'id' = v_submitted->>'option_id'
         OR lower(candidate->>'name') = lower(v_submitted->>'option')
      LIMIT 1;

      IF v_option IS NULL THEN
        RAISE EXCEPTION 'Una opción no pertenece al producto';
      END IF;

      v_group_id := v_group->>'id';
      v_option_id := v_option->>'id';
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_canonical_selected) AS selected
        WHERE selected->>'option_id' = v_option_id
      ) THEN
        RAISE EXCEPTION 'Una opción está repetida';
      END IF;

      v_canonical_selected := v_canonical_selected || jsonb_build_array(
        jsonb_build_object(
          'group_id', v_group_id,
          'option_id', v_option_id,
          'group', v_group->>'name',
          'option', v_option->>'name',
          'price', COALESCE((v_option->>'price')::integer, 0),
          'description', COALESCE(v_option->>'description', '')
        )
      );
    END LOOP;

    FOR v_group IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_menu_item.modifiers, '[]'::jsonb))
    LOOP
      v_group_id := v_group->>'id';
      SELECT count(*)::integer INTO v_group_count
      FROM jsonb_array_elements(v_canonical_selected) AS selected
      WHERE selected->>'group_id' = v_group_id;

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
    INTO v_unit_price
    FROM jsonb_array_elements(v_canonical_selected) AS selected;
    v_unit_price := v_menu_item.price + v_unit_price;
    v_total := v_total + (v_unit_price::bigint * v_quantity);

    v_canonical_items := v_canonical_items || jsonb_build_array(
      jsonb_build_object(
        'menu_item_id', v_menu_item.id,
        'quantity', v_quantity,
        'unit_price', v_unit_price,
        'notes', left(COALESCE(v_item->>'notes', ''), 500),
        'selected_modifiers', v_canonical_selected
      )
    );
  END LOOP;

  v_total := v_total + p_delivery_fee;
  IF v_total > 2147483647 THEN
    RAISE EXCEPTION 'El total del pedido excede el límite permitido';
  END IF;

  INSERT INTO public.customers (phone, display_name)
  VALUES (p_customer_phone, btrim(COALESCE(p_customer_name, '')))
  ON CONFLICT (phone) DO UPDATE
  SET display_name = CASE
    WHEN NULLIF(EXCLUDED.display_name, '') IS NOT NULL THEN EXCLUDED.display_name
    ELSE public.customers.display_name
  END
  RETURNING id INTO v_customer_id;

  IF p_order_type = 'domicilio' THEN
    INSERT INTO public.customer_addresses (
      customer_id,
      address_text,
      reference,
      last_used_at
    ) VALUES (
      v_customer_id,
      btrim(p_delivery_address),
      btrim(COALESCE(p_delivery_reference, '')),
      now()
    )
    ON CONFLICT DO NOTHING;

    UPDATE public.customer_addresses
    SET reference = CASE
          WHEN NULLIF(btrim(COALESCE(p_delivery_reference, '')), '') IS NOT NULL
            THEN btrim(p_delivery_reference)
          ELSE reference
        END,
        last_used_at = now()
    WHERE customer_id = v_customer_id
      AND lower(btrim(address_text)) = lower(btrim(p_delivery_address));
  END IF;

  INSERT INTO public.orders (
    creation_key,
    status,
    type,
    total,
    notes,
    customer_name,
    created_by,
    source_channel,
    channel_conversation_id,
    customer_id,
    customer_phone,
    delivery_address,
    delivery_reference,
    delivery_fee,
    external_order_id,
    payment_method_requested,
    requested_cash_tendered
  ) VALUES (
    gen_random_uuid(),
    'pending',
    p_order_type::public.order_type,
    v_total::integer,
    left(COALESCE(p_notes, ''), 1000),
    NULLIF(btrim(COALESCE(p_customer_name, '')), ''),
    NULL,
    'whatsapp',
    p_conversation_id,
    v_customer_id,
    p_customer_phone,
    NULLIF(btrim(COALESCE(p_delivery_address, '')), ''),
    NULLIF(btrim(COALESCE(p_delivery_reference, '')), ''),
    p_delivery_fee,
    p_external_order_id,
    CASE WHEN p_payment_method IS NULL THEN NULL ELSE p_payment_method::public.payment_method END,
    p_cash_tendered
  )
  RETURNING * INTO v_created_order;

  INSERT INTO public.order_items (
    order_id,
    menu_item_id,
    quantity,
    unit_price,
    notes,
    selected_modifiers
  )
  SELECT
    v_created_order.id,
    (item->>'menu_item_id')::uuid,
    (item->>'quantity')::integer,
    (item->>'unit_price')::integer,
    item->>'notes',
    item->'selected_modifiers'
  FROM jsonb_array_elements(v_canonical_items) AS item;

  UPDATE public.channel_conversations
  SET status = 'confirmed',
      stage = 'confirmed'
  WHERE id = p_conversation_id;

  RETURN v_created_order;
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_existing_order
  FROM public.orders
  WHERE source_channel = 'whatsapp'
    AND external_order_id = p_external_order_id;
  IF v_existing_order.id IS NOT NULL THEN
    RETURN v_existing_order;
  END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_external_order_from_channel(
  text, uuid, jsonb, text, text, text, text, text, text, integer, text, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_external_order_from_channel(
  text, uuid, jsonb, text, text, text, text, text, text, integer, text, integer
) TO service_role;
