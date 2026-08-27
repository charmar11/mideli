# Diseño móvil de WhatsApp

Fecha: 2026-08-27
Estado: aprobado por autorización previa del propietario

## Objetivo

Hacer que la central de WhatsApp se pueda operar cómodamente desde un teléfono sin desplazamiento horizontal, sin perder funciones de escritorio y sin modificar datos ni flujos del bot.

## Dirección

La interfaz se comportará como una bandeja de servicio del local, no como un panel administrativo reducido. En móvil se mostrará una sola tarea por vez: navegación, lista, conversación o ficha de cliente. La prioridad visual será el contenido operativo y las acciones táctiles.

### Territorio del producto

- Conversación activa
- Cola por atender
- Comanda y folio
- Cliente frecuente
- Domicilio y entrega
- Atención humana

### Mundo visual

- Negro del turno nocturno
- Superficies carbón y ciruela
- Rosa Mideli para selección
- Crema para lectura principal
- Verde para continuar
- Ámbar para atención
- Dorado para totales

### Firma

Las filas de conversación y cliente se leerán como comandas compactas: identidad primero, actividad después y folio o valor como dato secundario. En móvil la transición lista-detalle conservará un regreso grande y visible.

### Patrones descartados

- Pestañas en carrusel horizontal: se reemplazan por navegación compacta que cabe en el ancho disponible.
- Cuadrículas de escritorio comprimidas: se reemplazan por tarjetas verticales y contenido que puede envolver.
- Acciones largas en una sola fila: se apilan o distribuyen en columnas seguras según el ancho.

## Comportamiento

### Encabezado y navegación

- El encabezado se compacta en móvil y permite que estado y acciones se distribuyan sin desbordar.
- Las secciones principales caben completas en el ancho del teléfono.
- Configuración continúa agrupada en un menú y no agrega otra barra.
- Toda la central recorta cualquier desbordamiento accidental en el eje horizontal.

### Bandeja

- La lista y el chat nunca aparecen apilados en móvil.
- Los filtros caben sin carrusel horizontal.
- El chat usa el alto disponible, conserva el compositor visible y respeta el área segura.
- El detalle del pedido continúa disponible como sección desplegable.

### Clientes

- El directorio y la ficha nunca aparecen juntos en móvil.
- Las filas permiten envolver cifras y metadatos sin ensanchar la página.
- Métricas, domicilios, historial y formularios usan anchos flexibles con `min-width: 0`.
- Las acciones se apilan cuando una fila no tiene espacio.
- Direcciones, referencias y productos rompen palabras largas de forma segura.

## Accesibilidad

- Controles táctiles de al menos 44 px.
- Botones reales y estados de foco existentes.
- Etiquetas visibles o accesibles para acciones con icono.
- Contraste y semántica de color según el sistema actual de Mideli.

## Compatibilidad

- No se modifica el backend, las acciones de servidor ni Supabase.
- Escritorio conserva sus paneles múltiples.
- La navegación y el estado actual siguen siendo locales al componente.

## Verificación

- Revisar 320, 375 y 430 px sin desplazamiento horizontal.
- Revisar lista, chat abierto, ficha de cliente, edición de nombre, domicilio e historial expandido.
- Revisar escritorio para confirmar que cola, chat y detalle siguen visibles.
- Ejecutar `npm run lint` y `npm run build`.

