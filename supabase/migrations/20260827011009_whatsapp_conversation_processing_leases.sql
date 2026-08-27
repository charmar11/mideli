-- Serializa el procesamiento de mensajes por conversación sin depender
-- de la memoria de una instancia de Vercel.

ALTER TABLE public.channel_conversations
  ADD COLUMN processing_owner text,
  ADD COLUMN processing_lease_until timestamptz;

ALTER TABLE public.channel_messages
  ADD COLUMN processing_started_at timestamptz,
  ADD COLUMN processing_finished_at timestamptz,
  ADD COLUMN processing_error text;

CREATE INDEX channel_messages_pending_fifo_idx
  ON public.channel_messages(conversation_id, occurred_at, created_at)
  WHERE direction = 'inbound' AND status = 'processing';

CREATE INDEX channel_messages_conversation_occurred_idx
  ON public.channel_messages(conversation_id, occurred_at);

CREATE INDEX channel_conversations_provider_activity_idx
  ON public.channel_conversations(provider, updated_at DESC);

CREATE OR REPLACE FUNCTION public.claim_whatsapp_conversation_processing(
  p_conversation_id uuid,
  p_owner text,
  p_lease_seconds integer DEFAULT 45
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  IF private.request_jwt_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Esta operación solo está disponible para el servidor';
  END IF;
  IF NULLIF(btrim(COALESCE(p_owner, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Falta el propietario del procesamiento';
  END IF;

  UPDATE public.channel_conversations
  SET processing_owner = p_owner,
      processing_lease_until = now() + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 10), 120))
  WHERE id = p_conversation_id
    AND (
      processing_lease_until IS NULL
      OR processing_lease_until <= now()
      OR processing_owner = p_owner
    );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_whatsapp_conversation_message(
  p_conversation_id uuid,
  p_owner text,
  p_external_message_id text,
  p_state jsonb,
  p_stage text,
  p_status text,
  p_disable_bot boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF private.request_jwt_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Esta operación solo está disponible para el servidor';
  END IF;

  UPDATE public.channel_conversations
  SET state = p_state,
      stage = p_stage,
      status = p_status,
      bot_enabled = CASE WHEN p_disable_bot THEN false ELSE bot_enabled END,
      processing_lease_until = now() + interval '45 seconds'
  WHERE id = p_conversation_id
    AND processing_owner = p_owner
    AND processing_lease_until > now();
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'La exclusión de la conversación venció';
  END IF;

  UPDATE public.channel_messages
  SET status = 'received',
      processing_finished_at = now(),
      processing_error = NULL
  WHERE conversation_id = p_conversation_id
    AND provider = 'meta'
    AND external_message_id = p_external_message_id
    AND direction = 'inbound'
    AND status = 'processing';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'El mensaje pendiente ya no está disponible';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_whatsapp_conversation_processing(
  p_conversation_id uuid,
  p_owner text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF private.request_jwt_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Esta operación solo está disponible para el servidor';
  END IF;

  UPDATE public.channel_conversations
  SET processing_owner = NULL,
      processing_lease_until = NULL
  WHERE id = p_conversation_id
    AND processing_owner = p_owner;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_conversation_processing(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_whatsapp_conversation_message(uuid, text, text, jsonb, text, text, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_whatsapp_conversation_processing(uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_whatsapp_conversation_processing(uuid, text, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_whatsapp_conversation_message(uuid, text, text, jsonb, text, text, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_whatsapp_conversation_processing(uuid, text)
  TO service_role;
