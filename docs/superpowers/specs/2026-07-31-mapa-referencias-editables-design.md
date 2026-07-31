# Diseño: referencias editables del mapa de mesas

## Objetivo

Agregar elementos visuales independientes de las zonas y mesas para ubicar partes del local, por ejemplo “Mideli”, “Barra”, “Caja”, “Entrada” o “Cocina”. Deben ser editables desde tablet y PC, persistir en Supabase y no interferir con la selección de mesas.

## Decisión

Se usarán rótulos independientes del mapa. No pertenecerán a una zona, porque pueden representar referencias centrales o elementos que atraviesan varias zonas. La misma referencia se mostrará en el editor de mesas y en el selector de mesa del mesero, pero en este último será informativa y no seleccionable.

## Datos y persistencia

Se agregará `table_map_labels` con UUID, texto, posición y tamaño normalizados, colores de fondo/texto/borde, orden, estado activo y timestamps. Tendrá RLS para que el personal autenticado pueda leer y únicamente owner/admin pueda crear, editar o desactivar. También se agregará el índice para el filtro de elementos activos y los grants explícitos del Data API.

## Experiencia de edición

- Botón “Agregar referencia” en la barra del editor.
- Creación con un cuadro centrado de edición, siguiendo el inspector actual.
- Texto libre y presets rápidos: Mideli, Barra, Caja, Entrada, Cocina y Baños.
- Color de fondo, texto y borde mediante paleta Mideli y selector personalizado.
- Arrastre con ajuste a cuadrícula, redimensionado desde la esquina y acciones rápidas de editar/borrar.
- En PC, todas las acciones estarán disponibles con clic, botones visibles y atajos, sin depender de gestos táctiles.
- En tablet se conservarán targets grandes y controles de esquina.

## Historial y seguridad de interacción

Crear, mover, redimensionar, editar y eliminar referencias entrará al historial existente de deshacer/rehacer. Las referencias no abrirán el inspector al tocar una mesa en el flujo del mesero. Los controles de edición tendrán `aria-label`, estados de foco y confirmación antes de desactivar.

## Validación

Se verificará con `npm run lint`, `npm run build` y el detector mecánico de Impeccable sobre los archivos UI modificados. La revisión manual cubrirá mapa de PC, mapa de tablet y selector de mesa del mesero.
