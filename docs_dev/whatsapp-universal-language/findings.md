# Findings: Comprensión universal de WhatsApp

## Estado actual

- El motor local está concentrado principalmente en `src/lib/whatsapp/conversation-engine.ts`.
- Gemini solo participa en `ordering`, `browsing_catalog`, `awaiting_beverage`, `awaiting_fulfillment`, `awaiting_payment` y `awaiting_confirmation`.
- El esquema semántico vigente permite una sola intención: operaciones de carrito, nota, terminar, continuar o desconocido.
- El modelo no puede representar varias intenciones independientes dentro del mismo mensaje.
- Mensajes con dirección, pago, teléfono, PIN, correo o URL no se envían a Gemini.
- El motor local procesa esos mensajes, pero sus reglas son mayormente específicas de la etapa actual.
- La transferencia humana puede activarse después de dos productos no reconocidos, una nota ambigua reiterada o dos rechazos de domicilio.
- `requestsHuman` contiene la palabra genérica `persona`.
- `human_handoff_enabled` se guarda y se muestra en administración, pero actualmente no gobierna el motor de conversación.
- El sistema ya valida IDs de catálogo y opciones antes de aplicar resultados de Gemini.
- El webhook ya tiene deduplicación y bloqueo por conversación; debe conservarse.
- La suite actual cubre conversaciones, Gemini, operaciones, bandeja, clientes, ciclo de reparto y webhook.

## Riesgos principales

- Aplicar una parte de un mensaje compuesto y olvidar otra.
- Repetir una acción ya aplicada después de pedir aclaración.
- Confundir una pregunta de disponibilidad con una orden.
- Enviar datos sensibles a Gemini al ampliar su alcance.
- Romper etapas antiguas persistidas en Supabase.
- Mejorar exactitud a costa de superar tres segundos.
- Transferir demasiadas conversaciones y anular el beneficio comercial del bot.

## Archivos previstos

- `src/lib/whatsapp/conversation-engine.ts`
- `src/lib/whatsapp/hybrid-interpreter.ts`
- `src/lib/whatsapp/gemini-interpreter.server.ts`
- `src/lib/whatsapp/meta-webhook.ts`
- `src/lib/whatsapp/quick-replies.ts`
- `src/lib/whatsapp/operations.server.ts`
- `src/lib/whatsapp/types.ts`
- Nuevos módulos pequeños para normalización, planes, validación, aplicación y respuestas.
- Nuevas fixtures y especificaciones dentro de `tests/`.

## Restricciones

- No usar voz ni imágenes en esta fase.
- No enviar datos privados del cliente a Gemini.
- No cambiar esquema remoto sin una migración nueva y dry-run.
- No habilitar creación de pedidos durante pruebas exploratorias.
- No desplegar si falla una invariante crítica aunque el porcentaje global sea alto.
