BEGIN;

-- WhatsApp keeps its current isolated, Mideli-only customer tables. The
-- operational directory gets its own tenant-scoped records, seeded from the
-- existing Mideli directory without changing legacy orders or WhatsApp data.
CREATE TABLE public.business_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL
    REFERENCES public.businesses(id) ON DELETE RESTRICT,
  phone text NOT NULL CHECK (phone ~ '^[0-9]{8,15}$'),
  display_name text NOT NULL DEFAULT ''
    CHECK (char_length(display_name) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_customers_business_phone_key UNIQUE (business_id, phone)
);

CREATE INDEX business_customers_business_updated_idx
  ON public.business_customers (business_id, updated_at DESC);

CREATE TABLE public.business_customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL
    REFERENCES public.businesses(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL
    REFERENCES public.business_customers(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '' CHECK (char_length(label) <= 80),
  address_text text NOT NULL
    CHECK (char_length(btrim(address_text)) BETWEEN 8 AND 500),
  reference text NOT NULL DEFAULT '' CHECK (char_length(reference) <= 300),
  formatted_address text,
  colony text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  distance_meters integer CHECK (distance_meters IS NULL OR distance_meters >= 0),
  delivery_fee integer CHECK (delivery_fee IS NULL OR delivery_fee >= 0),
  geocoded_at timestamptz,
  confirmed_at timestamptz,
  confirmation_method text CHECK (
    confirmation_method IS NULL
    OR confirmation_method IN ('text_confirmation', 'shared_location')
  ),
  is_default boolean NOT NULL DEFAULT false,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE INDEX business_customer_addresses_lookup_idx
  ON public.business_customer_addresses
  (business_id, customer_id, is_default DESC, last_used_at DESC);
CREATE UNIQUE INDEX business_customer_addresses_normalized_unique
  ON public.business_customer_addresses
  (business_id, customer_id, lower(btrim(address_text)));
CREATE UNIQUE INDEX business_customer_addresses_one_default_idx
  ON public.business_customer_addresses (business_id, customer_id)
  WHERE is_default;

ALTER TABLE public.orders
  ADD COLUMN business_customer_id uuid
    REFERENCES public.business_customers(id) ON DELETE SET NULL;

CREATE INDEX orders_business_customer_history_idx
  ON public.orders (business_id, business_customer_id, created_at DESC)
  WHERE business_customer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.enforce_business_customer_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.business_customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.business_customers AS customer
     WHERE customer.id = NEW.business_customer_id
       AND customer.business_id = NEW.business_id
  ) THEN
    RAISE EXCEPTION 'El cliente no pertenece al negocio del pedido';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_business_customer_scope()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_business_customer_guard ON public.orders;
CREATE TRIGGER orders_business_customer_guard
  BEFORE INSERT OR UPDATE OF business_id, business_customer_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.enforce_business_customer_scope();

CREATE OR REPLACE FUNCTION private.enforce_business_customer_address_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.business_customers AS customer
     WHERE customer.id = NEW.customer_id
       AND customer.business_id = NEW.business_id
  ) THEN
    RAISE EXCEPTION 'El domicilio no pertenece al negocio del cliente';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_business_customer_address_scope()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER business_customer_addresses_scope_guard
  BEFORE INSERT OR UPDATE OF business_id, customer_id
  ON public.business_customer_addresses
  FOR EACH ROW EXECUTE FUNCTION private.enforce_business_customer_address_scope();

-- Every domicile order with a saved customer adds or refreshes that customer's
-- address in the same database transaction. This powers POS address reuse.
CREATE OR REPLACE FUNCTION private.sync_business_customer_delivery_address()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_default boolean;
BEGIN
  IF NEW.business_customer_id IS NULL
     OR NEW.type <> 'domicilio'
     OR char_length(btrim(COALESCE(NEW.delivery_address, ''))) < 8 THEN
    RETURN NEW;
  END IF;

  SELECT NOT EXISTS (
    SELECT 1
      FROM public.business_customer_addresses AS address
     WHERE address.business_id = NEW.business_id
       AND address.customer_id = NEW.business_customer_id
       AND address.is_default
  ) INTO v_is_default;

  INSERT INTO public.business_customer_addresses (
    business_id, customer_id, label, address_text, reference,
    formatted_address, colony, latitude, longitude, distance_meters,
    delivery_fee, geocoded_at, is_default, last_used_at, updated_at
  ) VALUES (
    NEW.business_id,
    NEW.business_customer_id,
    'Casa',
    btrim(NEW.delivery_address),
    COALESCE(NEW.delivery_reference, ''),
    btrim(NEW.delivery_address),
    NEW.delivery_colony,
    NEW.delivery_latitude,
    NEW.delivery_longitude,
    NEW.delivery_distance_meters,
    NEW.delivery_fee,
    CASE WHEN NEW.delivery_latitude IS NOT NULL THEN now() ELSE NULL END,
    v_is_default,
    now(),
    now()
  )
  ON CONFLICT DO NOTHING;

  UPDATE public.business_customer_addresses AS address
     SET reference = COALESCE(NULLIF(btrim(NEW.delivery_reference), ''), address.reference),
         formatted_address = btrim(NEW.delivery_address),
         colony = COALESCE(NEW.delivery_colony, address.colony),
         latitude = COALESCE(NEW.delivery_latitude, address.latitude),
         longitude = COALESCE(NEW.delivery_longitude, address.longitude),
         distance_meters = COALESCE(NEW.delivery_distance_meters, address.distance_meters),
         delivery_fee = COALESCE(NEW.delivery_fee, address.delivery_fee),
         geocoded_at = CASE
           WHEN NEW.delivery_latitude IS NOT NULL THEN now()
           ELSE address.geocoded_at
         END,
         last_used_at = now(),
         updated_at = now()
   WHERE address.business_id = NEW.business_id
     AND address.customer_id = NEW.business_customer_id
     AND lower(btrim(address.address_text)) = lower(btrim(NEW.delivery_address));

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_business_customer_delivery_address()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER orders_sync_business_customer_address
  AFTER INSERT OR UPDATE OF business_customer_id, type, delivery_address,
    delivery_reference, delivery_colony, delivery_latitude, delivery_longitude,
    delivery_distance_meters, delivery_fee
  ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.sync_business_customer_delivery_address();

-- The current atomic POS RPC accepts optional customer details as JSON. Add
-- the new tenant-scoped key while preserving its validation and transaction.
DO $$
DECLARE
  v_function_definition text;
  v_original text := $original$
     SET customer_id = NULLIF(p_details->>'customer_id', '')::uuid,$original$;
  v_replacement text := $replacement$
     SET customer_id = NULLIF(p_details->>'customer_id', '')::uuid,
         business_customer_id = NULLIF(p_details->>'business_customer_id', '')::uuid,$replacement$;
BEGIN
  SELECT pg_get_functiondef(
    'public.create_business_order_with_details(uuid,uuid,jsonb,text,text,text,uuid,text,jsonb)'::regprocedure
  )
    INTO v_function_definition;

  IF v_function_definition IS NULL
     OR strpos(v_function_definition, v_original) = 0 THEN
    RAISE EXCEPTION 'La función de pedido atómico cambió; revisa su adaptación al directorio por negocio';
  END IF;

  EXECUTE replace(v_function_definition, v_original, v_replacement);
END;
$$;

-- Mixed table orders produce one order per business. This wrapper attaches a
-- separate customer record to each order inside the same transaction, while
-- retaining the existing RPC for older clients.
CREATE OR REPLACE FUNCTION public.create_multibusiness_table_orders_with_customers(
  p_creation_key uuid,
  p_table_id uuid,
  p_table_number text,
  p_items jsonb,
  p_notes text DEFAULT '',
  p_customer_name text DEFAULT '',
  p_customer_phone text DEFAULT NULL,
  p_business_customer_ids jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing_batch boolean;
  v_result jsonb;
  v_order jsonb;
  v_entry record;
  v_business_id uuid;
  v_order_id uuid;
  v_customer_id uuid;
  v_current_customer_id uuid;
  v_current_phone text;
  v_phone text := NULLIF(btrim(p_customer_phone), '');
  v_updated_orders jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;
  IF p_creation_key IS NULL THEN
    RAISE EXCEPTION 'Falta la clave de creación de la comanda';
  END IF;
  IF jsonb_typeof(COALESCE(p_business_customer_ids, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Los clientes por negocio no son válidos';
  END IF;
  IF v_phone IS NOT NULL AND v_phone !~ '^[0-9]{8,15}$' THEN
    RAISE EXCEPTION 'El teléfono del cliente no es válido';
  END IF;

  -- Serialize retries with the same key before detecting an existing batch.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_creation_key::text, 404));
  SELECT EXISTS (
    SELECT 1
      FROM public.order_batches AS batch
     WHERE batch.creation_key = p_creation_key
  ) INTO v_existing_batch;

  v_result := public.create_multibusiness_table_orders(
    p_creation_key,
    p_table_id,
    p_table_number,
    p_items,
    p_notes,
    p_customer_name
  );

  FOR v_entry IN
    SELECT key, value
      FROM jsonb_each_text(COALESCE(p_business_customer_ids, '{}'::jsonb))
  LOOP
    v_business_id := v_entry.key::uuid;
    v_customer_id := NULLIF(v_entry.value, '')::uuid;
    IF v_customer_id IS NULL OR NOT EXISTS (
      SELECT 1
        FROM jsonb_array_elements(COALESCE(v_result->'orders', '[]'::jsonb)) AS batch_order(value)
       WHERE (batch_order.value->>'business_id')::uuid = v_business_id
    ) THEN
      RAISE EXCEPTION 'El cliente no corresponde a un negocio de esta comanda';
    END IF;
  END LOOP;

  FOR v_order IN
    SELECT value
      FROM jsonb_array_elements(COALESCE(v_result->'orders', '[]'::jsonb)) AS batch_order(value)
  LOOP
    v_business_id := (v_order->>'business_id')::uuid;
    v_order_id := (v_order->>'id')::uuid;
    v_customer_id := NULLIF(
      COALESCE(p_business_customer_ids, '{}'::jsonb)->>v_business_id::text,
      ''
    )::uuid;
    v_current_customer_id := NULLIF(v_order->>'business_customer_id', '')::uuid;
    v_current_phone := NULLIF(v_order->>'customer_phone', '');

    IF v_existing_batch AND (
      (v_customer_id IS NOT NULL AND v_current_customer_id IS NOT NULL
        AND v_current_customer_id IS DISTINCT FROM v_customer_id)
      OR (v_phone IS NOT NULL AND v_current_phone IS NOT NULL
        AND v_current_phone IS DISTINCT FROM v_phone)
    ) THEN
      RAISE EXCEPTION 'El intento ya corresponde a otro cliente';
    END IF;

    IF (v_customer_id IS NOT NULL AND v_current_customer_id IS NULL)
       OR (v_phone IS NOT NULL AND v_current_phone IS NULL) THEN
      UPDATE public.orders AS order_row
         SET business_customer_id = COALESCE(v_customer_id, order_row.business_customer_id),
             customer_phone = COALESCE(v_phone, order_row.customer_phone),
             updated_at = now()
       WHERE order_row.id = v_order_id
         AND order_row.business_id = v_business_id
         AND (v_customer_id IS NULL
              OR order_row.business_customer_id IS NULL
              OR order_row.business_customer_id = v_customer_id)
         AND (v_phone IS NULL
              OR order_row.customer_phone IS NULL
              OR order_row.customer_phone = v_phone);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'No se pudieron vincular los datos del cliente al pedido';
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(order_row) ORDER BY order_row.number),
    '[]'::jsonb
  )
    INTO v_updated_orders
    FROM public.orders AS order_row
   WHERE order_row.order_batch_id = NULLIF(v_result->>'batch_id', '')::uuid;

  RETURN jsonb_set(v_result, '{orders}', v_updated_orders, true);
END;
$$;

REVOKE ALL ON FUNCTION public.create_multibusiness_table_orders_with_customers(
  uuid, uuid, text, jsonb, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_multibusiness_table_orders_with_customers(
  uuid, uuid, text, jsonb, text, text, text, jsonb
) TO authenticated;

ALTER TABLE public.business_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_customer_addresses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_customers, public.business_customer_addresses
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.business_customers,
  public.business_customer_addresses TO service_role;

-- Per-business receipt details. Authorized server actions mediate all access.
CREATE TABLE public.business_receipt_settings (
  business_id uuid PRIMARY KEY
    REFERENCES public.businesses(id) ON DELETE CASCADE,
  receipt_name text NOT NULL DEFAULT ''
    CHECK (char_length(receipt_name) <= 100),
  receipt_address text NOT NULL DEFAULT ''
    CHECK (char_length(receipt_address) <= 300),
  receipt_phone text NOT NULL DEFAULT ''
    CHECK (char_length(receipt_phone) <= 40),
  receipt_footer text NOT NULL DEFAULT ''
    CHECK (char_length(receipt_footer) <= 240),
  paper_width_mm integer NOT NULL DEFAULT 48
    CHECK (paper_width_mm IN (48, 58)),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_receipt_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_receipt_settings
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.business_receipt_settings
  TO service_role;

COMMIT;
