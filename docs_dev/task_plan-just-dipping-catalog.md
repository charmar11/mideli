# Task: Importar catálogo Just Dipping y completar combos extensibles

## Goal

Integrar en el editor actual el modo de venta por producto, permitir componentes combo-only y regalos, importar de forma idempotente el catálogo Firebase a Just Dipping y desplegarlo a producción sin alterar Mideli ni caja.

## Phases

- [x] Phase 1: Revisar contexto del proyecto, estado de trabajo y fuentes Firebase/Supabase.
- [x] Phase 2: Acordar experiencia integrada del editor y reglas del regalo.
- [x] Phase 3: Implementar esquema, validación de ventas y snapshots de componentes.
- [x] Phase 4: Integrar controles accesibles en el editor de menú y flujo POS/cocina.
- [x] Phase 5: Importar categorías, productos y combos de forma idempotente solo a Just Dipping.
- [x] Phase 6: Ejecutar lint/build, comprobaciones de datos y esquema, detector visual y revisión móvil local. El pgTAP y el flujo POS autenticado quedan limitados por falta de Docker y sesión de prueba.
- [x] Phase 7: Desplegar producción y confirmar estado.

## Decisions

| Decision | Rationale | Date |
|---|---|---|
| Producto configurable: individual y combo, solo individual o solo combo | Permite crear futuros productos desde el admin sin hardcodear nombres | 2026-09-26 |
| El modo de venta no reemplaza el estado activo/inactivo | Un producto combo-only puede seguir disponible dentro del combo | 2026-09-26 |
| Regalo/precio extra es una propiedad del componente en cada combo | Un producto puede ser regalo en una promoción y tener otro precio en otra | 2026-09-26 |
| Cheesecake de Tortuga queda solo en combos y regalo fijo de Promo Lunes a $0 | Confirmación del usuario y fuente Firebase | 2026-09-26 |
| Repetir importación no borra ni sobreescribe coincidencias ambiguas | Preserva datos actuales de Just Dipping y evita afectar otros negocios | 2026-09-26 |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| PostgreSQL rechazó la sintaxis `substring(... FROM ...)` dentro de la función con `search_path` vacío. | El primer push se detuvo al crear el trigger de snapshot. | Se cambió a `pg_catalog.substr(texto, posición)`; se confirmó que Supabase revirtió la migración completa antes de volver a intentar. |
| El trigger de combos existente exige definición válida cuando un producto se marca como combo. | El primer intento de importación se revirtió sin dejar productos/categorías parciales. | Se insertan inicialmente como productos normales y cada combo se actualiza con `is_combo=true` y la definición completa en una sola operación. |
| `supabase test db --linked` requiere Docker o Podman, que no está instalado. | No se pudo ejecutar el pgTAP contra producción. | Se verificaron de forma remota y sólo lectura las reglas registradas, referencias de componentes, cantidad de datos y permisos de ejecución; pgTAP sigue pendiente. |

## Resultado

- Deploy real de producción Vercel `dpl_BY2ENwrXkfktnPEEJ74scUJBLz7Y`, estado `Ready`, alias `https://mideli.vercel.app`.
- `https://mideli.vercel.app/api/health` respondió HTTP 200; Playwright abrió `/login` en producción sin errores ni advertencias de consola.
- Pendiente de aceptación operativa: probar iniciar un pedido de cada combo desde una sesión de mesero y confirmar la impresión/cocina con personal del local. No se dispuso de una sesión autenticada para automatizarlo.
