-- Independent Web Push topics per device and idempotent delivery events.

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS ready_alerts boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kitchen_alerts boolean NOT NULL DEFAULT false;

-- Preserve the behavior of devices that already receive ready-order alerts.
UPDATE public.push_subscriptions
SET ready_alerts = is_active
WHERE ready_alerts IS DISTINCT FROM is_active;

CREATE INDEX IF NOT EXISTS push_subscriptions_ready_alerts_idx
  ON public.push_subscriptions(user_id)
  WHERE is_active AND ready_alerts;

CREATE INDEX IF NOT EXISTS push_subscriptions_kitchen_alerts_idx
  ON public.push_subscriptions(user_id)
  WHERE is_active AND kitchen_alerts;

CREATE TABLE IF NOT EXISTS public.push_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  transition_log_id uuid REFERENCES public.order_status_log(id) ON DELETE CASCADE,
  topic text NOT NULL CHECK (topic IN ('ready', 'kitchen')),
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

CREATE INDEX IF NOT EXISTS push_notification_events_order_idx
  ON public.push_notification_events(order_id, created_at DESC);

ALTER TABLE public.push_notification_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.push_notification_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.push_notification_events TO service_role;

CREATE OR REPLACE FUNCTION private.log_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.order_status_log (
      order_id,
      from_status,
      to_status,
      changed_by
    ) VALUES (
      NEW.id,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
      NEW.status,
      (SELECT auth.uid())
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_order_status_transition ON public.orders;
CREATE TRIGGER log_order_status_transition
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.log_order_status_transition();

REVOKE ALL ON FUNCTION private.log_order_status_transition() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.set_push_notification_topic(
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
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  existing_subscription public.push_subscriptions%ROWTYPE;
  next_ready boolean;
  next_kitchen boolean;
BEGIN
  IF caller_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = caller_id AND profiles.is_active
  ) THEN
    RAISE EXCEPTION 'Sesión no válida';
  END IF;

  IF p_topic NOT IN ('ready', 'kitchen') THEN
    RAISE EXCEPTION 'Tipo de aviso no válido';
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
  ELSE
    next_ready := CASE
      WHEN p_topic = 'ready' THEN p_enabled
      ELSE existing_subscription.ready_alerts
    END;
    next_kitchen := CASE
      WHEN p_topic = 'kitchen' THEN p_enabled
      ELSE existing_subscription.kitchen_alerts
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
    next_ready OR next_kitchen,
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
    is_active = EXCLUDED.is_active,
    last_seen_at = now(),
    updated_at = now();

  RETURN QUERY
  SELECT
    subscription.ready_alerts,
    subscription.kitchen_alerts,
    subscription.is_active
  FROM public.push_subscriptions AS subscription
  WHERE subscription.endpoint = p_endpoint
    AND subscription.user_id = caller_id;
END;
$$;

-- Keep older deployed clients functional. Their global activation maps to
-- ready-order alerts and does not overwrite an existing Kitchen preference.
CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth_key text,
  p_device_label text DEFAULT '',
  p_user_agent text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM *
  FROM public.set_push_notification_topic(
    p_endpoint,
    p_p256dh,
    p_auth_key,
    'ready',
    true,
    p_device_label,
    p_user_agent
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_push_notification_event(
  p_event_key text,
  p_order_id uuid,
  p_topic text,
  p_transition_log_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed_event_id uuid;
BEGIN
  IF COALESCE(p_event_key, '') = '' OR p_order_id IS NULL THEN
    RAISE EXCEPTION 'Evento de aviso incompleto';
  END IF;

  IF p_topic NOT IN ('ready', 'kitchen') THEN
    RAISE EXCEPTION 'Tipo de aviso no válido';
  END IF;

  INSERT INTO public.push_notification_events (
    event_key,
    order_id,
    transition_log_id,
    topic
  ) VALUES (
    p_event_key,
    p_order_id,
    p_transition_log_id,
    p_topic
  )
  ON CONFLICT (event_key)
  DO UPDATE SET
    status = 'processing',
    attempt_count = public.push_notification_events.attempt_count + 1,
    claimed_at = now(),
    completed_at = NULL,
    error_message = '',
    updated_at = now()
  WHERE public.push_notification_events.status = 'failed'
     OR (
       public.push_notification_events.status = 'processing'
       AND public.push_notification_events.claimed_at < now() - interval '2 minutes'
     )
  RETURNING id INTO claimed_event_id;

  RETURN claimed_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_push_notification_topic(text, text, text, text, boolean, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_push_notification_topic(text, text, text, text, boolean, text, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.claim_push_notification_event(text, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_notification_event(text, uuid, text, uuid)
  TO service_role;
