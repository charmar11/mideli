# Findings: catálogo Just Dipping

- Firebase MCP tiene acceso de lectura al proyecto `just-dipping`.
- Firestore tiene 7 categorías, 28 documentos de productos, 26 activos y 2 inactivos.
- La fuente contiene 3 combos activos con componentes fijos y opciones de bebida.
- Componentes de combos apuntan a veces por UUID y a veces por slug; ambos formatos se resuelven a los productos fuente.
- Cheesecake de Tortuga existe inactivo y a $0. `Promo Lunes` lo menciona en la descripción pero no en su lista `comboItems`; el usuario confirmó que debe ser regalo de esa promoción.
- Antes de migrar, Supabase de producción tenía Just Dipping activo con 1 categoría y 1 producto. No modificar pedidos ni turnos de caja.
- La migración desplegada `20260926120000_business_combos_and_folios.sql` añade `is_combo` y `combo_definition`; `ComboBuilder` exige componentes activos y el POS filtra los inactivos, por lo que falta una disponibilidad combo-only separada.
- El editor actual tiene pestañas de información, variaciones y combo; se debe ampliar esa misma experiencia.
- El proyecto tiene cambios ajenos al alcance y documentos `docs_dev` previos. No modificarlos ni incluirlos en el commit de esta tarea.

## Riesgos que requieren control

- Rechazar en backend una línea de venta directa combo-only, no depender del filtro visual.
- Conservar el precio padre del combo y guardar el regalo dentro del snapshot sin atribuirle ingreso separado.
- No importar inventario, recetas, tickets históricos, caja ni datos de Mideli en este alcance.
- Reconciliar el producto existente de Just Dipping; no hacer upsert por nombre ambiguo.
- Revisar recursos de imágenes Firebase, que pueden ser rutas relativas, y usar fallback si no pueden verificarse.

## Estado tras implementación y migración

- El esquema permite `both`, `standalone_only` y `combo_only`. Un trigger impide vender individualmente un producto combo-only y deriva el indicador de regalo desde la definición confiable del combo.
- El catálogo importado quedó vinculado a Just Dipping por ID fuente: 7 categorías, 28 productos, 27 activos y 3 combos.
- Promo Lunes tiene Supreme Box, una bebida a elegir y Cheesecake de Tortuga como regalo; el precio padre sigue siendo $150.
- Los productos de categorías inactivas no se ofrecen para venta individual, pero los productos activos aún pueden ser componentes de combos.
- Las cajas abiertas siguen en 2. No se importaron tickets, inventario, recetas, pagos ni historial.
- Las imágenes fuente no se transfirieron; los productos usan el fallback visual hasta que se resuelvan los recursos de forma segura.
