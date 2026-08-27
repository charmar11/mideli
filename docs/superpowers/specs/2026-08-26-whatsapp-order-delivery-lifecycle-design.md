# Ciclo operativo de pedidos de WhatsApp, cobro y reparto

Fecha: 2026-08-26  
Estado: diseño aprobado verbalmente, pendiente de revisión del documento

## 1. Objetivo

Completar el flujo operativo de los pedidos recibidos por WhatsApp desde su confirmación hasta su recepción, sin confundir el cobro con la entrega y sin perder la capacidad de avisar al cliente.

El sistema debe mantener tres dimensiones independientes:

- Estado de cocina: pendiente, en preparación y listo.
- Estado del pago: pendiente, parcial o pagado.
- Estado del reparto: pendiente, buscando repartidor, en camino o recibido.

Cobrar un pedido a domicilio no debe cambiar su estado de cocina ni retirarlo del seguimiento de reparto.

## 2. Alcance

Incluye:

- Creación idempotente de una orden confirmada por WhatsApp.
- Aparición inmediata y única en Cocina.
- Avisos al cliente al comenzar preparación, terminar preparación y salir el repartidor.
- Seguimiento interno de pedidos buscando repartidor y en camino.
- Datos completos del domicilio y cobro dentro de la tarjeta operativa.
- Separación entre cobrar, entregar y finalizar el seguimiento.
- Cierre automático cuando el cliente confirma que recibió el pedido.
- Finalización manual interna como respaldo, sin mensaje obligatorio al cliente.
- Registro de intentos y reintentos de notificaciones.

No incluye en esta fase:

- Rastreo GPS del repartidor.
- Asignación de repartidores con cuentas propias.
- Mensajes promocionales.
- Programa de lealtad.
- Un CRM completo de clientes. El centro de clientes se diseñará como fase independiente.

## 3. Estados y reglas

### 3.1 Cocina

Se conserva el estado operativo existente de la orden:

- `pending`: recibida y esperando preparación.
- `in_kitchen`: en preparación.
- `ready`: lista para recoger o entregar.
- `served`: entrega finalizada, con saldo pendiente si lo hubiera.
- `paid`: entrega finalizada y pago cubierto.
- `cancelled`: cancelada.

### 3.2 Pago

Se conserva `payment_status` como fuente de verdad del cobro:

- `unpaid` o equivalente vigente.
- `partial`.
- `paid`.

El pago no debe cambiar automáticamente una orden a `served` o `paid` cuando su tipo sea `domicilio`. Solo actualizará el libro mayor y `payment_status`.

Para pedidos `para_llevar`, el botón `Cobrar y entregar` puede seguir finalizando ambas acciones porque suceden juntas en mostrador.

### 3.3 Reparto

Se conserva `delivery_status`:

- `pending`: todavía no está lista.
- `searching_driver`: lista y buscando repartidor.
- `driver_on_way`: el repartidor salió.
- `customer_received`: recepción confirmada.

Una orden a domicilio permanece visible en Estado mientras `delivery_status` sea `searching_driver` o `driver_on_way`, aunque ya esté pagada.

## 4. Flujo funcional

### 4.1 Confirmación del cliente

Cuando el cliente confirma:

1. El servidor valida que el menú, modificadores, domicilio, envío y pago solicitado sigan siendo válidos.
2. Se crea una sola orden usando el identificador externo del mensaje como llave de idempotencia.
3. La orden entra con `status = pending` y `delivery_status = pending`.
4. Aparece una sola vez en Cocina e impresión, conforme a la configuración activa.
5. El cliente recibe: `✅ Pedido #123 confirmado y enviado a cocina.`

Si Meta repite el webhook, se recupera la misma orden y no se crean artículos, impresión ni avisos duplicados.

### 4.2 Preparación

Cuando Cocina pulsa `Preparar`:

1. La orden cambia a `in_kitchen`.
2. Si proviene de WhatsApp y los avisos están activos, se registra el evento `in_preparation`.
3. El cliente recibe una sola vez: `🔥 Tu pedido #123 ya está en preparación.`
4. Si Meta falla, el estado de cocina se conserva y el aviso queda disponible para reintento.

### 4.3 Pedido listo

Cuando Cocina pulsa `Listo`:

- Domicilio:
  - `status = ready`.
  - `delivery_status = searching_driver`.
  - Mensaje: `✅ Tu pedido #123 está listo. Estamos buscando repartidor.`
- Para recoger:
  - `status = ready`.
  - Mensaje: `✅ Tu pedido #123 está listo para recoger.`
- Comedor:
  - Se conserva el flujo interno actual y no se envía seguimiento de reparto.

El cambio de estado y el registro del evento deben ser repetibles sin producir mensajes duplicados.

### 4.4 Cobro de domicilio

La tarjeta de un domicilio mostrará `Cobrar`, no `Cobrar y entregar`.

Después de completar el cobro:

- Se actualizan transacción, formas de pago y `payment_status`.
- La orden conserva `status = ready`.
- La orden conserva su `delivery_status`.
- La tarjeta permanece en Estado.
- El empleado todavía puede pulsar `Repartidor en camino`.

Este comportamiento aplica tanto si el repartidor paga en el local antes de salir como si el pedido ya fue pagado por transferencia.

### 4.5 Repartidor en camino

En Estado, una orden a domicilio con `delivery_status = searching_driver` tendrá el botón `Repartidor en camino`.

Al pulsarlo:

1. Cambia a `driver_on_way`.
2. Se registra el responsable y la hora.
3. El cliente recibe una sola vez: `🛵 Tu pedido #123 va en camino. Ten tu pago listo si elegiste efectivo.`
4. La tarjeta se mueve a la sección `En camino` y no desaparece.

Si el envío del mensaje falla, el pedido permanece en camino y la interfaz muestra el fallo con opción de reintento.

### 4.6 Recepción del cliente

No habrá un paso obligatorio ni un mensaje automático de `Entregado`.

Cuando el cliente escriba una frase inequívoca como `gracias, ya llegó`, `ya recibí` o `ya me lo entregaron`:

1. `delivery_status` cambia a `customer_received`.
2. La conversación se cierra.
3. Si `payment_status = paid`, la orden termina en `paid`.
4. Si conserva saldo, termina en `served` y sigue disponible en pendientes de cobro.
5. Se registra que el cierre provino del cliente.

El reconocimiento debe exigir una intención clara para que un simple `gracias` no cierre por accidente.

### 4.7 Finalización manual de respaldo

Una acción secundaria `Finalizar entrega` estará disponible únicamente cuando el pedido esté `driver_on_way`.

- No enviará un mensaje adicional al cliente.
- Pedirá confirmación para evitar toques accidentales.
- Registrará usuario, fecha y origen manual.
- Finalizará en `paid` si está pagado o en `served` si mantiene saldo.
- Los saldos pendientes seguirán visibles en el módulo de cuentas por cobrar.

## 5. Tarjeta operativa de reparto

Las órdenes a domicilio listas mostrarán:

- Folio y tiempo transcurrido.
- Nombre del cliente, si existe.
- Teléfono.
- Dirección escrita por el cliente.
- Referencia del domicilio.
- Distancia y costo de envío.
- Método de pago solicitado.
- Cantidad con la que pagará y cambio esperado, cuando aplique.
- Estado del pago.
- Abrir en Google Maps.
- Copiar dirección y referencia para compartirlas en el grupo de repartidores.
- Cobrar, si existe saldo.
- Repartidor en camino o Finalizar entrega, según el estado.

En móvil, la información principal permanecerá visible y los datos secundarios podrán abrirse en un detalle sin saturar la tarjeta.

## 6. Organización en Estado

La pantalla tendrá secciones separadas:

1. `Listos para entregar`: para llevar, comedor y domicilios que todavía no buscan reparto si existiera una excepción.
2. `Buscando repartidor`: domicilios `searching_driver`.
3. `En camino`: domicilios `driver_on_way`.
4. `En preparación`: pedidos `pending` e `in_kitchen`.

El pago nunca será el criterio para retirar una orden de las secciones de reparto.

## 7. Errores y concurrencia

- Cada acción tendrá estado de carga para impedir dobles pulsaciones.
- Los eventos de WhatsApp conservarán una llave única por orden y tipo de evento.
- Repetir `Preparar`, `Listo` o `Repartidor en camino` devolverá el estado existente sin duplicar mensajes.
- Un fallo de WhatsApp no revertirá el estado real del pedido.
- Los fallos quedarán registrados con detalle limitado y botón de reintento.
- La interfaz no afirmará `cliente notificado` cuando el aviso esté desactivado, duplicado o haya fallado.
- Si dos dispositivos actúan a la vez, el servidor validará la transición desde el estado anterior permitido.

## 8. Permisos y auditoría

- Cocina, mesero, supervisor, administrador y propietario pueden avanzar preparación y reparto conforme a sus vistas actuales.
- El cobro conserva las reglas de caja y autorizaciones existentes.
- Cada cambio de reparto registra actor, estado anterior, estado nuevo, fecha y origen (`cliente` o `manual`).
- Solo propietario y administrador pueden reintentar masivamente avisos; el personal puede reintentar el aviso del pedido que opera.

## 9. Estrategia de implementación

### Fase 1. Pruebas de regresión

- Reproducir que cobrar un domicilio listo lo elimina actualmente.
- Crear pruebas para la separación de pago, cocina y reparto.
- Cubrir domicilio pagado antes de salir, transferencia y pago parcial.

### Fase 2. Ciclo de estado

- Retirar la llamada automática a entrega después de cobrar un domicilio.
- Centralizar las transiciones válidas de reparto en acciones del servidor.
- Finalizar la orden al recibir confirmación del cliente o mediante respaldo manual.

### Fase 3. Interfaz operativa

- Dividir Estado en `Buscando repartidor` y `En camino`.
- Completar la tarjeta con cliente, domicilio, pago, Maps y copiar dirección.
- Cambiar las etiquetas y acciones según tipo y estado.

### Fase 4. Avisos y reintentos

- Verificar los tres avisos reales con Meta.
- Corregir mensajes de éxito cuando el envío esté desactivado o falle.
- Exponer reintento desde el pedido y diagnóstico administrativo.

### Fase 5. Piloto controlado

- Probar primero con el número autorizado.
- Confirmar que una orden aparezca una sola vez en Cocina e impresión.
- Ejecutar un domicilio completo, incluido cobro antes de marcar al repartidor.
- Revisar historial, conversación, caja y saldos pendientes.
- Desplegar conservando un interruptor para detener avisos o creación de pedidos.

## 10. Criterios de aceptación

- Cobrar un domicilio no lo oculta ni lo marca entregado.
- El pedido permanece visible después del cobro.
- Se puede marcar `Repartidor en camino` antes o después de cobrar.
- Cada cambio envía como máximo un aviso por WhatsApp.
- La tarjeta muestra dirección, referencia, teléfono, pago y cambio.
- Maps y copiar dirección funcionan en móvil.
- La recepción del cliente cierra el seguimiento sin exigir un botón.
- Existe finalización manual segura cuando el cliente no responde.
- Una entrega con saldo pendiente sigue localizable para cobrar.
- Cocina, impresión, inventario y caja no reciben duplicados.

## 11. Trabajo posterior separado

El centro de clientes se planificará después de estabilizar este flujo. Reutilizará `customers`, `customer_addresses`, pedidos y conversaciones para ofrecer búsqueda, perfil, historial, gasto y domicilios sin mezclar esa interfaz con la operación urgente de reparto.
