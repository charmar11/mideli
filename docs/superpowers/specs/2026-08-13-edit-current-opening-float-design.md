# Fondo inicial visible y corregible en el turno abierto

## Objetivo

Mostrar el fondo inicial durante el flujo de corte sin revelar el efectivo esperado antes del conteo ciego. Permitir que propietario y administrador corrijan el fondo de un turno abierto cuando se haya capturado incorrectamente.

## Experiencia de uso

### Corte operativo

- En `Cerrar y hacer corte`, antes y durante el conteo ciego, se mostrará `Fondo inicial registrado` con el importe del turno.
- El total de efectivo esperado, las ventas en efectivo y la diferencia seguirán ocultos hasta pulsar `Comparar conteo`.
- Después de comparar, el desglose conservará `Fondo inicial` como primera línea de cálculo.

### Control de caja

- En `/settings/caja`, al seleccionar el turno abierto, aparecerá `Corregir fondo inicial` junto al importe actual.
- La acción solo estará disponible para perfiles activos con rol `owner` o `admin`.
- El formulario solicitará importe nuevo, motivo obligatorio y confirmación explícita.
- Turnos cerrados y archivados no podrán modificar su fondo inicial.

## Persistencia y auditoría

- Una migración nueva creará una tabla de auditoría para cambios del fondo inicial.
- Cada registro conservará turno, importe anterior, importe nuevo, motivo, responsable y fecha.
- Una RPC transaccional con bloqueo de fila validará sesión, perfil activo, rol permitido, turno abierto, importe no negativo y motivo válido.
- La RPC actualizará `cash_shifts.opening_float`, insertará la auditoría y devolverá el turno actualizado.
- La interfaz no realizará escrituras directas sobre `cash_shifts`.
- Las denominaciones capturadas al abrir se conservarán como el conteo original. El importe corregido será la fuente de verdad para el efectivo esperado.

## Integración cliente

- El store de caja expondrá una operación específica para corregir el fondo y actualizará inmediatamente `currentShift`.
- El historial de caja recargará el detalle y la lista después de una corrección exitosa.
- El turno abierto mostrará su historial de correcciones para dejar visible la trazabilidad.
- Los errores de permisos, estado del turno o validación se mostrarán sin modificar el estado local.

## Seguridad

- La tabla tendrá RLS habilitado y solo lectura para usuarios autorizados a consultar el turno.
- La RPC pública será el único punto de escritura, revocará acceso general y otorgará ejecución únicamente a `authenticated`.
- La función privada utilizará `SECURITY DEFINER`, `search_path` vacío, comprobará `auth.uid()` y validará el rol desde el perfil activo.

## Verificación

- Prueba de política para confirmar que el fondo es visible mientras el efectivo esperado permanece oculto en el conteo inicial.
- Pruebas de la función de validación o contrato cliente para importe y motivo.
- Consulta remota que confirme auditoría y actualización dentro de una transacción revertida.
- `npx supabase db push --linked --dry-run` antes de aplicar la migración.
- `npm run lint`, `npm run build` y pruebas funcionales existentes antes de terminar.

## Fuera de alcance

- Editar el fondo de turnos cerrados o archivados.
- Cambiar el conteo original por denominaciones.
- Revelar el efectivo esperado antes de comparar el conteo.
