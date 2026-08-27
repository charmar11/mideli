# Plan de implementación: domicilio, notas y atención Push

## Objetivo

Entregar confirmación de domicilio por mapa, notas naturales y alertas Push de atención sin cambiar el recorrido comercial existente.

## Tarea 1: Esquema compatible

- Crear una migración nueva para `awaiting_address_confirmation` y `awaiting_note_target`.
- Añadir confirmación a `customer_addresses`.
- Permitir `pending_confirmation` en cotizaciones.
- Añadir `whatsapp_attention_alerts` a suscripciones.
- Crear eventos idempotentes de atención por conversación.
- Reemplazar `set_push_notification_topic` conservando compatibilidad con `ready` y `kitchen`.
- Ejecutar el dry-run de Supabase antes de aplicar.

## Tarea 2: Modelo y motor conversacional

- Extender `ConversationState` con origen y confirmación de domicilio, cotización candidata, notas generales y nota pendiente.
- Hidratar estados antiguos con valores seguros.
- Cambiar la cotización de texto para terminar en confirmación, no en pago.
- Confirmar, rechazar o reemplazar el candidato sin perder el carrito.
- Mantener el camino corto para ubicación compartida y domicilio guardado confirmado.
- Bloquear la creación de órdenes a domicilio sin cotización confirmada.

## Tarea 3: Mensajes de Meta

- Generalizar el envío saliente para texto y ubicación.
- Enviar ubicación y después la pregunta de confirmación.
- Registrar ambos mensajes en la conversación.
- Usar enlace de Maps como respaldo si falla únicamente el mensaje de ubicación.

## Tarea 4: Notas

- Detectar notas de acceso, generales y por producto antes del fallback de catálogo.
- Aplicar notas claras sin invocar Gemini.
- Pedir una sola aclaración cuando haya varios destinos posibles.
- Ampliar la interpretación semántica con una salida validada para notas ambiguas, sin permitir cambios de precio o confirmación.
- Mostrar notas en resumen y persistirlas en el RPC de creación.

## Tarea 5: Push de atención

- Extender tipos, cliente PWA, control y service worker con `whatsapp_attention`.
- Crear una Edge Function dedicada a eventos de conversación.
- Invocarla solo después de confirmar una transición nueva a `handoff`.
- Abrir el chat exacto desde la notificación.
- Evitar datos privados en título, cuerpo y etiqueta.

## Tarea 6: Interfaz y privacidad

- Colocar el control de avisos de atención en la cabecera de WhatsApp.
- Mostrar notas de entrega y preparación en la comanda donde corresponda.
- Verificar que PIN y acceso no aparezcan en Cocina o ticket de Cocina.

## Tarea 7: Pruebas y liberación

- Ampliar pruebas de conversación, proveedor Meta, interpretación, política Push y esquema.
- Probar los casos del diseño aprobado.
- Ejecutar pruebas focalizadas, `npm run lint` y `npm run build`.
- Revisar el diff y los cambios remotos.
- Aplicar migración y desplegar Edge Function y Vercel solo si todo pasa.
