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
5. `order-store.ts` crea o actualiza la orden y sus líneas con protección contra doble envío.
6. La orden aparece en Cocina por Realtime y cambia entre `pending`, `in_kitchen`, `ready`, `served`, `paid` o `cancelled`.
7. El cobro se registra en el libro mayor de pagos. El estado operativo de cocina no se usa como sustituto del estado de pago.

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
