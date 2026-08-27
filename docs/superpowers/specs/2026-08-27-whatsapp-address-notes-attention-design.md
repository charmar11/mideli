# Confirmación de domicilio, notas y alertas de atención en WhatsApp

Fecha: 2026-08-27

## Estado

Diseño aprobado por el usuario. Pendiente de revisión final antes de implementar.

## Objetivo

Mejorar la seguridad operativa de los pedidos por WhatsApp sin alterar el flujo comercial que ya funciona. El cliente debe confirmar el punto exacto de entrega antes de cotizar, poder escribir indicaciones de manera natural y el equipo debe recibir un aviso configurable cuando una conversación requiera atención humana.

## Alcance

La implementación comprende tres cambios relacionados:

1. Confirmación visual del domicilio mediante una ubicación estática de WhatsApp.
2. Captura y clasificación de notas para productos, pedido y acceso al domicilio.
3. Notificación Push por dispositivo cuando una conversación entra a atención humana.

No se cambiarán el catálogo, la selección de productos, la oferta de bebidas, los métodos de pago, la creación idempotente de órdenes ni el seguimiento posterior del pedido.

## 1. Confirmación visual del domicilio

### Problema

Actualmente una dirección escrita puede geocodificarse, cotizarse y guardarse sin que el cliente confirme que Google Maps encontró el punto correcto. Un error como `chichuahua` puede producir coordenadas plausibles, pero incorrectas.

### Flujo aprobado

Para una dirección nueva escrita:

1. El cliente escribe calle, número y colonia.
2. Mideli solicita y guarda la referencia opcional como hasta ahora.
3. El servidor geocodifica la dirección y evalúa su precisión.
4. Si el resultado es suficientemente preciso, Mideli conserva una cotización candidata sin marcarla como usada ni guardar el domicilio como confirmado.
5. Mideli envía una ubicación estática de WhatsApp con latitud, longitud, nombre y dirección normalizada.
6. Inmediatamente después envía un texto breve:

   ```text
   📍 Encontré este domicilio:
   Chihuahua Norte 110, ...

   ¿Es aquí? Responde sí o envía otra dirección o ubicación.
   ```

7. La conversación pasa a `awaiting_address_confirmation`.
8. Si el cliente confirma, la cotización candidata se vuelve válida, se guarda el domicilio confirmado y se presenta cobertura, distancia, tarifa y total.
9. Si el cliente rechaza el punto, se elimina la cotización candidata del estado y se solicita otra dirección o una ubicación compartida.

### Excepciones para reducir fricción

- Una ubicación compartida desde WhatsApp se considera una confirmación explícita del punto y no requiere otra pregunta.
- Un domicilio anterior que ya tenga confirmación registrada conserva el flujo corto de `¿Usamos tu domicilio anterior?`. Al responder sí se recalcula la tarifa con sus coordenadas guardadas y continúa.
- Un domicilio histórico sin confirmación registrada muestra el punto una vez antes de reutilizarse.
- Si Google devuelve un resultado poco preciso, Mideli no muestra ni cotiza ese punto. Solicita calle, número y colonia, o una ubicación compartida.
- Después de dos intentos imprecisos o rechazados, la conversación pasa a atención humana para evitar un ciclo frustrante.

### Mensajes de ubicación

El proveedor Meta se ampliará con `sendMetaLocationMessage`. El payload usará `type: "location"` y contendrá latitud, longitud, nombre y dirección. El envío de texto seguirá siendo independiente para que la pregunta sea legible y ambos mensajes puedan auditarse.

Si Meta rechaza únicamente el mensaje de ubicación, Mideli enviará un enlace de Google Maps con las mismas coordenadas y la pregunta de confirmación. Si también falla el texto, se aplicará el manejo de fallos salientes existente.

### Persistencia

Se propone una migración nueva con los siguientes cambios:

- Agregar `awaiting_address_confirmation` al control de etapas de `channel_conversations`.
- Agregar a `customer_addresses`:
  - `confirmed_at timestamptz null`.
  - `confirmation_method text null`, limitado a `text_confirmation` y `shared_location`.
- Agregar a `whatsapp_delivery_quotes` un estado candidato o campos equivalentes para distinguir `pending_confirmation` de `quoted`.

El estado conversacional conservará:

- La dirección original escrita por el cliente.
- La dirección normalizada.
- Las coordenadas candidatas.
- La cotización candidata.
- El número de intentos de confirmación.
- Si el origen fue texto, domicilio guardado o ubicación compartida.

Una cotización candidata no puede crear una orden. `request_order_creation` seguirá exigiendo una cotización confirmada para domicilio.

## 2. Notas naturales y acceso al domicilio

### Principio de experiencia

No se añadirá una pregunta obligatoria de notas. El cliente podrá escribir indicaciones en cualquier momento y el resumen final le recordará de forma breve que todavía puede modificarlas antes de confirmar.

Ejemplos aceptados:

- `Mitad BBQ y mitad Buffalo`.
- `La hamburguesa sin cebolla`.
- `El California sin spicy`.
- `Privada, PIN 1234`.
- `Casa blanca, tocar el timbre`.

### Clasificación

Las indicaciones se clasifican en tres destinos:

1. **Producto:** preparación asociada a una línea del carrito. Se guarda en `ConversationCartLine.notes` y luego en `order_items.notes`.
2. **Pedido:** instrucción general que se guarda en `orders.notes`.
3. **Entrega o acceso:** caseta, privada, PIN, referencia exterior o instrucciones para encontrar el domicilio. Se guarda en `delivery_reference` o en una estructura separada dentro del estado antes de crear la orden.

La interpretación seguirá un esquema híbrido:

- Reglas deterministas para frases frecuentes, PIN, caseta, referencias y palabras de modificación.
- Gemini únicamente para clasificar lenguaje natural ambiguo en una respuesta estructurada.
- Validación local de producto, cantidad y destino antes de cambiar el estado.

Gemini nunca podrá agregar productos, alterar precios ni confirmar una orden por sí solo.

### Ambigüedad

Cuando la nota mencione claramente un producto, se aplicará a esa línea. Si hay varias líneas compatibles o no se identifica el destino, Mideli hará una sola pregunta breve, por ejemplo:

```text
¿La indicación es para los boneless o para todo el pedido?
```

Si la nota pide una preparación que no puede garantizarse por los modificadores configurados, se conserva como indicación para Cocina. Si contradice el producto o altera el precio, la conversación requiere atención humana en vez de prometer algo incorrecto.

### Resumen final

Las secciones solo aparecen cuando contienen información:

```text
Indicaciones: Boneless mitad BBQ y mitad Buffalo
Acceso: Privada, PIN 1234
```

El resumen conserva productos, subtotal, domicilio, envío, pago y total. No se agregan preguntas adicionales si no existen notas.

### Privacidad y superficies operativas

- Las notas de producto aparecen en Cocina, ticket de Cocina y detalle del pedido.
- Las notas generales aparecen en el detalle operativo y donde ya se muestran notas del pedido.
- El PIN y las indicaciones de acceso aparecen en la tarjeta de reparto y el detalle de entrega.
- El PIN no aparece en Push, listado de conversaciones, ticket de Cocina ni texto de vista previa.
- La limpieza del chat no elimina las notas que ya formen parte de una orden confirmada.

## 3. Avisos Push de atención humana

### Nuevo tema por dispositivo

Se agregará `whatsapp_attention` como tercer tema independiente junto a `kitchen` y `ready`. Su columna persistente será `whatsapp_attention_alerts` dentro de `push_subscriptions`.

Cada dispositivo podrá activarlo o pausarlo desde la sección de WhatsApp. El valor inicial será desactivado para no notificar a empleados fuera del trabajo.

Roles permitidos:

- Propietario.
- Administrador.
- Supervisor.
- Mesero.

Cocina no se incluye salvo que su perfil también tenga acceso operativo a WhatsApp mediante uno de esos roles.

### Disparo e idempotencia

La alerta se crea únicamente cuando una conversación cambia de un estado automático a `handoff`. Los mensajes adicionales mientras continúa en atención no generan nuevas alertas.

Si el personal devuelve la conversación al bot y posteriormente ocurre otro relevo, se considera un nuevo ciclo y puede generar una nueva alerta.

La clave idempotente combinará conversación y ciclo de relevo. Un webhook duplicado de Meta no puede producir dos Push.

### Contenido

```text
💬 WhatsApp necesita atención
Un cliente está esperando respuesta. Toca para abrir la conversación.
```

La notificación no incluye mensajes, productos, domicilio, referencia ni PIN. Al tocarla abre `/dashboard/whatsapp` con la conversación seleccionada.

La bandeja y su contador son la fuente de verdad. Push es un aviso de mejor esfuerzo y su fallo no debe detener el webhook ni la respuesta al cliente.

## 4. Cambios por componente

### Motor conversacional

- Incorporar la etapa `awaiting_address_confirmation`.
- Distinguir cotización candidata de cotización confirmada.
- Resolver respuestas afirmativas, negativas y direcciones corregidas durante la confirmación.
- Detectar notas en cualquier etapa donde el carrito todavía sea editable.
- Incorporar un estado temporal para resolver notas ambiguas.
- Mantener la lógica actual de bebidas, cumplimiento, pago y confirmación.

### Runtime y proveedor Meta

- Enviar ubicación y texto como dos mensajes salientes auditables.
- Conservar reintentos y clasificación de errores existente.
- Registrar mensajes de ubicación con `message_type = location` y metadatos sin secretos.
- Ejecutar la alerta Push después de confirmar atómicamente la transición a `handoff`.

### Base de datos

- Crear una migración nueva. No modificar migraciones anteriores.
- Ampliar etapas, domicilios confirmados, cotizaciones candidatas y tema Push.
- Actualizar el RPC `set_push_notification_topic` para el tercer tema.
- Reutilizar el registro idempotente de eventos Push o crear un registro específico para conversaciones si la dependencia actual con `order_id` no permite eventos sin pedido.

### Interfaz

- Añadir el control `Avisos de atención` dentro de WhatsApp.
- Mostrar el estado de domicilio confirmado en la comanda sin añadir ruido al listado.
- Mostrar notas separadas por preparación y entrega.
- Abrir directamente el chat desde la notificación.

## 5. Errores y recuperación

- Geocodificación imprecisa: pedir corrección o ubicación, sin cotizar.
- Punto rechazado: invalidar candidato, no reutilizarlo accidentalmente.
- Fallo del mensaje de ubicación: enviar enlace de Maps como respaldo.
- Fallo de Push: registrar intento y mantener el chat en `Por atender`.
- Nota ambigua: una aclaración corta; si no se resuelve, relevo humano.
- Webhook repetido: conservar la idempotencia actual de mensajes, órdenes y alertas.
- Dirección confirmada cuya cotización vence antes de confirmar la orden: recalcular silenciosamente y volver a mostrar el total si cambió.

## 6. Verificación

Antes de habilitarlo en producción se probará en Preview y en modo sin creación de órdenes:

1. Dirección correcta escrita y confirmada.
2. Dirección con error ortográfico corregida por Google y aceptada.
3. Punto incorrecto rechazado y sustituido.
4. Dirección de baja precisión.
5. Ubicación compartida desde WhatsApp.
6. Reutilización de domicilio confirmado.
7. Domicilio histórico sin confirmar.
8. Nota para un producto.
9. Nota de mitad de sabores.
10. Nota general.
11. Privada con PIN y referencia.
12. Nota ambigua con aclaración.
13. Relevo humano con Push activado.
14. Relevo con Push pausado.
15. Webhook duplicado sin alerta duplicada.
16. Fallo de Push sin afectar el chat.
17. Orden final con notas correctas en Cocina y reparto.

Después se realizará una prueba con una orden real y se verificará que aparezca una sola vez en Cocina e impresión.

## 7. Despliegue

La liberación será gradual:

1. Migración revisada con `npx supabase db push --linked --dry-run`.
2. Despliegue Preview con creación de órdenes desactivada.
3. Pruebas de conversaciones y dispositivos.
4. Aplicación de migración remota.
5. Despliegue de producción.
6. Activación manual del aviso de atención en los dispositivos que deban recibirlo.

La confirmación de domicilio y las notas permanecerán integradas al motor una vez validadas. El nuevo tema Push siempre conservará control individual por dispositivo.

## Criterios de aceptación

- Ninguna dirección nueva escrita se cotiza como definitiva sin confirmación del cliente.
- Un punto compartido por WhatsApp evita preguntas redundantes.
- El cliente puede rechazar y corregir el domicilio sin perder el carrito.
- Las notas llegan a la superficie operativa correcta.
- Los datos de acceso no aparecen en superficies de Cocina ni notificaciones.
- Un relevo humano genera como máximo una alerta por ciclo.
- Pausar el tema de atención en un dispositivo no altera los demás temas ni otros dispositivos.
- El flujo existente de pedido, bebidas, pago, confirmación, Cocina y reparto no cambia fuera de estos puntos.
