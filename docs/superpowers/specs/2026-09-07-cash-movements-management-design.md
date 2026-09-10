# Gastos y movimientos de caja

## Objetivo

Dar a owner y admin una vista clara de todo el dinero que entra o sale de caja, con filtros por periodo, tipo, estado y búsqueda. Una captura equivocada debe poder corregirse sin perder la evidencia original.

## Ubicación y experiencia

La función vive en `Control → Caja`, como la pestaña `Gastos y movimientos` junto a `Turnos y cortes`. Muestra tarjetas de resumen para gastos, retiros, fondos agregados y cantidad de movimientos. Cada registro muestra turno, motivo, importe, persona, autorizador, fecha y estado.

## Correcciones

Los movimientos originales son inmutables. `Corregir importe` registra el importe correcto y `Anular movimiento` usa importe efectivo cero. Ambas acciones piden motivo y autorización con PIN. La tabla `cash_movement_corrections` conserva el original, el nuevo importe, responsables y fecha. Los totales del turno calculan el importe efectivo corregido, incluso para un corte cerrado.

## Permisos y datos

La lectura, corrección y anulación están limitadas a owner y admin mediante RPCs con `SECURITY DEFINER`. El cliente no escribe directamente en tablas financieras. La migración agrega `list_cash_movements` y `correct_cash_movement`, además de recalcular los totales de caja con correcciones auditadas.

## Verificación

- `npx supabase db push --linked --dry-run` queda sin migraciones pendientes después de aplicar la migración.
- `npm run lint` y `npm run build` deben pasar.
- La suite E2E completa debe conservarse en verde.
