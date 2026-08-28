# Task: Reforzar el checkout de WhatsApp

## Goal

Corregir el recorrido reportado sin alterar pedidos existentes: bloquear acciones interactivas obsoletas, conservar el domicilio validado, eliminar indicaciones fantasma y mejorar el diagnóstico antes de desplegar.

## Phases

- [x] Phase 1: Investigar producción y reproducir el flujo
- [x] Phase 2: Documentar el diseño correctivo
- [x] Phase 3: Crear pruebas de regresión
- [x] Phase 4: Implementar correcciones acotadas
- [x] Phase 5: Ejecutar suite completa, lint y build
- [ ] Phase 6: Desplegar y verificar producción

## Decisions

| Decision | Rationale | Date |
|---|---|---|
| Las acciones antiguas no cambian la etapa vigente | Evita reiniciar domicilio, pago o confirmación | 2026-08-27 |
| La dirección formateada será canónica después de confirmarla | El cliente y el equipo deben ver el mismo domicilio | 2026-08-27 |
| Las etiquetas genéricas no son notas | Evita `Nota; Sin verdura` y datos basura | 2026-08-27 |
| No se modificará la representación de respuestas citadas de WhatsApp | Es comportamiento visual del cliente, no duplicación del bot | 2026-08-27 |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| `cart:note` se aceptaba durante `awaiting_address_confirmation` | Investigación de la transcripción | Restringir comandos interactivos por etapa |
| La tarifa mostraba la dirección de entrada | Trazado del runtime | Construir la respuesta con el estado confirmado |
| `Nota` podía persistirse como indicación guiada | Revisión de `handleGuidedNoteText` | Validar etiquetas genéricas antes de guardar |
| La respuesta de tarifa usaba la dirección escrita | Prueba de domicilio canónico | Formatear el mensaje únicamente con `formattedAddress` |
