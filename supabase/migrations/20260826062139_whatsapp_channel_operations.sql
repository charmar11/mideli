-- Operación configurable del canal de pedidos por WhatsApp.
-- Esta migración amplía el piloto sin abrir datos conversacionales al cliente.

ALTER TABLE public.menu_items
  ADD COLUMN whatsapp_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.customer_addresses
  ADD COLUMN formatted_address text,
  ADD COLUMN colony text,
  ADD COLUMN distance_meters integer CHECK (distance_meters IS NULL OR distance_meters >= 0),
  ADD COLUMN delivery_fee integer CHECK (delivery_fee IS NULL OR delivery_fee >= 0),
  ADD COLUMN geocoded_at timestamptz;

ALTER TABLE public.channel_conversations
  ADD COLUMN bot_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN assigned_at timestamptz,
  ADD COLUMN handoff_reason text,
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN content_redacted_at timestamptz;

ALTER TABLE public.channel_conversations
  DROP CONSTRAINT channel_conversations_stage_check,
  ADD CONSTRAINT channel_conversations_stage_check CHECK (stage IN (
    'ordering',
    'browsing_catalog',
    'awaiting_modifiers',
    'awaiting_beverage',
    'awaiting_fulfillment',
    'awaiting_address',
    'awaiting_address_reference',
    'awaiting_delivery_quote',
    'awaiting_payment',
    'awaiting_cash_tendered',
    'awaiting_confirmation',
    'handoff',
    'confirmed',
    'cancelled'
  ));

ALTER TABLE public.channel_messages
  ADD COLUMN redacted_at timestamptz;

DROP INDEX public.channel_conversations_one_open_idx;
CREATE UNIQUE INDEX channel_conversations_one_open_idx
  ON public.channel_conversations(provider, external_contact_id)
  WHERE status IN ('active', 'handoff', 'confirmed');

ALTER TABLE public.orders
  ADD COLUMN delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'searching_driver', 'driver_on_way', 'customer_received'));

CREATE TABLE public.whatsapp_channel_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  receive_enabled boolean NOT NULL DEFAULT true,
  auto_reply_enabled boolean NOT NULL DEFAULT true,
  create_orders_enabled boolean NOT NULL DEFAULT false,
  delivery_quotes_enabled boolean NOT NULL DEFAULT false,
  status_notifications_enabled boolean NOT NULL DEFAULT true,
  human_handoff_enabled boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'America/Hermosillo',
  catalog_page_size smallint NOT NULL DEFAULT 5 CHECK (catalog_page_size BETWEEN 1 AND 5),
  message_retention_days smallint NOT NULL DEFAULT 90 CHECK (message_retention_days BETWEEN 7 AND 365),
  store_address text NOT NULL DEFAULT '',
  store_latitude numeric(9,6),
  store_longitude numeric(9,6),
  closed_message text NOT NULL DEFAULT 'Por el momento estamos fuera de horario. Abrimos de nuevo en nuestro siguiente horario disponible.',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((store_latitude IS NULL) = (store_longitude IS NULL)),
  CHECK (store_latitude IS NULL OR store_latitude BETWEEN -90 AND 90),
  CHECK (store_longitude IS NULL OR store_longitude BETWEEN -180 AND 180)
);

INSERT INTO public.whatsapp_channel_settings (id) VALUES (1);

CREATE TABLE public.whatsapp_business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week smallint NOT NULL UNIQUE CHECK (day_of_week BETWEEN 0 AND 6),
  is_open boolean NOT NULL DEFAULT true,
  opens_at time NOT NULL DEFAULT '12:00',
  closes_at time NOT NULL DEFAULT '23:00',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (opens_at <> closes_at)
);

INSERT INTO public.whatsapp_business_hours (day_of_week)
SELECT day FROM generate_series(0, 6) AS day;

CREATE TABLE public.whatsapp_schedule_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_date date NOT NULL UNIQUE,
  is_open boolean NOT NULL DEFAULT false,
  opens_at time,
  closes_at time,
  note text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (NOT is_open AND opens_at IS NULL AND closes_at IS NULL)
    OR (is_open AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at <> closes_at)
  )
);

CREATE TABLE public.whatsapp_delivery_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  min_distance_km numeric(5,2) NOT NULL CHECK (min_distance_km >= 0),
  max_distance_km numeric(5,2) NOT NULL CHECK (max_distance_km > min_distance_km),
  fee integer NOT NULL CHECK (fee >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (min_distance_km, max_distance_km)
);

INSERT INTO public.whatsapp_delivery_rates (min_distance_km, max_distance_km, fee, sort_order) VALUES
  (0.00, 4.00, 30, 1),
  (4.00, 5.00, 35, 2),
  (5.00, 6.00, 40, 3),
  (6.00, 7.00, 45, 4),
  (7.00, 8.00, 50, 5),
  (8.00, 9.00, 55, 6),
  (9.00, 9.90, 60, 7),
  (9.90, 10.00, 65, 8),
  (10.00, 11.00, 70, 9),
  (11.00, 12.00, 75, 10),
  (12.00, 13.00, 80, 11),
  (13.00, 14.00, 85, 12),
  (14.00, 15.00, 90, 13);

CREATE TABLE public.whatsapp_delivery_surcharges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colony_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  fee integer NOT NULL CHECK (fee >= 0),
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX whatsapp_delivery_surcharges_name_unique
  ON public.whatsapp_delivery_surcharges(lower(btrim(colony_name)));

INSERT INTO public.whatsapp_delivery_surcharges (colony_name, aliases, fee) VALUES
  ('Beltrones', ARRAY['Beltrones'], 10),
  ('Pioneros', ARRAY['Pioneros de Cajeme'], 10),
  ('Lomas', ARRAY['Las Lomas', 'Lomas de Ciudad Obregón'], 10),
  ('Providencia', ARRAY['Providencia'], 10),
  ('UNISON', ARRAY['Universidad de Sonora', 'Unison'], 10),
  ('Esperanza', ARRAY['Esperanza'], 15),
  ('Santa Catalina', ARRAY['Santa Catalina'], 15),
  ('Villa Bonita', ARRAY['Villa Bonita'], 15);

CREATE TABLE public.whatsapp_delivery_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.channel_conversations(id) ON DELETE CASCADE,
  customer_address_id uuid REFERENCES public.customer_addresses(id) ON DELETE SET NULL,
  input_address text NOT NULL DEFAULT '',
  formatted_address text NOT NULL DEFAULT '',
  colony text NOT NULL DEFAULT '',
  latitude numeric(9,6),
  longitude numeric(9,6),
  distance_meters integer CHECK (distance_meters IS NULL OR distance_meters >= 0),
  base_fee integer NOT NULL DEFAULT 0 CHECK (base_fee >= 0),
  surcharge integer NOT NULL DEFAULT 0 CHECK (surcharge >= 0),
  total_fee integer NOT NULL DEFAULT 0 CHECK (total_fee >= 0),
  status text NOT NULL CHECK (status IN ('quoted', 'needs_handoff', 'failed')),
  failure_reason text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE INDEX whatsapp_delivery_quotes_conversation_idx
  ON public.whatsapp_delivery_quotes(conversation_id, created_at DESC);

CREATE TABLE public.whatsapp_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.channel_conversations(id) ON DELETE CASCADE,
  event_key text NOT NULL CHECK (event_key IN ('received', 'in_preparation', 'ready_searching_driver', 'driver_on_way')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  external_message_id text,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text NOT NULL DEFAULT '',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, event_key)
);

CREATE TABLE public.whatsapp_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX whatsapp_admin_audit_created_idx
  ON public.whatsapp_admin_audit(created_at DESC);

ALTER TABLE public.whatsapp_channel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_schedule_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_delivery_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_delivery_surcharges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_delivery_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_admin_audit ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_whatsapp_channel_settings_updated_at
  BEFORE UPDATE ON public.whatsapp_channel_settings
  FOR EACH ROW EXECUTE FUNCTION private.set_whatsapp_updated_at();

CREATE TRIGGER set_whatsapp_business_hours_updated_at
  BEFORE UPDATE ON public.whatsapp_business_hours
  FOR EACH ROW EXECUTE FUNCTION private.set_whatsapp_updated_at();

CREATE TRIGGER set_whatsapp_schedule_exceptions_updated_at
  BEFORE UPDATE ON public.whatsapp_schedule_exceptions
  FOR EACH ROW EXECUTE FUNCTION private.set_whatsapp_updated_at();

CREATE TRIGGER set_whatsapp_delivery_rates_updated_at
  BEFORE UPDATE ON public.whatsapp_delivery_rates
  FOR EACH ROW EXECUTE FUNCTION private.set_whatsapp_updated_at();

CREATE TRIGGER set_whatsapp_delivery_surcharges_updated_at
  BEFORE UPDATE ON public.whatsapp_delivery_surcharges
  FOR EACH ROW EXECUTE FUNCTION private.set_whatsapp_updated_at();

CREATE TRIGGER set_whatsapp_notification_events_updated_at
  BEFORE UPDATE ON public.whatsapp_notification_events
  FOR EACH ROW EXECUTE FUNCTION private.set_whatsapp_updated_at();

REVOKE ALL ON TABLE public.whatsapp_channel_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_business_hours FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_schedule_exceptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_delivery_rates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_delivery_surcharges FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_delivery_quotes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_notification_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_admin_audit FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_channel_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_business_hours TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_schedule_exceptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_delivery_rates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_delivery_surcharges TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_delivery_quotes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_notification_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_admin_audit TO service_role;

CREATE OR REPLACE FUNCTION private.enforce_whatsapp_order_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.source_channel = 'whatsapp'
     AND NEW.type = 'domicilio'
     AND NEW.payment_method_requested = 'tarjeta' THEN
    RAISE EXCEPTION 'Los pedidos a domicilio de WhatsApp solo aceptan efectivo o transferencia';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_whatsapp_order_rules
  BEFORE INSERT OR UPDATE OF type, source_channel, payment_method_requested
  ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.enforce_whatsapp_order_rules();

CREATE OR REPLACE FUNCTION private.enforce_whatsapp_item_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source text;
  v_enabled boolean;
BEGIN
  SELECT source_channel INTO v_source
  FROM public.orders
  WHERE id = NEW.order_id;

  IF v_source = 'whatsapp' THEN
    SELECT is_active AND whatsapp_enabled INTO v_enabled
    FROM public.menu_items
    WHERE id = NEW.menu_item_id;

    IF NOT COALESCE(v_enabled, false) THEN
      RAISE EXCEPTION 'Uno de los productos no está disponible en WhatsApp';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_whatsapp_item_visibility
  BEFORE INSERT OR UPDATE OF menu_item_id, order_id
  ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION private.enforce_whatsapp_item_visibility();

CREATE OR REPLACE FUNCTION public.redact_expired_channel_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_days integer;
  v_count integer;
BEGIN
  IF private.request_jwt_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Esta operación solo está disponible para el servidor';
  END IF;

  SELECT message_retention_days INTO v_days
  FROM public.whatsapp_channel_settings
  WHERE id = 1;

  UPDATE public.channel_messages
  SET body = '',
      metadata = jsonb_build_object('redacted', true),
      redacted_at = now()
  WHERE redacted_at IS NULL
    AND created_at < now() - make_interval(days => COALESCE(v_days, 90));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_whatsapp_order_rules() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enforce_whatsapp_item_visibility() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redact_expired_channel_messages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redact_expired_channel_messages() TO service_role;
