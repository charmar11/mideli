# Especificación 2: pedidos y cobros multinegocio

**Estado:** borrador para revisión. No autoriza implementación ni cambios de base de datos.

## Objetivo operativo

La mesera debe trabajar desde una sola interfaz y poder armar un pedido con productos de varios negocios. El sistema debe separar automáticamente la operación sin que la mesera tenga que cambiar de aplicación ni que un negocio vea productos de otro.

## Modelo operativo

Una visita de mesa compartida contiene una o más cuentas de negocio:

```text
Mesa 5 · visita actual
├── Cuenta Mideli
│   ├── Pedido Mideli 1
│   └── Pedido Mideli 2
└── Cuenta Just Dipping
    └── Pedido Just Dipping 1
```

La visita de mesa es compartida físicamente. Las cuentas, productos, inventario, estados y pagos son independientes por negocio.

## Flujo de la mesera global

1. Selecciona la mesa.
2. Elige productos del menú de Mideli, Just Dipping u otro negocio habilitado.
3. Ve un resumen general y el desglose por negocio.
4. Envía el pedido una sola vez.
5. El servidor divide el carrito por negocio dentro de una operación atómica.
6. Cada negocio recibe únicamente sus productos.
7. La mesera ve un estado independiente por negocio.
8. Cada parte se entrega cuando ese negocio termina, sin esperar obligatoriamente a los demás.

Si una parte falla, no debe quedar creado solamente otro negocio. La separación debe ser atómica y registrada como un conjunto relacionado.

## Flujo del personal local

Un trabajador que opere desde la tableta de un negocio verá el mismo tipo de aplicación, pero con el negocio fijado por su cuenta o dispositivo.

Puede:

- Crear pedidos solamente de su negocio.
- Ver sus propios pedidos.
- Marcar sus pedidos como recibidos, preparando o listos según su permiso.
- Corregir o cancelar su parte conforme a la autorización del negocio.

No puede enviar pedidos a otros negocios ni cambiar pedidos ajenos.

La mesera global consulta el avance de todos los negocios autorizados, recibe
la notificación de cada parte y puede marcar la entrega o cobrarla. No marca
como `Listo` la preparación de otro negocio por defecto; esa transición la hace
el personal autorizado del negocio dueño. Cualquier excepción requiere una
capacidad explícita y queda auditada.

## Estados

### Mideli

Mideli conserva la pantalla de Cocina actual. El flujo interno mantiene los estados existentes y la interfaz los presenta como pendiente, en preparación y listo.

### Just Dipping

Just Dipping no tendrá pantalla de Cocina en esta etapa. Sus pedidos aparecen en Estado con:

- `Pendiente`.
- `Preparando`.
- `Listo`.

El personal autorizado de Just Dipping cambia esos estados. La mesera global recibe la actualización para poder entregar la parte correspondiente.

Cada negocio debe poder continuar o cancelar su parte sin detener automáticamente la parte de otro negocio.

## Cobro

- El cliente recibe una cuenta separada por negocio.
- La mesera puede ver el total general de la mesa y el subtotal de cada negocio.
- El pago se registra contra una sola cuenta de negocio.
- La mesera puede cobrar libremente para todos los negocios, según la decisión confirmada.
- Cada negocio abre y cierra su propia caja.
- La autorización actual para abrir y cerrar caja se conserva, pero se aplica dentro del negocio correspondiente.
- Si una mesera cobra una mesa mixta, el flujo presenta una cuenta a la vez y
  registra una transacción por negocio. El total general se muestra como apoyo,
  pero nunca se guarda como un pago compartido.
- Si el cliente entrega efectivo en una sola exhibición, el sistema conserva
  el cálculo separado por negocio y no atribuye automáticamente el cambio o el
  importe a una caja distinta.
- Los pagos parciales, combinados y divididos deben continuar funcionando dentro de la cuenta del negocio.
- Una devolución de un producto afecta solamente el cobro y el inventario de ese negocio.
- La propina corresponde a la mesera, no se reparte automáticamente entre negocios.
- No es necesario registrar qué terminal física se utilizó.

## Consumos adicionales

Si una cuenta de negocio ya fue pagada y la mesa pide otro producto de ese mismo negocio, se crea una cuenta adicional relacionada con la misma visita. No se reabre ni se altera el cobro anterior.

## Inventario

- Cada producto pertenece a un negocio.
- Cada receta usa inventario del mismo negocio.
- Insertar, editar, cancelar o reemplazar una línea debe generar movimientos únicamente en el inventario correcto.
- Ninguna receta podrá apuntar accidentalmente a insumos de otro negocio sin una regla explícita de insumo compartido.

## Historial y reportes

El dueño ve su historial por negocio. La mesera ve lo necesario para operar y cobrar. Un resumen general de la mesa puede mostrar secciones por negocio, pero no sustituye los historiales ni las cuentas independientes.

Los folios históricos de Mideli deben conservarse durante la migración.

## Datos en tiempo real y notificaciones

Los canales de Realtime, cachés, sonidos, Push y tareas programadas deben incluir el alcance del negocio. Un cambio de Just Dipping no debe despertar la Cocina de Mideli y viceversa.

La notificación de la mesera debe indicar qué negocio terminó y qué parte de la mesa puede entregar.

## Principios que no se deben romper

1. Nunca mezclar inventario entre negocios.
2. Nunca cobrar una cuenta de otro negocio dentro de la caja equivocada.
3. Nunca mostrar pedidos de otro negocio a un trabajador local.
4. Nunca crear solo una parte de un pedido mixto si la operación completa falló.
5. Nunca reabrir silenciosamente una cuenta ya pagada.
6. Nunca borrar financieramente un pedido, pago o gasto sin conservar auditoría.
