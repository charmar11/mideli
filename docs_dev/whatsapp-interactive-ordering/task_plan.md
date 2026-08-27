# Task: Pedidos interactivos completos por WhatsApp

## Goal

Implementar la especificación `docs/superpowers/specs/2026-08-27-whatsapp-interactive-ordering-design.md` con listas y botones nativos, edición real del carrito, notas guiadas y respaldo textual, sin crear datos de prueba ni desplegar.

## Phases

- [x] Phase 1: Aprobar y documentar el diseño
- [x] Phase 2: Auditar motor, webhook, proveedor, runtime y pruebas existentes
- [x] Phase 3: Escribir pruebas que reproduzcan los fallos y definan interacciones
- [x] Phase 4: Implementar identificadores interactivos, listas y respaldo textual
- [x] Phase 5: Implementar edición guiada, notas y mensajes combinados
- [x] Phase 6: Ejecutar pruebas focalizadas y corregir regresiones
- [x] Phase 7: Ejecutar lint, build y revisar el diff final

## Decisions

| Decision | Rationale | Date |
|---|---|---|
| Botones hasta 3 opciones y listas hasta 10 | Respeta límites de Meta y reduce texto manual | 2026-08-27 |
| Identificadores internos deterministas | Evita depender de títulos truncados, traducidos o repetidos | 2026-08-27 |
| Texto natural como respaldo | Mantiene compatibilidad y evita conversaciones bloqueadas | 2026-08-27 |
| Sin migración inicial | El estado conversacional ya vive en JSON y puede hidratar campos nuevos | 2026-08-27 |
| Sin despliegue en esta tarea | El usuario autorizó implementación, no un nuevo despliegue explícito | 2026-08-27 |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| 8 pruebas focalizadas fallan con el comportamiento vigente | Reproducción inicial | Fallos esperados y localizados: IDs descartados, listas ausentes, edición ausente, nota guiada ausente e intención de domicilio perdida |
| TypeScript detectó 4 incompatibilidades tras ampliar contratos | Implementación de transporte | Añadir defaults de estado, hidratar mensajes persistidos, estrechar nulos y ajustar fixture de prueba |
| La primera prueba de interacción asumía una sola fila | Prueba focalizada 1 | Ajustar la aserción para validar el ID principal sin rechazar la fila válida de regreso |
| El ID interactivo se perdía al pasar por la cola persistente | Revisión del flujo real | Guardarlo y recuperarlo desde `channel_messages.metadata` sin migración |
| Una prueba enviaba un botón de confirmación desde una etapa irreal | Revisión de botones obsoletos | Restringir IDs por etapa y corregir el fixture para representar el resumen real |
