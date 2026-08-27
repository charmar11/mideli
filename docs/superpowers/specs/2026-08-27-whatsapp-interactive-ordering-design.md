# Pedidos interactivos completos por WhatsApp

**Fecha:** 2026-08-27  
**Estado:** Diseño aprobado verbalmente, pendiente de revisión escrita  
**Alcance:** Bot de pedidos por WhatsApp, sin imágenes por el momento

## Objetivo

Hacer que un cliente pueda completar y corregir un pedido principalmente con toques, sin depender de recordar números ni frases exactas. El texto libre seguirá disponible para pedidos naturales, direcciones, referencias y notas.

El flujo debe cumplir estas condiciones:

- Las categorías, productos, opciones, bebidas, entrega, pago, confirmación y edición tienen controles interactivos.
- El cliente puede modificar cualquier parte del pedido antes de confirmarlo.
- Las notas pueden aplicarse a un producto, a una unidad específica, al pedido completo o a la entrega.
- El bot entiende frases combinadas como “sería todo a domicilio”.
- Un error de Meta o una opción vencida nunca deja al cliente sin respuesta.
- La orden se crea una sola vez y únicamente después de la confirmación final.

## Restricciones de WhatsApp

La API de WhatsApp permite hasta tres botones de respuesta y listas con hasta diez filas entre todas sus secciones. Por ello:

- Se usarán botones cuando haya de una a tres decisiones cortas.
- Se usarán listas cuando haya entre cuatro y diez opciones.
- Los catálogos mayores se paginarán.
- Los identificadores internos serán estables; el texto visible no se usará como clave.
- Dirección, referencia y contenido de notas permanecerán como texto libre o ubicación compartida.

Referencia: [colección oficial de WhatsApp Cloud API](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).

## Modelo de interacción

El motor seguirá produciendo texto, pero también describirá el control interactivo que acompaña la respuesta.

```ts
type WhatsAppInteraction =
  | { kind: "text" }
  | {
      kind: "buttons"
      buttons: Array<{ id: string; title: string }>
    }
  | {
      kind: "list"
      buttonText: string
      sections: Array<{
        title?: string
        rows: Array<{
          id: string
          title: string
          description?: string
        }>
      }>
    }
```

Los identificadores seguirán una convención explícita, por ejemplo:

- `cmd:menu`
- `cmd:human`
- `category:<categoryId>`
- `product:<productId>`
- `modifier:<groupId>:<optionId>`
- `cart:<lineId>`
- `edit:remove`
- `delivery:pickup`
- `payment:cash`

El webhook conservará tanto el identificador como el título recibido. El motor resolverá primero el identificador y usará el título únicamente como compatibilidad. Esto evita errores por nombres largos, repetidos o modificados.

## Flujo principal

### 1. Bienvenida

La bienvenida mostrará hasta tres botones:

- Hacer pedido
- Ver menú
- Hablar con alguien

El cliente también podrá escribir directamente lo que desea.

### 2. Categorías

Las categorías activas se mostrarán en una lista. Cada fila incluirá emoji, nombre y una descripción breve cuando aporte valor. El orden será el configurado en Menú.

Si existen más de diez acciones, se mostrarán hasta nueve categorías y una fila “Ver más”.

### 3. Productos

Los productos activos de la categoría se mostrarán como lista paginada. Cada fila incluirá:

- Nombre corto.
- Precio base.
- Descripción breve o contenido principal cuando quepa.

Los productos inactivos no se ofrecerán. Si un producto se desactiva después de mostrar la lista, al seleccionarlo se avisará con amabilidad y se actualizarán las opciones.

### 4. Variaciones y personalización

- Una variación requerida con hasta tres opciones utilizará botones.
- Una variación con cuatro a diez opciones utilizará lista.
- Las variaciones opcionales ofrecerán “Sin cambios” o “Continuar”.
- Para selección múltiple, el cliente elegirá una opción por vez y después verá “Agregar otra” y “Listo”. No se simulará una lista multiselección que WhatsApp no soporta.
- El total se recalculará después de cada modificación.

### 5. Después de agregar un producto

El bot mostrará el carrito resumido y tres botones:

- Agregar más
- Añadir nota
- Terminar

“Agregar más” regresa a categorías. “Terminar” conserva cualquier intención ya expresada en el mismo mensaje, como domicilio o recoger.

### 6. Bebidas

Antes de pasar a entrega, el bot ofrecerá bebidas. Se usarán tres botones cuando sea suficiente o una lista de bebidas cuando existan más opciones:

- Ver bebidas
- No, gracias
- Volver al pedido

Después de agregar una bebida se podrá agregar otra o continuar.

### 7. Entrega y pago

Se mantendrá el flujo ya validado:

- Recoger o domicilio mediante botones.
- Reutilizar domicilio anterior o ingresar otro.
- Dirección por texto o ubicación compartida.
- Confirmación visual del domicilio encontrado.
- Referencia opcional.
- Cálculo de cobertura y envío.
- Efectivo o transferencia mediante botones.
- Monto con el que pagará cuando corresponda.

### 8. Resumen final

El resumen mostrará productos, opciones, notas, subtotal, domicilio, envío, pago y total. Tendrá:

- Confirmar
- Modificar
- Añadir nota

La orden no se crea antes de “Confirmar”. La protección actual contra webhooks duplicados se conserva.

## Edición real del pedido

“Modificar” dejará de devolver una instrucción genérica. Abrirá una lista de acciones:

- Agregar productos
- Quitar producto
- Cambiar cantidad
- Cambiar opciones
- Añadir indicación
- Cambiar entrega
- Cambiar domicilio
- Cambiar pago
- Ver resumen

### Agregar productos

Abre el catálogo y conserva un indicador de edición. Al terminar de agregar, regresa al menú de cambios o al resumen, sin repetir innecesariamente bebidas, domicilio y pago ya capturados.

### Quitar producto

Muestra las líneas actuales del carrito. Después de elegir una, confirma el retiro, recalcula el total y permite hacer otro cambio o volver al resumen.

### Cambiar cantidad

Primero se elige una línea. Luego se muestran cantidades comunes y una opción para escribir otra cantidad. Una cantidad de cero se tratará como eliminación con confirmación.

### Cambiar opciones

Solo muestra productos configurables. La línea elegida vuelve a recorrer sus variaciones sin perder el resto del carrito. Al finalizar reemplaza las opciones de esa línea y recalcula el precio.

### Cambiar entrega, domicilio o pago

Reutiliza los flujos validados existentes. Al completarse, vuelve al resumen y recalcula envío y total cuando aplique.

### Salida segura

Todos los subflujos de edición tendrán “Volver al resumen”. Una selección inválida o antigua refrescará las opciones actuales en lugar de escalar inmediatamente a atención humana.

## Notas guiadas

La opción “Añadir nota” abrirá una elección de alcance:

- A un producto
- A todo el pedido
- Para la entrega

### Nota de producto

Se elige la línea del carrito y luego se escribe la indicación. Si la línea contiene varias unidades, el bot preguntará:

- Todas las unidades
- Solo una unidad

Cuando sea para una sola unidad, la línea se dividirá internamente para que cocina vea con claridad cuál producto lleva la indicación.

Ejemplos:

- “Sin cebolla”.
- “Mitad BBQ y mitad buffalo”.
- “Salsa aparte”.

### Nota general

Se guarda como instrucción global del pedido sin exigir palabras clave. Cualquier texto no vacío dentro del límite permitido será aceptado.

### Nota de entrega

Se utilizará para referencias, acceso a privada, caseta, pin o indicaciones al repartidor. No se mezclará con la preparación de cocina.

## Frases naturales y mensajes combinados

Los controles interactivos serán la ruta principal, pero el texto seguirá funcionando. El motor deberá conservar todas las intenciones válidas presentes en un mismo mensaje.

Casos obligatorios:

- “Sería todo a domicilio” termina productos y guarda domicilio como tipo de entrega.
- “Bueno sí quiero bebida” desde la pregunta de entrega regresa a bebidas.
- “Dos sencillas” dentro de Hamburguesas agrega dos hamburguesas sencillas.
- “Quita una hamburguesa” modifica el carrito.
- “Cambia el California de pollo por res” actualiza la opción.
- “Pon una sin cebolla” inicia una nota para una unidad.
- “Confirmo” funciona después del resumen sin depender de mayúsculas o acentos.

Gemini se utilizará solo para interpretar texto ambiguo. Los identificadores de botones y listas se resolverán de forma determinista, sin IA.

## Estados conversacionales

Se añadirán estados explícitos para evitar ciclos y conservar el punto de retorno:

- `awaiting_edit_action`
- `awaiting_edit_item`
- `awaiting_edit_quantity`
- `awaiting_note_scope`
- `awaiting_note_item`
- `awaiting_note_quantity_scope`
- `awaiting_note_text`

El estado persistido incluirá un contexto de edición similar a:

```ts
type EditContext = {
  action: "add" | "remove" | "quantity" | "modifiers" | "note" | null
  targetLineId?: string
  returnStage: "ordering" | "awaiting_confirmation"
}
```

La hidratación asignará valores por defecto para conversaciones creadas antes de estos estados.

## Envío y recepción en Meta

El proveedor de Meta agregará soporte para mensajes de lista además de texto, ubicación y botones.

Reglas de resiliencia:

- Si Meta rechaza una lista o botón, se enviará automáticamente una versión textual equivalente.
- El error se registrará con contexto técnico sin exponer credenciales.
- Si también falla el respaldo textual, la conversación quedará marcada para atención y se emitirá la notificación correspondiente.
- Los mensajes interactivos recibidos conservarán `interactiveId`, título y tipo.
- Las respuestas citadas o textos copiados por WhatsApp no alterarán la resolución de un identificador interactivo.

## Interfaz de Mideli

La conversación en Mideli mostrará los mensajes interactivos de forma legible, incluyendo la opción seleccionada. No necesita recrear visualmente los controles de WhatsApp.

Cuando una conversación pase a atención por un fallo real, conservará las notificaciones push configurables ya existentes. Una respuesta inválida aislada no debe escalarla automáticamente.

## Pruebas obligatorias

### Interacción

- Bienvenida con tres botones.
- Categorías mediante lista.
- Productos paginados sin exceder diez filas.
- Variaciones con botones y listas según cantidad.
- Selección múltiple de variaciones.
- Respaldo textual cuando Meta rechaza un interactivo.
- Recepción correcta de `button_reply.id` y `list_reply.id`.

### Carrito y edición

- Agregar, quitar y cambiar cantidad.
- Cambiar variaciones sin duplicar la línea.
- Agregar un producto desde el resumen y regresar al resumen.
- Añadir nota a pedido, entrega, todas las unidades y una sola unidad.
- Dividir correctamente una línea al anotar una sola unidad.
- Recalcular subtotal, envío y total después de cada cambio.
- “Modificar” nunca repite el mismo mensaje indefinidamente.

### Lenguaje natural

- “Sería todo a domicilio”.
- “No gracias”.
- “Bueno sí quiero bebida”.
- “Dos sencillas”.
- Modificaciones naturales de producto y opción.
- Confirmación con variantes comunes.

### Seguridad operativa

- Un webhook repetido no duplica mensajes ni órdenes.
- Confirmar varias veces crea una sola orden.
- Un producto desactivado durante la conversación no se vende.
- Una interacción antigua refresca el estado actual.
- Ninguna prueba crea órdenes cuando el modo de creación está desactivado.
- `npm run lint` y `npm run build` finalizan correctamente.

## Despliegue

1. Implementar y verificar localmente.
2. Ejecutar pruebas del motor y del proveedor Meta.
3. Probar con el número de prueba y creación de órdenes desactivada.
4. Validar una conversación completa con botones, edición y notas.
5. Activar creación para una prueba controlada y comprobar Cocina e impresión.
6. Desplegar a producción conservando el interruptor inmediato del bot.

## Fuera de alcance

- Imágenes del menú.
- Catálogo comercial de Meta.
- Pagos con enlace.
- Promociones y favoritos automáticos.
- Seguimiento GPS del repartidor.

Estas funciones podrán añadirse después sin cambiar el modelo base de conversación.
