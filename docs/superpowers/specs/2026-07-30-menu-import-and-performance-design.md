# Mideli: importación de menú y rendimiento del POS

## Objetivo

Reemplazar el menú de Mideli con el contenido de `Menu_Mideli_Completo_Provisional.docx`, aplicar los nuevos sabores de boneless y alitas, limpiar los datos de prueba antiguos y hacer más rápida la carga y respuesta del POS.

## Decisiones aprobadas

- El DOCX es la fuente principal de nombres, categorías y descripciones.
- Los precios actuales se conservan cuando existe una coincidencia clara.
- Los productos sin precio explícito y sin coincidencia segura no se publican con precio inventado.
- Como el proyecto no tiene uso operativo real, se borran los datos antiguos del menú y los pedidos de prueba que dependen de ellos.
- Los sabores de boneless y alitas quedan como modificadores: Buffalo, BBQ, Buffalo Ranch, Cajun, Ajo Parmesano y Honey Mustard.

## Modelo de datos

La actualización usa las tablas actuales `categories`, `menu_items`, `orders` y `order_items`.

1. Borrar pedidos y partidas de prueba que impiden limpiar el catálogo.
2. Borrar productos y categorías antiguas.
3. Insertar el menú nuevo con `is_active = true`, orden estable y modificadores estructurados en `jsonb`.

La operación debe ser idempotente: repetirla no debe duplicar categorías ni productos publicados. La verificación final debe confirmar categorías activas, productos activos y ausencia de sabores obsoletos en boneless y alitas.

## Mapeo de contenido

- Hamburguesas: Sencilla, Doble, Triple, Low Carb y Burger Onion.
- Papas / Para Compartir: Extra, Orden, Animal Style, Bacon Papas, Ultimate, Pizza Fries, Buffalo Chicken Fries y Taco Loaded Fries.
- Boneless y Alitas: una presentación compartida con opciones de papas y sabor.
- Sushis: los rollos y descripciones del DOCX, agrupados en una categoría operativa.
- Bowls: Pokebowl, Yakimeshi y Gohan.
- Toppings: Dracarys, Mr. Crab, Cordon Blue, Gratinado y Especial.
- Bebidas: las bebidas del DOCX, conservando precios actuales solo cuando exista una equivalencia clara.

## Rendimiento

- Agregar una acción `fetchCatalog` que consulte categorías y productos en paralelo.
- Reducir el `select` del catálogo a los campos usados por POS y administración.
- Eliminar la segunda consulta de órdenes activas que se dispara cuando llega el catálogo.
- Derivar el filtrado de productos con una memoización pequeña y estable, sin abstraer el flujo.
- Mantener la carga de analíticas y administración separada de la ruta crítica del mesero.

## Estados y seguridad

- El POS conserva estados de carga, catálogo vacío y búsqueda sin resultados.
- Los errores de sincronización se muestran como toast accionable sin limpiar el carrito.
- La actualización remota se ejecuta desde un entorno protegido y se verifica con consultas de lectura posteriores.
- No se expone la clave secreta de Supabase al cliente ni se cambia el modelo de autorización.

## Verificación

- Confirmar con consulta de lectura el conteo de categorías y productos activos.
- Confirmar que no exista `Mango Habanero` en boneless o alitas.
- Confirmar la presencia de los cuatro sabores solicitados.
- Ejecutar el detector de Impeccable sobre las superficies modificadas.
- Ejecutar `npm run lint` y `npm run build`.
- Revisar que el POS cargue el catálogo, permita seleccionar modificadores y mantenga el flujo de pedido.
