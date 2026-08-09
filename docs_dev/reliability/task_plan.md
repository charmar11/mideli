# Task: Base de confiabilidad, diagnóstico y pruebas de humo

## Goal

Implementar la especificación aprobada en `docs/superpowers/specs/2026-08-08-reliability-diagnostics-smoke-tests-design.md` sin modificar datos operativos y validarla primero en localhost.

## Phases

- [x] Phase 1: Explorar arquitectura y aprobar el diseño
- [x] Phase 2: Implementar endpoint y centro privado de diagnóstico
- [x] Phase 3: Implementar recuperación global de errores
- [x] Phase 4: Configurar Playwright y pruebas de humo responsivas
- [x] Phase 5: Verificar permisos, seguridad, lint, build y pruebas

## Decisions

| Decision | Rationale | Date |
|---|---|---|
| Empezar sin proveedor externo | Funciona en localhost y no requiere nuevas cuentas o secretos | 2026-08-08 |
| No persistir diagnósticos | Evita una tabla y datos sensibles antes de definir monitoreo remoto | 2026-08-08 |
| Endpoint público mínimo | Permite comprobar actividad sin exponer Supabase ni datos internos | 2026-08-08 |
| Diagnóstico detallado solo para owner/admin | Conserva la separación de permisos actual | 2026-08-08 |
| Pruebas iniciales sin autenticación real | Evita escrituras y credenciales de producción | 2026-08-08 |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| `rg` devolvió acceso denegado en el entorno local | 1 | Usar búsquedas dirigidas con PowerShell |
| Una búsqueda recursiva incluyó `node_modules` y excedió el tiempo | 1 | Limitar las rutas a `src`, `supabase`, `scripts` y `docs` |
| El parche para anexar el plan al archivo histórico no coincidió por la codificación mostrada en terminal | 1 | Crear un subdirectorio dedicado con el patrón de tres archivos |
| El parche combinado del diagnóstico no coincidió con textos Unicode mostrados por PowerShell | 1 | Separar archivos nuevos de la edición puntual de navegación y usar el texto UTF-8 real |
| TypeScript no infirió el tipo de las filas de `print_jobs` en dos filtros | 1 | Declarar el contrato mínimo `{ status: string }` antes de contar estados |
| `npm install` reportó 6 vulnerabilidades transitivas | 1 | Registrar el riesgo y no ejecutar una actualización automática fuera del alcance |
