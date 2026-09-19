# Matriz de tablas y alcance multinegocio

**Estado:** inventario de diseño basado en las migraciones actuales. La fila de
catálogo ya tiene una migración ejecutable separada; el resto sigue siendo
alcance planificado y no modifica el esquema por sí mismo.

Este documento evita agregar `business_id` de forma automática a todas las
tablas. Cada registro debe recibir el alcance correcto: plataforma,
organización compartida, negocio o una entidad secundaria cuyo negocio se
derive de una relación validada.

## Reglas de lectura

- La fundación inicial crea organización, negocio, membresías, capacidades y
  auditoría; la siguiente rebanada asocia el catálogo a Mideli.
- Las tablas operativas siguen perteneciendo al modelo actual hasta que su
  etapa de migración pase pruebas de backfill y aislamiento.
- Un dato privado que no tenga negocio directo debe poder derivarlo de su
  padre sin aceptar un `business_id` contradictorio enviado por el navegador.
- WhatsApp queda asociado explícitamente a Mideli al inicio.
- Las mesas y zonas son compartidas por Rincón 404 Food Park; no se duplican
  por negocio.

## Identidad, plataforma y organización

| Tabla | Alcance objetivo | Tratamiento |
|---|---|---|
| `profiles` | Plataforma/usuario | Mantener identidad y credenciales; no es el límite de datos de negocio. |
| `user_onboarding_progress` | Usuario, con negocio opcional | Mantener global si describe la cuenta; agregar alcance solo si el flujo lo necesita. |
| `app_license` | Plataforma | No duplicar por negocio en la primera migración. |
| `license_control_credentials` | Plataforma | Nunca exponer valores sensibles; no duplicar por negocio sin decisión comercial. |
| `license_control_events` | Plataforma | Auditar por actor y organización cuando aplique. |
| `push_subscriptions` | Usuario/dispositivo | No es propiedad de un negocio; los eventos deben filtrar por negocio derivado. |

## Mesas, visitas y operación compartida

| Tabla | Alcance objetivo | Tratamiento |
|---|---|---|
| `table_zones` | Organización | El Coordinador administra el plano compartido. |
| `restaurant_tables` | Organización | Una mesa física puede recibir cuentas de varios negocios. |
| `table_map_labels` | Organización | Mantener junto al plano y proteger por capacidad organizacional. |
| `table_visits` *(nueva)* | Organización + mesa | Representar cada servicio nuevo sin reconstruir visitas históricas. |
| `business_accounts` *(nueva)* | Negocio + visita | Una cuenta independiente por negocio dentro de una visita. |

Las entidades nuevas `table_visits` y `business_accounts` son parte del diseño
objetivo, no existen todavía en las migraciones actuales.

## Catálogo y disponibilidad

| Tabla | Alcance objetivo | Tratamiento |
|---|---|---|
| `categories` | Negocio | `20260919091500_multibusiness_catalog_boundary.sql` hace backfill a Mideli y exige el negocio. |
| `menu_items` | Negocio | La misma migración hace backfill a Mideli y valida categoría y negocio. |
| `menu_item_availability_log` | Negocio derivado del producto | No permitir disponibilidad de un producto de otro negocio. |
| `menu_item_availability_reservations` | Negocio derivado del producto | Validar producto, ventana y negocio en la misma operación. |
| Storage de imágenes | Negocio derivado de catálogo | Cambiar rutas y políticas sin romper imágenes históricas. |

## Pedidos, estados y folios

| Tabla | Alcance objetivo | Tratamiento |
|---|---|---|
| `orders` | Negocio + visita/cuenta opcional | Folios existentes se conservan; nuevos pedidos requieren contexto después del piloto. |
| `order_items` | Negocio derivado de `orders` y producto | Rechazar líneas cruzadas aunque se manipule el cliente. |
| `order_status_log` | Negocio derivado de `orders` | El personal local solo modifica su negocio; el historial permanece inmutable. |
| `order_folio_counter` | Negocio | Decidir si cada negocio tendrá folio propio; nunca renumerar Mideli histórico. |
| `cash_shift_pending_orders` | Caja + negocio derivado | No mezclar pedidos de cuentas o negocios incompatibles. |

La división de un carrito con productos de varios negocios debe ocurrir en una
transacción del servidor. No se debe confiar en que el frontend cree varios
pedidos correctamente.

## Pagos, caja y gastos

| Tabla | Alcance objetivo | Tratamiento |
|---|---|---|
| `payment_transactions` | Negocio | Todas las órdenes y la caja deben pertenecer al mismo negocio. |
| `payment_tenders` | Negocio derivado de la transacción | Mantener métodos y correcciones dentro de la cuenta correcta. |
| `payment_order_allocations` | Negocio derivado de orden/transacción | Rechazar asignaciones cruzadas. |
| `payment_item_allocations` | Negocio derivado de línea | Validar la misma cuenta y negocio. |
| `payment_tender_method_changes` | Negocio derivado del pago | Mantener auditoría y autorización local. |
| `cash_shifts` | Negocio | Cambiar unicidad de una caja abierta global a una por negocio. |
| `cash_movements` | Negocio derivado de caja | Los totales y cortes nunca cruzan negocios. |
| `cash_shift_opening_float_changes` | Negocio derivado de caja | Mantener correcciones dentro del turno. |
| `cash_shift_adjustments` | Negocio derivado de caja | Requiere auditoría y autorización. |
| `cash_movement_corrections` | Negocio derivado de movimiento | No permitir corregir movimientos de otro negocio. |
| `private.cash_action_authorizations` | Negocio derivado de autorización | No usar el PIN como límite de seguridad. |
| `private.cash_shift_deletion_log` | Negocio derivado de turno | Conservar historial aunque el turno sea retirado operativamente. |
| `private.staff_authorization_pins` | Usuario/negocio | Revisar si el PIN es local, global o ambos; no duplicar secretos sin necesidad. |
| `private.payment_discount_authorizations` | Negocio derivado de pago | Validar alcance antes de autorizar descuento. |
| `private.payment_method_correction_authorizations` | Negocio derivado de pago | Validar alcance antes de corregir método. |

La mesera global puede cobrar para un negocio habilitado, pero el pago siempre
debe registrar el negocio y la caja correctos.

## Inventario

| Tabla | Alcance objetivo | Tratamiento |
|---|---|---|
| `inventory_items` | Negocio, o compartido mediante relación explícita futura | No inferir que dos nombres iguales son el mismo insumo. |
| `inventory_recipes` | Negocio | Producto, receta e insumos deben pasar validación de alcance. |
| `inventory_movements` | Negocio derivado del insumo | Mantener idempotencia de consumo y devolución. |
| `inventory_counts` | Negocio | Un conteo no puede incluir insumos de otro negocio. |
| `inventory_count_lines` | Negocio derivado del conteo | Validar pertenencia al conteo y negocio. |
| `inventory_purchase_orders` | Negocio | Las compras pertenecen al dueño que las registra. |
| `inventory_purchase_order_lines` | Negocio derivado de compra | Rechazar insumo cruzado. |
| `inventory_receipts` | Negocio | La recepción debe conservar negocio y proveedor si se agrega después. |
| `inventory_receipt_lines` | Negocio derivado de recepción | Validar lote e insumo. |
| `inventory_lots` | Negocio derivado de insumo/recepción | No compartir lotes por coincidencia textual. |

## Impresión, reportes y notificaciones

| Tabla | Alcance objetivo | Tratamiento |
|---|---|---|
| `print_station_settings` | Negocio o estación compartida explícita | Mantener Mideli primero; no enviar trabajos al negocio equivocado. |
| `print_jobs` | Negocio derivado de pedido | La estación debe validarse contra el pedido. |
| `push_notification_events` | Negocio derivado del evento | Mantener eventos de Cocina/Estado separados por negocio. |
| `owner_report_settings` | Negocio | Cada dueño debe ver únicamente su configuración. |
| `owner_daily_report_runs` | Negocio | Las sumas deben usar el alcance del negocio del reporte. |

Las suscripciones de un usuario global pueden existir una sola vez por
dispositivo, pero el evento que se entrega debe estar autorizado por el
negocio y el rol del destinatario.

## WhatsApp de Mideli

| Tabla | Alcance inicial | Tratamiento |
|---|---|---|
| `channel_conversations` | Mideli | Asociar explícitamente el canal a Mideli. |
| `channel_messages` | Mideli derivado de conversación | No habilitar otro negocio todavía. |
| `customers` | Mideli | Conservar clientes del canal sin mezclarlos con futuros negocios. |
| `customer_addresses` | Mideli derivado de cliente | Conservar domicilio y colonia con el mismo límite. |
| `whatsapp_channel_settings` | Mideli | Configuración única inicial. |
| `whatsapp_business_hours` | Mideli | No convertir en configuración global por accidente. |
| `whatsapp_schedule_exceptions` | Mideli | Mantener horarios de Mideli. |
| `whatsapp_delivery_rates` | Mideli | Tarifas y reglas propias. |
| `whatsapp_delivery_surcharges` | Mideli | Recargos propios. |
| `whatsapp_delivery_quotes` | Mideli derivado de conversación/pedido | Validar pedido y tarifa. |
| `whatsapp_notification_events` | Mideli derivado del pedido | No mezclar notificaciones de otros negocios. |
| `whatsapp_attention_push_events` | Mideli | Atención humana permanece exclusiva de Mideli. |
| `whatsapp_admin_audit` | Mideli + actor | Auditoría sin secretos ni tokens. |

WhatsApp no participa en la primera activación multinegocio. Solo se asegura
que su contexto quede fijo en Mideli y que una futura expansión no dependa de
la configuración global actual.

## Gaps que esta matriz evita

1. Aislar `orders` pero olvidar `order_status_log`, folios, impresión o Push.
2. Aislar pagos sin cambiar la unicidad global de caja abierta.
3. Permitir recetas o inventario cruzado por nombres iguales.
4. Dejar reportes y analíticas leyendo todas las ventas mientras la pantalla
   del negocio filtra solo el catálogo.
5. Tratar las mesas compartidas como propiedad de un negocio y perder la
   posibilidad de cuentas separadas en una misma visita.
6. Convertir accidentalmente WhatsApp de Mideli en un canal global.

## Orden recomendado de uso

La matriz debe usarse junto con `09-plan-migraciones-y-archivos.md` para revisar
cada etapa. Antes de convertir una columna opcional en obligatoria se deben
pasar los conteos de backfill, pruebas negativas de RLS/RPC y la regresión del
flujo actual de Mideli.
