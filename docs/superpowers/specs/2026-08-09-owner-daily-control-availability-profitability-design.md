# Centro diario del dueño, disponibilidad y rentabilidad

> Actualización 2026-08-09: la disponibilidad manual descrita en este documento fue retirada por decisión del dueño. El diseño vigente está en `2026-08-09-owner-control-cash-cleanup-navigation-design.md`. El control diario, correo y rentabilidad permanecen vigentes.

Fecha: 2026-08-09

## Objetivo

Convertir los datos que Mideli ya registra en un control diario útil para el dueño y evitar que el personal venda productos agotados. La entrega debe reutilizar Analíticas, Menú e Inventario, mantener una sola fuente de verdad y funcionar con la interfaz oscura actual.

## Alcance aprobado

### 1. Centro diario del dueño

La vista `Pulso del negocio` incorporará un resumen de acción para el periodo seleccionado con:

- venta cobrada y métodos de pago;
- diferencia de los cortes cerrados;
- descuentos, cancelaciones y pagos anulados;
- cuentas pendientes;
- tiempo promedio de cocina y pedidos demorados;
- insumos bajos y mermas;
- productos más vendidos y productos sin movimiento;
- rentabilidad estimada de productos con receta;
- acciones recomendadas ordenadas por importancia.

El resumen será consultable por owner y admin. La primera versión del envío automático será por correo y tendrá configuración de destinatario y activación desde Analíticas.

### 2. Envío diario

Un cron diario de Vercel invocará una ruta protegida con `CRON_SECRET`. La ruta usará un cliente Supabase exclusivo del servidor, consultará la configuración activa, generará el resumen del día anterior en horario de Hermosillo y enviará el correo mediante Resend.

El proceso será idempotente: un registro único por fecha impedirá enviar dos veces el mismo reporte. El dueño podrá enviar una prueba manual desde una Server Action autenticada. La interfaz mostrará el último resultado sin exponer secretos.

### 3. Disponibilidad operativa

Cada producto tendrá uno de tres estados:

- `available`: disponible sin límite manual;
- `limited`: cantidad limitada;
- `out_of_stock`: agotado.

Menú permitirá cambiar el estado rápidamente. Cocina tendrá un panel compacto para hacerlo durante el servicio. POS mostrará los productos agotados deshabilitados y la cantidad restante en los limitados.

La creación y edición de pedidos validarán la disponibilidad en la base de datos. Los productos limitados descontarán cantidad de forma transaccional; editar, cancelar o eliminar un pedido devolverá únicamente la cantidad que corresponda. Cada cambio manual quedará en una bitácora con usuario, estado anterior y estado nuevo.

### 4. Rentabilidad

La rentabilidad se calculará sin duplicar costos:

- costo base = suma de cantidades de receta base por costo unitario del insumo;
- margen estimado = precio del producto menos costo base;
- porcentaje de margen = margen estimado dividido entre precio;
- cobertura = producto completo, parcial o sin receta.

Las recetas de variaciones seguirán apareciendo como costo adicional y no se mezclarán con la receta base. El Centro del Dueño mostrará productos con menor margen, mayor margen y recetas incompletas. Los resultados se etiquetarán como estimados porque dependen de recetas y costos actualizados.

## Arquitectura

- `src/lib/actions/owner-report.ts`: agregación del resumen, autenticación de owner/admin, configuración y envío manual.
- `src/lib/owner-report/`: funciones puras para métricas, recomendaciones y plantilla de correo.
- `src/components/analytics/owner-daily-control.tsx`: resumen y configuración del reporte.
- `src/app/api/cron/owner-daily-report/route.ts`: cron autenticado e idempotente.
- `public.set_menu_item_availability`: cambio manual autenticado y auditado, consumido desde el catálogo.
- `src/components/menu/menu-availability-dialog.tsx`: panel reutilizable en Menú y Cocina.
- `menu_items`: columnas de estado y cantidad.
- `menu_item_availability_log`: bitácora operativa con RLS.
- `owner_report_settings` y `owner_daily_report_runs`: configuración e idempotencia del correo, ambas con RLS.

## Seguridad

- No se usará `user_metadata` para permisos.
- Las Server Actions validarán sesión y rol contra `profiles`.
- El cliente `service_role` solo existirá en código marcado `server-only`.
- Las tablas nuevas tendrán RLS y grants explícitos.
- La ruta cron rechazará peticiones si falta o no coincide `CRON_SECRET`.
- No se almacenará contenido de pedidos en la bitácora de disponibilidad ni en los registros de envío.

## Rendimiento

- Las consultas independientes se ejecutarán en paralelo.
- La agregación se hará en servidor y se enviará al cliente solo el resultado resumido.
- El panel de disponibilidad de Cocina se cargará de forma diferida.
- El catálogo conservará su caché y aplicará cambios Realtime puntuales sin recargar todo el POS.

## Errores y contingencias

- Si falta configuración de correo, el cron terminará correctamente indicando `disabled`.
- Si Resend falla, se registrará el intento como fallido y podrá reintentarse manualmente.
- Si una cantidad limitada no alcanza, la base rechazará el pedido completo, sin crear un pedido parcial.
- Los cobros, cortes y folios no se modificarán en esta entrega.

## Pruebas

- Funciones puras de rentabilidad y recomendaciones.
- Creación de pedido con producto disponible, limitado suficiente, limitado insuficiente y agotado.
- Restauración de cantidad al editar, cancelar y eliminar.
- Permisos para cambios de disponibilidad.
- Idempotencia del reporte diario.
- Smoke de Analíticas, POS, Cocina y Menú.
- `npm run lint`, `npm run build`, lista de migraciones y `db push --linked --dry-run`.

## Fuera de alcance

- Cobros sin conexión.
- Sincronización offline de pedidos.
- WhatsApp.
- Clientes, lealtad y pedidos directos.
- Multisucursal, nómina o facturación CFDI.

Estas funciones tendrán especificaciones independientes después de validar esta entrega en el piloto.
