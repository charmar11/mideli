# Inventario guiado, conteos recuperables y borrado controlado

Fecha: 2026-08-01

## Objetivo

Hacer que una persona sin experiencia en inventarios pueda entender y utilizar todas las secciones de Mideli sin capacitación externa. Corregir además los dos callejones sin salida actuales: una receta que queda sin ingredientes no se puede guardar y un conteo vacío no se puede reiniciar.

## Alcance

El cambio cubre cuatro áreas relacionadas dentro de `/settings/inventario`:

1. Tutorial guiado de Inventario.
2. Guardado de una receta que queda sin ingredientes.
3. Explicación y recuperación del conteo físico.
4. Archivo, reactivación y eliminación permanente de insumos.

No cambia el cálculo de existencias, el descuento automático por ventas ni el historial normal de movimientos.

## 1. Tutorial guiado de Inventario

### Comportamiento

- Se abrirá automáticamente una sola vez por usuario y navegador cuando entre a Inventario.
- Se podrá repetir en cualquier momento con un botón de interrogación en la esquina superior derecha del encabezado.
- Será opcional, con controles Atrás, Siguiente y Omitir.
- Al terminar regresará a Resumen.
- El avance se guardará en `localStorage` con una clave versionada que incluya al usuario, para no modificar el tutorial general existente.

### Siete pasos

1. Bienvenida: explica que Inventario une existencias, compras, recetas, conteos y auditoría.
2. Resumen: muestra alertas, valor aproximado y acciones importantes.
3. Insumos: explica unidades de uso, unidad de compra, conversión, costo y archivo.
4. Recetas: explica producto base, variaciones y descuento automático al vender.
5. Comprar: explica pedidos y recepciones, incluyendo actualización de costos.
6. Contar: explica el conteo físico y la conciliación de diferencias.
7. Movimientos: explica el historial de entradas, ventas, mermas y ajustes.

Cada paso cambiará a la sección real correspondiente y resaltará su pestaña y contenido. La guía no creará ni modificará datos.

## 2. Recetas sin ingredientes

### Problema actual

Al quitar el último ingrediente, el borrador queda vacío. La interfaz desactiva Guardar y la función de guardado rechaza listas vacías, aunque el servidor ya admite una eliminación explícita y transaccional.

### Solución

- Si una receta existente queda vacía, el botón principal cambiará a `Guardar como sin receta`.
- Al pulsarlo se solicitará confirmación.
- La operación llamará a `replace_inventory_recipe` con eliminación explícita.
- El producto o variación pasará inmediatamente a estado `Sin receta`.
- Si la sección nunca tuvo ingredientes, el botón seguirá desactivado porque no existe ningún cambio que guardar.
- La acción secundaria `Eliminar receta` seguirá disponible cuando la receta todavía tenga ingredientes.

## 3. Conteo físico comprensible y recuperable

### Modelo mental mostrado al usuario

1. Elegir alcance: rápido para insumos críticos o completo para todos los activos.
2. Escribir lo que realmente se encuentra físicamente, no la cifra del sistema.
3. Mideli compara ambas cantidades y solicita un motivo si no coinciden.
4. Al finalizar, el sistema concilia de inmediato o envía diferencias importantes a revisión administrativa.

La pantalla inicial mostrará este flujo en tres bloques compactos y mantendrá los dos botones actuales. Durante el conteo mostrará una indicación breve: `Escribe lo que ves físicamente; Mideli hará la comparación después`.

### Conteos vacíos

El conteo vacío actual es una sesión `draft` sin líneas. La interfaz detectará ese estado, explicará lo ocurrido y ofrecerá `Reiniciar conteo`.

Una migración:

- cancelará únicamente sesiones draft sin líneas existentes;
- reforzará `start_inventory_count` para reparar una sesión vacía antes de devolverla;
- conservará sin cambios los conteos que sí tienen líneas o historial.

## 4. Ciclo de vida de insumos

### Acción normal: archivar

- Un insumo activo tendrá la acción `Archivar`.
- Al archivarlo desaparecerá de la vista Activos, pero conservará recetas e historial.
- La lista tendrá filtros `Activos`, `Archivados` y `Todos`.
- Un insumo archivado se podrá reactivar.

### Eliminación permanente

- Solo estará disponible para owner y admin sobre insumos archivados.
- Abrirá un diálogo que explique el alcance y exija escribir exactamente el nombre del insumo.
- El diálogo indicará que se eliminarán relaciones de recetas, lotes, conteos, recepciones, compras y movimientos.
- La eliminación se ejecutará en una operación protegida del servidor con validación de rol y confirmación.
- La función privilegiada vivirá en el esquema privado. Una función pública `SECURITY INVOKER` será el único punto expuesto y no contendrá privilegios elevados.
- Se revocará acceso anónimo y se concederá ejecución solo a usuarios autenticados. La función privada volverá a validar que el rol sea owner o admin.
- La interfaz no asumirá éxito: actualizará el estado local únicamente después de recibir confirmación de Supabase.

Esta acción existe para limpiar datos de prueba o registros creados por error. Durante operación real, Archivar será la opción recomendada.

## Componentes

- `InventoryOnboardingTour`: controla pasos, resaltado, cambio de sección y persistencia local.
- `InventoryManager`: agrega el botón de ayuda, identificadores de tour y coordinación de vistas.
- `InventoryCountPanel`: explica el flujo y recupera conteos vacíos.
- `RecipeEditor`: guarda una sección vacía como eliminación explícita.
- `InventoryItemsPanel`: filtros, reactivación y diálogo de eliminación permanente.
- `inventory-store`: acciones de reactivación y eliminación permanente.
- Migración Supabase: reparación de conteos vacíos y eliminación protegida de insumos.

## Errores y seguridad

- Toda operación destructiva tendrá confirmación visible.
- El borrado permanente requerirá coincidencia exacta del nombre.
- Un fallo de red conservará la interfaz y mostrará el error sin fingir que el dato desapareció.
- Usuarios sin rol administrativo no verán controles destructivos y el servidor los rechazará aunque intenten invocarlos directamente.
- La guía respetará `prefers-reduced-motion` y no bloqueará permanentemente la navegación.

## Verificación

- Reproducir el fallo actual de receta vacía y comprobar que después se guarda como `Sin receta`.
- Verificar que una sesión draft sin líneas se cancela o repara sin tocar conteos válidos.
- Probar inicio, cancelación, finalización y revisión de un conteo.
- Verificar archivo, filtro, reactivación y borrado permanente.
- Comprobar que waiter y kitchen no pueden borrar insumos permanentemente.
- Ejecutar pruebas visuales en 1440x900, 1024x768 y 390x844.
- Confirmar que la guía solo aparece una vez y que el botón `?` la reinicia.
- Ejecutar `npm run lint`, `npm run build`, lint de base de datos y asesores de Supabase.
