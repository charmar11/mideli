# Correcciones naturales del flujo de WhatsApp

Fecha: 2026-08-26

## Objetivo

Evitar que el cliente quede atrapado cuando cambia de opinión, solicita una bebida, modifica el pedido o confirma con lenguaje natural. Mantener la validación segura de domicilios sin obligarlo a reescribir una dirección por diferencias de puntuación.

## Diseño aprobado

### Intenciones globales

Antes de ejecutar la pregunta específica de cada etapa, el motor reconocerá acciones que pueden ocurrir tarde en el flujo:

- Confirmar con `confirmar`, `confirmo`, `sí`, `correcto`, `adelante` y equivalentes, únicamente cuando ya se mostró el resumen.
- Solicitar cambios con `modificar`. Si no especifica el cambio, el bot conservará el resumen y explicará ejemplos concretos.
- Volver a bebidas desde selección de servicio, pago o confirmación.
- Conservar la atención humana y la cancelación con prioridad sobre el resto.

Las afirmaciones breves fuera de una confirmación seguirán siendo contextuales para no crear pedidos accidentalmente.

### Regreso desde bebidas

El estado conversacional guardará un punto de retorno compatible con conversaciones antiguas. Al abrir bebidas desde una etapa tardía:

- Desde selección de servicio, regresará a preguntar recoger o domicilio.
- Desde pago, regresará al método de pago.
- Desde el resumen, conservará domicilio, tarifa y método de pago, recalculará el total y mostrará un resumen nuevo.

Si una bebida requiere opciones, el retorno ocurrirá después de completar sus variaciones.

### Domicilios

La dirección original del cliente seguirá siendo la visible y la almacenada en el pedido. Para Google Maps se construirá una variante normalizada que separe calle, número y colonia. Si el resultado no alcanza la confianza estricta, se hará un segundo intento con el texto original.

No se relajarán las protecciones existentes: el número debe coincidir, la ubicación debe pertenecer a Ciudad Obregón o Cajeme y no se aceptarán parques, escuelas ni puntos de interés.

El estado distinguirá entre una referencia pendiente y una referencia omitida. Si una cotización falla después de responder `omitir`, la dirección corregida se cotizará sin volver a preguntar lo mismo.

## Compatibilidad

Los campos nuevos vivirán en el JSON de `channel_conversations.state` y tendrán valores predeterminados durante la hidratación. No se requiere migración de PostgreSQL ni se invalidan conversaciones existentes.

## Verificación

Se convertirá el transcript real en pruebas de regresión para cubrir:

1. Regreso a bebidas después de haber respondido que no.
2. Regreso a bebidas desde el resumen y retorno al resumen actualizado.
3. Aceptación literal de `Confirmar`.
4. Respuesta útil a `Modificar` sin detalle.
5. Reintento normalizado de dirección.
6. No repetir la pregunta de referencia después de `omitir`.
7. Conservación de los flujos existentes, lint y build de producción.
