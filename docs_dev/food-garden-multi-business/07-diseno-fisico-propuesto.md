# Diseño físico propuesto

**Estado:** propuesta técnica para revisión. No contiene SQL ejecutado ni autoriza migraciones.

## Objetivo del diseño

Agregar límites de negocio sin reemplazar de golpe las tablas y funciones que actualmente sostienen Mideli.

La estrategia es aditiva:

1. Crear las entidades nuevas.
2. Asociar los datos actuales a Mideli.
3. Mantener compatibilidad durante la transición.
4. Cambiar las consultas y funciones para usar el contexto seguro.
5. Hacer obligatorios los límites solamente después de validar el backfill.

## Entidades nuevas propuestas

### Organización

Representa Rincón 404 Food Park.

Datos mínimos:

- Identificador.
- Nombre.
- Zona horaria.
- Estado.
- Administrador de plataforma.

### Negocio

Representa Mideli, Just Dipping y futuros negocios.

Datos mínimos:

- Identificador.
- Organización propietaria.
- Nombre comercial.
- Nombre del dueño.
- Teléfono y correo opcional.
- Logotipo.
- Estado de ciclo de vida.
- Configuración operativa.
- Fechas de alta, pausa, retiro y restauración.

Restricción importante: el nombre visible no es la seguridad. Todos los permisos se basan en identificadores internos y membresías.

### Membresía y permisos

Una relación entre usuario, organización o negocio y rol. Debe permitir:

- Administrador de plataforma.
- Coordinador.
- Mesera global.
- Dueño de negocio.
- Supervisor local.
- Mesero local.
- Cocina local.
- Caja local.

La membresía tendrá estado activo/inactivo, fechas y auditoría. La cuenta de Auth actual de Mideli se conserva; se agrega la relación de membresía.

No se recomienda crear permisos arbitrarios en el navegador. Las capacidades se resuelven en el servidor a partir del rol y el alcance.

## Cambios conceptuales sobre tablas actuales

### Catálogo

`categories` y `menu_items` recibirán una asociación a negocio. La categoría y el producto actuales se asignarán a Mideli.

Debe existir una restricción para que un producto solo apunte a una categoría del mismo negocio.

La caché del catálogo deberá utilizar una clave equivalente a:

```text
organización + negocio + versión del catálogo
```

### Mesas

`table_zones` y `restaurant_tables` permanecerán compartidas por Rincón 404. No recibirán una copia por negocio.

Las autorizaciones permitirán que el Coordinador modifique el plano, mientras que los negocios únicamente lo consultan y utilizan al crear pedidos.

### Visitas de mesa

Se agregará una entidad para el servicio actual de una mesa. Deberá contener:

- Organización.
- Mesa.
- Número de servicio visible.
- Estado abierto/cerrado.
- Usuario que la inició.
- Fechas de apertura y cierre.
- Motivo de cierre manual, si aplica.

No se deben reconstruir visitas históricas inventando agrupaciones. Los pedidos históricos conservarán su información actual y se asociarán a Mideli; las visitas nuevas comenzarán a utilizarse en la operación futura.

### Cuentas de negocio

Una visita puede tener una cuenta por negocio y cuentas adicionales posteriores. La cuenta contendrá:

- Visita de mesa.
- Negocio.
- Estado de cuenta.
- Subtotal, descuentos, propina asignada y saldo.
- Fechas de apertura, pago y cierre.

Debe existir una regla que impida mezclar en la misma cuenta productos de negocios distintos.

### Pedidos

`orders` recibirá el contexto de negocio y visita de forma compatible:

- Asociación a negocio.
- Asociación a visita.
- Asociación a cuenta de negocio.
- Usuario capturista.
- Canal de origen.

Los pedidos actuales se asignarán a Mideli. Los folios actuales no se renumeran.

Las líneas conservarán el producto, el precio y la descripción histórica utilizados al momento de crear el pedido.

### Pagos

`payment_transactions` recibirá negocio y validará que:

- Todas las órdenes asignadas pertenezcan al mismo negocio.
- La caja pertenezca al mismo negocio.
- La cuenta de negocio corresponda a las órdenes.
- Las anulaciones y devoluciones se autoricen dentro del alcance correcto.

Los registros históricos se asignarán a Mideli.

### Caja y gastos

`cash_shifts`, movimientos y gastos recibirán negocio. La restricción actual de una sola caja abierta se transformará en una caja abierta por negocio.

La apertura, cierre y autorización seguirán las reglas actuales, pero el servidor deberá comprobar el negocio de la operación.

El administrador de plataforma podrá ver el estado técnico de apertura/cierre sin recibir automáticamente los importes detallados.

### Inventario

Categorías de inventario, insumos, recetas, movimientos, compras y conteos recibirán negocio.

Los triggers deberán obtener el negocio de la orden y verificar que:

- El producto pertenece al negocio.
- La receta pertenece al negocio.
- El insumo pertenece al negocio o está marcado explícitamente como compartido.

El consumo y la devolución deben permanecer idempotentes para no descontar dos veces.

### WhatsApp

El canal actual quedará asociado a Mideli de manera explícita, aunque inicialmente exista una sola configuración.

Conversaciones, clientes, domicilios, cotizaciones, notificaciones y pedidos externos de WhatsApp se consideran datos de Mideli.

No se habilitará un canal de Just Dipping hasta diseñar su asignación por negocio.

## Reglas RLS propuestas

Las políticas deben distinguir tres alcances:

### Plataforma

Puede administrar el ciclo de vida de los negocios y acciones de soporte auditadas.

### Organización

Puede operar mesas compartidas y administrar meseras globales según el rol de Coordinador.

### Negocio

Puede leer y escribir únicamente datos del negocio de la membresía activa.

Las políticas deben cubrir también:

- Tablas relacionadas indirectamente por una orden.
- Pagos y asignaciones.
- Inventario y movimientos.
- Storage e imágenes.
- Realtime y notificaciones.
- Funciones RPC.

No será suficiente agregar una condición de negocio a las consultas del frontend.

## Funciones RPC que deben cambiar de contrato

La revisión de implementación deberá cubrir, como mínimo:

- Creación idempotente de pedidos.
- Edición de pedidos y líneas.
- Cambio de estado.
- Finalización, anulación y corrección de pagos.
- Autorizaciones por PIN.
- Apertura, cierre y movimientos de caja.
- Consultas de historial y reportes.
- Creación y edición de inventario.
- Consumo y devolución de recetas.
- Administración de personal.
- Creación de pedidos externos de WhatsApp.

Las funciones no deben confiar en un `business_id` enviado por el cliente. Deben derivar el negocio de la membresía, del producto, de la cuenta o de una relación previamente validada.

## Índices y restricciones que deben contemplarse

- Índices por negocio y estado en pedidos.
- Índices por negocio y fecha en pagos, caja y movimientos.
- Índices por negocio en categorías, productos e inventario.
- Índices en todas las claves foráneas nuevas.
- Unicidad de caja abierta por negocio.
- Unicidad de membresía activa por usuario, negocio y rol aplicable.
- Restricción de producto y categoría dentro del mismo negocio.
- Restricción de cuenta y pedido dentro del mismo negocio.
- Validación de órdenes de una transacción de pago.

## Compatibilidad durante transición

Mientras se prueba Mideli, algunos campos nuevos podrían ser opcionales para que el histórico no se rompa. Esa compatibilidad debe tener fecha de retiro y métricas de uso.

No se debe permitir crear nuevos pedidos sin contexto de negocio después de activar la nueva operación.

## Resultado esperado

Con este diseño:

- Mideli conserva su funcionamiento.
- Just Dipping puede agregarse después sin duplicar la aplicación.
- Las meseras globales pueden trabajar con varios negocios.
- El personal local permanece aislado.
- Una mesa puede tener pedidos mixtos.
- Cada negocio conserva sus cuentas, caja, inventario e historial.
