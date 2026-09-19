# Plan de migraciones y archivos afectados

**Estado:** mapa de implementación para revisión. No contiene cambios ejecutados.

## Regla de trabajo

Cada etapa debe ser revisable y desplegable por separado. No se debe crear una migración gigante que modifique identidad, pedidos, caja, inventario y permisos al mismo tiempo.

Las migraciones nuevas deben ser aditivas, tener nombre propio, pasar por revisión y ejecutarse primero en una base de prueba o rama. Nunca se debe borrar una migración ya aplicada para corregirla.

## Etapa 1: fundación de organización y negocios

### Base de datos

Crear conceptualmente:

- Organización Rincón 404 Food Park.
- Negocios con ciclo de vida.
- Membresías por organización o negocio.
- Capacidades y alcance de roles.
- Auditoría de altas, desactivaciones y acciones de plataforma.

### Reglas

- Crear la organización y Mideli.
- No crear Just Dipping aún.
- Conservar las cuentas de Auth existentes.
- Asociar la cuenta `Administrador` únicamente con Mideli.
- Preparar membresía de Andrea como mesera global.
- Preparar membresía de Mauro como Cocina de Mideli.
- Mantener la cuenta `Mideli` sin borrar; su desactivación requiere autorización operativa.

### Archivos de aplicación a revisar

- `src/types/database.ts`
- `src/proxy.ts`
- `src/lib/actions/users.ts`
- `src/components/dashboard/dashboard-shell.tsx`
- Componentes de navegación y sesión.

## Etapa 2: aislamiento del catálogo

### Base de datos

Agregar contexto de negocio a:

- `categories`.
- `menu_items`.
- Imágenes y archivos gestionados.

Backfill: todo el catálogo existente pertenece a Mideli.

### Reglas

- Una categoría no puede pertenecer a otro negocio distinto de sus productos.
- Un producto no puede ser seleccionado por un usuario que no tenga acceso a su negocio.
- El catálogo de WhatsApp continúa limitado a Mideli.

### Archivos de aplicación

- `src/lib/stores/catalog-store.ts`
- Componentes de catálogo y administración de menú.
- `src/lib/whatsapp/catalog.server.ts`
- `src/lib/whatsapp/catalog.ts`
- `src/lib/whatsapp/gemini-catalog-context.ts`

La caché debe incluir el negocio y la suscripción Realtime debe refrescar únicamente el catálogo correspondiente.

## Etapa 3: contexto de mesas, visitas y pedidos

### Base de datos

Agregar conceptualmente:

- Visita de mesa compartida.
- Cuenta de negocio dentro de la visita.
- Negocio en pedidos.
- Relación entre pedido, visita y cuenta.

Las mesas y zonas actuales permanecen compartidas.

### Funciones a revisar

- `create_order_with_items`.
- `update_order_with_items`.
- Funciones de cambio de estado.
- Triggers de asignación de ubicación y folio.
- Triggers de inventario al insertar o editar líneas.

### Reglas

- Un pedido pertenece a un solo negocio.
- Un carrito mixto se divide dentro de una transacción.
- El servidor determina el negocio desde el producto y la membresía.
- Un trabajador local no puede mandar líneas a otro negocio.
- La mesera global sí puede generar el conjunto de pedidos.
- Una visita nueva nunca debe reutilizar silenciosamente la anterior.

### Archivos de aplicación

- `src/lib/stores/order-store.ts`
- `src/lib/stores/tables-store.ts`
- `src/lib/stores/cart-store.ts`
- `src/components/dashboard/mesero-view.tsx`
- `src/components/pos/order-details-modal.tsx`
- `src/components/dashboard/status-view.tsx`
- `src/components/dashboard/sales-history.tsx`
- `src/components/dashboard/cocina-view.tsx`
- `src/lib/order-location.ts`
- `src/lib/order-visuals.ts`

## Etapa 4: inventario por negocio

### Base de datos

Agregar contexto de negocio a:

- Insumos.
- Recetas.
- Movimientos.
- Compras.
- Conteos.
- Ajustes.

Backfill: todo el inventario actual pertenece a Mideli.

### Reglas

- Producto, receta e insumo deben pertenecer al mismo negocio.
- Los insumos compartidos requieren una relación explícita, no una coincidencia por nombre.
- Cancelar o editar una línea debe devolver y volver a consumir correctamente.
- Los retries no pueden duplicar movimientos.

### Archivos y funciones

- `src/lib/stores/inventory-store.ts`
- Pantallas de inventario.
- `private.consume_inventory_for_order_item`.
- `private.return_inventory_for_cancelled_order`.
- `replace_inventory_recipe`.
- Funciones de compras y conteos.

## Etapa 5: caja, gastos y pagos

### Base de datos

Agregar contexto de negocio a:

- `cash_shifts`.
- `cash_movements`.
- Gastos y ajustes.
- `payment_transactions`.
- `payment_tenders`.
- Asignaciones de órdenes y líneas.

Backfill: cajas, movimientos y pagos actuales pertenecen a Mideli.

### Reglas

- Una caja abierta por negocio.
- Un pago solo puede incluir órdenes del mismo negocio.
- La caja asignada debe corresponder al negocio del pago.
- La mesera puede cobrar para cualquier negocio, pero el pago pertenece al negocio cobrado.
- Descuentos, devoluciones, correcciones y anulaciones se autorizan dentro del negocio.
- La cuenta de otro negocio debe ser rechazada por el RPC, aunque se manipule la interfaz.

### Archivos y funciones

- `src/lib/stores/cash-shift-store.ts`
- `src/components/payments/payment-flow.tsx`
- `src/components/dashboard/status-view.tsx`
- `src/components/dashboard/sales-history.tsx`
- `src/lib/actions/sales.ts`
- Funciones de `finalize_payment` y `void_payment`.
- Triggers `assign_order_cash_context` y `assign_payment_cash_context`.
- Funciones de apertura, cierre, autorización y movimientos de caja.

## Etapa 6: permisos RLS y servidor

### Migración de seguridad

La seguridad debe revisarse después de existir el contexto de negocio, pero antes de activar consultas multinegocio.

### Principios

- Los dueños consultan y modifican únicamente su negocio.
- Las meseras globales pueden operar lo que su rol permita, sin obtener administración de catálogos.
- El personal local solo ve su negocio.
- El Coordinador administra meseras globales y mesas compartidas.
- El administrador de plataforma administra el ciclo de vida, no las finanzas diarias por defecto.
- Las funciones `SECURITY DEFINER` deben validar usuario, membresía, alcance y estado activo.

### Archivos y políticas

- `supabase/migrations/00002_rls_policies.sql` como referencia histórica, no se modifica directamente.
- Nuevas políticas en migraciones posteriores.
- `src/proxy.ts` para protección de rutas y contexto inicial.
- Acciones de servidor que actualmente consultan solo `profiles.role`.
- RLS de pagos, caja, inventario, catálogo, pedidos y WhatsApp.

El proxy puede orientar la navegación, pero nunca será la única barrera de seguridad.

## Etapa 7: Estado, Cocina, Push y Realtime

### Mideli

- Cocina recibe únicamente Mideli.
- Mauro recibe sus alertas de Cocina.

### Just Dipping

- Estado muestra Pendiente, Preparando y Listo.
- No se habilita Cocina en esta primera etapa.
- Sus notificaciones futuras se limitan a sus pedidos.

### Archivos a revisar

- `src/components/dashboard/cocina-view.tsx`
- `src/components/dashboard/status-view.tsx`
- `src/components/dashboard/push-notification-control.tsx`
- `src/components/dashboard/ready-order-notifier.tsx`
- `src/lib/push-notifications.ts`
- Migraciones y funciones de Push/Realtime.

## Etapa 8: WhatsApp de Mideli

No se modifica su experiencia durante la primera migración. Se revisará que las configuraciones, conversaciones, domicilios, notificaciones y pedidos externos queden explícitamente asociados a Mideli.

### Archivos a verificar

- `src/lib/whatsapp/meta-runtime.server.ts`
- `src/lib/whatsapp/repository.server.ts`
- `src/lib/whatsapp/catalog.server.ts`
- `src/lib/whatsapp/operations.server.ts`
- `src/lib/actions/whatsapp.ts`
- `src/lib/actions/whatsapp-order-status.ts`
- Cron de retención y pedidos programados.

## Etapa 9: analíticas, reportes y dispositivos

Revisar consultas de:

- `src/lib/actions/analytics.ts`.
- `src/lib/actions/owner-report.ts`.
- `src/lib/owner-report/data.ts`.
- Historial de ventas.
- Configuración de impresoras e imágenes.

Los reportes de Mideli deben coincidir antes y después de la migración. Los reportes globales de plataforma deben ser agregados técnicos, no sustitutos de los reportes de los dueños.

## Orden de despliegue futuro

1. Crear rama o base de prueba.
2. Aplicar fundación de organización, negocios y membresías.
3. Ejecutar backfill de Mideli en prueba.
4. Validar conteos y totales.
5. Activar catálogo con contexto.
6. Activar usuarios y RLS.
7. Activar pedidos y visitas.
8. Activar inventario y caja.
9. Activar pagos.
10. Probar regresión completa de Mideli.
11. Activar piloto controlado.
12. Solo después preparar Just Dipping.

## Punto de no retorno

No se debe hacer obligatorio el contexto de negocio ni retirar la compatibilidad anterior hasta que:

- El backfill coincida.
- Las pruebas de aislamiento pasen.
- Los pagos y cajas coincidan.
- El inventario coincida.
- La reversión esté probada.
- El dueño del programa apruebe el cambio.
