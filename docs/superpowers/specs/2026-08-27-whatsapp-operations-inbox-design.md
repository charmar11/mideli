# Central de servicio de WhatsApp

Fecha: 2026-08-27

Estado: aprobado por autorización anticipada del usuario

## Objetivo

Convertir `WhatsApp` en una bandeja de trabajo rápida para el equipo del local. La persona que la abre debe identificar en segundos quién necesita ayuda, responder desde cualquier dispositivo y entender el pedido sin cambiar de pantalla.

## Contexto de uso

La interfaz la usan meseros, supervisores y administradores durante un turno. Pueden estar atendiendo una mesa, revisando cocina o respondiendo desde un celular. La prioridad no es administrar el canal, sino resolver conversaciones sin perder pedidos ni contexto.

## Exploración del dominio

- Conceptos: fila de atención, comanda, relevo entre bot y persona, estado de cocina, domicilio, pago y seguimiento.
- Mundo de color: fondo de cocina nocturna, superficies grafito, papel crema, rosa Mideli, verde de pedido resuelto y ámbar de atención pendiente.
- Firma: una ficha de comanda viva junto al chat, con folio, productos, total, entrega y responsable siempre disponibles.
- Patrones descartados: un tablero de métricas como inicio, un clon genérico de mensajería y ocho pestañas administrativas con la misma jerarquía.

## Alternativas consideradas

1. **Central de servicio, recomendada.** Bandeja priorizada, conversación y comanda contextual. Reduce cambios de pantalla y funciona bien en tableta y escritorio.
2. **Chat mínimo.** Lista y mensajes sin contexto del pedido. Es más simple, pero obliga al equipo a buscar datos en otras vistas.
3. **Centro administrativo completo.** Mantiene todas las configuraciones al frente. Da visibilidad técnica, pero entorpece la atención cotidiana.

Se implementará la primera alternativa. Las herramientas administrativas permanecen accesibles bajo un grupo secundario.

## Arquitectura de interfaz

### Navegación

- La vista inicial será `Bandeja`.
- `Resumen` y `Catálogo` permanecen como accesos directos.
- Entregas, Horarios, Bot y Diagnóstico se agrupan en `Configurar`.
- El simulador deja de formar parte de la interfaz operativa.

### Bandeja

- Búsqueda por nombre, teléfono o folio.
- Filtros: `Por atender`, `Activas`, `Cerradas` y `Todas`.
- Las conversaciones con relevo humano aparecen primero.
- Cada fila muestra cliente, teléfono, último mensaje, hora, estado y folio cuando exista.
- Los estados se nombran en español y usan color únicamente para comunicar prioridad.

### Conversación

- Encabezado fijo con cliente, estado del bot y acciones principales.
- Historial con estados de entrega traducidos.
- El chat baja al final al abrirlo. Si el operador está leyendo mensajes anteriores, no se le arrebata la posición; aparece un botón de mensajes nuevos.
- El compositor permanece fijo, acepta varias líneas y explica que responder toma la conversación cuando el bot sigue activo.
- Tomar, devolver al bot y cerrar conservan el flujo exclusivo existente.

### Comanda contextual

- Cliente, teléfono y responsable.
- Folio y estado del último pedido vinculado.
- Productos, total, tipo de servicio y forma de pago.
- Domicilio, referencia, copiar dirección y abrir Google Maps.
- En móvil la comanda se muestra como un bloque desplegable dentro del chat.

### Limpieza segura

- Owner y admin pueden limpiar el contenido de los mensajes de una conversación.
- La acción requiere una confirmación explícita y aclara que pedidos, folios y auditoría se conservan.
- Se redactan cuerpo y metadatos; no se borran órdenes ni relaciones.

## Datos

La carga de conversaciones incorporará en paralelo:

- nombre del cliente;
- nombre del responsable asignado;
- dirección y resumen del estado conversacional;
- último pedido vinculado, con folio, estado, pago y entrega;
- dirección y estado del último mensaje.

No se abrirán tablas privadas al navegador. Todas las lecturas y acciones continuarán pasando por acciones de servidor autenticadas y el cliente administrativo.

## Rendimiento

- Se conserva la instantánea ligera de bandeja en lugar de refrescar toda la página.
- El sondeo se ejecuta de forma secuencial y solo con el documento visible.
- La búsqueda usa un valor diferido para evitar bloquear la escritura.
- Los mapas de clientes, responsables, mensajes y pedidos se construyen una sola vez por carga.
- Las actualizaciones iguales conservan las referencias para reducir renders.

## Estados y errores

- La última información útil permanece visible ante un fallo transitorio.
- Un indicador discreto muestra cuándo se actualizó la bandeja y permite reintentar manualmente.
- Los mensajes fallidos se distinguen sin exponer errores técnicos.
- Estados vacíos explican la siguiente acción.
- Los controles pendientes se deshabilitan para evitar acciones dobles.

## Accesibilidad y móvil

- Objetivos táctiles mínimos de 44 px.
- Botones nativos y etiquetas accesibles.
- En móvil se muestra lista o chat, nunca ambos apilados.
- El chat incluye regreso visible a conversaciones.
- El compositor respeta el área segura inferior.
- Los estados no dependen únicamente del color.

## Verificación

- Pruebas de los helpers de búsqueda, prioridad y etiquetas de estado.
- Flujo de tomar, responder, devolver al bot, cerrar y limpiar contenido.
- Revisión a anchos de móvil, tableta y escritorio.
- `npm run lint`.
- Pruebas de WhatsApp y smoke pertinentes.
- `npm run build`.
- Revisión final del diff y checkpoint Git.

No se desplegará esta fase sin una autorización explícita de producción.
