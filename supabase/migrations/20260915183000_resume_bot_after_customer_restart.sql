-- Permite que un cliente retome el bot después de un relevo automático
-- mientras ninguna persona del equipo haya tomado la conversación.
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
      bot_enabled = CASE
        WHEN p_disable_bot THEN false
        WHEN p_stage <> 'handoff' THEN true
        ELSE bot_enabled
      END,
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

REVOKE ALL ON FUNCTION public.commit_whatsapp_conversation_message(
  uuid, text, text, jsonb, text, text, boolean
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.commit_whatsapp_conversation_message(
  uuid, text, text, jsonb, text, text, boolean
) TO service_role;
