# Comprensión conversacional robusta para pedidos por WhatsApp

## Objetivo

Permitir que cualquier cliente escriba como acostumbra, con mensajes breves, errores ortográficos, regionalismos, varias instrucciones o cambios de opinión, sin perder el carrito ni ejecutar decisiones dudosas.

La fase cubre texto, respuestas interactivas y ubicaciones compartidas. Las notas de voz e imágenes quedan fuera de alcance por ahora.

## Contrato de seguridad

No es técnicamente posible garantizar que un sistema comprenda correctamente el 100% de cualquier frase humana. Mideli garantizará en su lugar:

- Nunca inventar productos, precios, opciones, promociones o direcciones.
- Nunca perder el carrito por un mensaje no comprendido.
- Nunca ejecutar silenciosamente una interpretación ambigua.
- Conservar la etapa y la información validada mientras solicita una aclaración.
- Continuar funcionando con reglas locales cuando Gemini falle, exceda su tiempo o no tenga cuota.
- Convertir cada error real descubierto en una prueba permanente.

Un mensaje claro se ejecuta. Si existen dos interpretaciones razonables, el bot hace una sola pregunta concreta antes de modificar el pedido.

## Alcance funcional

El bot comprenderá:

- Saludos, despedidas, agradecimientos y conversación breve.
- Menú, categorías, productos, ingredientes, precios y disponibilidad.
- Uno o varios productos con cantidades y variaciones.
- Distribuciones como tres California, uno de res y dos de camarón.
- Correcciones, reemplazos, eliminaciones y cambios de cantidad.
- Referencias contextuales como el otro, ese, los dos, el segundo o mejor cámbialo.
- Notas para un producto, para todo el pedido o para la entrega.
- Consultas del carrito, subtotal y total.
- Terminar, continuar, regresar y cambiar de opinión.
- Recoger o domicilio expresado en cualquier mensaje.
- Captura, corrección y confirmación de dirección o ubicación.
- Efectivo, transferencia, cambio solicitado y correcciones del método de pago.
- Confirmación o modificación del resumen final.
- Horario, cobertura, envío, formas de pago y seguimiento del pedido.
- Solicitud explícita de atención humana.
- Mensajes ajenos al negocio mediante una redirección amable.

Una misma entrada puede contener varias intenciones. Por ejemplo, `sería todo, agrega una Pepsi, mándalo a domicilio y pago por transferencia` debe agregar la bebida, cerrar el carrito, cambiar el tipo de servicio y guardar el método de pago antes de solicitar únicamente la dirección.

## Arquitectura recomendada

Se usará un intérprete híbrido validado. Las reglas locales conservan el control de decisiones críticas y Gemini ayuda a comprender lenguaje libre. Gemini no modifica directamente el estado.

### 1. Normalizador de entrada

- Normaliza mayúsculas, acentos, espacios y variantes comunes.
- Separa contenido citado de la respuesta nueva.
- Reconoce identificadores de botones y listas sin depender de su texto visible.
- Conserva negaciones, cantidades y orden de las instrucciones.
- Detecta ubicación compartida y contenido no textual.

### 2. Extractor local de datos sensibles

Direcciones, ubicaciones, teléfonos, PIN de acceso y datos de pago se procesan localmente. En mensajes combinados, estos fragmentos se extraen antes de consultar Gemini. Gemini recibe únicamente el fragmento necesario para comprender productos, opciones o lenguaje ambiguo.

### 3. Planificador semántico

El resultado dejará de tener una sola intención y pasará a ser un plan ordenado con cero o más acciones:

- Consultar catálogo o información del negocio.
- Agregar, quitar, reemplazar o ajustar productos.
- Seleccionar o cambiar variaciones.
- Agregar una nota con alcance explícito.
- Cambiar servicio, domicilio o pago.
- Terminar, confirmar, cancelar o solicitar ayuda.
- Formular una pregunta de aclaración.

Cada acción incluirá referencias exactas al catálogo o al carrito, evidencia de la frase que la originó y nivel de confianza.

### 4. Resolución de contexto

Las referencias se resolverán usando la etapa, la última pregunta, el carrito y el producto recientemente mencionado. Nunca se resolverá `el otro` o `ese` si existen dos candidatos igualmente posibles.

El motor distinguirá preguntas de órdenes. `¿Tienen Pepsi?` consulta disponibilidad; `agrega una Pepsi` modifica el carrito.

### 5. Validador determinista

Antes de aplicar el plan se comprobará:

- Que el producto esté activo y visible en WhatsApp.
- Que cantidades, opciones y precios sean válidos.
- Que las variaciones requeridas estén completas.
- Que la acción sea válida para la etapa actual.
- Que dirección, tarifa y método de pago tengan el estado requerido.
- Que la operación no duplique un mensaje ya procesado.

La confianza del modelo nunca sustituye estas validaciones.

### 6. Aplicación atómica y aclaraciones

Las acciones inequívocas pueden aplicarse y las ambiguas quedan pendientes. La respuesta indicará brevemente qué se guardó y preguntará solo por el dato faltante. La aclaración estará vinculada al mensaje original para que responderla no duplique acciones ya aplicadas.

Un cambio importante siempre termina mostrando el carrito o el total actualizado. La confirmación final seguirá siendo obligatoria antes de crear la orden.

### 7. Compositor de respuestas

Las respuestas cumplirán estas reglas:

- Una idea principal y máximo una pregunta.
- Dos o tres frases cuando sea posible.
- Lenguaje cotidiano y apto para clientes con diferente experiencia digital.
- Nombres, precios y opciones reales.
- Emojis moderados con función visual.
- Sin mencionar IA, prompts, base de datos ni errores técnicos.
- Sin repetir menús o resúmenes completos cuando no sean necesarios.

Ejemplo de aclaración:

> Claro 😊 ¿Quieres cambiar el tipo, la cantidad o reemplazar el California por otro producto?

## Atención humana y recuperación

La atención humana no será la respuesta normal ante una frase desconocida.

- Primer malentendido: pregunta específica.
- Segundo malentendido: muestra dos o tres interpretaciones posibles.
- Tercer malentendido: conserva el pedido y ofrece reformular o hablar con alguien.
- Una palabra aislada como `persona` no activa atención humana.
- El cliente puede solicitar ayuda mediante frases explícitas.
- El botón de ayuda solo aparece al inicio, después de varios intentos o cuando la conversación ya está en atención.
- El ajuste administrativo `human_handoff_enabled` controlará realmente botones, transferencias automáticas y avisos Push.
- Errores técnicos al crear la orden o confirmar una operación crítica sí podrán requerir intervención inmediata.

## Información general del negocio

El bot responderá con datos configurados de Mideli sobre menú, ingredientes, disponibilidad, precios, horario, cobertura, envío, pagos y estado del pedido. No improvisará respuestas. Las preguntas ajenas al negocio se redirigirán de forma breve al menú o al pedido actual.

## Evaluación y pruebas

Se mantendrá un banco versionado con, como mínimo:

- 500 mensajes individuales representativos.
- 100 pedidos completos de principio a fin.
- Errores ortográficos, abreviaciones y regionalismos.
- Mensajes con varias instrucciones y negaciones complejas.
- Correcciones, referencias contextuales y cambios tardíos.
- Respuestas citadas, botones viejos y mensajes fuera de orden.
- Direcciones incompletas, ubicaciones y correcciones.
- Fallos de Gemini, Maps, Meta y Supabase.
- Webhooks duplicados y mensajes consecutivos rápidos.

Cada caso declarará el estado inicial, mensaje, acciones esperadas, estado final, respuesta mínima y propiedades que nunca deben cambiar.

### Criterios de lanzamiento

- 100% de los casos críticos conserva carrito, total, domicilio y pago correctos.
- Cero productos, precios, opciones o direcciones inventadas.
- Cero pedidos duplicados.
- Cero acciones ambiguas ejecutadas sin aclaración.
- Al menos 98% de comprensión directa en mensajes válidos del banco.
- Todo caso restante produce una aclaración útil sin perder información.
- Respuesta normal menor a tres segundos bajo condiciones operativas.
- Suite completa, ESLint y build aprobados antes de desplegar.

El informe de evaluación agrupará fallos por intención y etapa para mostrar dónde mejorar, no solamente un porcentaje global.

## Implementación por etapas

1. Banco de evaluación y línea base del motor actual.
2. Normalización de citas, frases compuestas y controles antiguos.
3. Plan semántico multiacción y validación determinista.
4. Resolución contextual, aclaraciones y recuperación sin transferencia prematura.
5. Preguntas del negocio y seguimiento del pedido.
6. Evaluación completa, piloto controlado y despliegue.

Las notas de voz e imágenes se abordarán después de estabilizar y medir esta fase.
