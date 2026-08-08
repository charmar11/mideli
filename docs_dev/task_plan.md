# Task: Archivar y restaurar cortes de caja

## Goal

Implementar una eliminación reversible de cortes cerrados, restringida a propietario y administrador, preservando todos los datos contables relacionados.

## Phases

- [x] Phase 1: Revisar contexto y diseño aprobado
- [x] Phase 2: Inspeccionar funciones, tipos y UI actuales
- [x] Phase 3: Implementar y aplicar migración segura
- [x] Phase 4: Implementar store, tipos e interfaz
- [x] Phase 5: Verificar permisos, flujo, lint y build

## Decisions

| Decision | Rationale | Date |
|---|---|---|
| Archivar en lugar de borrar físicamente | Conserva trazabilidad y permite restaurar | 2026-08-08 |
| Solo cortes cerrados | Un turno operativo no debe desaparecer | 2026-08-08 |
| Solo owner y admin | Es una acción administrativa sensible | 2026-08-08 |
| Revocar el RPC de borrado físico | Evita una ruta paralela destructiva | 2026-08-08 |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| El navegador rechazó URLs `.md` oficiales | 1 | Usar búsqueda restringida al dominio oficial y páginas HTML indexadas |
| `rg.exe` falló con acceso denegado al ejecutarse en paralelo | 1 | Cambiar a `Select-String` y lecturas dirigidas en PowerShell |
| La función histórica `delete_cash_shift(uuid)` no existe en remoto aunque su migración figura aplicada | 1 | Revocar y comentar solo cuando `to_regprocedure` confirme que existe |

## Result

- Archivo y restauración reversibles disponibles para owner y admin.
- Pedidos, pagos y auditoría permanecen vinculados.
- El historial normal excluye archivados y ofrece un filtro dedicado.
- Migración remota, prueba transaccional, ESLint y build completados.
