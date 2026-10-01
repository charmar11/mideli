# Hallazgos: recuperación segura de pedidos POS

- El borrador POS se guarda por usuario en `src/lib/pos-cart-draft.ts`; el esquema actual no incluye la clave idempotente.
- El envío está en `src/components/dashboard/mesero-view.tsx`; el estado pendiente de claves en `src/lib/stores/order-store.ts` vive en memoria (`pendingOrderCreationKeys`).
- El flujo actual usa RPC de creación normal, de mesa y de lote multinegocio, pasando `p_creation_key`.
- La base ya tiene `orders.creation_key` con índice único parcial y `order_batches.creation_key` único. Existe una migración reciente que crea pedido y detalles de domicilio/horario atómicamente; no se presume necesaria una nueva migración.
- Para pedido unitario y lote mixto hay que verificar que las lecturas por clave respeten las políticas RLS/negocio y que la sesión normal de Mesero pueda consultarlas.
- El borrador actual no guarda teléfono/domicilio, conforme a la decisión del dueño. Si no hubo commit, esos datos deberán volver a capturarse cuando sean necesarios.
- El trabajo aprobado no toca WhatsApp, pagos/caja, folios, políticas de licencia ni datos remotos existentes.
- La guía oficial vigente de Supabase confirma que las lecturas de cliente deben apoyarse en RLS y que el cliente normal adjunta la sesión; no se usará `service_role`. La consulta a changelog (2026-09-30) no mostró cambios recientes relevantes para esta lectura.
- Para el código cliente se identificó la guía local de Next.js 16 `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`; debe leerse antes de editar el componente.
- La guía de Next.js confirma que `localStorage` debe usarse en un Client Component/efecto, no durante render del servidor.
- Riesgo de autorización: la migración base define `Orders viewable by staff` con `USING (true)`; la política de licencia es restrictiva, pero eso por sí solo no prueba que exista aislamiento por negocio en RLS. No se añadirá una consulta directa desde el navegador hasta verificarlo; se revisará el patrón de acciones autenticadas existentes o se detendrá para rediseñar.
- Las acciones de historial ya verifican sesión, perfil activo, contexto seleccionado, negocios legibles y licencia antes de consultar pedidos. Se puede reutilizar ese patrón del lado servidor, sin `service_role`.
- `order_batches` tiene RLS separado por membresía a la organización y guarda `created_by`; cada pedido del lote guarda también `created_by` y `business_id`. Las órdenes hijas de lotes no usan la clave del lote: la clave está en `order_batches`.
- El servidor ya resuelve contextos de negocio mediante `get_my_multibusiness_context`; cada fila trae organización, negocio, capacidades, estado y disponibilidad de licencia. `getOrderReadableBusinessContexts` filtra el conjunto seguro para lectura, incluso cuando el usuario pertenece a varias organizaciones.
- Cada artículo agregado desde el menú conserva `business_id`. Para recuperar una comanda mixta se buscará el lote por clave, usuario creador y organización(es) de sus productos, y se validará que se lean todos los negocios esperados; no se aceptará un lote parcial.
- La pantalla ya hace una carga inicial activa de pedidos. Al recuperar una clave se espera cualquier carga existente y luego se fuerza una segunda carga secuencial, porque el store comparte solicitudes concurrentes y no fuerza refresh automáticamente.
- `tests/e2e/pos-cart-draft.spec.ts` ya valida el guardado aislado por usuario, borrado y ausencia de datos de cliente; se ampliará para validar relectura de clave, borrador anterior sin clave y el almacenamiento personal nunca crece con los campos de domicilio/teléfono.
- El carrito editable está en `CartPanel`; el modal de datos de pedido es `OrderDetailsModal`. Para preservar idempotencia mientras una clave sigue pendiente, el carrito/productos y datos operativos que definen la comanda deberán quedar bloqueados, mientras el domicilio/teléfono pueden volver a capturarse porque deliberadamente no se persisten.
- Los RPC de creación son idempotentes con la misma clave, pero el RPC de lote es `SECURITY DEFINER` y devuelve el lote existente antes de recalcular capacidades. No se usará dicho RPC como endpoint de recuperación; la lectura tendrá que validar usuario, negocio/organización y lote completo.
- La consulta deberá tratar falta de sesión, error de RLS/licencia o lote parcial como “no se pudo confirmar”, no como “no existe”, para conservar borrador y clave sin habilitar un intento nuevo.

## Riesgos resueltos en la implementación local

1. El lote sólo se recupera si la sesión puede leerlo por RLS, corresponde al mismo creador/organización y contiene el conjunto completo de negocios esperado.
2. Errores de sesión, permiso, licencia, consulta o resultados parciales quedan como “no confirmado”; sólo una consulta completa sin fila habilita reintentar con la misma clave.
3. Los errores de creación no eliminan la clave local. La clave queda hasta encontrar el pedido o completar un intento exitoso.
4. Los borradores antiguos sin clave siguen siendo válidos; el teléfono, domicilio, colonia y otros datos del cliente no se serializan.
5. No se requiere migración SQL. Los flujos legacy de WhatsApp permanecen fuera del cambio.

## Cierre

- GitHub `Verify Mideli` pasó para `4d0c05b9a18b42927f59d87cf61f6776408d564b`.
- Producción quedó `READY` en Vercel como `dpl_7sfNkHrETwaCvzPCXi694GxUiiGD`; `/api/health` respondió `ok` con versión `4d0c05b9a18b`.
- No se simuló una comanda real de extremo a extremo porque eso escribiría una venta en la base operativa. La primera recuperación real queda para el uso normal.
