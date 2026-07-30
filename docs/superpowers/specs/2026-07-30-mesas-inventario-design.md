# Diseño: mesas configurables e inventario conectado

Fecha: 2026-07-30

## Objetivo

Permitir que el dueño o administrador configure el salón de Mideli sin depender de código: zonas, mesas con formas y posiciones editables, y un inventario de insumos conectado a recetas. El mesero podrá identificar y seleccionar mesas desde el POS, mientras que cocina recibirá los pedidos normalmente.

## Alcance aprobado

- Editor de mesas con cuadrícula y formas predefinidas: redonda, cuadrada, rectangular y barra.
- Movimiento, tamaño y rotación de mesas dentro de un lienzo.
- Zonas personalizadas como Salón, Terraza o Reservado.
- Nombre, capacidad, forma, zona y activo/inactivo por mesa.
- Selección de mesa desde el POS para pedidos de comedor.
- Insumos configurables con unidad, stock actual, stock mínimo, costo y estado activo.
- Recetas por platillo con cantidad de insumo por unidad vendida.
- Descuento de inventario al enviar un pedido a cocina.
- Reposición automática al cancelar un pedido que ya descontó inventario.
- Historial de movimientos de inventario para ajustes, consumo y reposición.

## Roles y permisos

- `owner` y `admin`: pueden crear, editar, mover, activar y eliminar zonas/mesas; administrar insumos, recetas y ajustes.
- `waiter`: puede ver mesas activas y seleccionarlas en el POS; no puede editar configuración ni inventario.
- `kitchen`: no necesita acceso a configuración; conserva su flujo actual de KDS.

## Arquitectura de datos

Se usarán tablas relacionales en Supabase, no un mapa serializado. Esto permite consultas simples, RLS y futuras integraciones.

### Mesas

- `table_zones`: nombre, orden, activo.
- `restaurant_tables`: nombre visible, zona, forma, posición normalizada, dimensiones normalizadas, rotación, capacidad, activo.

Las posiciones y dimensiones se guardan como porcentajes/fracciones del lienzo para que el mapa se mantenga usable en diferentes tamaños de pantalla. El POS usa el nombre visible de la mesa y conserva también `table_id` en el pedido.

### Inventario

- `inventory_items`: nombre, unidad, stock actual, stock mínimo, costo unitario, activo.
- `inventory_recipes`: relación entre platillo e insumo, cantidad consumida por unidad.
- `inventory_movements`: entradas, ajustes, consumo por pedido y reposiciones por cancelación, con usuario y referencia.

El descuento se realizará en una acción de servidor transaccional al enviar el pedido a cocina. La operación será idempotente por pedido para evitar dobles descuentos si el cliente reintenta. Si un pedido se cancela después de descontar, se registrará un movimiento inverso una sola vez.

## Experiencia de usuario

### Mesas

Se agregará una sección administrativa “Mesas” con un encabezado de zona, una barra de herramientas y un lienzo de cuadrícula. El botón “Agregar mesa” crea una mesa centrada con nombre sugerido; al seleccionarla aparece un panel lateral con nombre, zona, forma, capacidad, tamaño, rotación y estado. Arrastrar mueve la mesa y los controles de tamaño/rotación se guardan con “Guardar cambios”.

En el POS, el campo libre actual de mesa se sustituirá por un selector de mesas activas cuando el tipo de pedido sea `comedor`. Se mantendrá una opción para escribir un identificador manual durante la transición o para casos como “Barra 2”.

### Inventario

Se agregará una sección “Inventario” con resumen de insumos totales, existencias bajas y valor estimado. La tabla permitirá buscar, filtrar por estado y abrir un formulario de alta/edición. Cada insumo tendrá un acceso a “Receta” para seleccionar platillos y cantidades. Los ajustes manuales pedirán cantidad, tipo de movimiento y nota; nunca se editará el historial directamente.

## Estados y errores

- Carga: mostrar estado de carga en lienzo, tabla y formularios.
- Vacío: explicar cómo crear la primera zona, mesa o insumo.
- Error de guardado: conservar los datos en pantalla y mostrar mensaje accionable.
- Stock bajo: marcar la fila con warning y mostrar la diferencia contra el mínimo.
- Stock insuficiente: permitir enviar el pedido, pero advertir al mesero y registrar el movimiento real; no bloquear ventas por una cifra posiblemente desactualizada.
- Eliminación: impedir eliminar un insumo usado en una receta; permitir desactivarlo. Las mesas y zonas con historial se desactivan en lugar de borrarse.

## Verificación

- Revisar la migración SQL y políticas RLS.
- Ejecutar una prueba de lectura/escritura con cliente autenticado si las credenciales del proyecto están disponibles.
- Ejecutar `npm run lint` y `npm run build`.
- Revisar los flujos: crear mesa, seleccionarla en POS, enviar pedido, descontar receta, cancelar pedido y reponer inventario.
