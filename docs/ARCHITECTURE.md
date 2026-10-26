# Arquitectura de Mideli

## Resumen

Mideli es una aplicación Next.js con App Router. La interfaz vive en `src/components`, las mutaciones protegidas se concentran en Server Actions y Supabase conserva la fuente transaccional de órdenes, pagos, caja, clientes e inventario.

```text
Navegador / PWA
  └─ src/app y src/components
      ├─ Zustand: carrito, catálogo, mesas, órdenes, caja e inventario
      ├─ Server Actions: mutaciones y operaciones protegidas
      └─ Supabase browser client: lecturas autorizadas y Realtime

Next.js server / Edge Functions
  ├─ src/lib/whatsapp: webhook, motor, clientes, catálogo y ciclo de entrega
  ├─ src/server: Resend, Twilio y Polar
  └─ supabase/functions: notificaciones Push y atención WhatsApp

Supabase
  ├─ PostgreSQL + RLS
  ├─ Auth
  ├─ Realtime
  └─ Storage para imágenes de menú
```

## Estado de arquitectura multinegocio

La lectura remota del 2026-09-27 confirmó Mideli y Just Dipping registrados
como negocios activos. El esquema usa `business_id`, `organization_id`,
membresías, capacidades y RLS para separar catálogo, pedidos, inventario, caja,
pagos, reportes y personal. El catálogo y el archivo histórico de Just Dipping
no se mezclan con las ventas ni la caja operativa de Mideli.

La arquitectura incorpora una organización de Rincón 404 Food Park, negocios
con ciclo de vida, membresías y capacidades por alcance. Pedido, catálogo,
inventario, caja, pagos, reportes y notificaciones deben resolver el negocio
en servidor y RLS, no solamente en la interfaz. Las mesas pueden ser
compartidas físicamente, mientras cada visita conserva cuentas y órdenes
separadas por negocio.

La migración empezó por Mideli y se hizo por etapas aditivas. Las fronteras
transaccionales se verifican por negocio.
WhatsApp sigue asignado explícitamente a Mideli y no se habilitará para Just
Dipping en esta fase. Su bandeja de personal se retiró de navegación y la ruta
redirige a una vista autorizada; webhook, bot y tareas no se desactivaron ni
modificaron. La comanda mixta soporta comedor con una orden y cuenta separadas
por negocio. Los pedidos mixtos de domicilio y para llevar siguen bloqueados
hasta implementar un RPC atómico y definir el tratamiento de la tarifa externa
de entrega.

### Just Dipping: combos y tickets anteriores

La implementación incorpora `is_combo` y una definición de combo simple en
`menu_items`. El pedido conserva cada combo como una sola línea con el precio
del paquete; el servidor valida componentes/opciones contra el catálogo del
mismo negocio y guarda snapshots para cocina, comprobantes e inventario. Los
folios de pedidos, aperturas de caja y pagos se asignan por `business_id`, sin
renumerar operaciones existentes.

Los tickets del sistema Firestore no se convierten en órdenes o pagos activos.
`legacy_sales_tickets` los separa como archivo de consulta con artículos
sanitizados, RLS por negocio y escritura reservada al servicio de migración.
No se almacenan datos de cliente y no afectan caja ni reportes operativos. La
revisión de origen detectó una discrepancia en Promo Lunes: su descripción dice
que incluye cheesecake, pero no aparece en la configuración de componentes;
mantenerla deshabilitada hasta confirmación del dueño.

Las migraciones de combos, folios, catálogo y estructura del archivo constan
aplicadas en producción al corte del 2026-09-27. La inspección de Firebase
encontró 1,138 tickets anteriores; una consulta agregada de solo lectura en
Supabase confirmó que `legacy_sales_tickets` seguía vacía el 2026-10-01. La
importación de esos tickets sigue pendiente. Cuando se importen, quedarán fuera
de ventas, caja y reportes operativos. Antes del piloto hay que verificar
catálogo, inventario y permisos con el dueño.

Historial carga 100 pedidos y, cuando el archivo está disponible, 100 tickets
históricos por página. Un cursor compuesto por fecha e ID mantiene el orden y
evita depender de desplazamientos que cambian cuando llegan pedidos nuevos.
Los filtros se aplican sobre lo ya cargado; el botón «Cargar más historial»
avanza ambas fuentes sin cambiar sus permisos ni mezclar tickets archivados con
ventas operativas. Los contadores y el resumen de cobros pendientes indican el
alcance cargado, no un total del periodo mientras haya páginas por consultar.

### Licencias por negocio

`business_licenses` conserva una vigencia local inclusiva por negocio y
`business_license_events` registra cambios auditables sin montos. La cuenta de
plataforma Rincón 404 administra vigencias desde `/settings/licencias`; el
`app_license.status` legado sólo conserva una suspensión técnica global. RLS,
RPCs y triggers bloquean lectura y escritura operativa por negocio. Un fallo de
verificación es fail-closed sin afirmar deuda.

Las meseras globales mantienen los negocios autorizados y vigentes; un local
no disponible aparece neutral y deshabilitado, sin exponer fecha o estado de
licencia. Si Mideli no está disponible, el webhook de WhatsApp descarta eventos
válidos sin procesarlos y los envíos y tareas programadas se detienen.

El panel `/dashboard` también funciona como centro de preparación para dueños
con permisos de borrador, evitando redirigirlos de vuelta al menú. Para un
negocio sin pantalla de Cocina, Estado puede mover pedidos entre Pendiente,
Preparando y Listo cuando la cuenta tenga el permiso explícito
`business.update_preparation`; operar pedidos por sí solo no concede ese
permiso. La estación separada requiere `business.access_kitchen`, por lo que
puede dejarse apagada aunque el equipo avance pedidos desde Estado.

## Mapa de módulos

| Módulo | Interfaz | Estado y lógica |
|---|---|---|
| Mesero | `src/app/dashboard/mesero`, `src/components/pos/` | `mesero-view.tsx`, `cart-store.ts`, `order-store.ts` |
| Cocina | `src/app/dashboard/cocina` | `cocina-view.tsx`, órdenes Realtime y audio local |
| Estado | `src/components/dashboard/status-view.tsx` | `order-store.ts`, acciones de estado |
| Historial | `src/components/dashboard/sales-history.tsx` | acciones de ventas, pagos y snapshots; el dueño borra directo y el personal con permiso requiere PIN del dueño del mismo negocio |
| Entregas | `src/app/settings/entregas` | origen, tarifas y recargos independientes por negocio; compartir el domicilio con el repartidor |
| Clientes | `src/app/settings/clientes`, `src/components/admin/business-customers-manager.tsx` | directorio, domicilios y pedidos del negocio activo |
| Ticket de pedido | `src/components/printing/order-receipt-ticket.tsx`, `src/lib/actions/business-receipts.ts` | configuración por negocio e impresión iniciada desde Historial |
| Pedidos de plataformas | `src/lib/marketplace-orders.ts`, `src/lib/actions/business-marketplace.ts`, `src/app/settings/plataformas` | disponibilidad y precio por producto/canal; Mesero solo muestra configuración cargada del negocio activo y de los productos de la comanda; creación POS y validación de base de datos, entrega idempotente y efectivo Didi ligado al turno del mismo negocio; productos nuevos comienzan desactivados |
| Caja | `src/app/settings/caja`, `src/components/cash/` | `cash-shift-store.ts`, libro de caja y RPCs |
| Pagos | `src/components/payments/` | libro mayor de pagos y autorizaciones |
| Menú | `src/app/menu`, `src/components/admin/` | `catalog-store.ts`, categorías y modificadores |
| Mesas | `src/app/settings/mesas`, `src/components/tables/` | `tables-store.ts`, mapa normalizado |
| Inventario | `src/app/settings/inventario` | `inventory-store.ts`, recetas y movimientos |
| WhatsApp (backend heredado) | `src/app/api/integraciones/whatsapp/meta/route.ts`, `src/lib/whatsapp/` | webhook y bot siguen intactos; bandeja no disponible al personal |
| PWA | layout, manifest y service worker | `src/app/sw.ts`, `src/lib/push-notifications.ts` |

## Flujo de una orden interna

1. `mesero-view.tsx` carga catálogo, mesas y órdenes activas en paralelo.
2. `cart-store.ts` conserva el pedido local, sus modificadores y notas.
3. El tipo de servicio determina los requisitos: mesa para comedor, domicilio confirmado para entrega, o ninguno para llevar.
4. `order-details-modal.tsx` concentra datos del cliente, entrega, total y acciones finales.
5. `order-store.ts` crea o actualiza la orden y sus líneas con protección contra doble envío. En una comanda de comedor con productos de varios negocios, el RPC atómico crea una orden y una cuenta por negocio dentro de la misma visita, con un registro de cliente independiente para cada negocio cuando se capturó teléfono.
   Para pedidos manuales, Mesero persiste junto al borrador un UUID aleatorio antes del envío. Si la respuesta se pierde, `pos-order-recovery.ts` consulta con la sesión autenticada, permisos, licencia y creador; al encontrarlo refresca Estado/Historial y limpia el borrador sin aviso adicional. Si no puede confirmarlo, conserva la misma clave y bloquea otro intento distinto. No guarda teléfono ni domicilio en el borrador. WhatsApp conserva su flujo propio.
6. La orden aparece en Cocina por Realtime y cambia entre `pending`, `in_kitchen`, `ready`, `served`, `paid` o `cancelled`.
7. El cobro se registra en el libro mayor de pagos. El estado operativo de cocina no se usa como sustituto del estado de pago.
8. `business_accounts` se sincroniza con los pagos de sus órdenes. Estado consulta la caja del negocio del pedido y no mezcla cuentas de negocios distintos.

## Flujo de WhatsApp

Este flujo describe el backend heredado. La bandeja `/dashboard/whatsapp` está
oculta y redirige fuera de la sección; el webhook y la automatización continúan
configurados y no se modificaron. Ocultar el acceso no apaga el bot.

1. Meta envía eventos a `src/app/api/integraciones/whatsapp/meta/route.ts`.
2. El runtime valida firma, normaliza teléfono y recibe el mensaje de forma idempotente.
3. `conversation-engine.ts` serializa el procesamiento por conversación y conserva etapa, carrito, dirección, pago y atención humana.
4. `catalog.ts`, `quick-replies.ts` y `customer-messages.ts` generan catálogo, opciones y respuestas en español.
5. `hybrid-interpreter.ts` usa interpretación semántica acotada solo cuando las reglas locales no son suficientes.
6. La confirmación final crea una orden con `source_channel = whatsapp`; si falla una condición de política, se realiza relevo humano conservando el borrador.
7. Mesero puede abrir el borrador desde la bandeja, editarlo y continuar al flujo interno.

La creación automática requiere simultáneamente la bandera de servidor `WHATSAPP_ORDER_CREATION_ENABLED=true` y la configuración persistida `create_orders_enabled=true`. La interfaz debe mostrar el estado técnico sin exponer secretos.

## Domicilios y clientes

- `business_customers` y `business_customer_addresses` son el directorio
  operativo, cada uno filtrado y autorizado por `business_id`. El teléfono es el
  identificador principal dentro del negocio; no hay un perfil global que una
  clientes de locales distintos.
- `orders.business_customer_id` enlaza cada orden con el cliente de ese negocio.
  La comanda de comedor multinegocio conserva una copia de la identidad en cada
  cuenta local; el RPC valida que cada ID corresponda a su negocio.
- Las tablas legacy `customers` y `customer_addresses` permanecen separadas
  para la integración de WhatsApp. El backfill copia su directorio existente a
  Mideli sin borrar ni cambiar las relaciones legacy.
- El nombre es opcional.
- Las direcciones operativas se asocian al cliente y negocio correspondiente;
  pedidos a domicilio las crean o actualizan de forma transaccional.
- Una dirección nueva se conserva como confirmada únicamente después de confirmar el punto.
- Las coordenadas y la distancia se guardan como snapshot de la orden para que el historial no dependa de cambios posteriores.
- Para repartidores externos, el subtotal de productos es el cobro operativo de Mideli; la tarifa de envío se muestra como información para el cliente y la cobra el repartidor aparte.

## Sesión y autenticación

- Supabase persiste la sesión en cookies compartidas entre cliente, servidor y
  proxy: `Path=/`, `SameSite=Lax`, 400 días y `Secure` en producción.
- Si el proxy no logra verificar temporalmente una sesión que conserva su
  cookie, dirige a `/reconectando`. La pantalla intenta renovar con
  `auth.refreshSession()` al abrirse, cada cinco segundos y al volver la red;
  si el refresh token fue revocado o el perfil está desactivado, será necesario
  iniciar sesión de nuevo.
- Cerrar sesión explícitamente sigue revocando el acceso; la persistencia no
  debe interpretarse como una sesión permanente ni sustituye los controles de
  perfil, rol, membresía o licencia.

## Configuración de entregas por negocio

- `business_delivery_settings` mantiene una fila por negocio con el origen
  confirmado en Maps, los rangos de precio por distancia y los recargos con
  alias por colonia. El pedido usa exclusivamente la configuración de su
  `business_id`; no consulta el origen ni las tarifas de otro local.
- El dueño configura su negocio desde **Control → Entregas**. Rincón 404 puede
  abrir el mismo formulario desde la ficha de cada negocio. Las acciones de
  servidor verifican sesión, membresía/capacidad, organización y licencia antes
  de leer, geocodificar o guardar. El navegador no tiene acceso directo a la
  tabla.
- La migración copió a cada negocio activo el origen, 13 rangos y 8 recargos
  vigentes como punto inicial independiente. Al crear negocios nuevos se
  copian rangos/recargos por defecto, pero el origen queda vacío hasta que el
  responsable lo confirme; no se cotiza con la dirección de otro local.
- Esta configuración sirve para el POS multinegocio. El bot legado de
  WhatsApp, exclusivo de Mideli, conserva sus ajustes técnicos globales y no
  envía automáticamente el mensaje manual al repartidor.
- En Estado, el botón manual abre WhatsApp para que una persona revise y envíe
  el texto. Presenta negocio y folio, datos disponibles del cliente, origen y
  destino en bloques separados, cada uno con su enlace de Maps. Muestra el
  teléfono del cliente en formato legible cuando se registró. Solo agrega monto
  cuando el pago es en efectivo; el método indica `+ envío` sin publicar una
  tarifa, total estimado, productos o referencia.

## Impresión de tickets de pedido

- Historial obtiene el pedido y sus asignaciones de cobro mediante una acción
  autenticada y limita cada consulta a negocios legibles y con licencia activa.
- `business_receipt_settings` guarda nombre impreso, dirección, teléfono,
  leyenda final y ancho 48/58 mm; el logo se toma de la identidad visual del
  mismo negocio.
- El ticket diferencia productos antes y después de descuento, tarifa externa
  del repartidor, total del cliente, monto cobrado en el local y saldo de
  productos. No atribuye el total de una transacción compartida a cada orden.
- La impresión usa `window.print()` y estilos de rollo; el sistema operativo y
  el fabricante controlan la selección y conexión de impresora. No hay
  emparejamiento Bluetooth directo desde la web. iPad requiere impresora
  compatible con AirPrint en la misma red Wi‑Fi; Android depende del servicio o
  aplicación de impresión disponible.
- La estación automática para cocina es distinta del ticket comercial y no se
  reutiliza como conexión Bluetooth.

## Scroll y móvil

Las vistas de operación evitan scrolls anidados innecesarios. Cuando un panel necesita desplazamiento propio usa `touch-pan-y`, `overscroll-contain` y `overflow-y-auto`; el CSS global evita que un gesto horizontal del contenido capture la página completa. El fallback global de rueda se instala desde el layout raíz para cubrir dashboard, Menú y administración: sobre una zona estática desplaza la región vertical visible más cercana y permite continuar hacia un contenedor exterior al llegar al límite. Si hay un diálogo modal activo, el desplazamiento queda dentro del diálogo y no mueve el fondo. Los botones operativos táctiles deben conservar una altura mínima de 44 a 48 px.

## Contratos importantes

- Tipos de base de datos: `src/types/database.ts`.
- Tipos de pagos: `src/types/payments.ts`.
- Tipos de caja: `src/types/cash.ts`.
- Totales operativos: `src/lib/order-totals.ts`.
- Semántica visual de tipos y estados: `src/lib/order-visuals.ts`.
- Autorización de funciones: `src/lib/supabase/function-auth.ts`.
- Protección de rutas, sesión y licencia: `src/proxy.ts`.

## Pruebas

Las regresiones principales están en `tests/e2e/`. Playwright ejecuta proyectos de escritorio, tablet táctil y móvil táctil. Las pruebas actuales cubren especialmente WhatsApp, órdenes, políticas, pagos y autenticación de funciones; la validación en hardware real sigue siendo necesaria para PWA, Push, impresión y cobros.
