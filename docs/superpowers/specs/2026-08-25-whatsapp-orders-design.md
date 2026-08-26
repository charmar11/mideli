# Pedidos conversacionales por WhatsApp

Fecha: 2026-08-25
Estado: pendiente de revisión y aprobación del usuario
Proveedor piloto y producción: WhatsApp Cloud API de Meta

## Objetivo

Agregar a Mideli un canal de venta por WhatsApp que permita conversar de forma natural, armar un carrito con el menú real, confirmar domicilio y pago, crear el pedido una sola vez y continuar el flujo existente de Cocina, impresión, Estado y cobro.

El diseño prioriza conversión, velocidad y recuperación de ventas. El cliente no crea una cuenta ni completa formularios largos. Su número de WhatsApp identifica la conversación y permite reutilizar domicilios y pedidos anteriores.

## Alcance inicial

- Conversación principalmente escrita, con botones solo para confirmar, corregir o solicitar atención.
- Número de prueba de Meta durante el desarrollo.
- Simulador local antes de conectar mensajes reales.
- Interpretación determinista basada en catálogo, sinónimos, cantidades, contexto y coincidencia flexible.
- Transferencia a una persona cuando exista ambigüedad repetida.
- Pedidos para domicilio y para recoger.
- Domicilios guardados y enlace gratuito de Google Maps.
- Pausas temporales de productos o variaciones y propuestas de sustitución.
- Venta adicional contextual, un solo ofrecimiento relevante por pedido.
- Estados automáticos del pedido y bandeja operativa para el personal.
- Métricas de conversión, recompra, abandono y venta adicional.

## Fuera de alcance inicial

- Rastreo GPS del repartidor.
- Google Maps API de pago.
- Cobro automático con tarjeta dentro de WhatsApp.
- Campañas masivas o mensajes de marketing sin consentimiento.
- Reservaciones, puntos o programa de lealtad.
- Dependencia obligatoria de un modelo de lenguaje pagado.
- Cambios automáticos de disponibilidad basados en inventario.

## Aislamiento y seguridad de desarrollo

La implementación vive en la rama `codex/whatsapp-orders`. Mientras se desarrolla:

- No se despliega a Vercel.
- No se aplican migraciones a Supabase remoto.
- No se conecta el número real del negocio.
- El proveedor inicia como `simulator` y el modo de escritura como `dry-run`.
- Las pruebas del motor no crean pedidos, no descuentan inventario, no afectan caja y no imprimen.
- El webhook real se prueba contra localhost mediante un túnel HTTPS temporal.
- Las credenciales se guardan solo en variables de entorno ignoradas por Git.
- Ningún token, secreto o contenido sensible se registra en consola o Sentry.

Variables previstas:

- `WHATSAPP_ORDERS_ENABLED`
- `WHATSAPP_PROVIDER=simulator|meta`
- `WHATSAPP_DRY_RUN`
- `META_WHATSAPP_ACCESS_TOKEN`
- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_WHATSAPP_WABA_ID`
- `META_WHATSAPP_VERIFY_TOKEN`
- `META_APP_SECRET`

Los valores no se documentan ni se versionan.

## Arquitectura

El canal se divide en unidades independientes:

1. Adaptador de proveedor: recibe y envía mensajes mediante simulador o Meta.
2. Webhook: verifica Meta, normaliza eventos y evita duplicados.
3. Motor conversacional: mantiene contexto, detecta intención y decide la siguiente pregunta.
4. Catálogo conversacional: busca productos, alias y variaciones en el menú vigente.
5. Carrito: conserva productos, cantidades, notas y modificadores.
6. Clientes y domicilios: reconoce teléfono y recupera datos confirmados previamente.
7. Validador comercial: recalcula precios, verifica productos activos y pausas operativas.
8. Creador externo de pedidos: registra la orden de forma transaccional e idempotente.
9. Bandeja del personal: permite tomar la conversación sin perder el carrito.
10. Notificador de estados: comunica únicamente cambios útiles al cliente.

El motor nunca escribe directamente en `orders`. La creación pasa por una función exclusiva del servidor que vuelve a validar toda la información.

## Flujo conversacional

### Inicio

El bot usa un tono cercano, breve y profesional. Si reconoce al cliente, ofrece continuar un carrito o repetir su último pedido. Si es nuevo, pregunta qué desea ordenar. No presenta un formulario ni obliga a usar comandos.

### Interpretación y carrito

El cliente puede escribir frases como `quiero dos California y boneless BBQ de 12 con papas`. El sistema identifica coincidencias seguras y pregunta solo lo faltante. Después de cada modificación confirma brevemente el contenido y total acumulado.

Si hay más de una interpretación posible, muestra alternativas reales. Después de dos dudas consecutivas ofrece atención humana. El carrito permanece intacto durante la transferencia.

### Venta adicional

Se permite una sugerencia por pedido, elegida por contexto:

- Bebida cuando el carrito no contiene una.
- Complemento compatible con hamburguesas o boneless.
- Topping disponible para sushi.
- Cantidad de bebidas coherente con un pedido para varias personas.

La recomendación nunca se agrega por defecto y siempre puede rechazarse escribiendo normalmente.

### Entrega o recolección

Para domicilio, un cliente recurrente puede reutilizar un domicilio confirmado. Un cliente nuevo comparte ubicación o escribe dirección. Referencias y etiqueta del domicilio son opcionales. El teléfono se obtiene de WhatsApp.

Antes de solicitar al repartidor se completa método de pago, cambio requerido y costo de envío. Un enlace universal de Google Maps abre la ruta sin clave ni API pagada.

### Confirmación

El bot presenta productos, modificadores, domicilio, costo de envío, total y forma de pago. Solo una confirmación explícita, como `sí`, permite crear el pedido. `Modificar`, `cancelar` o una corrección escrita regresan al carrito.

## Pedidos, caja e idempotencia

La nueva función de creación externa será accesible solo desde servidor y validará:

- Firma válida del proveedor.
- Identificador de mensaje no procesado anteriormente.
- Turno de caja abierto.
- Productos activos existentes.
- Variaciones compatibles con el producto.
- Ausencia de pausas temporales aplicables.
- Cantidades positivas.
- Precios y extras recalculados desde la base.
- Total calculado por Mideli, nunca por texto generado.

El pedido se registra con origen `whatsapp`, `created_by` nulo y referencia a su conversación. El identificador externo y la clave de creación impiden duplicados durante reintentos.

Si no existe turno abierto, el bot no promete preparación. Informa que requiere atención y entrega la conversación al personal.

## Modelo de datos propuesto

- `customers`: teléfono normalizado, nombre, última actividad y consentimiento de contacto.
- `customer_addresses`: domicilio, etiqueta, referencia, coordenadas opcionales y última utilización.
- `channel_conversations`: proveedor, teléfono, estado, paso actual, carrito y responsable humano.
- `channel_messages`: identificador externo único, dirección, tipo, estado y contenido con retención limitada.
- `menu_sale_pauses`: producto u opción, motivo, actor, inicio y vencimiento.
- Extensiones de `orders`: origen, conversación, teléfono, domicilio histórico, referencia, costo de envío e identificador externo.

Todas las tablas tendrán RLS. Owner y admin administran; waiter y supervisor atienden conversaciones; kitchen ve únicamente pedidos confirmados. El webhook usa un cliente de servidor y nunca expone la clave de servicio al navegador.

## Pausas temporales y sustituciones

No regresa el sistema `Disponible, Limitado y Agotado`. El inventario continúa permitiendo valores negativos.

Cocina, supervisor, owner y admin pueden pausar un producto u opción por 30 minutos, hasta el día siguiente o hasta reactivarlo. El mesero puede reportar el problema, pero no pausa directamente.

El bot excluye elementos pausados de recomendaciones y vuelve a validar antes de confirmar. Si algo se pausa durante una conversación, conserva el carrito y propone alternativas de la misma categoría y precio aproximado. Si el pedido ya fue creado, pasa a atención humana para sustitución, ajuste o cancelación auditada.

## Bandeja operativa

La navegación operativa incorporará `WhatsApp` para owner, admin, supervisor y waiter. Tendrá estados:

- Nuevas.
- Esperando al cliente.
- Requieren atención.
- Pedido confirmado.
- Abandonadas.

El personal puede tomar la conversación, responder, editar el carrito y devolverla al bot. Cocina no administra conversaciones.

## Despacho

Cuando un pedido a domicilio esté listo, Estado muestra domicilio, referencia, cobro y un botón `Compartir con repartidor`. La hoja de compartir del dispositivo permite elegir el grupo existente de WhatsApp. El mensaje incluye pedido, teléfono, dirección, referencia, total, método de pago, cambio y URL de Google Maps.

Los estados operativos para el cliente son: recibido, en preparación, listo, enviado y entregado. El cambio a enviado y entregado es manual.

## Recuperación de ventas y métricas

Un carrito abandonado puede recibir un solo recordatorio dentro de la ventana permitida de atención. No se realizan campañas en la primera versión.

Analíticas medirá:

- Conversaciones iniciadas.
- Carritos creados y pedidos confirmados.
- Conversión y abandono por etapa.
- Tiempo hasta confirmar.
- Ticket promedio de WhatsApp.
- Aceptación de venta adicional.
- Clientes recurrentes y pedidos repetidos.
- Carritos recuperados.
- Transferencias a personal.
- Pausas, sustituciones aceptadas y ventas afectadas.

Los eventos de prueba y `dry-run` no entran en métricas comerciales.

## Webhook de Meta

La ruta prevista es `/api/integraciones/whatsapp/meta`. Soporta:

- Verificación GET mediante un token privado acordado con Meta.
- Validación criptográfica de POST mediante el secreto de la aplicación.
- Suscripción al campo `messages`.
- Dedupe por identificador de mensaje.
- Respuesta rápida y reintentos seguros.
- Estados enviado, entregado, leído y fallido.
- Lista permitida de teléfonos durante el piloto.

El token temporal de Meta se usa solo para la prueba inicial. Antes de producción se reemplaza por un token de usuario del sistema con permisos mínimos.

## Pruebas

### Automatizadas

- Interpretación de cantidades, alias y errores ortográficos.
- Variaciones requeridas y múltiples.
- Modificación y cancelación del carrito.
- Precio recalculado y rechazo de datos manipulados.
- Duplicados y reintentos.
- Pausas y sustituciones.
- Domicilio nuevo y reutilizado.
- Confirmación explícita.
- Transferencia humana.
- Verificación del webhook y permisos.

### Manuales locales

1. Simulador con repositorios falsos y `dry-run`.
2. Base Supabase local, si el entorno está disponible, con catálogo de prueba.
3. Meta test number conectado a localhost mediante túnel HTTPS.
4. Conversación completa sin crear pedido.
5. Pedido controlado en entorno local y verificación de Cocina, impresión y estados.

Se ejecutan `npm run lint`, `npm run build` y `npm run test:e2e`. Las migraciones se inspeccionan con dry-run y no se aplican remotamente.

## Puertas de liberación

Cada transición requiere aprobación explícita:

1. Aprobar especificación.
2. Aprobar implementación local en dry-run.
3. Aprobar prueba con el número de Meta.
4. Aprobar migración remota.
5. Aprobar variables en Vercel.
6. Aprobar despliegue.
7. Aprobar activación del número real.

## Criterios de aceptación

- El cliente completa pedidos comunes escribiendo naturalmente.
- Ningún producto, variación o precio es inventado.
- Un reintento no duplica pedidos.
- Un carrito sobrevive a dudas, desconexión y transferencia humana.
- Los elementos pausados generan alternativas antes de confirmar.
- El pedido confirmado sigue el flujo actual de Cocina e impresión.
- El domicilio puede compartirse al repartidor con una ruta utilizable.
- Las pruebas locales no afectan ventas, caja, inventario ni analíticas reales.
- Ningún secreto o dato sensible aparece en código, Git, logs o Sentry.
