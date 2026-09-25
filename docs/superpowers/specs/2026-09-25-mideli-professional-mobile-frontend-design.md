# Rediseño profesional móvil de Mideli

## Dirección

La dirección visual es **Turno en foco**: Mideli conserva su canvas oscuro, rosa de marca, crema, dorado y superficies cálidas, pero reduce el ruido visual y organiza cada vista alrededor de una tarea principal. La aplicación debe sentirse como una herramienta nativa de operación durante un turno, no como un dashboard genérico encogido para móvil.

## Objetivos

- Permitir que una mesera capture, revise, envíe y cobre con una mano y sin perder contexto.
- Mantener el chat de WhatsApp como una conversación completa, con mensajes legibles y compositor fijo.
- Evitar que el scroll del `body` compita con paneles internos, especialmente en tabletas y teléfonos.
- Mostrar siempre el negocio, caja, estado y acción principal que están activos.
- Conservar rutas, datos, permisos, WhatsApp exclusivo de Mideli y el aislamiento multinegocio.
- Hacer que estados, errores, cargas y vacíos sean entendibles sin depender del color.

## Estructura de experiencia

### Shell global

- Escritorio: barra lateral compacta y cabecera de contexto.
- Tableta: navegación superior compacta y contenido en dos columnas cuando la tarea lo permite.
- Móvil: barra superior mínima, contenido a altura de viewport y barra inferior fija; la barra inferior no se desplaza con el contenido.
- El shell reserva `safe-area-inset` y evita que el contenido quede debajo de navegación o acciones fijas.

### POS

- El encabezado de pedido conserva tipo de servicio, mesa y caja visibles.
- Los menús de negocio aparecen como selector horizontal con nombre y estado, sin cambiar la sesión.
- El carrito móvil es una hoja de trabajo con total y acción primaria persistentes.
- Los avisos de comanda mixta se muestran agrupados por negocio antes de enviar.

### WhatsApp

- En móvil, una conversación seleccionada ocupa toda la vista entre cabecera y compositor.
- La lista y el chat no compiten por el mismo scroll.
- La cabecera muestra volver, cliente, estado de atención y acciones rápidas.
- Los mensajes usan ancho cómodo, metadata secundaria y agrupación visual por dirección.
- El compositor queda anclado encima de la navegación solo cuando corresponde.

### Administración

- Los módulos usan una cabecera de página consistente con volver, título, negocio activo y acción primaria.
- Formularios largos se convierten en secciones progresivas con acciones fijas en móvil.
- Inventario, caja, analíticas, impresión y diagnóstico conservan densidad de escritorio, pero se vuelven listas y paneles táctiles en pantallas pequeñas.
- Impresión y diagnóstico quedan disponibles únicamente a usuarios con permiso real, sin quedar ocultos por una regla heredada de single-business.

## Sistema de componentes

- Tokens compartidos para superficie, borde, foco, estados y profundidad.
- Targets táctiles mínimos de 44px.
- Un solo estilo de botón primario, secundario, peligro y operación.
- Skeletons para cargas de contenido, mensajes de error con recuperación y empty states accionables.
- Tipografía fija y legible: Sora para estructura, Karla para lectura y JetBrains Mono solo para datos.
- Animación limitada a cambios de estado y feedback de operación, entre 150 y 250ms.

## Límites funcionales

No se cambiarán contratos de pedidos, caja, pagos, inventario, WhatsApp o permisos salvo para corregir una conexión de navegación que ya existe en backend. No se habilitará Just Dipping ni se inventarán datos. WhatsApp seguirá exclusivo de Mideli.

## Verificación de salida

- Lint y build sin errores.
- Detector mecánico de Impeccable sin hallazgos bloqueantes.
- Capturas de escritorio, tableta y móvil para POS, WhatsApp, Estado, Historial, caja y administración.
- Pruebas de teclado, foco, scroll, navegación inferior fija, modales y acciones de pedido.
- Revisión final de que el negocio seleccionado, la caja y el permiso no se mezclen entre pantallas.
