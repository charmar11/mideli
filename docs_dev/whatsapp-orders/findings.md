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
- El transporte Meta está funcionando en Vercel: los mensajes permitidos se reciben, procesan y responden sin fallos del proveedor.
- `WHATSAPP_DRY_RUN=true` usa un `Map` en memoria. En Vercel esa memoria no es durable, por lo que el bot puede olvidar la etapa entre dos mensajes y esas conversaciones no aparecen en la bandeja de Mideli.
- Las tablas y acciones existentes ya permiten persistir mensajes, tomar una conversación y responder desde Mideli. El arreglo no requiere recuperar las conversaciones antiguas de memoria, porque nunca se escribieron en la base.
- La creación real de pedidos debe tener un bloqueo de servidor independiente de `dry-run` y del control operativo guardado en base.

## Persistencia preparada

- La migración local añade clientes, domicilios, conversaciones y mensajes con RLS habilitado y acceso exclusivo de `service_role`.
- La operación externa recalcula productos, variaciones, precios y total dentro de PostgreSQL.
- El pedido externo reutiliza caja abierta, folio, inventario, KDS e impresión mediante los disparadores vigentes.
- La migración aparece como la única pendiente en el `dry-run` remoto.
- Este equipo no tiene Docker o Podman, así que aún falta ejecutar la migración contra un PostgreSQL desechable antes de autorizar el proyecto remoto.
- Tailwind v4 escaneaba los junctions externos de `.opencode/skills` en desarrollo. El escaneo ahora está limitado a `src`, sin modificar esas skills.

## Diseño consolidado aprobado

- La primera versión usa texto sin botones ni imágenes.
- El menú se pagina en grupos de cinco y muestra descripción, ingredientes y precio.
- Los alimentos se ofrecen primero; las bebidas sin alcohol se ofrecen una sola vez al terminar. Alcohol solo por solicitud explícita.
- Cada producto tendrá un control independiente `Disponible en WhatsApp`; el inventario negativo no lo oculta.
- Domicilio acepta efectivo o transferencia y reutiliza el cobro vigente `Cobrar y entregar`.
- El horario es configurable por día, inicialmente de 12:00 a 23:00 en `America/Hermosillo`.
- La tarifa usa distancia por carretera, rangos editables y recargos por colonia. Más de 15 km pasa a una persona.
- Cocina dispara `En preparación`; al marcar listo se informa que está listo y buscando repartidor. `En camino` es manual. No existe aviso automático de entregado.
- Las conversaciones conservan contenido durante 90 días y después solo métricas anónimas.

## Documentación Supabase revisada

- La documentación vigente mantiene separados grants y RLS; ambos deben definirse expresamente.
- Las funciones pueden recibir `EXECUTE` por defecto, por lo que cada RPC privilegiada debe revocarse a `PUBLIC`, `anon` y `authenticated` y concederse solo a `service_role`.
- `SECURITY DEFINER` exige `search_path` vacío y nombres de esquema explícitos.
- El flujo oficial recomienda revisar `supabase db push --dry-run` antes de cualquier aplicación remota.
- No se detectó un breaking change relevante para este esquema en el índice actual del changelog.

## Google Maps revisado

- Geocoding acepta una dirección codificada y devuelve coordenadas y componentes; la colonia debe leerse de los componentes, no analizarse desde la dirección formateada.
- Routes `computeRoutes` requiere un POST y un `X-Goog-FieldMask`; para este caso basta `routes.distanceMeters`.
- La clave se mantendrá exclusivamente en servidor, restringida a Geocoding y Routes y protegida con cuotas.
- El cliente no podrá enviar llamadas arbitrarias a Google mediante Mideli.
# Hallazgo de rendimiento de la bandeja (2026-08-26)

- La pantalla recargaba todo el Server Component cada 10 segundos con `router.refresh()`.
- Cada ciclo repetía consultas de configuración, horarios, tarifas, catálogo, diagnósticos y conversaciones; el chat seleccionado hacía una consulta adicional.
- Las tablas del canal permanecen privadas para `service_role`, por lo que abrir Realtime al navegador ampliaría innecesariamente la superficie de datos.
- La solución aprobada es una acción autenticada ligera con sondeo de 2 segundos solo en la bandeja visible.
