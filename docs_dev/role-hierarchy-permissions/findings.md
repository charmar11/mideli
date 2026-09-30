# Hallazgos: jerarquía y permisos por negocio

## Fuentes consultadas

- `docs/superpowers/specs/2026-09-27-role-hierarchy-and-custom-permissions-design.md`
- `docs/superpowers/specs/2026-09-25-global-waiter-business-cash-roles-design.md`
- `src/lib/actions/users.ts`
- `src/app/settings/page.tsx`
- `src/components/admin/businesses-manager.tsx`
- Migraciones y pruebas multinegocio en `supabase/migrations/` y `supabase/tests/`.

## Estado real observado en el código

- `src/lib/actions/users.ts` resuelve el alcance de personal a `business`, `organization`, `legacy` o `unavailable` a partir del contexto seleccionado y capacidades como `business.manage_staff` y `organization.manage_global_waiters`.
- Los rangos actuales se traducen a códigos fijos: `local_waiter`, `local_kitchen`, `local_supervisor` y `global_waiter`. `update_business_staff_membership_role` mantiene ese catálogo fijo en Supabase.
- La creación de personal moderno crea una identidad Auth nueva y después una membresía. No existe en este flujo una acción para vincular una cuenta existente como empleada local; hará falta diseñarla para que una mesera global y una empleada local compartan identidad.
- El listado local excluye `business_owner`; el listado de organización muestra membresías `global_waiter`. Se añadió a la pantalla de plataforma una consulta por negocio: Coordinación puede ver rango, permisos legibles y estado, sin editar asignaciones locales.
- `/settings` ya muestra asignaciones globales de caja y llama a `set_global_waiter_cash_permissions`; el RPC exige la capacidad de Coordinador y modifica `business.open_cash` / `business.close_cash` por negocio.
- `businesses-manager.tsx` crea negocios con una cuenta de dueño nueva y muestra al dueño actual. La implementación local añade una transferencia transaccional del dueño actual a una cuenta activa existente, con motivo, confirmación y auditoría.
- `membership_capabilities` ya registra alcance por organización o negocio, autor, motivo y revocación; puede ser una base para grants y auditoría, pero no demuestra por sí sola que un modelo de rangos dinámicos ya exista.
- El índice único actual permite varias membresías locales activas del mismo usuario en el mismo negocio si sus `role_code` son distintos. A la vez, `findManagedMembership` selecciona una sola con `limit(1)`, por lo que la futura UI no debe actualizar un rango ambiguo; la elección entre roles múltiples o un rango compuesto debe cerrarse con pruebas de compatibilidad.
- `businesses-manager.tsx` permite crear un negocio, editar la identidad y capacidades del dueño, consultar equipos locales en modo lectura y solicitar transferencia del dueño sin cambiar contraseñas.
- El constructor actual de negocios presenta permisos de dueño como módulos. No es el constructor de roles del personal y no debe confundirse con él al rediseñar la jerarquía.
- El flujo actual de altas modernas crea una nueva identidad de Auth, aunque las RPC de membresía aceptan un `user_id` existente. Para permitir Global + personal local sin cuenta duplicada, se necesita una ruta segura para buscar/vincular una cuenta existente y asignar su membresía local.
- Ya hay pgTAP para límites de personal, membresías y permisos globales de caja. Se deben extender; no basta con pruebas de interfaz.

## Implicaciones para el plan

1. El acceso global por negocio debe representarse y validarse en servidor/base de datos. La membresía organizacional actual no basta para cumplir la selección individual del Coordinador.
2. La asignación de una cuenta global a un equipo local requiere una operación de vinculación segura que no duplique Auth/profile, contraseña ni PIN.
3. El cambio aprobado mueve la delegación de permisos locales de caja desde el Coordinador hacia el dueño local. Debe migrar los grants existentes preservando alcance, autoría y auditabilidad, con paridad verificada antes de retirar cualquier ruta vieja.
4. La delegación debe comprobar dos límites distintos: permisos habilitados para el negocio y permisos que el actor puede administrar. `business.manage_staff` no debe transformarse en permiso general para delegar cualquier capacidad.
5. La transferencia de dueño se limita a la autoridad de ese negocio, conserva cuenta, contraseña, otras membresías e historial, copia los módulos efectivos del dueño y deja motivo/auditoría. La semántica final requiere prueba pgTAP y validación con cuentas de prueba.
6. Los componentes de Rincón 404 y Personal local deben ser superficies administrativas distintas del POS y permanecer con alcance explícito de organización o negocio.
7. La especificación propone un rango local compuesto para mantener sencilla la experiencia, pero el índice permite roles locales múltiples hoy. El plan debe medir compatibilidad y conservar la unión de permisos actual durante backfill; si ya existen asignaciones múltiples, no se pueden descartar ni seleccionar mediante un `limit(1)` arbitrario.

## Hallazgos complementarios de backend

- `memberships` permite varias membresías locales activas por persona y negocio si `role_code` cambia; sin embargo, `findManagedMembership` usa `limit(1)`. La futura UI/RPC no debe modificar un rango arbitrario, y el backfill debe preservar la unión actual de permisos si hay varias asignaciones.
- `private.multibusiness_can_manage_membership()` da aprobación amplia a titulares de `platform.manage_businesses` antes de aplicar las reglas específicas. Varios RPC de personal usan esta función. La regla de equipos locales solo de consulta para Rincón 404 debe imponerse en gateways backend, no solo quitando botones.
- `get_my_multibusiness_context()` incluye todos los negocios no archivados de una organización cuando hay una membresía organizacional activa. El allowlist individual de meseras globales debe limitar contexto y operaciones en backend; ocultar menús solo en el cliente no es suficiente.
- Las comprobaciones actuales distinguen capacidades de negocio por `business_id`, pero los permisos organizacionales de pedidos/cobros de `global_waiter` se aplican a toda la organización. El plan debe restringirlos a negocios elegidos sin romper la operación de personal local.
- El RPC actual de caja es `SECURITY DEFINER`, restringe ejecución a usuarios autenticados, revoca `anon`, valida Coordinador, mesera global, negocio activo y evita autoasignación; además registra capabilities y audit events. El cambio aprobado requiere un gateway equivalente de dueño local, con alcance y autoridad verificadas.
- El store del selector POS llama `get_my_multibusiness_context()`, mezcla marca/licencia y elige negocio; `getSelectedBusinessContext()` expande hoy una capability organizacional de pedidos/cobros a todos los negocios activos de la organización. Ambos caminos y los guards de `src/proxy.ts` deben consumir el allowlist nuevo de forma consistente.
- El proyecto usa migraciones imperativas (`supabase/config.toml` tiene `schema_paths = []`) y Postgres 17 local. La secuencia debe crear una migración nueva y revisar `npx supabase db push --linked --dry-run` antes de cualquier aplicación remota.
- Los scripts disponibles son `npm run lint`, `npm run build` y `npm run test:e2e`; no hay script de pruebas de base de datos en `package.json`. Ya existen pruebas pgTAP para staff y caja, que se deben ejecutar con el flujo local/remoto permitido y sin resetear la base de datos vinculada.
- `organization.operate_orders` y `organization.charge_orders` están definidos expresamente como permisos para todos los negocios de la organización. `create_business_order_with_items` acepta el primero mediante capability organizacional o de negocio; por eso limitar el RPC de contexto no basta: hay que inventariar cada consumidor de capacidades globales de pedidos/cobros y decidir una migración a autorización por negocio.
- `src/proxy.ts` agrega capabilities organizacionales de todos los contextos al negocio seleccionado, y `business-context-selection.ts` trata los permisos de pedidos globales como autorización para seleccionar menús. La allowlist debe llegar de una única autoridad de backend y reflejarse coherentemente en runtime, selector, POS, cobro y RPCs.
- El inventario de autorizaciones también incluye RPCs de estado de pedido, caja y finanzas/cobros, correcciones de pago, impresión/Push, guards de licencia, navegación del dashboard, `src/proxy.ts`, `selected-business.ts` y selector de menú. Las definiciones vigentes deben corregirse en migraciones nuevas; no se deben editar migraciones históricas.
- `updateUserRoleAction` actualiza `profiles.role` global después de cambiar una membresía local. Para soportar varios negocios, roles y nombres personalizados, ese campo global no puede seguir siendo fuente de verdad de autorización ni de la etiqueta local.
- El cambio de contraseña usa `auth.admin.updateUserById` aunque la operación venga de una lista de personal acotada. Al vincular una identidad entre negocios, se requiere una regla separada para que un dueño local no cambie sin querer el acceso global o el ingreso a otros negocios.

## Límites de verificación

- La etapa inicial fue de lectura local; la implementación posterior se describe en `progress.md`. No se aplicaron migraciones ni se modificaron datos remotos. No se inspeccionaron valores de `.env.local`.
- No se revisaron todavía todos los puntos de autorización de la aplicación ni el cuerpo completo de todas las políticas/RPC. La Fase 1 del plan debe hacerlo antes de cerrar el catálogo final.

## Comprobación acotada de uso del rol heredado

La búsqueda específica de `profile.role` y `role_code` confirmó que el rol del perfil sigue siendo leído además de Personal y proxy, por ejemplo en `src/lib/actions/whatsapp.ts`, `src/lib/actions/whatsapp-order-status.ts`, `src/lib/actions/delivery.ts`, `src/lib/actions/owner-report.ts` y `src/lib/license-control-server.ts`. Esto refuerza dos límites del plan:

- No se debe quitar ni reinterpretar `profiles.role` como parte de un cambio aislado de UI. Cada consumidor requiere clasificación: legado temporal, regla por negocio o canal exclusivo.
- El rol global no puede ser la fuente de verdad del rango local; sin embargo, las rutas antiguas que todavía lo usan necesitan una migración compatible y pruebas, sobre todo WhatsApp y delivery.

Esta búsqueda fue estática y local. No prueba comportamiento en Supabase remoto ni sustituye la auditoría completa de RLS/RPC en la primera fase.

## Verificación de proyecto

- `supabase/config.toml` usa migraciones imperativas (`schema_paths = []`) y PostgreSQL 17 local; las migraciones nuevas deben ser aditivas y revisarse en seco antes de push.
- `package.json` ofrece `npm run lint`, `npm run build` y `npm run test:e2e`. Los tests pgTAP existentes deben integrarse al procedimiento documentado; no hay un script npm específico de base de datos.
- La especificación aprobada ya está en el commit local `1c8cc4c`; el resto del worktree contiene cambios no relacionados y queda fuera del plan/commit de esta tarea.

## Seguimiento de implementación local

- Se preparó una migración aditiva para rangos por negocio y permisos globales explícitos por negocio. La migración transforma los permisos globales de pedidos/cobros existentes en grants de cada negocio existente, no incluye negocios futuros y vuelve inertes los grants organizacionales antiguos.
- La migración mueve permisos globales de abrir/cerrar caja a un rango de caja local equivalente, y bloquea el cambio si encuentra un traslape con otra membresía local activa. También se detiene ante membresías locales duplicadas no revocadas; no fusiona ni borra cuentas automáticamente.
- El backend añade rangos locales con catálogo de permisos permitido, validación de lo que el actor puede delegar, auditoría y actualización inmediata de los grants cuando cambia un rango. Una misma identidad puede conservar su membresía global y tener una membresía local independiente.
- La pantalla `/settings` separa Personal global de equipo local. El Coordinador asigna negocios donde se habilitan pedidos/cobros y el dueño local configura rangos, incluida caja. El formulario puede vincular una cuenta existente sin cambiar su contraseña.
- La licencia por negocio se consulta con el RPC dedicado; si falta la respuesta, el acceso falla de forma cerrada. Se puede retirar acceso aunque el negocio esté pausado, pero no habilitarlo sin negocio activo y licencia vigente.
- Se añadieron comprobaciones pgTAP estructurales y se actualizaron las pruebas que esperaban autorización en los RPC antiguos. Las pruebas pgTAP aún no se ejecutan en esta etapa.
- Validaciones locales observadas en esta iteración: `npm run lint` y `npm run build` terminaron correctamente antes de los últimos ajustes de auditoría. `npx supabase db push --linked --dry-run` reportó únicamente la nueva migración como pendiente y confirmó que no la aplicó. Se repetirán las validaciones finales.
- No se aplicó ninguna migración remota, no se modificaron datos/permisos remotos y no se hizo deploy. El SQL dry-run no prueba que PostgreSQL pueda ejecutar todos los bloques ni sustituye pgTAP o el piloto con cuentas reales.
