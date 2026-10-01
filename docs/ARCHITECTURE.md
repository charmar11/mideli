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
Dipping en esta fase. La comanda mixta soporta comedor con una orden y cuenta
separadas por negocio. Los pedidos mixtos de domicilio y para llevar siguen
bloqueados hasta implementar un RPC atómico y definir el tratamiento de la
tarifa externa de entrega.

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
encontró 1,138 tickets anteriores, pero la última revisión documentada de
`legacy_sales_tickets` encontró cero filas de Just Dipping: la importación de
esos tickets sigue pendiente. Cuando se importen, quedarán fuera de ventas,
caja y reportes operativos. Antes del piloto hay que verificar catálogo,
inventario y permisos con el dueño.

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
Preparando y Listo cuando la cuenta tenga el permiso explícito de preparación
del negocio; operar pedidos por sí solo no concede ese permiso.

## Mapa de módulos

| Módulo | Interfaz | Estado y lógica |
|---|---|---|
| Mesero | `src/app/dashboard/mesero`, `src/components/pos/` | `mesero-view.tsx`, `cart-store.ts`, `order-store.ts` |
| Cocina | `src/app/dashboard/cocina` | `cocina-view.tsx`, órdenes Realtime y audio local |
| Estado | `src/components/dashboard/status-view.tsx` | `order-store.ts`, acciones de estado |
| Historial | `src/components/dashboard/sales-history.tsx` | acciones de ventas, pagos y snapshots |
| Caja | `src/app/settings/caja`, `src/components/cash/` | `cash-shift-store.ts`, libro de caja y RPCs |
| Pagos | `src/components/payments/` | libro mayor de pagos y autorizaciones |
| Menú | `src/app/menu`, `src/components/admin/` | `catalog-store.ts`, categorías y modificadores |
| Mesas | `src/app/settings/mesas`, `src/components/tables/` | `tables-store.ts`, mapa normalizado |
| Inventario | `src/app/settings/inventario` | `inventory-store.ts`, recetas y movimientos |
| WhatsApp | `src/app/dashboard/whatsapp`, `src/components/whatsapp/` | `src/lib/whatsapp/`, conversaciones y clientes |
| PWA | layout, manifest y service worker | `src/app/sw.ts`, `src/lib/push-notifications.ts` |

## Flujo de una orden interna

1. `mesero-view.tsx` carga catálogo, mesas y órdenes activas en paralelo.
2. `cart-store.ts` conserva el pedido local, sus modificadores y notas.
3. El tipo de servicio determina los requisitos: mesa para comedor, domicilio confirmado para entrega, o ninguno para llevar.
4. `order-details-modal.tsx` concentra datos del cliente, entrega, total y acciones finales.
5. `order-store.ts` crea o actualiza la orden y sus líneas con protección contra doble envío. En una comanda de comedor con productos de varios negocios, el RPC atómico crea una orden y una cuenta por negocio dentro de la misma visita.
   Para pedidos manuales, Mesero persiste junto al borrador un UUID aleatorio antes del envío. Si la respuesta se pierde, `pos-order-recovery.ts` consulta con la sesión autenticada, permisos, licencia y creador; al encontrarlo refresca Estado/Historial y limpia el borrador sin aviso adicional. Si no puede confirmarlo, conserva la misma clave y bloquea otro intento distinto. No guarda teléfono ni domicilio en el borrador. WhatsApp conserva su flujo propio.
6. La orden aparece en Cocina por Realtime y cambia entre `pending`, `in_kitchen`, `ready`, `served`, `paid` o `cancelled`.
7. El cobro se registra en el libro mayor de pagos. El estado operativo de cocina no se usa como sustituto del estado de pago.
8. `business_accounts` se sincroniza con los pagos de sus órdenes. Estado consulta la caja del negocio del pedido y no mezcla cuentas de negocios distintos.

## Flujo de WhatsApp

1. Meta envía eventos a `src/app/api/integraciones/whatsapp/meta/route.ts`.
2. El runtime valida firma, normaliza teléfono y recibe el mensaje de forma idempotente.
3. `conversation-engine.ts` serializa el procesamiento por conversación y conserva etapa, carrito, dirección, pago y atención humana.
4. `catalog.ts`, `quick-replies.ts` y `customer-messages.ts` generan catálogo, opciones y respuestas en español.
5. `hybrid-interpreter.ts` usa interpretación semántica acotada solo cuando las reglas locales no son suficientes.
6. La confirmación final crea una orden con `source_channel = whatsapp`; si falla una condición de política, se realiza relevo humano conservando el borrador.
7. Mesero puede abrir el borrador desde la bandeja, editarlo y continuar al flujo interno.

La creación automática requiere simultáneamente la bandera de servidor `WHATSAPP_ORDER_CREATION_ENABLED=true` y la configuración persistida `create_orders_enabled=true`. La interfaz debe mostrar el estado técnico sin exponer secretos.

## Domicilios y clientes

- El teléfono es el identificador operativo principal del cliente.
- El nombre es opcional.
- Las direcciones se asocian a `customers` y se deduplican por el resultado canónico de Maps.
- Una dirección nueva se conserva como confirmada únicamente después de confirmar el punto.
- Las coordenadas y la distancia se guardan como snapshot de la orden para que el historial no dependa de cambios posteriores.
- Para repartidores externos, el subtotal de productos es el cobro operativo de Mideli; la tarifa de envío se muestra como información para el cliente y la cobra el repartidor aparte.

## Scroll y móvil

Las vistas de operación evitan scrolls anidados innecesarios. Cuando un panel necesita desplazamiento propio usa `touch-pan-y`, `overscroll-contain` y `overflow-y-auto`; el CSS global evita que un gesto horizontal del contenido capture la página completa. Los botones operativos táctiles deben conservar una altura mínima de 44 a 48 px.

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
