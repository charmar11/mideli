# Mapa de migración de datos y funciones

**Estado:** diseño técnico previo a migraciones. No contiene SQL ejecutable.

## Regla de migración

Todo lo que existe actualmente en producción pertenece a Mideli, según la confirmación del usuario. El primer paso será asociar esos registros a Mideli sin duplicarlos, renombrarlos ni cambiar sus folios.

No se crearán registros reales de Just Dipping hasta contar con la autorización y los datos de su dueño.

## Mapa por dominio

| Dominio actual | Estado actual | Tratamiento para Mideli-first | Modelo futuro |
|---|---|---|---|
| `profiles` y Auth | Usuarios con rol global | Conservar usuarios y credenciales | Perfil + membresías por alcance |
| `categories` | Catálogo global | Asociar todo a Mideli | Categorías por negocio |
| `menu_items` | Productos globales | Asociar todo a Mideli | Productos por negocio |
| Variaciones | JSON dentro del producto | Conservar estructura y validar | Variaciones del negocio |
| `restaurant_tables` | Mesas físicas globales | No duplicar | Mesas compartidas de Rincón 404 |
| `table_zones` | Zonas del plano global | No duplicar | Zonas compartidas |
| `orders` | Pedidos sin negocio | Asociar históricos a Mideli | Pedidos hijos de una cuenta de negocio |
| `order_items` | Líneas del pedido | Conservar líneas e importes | Líneas dentro del pedido de negocio |
| Estados y auditoría | Historial global | Asociar históricos a Mideli | Estados con límite de negocio |
| Visitas de mesa | No existe explícitamente | No reconstruir de forma peligrosa sin regla | Visita nueva por servicio de mesa |
| `payment_transactions` | Pagos sin negocio propio | Asociar a Mideli mediante sus pedidos | Pago de una sola cuenta de negocio |
| Allocations de pago | Relacionadas con órdenes | Conservar relaciones | No permitir asignaciones entre negocios |
| `cash_shifts` | Caja global | Asociar históricos a Mideli | Una caja por negocio |
| Movimientos de caja | Globales | Asociar históricos a Mideli | Movimientos por caja de negocio |
| Gastos | Vinculados a caja | Asociar a Mideli | Gastos por negocio |
| Inventario | Global | Asociar todo a Mideli | Inventario por negocio |
| Recetas | Globales | Asociar todo a Mideli | Recetas sin referencias cruzadas accidentales |
| Compras y conteos | Globales | Asociar todo a Mideli | Compras y conteos por negocio |
| Reportes | Consultas derivadas | Verificar que sigan igual para Mideli | Consultas por negocio |
| Imágenes de productos | Catálogo actual | Conservar URLs y ownership | Rutas y eliminación por negocio |
| WhatsApp | Configuración única | Asociar explícitamente a Mideli | Canal asignable por negocio en el futuro |
| Conversaciones/clientes WhatsApp | Datos del canal | Permanecen en Mideli | Separación por canal y negocio |
| Domicilios/delivery | Operación de Mideli | Asociar a Mideli | Configuración por negocio si se habilita |
| Push/Realtime | Suscripciones globales | Mantener funcionamiento Mideli | Eventos filtrados por negocio |
| Impresión | Configuración actual | Mantener sin cambiar Mideli | Configuración por negocio cuando aplique |

## Usuarios actuales

### Administrador

Actualmente tiene `owner`. Se conserva como dueño de Mideli. No debe recibir automáticamente permisos del administrador de plataforma.

### Andrea

Actualmente figura como `supervisor`, pero la función confirmada es mesera global. La migración deberá separar la función real de los permisos técnicos actuales y permitirle capturar y cobrar para todos los negocios conforme a las reglas aprobadas.

### Cuenta `Mideli`

Actualmente figura activa como `supervisor`, pero el usuario confirmó que ya no se utiliza. La cuenta se debe conservar para no borrar historial, pero quedar inactiva cuando exista autorización para realizar esa acción.

### Mauro

Actualmente figura como `supervisor`, pero la función confirmada es cocinero de Mideli. Debe ver solamente la Cocina de Mideli y no recibir pedidos de Just Dipping.

## Qué no se debe hacer durante la migración

- No crear usuarios nuevos para reemplazar credenciales existentes.
- No copiar órdenes históricas a nuevas órdenes.
- No renumerar folios.
- No borrar la cuenta antigua `Mideli` para “limpiar” el sistema.
- No convertir el dueño de Mideli en administrador de plataforma.
- No asociar Just Dipping a los datos actuales solo porque el catálogo se parezca.
- No cambiar la caja global en producción sin una migración y prueba de transacciones.
- No poner `business_id` obligatorio antes de validar que todo el histórico fue asociado correctamente.
- No usar filtros del frontend como sustituto de RLS.
- No ejecutar una migración de datos y una activación de Just Dipping en el mismo paso.

## Orden de backfill recomendado

1. Crear la organización Rincón 404.
2. Crear Mideli como negocio activo o en modo de compatibilidad.
3. Crear membresías para los usuarios actuales sin cambiar sus credenciales.
4. Asociar catálogo y variaciones a Mideli.
5. Asociar inventario, recetas, compras y conteos a Mideli.
6. Asociar pedidos y líneas a Mideli.
7. Asociar pagos, cajas, gastos y correcciones a Mideli.
8. Asociar WhatsApp, conversaciones, clientes y domicilios a Mideli.
9. Validar conteos, totales y relaciones.
10. Activar consultas con contexto de negocio.

## Validaciones de backfill

Antes de permitir una operación nueva se deben comparar:

- Cantidad de categorías.
- Cantidad de productos y variaciones.
- Cantidad de insumos y recetas.
- Cantidad de pedidos por estado.
- Suma de pedidos por periodo.
- Pagos completados, parciales y anulados.
- Saldos pendientes.
- Cortes y movimientos de caja.
- Pedidos relacionados con WhatsApp.
- Domicilios guardados.
- Folios mínimo y máximo, sin renumeración.

La comparación debe producir un reporte de diferencias. No se debe confiar únicamente en que la migración terminó sin error técnico.

## Funciones y triggers que requieren revisión antes de activar el modelo

- Creación idempotente de pedidos.
- Actualización de pedidos con productos.
- Finalización, anulación y corrección de pagos.
- Asignación automática de caja a pedidos y pagos.
- Consumo y devolución de inventario.
- Reglas de autorización por PIN.
- Consultas de Historial, reportes y analíticas.
- Suscripciones de pedidos y caja.
- Notificaciones de Cocina y WhatsApp.
- Tareas programadas de WhatsApp y pedidos agendados.

Cada función deberá recibir el contexto desde la sesión o derivarlo de una entidad autorizada. No deberá aceptar un negocio arbitrario enviado por el cliente sin validación.

## Criterio para declarar Mideli migrado

Mideli se considera migrado solamente cuando:

1. Sus usuarios actuales pueden entrar sin cambiar credenciales.
2. Mesero, Cocina, Estado, Historial, Cobro, Caja e Inventario producen los mismos resultados esperados.
3. Todos sus datos históricos están asociados a Mideli.
4. Las pruebas de aislamiento no revelan datos de un negocio ficticio o futuro.
5. Se puede crear y cobrar un pedido sin usar la lógica global insegura.
6. Existe una reversión operativa documentada.
