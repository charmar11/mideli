# Hallazgos

## Estado inicial

- La rama es `codex/whatsapp-orders` y el árbol estaba limpio al iniciar.
- El motor ya recibe ubicaciones compartidas desde Meta.
- El proveedor actual solo envía texto, aunque Meta admite mensajes salientes de ubicación estática.
- La cotización actual guarda el domicilio antes de una confirmación explícita.
- `ConversationCartLine` ya tiene `notes` y el RPC de creación externa ya persiste notas por producto.
- `orders.notes` se rellena hoy con el texto fijo `Pedido recibido por WhatsApp`.
- Las referencias de entrega ya se guardan por separado en `delivery_reference`.
- Push ya tiene preferencias por dispositivo para `kitchen` y `ready`.
- El registro Push actual está ligado a pedidos, por lo que un chat sin orden probablemente necesita un registro de eventos específico o una generalización segura.
- `whatsapp_delivery_quotes.status` solo permite `quoted`, `needs_handoff` y `failed`; se ampliará con `pending_confirmation`.
- La ubicación entrante ya se convierte en coordenadas y el geocodificador hace reverse geocoding.
- El proveedor saliente puede ampliarse sin cambiar firmas del webhook porque texto y ubicación usan el mismo endpoint de Meta.
- El ticket de Cocina imprime `order_items.notes` y `orders.notes`, pero no imprime `delivery_reference`; esta separación sirve para proteger PIN y acceso.
- La Edge Function de pedidos exige `order_id`, por lo que atención humana tendrá una función y tabla idempotente propias.

## Restricciones

- No modificar migraciones históricas.
- No exponer PIN o referencias privadas en Push, listados ni tickets de Cocina.
- No permitir que Gemini altere precios, productos o confirmaciones.
- Mantener idempotencia ante webhooks repetidos.
