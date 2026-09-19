# Plan de pruebas y criterios de aceptación

**Estado:** propuesta de validación previa. No se han ejecutado estas pruebas sobre el modelo multinegocio porque todavía no está implementado.

## Principio de seguridad operativa

En un restaurante es preferible detener temporalmente el envío y mostrar una instrucción clara antes que crear un pedido duplicado, perder una línea o cobrar en una caja incorrecta.

El modo offline no se habilitará como si fuera una operación normal en la primera etapa.

## Conducta recomendada ante pérdida de internet

### Antes de enviar un pedido

- Permitir seguir armando un borrador local.
- Mostrar claramente `Sin conexión`.
- Desactivar el envío hasta confirmar conexión.
- No descontar inventario ni generar folio antes de la confirmación del servidor.

### Durante el envío

- Mantener una clave idempotente de creación.
- Mostrar `Verificando pedido` si la respuesta tarda.
- Permitir reintentar usando la misma clave.
- Nunca crear otro pedido por un doble toque o reintento.

### Durante un cobro

- No confirmar el cobro sin respuesta del servidor.
- Si hay duda, mostrar `Estamos verificando el cobro` y bloquear un segundo intento hasta consultar el resultado.
- No registrar un pago local que no haya sido confirmado por Supabase.

### Después de enviar

- Si el pedido ya fue confirmado, Realtime o una consulta de recuperación debe mostrarlo al volver la conexión.
- Si no existe confirmación, el usuario debe poder revisar el estado antes de volver a enviar.

## Pruebas de continuidad de Mideli

| ID | Escenario | Resultado esperado | Detiene piloto si falla |
|---|---|---|---|
| M-01 | Entrar con cuenta actual de Mideli | Acceso sin cambiar credenciales | Sí |
| M-02 | Crear pedido de comedor | Pedido aparece en Estado | Sí |
| M-03 | Enviar a Cocina | Mauro ve solamente el pedido de Mideli | Sí |
| M-04 | Agregar segundo pedido a la mesa | Se acumula en la visita correcta | Sí |
| M-05 | Cobrar cuenta | Pago y saldo coinciden | Sí |
| M-06 | Cobro parcial o dividido | Saldos e inventario son correctos | Sí |
| M-07 | Cancelar producto | Inventario se devuelve una sola vez | Sí |
| M-08 | Abrir y cerrar caja | Corte coincide con pagos y movimientos | Sí |
| M-09 | Consultar Historial | Datos históricos permanecen visibles | Sí |
| M-10 | Pedido WhatsApp | Sigue ligado exclusivamente a Mideli | Sí |

## Pruebas de usuarios y permisos

| ID | Actor | Acción | Resultado esperado |
|---|---|---|---|
| U-01 | Administrador de plataforma | Crear negocio | Puede crear el contenedor sin acceder automáticamente a su caja |
| U-02 | Dueño Mideli | Editar menú | Solo cambia Mideli |
| U-03 | Dueño Mideli | Ver reportes | Solo ve Mideli |
| U-04 | Coordinador | Crear mesera global | La mesera puede operar según el alcance global |
| U-05 | Coordinador | Modificar mesa | Cambia el plano compartido |
| U-06 | Mesera global | Ver menús | Ve negocios habilitados |
| U-07 | Mesera global | Enviar pedido mixto | Puede enviar a varios negocios |
| U-08 | Personal local | Ver catálogo | Solo ve su negocio |
| U-09 | Personal local | Enviar pedido a otro negocio | Se rechaza en servidor |
| U-10 | Personal local | Cambiar estado ajeno | Se rechaza en servidor |
| U-11 | Cuenta desactivada | Intentar nueva operación | Se bloquea sin borrar historial |
| U-12 | Administrador de plataforma | Consultar importes de negocio | No ve detalle salvo acción explícitamente autorizada y auditada |
| U-13 | Mesera global | Marcar como listo un pedido de otro negocio | Se rechaza por defecto; puede existir una excepción auditada |
| U-14 | Mesera global | Consultar, entregar y cobrar una parte de cualquier negocio habilitado | Se permite y el pago entra a la caja del negocio correcto |

## Pruebas de pedidos mixtos

| ID | Escenario | Resultado esperado |
|---|---|---|
| O-01 | Una hamburguesa de Mideli y un producto de Just Dipping | Se crean dos partes relacionadas con una misma visita |
| O-02 | Falla la parte de un negocio | No queda una creación parcial sin resolver |
| O-03 | Doble toque en Enviar | Se crea una sola operación |
| O-04 | Reintento por timeout | Se recupera el mismo resultado, no un pedido duplicado |
| O-05 | Mideli listo y Just Dipping pendiente | La mesera ve estados independientes |
| O-06 | Just Dipping listo sin Cocina | Se actualiza desde Estado y se notifica a la mesera |
| O-07 | Mideli cancela un producto | Just Dipping continúa sin alteración |
| O-08 | Agregar producto después del primer envío | Se crea un consumo relacionado y no se pierde el anterior |
| O-09 | Cuenta Mideli ya pagada y nuevo consumo Mideli | Se crea cuenta adicional |
| O-10 | Nueva mesa después de cerrar visita anterior | No se mezclan los pedidos de grupos distintos |

## Pruebas de cobro y caja

| ID | Escenario | Resultado esperado |
|---|---|---|
| C-01 | Cobrar Mideli | El pago entra en caja de Mideli |
| C-02 | Cobrar Just Dipping | El pago entra en caja de Just Dipping |
| C-03 | Intentar asignar orden de otro negocio | El RPC rechaza la operación |
| C-04 | Mesera cobra para otro negocio | Se registra como cobradora, pero el dinero pertenece al negocio correcto |
| C-05 | Dos cajas abiertas | Solo se permite una por negocio |
| C-06 | Devolver un producto de Mideli | No cambia los cobros de Just Dipping |
| C-07 | Corregir gasto | Se conserva auditoría y motivo |
| C-08 | Cerrar caja con pendientes | El sistema conserva los pendientes para continuar después |

## Pruebas de inventario

- Un producto de Mideli consume solamente recetas de Mideli.
- Un producto de Just Dipping no modifica inventario de Mideli.
- Cancelar una línea devuelve una sola vez el consumo.
- Editar una orden reequilibra consumo y devolución.
- Un pedido mixto no produce movimientos cruzados.
- Un producto sin receta no genera movimientos inesperados.
- Un retry idempotente no duplica movimientos.

## Pruebas de aislamiento técnico

Las pruebas deben ejecutarse con usuarios distintos y consultar directamente las respuestas del servidor, no solamente lo que muestra la interfaz:

- Leer catálogo ajeno.
- Leer pedido ajeno.
- Leer cliente o domicilio ajeno.
- Leer pago ajeno.
- Leer caja ajena.
- Editar inventario ajeno.
- Modificar un pedido con `business_id` manipulado.
- Suscribirse a Realtime de otro negocio.
- Acceder a imágenes de otro negocio.

Todas deben ser rechazadas o devolver cero datos, según el caso.

## Pruebas de rendimiento operativo

- Pedido nuevo visible en un máximo aproximado de 10 segundos.
- Cambio de estado visible para la mesera sin recargar manualmente.
- Cambio de menú no mezcla cachés.
- La pantalla de un negocio no procesa sonidos o Push de otro.
- Reintentos y reconexiones no duplican pedidos, pagos ni inventario.

## Criterios para aprobar Mideli

El piloto puede comenzar únicamente cuando:

- Todas las pruebas marcadas como críticas pasen.
- Los totales de backfill coincidan.
- Los usuarios actuales entren correctamente.
- La caja y el historial coincidan con el sistema anterior.
- Exista respaldo restaurable.
- Exista procedimiento de reversión.
- El dueño del programa apruebe el inicio.

## Criterios para aprobar Just Dipping

Just Dipping se incorpora solamente cuando:

- Su dueño y personal estén confirmados.
- Su menú e inventario estén validados.
- Su cuenta y permisos estén aislados.
- Su Estado funcione sin aparecer en Cocina de Mideli.
- Se valide un pedido mixto real o controlado.
- Se valide el cobro separado.
- Sus responsables acepten el flujo.
