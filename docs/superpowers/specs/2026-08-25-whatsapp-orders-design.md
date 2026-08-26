# Pedidos conversacionales por WhatsApp

Fecha: 2026-08-25

Estado: diseño funcional aprobado por el usuario

Proveedor: WhatsApp Cloud API de Meta

## 1. Objetivo

Agregar a Mideli un canal de venta por WhatsApp que permita conversar de forma natural, consultar el menú real, armar un carrito, cotizar un domicilio, confirmar el pago solicitado y crear un pedido dentro del flujo vigente de Cocina, impresión, Estado, caja, inventario e Historial.

El cliente no crea una cuenta ni completa formularios largos. Su número identifica la conversación y permite recuperar su carrito y domicilios confirmados. El sistema debe maximizar la conversión sin inventar productos, precios, ingredientes, promociones, disponibilidad ni tarifas.

## 2. Principios aprobados

- Mensajes cortos, amigables y fáciles de leer en un teléfono.
- Conversación escrita sin botones ni imágenes durante la primera versión.
- Respuestas inmediatas, con operaciones lentas ejecutadas sin bloquear el webhook.
- Menú paginado con un máximo de cinco productos por mensaje.
- Información real del catálogo, incluyendo descripción, ingredientes, variaciones, extras y precios.
- Pedido para recoger o domicilio.
- Domicilio con tarifa por distancia y recargo por colonia.
- Pago a domicilio únicamente en efectivo o transferencia.
- Confirmación explícita antes de crear un pedido.
- Atención humana sin perder conversación ni carrito.
- Mensajes automáticos vinculados a estados reales de preparación y reparto.
- Conservación limitada de conversaciones para diagnóstico.
- Activación gradual mediante controles independientes.

## 3. Fuera de alcance inicial

- Rastreo GPS del repartidor.
- Tiempo estimado de preparación o entrega.
- Pago mediante enlaces, tarjeta o pasarela dentro de WhatsApp.
- Imágenes del menú.
- Botones, listas interactivas o formularios de Meta.
- Promociones, favoritos y campañas masivas.
- Reservaciones, lealtad o puntos.
- Cambios automáticos de disponibilidad basados en inventario.
- Mensaje automático de pedido entregado.
- Dependencia obligatoria de un modelo de lenguaje pagado.

## 4. Organización administrativa

La administración incorporará un módulo llamado **WhatsApp y pedidos en línea**. Debe respetar la interfaz oscura de Mideli, funcionar en móvil y tablet y organizarse en las siguientes pestañas.

### 4.1 Resumen

- Estado de la conexión con Meta.
- Pedidos recibidos hoy.
- Conversaciones activas.
- Carritos abandonados.
- Transferencias a personal.
- Errores que requieren atención.

### 4.2 Conversaciones

- Bandeja de clientes.
- Estado de la conversación.
- Historial de mensajes.
- Carrito actual.
- Domicilio y forma de pago solicitada.
- Responsable humano.
- Acciones para tomar, responder, devolver al bot o cerrar.

### 4.3 Catálogo

- Categorías visibles.
- Control independiente **Disponible en WhatsApp** por producto.
- Descripciones, precios, variaciones y extras consumidos desde el menú real.
- Orden igual al configurado en Menú.
- Vista previa textual de la respuesta.

### 4.4 Entregas

- Dirección y coordenadas del local.
- Rangos de distancia editables.
- Recargos por colonia y alias.
- Cobertura automática máxima.
- Prueba manual de una dirección.
- Domicilios confirmados y cotizaciones reutilizables.

### 4.5 Horarios

- Horario configurable por cada día de la semana.
- Valor inicial de 12:00 p. m. a 11:00 p. m.
- Zona horaria **America/Hermosillo**.
- Cierre temporal.
- Fechas especiales y vacaciones.
- Mensaje fuera de horario.

### 4.6 Atención humana

- Roles autorizados.
- Conversaciones esperando atención.
- Responsable actual.
- Preferencias de notificación por usuario y dispositivo.
- Reglas de transferencia automática.

### 4.7 Configuración del bot

- Saludo y tono.
- Máximo de productos por mensaje.
- Uso moderado de emojis.
- Mensajes de confirmación.
- Reglas de seguridad.

### 4.8 Historial y diagnóstico

- Mensajes enviados, recibidos y fallidos.
- Pedidos relacionados.
- Direcciones no reconocidas.
- Frases no entendidas.
- Reintentos y deduplicación.
- Auditoría administrativa.
- Ningún token o secreto visible.

## 5. Arquitectura

La integración se divide en servicios independientes.

1. **Adaptador de Meta:** recibe y envía mensajes.
2. **Webhook:** verifica la firma, normaliza eventos y responde rápidamente.
3. **Deduplicación:** impide procesar dos veces el mismo mensaje o crear dos pedidos.
4. **Motor conversacional:** mantiene el paso, contexto, intención y siguiente pregunta.
5. **Catálogo conversacional:** consulta categorías, productos, modificadores y alias.
6. **Carrito:** conserva cantidades, notas, variaciones y extras.
7. **Clientes y domicilios:** reconoce el teléfono y recupera información confirmada.
8. **Cotizador de entrega:** valida dirección, calcula ruta y aplica reglas comerciales.
9. **Validador canónico:** vuelve a consultar catálogo, precios y configuración.
10. **Creador externo:** registra el pedido de forma transaccional e idempotente.
11. **Bandeja humana:** permite que una persona controle la conversación.
12. **Notificador de estados:** envía únicamente transiciones reales.

El motor conversacional no escribe directamente en pedidos, pagos, inventario ni caja. Solo prepara una intención estructurada. El backend de Mideli valida y ejecuta las operaciones.

Flujo principal:

Mensaje de Meta → validar firma → deduplicar → identificar cliente → recuperar conversación → interpretar → actualizar carrito → validar menú → cotizar domicilio → confirmar → crear pedido → Cocina e impresión → notificar estados.

## 6. Flujo conversacional

### 6.1 Inicio y exploración

El bot saluda brevemente y pregunta qué desea ordenar. Si el cliente escribe un pedido completo, intenta procesarlo sin obligarlo a recorrer categorías.

Si necesita orientación:

- Muestra categorías de alimentos.
- Presenta un máximo de cinco productos.
- Cada producto incluye nombre, precio y descripción.
- Acepta respuesta por número, nombre o lenguaje natural.
- Entiende **más**, **volver** y cambios de categoría.
- No promociona bebidas alcohólicas.
- Cervezas y caguamas aparecen únicamente cuando el cliente las solicita.

### 6.2 Selección y modificadores

- Valida que el producto y su categoría estén activos.
- Valida que **Disponible en WhatsApp** esté activado.
- Pregunta únicamente variaciones requeridas.
- Respeta grupos de una opción o selección múltiple.
- Ofrece extras relacionados una sola vez.
- Muestra la información completa de toppings y variaciones de sushi.
- Confirma brevemente cada producto agregado.

### 6.3 Bebidas

Después de terminar los alimentos, el bot pregunta una sola vez:

> 🥤 ¿Deseas agregar alguna bebida?

Si la respuesta es afirmativa, muestra hasta cinco bebidas sin alcohol activas y disponibles en WhatsApp. Si la respuesta es negativa, no insiste. Las bebidas alcohólicas solo se muestran por solicitud explícita.

### 6.4 Carrito

El cliente puede agregar, quitar, cambiar cantidades, modificar notas o sustituir elementos antes de confirmar. El subtotal se actualiza después de cada cambio relevante.

### 6.5 Tipo de pedido

El bot pregunta si el pedido es para recoger o domicilio.

Para recoger:

- Confirma nombre y teléfono.
- El cobro se realiza en el flujo existente del local.

Para domicilio:

- Recupera un domicilio anterior o solicita dirección o ubicación.
- Confirma una referencia cuando ayude a encontrar el lugar.
- Cotiza distancia y recargo.
- Solicita efectivo o transferencia.
- Si es efectivo, pregunta con cuánto pagará.
- El pedido se crea pendiente de pago.
- El cobro real continúa en **Cobrar y entregar**.

### 6.6 Confirmación

Antes de crear el pedido muestra:

- Productos y cantidades.
- Variaciones, extras y notas.
- Subtotal.
- Domicilio y referencia.
- Costo de envío.
- Total.
- Forma de pago solicitada.
- Cantidad con la que pagará cuando corresponda.

Solo una confirmación explícita permite crear el pedido. Si el cliente modifica algo, el backend recalcula y vuelve a solicitar confirmación.

## 7. Catálogo y disponibilidad

El bot utiliza el menú real de Mideli.

Un producto solo se ofrece cuando:

- Su categoría está activa.
- El producto está activo.
- **Disponible en WhatsApp** está activado.

Esta opción controla únicamente la visibilidad en WhatsApp. No introduce los estados Disponible, Limitado o Agotado y no afecta el POS. El inventario puede continuar en negativo y nunca ocultará automáticamente un producto.

Si un producto o modificador deja de estar disponible durante una conversación:

1. Se elimina de la confirmación.
2. Se explica el cambio.
3. Se proponen hasta tres alternativas reales de la misma categoría.
4. Se recalcula el total.

No habrá promociones, favoritos ni recomendaciones comerciales automáticas en esta fase.

## 8. Domicilios y tarifa

### 8.1 Servicios de Google

La dirección escrita se normaliza mediante Geocoding y la distancia por carretera se obtiene mediante Routes. Una ubicación compartida puede utilizar sus coordenadas directamente.

El sistema debe:

- Guardar coordenadas y cotización de domicilios confirmados.
- Evitar consultas repetidas para la misma dirección.
- Configurar cuotas diarias.
- Registrar errores sin exponer datos sensibles.
- Transferir a una persona si la dirección es ambigua.
- No inventar una tarifa cuando Google no pueda calcular la ruta.

### 8.2 Rangos aprobados

| Distancia por carretera | Tarifa |
|---|---:|
| 0 a 4 km | $30 |
| Más de 4 a 5 km | $35 |
| Más de 5 a 6 km | $40 |
| Más de 6 a 7 km | $45 |
| Más de 7 a 8 km | $50 |
| Más de 8 a 9 km | $55 |
| Más de 9 a 9.9 km | $60 |
| Hasta 10 km | $65 |
| Hasta 11 km | $70 |
| Hasta 12 km | $75 |
| Hasta 13 km | $80 |
| Hasta 14 km | $85 |
| Hasta 15 km | $90 |

Las reglas se almacenan como rangos editables, no como condicionales fijas en la interfaz.

### 8.3 Recargos aprobados

| Colonia o alias | Recargo |
|---|---:|
| Beltrones | $10 |
| Pioneros | $10 |
| Lomas | $10 |
| Providencia | $10 |
| UNISON | $10 |
| Esperanza | $15 |
| Santa Catalina | $15 |
| Villa Bonita | $15 |

**Envío a paquetería** y **Realizar una compra** no forman parte del pedido de un cliente y no se cargan como colonias.

La tarifa final es:

Tarifa del rango + recargo de colonia = costo de envío.

Si la ruta supera 15 km, el sistema no cotiza ni confirma automáticamente. Transfiere la conversación a atención humana.

## 9. Horarios

El horario se configura por día desde administración. La configuración inicial es de 12:00 p. m. a 11:00 p. m. en **America/Hermosillo**.

El administrador puede:

- Definir apertura y cierre por cada día.
- Marcar un día cerrado.
- Crear excepciones por fecha.
- Cerrar temporalmente el canal.
- Personalizar el mensaje fuera de horario.

Fuera del horario:

- Se conserva el mensaje y el carrito.
- No se crea un pedido ni se promete preparación.
- Se informa cuándo vuelve a abrir.
- No se envían alertas repetitivas al personal durante la noche.

## 10. Atención humana

La transferencia ocurre cuando:

- El cliente la solicita.
- El bot no entiende después de dos intentos.
- La dirección es ambigua.
- La distancia supera 15 km.
- Existe una solicitud especial insegura.
- Falla la creación del pedido.
- El mensaje contiene una queja que requiere atención.

Estados de bandeja:

- Esperando atención.
- Atendida.
- Esperando al cliente.
- Pedido confirmado.
- Cerrada.

Owner, admin, supervisor y mesero autorizado pueden atender. Cocina no administra conversaciones.

Al tomar una conversación:

- Se registra el responsable.
- El bot deja de responder.
- Nadie más puede responder simultáneamente.
- El responsable ve historial, carrito, domicilio y contexto.
- Puede editar el carrito antes de confirmar.
- Puede devolver la conversación al bot o cerrarla.

Cada usuario puede activar o desactivar sus notificaciones en cada dispositivo.

## 11. Estados comunicados al cliente

Los estados de cocina, entrega y pago permanecen separados.

### 11.1 Domicilio

1. Al crear el pedido:
   - **✅ Recibimos tu pedido #123.**
2. Cocina pulsa **Empezar a preparar**:
   - **👨‍🍳 Tu pedido #123 ya está en preparación.**
3. Cocina pulsa **Marcar como listo**:
   - El sistema cambia automáticamente a búsqueda de repartidor.
   - Envía un solo mensaje: **✅ Tu pedido #123 está listo. 🛵 Ya estamos buscando repartidor.**
4. El personal confirma al repartidor:
   - **📍 Tu pedido #123 ya va en camino.**

No se envía un aviso automático de entregado.

Si el cliente escribe que el pedido ya llegó:

- El bot agradece brevemente.
- Cierra la conversación.
- Registra la confirmación del cliente.
- No marca automáticamente el pedido como pagado.

### 11.2 Recoger

- Pedido recibido.
- En preparación.
- Listo para recoger.

Cada aviso se envía una sola vez. La interfaz muestra si fue enviado, entregado, leído o falló y permite reintentar manualmente un fallo.

## 12. Seguridad, idempotencia y errores

- Meta debe superar validación de firma.
- Cada mensaje externo tiene un identificador único.
- Cada creación externa tiene una clave idempotente.
- La IA interpreta texto, pero no calcula ni persiste valores comerciales.
- Productos y precios se consultan otra vez antes de confirmar.
- El total lo calcula Mideli.
- El pedido requiere un turno de caja abierto.
- Si no hay turno, pasa a atención humana y no promete preparación.
- Si un precio cambia, se muestra el total nuevo y se solicita otra confirmación.
- Si Google, Meta o Supabase fallan, se conserva el carrito.
- Antes de reintentar una creación se comprueba si el pedido ya existe.
- Un pedido confirmado no se modifica automáticamente.
- Mensajes de voz, imágenes y solicitudes especiales pasan a una persona cuando no puedan resolverse con seguridad.
- Ningún secreto o contenido operativo se registra en consola o Sentry.

El pedido confirmado usa el flujo canónico de Mideli para Cocina, impresión, Estado, caja, inventario e Historial.

## 13. Retención y permisos

Las conversaciones completas se conservan durante 90 días. Después:

- Se elimina el contenido de los mensajes.
- Se conservan métricas anónimas de conversión, abandono y errores.
- Los pedidos permanecen en Historial conforme a las reglas del POS.

Datos operativos permitidos:

- Teléfono y nombre proporcionado.
- Domicilios confirmados.
- Carrito y pedido relacionado.
- Responsable humano.
- Estados de envío del mensaje.
- Errores de interpretación o entrega.

Permisos:

- **Owner y admin:** configuración, conversaciones e historial.
- **Supervisor:** conversaciones, atención y diagnóstico, sin credenciales.
- **Mesero autorizado:** conversaciones activas y tomadas.
- **Cocina:** solo pedidos confirmados necesarios para preparar.

Toda modificación de horarios, tarifas, colonias y catálogo queda auditada. El personal puede eliminar un domicilio cuando el cliente no quiera reutilizarlo.

## 14. Controles de activación

Habrá controles independientes para:

- Recibir mensajes.
- Responder automáticamente.
- Crear pedidos.
- Calcular domicilios.
- Enviar cambios de estado.
- Permitir atención humana.

El propietario o administrador puede suspender inmediatamente el canal sin apagar el POS.

Variables de entorno previstas:

- `WHATSAPP_ORDERS_ENABLED`
- `WHATSAPP_PROVIDER=simulator|meta`
- `WHATSAPP_DRY_RUN`
- `META_WHATSAPP_ACCESS_TOKEN`
- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_WHATSAPP_WABA_ID`
- `META_WHATSAPP_VERIFY_TOKEN`
- `META_APP_SECRET`
- Variables de Google Maps necesarias en servidor.

Los valores nunca se documentan ni versionan.

## 15. Modelo de datos

La implementación debe revisar y reutilizar las migraciones ya creadas antes de agregar estructura.

Entidades necesarias:

- Clientes.
- Domicilios confirmados con coordenadas.
- Conversaciones y responsable.
- Mensajes y estado de entrega.
- Carrito conversacional.
- Preferencia **Disponible en WhatsApp**.
- Horarios y excepciones.
- Rangos de entrega.
- Colonias y alias con recargo.
- Cotizaciones de domicilio.
- Eventos idempotentes.
- Enlace del pedido con conversación y origen.
- Confirmación de recepción por el cliente.
- Auditoría administrativa.

Todas las tablas nuevas tienen RLS. El webhook opera exclusivamente en servidor. La clave de servicio nunca llega al navegador.

## 16. Pruebas y activación

### 16.1 Desarrollo local

- Número de prueba de Meta.
- Respuestas y carritos habilitados.
- Creación real desactivada.
- Sin efectos en Cocina, caja, impresión o inventario.

### 16.2 Validación funcional

- Productos, alias y errores ortográficos.
- Variaciones requeridas y múltiples.
- Extras y notas.
- Bebida ofrecida una sola vez.
- Recoger y domicilio.
- Rangos, colonias y límite de 15 km.
- Horarios y días cerrados.
- Efectivo y transferencia.
- Atención humana.
- Producto desactivado durante el carrito.
- Mensajes duplicados, reconexión y reintentos.
- Confirmación explícita.
- Cambios de precio.

### 16.3 Prueba integral supervisada

- Activar temporalmente la creación.
- Crear un pedido completo.
- Verificar Cocina, impresión, Estado, Historial, inventario y caja.
- Verificar avisos de preparación, listo, búsqueda de repartidor y en camino.
- Suspender la integración ante cualquier error.

### 16.4 Piloto

- Números autorizados.
- Personal supervisando la bandeja.
- Métricas de errores, abandono y conversión.
- Interruptor de emergencia.

### 16.5 Producción

- Número real.
- Credenciales permanentes.
- Webhook estable.
- Cuotas de Google.
- Procedimiento de respaldo y reversión.
- Activación gradual.

Se ejecutan `npm run lint`, `npm run build` y las pruebas relevantes. Cualquier migración requiere revisión con dry-run y aprobación explícita antes de aplicarse remotamente.

## 17. Puertas de liberación

Cada transición necesita aprobación explícita:

1. Aprobar la especificación.
2. Aprobar el plan de implementación.
3. Aprobar la implementación local en dry-run.
4. Aprobar la prueba integral.
5. Aprobar migraciones remotas.
6. Aprobar variables y despliegue.
7. Aprobar activación del número real.

## 18. Criterios de aceptación

- Un cliente completa un pedido común escribiendo naturalmente.
- El menú muestra hasta cinco productos y nunca inventa información.
- Las bebidas se ofrecen una sola vez.
- Un domicilio válido obtiene tarifa por ruta, rango y colonia.
- Más de 15 km y domicilios ambiguos pasan a una persona.
- Domicilio acepta únicamente efectivo o transferencia.
- Un reintento no duplica mensajes ni pedidos.
- El carrito sobrevive a dudas, fallos y transferencia humana.
- Un producto oculto de WhatsApp no se ofrece y sigue disponible en el POS.
- El inventario negativo no oculta productos.
- El pedido confirmado utiliza Cocina, impresión, Estado, caja, inventario e Historial existentes.
- Los cambios de cocina generan los mensajes aprobados.
- No se envía un aviso automático de entregado.
- El personal puede atender sin respuestas simultáneas del bot.
- Las pruebas locales no afectan ventas reales.
- Ningún secreto aparece en código, Git, logs o Sentry.
