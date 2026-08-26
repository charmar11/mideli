# Pedidos editables, entrega automática y tono de WhatsApp

Fecha: 2026-08-26  
Estado: aprobado

## Objetivo

Hacer que el bot de Mideli entienda pedidos naturales con cantidades, variaciones distintas por unidad, modificaciones posteriores y tipo de servicio, sin ocultar lo que interpretó. El flujo debe cotizar domicilios con la configuración real y hablar de forma breve, cálida y profesional.

## Problemas confirmados

- Una línea con cantidad mayor a uno solo conserva una variación. El pedido `1 California de res y 2 de camarón` terminó almacenado como `3 California de res`.
- El texto `3 Californias para domicilio` reconoce el producto, pero pierde el tipo de servicio.
- Las tarifas de entrega existen, pero la cotización operativa está desactivada y el origen del local no tiene coordenadas.
- La creación automática de pedidos está desactivada.
- Los mensajes confirman cambios sin mostrar el desglose interpretado.
- Una cotización no disponible transfiere inmediatamente la conversación a una persona.

## Alternativas consideradas

### A. Una línea agregada con asignaciones internas

Mantener cantidad `3` y guardar una tabla interna con `1 res, 2 camarón`. Reduce líneas, pero complica edición, resumen, impresión, inventario y compatibilidad con el pedido actual.

### B. Una línea por unidad

Convertir productos configurables en líneas independientes de cantidad `1`. Simplifica variaciones y cambios, pero puede generar resúmenes largos.

### C. Enfoque híbrido recomendado

Separar únicamente las unidades que tengan configuraciones diferentes y volver a agrupar visualmente las idénticas. Conserva resúmenes compactos y permite editar cada unidad con precisión.

## Diseño conversacional

### Interpretación inicial

Un mensaje puede aportar varias intenciones a la vez:

- Productos y cantidades.
- Variaciones por unidad.
- Tipo de servicio.
- Instrucción de finalizar.

El motor conservará el tipo de servicio aunque primero deba completar una variación requerida.

Ejemplo:

> Quiero 3 Californias, uno de res y dos de camarón, para domicilio.

Respuesta:

> 🍣 Listo, llevo:
> 
> • 1 California de res  
> • 2 California de camarón  
> 
> 🧾 Total: $375  
> 📍 Será a domicilio  
> 
> ¿Deseas agregar algo más? 😊

### Modificaciones antes de confirmar

El bot aceptará:

- Reemplazar un producto por otro.
- Cambiar una variación.
- Aumentar o reducir cantidad.
- Eliminar una o varias unidades.
- Cambiar entre domicilio y recoger.
- Cambiar dirección, referencia o método de pago.

Cada operación devolverá un resumen explícito de lo modificado y el total actualizado. Nunca responderá solamente `cambio realizado`.

### Modificaciones después de confirmar

- Si todavía no existe pedido en Mideli, se modifica el carrito conversacional.
- Si el pedido ya existe y aún puede prepararse, la modificación deberá pasar por el flujo auditable de actualización y señalar a Cocina lo agregado y retirado.
- Si está listo, cobrado o cancelado, se transferirá a una persona y no se alterará silenciosamente.

La primera implementación cubrirá completamente modificaciones previas a la confirmación. Las modificaciones posteriores reutilizarán la infraestructura de actualización existente y no harán escrituras directas inseguras.

## Modelo del carrito

- Los productos sin variaciones pueden conservar cantidad agregada.
- Los productos configurables se expanden en unidades cuando la cantidad es mayor a uno.
- Las unidades con la misma configuración se agrupan al mostrar el resumen.
- Cada unidad conserva producto, variaciones, notas y precio.
- Los cambios se aplican sobre coincidencias explícitas. Ante ambigüedad, el bot pregunta antes de alterar el pedido.

## Entregas

- Configurar el origen real de Mideli antes de activar cotizaciones.
- Usar Google Maps para geocodificación y distancia de conducción.
- Aplicar los rangos de 0 a 15 km y los recargos por colonia ya guardados.
- Si la dirección es ambigua, pedir ubicación compartida o una dirección más completa antes de transferir a una persona.
- Mostrar dirección interpretada, distancia, tarifa base, recargo y total.
- Cambiar a recoger elimina la tarifa. Cambiar dirección obliga a recalcularla.

## Tono

- Frases cortas y naturales.
- Emojis funcionales, no decorativos en exceso.
- Saludos y cierres cálidos.
- Confirmaciones con producto, variación, cantidad y total.
- Evitar expresiones mecánicas como `acción completada` o `selecciona tipo` sin contexto.
- No fingir que una persona revisará el pedido cuando la automatización puede continuar.

## Manejo de errores

- Una falla de Google Maps no modifica el carrito.
- La causa técnica queda registrada, pero al cliente se le pide una acción concreta.
- Dos intentos fallidos permiten transferencia humana.
- El traspaso debe quedar visible para el equipo y permitir devolver la conversación al bot.
- Una falla al responder no convierte el mensaje entrante en fallido.

## Pruebas de aceptación

1. `3 Californias, uno de res y dos de camarón` produce exactamente ese desglose.
2. `3 Californias para domicilio` conserva domicilio después de completar variaciones.
3. `cambia uno de res por camarón` actualiza solo una unidad.
4. `quita un California` reduce una unidad y recalcula total.
5. `cambia las tres por dos hamburguesas sencillas` reemplaza y recalcula.
6. Rechazar bebida continúa al tipo de servicio.
7. Una dirección válida devuelve distancia y costo configurado.
8. Una dirección ambigua pide precisión antes del traspaso.
9. Cambiar de domicilio a recoger elimina la tarifa.
10. El resumen final coincide con el estado persistido y el pedido creado.

## Fuera de alcance inmediato

- Interpretación libre mediante un modelo de lenguaje externo de pago.
- Edición automática de pedidos ya listos o cobrados.
- Fotografías, botones interactivos y pagos en línea.
