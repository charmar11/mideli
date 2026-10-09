# Pedidos manuales de Uber Eats y Didi Food

**Estado:** diseño para revisión del dueño
**Fecha:** 2026-10-09
**Alcance inicial:** Just Dipping, con soporte reutilizable por negocio

## Objetivo

Permitir registrar manualmente pedidos que llegan por Uber Eats o Didi Food,
identificarlos en Estado, Historial y tickets, y registrar correctamente el
efectivo de Didi que recibe la caja de Just Dipping. La función debe quedar
aislada por negocio y no alterar los pedidos, cobros ni repartos propios de los
demás locales.

## Contexto del sistema actual

- El pedido distingue actualmente comedor, domicilio y para llevar. Domicilio
  activa dirección, Maps, cotización y el flujo de repartidores del local.
- Los métodos de cobro locales son efectivo, tarjeta y transferencia.
- `source_channel` identifica por dónde entró técnicamente una orden (POS o
  WhatsApp); no debe reutilizarse para identificar Uber/Didi.
- Los cobros en efectivo se asocian a la caja abierta del mismo negocio. El
  sistema rechaza cobrar en efectivo si no hay turno de caja abierto.
- Historial y la configuración de ticket ya son por negocio.

Por lo tanto, la plataforma de origen y quién recibió el pago serán datos
independientes del tipo logístico del pedido y de los métodos de cobro local.
La implementación debe guardar un canal de venta explícito y separado de
`source_channel`; para estos pedidos el valor será Uber Eats o Didi Food. No se
debe reutilizar `domicilio` como sinónimo de plataforma, porque hoy ese tipo
activa dirección, cotización y reparto propio. La selección de plataforma debe
tener un modo de entrega de plataforma identificable, sin exigir ni inventar
una dirección del cliente. Los pedidos existentes conservan exactamente su
semántica.

## Decisiones de producto

### Habilitación y permisos

- Rincón 404 puede activar o desactivar la capacidad **Pedidos de plataformas**
  por negocio.
- Solo Just Dipping queda habilitado al inicio. La capacidad queda apagada por
  defecto para negocios existentes y nuevos.
- Al estar habilitada, el dueño de ese negocio puede configurar sus plataformas
  y precios; no puede editar datos de otro local.
- El personal que ya puede crear pedidos en el negocio puede seleccionar una
  plataforma habilitada. La opción se valida también en servidor, no solo se
  oculta en pantalla.

### Captura en Mesero

Al continuar a los datos finales, el trabajador elige el flujo de entrega:

- **Domicilio del local:** conserva el flujo actual, incluyendo domicilio,
  colonia, cotización y repartidor propio.
- **Uber Eats:** pedido de plataforma, pagado en la app.
- **Didi Food:** pedido de plataforma; se indica si fue pagado en la app o si el
  efectivo se recibirá del repartidor al recogerlo.

Uber y Didi no piden domicilio del cliente, no activan Maps ni la tarifa de
envío/repartidor propio. Los datos de cliente siguen siendo opcionales. El
pedido conserva su canal de plataforma sin hacerse pasar por un domicilio
normal del local. Comedor y para llevar siguen sin cambios.

### Cobro y caja

- **Didi pagado en la app** y **Uber pagado en la app** se marcan como cobrados
  por la plataforma y fuera de la caja del negocio. No se registran como
  efectivo ni tarjeta de la terminal local.
- **Didi en efectivo** no genera un cobro anticipado ni una cantidad estimada.
  Estado muestra que hay efectivo por recibir, pero no lo suma al corte todavía.
- Cuando el repartidor recoge el pedido, el trabajador toca **Entregado al
  repartidor de Didi** e introduce el importe que realmente recibió. Ese importe
  se registra como efectivo de la caja de Just Dipping en la misma operación que
  confirma la entrega.
- El importe real queda separado del total informativo de la comanda. No se
  asume que coinciden, porque pueden existir descuentos u otros ajustes.
- El importe se captura vacío, sin sugerir el total del pedido como si fuera lo
  recibido. Si difiere del total, se conserva el valor escrito y se muestra la
  diferencia para conciliación; no se etiqueta automáticamente como descuento,
  comisión ni faltante.
- El registro debe ser idempotente: repetir la acción por una respuesta lenta
  no puede duplicar el efectivo ni la entrega.
- Si no hay caja abierta, la interfaz explica que debe abrirse la caja de Just
  Dipping antes de registrar el cobro. Si falla el registro, no se presenta
  falsamente el efectivo como recibido ni la operación como completada.

### Estado, Historial y ticket

- Todos los pedidos de plataforma pasan por la preparación normal de Just
  Dipping y muestran una etiqueta clara de Uber Eats o Didi Food.
- Al estar listo, el trabajador marca la entrega a la persona repartidora de la
  plataforma. Esto concluye el seguimiento del pedido; no muestra el flujo de
  repartidor propio ni requiere WhatsApp para completar la entrega. Esta
  capacidad no cambia los avisos de WhatsApp ni las acciones de compartir de
  los pedidos locales.
- En Didi en efectivo, la tarjeta de Estado indica **Efectivo por recibir**; no
  muestra un importe prometido antes de conocerlo.
- Historial y ticket muestran plataforma, importe de la comanda y forma de
  cobro. Para Didi en efectivo muestran también el importe recibido real. No se
  imprime domicilio de cliente que no se solicitó.
- Los datos, filtros y tickets permanecen aislados por `business_id`.

### Precios, descuentos, comisiones y analíticas

- El dueño puede definir precios de producto distintos por plataforma. Un
  producto sin precio especial usa el precio del menú del negocio.
- El precio aplicado se conserva en el pedido; cambios futuros a la
  configuración no reescriben pedidos ni tickets anteriores.
- La comisión por plataforma puede quedar sin configurar. Si no se conoce o no
  se configura, el sistema no la trata como cero y no calcula un neto ficticio.
- Aunque se configure una tasa o comisión, no se presenta un neto como real
  hasta que se confirme su base de cálculo y el tratamiento de descuentos y
  promociones. Cualquier simulación futura debe identificarse claramente como
  estimación.
- La captura real del efectivo de Didi nunca se deriva de una comisión o
  descuento estimado.
- Estado e Historial separan el canal de venta de los cobros locales. El corte
  de caja suma únicamente el efectivo que llegó realmente a la caja. Los pagos
  hechos en la app se muestran como cobro de plataforma, no como tarjeta local.
- Mientras no se confirme cómo calcula cada plataforma sus comisiones y
  descuentos, los reportes muestran importes registrados por comanda y cobros
  reales por separado; no prometen una liquidación neta. Cualquier cálculo de
  comisión debe etiquetarse como estimado hasta que se valide su base.

## Flujo resumido

```text
Crear comanda
  ├─ Domicilio del local → datos de dirección → cotización y reparto local
  ├─ Uber Eats → sin domicilio → pagado en app
  └─ Didi Food → sin domicilio → pagado en app o efectivo al recoger

Preparación → Listo → Entrega a repartidor de plataforma
                           └─ Didi efectivo: capturar importe recibido
                              y registrarlo en la caja de Just Dipping
```

## Fuera de alcance inicial

- Conexión automática, importación o sincronización con las APIs de Uber Eats
  y Didi Food.
- Importación de estados de cuenta/liquidaciones de la plataforma.
- Cálculo contable final de comisión, impuestos, promociones o liquidación neta
  mientras no se conozcan sus reglas reales.
- Cambios a WhatsApp, al reparto propio o a los negocios que no tengan activada
  esta capacidad.

## Validación antes de implementar

1. Just Dipping desactivado: POS, caja, Estado, Historial y tickets conservan el
   flujo actual.
2. Solo Just Dipping habilitado: aparecen sus opciones Uber/Didi; otros
   negocios y sus empleados no pueden usar ni leer esa configuración.
3. Uber y Didi pagados en app no aparecen en efectivo ni tarjeta local.
4. Didi efectivo no suma antes de la entrega; al confirmar la entrega registra
   exactamente el importe escrito una sola vez en la caja de Just Dipping.
5. Sin caja abierta, no se registra efectivo ni se muestra un cobro exitoso.
6. Los pedidos de plataforma no requieren dirección, no activan Maps ni reparto
   local, y sí siguen preparación y entrega a repartidor de plataforma.
7. Los tickets e Historial distinguen plataforma, cobro en app y efectivo real;
   una comisión vacía no se interpreta como cero.
8. Pruebas de escritorio, tablet y móvil; lint, build, pruebas Playwright y
   pruebas SQL para aislamiento entre negocios y atomicidad del cobro/entrega.

## Riesgos y salvaguardas

- **Doble cobro por reintento:** proteger la operación de efectivo y entrega con
  una clave idempotente/transacción atómica.
- **Mezclar caja local y pago en app:** conservar canales y fuentes de cobro
  separados en datos, filtros y analíticas.
- **Habilitarlo accidentalmente en otros locales:** apagado por defecto y
  validación por negocio en el servidor y la base.
- **Comisiones desconocidas:** guardarlas como no configuradas; no alterar
  cortes ni presentar netos estimados como cifras reales.
