# Plan: recuperación segura de pedidos POS

## Objetivo

Si la app se cierra durante el envío de una comanda, al volver debe recuperar el pedido si ya quedó registrado o conservar el mismo intento para reintentar sin duplicar. No guardar datos del cliente en el dispositivo.

## Fases

- [x] Diseño revisado y aprobado por el dueño; commit local `29228fa`.
- [x] Confirmar flujo real de borrador, envío, RLS y recuperación de pedido/lote.
- [x] Implementar clave persistente por usuario, consulta autenticada y bloqueo seguro mientras el resultado sea incierto.
- [x] Añadir pruebas de persistencia, compatibilidad, lote completo, UUID y datos personales.
- [x] Ejecutar lint, build y regresiones operativas en escritorio, tablet y teléfono.
- [x] Confirmar CI de GitHub después del commit/push; no hay migraciones ni cambios remotos de datos.
- [x] Desplegar a producción y comprobar `/api/health`.

La recuperación no se simuló con un pedido real para no escribir datos de venta en producción; se observará durante la operación normal.

## Decisiones

| Decisión | Motivo | Fecha |
|---|---|---|
| Guardar sólo un UUID aleatorio junto al borrador POS | No persistir teléfono ni domicilio localmente | 2026-09-30 |
| Consultar usando cliente autenticado y permisos existentes | La clave aleatoria no debe revelar pedidos a otros usuarios | 2026-09-30 |
| En error de consulta, conservar borrador y clave, sin nuevo envío | Priorizar evitar duplicados cuando el resultado sea incierto | 2026-09-30 |
| No cambiar WhatsApp ni datos remotos de clientes | Mantener el alcance aprobado y proteger operación activa | 2026-09-30 |

## Errores y desvíos

| Problema | Intento | Resolución |
|---|---:|---|
| La skill `writing-plans` no está instalada | 1 | Usar la skill disponible `planning` y mantener este plan de trabajo |
