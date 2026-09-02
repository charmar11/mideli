-- Permite avisar el avance de domicilios creados en Mesero cuando el cliente
-- proporcionó su teléfono, aunque todavía no exista una conversación de Meta.
ALTER TABLE public.orders
  ADD COLUMN whatsapp_status_opt_in boolean NOT NULL DEFAULT false;

UPDATE public.orders
SET whatsapp_status_opt_in = true
WHERE source_channel = 'whatsapp'
  AND type = 'domicilio'
  AND channel_conversation_id IS NOT NULL;

ALTER TABLE public.whatsapp_notification_events
  ALTER COLUMN conversation_id DROP NOT NULL,
  ADD COLUMN recipient_phone text NOT NULL DEFAULT '';

ALTER TABLE public.whatsapp_notification_events
  ADD CONSTRAINT whatsapp_notification_events_recipient_phone_check
  CHECK (recipient_phone = '' OR recipient_phone ~ '^[0-9]{8,15}$');

CREATE INDEX orders_manual_whatsapp_notifications_idx
  ON public.orders(whatsapp_status_opt_in, customer_phone, created_at DESC)
  WHERE type = 'domicilio' AND customer_phone IS NOT NULL;

CREATE INDEX whatsapp_notification_events_recipient_phone_idx
  ON public.whatsapp_notification_events(recipient_phone, created_at DESC)
  WHERE recipient_phone <> '';
