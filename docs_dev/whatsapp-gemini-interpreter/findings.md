# Findings

## Confirmed root causes

- `cartUpdatedReply` pregunta `¿Así está bien?`, pero devuelve el estado a `ordering`.
- `handleOrdering` no consume `isConfirmation`; una afirmación termina en búsqueda de producto.
- Dos mensajes no reconocidos activan `handoff` mediante `ambiguityCount`.
- `findCatalogProducts` calcula cantidad antes de cada mención literal. Una sola mención de California produce una unidad aunque aparezca `otro de pollo`.
- `matchItemModifiers` usa coincidencia literal; `carne` no corresponde a la opción `Res`.
- El runtime ya serializa mensajes por conversación y conserva idempotencia; la integración semántica debe vivir antes de `handleConversationMessage`, sin modificar ese mecanismo.
- El modo de prueba neutraliza `request_order_creation`, por lo que puede validarse el intérprete sin afectar cocina, caja, inventario ni impresión.

## External constraints

- Gemini gratuito tiene cuota por proyecto y puede responder con `429`.
- Structured Outputs garantiza forma JSON, no validez semántica; Mideli debe validar valores.
- La modalidad gratuita puede usar contenido para mejorar productos, por lo que el payload debe excluir PII.
- Ante una frase compleja, aceptar parcialmente el resultado local es más riesgoso que pedir aclaración; el fallback solo conserva una mutación local cuando el cambio parece completo.
- No se necesita migración de Supabase: el estado, la cola y la idempotencia existentes son compatibles con el intérprete asíncrono.
