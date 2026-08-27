-- Mantiene la restricción persistida alineada con las etapas que usa el
-- motor conversacional para edición y notas guiadas.

ALTER TABLE public.channel_conversations
  DROP CONSTRAINT IF EXISTS channel_conversations_stage_check,
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
    'awaiting_edit_action',
    'awaiting_edit_item',
    'awaiting_edit_quantity',
    'awaiting_edit_modifier_group',
    'awaiting_edit_modifier_option',
    'awaiting_edit_modifier_more',
    'awaiting_note_scope',
    'awaiting_note_item',
    'awaiting_note_quantity_scope',
    'awaiting_note_text',
    'handoff',
    'confirmed',
    'cancelled'
  ));
