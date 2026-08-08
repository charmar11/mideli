# Eliminación reversible de cortes de caja

Fecha: 2026-08-08

## Contexto

Mideli conserva cortes de caja cerrados junto con sus movimientos, pagos, pedidos, autorizaciones y ajustes. Se necesita una opción para retirar un corte incorrecto del historial operativo sin perder evidencia contable ni romper relaciones existentes.

Actualmente existe una función de base de datos que elimina físicamente un corte y desvincula registros relacionados. Esa operación no es adecuada para un sistema de caja que debe conservar trazabilidad.

## Objetivo

Permitir que un propietario o administrador archive un corte cerrado desde su detalle, con confirmación reforzada y motivo obligatorio. El corte dejará de aparecer en el historial normal, seguirá disponible en una vista de archivados y podrá restaurarse.

## Fuera de alcance

- No se podrán archivar cortes abiertos.
- No se eliminarán físicamente pedidos, pagos, movimientos, ajustes ni autorizaciones.
- No se permitirá esta acción a meseros, cocina ni otros roles.
- No se recalcularán ni modificarán importes históricos al archivar o restaurar.

## Experiencia de uso

### Historial normal

- Los filtros `Todos`, `Abiertos` y `Cerrados` mostrarán únicamente cortes no archivados.
- Los indicadores y totales del historial excluirán cortes archivados.
- En el detalle de un corte cerrado aparecerá `Eliminar corte` con estilo destructivo rojo.
- En un corte abierto no aparecerá la acción de eliminar.

### Confirmación

Al elegir `Eliminar corte` se abrirá un cuadro bloqueante que no se cerrará al tocar fuera. Mostrará:

- Folio y fecha del corte.
- Responsable e importe esperado, cuando estén disponibles.
- Aviso de que el corte se ocultará, pero su información contable se conservará.
- Campo obligatorio `Motivo` con mínimo 4 caracteres.
- Campo de confirmación que debe contener exactamente `ELIMINAR`.
- Botones `Cancelar` y `Archivar corte`.

La interfaz permanecerá abierta si la operación falla y mostrará un mensaje comprensible.

### Archivados

- El historial tendrá un filtro `Archivados` con su cantidad.
- Los cortes archivados mostrarán la fecha, el motivo y quién realizó la acción.
- El detalle seguirá permitiendo consultar movimientos, pedidos, pagos y ajustes.
- Un botón `Restaurar corte` devolverá el corte al historial normal tras una confirmación simple.

## Modelo de datos

Se agregarán a `public.cash_shifts`:

- `archived_at timestamptz null`
- `archived_by uuid null references public.profiles(id) on delete restrict`
- `archive_reason text null`

Una restricción garantizará que los tres campos estén vacíos o completos. También exigirá que un corte archivado tenga estado cerrado y un motivo válido.

Se agregará un índice sobre `archived_at` para acelerar filtros de historial.

## Operaciones de base de datos

### Archivar

Una función transaccional recibirá el identificador del corte y el motivo. La función:

1. Verificará una sesión autenticada.
2. Verificará que el perfil activo tenga rol `owner` o `admin`.
3. Bloqueará la fila del corte durante la operación.
4. Confirmará que el corte exista, esté cerrado y no esté archivado.
5. Guardará fecha, responsable y motivo de archivo.
6. Devolverá el corte actualizado.

### Restaurar

Una segunda función aplicará las mismas comprobaciones de identidad y rol. Confirmará que el corte esté archivado y limpiará sus tres campos de archivo.

### Protección de la eliminación física

- Se revocará a `authenticated` el permiso de ejecutar la función histórica `delete_cash_shift(uuid)`.
- Las nuevas funciones usarán comprobaciones explícitas de autorización y un `search_path` seguro.
- Las tablas conservarán sus políticas RLS y permisos explícitos.
- No se modificará ninguna llave foránea de pedidos, pagos u otros registros.

## Consultas e interfaz de datos

El listado de cortes incluirá los tres campos de archivo. El cliente decidirá el filtro visible, mientras que los cálculos de resumen considerarán solamente registros no archivados.

El detalle de un corte archivado seguirá disponible mediante el mismo flujo de consulta. El estado de archivo se reflejará en los tipos TypeScript y en el almacén de caja.

Se agregarán al almacén:

- `archiveShift(shiftId, reason)`
- `restoreShift(shiftId)`

Después de cada operación se volverá a consultar el historial para evitar estados locales desactualizados.

## Manejo de errores

La interfaz distinguirá estos casos:

- Sin permiso: informar que solo propietario o administrador puede realizar la acción.
- Corte abierto: solicitar cerrarlo antes de archivarlo.
- Ya archivado o restaurado: actualizar el historial y mostrar el estado actual.
- Corte inexistente: cerrar el detalle y actualizar la lista.
- Error de conexión: conservar los datos escritos en el cuadro y permitir reintentar.

## Criterios de aceptación

1. Un propietario o administrador puede archivar un corte cerrado con motivo y confirmación `ELIMINAR`.
2. Un corte abierto no puede archivarse desde la interfaz ni mediante la función remota.
3. Mesero, cocina y demás roles no pueden archivar ni restaurar cortes.
4. El corte archivado desaparece de los filtros normales y de sus indicadores.
5. El corte aparece en `Archivados` con autor, fecha y motivo.
6. Pedidos, pagos, movimientos, ajustes y autorizaciones permanecen intactos y consultables.
7. El corte puede restaurarse y reaparece en el historial normal.
8. La antigua eliminación física deja de ser ejecutable por usuarios autenticados.
9. El cuadro de confirmación no se cierra al tocar fuera.
10. La interfaz funciona en escritorio, tablet y celular sin acciones cortadas o superpuestas.

## Verificación

- Ejecutar la migración primero con `npx supabase db push --linked --dry-run`.
- Aplicar la migración y comprobar permisos y restricciones con consultas reales por rol.
- Probar archivo y restauración con un corte cerrado de prueba.
- Confirmar que los conteos y filtros no mezclen cortes archivados con activos.
- Confirmar que el detalle conserve todos los registros relacionados.
- Ejecutar `npm run lint` y `npm run build` antes de terminar.

## Recuperación

La operación normal se revierte mediante `Restaurar corte`. Si fuera necesario revertir la migración, primero se restaurarán todos los cortes archivados y después se retirarán funciones, índice, restricción y columnas. No se reactivará la eliminación física para usuarios autenticados.
