# Método de pago para domicilio local y mensaje al repartidor

**Estado:** aprobado, implementado y publicado en producción  
**Fecha:** 2026-10-09  
**Alcance:** pedidos locales a domicilio en todos los negocios

## Objetivo

Al capturar un domicilio local, la mesera debe indicar si el cliente pagará en
efectivo o transferencia. El mensaje manual de WhatsApp para el repartidor debe
mostrar esa forma de pago sin dejar `Por definir`.

Si el pago es en efectivo, el mensaje muestra el importe de los productos seguido
del texto **+ envío**, sin sumar ambos conceptos ni mostrar un total final. No se
pregunta cuánto efectivo entregará el cliente ni se calcula cambio. Si es
transferencia, el mensaje indica únicamente **Transferencia**, sin monto.

## Comportamiento de captura

- En Datos del pedido aparece un selector explícito de dos opciones: **Efectivo**
  y **Transferencia**.
- Solo aparece para **domicilio local**; no se muestra para Uber Eats, Didi Food,
  comedor ni para llevar.
- No hay método preseleccionado. La mesera debe elegir uno antes de **Enviar a
  cocina** o **Cobrar y enviar**. Si falta la elección, el envío se bloquea y la
  interfaz indica qué falta.
- Cambiar entre Efectivo y Transferencia actualiza inmediatamente la selección.
- El método se guarda en el campo existente `payment_method_requested`; no se
  añade una migración.
- El borrador local conserva solamente el método elegido para restaurarlo ante
  una recarga. No se agregan teléfono, domicilio ni otros datos personales al
  almacenamiento local.

## Mensaje para el repartidor

El botón manual **Enviar a repartidor** sigue siendo una acción explícita desde
Estado. Para los domicilios locales:

```text
💳 COBRO
Método: Efectivo
Productos: $[total de productos] + envío
```

o bien:

```text
💳 COBRO
Método: Transferencia
```

- El importe mostrado junto a **Productos** usa el total de productos guardado
  en el pedido. El texto `+ envío` se conserva literal: no se suma la tarifa
  para formar otro total ni se muestra su cifra en el mensaje.
- No usa un importe de billete ni descuenta o calcula cambio.
- Transferencia no muestra un monto a cobrar al repartidor.
- Se conservan sin cambios el nombre del negocio, el folio, los datos del
  cliente cuando existan, el origen y destino con sus enlaces de Maps, y la
  acción manual de compartir.
- El diseño aplica por igual a todos los negocios y respeta el aislamiento de
  datos por `business_id`.

## Límites y compatibilidad

- No cambia el registro de cobros, caja, cortes ni la tarifa de envío.
- No cambia el comportamiento de pedidos Uber Eats o Didi Food, incluido el
  efectivo variable de Didi, ni el flujo de comedor o para llevar.
- No desactiva ni reactiva avisos automáticos de WhatsApp. Solo cambia el texto
  preparado por la acción manual **Enviar a repartidor**.
- El campo existente `requested_cash_tendered` y los flujos heredados que lo
  usan no se eliminan ni se reescriben; el mensaje nuevo no lo usa para calcular
  ni para determinar el importe de productos que muestra.
- No se agregan permisos, configuraciones por negocio ni tablas nuevas.

## Criterios de aceptación

1. Para domicilio local, Efectivo y Transferencia aparecen como opciones visibles
   y accesibles desde móvil, tablet y escritorio.
2. Sin elegir método, no se puede enviar ni cobrar/enviar; se indica que falta
   seleccionar el método.
3. Con Efectivo, Estado genera `Productos: $X + envío`, donde `$X` es el total
   de productos; no imprime un total combinado ni la tarifa de envío como cifra.
4. Con Transferencia, Estado genera el método y no incluye un monto de efectivo.
5. Una recarga durante un borrador restaura el método elegido, sin almacenar
   teléfono ni domicilio.
6. El mensaje conserva cliente, teléfono y ambos mapas cuando existan.
7. Uber Eats, Didi Food, comedor y para llevar conservan su flujo actual.
8. El método y los importes del mensaje corresponden al pedido y negocio
   seleccionados; no se mezclan entre negocios.

## Verificación propuesta

- Pruebas unitarias del generador del mensaje para efectivo y transferencia,
  incluyendo el importe de productos seguido por `+ envío`, sin total sumado ni
  campos de billete/cambio.
- Pruebas del borrador local para persistir/restaurar el método y rechazar
  valores desconocidos.
- Pruebas Playwright del selector, bloqueo sin elección, ambos métodos, y
  regresión de plataforma/comedor/para llevar en móvil y escritorio.
- Ejecutar `npm run lint` y `npm run build`.
- La prueba automatizada no sustituye abrir WhatsApp en un teléfono real; el
  enlace y texto se validan localmente, pero no se envía ningún mensaje real.

## Riesgos considerados

- **Método marcado incorrectamente:** se reduce al no preseleccionar ninguna
  opción y exigir una elección explícita.
- **Monto de productos inconsistente:** se usa el total persistido de productos
  del mismo pedido. La tarifa de envío sigue guardada y calculada en la comanda,
  pero el mensaje solo la menciona como `+ envío`.
- **Interferencia con plataformas:** se limita selector y validación al flujo de
  domicilio local y se cubren las rutas de plataformas con pruebas de regresión.
