# Mideli: biblioteca y editor simplificado de recetas

Fecha: 2026-08-01
Estado: diseño aprobado por el usuario
Entorno de entrega: localhost, sin despliegue a Vercel

## 1. Propósito

Hacer que las recetas de inventario sean visibles, comprensibles y fáciles de mantener desde computadora, tableta o celular.

La experiencia debe permitir que una persona sin conocimientos técnicos pueda responder rápidamente:

- qué productos ya tienen receta;
- cuáles siguen sin configurar;
- qué insumos y cantidades consume cada producto;
- cuánto cuesta aproximadamente preparar cada producto;
- qué cambia cuando se selecciona una variación, topping, salsa o extra.

## 2. Diagnóstico confirmado

Supabase conserva actualmente dos recetas base:

- `Sencilla`: 1 unidad de `Carne de hamburguesa`;
- `Tokio Bacon Roll`: 1 unidad de `Carne de hamburguesa`.

Las políticas RLS permiten que el personal autenticado consulte recetas y reservan su edición para dueño y administrador.

El problema principal está en la interfaz actual:

- no existe una lista de recetas creadas;
- el usuario debe elegir primero un producto en un selector;
- debe usar un segundo selector para distinguir el producto base de sus opciones;
- no hay estados visibles de configurada, parcial o sin receta;
- después de recargar la pantalla no se presenta ninguna receta hasta volver a seleccionar un producto;
- la creación y la consulta ocurren dentro del mismo formulario sin una jerarquía clara;
- guardar utiliza un borrado seguido de una inserción, lo que puede dejar una receta vacía si la conexión falla entre ambas operaciones.

## 3. Decisiones aprobadas

- La entrada principal mostrará todos los productos del menú.
- Cada producto agrupará su receta base y las recetas de variaciones, toppings, salsas o extras.
- Las recetas existentes se mostrarán automáticamente sin exigir una selección previa.
- Se conservará el tema oscuro y la identidad visual de Mideli.
- La experiencia priorizará celular y tableta sin perder densidad útil en computadora.
- Las recetas se guardarán de forma transaccional.
- No se realizará despliegue público durante esta entrega.

## 4. Arquitectura de información

La sección `Recetas` tendrá tres niveles.

### Nivel 1: resumen

El encabezado mostrará:

- productos configurados;
- productos con configuración parcial;
- productos sin receta;
- buscador por nombre;
- filtro por categoría;
- filtro por estado.

Las cifras serán accesos de filtro y no métricas decorativas.

### Nivel 2: biblioteca de productos

Cada producto aparecerá como una ficha compacta con:

- nombre y categoría;
- estado de configuración;
- cantidad de insumos en la receta base;
- progreso de opciones configuradas, cuando existan;
- costo estimado de la receta base;
- resumen breve de ingredientes;
- acción `Ver o editar receta`.

Estados:

- `Configurada`: la receta base existe y todas las opciones del producto tienen receta;
- `Parcial`: existe al menos una receta, pero falta la base o alguna opción;
- `Sin receta`: no existe ningún componente para ese producto.

Los productos sin modificadores no mostrarán progreso de opciones.

### Nivel 3: editor de un producto

Al tocar una ficha se abrirá un panel central. El usuario ya no tendrá que volver a elegir el producto.

El editor mostrará:

1. `Producto base`, siempre como primera sección.
2. Grupos de opciones, variaciones, toppings, salsas o extras debajo del producto base.
3. Un indicador por sección: configurada o pendiente.
4. Los ingredientes de la sección activa.
5. El costo estimado de esa sección.

En celular, las secciones serán botones horizontales desplazables. En tableta y computadora podrán mostrarse en una columna lateral compacta.

## 5. Creación y edición

### Agregar un ingrediente

La acción `Agregar ingrediente` abrirá un selector buscable con los insumos activos. Cada resultado mostrará:

- nombre;
- unidad de uso;
- existencia disponible;
- costo unitario.

Al elegir un insumo se agregará una fila con:

- nombre del insumo;
- cantidad utilizada;
- unidad persistente junto al campo;
- costo calculado para esa cantidad;
- acción para eliminarlo.

Un mismo insumo no podrá agregarse dos veces a la misma sección. Si el usuario lo intenta, Mideli enfocará la fila existente.

### Cantidades

- La cantidad debe ser mayor que cero.
- Se admitirán hasta cuatro decimales.
- La unidad se obtendrá del insumo y no será editable desde la receta.
- El costo se calculará con la precisión interna del inventario y se mostrará redondeado a moneda.

### Guardado

El botón principal será `Guardar receta`.

Antes de guardar se validarán:

- ingredientes repetidos;
- cantidades vacías, iguales a cero o negativas;
- insumos desactivados;
- opciones que ya no existen en el producto.

Al guardar:

- la sección activa se reemplazará en una sola transacción;
- la respuesta devolverá la receta persistida;
- el estado local se actualizará inmediatamente;
- la ficha del producto actualizará su estado y costo sin recargar la página;
- un mensaje breve confirmará el resultado.

Una receta vacía no se interpretará como un guardado accidental. Para quitar todos sus ingredientes se utilizará `Eliminar receta`, con confirmación explícita.

## 6. Variaciones y modificadores

La receta total de una venta seguirá siendo la suma de:

- receta base del producto;
- receta de cada opción elegida en el pedido.

Las opciones se identificarán por sus identificadores estables. Los nombres se mostrarán como referencia y podrán cambiar sin romper la relación.

Cuando una opción del menú cambie o desaparezca:

- las recetas vinculadas a opciones existentes seguirán visibles;
- una receta vinculada a una opción eliminada aparecerá en una sección de revisión;
- no se borrará automáticamente información histórica.

## 7. Componentes y responsabilidades

La implementación separará responsabilidades para evitar que un solo archivo controle toda la experiencia:

- `RecipeLibrary`: búsqueda, filtros, estados y listado de productos.
- `RecipeProductCard`: resumen de cobertura, ingredientes y costo.
- `RecipeEditor`: navegación entre base y opciones, borrador y guardado.
- `RecipeIngredientPicker`: búsqueda y selección de insumos activos.
- `recipe-utils`: agrupación de recetas, cálculo de cobertura y costo.
- `inventory-store`: carga, reemplazo transaccional y actualización del estado local.

La sección de insumos conservará únicamente el catálogo de insumos. Recetas tendrá una entrada visible y directa dentro del inventario.

## 8. Flujo de datos

1. Inventario carga productos, categorías, insumos y recetas en paralelo.
2. La biblioteca agrupa las filas de receta por producto y opción mediante datos derivados memorizados.
3. Las fichas se renderizan a partir de ese índice y nunca dependen de una selección previa.
4. Al abrir un producto, el editor crea un borrador a partir de las recetas cargadas.
5. Guardar invoca una función RPC transaccional que reemplaza solamente la sección activa.
6. La RPC valida permisos, producto, opción, insumos y cantidades.
7. La respuesta actualiza el store y la ficha sin una recarga completa.

No se creará una tabla adicional para la biblioteca. La vista se derivará de `menu_items`, `categories`, `inventory_items` e `inventory_recipes`.

## 9. Operación transaccional en Supabase

Se agregará una función RPC dedicada a reemplazar una receta. La función:

- requerirá autenticación;
- validará que el usuario sea dueño o administrador;
- comprobará que el producto exista;
- comprobará que cada insumo exista y esté activo;
- comprobará que las cantidades sean mayores que cero;
- eliminará e insertará la sección dentro de la misma transacción;
- devolverá las filas persistidas;
- no expondrá privilegios de escritura directa adicionales.

La función no utilizará nombres como identidad de una opción cuando exista un identificador estable.

## 10. Estados y recuperación

- `Cargando`: esqueletos con el tamaño aproximado de las fichas.
- `Sin productos`: indicar que primero debe crearse el menú.
- `Sin insumos`: explicar que debe registrarse al menos un insumo antes de crear recetas.
- `Sin resultados`: conservar filtros visibles y ofrecer limpiarlos.
- `Sin receta`: acción directa `Crear receta`.
- `Error de carga`: mostrar el problema y una acción `Reintentar`.
- `Error al guardar`: conservar el borrador y permitir reintentar.
- `Sin conexión`: no cerrar el editor ni descartar cantidades capturadas.
- `Permiso insuficiente`: conservar vista de consulta y ocultar acciones de edición.

## 11. Diseño adaptable y accesibilidad

- Áreas táctiles mínimas de 44 px.
- Una columna de fichas en celular.
- Dos columnas en tableta cuando el ancho lo permita.
- Lista más densa en computadora sin convertirla en una tabla horizontal.
- Panel editor centrado con altura limitada y contenido desplazable.
- Acción de guardado siempre accesible al final del panel.
- Etiquetas persistentes para cantidades.
- Unidades visibles fuera del placeholder.
- Estados comunicados con texto e icono, no solo con color.
- Foco visible y navegación por teclado.
- Sin desbordamiento horizontal a partir de 360 px.

## 12. Pruebas y criterios de aceptación

### Visibilidad

- `Sencilla` aparece como receta creada sin seleccionar previamente el producto.
- `Tokio Bacon Roll` aparece como receta creada sin seleccionar previamente el producto.
- Cada ficha muestra `Carne de hamburguesa`, cantidad `1` y su unidad real.
- Productos sin receta aparecen con una acción clara para configurarlos.
- Buscar y filtrar no altera las recetas guardadas.

### Edición

- Abrir una ficha carga automáticamente su receta base y sus opciones.
- Agregar un ingrediente muestra su unidad y costo.
- No se admiten duplicados ni cantidades inválidas.
- Guardar actualiza la ficha sin recargar la página.
- Recargar la página conserva y vuelve a mostrar la receta.
- Eliminar una receta requiere confirmación.

### Integridad

- Una falla durante el guardado no elimina la receta anterior.
- Un usuario no administrativo no puede modificar recetas mediante la interfaz ni la API.
- Una opción renombrada conserva su receta mediante su identificador.
- Una opción eliminada queda marcada para revisión.

### Dispositivos

- La biblioteca y el editor funcionan a 390 x 844.
- La biblioteca y el editor funcionan a 768 x 1024 y 1024 x 768.
- No existe desbordamiento horizontal.
- El teclado virtual no oculta permanentemente la acción principal.

### Verificación técnica

- Consulta real a Supabase antes y después de guardar.
- Prueba de transacción fallida con conservación de la receta anterior.
- Prueba real con dueño o administrador.
- Prueba de permiso denegado con un rol no administrativo.
- `npm run lint` sin errores.
- `npm run build` sin errores.
- Servidor local operativo en el puerto 3000.
- Ningún despliegue a Vercel.
