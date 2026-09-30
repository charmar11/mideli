# Bitácora: jerarquía y permisos por negocio

## 2026-09-27

- El usuario aprobó el diseño funcional y pidió proceder con el siguiente paso: un plan detallado, no una implementación.
- Se leyó el contexto requerido del proyecto y la especificación aprobada; se revisó el estado Git para evitar mezclar cambios preexistentes.
- No está disponible el skill `writing-plans`; se usó el skill `planning` disponible como alternativa. También se leyó `supabase` por el alcance de membresías, capabilities, RPC, RLS y migraciones.
- Se revisó el modelo existente: roles locales fijos, grants de caja globales, contexto organizacional que puede ampliar pedidos/cobros y un límite de personal de plataforma más amplio que la regla deseada de consulta local.
- Se identificó que una identidad global y local debe vincularse sin crear duplicados Auth, que hay que resolver membresías locales múltiples sin `limit(1)` arbitrario y que permisos de pedidos/cobros, caja y contraseña son autoridades distintas.
- La comprobación específica encontró otros consumidores de `profiles.role` en proxy, WhatsApp, estado de pedidos, delivery, reportes y licencias; el plan exige mantener compatibilidad y auditar cada uno.
- Se escribió un plan técnico por fases, con seguridad backend, migración aditiva, integración de consumidores, interfaz responsiva, pruebas, piloto y reversión segura.
- Se actualizaron hallazgos y límites de verificación. No se leyó `.env.local`, no se consultó Supabase remoto, no se cambió código/datos/permisos y no hubo deploy.
- El documento de diseño fue comprometido localmente antes de esta tarea como `1c8cc4c`; estos tres documentos de planificación están sin commit y limitados a su carpeta. No se creó un commit nuevo.

## Estado

Plan preparado para revisión del usuario. La implementación queda pendiente de aprobación del plan y de las decisiones marcadas en `task_plan.md`.

## 2026-09-27 · Implementación local autorizada

- El usuario aprobó continuar con la implementación de roles configurables y jerarquía global/local.
- Se creó la migración `20260928011152_business_scoped_staff_roles_and_authorization.sql`: rangos locales, catálogo seguro de capacidades, backfill con preflight estricto, scopes explícitos de pedidos/cobros por negocio, retiro de permisos globales de caja y RPCs con auditoría.
- Se añadieron acciones de servidor para listar/guardar/archivar rangos, asignar una cuenta existente al equipo local sin cambiar credenciales y administrar desde Coordinación los negocios habilitados a una mesera global.
- Se integró la interfaz responsiva de “Rangos del equipo” en Administración local y un diálogo de acceso por negocio en Personal global. La licencia vencida bloquea habilitar; no bloquea retirar permisos.
- Se añadió en Negocios una vista plegable, de solo lectura, de las personas y rangos de cada local para Coordinación. Las asignaciones locales se siguen haciendo desde Personal del negocio.
- Se añadió el flujo separado para transferir al dueño principal: selecciona una cuenta activa existente de la organización, requiere motivo y confirmación, conserva sus credenciales y las demás asignaciones, copia los módulos activos del dueño anterior y audita la transacción. La persona anterior pierde sólo esa membresía de dueño.
- Se cambió la resolución del rol de navegación para que use la membresía del negocio seleccionado antes que el rol global del perfil. Esto evita que el rango de otro negocio conceda privilegios de UI por herencia.
- La revisión detectó y corrigió: permisos de usuarios ya asignados al editar un rango, uso del RPC real de licencias, texto engañoso al reactivar un acceso por alcance y perfil local derivado del rango integrado seleccionado.
- Se actualizaron las pruebas estructurales para que el setter global de caja y el RPC fijo antiguo ya no sean ejecutables por `authenticated`, y se añadió `multibusiness_staff_roles_test.sql` con comprobaciones para rangos, RLS, precedencia local y transferencia de dueño.
- Impeccable detector reportó `[]` para la UI tocada.
- Validaciones locales finales: `npm run lint`, `npm run build` y `git diff --check` terminaron correctamente; el archivo pgTAP cuenta con 28 aserciones. `npx supabase db push --linked --dry-run` confirmó que la única migración pendiente es `20260928011152_business_scoped_staff_roles_and_authorization.sql` y que no la aplicó.
- pgTAP todavía no se ejecuta porque no hay un entorno PostgreSQL local disponible; las pruebas E2E con backend no aislado tampoco se corrieron para evitar afectar datos reales.
- No se aplicó SQL remoto, no se alteraron datos remotos y no se desplegó.

## Estado actual

Implementación local con lint/build/dry-run en verde. Falta ejecutar pgTAP en un entorno de base de datos seguro y validar los flujos con cuentas reales. No se aplicó SQL remoto ni se hizo deploy.
