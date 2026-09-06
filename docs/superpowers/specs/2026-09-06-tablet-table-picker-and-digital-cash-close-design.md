# Selector de mesas en tablet y corte digital

Fecha: 2026-09-06

## Objetivo

Corregir el flujo de selección de mesas en tablet y convertir el cierre de caja en un corte digital consultable, claro y auditable dentro de Mideli. El resultado debe permitir operar sin depender de una impresora y revisar posteriormente cada turno desde Caja.

## Alcance aprobado

### Selector de mesas

- Una pulsación selecciona una mesa y la distingue en verde.
- El botón de confirmación permanece visible en móvil y tablet.
- El botón identifica la selección, por ejemplo `Confirmar Mesa #4`.
- El plano conserva desplazamiento propio sin ocultar acciones.
- Los controles táctiles miden al menos 48 px.
- Escritorio conserva el plano amplio y el panel lateral.

La causa confirmada está en el intervalo de 640 a 1023 px. El selector usa la composición de escritorio, pero el panel lateral se apila debajo del plano dentro de un contenedor con `overflow-hidden`. La selección sí cambia de estado; la acción para continuar queda fuera del área alcanzable.

### Corte digital

Al cerrar un turno, Mideli debe cargar el detalle persistido del corte y mostrarlo en el mismo flujo. No se calcularán totales paralelos en el navegador.

El corte muestra:

- número de corte;
- apertura, cierre y duración;
- responsables de apertura y cierre;
- pedidos y cobros registrados;
- venta neta y total cobrado;
- efectivo, tarjeta y transferencia;
- fondo inicial, entradas, retiros, gastos y correcciones;
- efectivo esperado, efectivo contado y diferencia;
- cuentas pendientes transferidas;
- notas y autorización de diferencia, cuando apliquen.

Después de revisar el resultado, el trabajador puede cerrar la ventana o abrir el historial. Imprimir y compartir son acciones secundarias.

### Historial de cortes

`Caja > Historial` continúa siendo la única fuente de consulta de turnos. La interfaz se reorganiza en:

1. indicadores acumulados;
2. filtros por estado, responsable, diferencia y periodo;
3. lista compacta de cortes;
4. detalle del corte seleccionado;
5. auditoría, correcciones y archivo.

Cada fila muestra folio, fecha, horario, responsable, pedidos, venta neta, cobrado, diferencia y estado. El detalle se divide en resumen, métodos de pago, operación de caja, pedidos o tickets, cuentas pendientes y auditoría.

Los importes de envío cobrados directamente por repartidores externos no deben presentarse como ingreso de Mideli. El corte usa el libro de pagos existente y conserva esa separación.

## Arquitectura y datos

- `cash_shifts` y el libro mayor de pagos siguen siendo las fuentes de verdad.
- `close_cash_shift` persiste el resultado del cierre.
- `get_cash_shift_detail` entrega el reporte guardado y sus relaciones.
- El cliente conserva temporalmente el identificador devuelto por el cierre, obtiene el detalle y presenta el corte final.
- Si el detalle de tickets no identifica correctamente el tipo de servicio y pedidos asociados, una nueva migración ampliará la respuesta del RPC sin duplicar datos almacenados.
- Los cortes cerrados permanecen inmutables. Las correcciones se agregan como registros auditables.

## Estados y errores

- Si el cierre se guarda pero falla la carga del detalle, se informa que el turno sí quedó cerrado y se ofrece reintentar o abrir el historial.
- La interfaz no permite ejecutar dos cierres mientras una operación está en curso.
- Un corte sin cobros muestra un estado vacío explícito.
- Una diferencia dentro de la tolerancia se muestra en verde; una diferencia relevante se muestra en rojo.
- Los cortes con cuentas pendientes las muestran en advertencia sin sumarlas como cobro recibido.

## Acceso

- Owner y admin consultan todo el historial y conservan correcciones, archivo y restauración.
- El trabajador que cierra un turno puede ver inmediatamente su corte final.
- Los permisos históricos existentes en servidor no se amplían silenciosamente.

## Verificación

- Reproducción del selector en 768 x 1024 y 820 x 1180 con interacción táctil.
- Selección, cambio de mesa, cancelación y confirmación.
- Cierre con efectivo, tarjeta, transferencia y cuenta pendiente.
- Comparación entre la vista final y `Caja > Historial` para el mismo corte.
- Verificación de estados sin cobros, con diferencia y con corte archivado.
- `npm run lint` y `npm run build` obligatorios.
- Si existe migración, `npx supabase migration list` y `npx supabase db push --linked --dry-run` antes de aplicarla.

## Fuera de alcance

- Sustituir el libro mayor de pagos.
- Eliminar o reescribir cortes históricos.
- Depender nuevamente de la impresora para cerrar turno.
- Crear un segundo módulo de reportes con totales independientes.
