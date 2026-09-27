# Catálogo y combos extensibles de Just Dipping

## Objetivo

Importar el catálogo actual de Just Dipping desde Firebase a su negocio en Mideli y permitir que sus futuros productos se configuren desde la administración, sin hardcodear nombres ni excepciones para una promoción.

El alcance es catálogo, disponibilidad de productos y composición de combos. No incluye importar tickets históricos, caja, inventario ni cambiar el comportamiento de Mideli o WhatsApp.

## Hallazgos de la fuente

- Firestore contiene 7 categorías y 28 documentos de productos; 26 productos están activos y 2 inactivos.
- Hay 3 combos activos con componentes fijos y grupos de bebidas seleccionables.
- `Promo Lunes` cuesta $150. Su descripción menciona Supreme Box, una bebida pequeña y Cheesecake de Tortuga.
- Cheesecake de Tortuga existe como producto inactivo con precio $0, pero no está en la lista estructurada de componentes del combo. El dueño confirmó que era un regalo exclusivo de esa promoción, no un producto para vender solo.
- Algunos combos identifican sus componentes por slug y otros por UUID. La importación debe resolver ambos formatos contra los productos fuente.

## Diseño acordado

### Forma de venta configurable por producto

Cada producto tendrá una configuración editable en su ficha, independiente de su estado activo:

1. `Individual y en combos`.
2. `Solo individual`.
3. `Solo en combos`.

Los productos existentes conservan por defecto el comportamiento actual. El dueño podrá aplicar cualquiera de estas opciones a productos nuevos desde la interfaz, sin solicitar cambios de código. Desactivar un producto seguirá siendo una acción separada.

La administración de combos solo ofrecerá productos activos permitidos como componentes. El catálogo y la búsqueda normal de Mesero no mostrarán productos marcados como `Solo en combos`. El backend también rechazará venderlos como líneas independientes, para que no se pueda saltar la regla desde una petición manipulada.

### Regalo dentro de una promoción

La disponibilidad se configura en el producto, pero si un componente es gratuito, regalo o tiene un cargo extra se define dentro de cada combo. Así el mismo producto puede ser regalo en una promoción y tener otro precio en otra.

Promo Lunes se representará como:

- Supreme Box, componente fijo.
- Una bebida elegible del grupo existente.
- Cheesecake de Tortuga, componente fijo, cantidad 1, identificado como regalo y con ajuste de precio $0.
- Precio del combo conservado en $150.

El cheesecake estará habilitado como `Solo en combos`, pero la marca visual `Regalo` pertenece a su componente en Promo Lunes, no al producto global.

### Pedido, cocina, historial e inventario

- Antes de agregar el combo, Mesero muestra sus componentes y marca el cheesecake como regalo.
- Cocina recibe el cheesecake como componente del combo para prepararlo o incluirlo.
- El historial conserva el nombre, cantidad y condición de regalo como snapshot, aunque luego cambie el catálogo.
- El ingreso se atribuye al combo. El regalo no genera una línea de venta independiente ni incrementa el total.
- No se inventan recetas ni existencias. Si se configura después una receta de Cheesecake de Tortuga, el componente podrá participar en el descuento de inventario existente.

### Importación segura

- La carga se identifica por los IDs de documentos de Firebase y puede repetirse sin duplicar categorías, productos ni combos.
- Se conserva el estado activo/inactivo de la fuente, excepto Cheesecake de Tortuga, cuya disponibilidad en el combo aprobado exige habilitarlo como `Solo en combos`.
- La carga no borra filas ni modifica pedidos, historial, turnos de caja o inventario existentes.
- Los registros existentes de Just Dipping se comparan antes de insertar. Una coincidencia ambigua se reporta para resolverla, no se sobrescribe automáticamente.
- Las imágenes se importan solo cuando su recurso fuente pueda resolverse de manera verificable; de lo contrario se conserva el producto y se usa la presentación sin imagen.

## Criterios de aceptación

1. El dueño puede crear un producto nuevo y elegir su forma de venta desde la administración.
2. Un producto `Solo en combos` no aparece en las categorías, búsqueda ni selección de producto individual en Mesero.
3. El mismo producto sí aparece en el editor de combos y puede agregarse a un pedido mediante el combo.
4. Una petición directa de venta del producto combo-only es rechazada en backend.
5. Promo Lunes muestra el cheesecake como regalo, ofrece una bebida del grupo, suma $150 y envía el cheesecake a cocina.
6. Historial conserva el regalo sin atribuirle una venta adicional.
7. Repetir la importación no crea duplicados ni cambia turnos de caja, pedidos, inventario o datos de Mideli.
8. Los combos de bebida seleccionable validan que se elija exactamente una opción.

## Fuera de alcance

- Importar historial de tickets desde Firebase.
- Copiar saldos, recetas, stock o turnos de caja.
- Migrar datos de Just Dipping a Mideli.
- Convertir `Promo Lunes` en promoción por fecha o automatizar su disponibilidad semanal.

## Revisión de ambigüedades

- `Regalo` se configura por componente del combo, no como atributo global del producto.
- `Solo en combos` es distinto de inactivo: el cheesecake está disponible dentro de Promo Lunes, pero no se vende directamente.
- No se asume seguimiento de existencias para el cheesecake hasta que exista una receta de inventario configurada.
- La importación no activa promociones por calendario ni altera precios distintos a los registrados en Firebase.
