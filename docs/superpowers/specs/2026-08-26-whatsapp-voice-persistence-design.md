# Voz y persistencia del bot de WhatsApp

Fecha: 2026-08-26

Estado: diseño aprobado por el usuario

## Objetivo

Hacer que el canal de WhatsApp de Mideli converse con una voz cercana, breve y profesional, conserve el estado entre mensajes en Vercel y permita que el personal vea, tome y responda conversaciones desde Mideli. El piloto seguirá sin crear pedidos reales hasta una activación supervisada.

## Alcance

- Persistir mensajes, carrito, etapa y asignación humana en Supabase durante el piloto.
- Mantener un bloqueo de servidor independiente para impedir pedidos reales.
- Corregir navegación por categorías, singular/plural y mensajes con más de una intención.
- Aplicar una voz de marca consistente con emojis moderados según categoría.
- Mostrar las conversaciones en la bandeja de Mideli y permitir respuesta humana exclusiva.
- Probar la conversación real reportada por el usuario y los flujos principales.

No se agregan imágenes, botones interactivos, promociones, un modelo de lenguaje pagado ni el número definitivo del dueño.

## Voz de marca

La voz se denomina **Mideli cercano**.

- No se presenta como IA ni finge ser una persona específica.
- Escribe frases cortas, naturales y fáciles de leer en móvil.
- Usa uno o dos emojis por bloque, sin decorar cada oración.
- Evita respuestas técnicas o acusatorias como `No encontré ese producto` cuando puede ofrecer una salida útil.
- Confirma acciones con el producto, cantidad y total.
- Mantiene precios, ingredientes y opciones exclusivamente desde el catálogo real.

Ejemplo de bienvenida:

```text
👋 ¡Hola! Bienvenido a Mideli

¿Qué se te antoja hoy? 🍔🍣
Puedes escribirme tu pedido o poner menú para ver las opciones.
```

Emojis iniciales por familia:

| Familia | Emoji |
|---|---|
| Hamburguesas | 🍔 |
| Papas y para compartir | 🍟 |
| Boneless y alitas | 🍗 |
| Sushis | 🍣 |
| Bowls | 🥣 |
| Bebidas sin alcohol | 🥤 |
| Cervezas solicitadas expresamente | 🍺 |

El formato debe tolerar nuevas categorías mediante un emoji neutral sin depender de nombres codificados para funcionar.

## Persistencia segura del piloto

Los webhooks de Meta en Vercel no conservarán conversaciones en memoria del proceso. Cada mensaje entrante usará las tablas existentes `channel_customers`, `channel_conversations` y `channel_messages` mediante el cliente administrativo exclusivo del servidor.

El modo piloto tendrá dos controles separados:

1. **Canal y conversación activos:** recibe, persiste y responde mensajes autorizados.
2. **Creación real bloqueada:** una variable de servidor, desactivada por defecto, impide llamar al creador canónico de pedidos aunque una opción administrativa se active accidentalmente.

Cuando el cliente confirme durante el piloto, el bot conservará carrito y conversación y transferirá al personal. No escribirá en pedidos, cocina, caja, impresión ni inventario.

La lista de teléfonos permitidos continuará limitando el número de prueba. El cambio al número definitivo será posterior y no exigirá modificar el motor.

## Comprensión conversacional

El resolvedor seguirá siendo determinista y sin costo por mensaje. Se ampliará con estas reglas:

- Reconocer singular, plural y alias claros de categorías: `sushi`, `sushis`, `menú sushi` y `sushi menú`.
- Resolver primero la categoría específica y después el comando genérico `menú`.
- Procesar una selección y una navegación en el mismo mensaje. Ejemplo: agregar `Hamburguesa Sencilla` y después mostrar Sushis.
- Conservar el contexto al responder por número dentro de una categoría o grupo de modificadores.
- Tratar `no`, `no gracias`, `gracias`, `sí` y expresiones equivalentes según la pregunta activa, sin contarlas como productos desconocidos.
- No transferir a una persona por dos respuestas breves comunes. La transferencia por incomprensión requiere dos intentos realmente no reconocidos.
- Mantener el límite de cinco opciones por mensaje.

Respuesta esperada para una intención combinada:

```text
✅ Agregué 1 Hamburguesa Sencilla 🍔
Total actual: $135

También te muestro los sushis 🍣
1. California · $125
   Res, pollo, camarón, tocino, tampico o surimi.
...
```

## Formateador de mensajes

La composición de texto se centralizará para evitar estilos diferentes entre etapas.

- Encabezado breve con emoji de contexto.
- Una línea por producto con nombre y precio.
- Descripción indentada debajo del producto.
- Separación visual entre confirmación, opciones y siguiente pregunta.
- Totales en una línea propia.
- Resumen final con productos, modificadores, domicilio, envío, pago y total.
- Mensajes de error con una acción concreta: volver al menú, escribir otro nombre o pedir ayuda.

## Bandeja y atención humana

Al llegar el primer mensaje persistente, la conversación aparecerá en `WhatsApp > Conversaciones`.

- Owner, admin, supervisor y mesero autorizado pueden abrirla según los permisos vigentes.
- `Tomar conversación` asigna al usuario de forma condicional. Solo una persona puede controlarla.
- Al tomarla, el bot se pausa.
- La respuesta escrita en Mideli se guarda como mensaje saliente y se envía por Meta.
- `Devolver al bot` reactiva la automatización conservando historial y carrito.
- `Cerrar` conserva el historial sujeto a la retención configurada.
- Los fallos de envío quedan visibles y no eliminan el texto escrito.

No se requiere una migración nueva para esta fase porque las entidades y campos necesarios ya existen. Si durante la implementación se detecta una carencia real de esquema, se detendrá esa parte y se presentará una migración separada con revisión de RLS.

## Flujo de datos

```text
Meta webhook
  -> validar firma y deduplicar
  -> reclamar mensaje en Supabase
  -> cargar conversación persistida
  -> interpretar texto y consultar catálogo real
  -> guardar estado y mensaje
  -> enviar respuesta con voz Mideli
  -> guardar identificador y estado del mensaje saliente
```

En confirmación de piloto:

```text
confirmación del cliente
  -> validar catálogo y total
  -> comprobar bloqueo duro de pedidos
  -> conservar carrito
  -> transferir a atención humana
  -> no tocar módulos operativos
```

## Errores y recuperación

- Un reinicio o escalamiento de Vercel no pierde el carrito.
- Un webhook duplicado no produce una segunda respuesta ni un segundo pedido.
- Dos empleados no pueden responder simultáneamente.
- Si Meta falla al enviar, el mensaje queda marcado como fallido para reintento o revisión.
- Si Supabase falla antes de guardar el estado, no se avanza silenciosamente la conversación.
- Si el catálogo cambia, se reconcilia antes de confirmar.
- Si el texto combina acciones incompatibles, se ejecuta la parte segura y se formula una sola pregunta aclaratoria.

## Verificación

Se agregarán pruebas automatizadas para:

1. La conversación exacta reportada por el usuario.
2. `menú sushi`, `sushi menú`, `sushi` y `sushis`.
3. Producto más navegación dentro del mismo mensaje.
4. `No gracias` después de ofrecer bebidas.
5. Persistencia entre invocaciones independientes.
6. Deduplicación de webhooks.
7. Bloqueo duro de creación real.
8. Toma exclusiva y respuesta humana.
9. Formato y emojis por categoría.
10. Comportamiento en escritorio, tablet y móvil.

Antes de desplegar se ejecutarán `npm run lint`, `npm run build` y las pruebas de WhatsApp. En producción se comprobarán la salud del despliegue, el webhook firmado y una conversación completa con el teléfono permitido. La creación de pedidos permanecerá desactivada.

## Criterios de aceptación

- La conversación permanece visible y conserva carrito y etapa después de cambiar de instancia.
- El personal puede tomarla y responder desde Mideli.
- `No gracias` continúa al tipo de servicio.
- Las variantes naturales de `sushi` abren directamente la categoría correcta.
- Un mensaje puede agregar un producto y solicitar otra categoría.
- Los mensajes son breves, profesionales y usan emojis moderados de forma consistente.
- Ninguna prueba crea pedidos, cobros, movimientos de inventario ni trabajos de impresión.
- Ningún secreto aparece en navegador, registros, Git o respuestas.
