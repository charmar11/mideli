# Piloto confiable de pedidos por WhatsApp

Fecha: 2026-08-26  
Estado: diseño aprobado

## Objetivo

Validar el flujo conversacional de WhatsApp sin crear órdenes reales. El piloto debe recibir pedidos con rapidez, conservar el orden de los mensajes, evitar respuestas duplicadas, comprobar domicilios antes de cotizar el envío y permitir que el equipo revise las conversaciones desde Mideli.

La prioridad es descubrir y corregir problemas que puedan provocar pérdida de ventas o información incorrecta antes de habilitar la creación automática de órdenes.

## Hallazgos confirmados

### Procesamiento tardío y fuera de orden

El webhook confirma la recepción y delega el procesamiento a un trabajo diferido de Next.js. En la conversación analizada, dos mensajes se almacenaron 108 y 160 segundos después de la hora reportada por Meta. Al ejecutarse trabajos independientes, un mensaje posterior pudo modificar el estado antes que el mensaje anterior y se enviaron preguntas duplicadas.

### Domicilio incorrecto

La búsqueda de Google aceptó el primer resultado disponible para `Las Palmas 1747, col Villas del Palmar`. Ese resultado fue un parque, no el domicilio solicitado. La tarifa de $30 fue matemáticamente correcta para las coordenadas equivocadas.

El sistema actual no comprueba número exterior, calle, colonia, tipo de lugar, coincidencia parcial ni precisión geométrica antes de cotizar.

### Flujo de efectivo innecesario

El bot pregunta con cuánto pagará el cliente. Mideli ya registra el efectivo recibido y el cambio al cobrar la entrega, por lo que esta pregunta alarga la conversación y puede duplicarse si llegan mensajes fuera de orden.

### Entrega a una persona inconsistente

Una conversación puede quedar marcada como entregada al equipo mientras el bot continúa habilitado. La interfaz y el comportamiento deben representar el mismo estado.

## Enfoques considerados

### Procesamiento directo sin coordinación

Esperar la respuesta del motor antes de contestar el webhook eliminaría el trabajo diferido, pero no impediría que dos solicitudes simultáneas modifiquen la misma conversación. Es adecuado para una demostración, no para operación real.

### Servicio externo de colas

Una cola administrada ofrecería alta confiabilidad, pero incorporaría costo, credenciales y otra dependencia operativa. No es necesaria para el volumen inicial de Mideli.

### Cola persistente por conversación

Es el enfoque seleccionado. Los mensajes entrantes se registran de forma idempotente y se procesan por conversación en orden cronológico. Una exclusión mutua persistente evita que dos ejecuciones avancen el mismo estado simultáneamente. Conserva la arquitectura actual y no requiere otro proveedor.

## Diseño

### 1. Recepción idempotente

El webhook verificará la firma de Meta y registrará primero cada mensaje usando su identificador externo como clave única. Una entrega repetida de Meta devolverá éxito sin volver a responder ni modificar la conversación.

Los mensajes conservarán por separado:

- hora informada por Meta;
- hora de recepción en Mideli;
- inicio y fin de procesamiento;
- estado de procesamiento;
- error técnico sanitizado, cuando exista.

No se registrarán tokens ni secretos.

### 2. Procesamiento ordenado

Cada conversación tendrá una exclusión mutua persistente con vencimiento. El procesador reclamará la conversación, leerá el mensaje pendiente más antiguo y cargará el estado más reciente antes de interpretarlo.

Mientras conserve la exclusión, drenará los mensajes pendientes en orden. Al terminar, liberará la conversación. Si otra solicitud encuentra la conversación ocupada, esperará brevemente y volverá a intentar; los mensajes permanecerán almacenados aunque una ejecución falle.

La creación de órdenes continuará desactivada mediante la configuración existente. El piloto no tocará cocina, caja, impresión ni inventario.

### 3. Validación de domicilios

La búsqueda agregará el contexto fijo de Ciudad Obregón, Sonora, México y evaluará todos los candidatos devueltos por Google.

Para aceptar una dirección escrita que contiene número exterior se requerirá:

- coincidencia del número exterior;
- una calle o ruta identificable;
- localidad compatible con Ciudad Obregón o Cajeme;
- resultado de tipo dirección, no parque, comercio ni punto de interés;
- precisión suficiente y sin coincidencia parcial dudosa.

Si ningún candidato cumple, el bot no calculará el envío. Responderá de manera breve:

> 📍 No pude confirmar el número exacto. Envíame calle, número y colonia, o comparte tu ubicación desde WhatsApp.

Una ubicación compartida por el cliente se considerará el destino principal. El sistema podrá obtener una descripción legible, pero no reemplazará las coordenadas elegidas.

El texto original del cliente se conservará como domicilio de entrega. La dirección normalizada de Google se guardará aparte para diagnóstico y cálculo.

### 4. Cálculo del envío

La distancia se calculará únicamente después de validar el destino. Se aplicará la tabla configurable por rangos de kilómetros y después el costo especial por colonia.

La colonia se buscará tanto en los componentes normalizados de Google como en el texto proporcionado por el cliente. Esto evita perder un recargo válido cuando Google nombra la colonia de forma distinta.

Antes de continuar, el bot mostrará domicilio, distancia, tarifa base, recargo si existe y total. Una dirección dudosa nunca producirá una cotización automática.

### 5. Conversación de pago

Para domicilio se conservarán únicamente efectivo y transferencia.

Al elegir efectivo, el bot pasará directamente al resumen y confirmación. El importe recibido y el cambio se registrarán posteriormente en el cobro de Mideli.

Los estados antiguos que estén esperando una cantidad en efectivo se migrarán lógicamente al resumen cuando reciban el siguiente mensaje, sin dejar la conversación bloqueada.

### 6. Intenciones y correcciones

El motor resolverá primero la intención correspondiente al estado actual. Expresiones como `no`, `no gracias`, `sería todo`, `en efectivo` y `confirmo` no se interpretarán como búsquedas de productos.

Antes de confirmar, el cliente podrá:

- agregar productos;
- quitar productos;
- cambiar cantidades;
- sustituir un producto o variación;
- cambiar entre recoger y domicilio;
- corregir domicilio, referencia o método de pago.

Las modificaciones mostrarán un resumen corto y el total actualizado.

### 7. Intervención humana

Cuando el bot no pueda resolver una intención o el cliente pida hablar con una persona, la conversación cambiará a intervención humana y el bot se desactivará para esa conversación.

La interfaz mostrará claramente que el equipo debe responder. Reactivar el bot será una acción explícita. Los mensajes del equipo quedarán dentro del mismo historial.

### 8. Rendimiento del panel

El panel mantendrá actualización frecuente mientras esté visible, pero evitará solicitudes innecesarias cuando la pestaña esté oculta. Al abrir una conversación o recibir un mensaje, la vista se desplazará al contenido más reciente.

La velocidad del panel no dependerá de ejecutar nuevamente todo el motor conversacional.

## Manejo de errores

- Si Google no responde, se informará que no fue posible calcular el envío y se permitirá reintentar o solicitar intervención humana.
- Si Meta rechaza una respuesta, el mensaje conservará el código y una causa sanitizada para diagnóstico.
- Si el procesador se interrumpe, la exclusión vencerá y otro intento retomará el mensaje pendiente.
- Si llega el mismo evento varias veces, solo se procesará una vez.
- Si un mensaje posterior llega mientras otro se procesa, quedará en espera y no adelantará el estado.
- Una falla técnica no habilitará la creación de órdenes ni afectará módulos operativos.

## Observabilidad

Los registros técnicos incluirán identificadores de conversación y mensaje, duración de cola, duración de procesamiento, duración del envío y resultado. No incluirán el cuerpo completo de la conversación ni credenciales.

El panel de diagnóstico distinguirá recibido, en espera, procesando, enviado, leído y fallido. Esto permitirá saber si el retraso ocurrió en Meta, Mideli, Google o el envío de la respuesta.

## Pruebas de aceptación

### Orden y duplicados

- Dos mensajes rápidos se responden en el mismo orden en que fueron enviados.
- Una entrega repetida del mismo identificador no genera una segunda respuesta.
- Una interrupción deja el mensaje recuperable.

### Domicilios

- Un resultado que sea parque se rechaza aunque sea el primer resultado de Google.
- Una dirección con número distinto se rechaza.
- Una dirección válida calcula rango y recargo de colonia correctamente.
- Una ubicación compartida calcula desde sus coordenadas.
- Una dirección ambigua solicita más información y no inventa una tarifa.

### Conversación

- `No gracias` después de ofrecer bebida avanza al tipo de entrega.
- Efectivo avanza al resumen sin preguntar con cuánto pagará.
- Una sustitución actualiza productos, variaciones y total.
- Solicitar una persona desactiva el bot en esa conversación.
- Confirmar en piloto no crea una orden ni afecta cocina, caja, impresión o inventario.

### Calidad técnica

- Las pruebas automatizadas del webhook, motor, entrega y operaciones pasan.
- ESLint no reporta errores.
- El build de producción termina correctamente.
- Las migraciones se revisan en seco antes de aplicarse.

## Criterios para habilitar órdenes

La creación automática de órdenes solo podrá considerarse después de completar conversaciones de prueba que cubran menú, variaciones, correcciones, recoger, domicilio, efectivo, transferencia, Google ambiguo, intervención humana y mensajes rápidos sin duplicados.

Habilitar órdenes, aplicar migraciones remotas o desplegar a producción requiere una autorización posterior explícita.

## Fuera de alcance

- Pagos en línea.
- Fotografías y botones interactivos en WhatsApp.
- Promociones automáticas.
- Rastreo en tiempo real del repartidor.
- Cambio del número de prueba por el número definitivo del negocio.
