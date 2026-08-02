# Plan de implementación del flujo unificado de cobro

Especificación: `docs/superpowers/specs/2026-08-01-unified-payment-and-receipt-flow-design.md`

## 1. Libro mayor y compatibilidad de pedidos

- Crear una migración imperativa con tablas de transacciones, métodos y asignaciones.
- Añadir `payment_status` y `paid_amount` a pedidos, con respaldo para datos existentes.
- Mantener el estado operativo separado del estado de pago para permitir prepago sin ocultar pedidos de cocina.
- Crear índices para folio, fecha, orden, usuario y transacciones activas.
- Activar RLS y limitar escritura a funciones transaccionales.
- Verificación: esquema limpio, saldos existentes correctos y consultas de permisos por rol.

## 2. Funciones financieras seguras

- Crear funciones privadas para confirmar y anular pagos con bloqueos de fila e idempotencia.
- Crear funciones públicas `SECURITY INVOKER` como entrada a la API.
- Validar sumas, efectivo, descuentos, saldos y concurrencia dentro de PostgreSQL.
- Crear almacenamiento privado y funciones para PIN administrativo, intentos y autorizaciones de un solo uso.
- Verificación: pagos completos, combinados, parciales, repetidos, concurrentes, anulados y denegados.

## 3. Tipos y acceso a datos

- Extender tipos de pedidos con estado y saldo de pago.
- Añadir tipos de transacción, método, asignación y ticket.
- Crear acciones compartidas para obtener cuentas abiertas, tickets y autorizar descuentos.
- Crear un store de pagos con operaciones mínimas y actualización del store de pedidos.
- Verificación: TypeScript estricto y regresiones de pedidos existentes.

## 4. Flujo táctil reutilizable

- Crear `PaymentFlow` como panel central en tableta y hoja inferior en móvil.
- Implementar resumen, descuento, división igual, división por productos, propina, método único y combinado.
- Crear teclado numérico y cantidades sugeridas.
- Mostrar una sola acción principal por paso y mantener saldo visible.
- Añadir estados de carga, error, reintento e idempotencia.
- Verificación: escenarios táctiles en 390, 768, 1024 y 1440 px.

## 5. Ticket y reimpresión

- Crear una vista de ticket basada en el snapshot confirmado.
- Añadir previsualización de 58 y 80 mm y persistir preferencia local.
- Añadir CSS de impresión aislado, sin descarga PDF.
- Mostrar marca de reimpresión y estado anulado.
- Verificación: ticket original, combinado, dividido, con descuento, con propina y reimpresión.

## 6. Integraciones operativas

- Estado: acciones adaptativas por tipo y cuenta completa por mesa.
- Historial: pendientes por saldo, cobro compartido, lista de tickets, reimpresión y anulación administrativa.
- Confirmación de pedido: `Cobrar y enviar` para llevar y domicilio.
- Personal: configuración de PIN para dueño y administradores.
- Pedidos: entregar un pedido prepagado lo cierra sin perderlo en cocina antes de tiempo.
- Verificación: recorrido de pedido a cocina, entrega, cobro y ticket.

## 7. Analíticas

- Consultar transacciones completadas y anuladas.
- Separar propinas, descuentos, pagos combinados y saldo pendiente.
- Mantener ventas de alimentos sin propina.
- Verificación: totales equivalentes al libro mayor para un rango de fechas.

## 8. Validación final

- Ejecutar pruebas SQL y de permisos con usuarios temporales.
- Ejecutar pruebas Playwright del flujo principal y variantes.
- Revisar capturas en escritorio, tableta y móvil en una sola pasada.
- Ejecutar detector visual una vez y corregir hallazgos en un lote.
- Ejecutar `npm run lint` y `npm run build`.
- Ejecutar `supabase db lint`, advisors y lista de migraciones.
- Limpiar datos temporales y dejar `localhost:3000` funcionando.

