# Índice del proyecto

Este índice es la puerta de entrada para cualquier IA o persona que necesite
entender Rincón 404. Revisado el 2026-10-02 contra la estructura local. Las
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
| Crear, editar, recuperar y ver pedidos; hora opcional para recoger el mismo día; borrar con PIN del dueño por negocio | `src/lib/stores/order-store.ts`, `src/lib/order-scheduling.ts`, `src/lib/actions/pos-order-recovery.ts`, `src/lib/actions/sales.ts`, `src/components/dashboard/mesero-view.tsx`, `src/components/dashboard/status-view.tsx`, `src/components/dashboard/sales-history.tsx`, `supabase/migrations/20261010001844_business_scoped_order_deletion_authorization.sql`; Historial pagina por fecha e ID en lotes de 100 |
| Seguimiento de repartos desde Estado: aviso manual para WhatsApp con cliente, contacto y direcciones en bloques legibles | `src/lib/actions/delivery-status.ts`, `src/lib/delivery-driver-message.ts`, `src/components/dashboard/status-view.tsx` |
| Origen, tarifas por distancia y recargos por colonia separados por negocio | `src/app/settings/entregas/page.tsx`, `src/components/admin/business-delivery-settings-manager.tsx`, `src/lib/actions/business-delivery-settings.ts`, `src/lib/business-delivery.server.ts` |
| Directorio de clientes por negocio, domicilios y pedidos recientes; selección desde captura de domicilio | `src/app/settings/clientes/page.tsx`, `src/components/admin/business-customers-manager.tsx`, `src/components/pos/order-details-modal.tsx`, `src/lib/actions/business-customers.ts` |
| Ticket por negocio desde Historial | `src/components/dashboard/sales-history.tsx`, `src/components/printing/order-receipt-ticket.tsx`, `src/lib/actions/business-receipts.ts` |
| Desplazamiento por rueda en áreas estáticas y actualización táctil por gesto | `src/lib/wheel-scroll-fallback.ts`, `src/components/wheel-scroll-fallback.tsx`, `src/app/layout.tsx`, `src/lib/hooks/use-pull-to-refresh.ts` |
| Cocina y avisos de pedidos | `src/components/dashboard/cocina-view.tsx`, `supabase/functions/send-order-notification/`, `src/app/sw.ts` |
| Cobros y caja por negocio | `src/components/payments/`, `src/components/cash/cash-shift-control.tsx`, `src/lib/stores/cash-shift-store.ts` |
| Personal, negocios y licencias | `src/app/settings/`, `src/lib/actions/businesses.ts`, `src/lib/actions/business-licenses.ts` |
| Inventario | `src/components/admin/inventory/`, `src/lib/stores/inventory-store.ts` |
| WhatsApp técnico de Mideli (bandeja oculta al personal) | `src/app/api/integraciones/whatsapp/meta/route.ts`, `src/lib/whatsapp/` |
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
