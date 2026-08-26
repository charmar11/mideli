# Progress

## 2026-08-26

- Se reprodujo el flujo real desde WhatsApp.
- Se consultó el estado persistido de la conversación sin exponer credenciales.
- Se confirmó la variación incorrecta y la configuración incompleta de entregas.
- Se escribió y comprometió la especificación aprobada.
- Se añadieron líneas configurables por unidad y resúmenes agrupados por variación.
- El bot entiende distribuciones como `uno de res y los otros de camarón` y `todos de camarón`.
- Se implementaron sustituciones de productos, cambios de variación, reducción de cantidades, corrección de domicilio y cambio entre domicilio y recoger.
- El tipo de servicio escrito junto con el producto se conserva durante todo el flujo.
- La cotización ahora intenta recuperar una dirección imprecisa antes de transferirla a una persona.
- Se configuró el origen verificado de Mideli y se validó Google Maps sin exponer la clave.
- Pasaron 99 pruebas integradas y 28 pruebas focalizadas después de los últimos casos agregados.
- ESLint pasó en ejecución aislada.
- Pasaron 111 pruebas finales en escritorio, tableta y móvil.
- ESLint, TypeScript y el build de producción terminaron correctamente.
- La versión `d04c11d2d8ba` quedó publicada en `mideli.vercel.app`.
- Los dos seguros de creación de pedidos y la cotización por distancia quedaron activados.
- La base remota confirmó origen, coordenadas y operación del canal.
- Siguiente paso operativo: devolver la conversación de prueba al bot y realizar un pedido real controlado desde WhatsApp.
