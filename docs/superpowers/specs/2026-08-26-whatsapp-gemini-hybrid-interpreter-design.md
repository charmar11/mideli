# Intérprete híbrido de pedidos con Gemini

Fecha: 2026-08-26  
Estado: diseño aprobado

## Objetivo

Reducir los errores de interpretación del bot de WhatsApp sin convertir una API externa en requisito para operar. Mideli conservará un motor determinista para el flujo, precios y reglas del negocio, y usará Gemini API gratuita únicamente como intérprete auxiliar de frases complejas.

La creación real de órdenes permanecerá desactivada durante el piloto. Gemini nunca podrá crear una orden, decidir un precio ni modificar el carrito sin validación local.

## Problemas confirmados

- El bot pregunta `¿Así está bien?`, pero el estado `ordering` procesa `sí` como si fuera el nombre de un producto.
- Dos respuestas normales no reconocidas incrementan `ambiguityCount` y transfieren innecesariamente la conversación a una persona.
- `Un California de carne y otro de pollo` contiene una sola mención del producto. El parser actual crea una sola unidad, reconoce `Pollo` por coincidencia literal y no relaciona `carne` con la opción `Res`.
- Las reglas actuales funcionan para frases previstas, pero no representan adecuadamente intención, referencias como `otro` ni variaciones diferentes por unidad.

## Enfoques considerados

### Ampliar únicamente expresiones regulares

Es barato y rápido, pero cada nueva forma de hablar exige otra excepción. Se conservará como primera capa para acciones claras, no como solución completa.

### Enviar toda la conversación a Gemini

Facilitaría la comprensión, pero introduciría dependencia, latencia, uso de cuota y exposición innecesaria de información personal. También permitiría que una respuesta generativa interfiera con reglas críticas.

### Motor híbrido con interpretación estructurada

Es el enfoque seleccionado. Mideli resuelve lo conocido; Gemini solo traduce mensajes ambiguos a una intención estructurada. Mideli valida y ejecuta el resultado.

## Arquitectura

### 1. Resolución determinista prioritaria

El motor actual seguirá resolviendo sin IA:

- saludos y navegación del menú;
- selecciones numéricas;
- productos y variaciones con coincidencia inequívoca;
- respuestas contextuales como sí, no, confirmar y terminar;
- domicilio, ubicación, referencia, pago y confirmación final;
- cambios simples ya soportados.

Antes de consultar Gemini se corregirá el contrato entre pregunta y estado. El estado conservará qué pregunta se hizo por última vez, por ejemplo `cart_follow_up`, `beverage_offer`, `fulfillment`, `address_reference`, `payment_method` o `final_confirmation`.

Después de actualizar el carrito se utilizará una pregunta explícita:

> ¿Deseas agregar algo más? Si terminaste, escribe sería todo.

`Sí` significará continuar agregando cuando esa sea la pregunta. `Así está bien`, `correcto`, `listo` o `sería todo` avanzarán al siguiente paso. Ninguna de estas expresiones contará como producto desconocido.

### 2. Cuándo consultar Gemini

Gemini se utilizará únicamente cuando:

- el mensaje mencione un producto con cantidades o variaciones distribuidas entre unidades;
- el cliente solicite varias operaciones en una frase;
- exista una corrección compleja del carrito;
- el parser local no encuentre una intención segura en la etapa `ordering`;
- una frase use sinónimos no contemplados y existan candidatos razonables del catálogo.

Gemini no se consultará durante dirección, referencia, ubicación, pago o confirmación final. Tampoco se utilizará para saludos, navegación o selecciones sencillas.

### 3. Datos enviados

La solicitud incluirá solamente:

- mensaje actual sanitizado;
- etapa conversacional y última pregunta;
- resumen del carrito con identificadores internos, nombres y cantidades;
- índice compacto de productos activos;
- variaciones de los productos candidatos.

No incluirá teléfono, nombre del cliente, identificadores de WhatsApp, dirección, referencia, ubicación, método de pago ni conversación completa.

Si un mensaje mezcla pedido y domicilio, Mideli separará primero la porción operativa. Un mensaje con coordenadas, teléfono, correo, código postal o patrón de dirección no se enviará completo a Gemini.

### 4. Contrato estructurado

Gemini responderá mediante JSON Schema estricto con:

- `intent`: `add_items`, `update_items`, `remove_items`, `finish_order`, `affirm`, `deny`, `browse_category`, `clarify` o `unknown`;
- `operations`: lista de acciones con `productId`, cantidad y variaciones por unidad;
- `confidence`: `high`, `medium` o `low`;
- `clarification`: pregunta breve cuando falte información;
- `reasonCode`: causa técnica limitada para diagnóstico.

Gemini solo podrá devolver identificadores incluidos en la solicitud. No devolverá precios ni texto libre para enviar directamente al cliente.

### 5. Validación y ejecución

Mideli rechazará cualquier interpretación que:

- mencione un producto inactivo o inexistente;
- use una variación no válida para ese producto;
- viole selección requerida, única, múltiple, mínima o máxima;
- produzca una cantidad inválida;
- intente cambiar precios o totales;
- no sea compatible con el estado actual.

Una interpretación de confianza alta y completamente válida podrá aplicarse al carrito. Si distribuye variantes entre varias unidades, la respuesta mostrará el desglose exacto para que el cliente detecte errores.

Una interpretación media, incompleta o con más de una lectura posible no se aplicará. El bot hará una pregunta concreta, por ejemplo:

> Entendí dos Californias: uno de Res y uno de Pollo. ¿Es correcto?

La confirmación posterior aplicará una propuesta local ya validada; no realizará una segunda consulta a Gemini.

### 6. Disponibilidad y límites

La integración tendrá una bandera de servidor desactivada por defecto. Durante el piloto se habilitará después de configurar la clave y ejecutar las pruebas locales.

- Tiempo máximo por consulta: 2.5 segundos.
- Una respuesta que llegue después del vencimiento se descartará.
- Errores de cuota, autenticación, red o modelo no romperán la conversación.
- No habrá reintentos paralelos que puedan duplicar operaciones.
- El identificador del mensaje de WhatsApp conservará la idempotencia existente.
- Si Gemini no está disponible, el bot solicitará una aclaración específica mediante el motor local.

El modelo será configurable por variable de entorno y se elegirá entre los modelos estables disponibles en la cuota gratuita al momento de implementar. No se fijará un identificador obsoleto sin comprobarlo.

## Sinónimos y aprendizaje controlado

Se añadirá un diccionario pequeño y explícito para vocabulario recurrente, por ejemplo `carne` y `carne de res` como `Res`. Los resultados de Gemini no modificarán automáticamente este diccionario.

Las frases reales que revelen un error se anonimizarán y convertirán en pruebas. Solo después de revisar una frase se añadirá una regla o sinónimo permanente. Esto evita que un cliente pueda alterar el comportamiento global del bot.

## Manejo de ambigüedad e intervención humana

`ambiguityCount` solo aumentará ante una intención realmente desconocida, no por respuestas contextuales comunes.

Antes de transferir a una persona, el bot intentará una aclaración específica. La intervención humana ocurrirá cuando:

- el cliente la solicite;
- dos aclaraciones específicas consecutivas no resuelvan el pedido;
- el catálogo no permita cumplir lo solicitado;
- el mensaje contenga contenido no soportado o exista un conflicto que pueda alterar el cobro.

Una falla técnica de Gemini por sí sola no transferirá la conversación.

## Pruebas

### Casos de regresión obligatorios

- `Un California de carne y otro de pollo` produce dos líneas: Res y Pollo.
- `Y sería un California de carne y otro de pollo` conserva el carrito anterior.
- `Uno de res y los otros de camarón` distribuye correctamente las variantes.
- `Sí`, `así está bien`, `correcto` y `sería todo` se interpretan según la última pregunta.
- Dos respuestas válidas nunca disparan intervención humana.
- `Cámbiame el California de res por camarón` modifica una sola unidad.
- `Quita el de pollo y agrega uno de res` ejecuta ambas operaciones una sola vez.
- Gemini no puede seleccionar un producto o variación que no aparezca en el catálogo permitido.
- Un timeout, `429`, `401` o JSON inválido conserva el carrito y solicita aclaración local.
- Un mensaje repetido de Meta no aplica dos veces la misma operación.

### Estrategia de evaluación

Se mantendrá un corpus anonimizado de frases naturales con resultado esperado. Las pruebas del motor no llamarán a Gemini: usarán respuestas estructuradas simuladas para ser rápidas y deterministas.

Una suite separada y manual comprobará el modelo real con un conjunto pequeño de mensajes. Sus resultados no bloquearán el build si la cuota gratuita está agotada.

Antes de considerar terminado el cambio deberán pasar:

```bash
npm run test:e2e -- tests/e2e/whatsapp-conversation.spec.ts
npm run lint
npm run build
```

## Configuración de la clave

La clave se almacenará únicamente como `GEMINI_API_KEY` en variables de entorno del servidor. No se pegará en el chat, no se expondrá con prefijo `NEXT_PUBLIC_` y no se guardará en Git.

También existirán:

- `WHATSAPP_GEMINI_INTERPRETER_ENABLED` para activar o desactivar la integración;
- `WHATSAPP_GEMINI_MODEL` para cambiar el modelo sin editar código.

Al finalizar la implementación se entregarán instrucciones exactas para agregar estas variables a Development y Production en Vercel y sincronizarlas de forma segura para localhost.

## Despliegue gradual

1. Ejecutar pruebas automatizadas sin red.
2. Probar Gemini en localhost con creación de órdenes desactivada.
3. Habilitarlo solo para el número de prueba.
4. Revisar conversaciones compuestas, correcciones y fallos simulados.
5. Desplegar manteniendo creación de órdenes desactivada.
6. Habilitar órdenes únicamente mediante autorización posterior y después del checklist completo del piloto.

## Fuera de alcance

- Entrenar o ajustar un modelo propio.
- Enviar imágenes o audios a Gemini.
- Usar Gemini para direcciones, tarifas, precios o pagos.
- Permitir que Gemini responda directamente al cliente.
- Aprendizaje automático de reglas a partir de conversaciones sin revisión.
- Garantizar cuota o disponibilidad ilimitada de una API gratuita.
