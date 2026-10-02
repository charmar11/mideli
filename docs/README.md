# Índice del proyecto

Este índice es la puerta de entrada para cualquier IA o persona que necesite
entender Rincón 404. Revisado el 2026-10-01 contra la estructura local. Las
afirmaciones sobre producción son fotografías fechadas, no sustituyen una
comprobación nueva.

## Qué leer

| Necesitas | Documento |
|---|---|
| Reglas obligatorias para agentes | [AGENTS.md](../AGENTS.md) |
| Producto en lenguaje sencillo | [README principal](../README.md) y [PRODUCT.md](../PRODUCT.md) |
| Decisiones y evolución acumuladas | [Contexto extendido](../.opencode/plans/mideli-context.md) |
| Forma de pedir, construir, probar y entregar cambios | [Proceso de trabajo](WORKFLOW.md) |
| Módulos y flujo de datos | [Arquitectura](ARCHITECTURE.md) |
| Decisiones que se deben conservar | [Decisiones](DECISIONS.md) |
| Colores y diseño | [Diseño](../DESIGN.md) |
| Entornos, migraciones y publicación | [Operación](OPERATIONS.md) |
| Pruebas con el equipo y equipo físico | [Checklist del piloto](releases/v0.9-piloto.md) |

Orden de prioridad si hay contradicción: código y tipos actuales, estado remoto
verificable, `AGENTS.md`, contexto extendido y después documentos de producto.
Las secciones antiguas del contexto son cronología: verificar la fecha y leer
las actualizaciones posteriores antes de actuar.

## Por dónde seguir un problema

| Problema o función | Entrada de código |
|---|---|
| Inicio de sesión, permisos, negocio seleccionado | `src/proxy.ts`, `src/app/dashboard/layout.tsx`, `src/lib/business-capabilities.ts` |
| Menú de negocios, productos, combos y comanda | `src/components/dashboard/mesero-view.tsx`, `src/components/pos/`, `src/lib/stores/cart-store.ts`, `src/lib/stores/catalog-store.ts` |
| Crear, editar, recuperar y ver pedidos | `src/lib/stores/order-store.ts`, `src/lib/actions/pos-order-recovery.ts`, `src/components/dashboard/status-view.tsx`, `src/components/dashboard/sales-history.tsx`; Historial pagina por fecha e ID en lotes de 100 |
| Cocina y avisos de pedidos | `src/components/dashboard/cocina-view.tsx`, `supabase/functions/send-order-notification/`, `src/app/sw.ts` |
| Cobros y caja por negocio | `src/components/payments/`, `src/components/cash/cash-shift-control.tsx`, `src/lib/stores/cash-shift-store.ts` |
| Personal, negocios y licencias | `src/app/settings/`, `src/lib/actions/businesses.ts`, `src/lib/actions/business-licenses.ts` |
| Inventario | `src/components/admin/inventory/`, `src/lib/stores/inventory-store.ts` |
| WhatsApp de Mideli | `src/app/api/integraciones/whatsapp/meta/route.ts`, `src/lib/whatsapp/` |
| Esquema, políticas y funciones SQL | `supabase/migrations/`, `supabase/tests/` |
| Pruebas de interfaz y flujos | `tests/e2e/`, `playwright.config.ts` |

Empieza por la ruta del caso concreto, busca sus consumidores y comprueba el
permiso del negocio en servidor y base. El mapa Graphify de `graphify-out/`
ayuda a localizar relaciones, pero puede estar desactualizado; el código manda.

## Qué es vigente y qué es historial

- `docs/` contiene guías mantenidas. Una fecha de verificación antigua exige
  volver a comprobar el hecho antes de usarlo como estado actual.
- [docs_dev/](../docs_dev/README.md) conserva investigación y bitácoras de
  implementaciones. Algunos planes describen un futuro que ya ocurrió.
- [docs/superpowers/](superpowers/README.md) conserva diseños y planes de
  tareas con fecha. No equivale al código desplegado.
- `.opencode/plans/handoff.md` y `next-session-plan.md` son traspasos históricos.
  El contexto extendido registra las decisiones más recientes.
- `.next/`, `node_modules/`, `playwright-report/`, `test-results/`,
  `graphify-out/` y `output/` contienen dependencias o artefactos. No sirven
  como fuente de verdad del producto ni se deben borrar solo por ordenar.

## Cómo mantenerlo útil

Al cambiar un flujo relevante, actualizar la descripción vigente que lo
explica, la decisión si cambia una regla y el contexto acumulado. Registrar
qué se probó y qué falta por probar. Si una nota vieja contradice el código,
corregirla o marcarla como histórica, sin inventar un estado de producción.
