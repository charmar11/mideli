# Hallazgos: pedidos por WhatsApp

## Línea base

- Rama aislada: `codex/whatsapp-orders`.
- El POS crea pedidos desde `src/lib/stores/order-store.ts` mediante `create_order_with_items`.
- La RPC actual exige una sesión de owner, admin, waiter o supervisor, por lo que no sirve directamente para el webhook de Meta.
- El POS actual calcula precios en cliente. La operación externa nueva debe recalcularlos en PostgreSQL.
- Solo existe una definición vigente de `create_order_with_items`, en `20260801062906_inventory_purchase_units_onboarding_and_order_folios.sql`.
- Los pedidos reciben folio mediante un trigger antes de insertar.
- Los `order_items` descuentan inventario mediante triggers existentes.
- Los pedidos insertados generan un `print_job` cuando la estación automática está activa.
- Caja exige un turno abierto y enlaza pedidos mediante la lógica vigente de base de datos.
- `src/lib/supabase/admin.ts` ya proporciona un cliente exclusivo de servidor con `service_role`.
- `src/proxy.ts` protege únicamente rutas de interfaz, no rutas `/api`, por lo que el webhook debe aplicar su propia autenticación y firma.
- La navegación adaptable vive en `src/components/dashboard/dashboard-shell.tsx`.
- El proyecto ya usa Playwright y puede importar TypeScript para pruebas del motor sin añadir otra librería.

## Supabase actual

- Supabase separa grants y RLS; ambos deben declararse explícitamente.
- Las funciones expuestas requieren revocar `EXECUTE` de roles no autorizados.
- El cambio de 2026 sobre exposición automática refuerza la necesidad de grants explícitos en cada migración.
- El cliente `service_role` debe ser separado del cliente SSR, patrón que el proyecto ya cumple.

## Meta

- Meta requiere una URL HTTPS públicamente accesible para el webhook.
- El token de verificación lo define Mideli y no es el token de acceso.
- El POST debe validarse mediante la firma basada en el secreto de la aplicación.
- Durante el piloto se usa el número de prueba y una lista permitida de destinatarios.
- Los tokens expuestos en capturas no se usarán.
- Meta verificó correctamente el callback HTTPS temporal el 2026-08-25.
- La pantalla de permisos posterior a la verificación no requiere permisos adicionales durante el piloto.
- Para procesar POST reales se necesita el App Secret; para responder se requieren el token temporal y el Phone Number ID.

## Persistencia preparada

- La migración local añade clientes, domicilios, conversaciones y mensajes con RLS habilitado y acceso exclusivo de `service_role`.
- La operación externa recalcula productos, variaciones, precios y total dentro de PostgreSQL.
- El pedido externo reutiliza caja abierta, folio, inventario, KDS e impresión mediante los disparadores vigentes.
- La migración aparece como la única pendiente en el `dry-run` remoto.
- Este equipo no tiene Docker o Podman, así que aún falta ejecutar la migración contra un PostgreSQL desechable antes de autorizar el proyecto remoto.
- Tailwind v4 escaneaba los junctions externos de `.opencode/skills` en desarrollo. El escaneo ahora está limitado a `src`, sin modificar esas skills.
