-- Confirmación explícita de domicilio, notas conversacionales y avisos de atención.

ALTER TABLE public.customer_addresses
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_method text;

ALTER TABLE public.customer_addresses
  DROP CONSTRAINT IF EXISTS customer_addresses_confirmation_method_check,
  ADD CONSTRAINT customer_addresses_confirmation_method_check CHECK (
    confirmation_method IS NULL
    OR confirmation_method IN ('text_confirmation', 'shared_location')
  );

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
    'awaiting_address_confirmation',
    'awaiting_payment',
    'awaiting_cash_tendered',
    'awaiting_confirmation',
    'awaiting_note_target',
    'handoff',
    'confirmed',
    'cancelled'
  ));

ALTER TABLE public.whatsapp_delivery_quotes
  DROP CONSTRAINT whatsapp_delivery_quotes_status_check,
  ADD CONSTRAINT whatsapp_delivery_quotes_status_check CHECK (
    status IN ('pending_confirmation', 'quoted', 'needs_handoff', 'failed')
  );

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS whatsapp_attention_alerts boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS push_subscriptions_whatsapp_attention_idx
  ON public.push_subscriptions(user_id)
  WHERE is_active AND whatsapp_attention_alerts;

CREATE TABLE public.whatsapp_attention_push_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.channel_conversations(id) ON DELETE CASCADE,
  event_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'sent', 'skipped', 'failed')),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  sent_count integer NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  expired_count integer NOT NULL DEFAULT 0 CHECK (expired_count >= 0),
  error_message text NOT NULL DEFAULT '',
  claimed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX whatsapp_attention_push_events_conversation_idx
  ON public.whatsapp_attention_push_events(conversation_id, created_at DESC);

ALTER TABLE public.whatsapp_attention_push_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_attention_push_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.whatsapp_attention_push_events
  TO service_role;

DROP FUNCTION IF EXISTS public.set_push_notification_topic(text, text, text, text, boolean, text, text);

CREATE FUNCTION public.set_push_notification_topic(
  p_endpoint text,
  p_p256dh text,
  p_auth_key text,
  p_topic text,
  p_enabled boolean,
  p_device_label text DEFAULT '',
  p_user_agent text DEFAULT ''
)
RETURNS TABLE (
  ready_alerts boolean,
  kitchen_alerts boolean,
  whatsapp_attention_alerts boolean,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  caller_role text;
  existing_subscription public.push_subscriptions%ROWTYPE;
  next_ready boolean;
  next_kitchen boolean;
  next_whatsapp_attention boolean;
BEGIN
  SELECT profiles.role
  INTO caller_role
  FROM public.profiles
  WHERE id = caller_id AND profiles.is_active;

  IF caller_id IS NULL OR caller_role IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida';
  END IF;

  IF p_topic NOT IN ('ready', 'kitchen', 'whatsapp_attention') THEN
    RAISE EXCEPTION 'Tipo de aviso no válido';
  END IF;

  IF p_topic = 'whatsapp_attention'
    AND caller_role NOT IN ('owner', 'admin', 'supervisor', 'waiter')
  THEN
    RAISE EXCEPTION 'No tienes permiso para estos avisos';
  END IF;

  IF COALESCE(p_endpoint, '') = ''
    OR COALESCE(p_p256dh, '') = ''
    OR COALESCE(p_auth_key, '') = ''
  THEN
    RAISE EXCEPTION 'Suscripción incompleta';
  END IF;

  SELECT *
  INTO existing_subscription
  FROM public.push_subscriptions
  WHERE endpoint = p_endpoint
  FOR UPDATE;

  IF existing_subscription.id IS NULL OR existing_subscription.user_id <> caller_id THEN
    next_ready := p_topic = 'ready' AND p_enabled;
    next_kitchen := p_topic = 'kitchen' AND p_enabled;
    next_whatsapp_attention := p_topic = 'whatsapp_attention' AND p_enabled;
  ELSE
    next_ready := CASE
      WHEN p_topic = 'ready' THEN p_enabled
      ELSE existing_subscription.ready_alerts
    END;
    next_kitchen := CASE
      WHEN p_topic = 'kitchen' THEN p_enabled
      ELSE existing_subscription.kitchen_alerts
    END;
    next_whatsapp_attention := CASE
      WHEN p_topic = 'whatsapp_attention' THEN p_enabled
      ELSE existing_subscription.whatsapp_attention_alerts
    END;
  END IF;

  INSERT INTO public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth_key,
    device_label,
    user_agent,
    ready_alerts,
    kitchen_alerts,
    whatsapp_attention_alerts,
    is_active,
    last_seen_at,
    updated_at
  ) VALUES (
    caller_id,
    p_endpoint,
    p_p256dh,
    p_auth_key,
    COALESCE(p_device_label, ''),
    COALESCE(p_user_agent, ''),
    next_ready,
    next_kitchen,
    next_whatsapp_attention,
    next_ready OR next_kitchen OR next_whatsapp_attention,
    now(),
    now()
  )
  ON CONFLICT (endpoint)
  DO UPDATE SET
    user_id = EXCLUDED.user_id,
    p256dh = EXCLUDED.p256dh,
    auth_key = EXCLUDED.auth_key,
    device_label = EXCLUDED.device_label,
    user_agent = EXCLUDED.user_agent,
    ready_alerts = EXCLUDED.ready_alerts,
    kitchen_alerts = EXCLUDED.kitchen_alerts,
    whatsapp_attention_alerts = EXCLUDED.whatsapp_attention_alerts,
    is_active = EXCLUDED.is_active,
    last_seen_at = now(),
    updated_at = now();

  RETURN QUERY
  SELECT
    subscription.ready_alerts,
    subscription.kitchen_alerts,
    subscription.whatsapp_attention_alerts,
    subscription.is_active
  FROM public.push_subscriptions AS subscription
  WHERE subscription.endpoint = p_endpoint
    AND subscription.user_id = caller_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_push_notification_topic(text, text, text, text, boolean, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_push_notification_topic(text, text, text, text, boolean, text, text)
  TO authenticated;

CREATE FUNCTION public.claim_whatsapp_attention_push_event(
  p_conversation_id uuid,
  p_event_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed_event_id uuid;
BEGIN
  IF p_conversation_id IS NULL OR COALESCE(btrim(p_event_key), '') = '' THEN
    RAISE EXCEPTION 'Evento de atención incompleto';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.channel_conversations
    WHERE id = p_conversation_id AND status = 'handoff'
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.whatsapp_attention_push_events (
    conversation_id,
    event_key
  ) VALUES (
    p_conversation_id,
    left(btrim(p_event_key), 300)
  )
  ON CONFLICT (event_key)
  DO UPDATE SET
    status = 'processing',
    attempt_count = public.whatsapp_attention_push_events.attempt_count + 1,
    claimed_at = now(),
    completed_at = NULL,
    error_message = '',
    updated_at = now()
  WHERE public.whatsapp_attention_push_events.status = 'failed'
     OR (
       public.whatsapp_attention_push_events.status = 'processing'
       AND public.whatsapp_attention_push_events.claimed_at < now() - interval '2 minutes'
     )
  RETURNING id INTO claimed_event_id;

  RETURN claimed_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_attention_push_event(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_attention_push_event(uuid, text)
  TO service_role;
