# Diseño: contexto de trabajo para OpenCode

## Objetivo

Dejar el contexto acumulado de Mideli dentro del repositorio para que OpenCode pueda continuar el desarrollo sin depender del historial de una conversación anterior.

## Diseño aprobado

- `AGENTS.md` mantiene las reglas obligatorias y apunta al contexto extendido.
- `.opencode/plans/mideli-context.md` conserva el contexto de producto, decisiones, arquitectura, estado de Supabase, pendientes y comandos de verificación.
- No se guardan tokens, claves privadas ni valores de `.env.local`.
- El contexto distingue entre estado implementado, fotografía de datos y trabajo pendiente.
- El handoff anterior se conserva como histórico para no perder información previa.

## Criterios de aceptación

- OpenCode encuentra las instrucciones principales al abrir el proyecto.
- Un agente nuevo puede identificar el flujo POS, el mapa global de mesas y el inventario sin leer todo el historial.
- Las decisiones visuales y de copy del dueño quedan explícitas.
- Las operaciones peligrosas de Supabase tienen límites claros.
- Se incluyen comandos de lint, build y sincronización segura de migraciones.

## Revisión

- Se contrastó la estructura real de `src/` y `supabase/migrations/`.
- Se verificó que las migraciones locales y remotas coinciden de `00001` a `00005`.
- Se verificaron los conteos remotos como fotografía fechada, sin exponer credenciales.
