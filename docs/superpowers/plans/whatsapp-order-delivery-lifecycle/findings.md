# Hallazgos: pedidos de WhatsApp, cobro y reparto

Fecha: 2026-08-26

## Causa raíz confirmada

En `src/components/dashboard/status-view.tsx`, `handlePaymentCompleted` llama `handleDeliver` después de un cobro completo para cualquier pedido no comedor que esté listo. `handleDeliver` usa `markAsServed`; cuando `payment_status` ya es `paid`, la orden cambia a `paid` y sale de `activeOrders`. Por eso desaparece antes de pulsar `Repartidor en camino`.

## Infraestructura existente que debe reutilizarse

- `orders.delivery_status` ya soporta `pending`, `searching_driver`, `driver_on_way` y `customer_received`.
- `orders.payment_status` ya está separado del estado operativo.
- `whatsapp_notification_events` ya evita eventos duplicados por orden y tipo.
- `notifyWhatsappOrderStatusAction` ya envía preparación y listo.
- `markWhatsappDriverOnWayAction` ya existe.
- Cocina ya llama el aviso cuando cambia a `in_kitchen` o `ready`.
- Estado ya muestra un botón básico de repartidor en camino.
- `markConversationCustomerReceived` ya cierra conversaciones, pero todavía no finaliza correctamente `orders.status` según el pago.
- `customers` y `customer_addresses` ya existen; el CRM queda fuera de esta fase.
- La creación externa de órdenes ya es idempotente mediante `source_channel + external_order_id`.

## Decisiones aprobadas

- Cobro, cocina y reparto son estados independientes.
- Domicilio usa `Cobrar`, no `Cobrar y entregar`.
- Para llevar conserva `Cobrar y entregar`.
- Listo en domicilio activa automáticamente `Buscando repartidor`.
- `Repartidor en camino` es manual.
- No existe un paso obligatorio de entregado para el cliente.
- Una confirmación clara del cliente finaliza automáticamente.
- Existe finalización manual interna como respaldo.
- No habrá GPS ni cuentas de repartidores en esta fase.

## Riesgos que OpenCode debe vigilar

- No marcar `paid` solo por cobrar un domicilio.
- No perder saldos pendientes al finalizar la entrega.
- No mostrar éxito cuando Meta no envió el aviso.
- No repetir mensajes al recibir webhooks o pulsaciones duplicadas.
- No cerrar por un simple `gracias` ni por frases negativas.
- No regresar una entrega de `driver_on_way` a `searching_driver`.
- No afectar pedidos POS o para llevar.
- No crear una segunda fuente de verdad para pagos o notificaciones.

