# Tarea: fondo inicial visible y corregible

## Objetivo

Mostrar el fondo inicial durante el conteo ciego y permitir que propietario o administrador corrijan únicamente el turno abierto con auditoría completa.

## Fases

- [x] Fase 1: verificar contratos actuales y documentación de Supabase
- [x] Fase 2: crear pruebas de regresión que fallen antes del cambio
- [x] Fase 3: implementar migración, RPC y tipos del cliente
- [x] Fase 4: implementar visibilidad y corrección en Caja
- [x] Fase 5: aplicar migración y verificar el flujo remoto
- [x] Fase 6: ejecutar pruebas, lint y build

## Decisiones

| Decisión | Motivo | Fecha |
|---|---|---|
| Mostrar solo el fondo durante el conteo | Conserva oculto el efectivo esperado | 2026-08-13 |
| Corregir solo el turno abierto | No altera cortes históricos | 2026-08-13 |
| Registrar valor anterior, nuevo, motivo y responsable | Mantiene trazabilidad administrativa | 2026-08-13 |

## Errores encontrados

| Error | Intento | Resolución |
|---|---|---|
| Las dos pruebas nuevas fallan porque las políticas aún no existen | 1 | Fallo esperado que confirma la regresión antes de implementar |
| PowerShell no entregó SQL multilínea al argumento del CLI | 1 | Los archivos SQL temporales funcionaron y se eliminaron después de verificar |
| `--output json` produjo una tabla y falló al convertirla | 1 | Se usó `--output-format json`; confirmó 43 migraciones alineadas |
