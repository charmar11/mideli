# Diseño: bandeja móvil de WhatsApp tipo chat

Fecha: 2026-09-02
Estado: diseño propuesto para aprobación
Área: `src/components/whatsapp/whatsapp-inbox.tsx`

## Objetivo

Hacer que la atención de WhatsApp en móvil se sienta como una aplicación de mensajería integrada dentro de Mideli. El trabajador debe poder encontrar una conversación, leer el contexto y responder con una mano sin atravesar un panel administrativo comprimido.

La lógica actual de conversaciones, mensajes, atención humana, bot, borradores de pedidos y comanda debe conservarse. El cambio se concentra en la composición móvil, la jerarquía visual y la navegación entre bandeja, chat y pedido.

## Usuario y contexto

La persona que usa esta vista está durante un turno real, probablemente en teléfono o tablet, alternando entre pedidos, Cocina y WhatsApp. Necesita contestar rápido, reconocer qué conversación requiere atención y consultar un pedido sin perder el punto de la conversación.

## Principios de experiencia

- La conversación es el foco principal, no la configuración del canal.
- En móvil se muestra una superficie a la vez: bandeja, conversación o pedido.
- Los gestos verticales deben desplazarse dentro de la superficie activa, sin mover la página completa.
- La información operativa importante aparece cerca de la conversación, pero no compite con el campo de respuesta.
- Cada estado se expresa con texto, icono y color semántico.
- La composición móvil puede ser distinta de escritorio; no se debe reducir una cuadrícula de tres columnas hasta hacerla incómoda.

## Dirección visual

### Dominio

Mensajería de turno, cola de atención, cliente, pedido, cocina y entrega.

### Mundo de color

Carbón de la pantalla de chat, superficies cálidas de Mideli, rosa de la conversación activa, verde de una acción completada, ámbar de una atención pendiente y crema para el texto principal.

### Firma de Mideli

Una conversación activa puede mostrar un resumen operativo compacto del pedido, como `Pedido #179 · $265`, que abre la comanda sin abandonar el chat. Es el vínculo visual entre atención y operación del restaurante.

### Decisiones contra patrones genéricos

- No mantener un panel administrativo alto antes de mostrar la bandeja.
- No convertir cada filtro en una tarjeta grande.
- No dejar una pantalla vacía enorme cuando no hay conversaciones.
- No usar gestos laterales que compitan con el desplazamiento vertical.

## Estructura móvil

En pantallas menores a `lg`, `WhatsappInbox` tendrá tres estados de navegación:

```text
Bandeja
  └─ tocar conversación
      └─ Chat
          └─ tocar pedido
              └─ Hoja inferior de comanda
```

### Bandeja

La bandeja ocupa el alto disponible y contiene:

1. Barra superior compacta con título `WhatsApp`, cantidad pendiente, actualizar y acceso a configuración cuando corresponda.
2. Búsqueda en una fila compacta.
3. Filtros segmentados en una sola línea desplazable o en dos filas pequeñas: `Por atender`, `Activas`, `Cerradas`. Cada filtro muestra su conteo en una cápsula pequeña. `Todas` queda como opción secundaria.
4. Lista de conversaciones que ocupa el espacio restante.
5. Estado vacío corto, centrado en el espacio de la lista y con una acción concreta para cambiar filtro o búsqueda.

Cada fila de conversación contiene:

- Avatar con inicial o icono.
- Nombre del cliente.
- Último mensaje en una línea truncada.
- Hora de actualización.
- Indicador de no leído cuando exista.
- Badge pequeño de `Por atender`, `Activa` o `Cerrada` solo cuando ayude a escanear.

La fila completa es táctil y debe medir al menos 64 px de alto. No se implementará swipe lateral para acciones en esta fase.

### Chat

El chat reemplaza la bandeja en móvil y tiene alto completo:

1. Barra superior fija con regresar, avatar, nombre, teléfono formateado y un botón `Pedido` cuando exista comanda.
2. Área de mensajes con scroll vertical propio y `overscroll-contain`.
3. Indicador discreto de mensajes nuevos si el trabajador está leyendo mensajes anteriores.
4. Barra de acciones contextual para `Atender`, `Devolver al bot` o `Cerrar`, según el estado.
5. Compositor fijo al fondo, respetando el área segura y el teclado del dispositivo.

Los mensajes entrantes conservan superficie oscura y los mensajes enviados por Mideli conservan el rosa de marca, con suficiente contraste y sin mostrar marcadores de Markdown sin interpretar.

El compositor contiene un textarea de al menos 44 px de alto y un botón de envío de al menos 44 px. El campo permite varias líneas sin crecer indefinidamente; al llegar al límite de altura se desplaza internamente.

### Comanda

La comanda se abre desde el botón `Pedido` de la barra superior o desde un resumen compacto. Se presenta como hoja inferior con:

- Folio, tipo de servicio y estado.
- Productos, modificadores y notas.
- Cliente y teléfono.
- Dirección, referencia y acceso a Maps si aplica.
- Subtotal, envío informativo, pago y saldo.
- `Cargar en Mesero` como acción primaria cuando exista un borrador utilizable.

La hoja tiene scroll vertical propio, cierre explícito y no debe desplazar horizontalmente la vista. No duplica la comanda completa en la pantalla del chat.

## Estructura de escritorio

En `lg` y superiores se conserva la composición actual de tres columnas:

- Lista de conversaciones.
- Chat.
- Comanda contextual.

Los cambios de componentes compartidos deben respetar esta composición y no alterar el flujo de escritorio salvo ajustes de estados, accesibilidad o texto.

## Estado y datos

Se reutilizan los estados existentes:

- `mobileChatOpen` controla el regreso entre bandeja y chat.
- `selectedId` identifica la conversación activa.
- `messages` conserva los mensajes cargados.
- `filter` y `query` mantienen filtros y búsqueda.
- `conversation` contiene estado de bot, atención humana y datos del pedido.

Si se necesita distinguir la hoja de comanda, se agrega un estado local explícito como `mobileOrderOpen`. No se agregan tablas ni campos a Supabase.

La lista debe seguir usando la instantánea ligera existente y sus actualizaciones periódicas mientras la página está visible. Abrir el chat carga los mensajes bajo demanda. La hoja de pedido no debe disparar una consulta completa del catálogo.

## Scroll y teclado

- El contenedor raíz de la vista móvil usa `min-h-0` y no crea un segundo scroll de página.
- La lista, el chat y la hoja de comanda son los únicos contenedores con scroll propio en sus estados respectivos.
- Usar `touch-pan-y`, `overscroll-contain` y `overflow-x-hidden` donde corresponda.
- El compositor debe permanecer visible al abrir el teclado mediante layout flex y área segura inferior.
- Los textos largos se ajustan dentro del ancho disponible con `min-w-0`, `break-words` o truncado controlado.

## Interacciones y accesibilidad

- Botones y filas táctiles de mínimo 44 px.
- Regresar debe tener etiqueta accesible y conservar la conversación seleccionada.
- El cambio de filtro anuncia el conteo y el resultado mediante `aria-live` cuando sea útil.
- El área de mensajes conserva semántica de lista y no usa elementos con `onClick` que deban ser botones.
- La hoja de pedido bloquea el foco fuera de ella mientras está abierta y devuelve el foco al botón que la abrió.
- Los colores siempre acompañan texto o icono, nunca son la única señal.

## Estados de error y carga

- Bandeja cargando: skeleton compacto en filas, sin pantalla vacía gigante.
- Chat cargando: conserva encabezado y compositor deshabilitado mientras carga el historial.
- Error de mensajes: mensaje corto con `Reintentar` sin perder la conversación seleccionada.
- Error al responder: conserva el texto escrito y ofrece reintentar.
- Error de comanda: muestra el estado del pedido y permite volver al chat.
- Conversación cerrada: el compositor queda deshabilitado y explica cómo reabrir o atender otra.

## Fuera de alcance

- No se cambia el webhook, el motor conversacional ni la política de creación automática.
- No se agrega envío de archivos, audio, respuestas guardadas complejas ni swipe actions.
- No se cambia la composición de escritorio.
- No se modifica el esquema de Supabase.
- No se reintroduce el simulador de WhatsApp.

## Verificación

### Automatizada

Ejecutar:

```bash
npm run lint
npm run build
npx playwright test tests/e2e/whatsapp-inbox.spec.ts tests/e2e/whatsapp-customers.spec.ts --project=mobile
npx playwright test tests/e2e/whatsapp-inbox.spec.ts tests/e2e/whatsapp-customers.spec.ts --project=tablet
npx playwright test
```

### Manual

En móvil:

1. Abrir WhatsApp y confirmar que la bandeja aparece sin desplazamiento horizontal.
2. Cambiar filtros y verificar que los conteos no ocupan la pantalla completa.
3. Abrir una conversación, leer mensajes anteriores y responder con el teclado abierto.
4. Regresar a la bandeja sin perder el filtro ni la búsqueda.
5. Abrir y cerrar la comanda desde el chat.
6. Verificar que la comanda se desplaza verticalmente sin mover el body.
7. Probar conversación por atender, activa y cerrada.
8. Probar error de carga y reintento.

En escritorio:

1. Confirmar que continúan visibles lista, chat y comanda.
2. Verificar que atender, devolver al bot, cerrar y responder conservan su comportamiento.
3. Confirmar que no se modifican la creación de pedidos ni el flujo de Mesero.

## Criterio de aceptación

El rediseño está listo cuando un trabajador puede pasar de la bandeja a responder, consultar el pedido y regresar a la bandeja con una mano, sin scroll horizontal, sin perder la conversación y sin que la comanda tape el compositor.
