# Plan de implementación: biblioteca y editor de recetas

Fecha: 2026-08-01
Especificación: `docs/superpowers/specs/2026-08-01-recipe-library-editor-design.md`

## Objetivo verificable

Las recetas existentes deben aparecer automáticamente en una biblioteca por producto. Un administrador debe poder abrir un producto, editar su receta base o una opción y guardar el reemplazo en una sola transacción desde celular, tableta o computadora.

## Tareas

1. Crear una migración nueva con la RPC transaccional `replace_inventory_recipe`.
   - Validar usuario administrador, producto, opción, insumos activos, cantidades y duplicados.
   - Revocar ejecución pública y concederla solamente a `authenticated`.
   - Verificar éxito, rechazo por permisos y reversión ante datos inválidos.

2. Crear utilidades puras para agrupar y resumir recetas.
   - Indexar insumos y recetas con `Map`.
   - Calcular estado `configured`, `partial` o `missing`.
   - Calcular componentes, cobertura de opciones y costo estimado.
   - Verificar con un script de regresión independiente.

3. Separar la biblioteca y el editor en componentes enfocados.
   - `recipe-library.tsx` para búsqueda, filtros y fichas.
   - `recipe-editor.tsx` para producto base, opciones e ingredientes.
   - `recipe-ingredient-picker.tsx` para búsqueda y selección.
   - Reutilizar los tokens y componentes visuales actuales del inventario.

4. Integrar Recetas como vista visible del inventario.
   - Añadir `recipes` a la navegación principal.
   - Mantener Insumos dedicado al catálogo.
   - Pasar categorías, productos, insumos y recetas a la biblioteca.
   - Mostrar las recetas actuales sin interacción previa.

5. Cambiar el store al guardado transaccional.
   - Sustituir borrar e insertar desde el cliente por la RPC.
   - Actualizar el estado local con las filas devueltas.
   - Conservar el borrador ante errores.

6. Validar la experiencia completa.
   - Confirmar que Sencilla y Tokio Bacon Roll aparecen al abrir Recetas.
   - Crear y editar una receta temporal, recargar y comprobar persistencia.
   - Verificar permisos con administrador y mesero.
   - Revisar 1440 x 900, 1024 x 768, 768 x 1024 y 390 x 844.
   - Confirmar que no existe desbordamiento horizontal ni errores del navegador.

7. Ejecutar las verificaciones obligatorias.
   - `npm run lint`.
   - `npm run build`.
   - Dejar localhost activo en el puerto 3000.
   - No realizar despliegue.
