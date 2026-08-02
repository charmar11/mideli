# Plan de implementación: Inventario guiado y seguro

## 1. Pruebas de regresión

- Extender la prueba visual de recetas para quitar el último ingrediente y comprobar que se guarda como `Sin receta`.
- Crear una prueba de RPC con usuarios admin y waiter para conteos vacíos y eliminación permanente.
- Crear datos temporales aislados y limpiarlos siempre al finalizar.

## 2. Supabase

- Crear una migración nueva con la CLI.
- Cancelar únicamente conteos draft sin líneas existentes.
- Reforzar `start_inventory_count` para reparar un draft vacío antes de devolverlo.
- Crear una función privada privilegiada para eliminar un insumo y sus relaciones después de validar rol y nombre.
- Exponer un wrapper público `SECURITY INVOKER`, sin acceso anónimo.
- Aplicar la migración al proyecto enlazado y ejecutar pruebas directas de permisos y atomicidad.

## 3. Estado de cliente

- Agregar `reactivateItem` y `deleteItemPermanently` al store.
- Actualizar el estado local solo después de una respuesta exitosa de Supabase.
- Mantener `replaceRecipe` como único punto de guardado de recetas.

## 4. Recetas

- Permitir que una receta existente con borrador vacío invoque eliminación explícita.
- Cambiar el CTA a `Guardar como sin receta`.
- Mantener confirmación y estados de carga.

## 5. Conteo

- Agregar explicación compacta del flujo antes de iniciar.
- Añadir ayuda contextual durante la captura.
- Detectar sesiones vacías y ofrecer reinicio seguro.
- Mantener conteo rápido, completo, revisión y conciliación existentes.

## 6. Insumos

- Filtrar Activos, Archivados y Todos.
- Archivar como acción principal y ocultar archivados por defecto.
- Permitir reactivar.
- Agregar diálogo de borrado permanente con escritura exacta del nombre.

## 7. Tutorial

- Crear un componente dedicado con siete pasos.
- Cambiar de vista sin crear ni modificar datos.
- Resaltar pestaña y contenido.
- Abrir una sola vez por usuario y navegador.
- Agregar botón de interrogación en el encabezado para repetirlo.

## 8. Validación final

- TypeScript, ESLint y build de producción.
- Lint y asesores de Supabase.
- Pruebas visuales en escritorio, tableta y móvil.
- Confirmar que no quedan datos temporales y que localhost sigue activo.
