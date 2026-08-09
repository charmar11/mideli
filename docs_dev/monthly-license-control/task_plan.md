# Tarea: licencia mensual privada y correo desactivado

## Objetivo

Implementar la especificación aprobada en `docs/superpowers/specs/2026-08-09-monthly-license-and-email-disable-design.md`: control mensual exclusivo del vendedor, contraseña autogestionada, bloqueo operativo en aplicación y base de datos, auditoría y desactivación reversible del reporte por correo.

## Fases

- [x] Fase 1: investigar patrones actuales, documentación y superficie de escrituras
- [x] Fase 2: diseñar y crear migración con credenciales, auditoría y bloqueo de escrituras
- [x] Fase 3: implementar autenticación privada y acciones mensuales del vendedor
- [x] Fase 4: actualizar panel, bloqueo inmediato y reactivación en dispositivos
- [x] Fase 5: ocultar y bloquear por completo el reporte por correo
- [x] Fase 6: verificar lint, build, migración, seguridad y flujos locales
- [x] Fase 7: aplicar Supabase, configurar Vercel, desplegar y verificar producción

## Decisiones

| Decisión | Motivo | Fecha |
|---|---|---|
| Reutilizar `app_license` como fuente de verdad | Conserva compatibilidad con el bloqueo existente | 2026-08-09 |
| Guardar solo hash `scrypt` y salt de la contraseña | La clave creada por el vendedor nunca debe persistir en texto | 2026-08-09 |
| Variable de correo ausente o distinta de `true` significa apagado | Evita envíos accidentales antes de verificar un dominio | 2026-08-09 |
| Mantener `.superpowers/` fuera del trabajo | Es un cambio ajeno no rastreado | 2026-08-09 |

## Errores encontrados

| Error | Intento | Resolución |
|---|---|---|
| Parche de hallazgos no encontró una línea con acentos | 1 | Se inspeccionó el archivo y se aplicó un contexto más pequeño; no se repitió el comando fallido |
| La línea de comandos SQL excedió el límite de Windows | 1 | La migración y las pruebas se enviaron por entrada estándar a Supabase CLI |
| La prueba detectó columnas mal nombradas en la credencial inicial | 1 | Se corrigió el `INSERT` y la prueba transaccional completa terminó con `ROLLBACK` exitoso |
| PowerShell interpretó `-and` como parámetro de `Test-Path` | 1 | Se agruparon las expresiones booleanas con paréntesis y la verificación de presencia terminó sin mostrar valores |
| El PowerShell instalado no expuso `RandomNumberGenerator.Fill` | 1 | La clave provisional se reemplazó antes del despliegue usando `RandomNumberGenerator.Create().GetBytes` |
| Una segunda instancia de Next detectó el servidor de desarrollo activo | 1 | Se reinició el proceso existente y se verificó la hoja de estilos compilada en el mismo puerto |
