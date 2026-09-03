# Plan ejecutable para OpenCode: pedidos de WhatsApp, cobro y reparto

Fecha de preparación: 2026-08-26  
Estado inicial: pendiente de implementación  
Especificación aprobada: `docs/superpowers/specs/2026-08-26-whatsapp-order-delivery-lifecycle-design.md`  
Checkpoint estable: `checkpoint-before-opencode-2026-08-26` (`e8df3dd`)

## 0. Contrato de ejecución

OpenCode debe ejecutar este plan en orden y sin ampliar el alcance.

Reglas obligatorias:

1. Leer primero `AGENTS.md`, `.opencode/plans/mideli-context.md`, la especificación aprobada y este plan completo.
2. Ejecutar `git status --short` antes de editar. Conservar cambios ajenos y no limpiar archivos sin autorización.
3. No usar `git reset --hard`, `git checkout --`, `git clean` ni restaurar el checkpoint salvo petición explícita del usuario.
4. No leer, imprimir, copiar ni solicitar valores de `.env.local`.
5. No modificar cobros, caja, inventario, impresión o pedidos normales más allá de las conexiones descritas aquí.
6. No cambiar textos, estilos o navegación sin relación con seguimiento de domicilio.
7. No crear un CRM, rastreo GPS ni módulo de repartidores en esta fase.
8. Implementar mediante pruebas de regresión: primero hacer fallar el caso, después corregirlo.
9. Hacer commits pequeños al terminar cada fase estable. No incluir `.superpowers/` ni archivos temporales.
10. No desplegar a Vercel hasta que todas las pruebas pasen y el usuario autorice el despliegue.

## 1. Resultado esperado

Al terminar:

- Una orden confirmada por WhatsApp aparece una sola vez en Cocina.
- `Preparar` envía una sola notificación de preparación.
- `Listo` mueve un domicilio a `searching_driver` y avisa que se busca repartidor.
- Cobrar un domicilio no lo entrega, no lo oculta y no modifica `delivery_status`.
- El pedido puede cobrarse antes o después de pulsar `Repartidor en camino`.
- `Repartidor en camino` mueve la tarjeta a una sección propia y envía un solo mensaje.
- La tarjeta contiene teléfono, domicilio, referencia, envío, pago y cambio.
- El cliente puede confirmar recepción con una frase clara.
- Existe `Finalizar entrega` como respaldo interno después de que el repartidor salió.
- Una orden pagada termina en `paid`; una orden con saldo termina en `served` y conserva su deuda.
- Los fallos de Meta no revierten estados y pueden reintentarse.

## 2. Modelo de estados que no debe alterarse

Usar las columnas existentes; no añadir columnas salvo que una prueba demuestre que es indispensable.

### Cocina y operación: `orders.status`

- `pending`
- `in_kitchen`
- `ready`
- `served`
- `paid`
- `cancelled`

### Pago: `orders.payment_status`

- `unpaid`
- `partial`
- `paid`

### Reparto: `orders.delivery_status`

- `pending`
- `searching_driver`
- `driver_on_way`
- `customer_received`

Invariante principal:

> En pedidos `domicilio`, registrar un pago nunca debe cambiar `orders.status` ni `orders.delivery_status`.

La finalización de la entrega es la única que decide entre `paid` y `served` usando `payment_status`.

## 3. Archivos principales

Modificar solamente cuando corresponda:

- `src/components/dashboard/status-view.tsx`
- `src/components/dashboard/cocina-view.tsx`
- `src/lib/stores/order-store.ts`
- `src/lib/actions/whatsapp-order-status.ts`
- `src/lib/whatsapp/repository.server.ts`
- `src/lib/whatsapp/conversation-engine.ts`
- `src/types/database.ts` solo si faltan tipos, no para cambiar el esquema.
- `tests/e2e/whatsapp-conversation.spec.ts`
- `tests/e2e/whatsapp-operations.spec.ts`
- Nuevo: `src/lib/whatsapp/delivery-lifecycle.ts`
- Nuevo: `tests/e2e/whatsapp-delivery-lifecycle.spec.ts`

Consultar sin modificar salvo necesidad demostrada:

- `src/components/payments/payment-flow.tsx`
- `src/types/payments.ts`
- `supabase/migrations/20260826034911_whatsapp_order_channel.sql`
- `supabase/migrations/20260826062139_whatsapp_channel_operations.sql`
- `supabase/migrations/20260827011009_whatsapp_conversation_processing_leases.sql`

No debe ser necesario cambiar `PaymentFlow`: el error está en el callback de Estado que entrega después de cobrar.

## 4. Fase 1: línea base y reproducción

### 4.1 Proteger el estado inicial

Ejecutar:

```powershell
git status --short
git log -5 --oneline --decorate
git show --no-patch checkpoint-before-opencode-2026-08-26
```

Registrar resultados en `progress.md`. El checkpoint es referencia, no una orden para restaurar.

### 4.2 Confirmar la causa actual

Verificar en `src/components/dashboard/status-view.tsx`:

- `handlePaymentCompleted` llama `handleDeliver` para cualquier pedido no comedor que está listo y queda totalmente pagado.
- `handleDeliver` llama `markAsServed`.
- `markAsServed` cambia el estado operativo a `paid` si el pago está cubierto.
- `updateOrderStatus` filtra estados finales de `activeOrders`.

Resultado de diagnóstico esperado: el cobro de domicilio está acoplado a entrega y por eso la tarjeta desaparece.

### 4.3 Ejecutar línea base

```powershell
npm run lint
npm run build
npx playwright test tests/e2e/whatsapp-conversation.spec.ts tests/e2e/whatsapp-operations.spec.ts tests/e2e/whatsapp-order-creation-policy.spec.ts --project=desktop
```

No continuar si falla una prueba que no esté relacionada con el nuevo caso. Registrar el fallo antes de tocar código.

## 5. Fase 2: reglas puras y pruebas rojas

### 5.1 Crear `delivery-lifecycle.ts`

Crear un módulo puro, sin Supabase, React ni `server-only`. Debe concentrar decisiones reutilizables y ser fácil de probar.

Tipos sugeridos:

```ts
export type DeliveryBucket =
  | "preparing"
  | "ready"
  | "searching_driver"
  | "driver_on_way"
  | "completed";

export type DeliveryCompletionSource = "customer" | "manual";
```

Funciones mínimas:

```ts
deliveryBucketForOrder(order): DeliveryBucket
shouldCompleteAfterPayment(order): boolean
finalOrderStatusForPayment(paymentStatus): "paid" | "served"
canMarkDriverOnWay(order): boolean
canFinalizeDelivery(order): boolean
```

Reglas:

- `shouldCompleteAfterPayment` devuelve `false` para `domicilio`.
- Para `para_llevar` listo y pago completo conserva la finalización actual.
- `deliveryBucketForOrder` prioriza `delivery_status` en domicilios de WhatsApp.
- `finalOrderStatusForPayment("paid")` devuelve `paid`; cualquier saldo devuelve `served`.
- Solo se puede marcar en camino desde `searching_driver`; repetir sobre `driver_on_way` será idempotente en servidor.
- Solo se puede finalizar manualmente desde `driver_on_way`.

### 5.2 Crear pruebas rojas

Nuevo archivo: `tests/e2e/whatsapp-delivery-lifecycle.spec.ts`.

Casos mínimos:

1. Domicilio listo y pagado no debe completarse por el pago.
2. Domicilio listo y no pagado tampoco se completa por el pago.
3. Para llevar listo y pagado conserva `Cobrar y entregar`.
4. Domicilio `searching_driver` cae en la sección buscando repartidor.
5. Domicilio `driver_on_way` cae en la sección en camino.
6. Pago `paid` finaliza en `paid`.
7. Pago `unpaid` o `partial` finaliza en `served`.
8. No se puede finalizar manualmente antes de `driver_on_way`.

Ejecutar solo esta prueba y comprobar que falle por la funcionalidad ausente antes de implementarla.

```powershell
npx playwright test tests/e2e/whatsapp-delivery-lifecycle.spec.ts --project=desktop
```

### 5.3 Commit de reglas

Cuando las pruebas puras pasen:

```powershell
git add src/lib/whatsapp/delivery-lifecycle.ts tests/e2e/whatsapp-delivery-lifecycle.spec.ts
git commit -m "test: define WhatsApp delivery lifecycle"
```

No incluir otros archivos en este commit.

## 6. Fase 3: desacoplar cobro y entrega

Archivo: `src/components/dashboard/status-view.tsx`.

### 6.1 Corregir `handlePaymentCompleted`

Reemplazar la condición genérica por una decisión basada en `shouldCompleteAfterPayment`.

Comportamiento:

- Siempre cerrar o completar correctamente el flujo visual de pago según el comportamiento actual de `PaymentFlow`.
- Volver a cargar pedidos después de cobrar para actualizar `paid_amount` y la insignia de pago.
- Si es `domicilio`, no llamar `handleDeliver`.
- Si es `para_llevar`, está `ready` y quedó totalmente cubierto, conservar `handleDeliver`.
- Si es comedor, conservar la lógica actual de cuenta.

No modificar las transacciones ni el libro mayor.

### 6.2 Corregir etiquetas

- Domicilio con saldo: `Cobrar`.
- Para llevar con saldo: `Cobrar y entregar`.
- Comedor con saldo: `Cobrar $X`.
- Pagado: mostrar `Pagado`; no mostrar un espacio vacío que rompa la cuadrícula.

### 6.3 Prueba de regresión obligatoria

Agregar una prueba que represente:

1. Pedido WhatsApp a domicilio, `status = ready`, `delivery_status = searching_driver`.
2. Cobro completo.
3. El pedido conserva `status = ready`.
4. Conserva `delivery_status = searching_driver`.
5. Sigue dentro de `activeOrders` y en la sección de reparto.
6. El botón `Repartidor en camino` sigue disponible.

Si probar el componente completo requiere demasiada infraestructura, cubrir la decisión con la función pura y añadir una comprobación estática focalizada del callback. No introducir un framework nuevo solo para esta prueba.

### 6.4 Commit

```powershell
git add src/components/dashboard/status-view.tsx tests/e2e/whatsapp-delivery-lifecycle.spec.ts
git commit -m "fix: keep paid deliveries visible for dispatch"
```

## 7. Fase 4: endurecer transiciones de reparto

Archivo principal: `src/lib/actions/whatsapp-order-status.ts`.

### 7.1 Autorización

Cambiar `requireStaff` para devolver como mínimo `userId` y `role`, sin debilitar las reglas actuales.

Roles permitidos:

- `owner`
- `admin`
- `supervisor`
- `waiter`
- `kitchen`

No aceptar identificadores de actor enviados por el cliente; obtener siempre el usuario desde Supabase Auth.

### 7.2 Resultado normalizado

Las acciones deben distinguir:

```ts
type WhatsappNoticeResult = {
  success: boolean;
  stateChanged: boolean;
  sent: boolean;
  reason?:
    | "not_whatsapp"
    | "notifications_disabled"
    | "duplicate"
    | "invalid_transition"
    | "send_failed";
  error?: string;
};
```

La interfaz no debe afirmar que notificó al cliente si `sent` es `false`.

### 7.3 Preparar

Mantener `notifyWhatsappOrderStatusAction(orderId, "in_kitchen")` idempotente:

- Solo pedidos de WhatsApp generan evento.
- Insertar `in_preparation` una vez.
- Si ya existe, devolver `duplicate` sin fallar.
- Si los avisos están apagados, devolver `notifications_disabled` sin revertir Cocina.

### 7.4 Listo

Para `status = ready` y tipo `domicilio`:

- Actualizar `delivery_status` a `searching_driver` únicamente si estaba `pending` o ya estaba `searching_driver`.
- No regresar de `driver_on_way` a buscando repartidor.
- Registrar el aviso `ready_searching_driver` una sola vez.
- Si dos dispositivos pulsan Listo, la segunda ejecución debe ser idempotente.

Para `para_llevar`, enviar el mismo tipo de evento con el texto de recoger, sin modificar `delivery_status`.

### 7.5 Repartidor en camino

Mejorar `markWhatsappDriverOnWayAction`:

- Exigir pedido de WhatsApp, tipo domicilio y `status = ready`.
- Transición válida: `searching_driver -> driver_on_way`.
- Si ya está `driver_on_way`, no repetir el mensaje y devolver `duplicate`.
- Si está `pending` o `customer_received`, devolver `invalid_transition`.
- Insertar auditoría en `whatsapp_admin_audit`:
  - `action = delivery_status_change`
  - `entity_type = order`
  - `entity_id = orderId`
  - metadata con `from`, `to`, `origin = staff` y rol.
- Enviar `driver_on_way` una sola vez.

Usar actualizaciones condicionales con `.eq()` para evitar que dos dispositivos avancen desde estados distintos. Volver a consultar la fila cuando una actualización condicional no devuelva datos.

### 7.6 Fallos de Meta

- Cambiar primero el estado operativo.
- Registrar el evento de notificación.
- Intentar enviar.
- Si Meta falla, conservar el estado y marcar evento `failed`.
- No esconder el error detrás de un `success: true` ambiguo.
- Conservar `retryWhatsappNotificationAction` y verificar que incremente `attempts`.

### 7.7 Pruebas

Cubrir:

- Doble pulsación de Listo.
- Doble pulsación de Repartidor en camino.
- Avisos desactivados.
- Meta falla después de cambiar estado.
- Transición inválida desde `pending`.
- Pedido que no proviene de WhatsApp.

No enviar mensajes reales durante pruebas automatizadas.

## 8. Fase 5: recepción y finalización

### 8.1 Intención del cliente

Archivos:

- `src/lib/whatsapp/conversation-engine.ts`
- `tests/e2e/whatsapp-conversation.spec.ts`

Endurecer `confirmsArrival`.

Debe aceptar frases claras:

- `ya llegó`
- `ya me llegó`
- `ya llegó el pedido`
- `recibí el pedido`
- `ya recibí`
- `ya me lo entregaron`
- `gracias, ya llegó`

No debe aceptar:

- `gracias`
- `gracias por avisar`
- `todavía no llega`
- `no ha llegado`
- `cuando llegue te aviso`

Normalizar acentos mediante las utilidades existentes. Evaluar negaciones antes de coincidencias positivas.

### 8.2 Finalización por cliente

Archivo: `src/lib/whatsapp/repository.server.ts`.

Modificar `markConversationCustomerReceived`:

1. Consultar pedidos de WhatsApp a domicilio asociados a la conversación.
2. Ignorar pedidos ya `customer_received`.
3. Establecer `delivery_status = customer_received`.
4. Establecer `status = paid` cuando `payment_status = paid`.
5. Establecer `status = served` cuando exista saldo.
6. Insertar auditoría con actor nulo y `origin = customer`.
7. Cerrar la conversación y desactivar el bot para esa conversación.
8. Hacer la operación idempotente si Meta repite el mensaje.

No borrar mensajes, direcciones ni pedidos.

Si la actualización múltiple no puede quedar consistente mediante consultas normales, crear una función SQL transaccional en una migración nueva. Solo hacerlo después de demostrar la necesidad. Nunca editar migraciones ya aplicadas.

### 8.3 Finalización manual

Archivo: `src/lib/actions/whatsapp-order-status.ts`.

Crear:

```ts
finalizeWhatsappDeliveryAction(orderId: string)
```

Reglas:

- Autenticación obligatoria.
- Solo WhatsApp + domicilio.
- Solo desde `driver_on_way`.
- Cambiar `delivery_status` a `customer_received`.
- Cambiar estado final según `payment_status`.
- Registrar actor y `origin = manual`.
- No enviar ningún mensaje de entregado.
- Ser idempotente si ya fue finalizado.

### 8.4 Saldo pendiente

Comprobar que una orden finalizada en `served` siga apareciendo en el flujo existente de pendientes de cobro y pueda cobrarse posteriormente. No crear un segundo sistema de deuda.

## 9. Fase 6: rediseñar Estado sin rehacer la aplicación

Archivo: `src/components/dashboard/status-view.tsx`.

No convertir la pantalla completa a una arquitectura nueva. Extraer componentes locales solo si reduce complejidad:

- `DeliveryOrderCard`
- `DeliveryDetails`
- `DeliveryActions`

Si se extraen, ubicarlos bajo `src/components/dashboard/` y mantener interfaces pequeñas.

### 9.1 Secciones

Derivar listas sin duplicados:

1. `Buscando repartidor`
   - `source_channel = whatsapp`
   - `type = domicilio`
   - `status = ready`
   - `delivery_status = searching_driver`
2. `En camino`
   - mismas condiciones, pero `delivery_status = driver_on_way`
3. `Listos para entregar`
   - listos que no pertenecen a las dos secciones anteriores.
4. `En preparación`
   - `pending` e `in_kitchen`.

Una orden debe pertenecer a una sola sección.

### 9.2 Información de tarjeta

Mostrar:

- `#folio`
- tiempo transcurrido
- cliente o `Cliente de WhatsApp`
- teléfono formateado para lectura, sin modificar el valor almacenado
- dirección
- referencia, solo si existe
- envío con `delivery_fee`
- método solicitado
- `requested_cash_tendered`
- cambio estimado: `requested_cash_tendered - total`, nunca negativo
- estado de pago y saldo

No mostrar datos inexistentes como `undefined`, `$NaN` o renglones vacíos.

### 9.3 Maps y copiar

- `Abrir en Maps`: enlace a `https://www.google.com/maps/search/?api=1&query=...` con dirección codificada.
- `Copiar dirección`: copiar dirección y referencia en un texto listo para pegar en el grupo.
- Mostrar toast de éxito o error.
- En móvil, botones táctiles de al menos 44 px.

No añadir una API nueva ni cobrar una consulta de Maps para abrir la dirección.

### 9.4 Acciones por estado

Buscando repartidor:

- Cobrar, si hay saldo.
- Repartidor en camino.
- Abrir Maps.
- Copiar dirección.

En camino:

- Cobrar, si hay saldo.
- Indicador `Repartidor en camino`.
- Acción secundaria `Finalizar entrega`.
- Abrir Maps.
- Copiar dirección.

Para llevar:

- Conservar `Entregar`.
- Conservar `Cobrar y entregar` si hay saldo.

### 9.5 Confirmación manual

`Finalizar entrega` debe abrir una confirmación que explique:

- No se enviará mensaje al cliente.
- El pedido saldrá del seguimiento de reparto.
- Si mantiene saldo, seguirá pendiente de cobro.

No cerrar este diálogo al tocar fuera si se reutiliza un modal sensible.

### 9.6 Estados de carga

Mantener un identificador por acción, no un único booleano global:

- `payingOrderId`
- `driverOrderId`
- `finalizingOrderId`

Desactivar solo la tarjeta afectada. Actualizar con `fetchActiveOrders()` después de cada acción.

## 10. Fase 7: Cocina y comunicación de fallos

Archivos:

- `src/lib/stores/order-store.ts`
- `src/components/dashboard/cocina-view.tsx`

### 10.1 Resultado de actualización

Extender de forma compatible el resultado de `updateOrderStatus` para incluir el resultado del aviso de WhatsApp cuando aplique, sin romper consumidores existentes.

Ejemplo conceptual:

```ts
{
  error: string | null;
  whatsappNotice?: {
    sent: boolean;
    reason?: string;
  };
}
```

No bloquear la interacción de Cocina esperando indefinidamente a Meta. Usar la acción del servidor con un límite razonable ya establecido por el proveedor.

### 10.2 Toasts correctos

- Estado y aviso exitosos: toast normal.
- Estado exitoso, avisos apagados: no mostrar error; indicar `Avisos de WhatsApp desactivados` solo si aporta valor.
- Estado exitoso, envío fallido: advertir `Pedido actualizado; aviso pendiente de reintento`.
- No mostrar `cliente notificado` para `duplicate`, `disabled` o `failed`.

### 10.3 No afectar Cocina normal

Pedidos POS, comedor y para llevar sin conversación de WhatsApp deben conservar exactamente su flujo actual.

## 11. Fase 8: diagnóstico y reintentos

La interfaz administrativa de WhatsApp ya lista fallos. Completar únicamente lo necesario:

- Mostrar folio, tipo de aviso, intentos, último error y fecha.
- Reintentar un evento fallido.
- Después del reintento exitoso, retirarlo de fallos sin recargar toda la aplicación.
- No permitir reenviar eventos `sent`, `delivered` o `read`.
- Mantener los mensajes y pedidos aunque se limpie contenido conversacional vencido.

No crear un segundo registro de notificaciones.

## 12. Fase 9: matriz de pruebas

### 12.1 Automatizadas

Ejecutar primero las focalizadas:

```powershell
npx playwright test tests/e2e/whatsapp-delivery-lifecycle.spec.ts --project=desktop
npx playwright test tests/e2e/whatsapp-conversation.spec.ts tests/e2e/whatsapp-operations.spec.ts tests/e2e/whatsapp-order-creation-policy.spec.ts --project=desktop
```

Después ejecutar toda la suite WhatsApp en los tres tamaños:

```powershell
npx playwright test tests/e2e/whatsapp-webhook.spec.ts tests/e2e/whatsapp-schema-compat.spec.ts tests/e2e/whatsapp-order-creation-policy.spec.ts tests/e2e/whatsapp-operations.spec.ts tests/e2e/whatsapp-hybrid-interpreter.spec.ts tests/e2e/whatsapp-conversation.spec.ts tests/e2e/whatsapp-delivery-lifecycle.spec.ts
```

### 12.2 Casos funcionales obligatorios

1. Confirmar pedido y repetir webhook.
2. Preparar dos veces desde dispositivos distintos.
3. Marcar listo dos veces.
4. Cobrar antes de marcar repartidor.
5. Marcar repartidor antes de cobrar.
6. Transferencia ya pagada.
7. Pago parcial.
8. Fallo de Meta durante aviso.
9. Reintento exitoso.
10. Cliente escribe `gracias` y no se cierra.
11. Cliente escribe `todavía no llega` y no se cierra.
12. Cliente escribe `gracias, ya llegó` y se finaliza.
13. Finalización manual.
14. Pedido para llevar conserva cobro y entrega conjuntos.
15. Pedido POS no recibe mensajes de WhatsApp.

### 12.3 Interfaz

Probar en:

- Desktop 1440 × 900.
- Tablet táctil 1180 × 820.
- Móvil 390 × 844.

Verificar:

- Ningún botón se sobrepone.
- Dirección y acciones son legibles.
- Copiar y Maps funcionan.
- Los botones conservan jerarquía visual.
- La tarjeta no salta ni desaparece al pagar.
- `En camino` se actualiza sin recarga manual.

## 13. Fase 10: Supabase y seguridad

No se espera migración. Si se crea una función transaccional:

1. Crear migración mediante `npx supabase migration new <nombre>`.
2. No editar migraciones existentes.
3. Restringir cualquier función privilegiada a `service_role`.
4. Validar usuario en la Server Action antes de usar el cliente administrador.
5. No aceptar rol o actor desde el navegador.
6. Ejecutar:

```powershell
npx supabase migration list
npx supabase db push --linked --dry-run
```

No aplicar la migración remota sin revisar primero el dry-run y sin autorización si el cambio excede este plan.

## 14. Fase 11: verificación final

Obligatorio:

```powershell
npm run lint
npm run build
git diff --check
git status --short
```

Luego:

- Revisar que no se versionaron `.env*`, tokens, capturas o `.superpowers/`.
- Revisar el diff completo, especialmente pagos y estados finales.
- Actualizar `.opencode/plans/mideli-context.md` con el comportamiento implementado y resultados reales.
- Completar `progress.md` con pruebas, errores y pendientes.

## 15. Prueba piloto manual

No activar impresión automática durante la primera prueba si puede generar tickets reales innecesarios.

Precondiciones:

- Turno de caja abierto.
- `WHATSAPP_ORDER_CREATION_ENABLED = true` en producción cuando se autorice desplegar.
- `create_orders_enabled = true`.
- `status_notifications_enabled = true`.
- Número de prueba permitido mientras continúe el piloto.

Flujo:

1. Crear un domicilio por WhatsApp.
2. Confirmar que aparece una sola vez en Cocina.
3. Pulsar Preparar y comprobar mensaje.
4. Pulsar Listo y comprobar `Buscando repartidor`.
5. Cobrar al repartidor antes de que salga.
6. Confirmar que la tarjeta no desaparece.
7. Pulsar Repartidor en camino y comprobar mensaje.
8. Confirmar que la tarjeta se mueve a En camino.
9. Responder `gracias, ya llegó`.
10. Confirmar cierre de conversación, estado final, caja e historial.

Repetir una vez finalizando manualmente en lugar de responder desde WhatsApp.

## 16. Despliegue y reversión

No desplegar automáticamente.

Cuando el usuario lo autorice:

1. Confirmar suite verde.
2. Confirmar migraciones alineadas.
3. Confirmar flags operativos.
4. Crear commit final.
5. Desplegar a Vercel.
6. Verificar `/api/health` y versión.
7. Ejecutar el piloto con un solo pedido.

Interruptores de emergencia:

- Apagar `create_orders_enabled` detiene nuevas órdenes sin desconectar el chat.
- Apagar `status_notifications_enabled` detiene avisos de avance.
- Apagar `auto_reply_enabled` entrega el canal a atención humana.
- El checkpoint `checkpoint-before-opencode-2026-08-26` permite recuperar la versión estable, pero nunca debe restaurarse destruyendo cambios sin permiso.

## 17. Definición de terminado

El trabajo solo está terminado si:

- Todas las pruebas automatizadas pasan.
- Lint y build pasan.
- Cobrar un domicilio no lo entrega.
- Los tres avisos se verifican con un pedido real controlado.
- Los avisos duplicados son imposibles.
- El pedido aparece una sola vez en Cocina e impresión.
- El flujo de para llevar no retrocede.
- Los pedidos POS no cambian.
- El usuario revisa la interfaz móvil.
- No hay secretos ni cambios ajenos en el commit.
- El despliegue queda pendiente hasta autorización explícita o se verifica después de dicha autorización.

## 18. Formato del informe final de OpenCode

OpenCode debe entregar:

1. Causa raíz corregida.
2. Archivos modificados.
3. Migraciones creadas o `ninguna`.
4. Pruebas ejecutadas y resultado exacto.
5. Comportamiento comprobado en desktop, tablet y móvil.
6. Estado de flags de prueba sin revelar valores secretos.
7. Riesgos o pruebas manuales pendientes.
8. Commit final.
9. Confirmación explícita de que no desplegó, salvo autorización posterior.
