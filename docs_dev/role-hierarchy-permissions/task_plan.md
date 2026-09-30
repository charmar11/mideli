# Plan de implementación: jerarquía y permisos por negocio

## Estado

Implementación local preparada. La migración, las acciones de servidor y las interfaces están en el worktree; todavía no se aplican a Supabase ni se despliegan a producción. Faltan pgTAP y validación del flujo real con cuentas de prueba.

## Objetivo

Implementar una administración clara y segura en la que Rincón 404 coordina las meseras globales y su acceso a cada negocio, mientras cada dueño administra al personal y los roles de su negocio. Una identidad puede combinar acceso global y asignaciones locales sin duplicar cuentas ni heredar permisos de un negocio a otro.

La especificación aprobada está en `docs/superpowers/specs/2026-09-27-role-hierarchy-and-custom-permissions-design.md`. Este plan la traduce a trabajo técnico y conserva explícitos los puntos que requieren auditoría antes de tocar datos.

## Alcance de este paso

Construir el modelo de rangos locales editables, acceso de mesera global por negocio y vinculación de una cuenta existente; conservar separadas las credenciales, la caja y los permisos de cada negocio. La migración remota y el deploy siguen siendo pasos posteriores a la revisión y aprobación explícita de su aplicación.

## Modelo de autorización que guía la implementación

- El acceso efectivo se calcula para la combinación identidad + negocio + acción. No se deriva de un nombre de usuario ni de un rol global del perfil.
- El Coordinador administra la lista de negocios en los que cada mesera global puede operar pedidos y cobros. Un negocio fuera de la lista no aparece como opción utilizable.
- El dueño administra el personal local, sus rangos y permisos dentro de su propio negocio. Rincón 404 puede consultar los equipos, pero no editar asignaciones locales en nombre del dueño.
- Una persona puede tener, por ejemplo, rango de mesera global y rango local de Just Dipping al mismo tiempo. El permiso de caja local solo existe si el dueño de ese negocio lo concede. Acceso para cobrar un pedido no equivale a permiso para abrir o cerrar caja.
- Los roles personalizados solo agrupan permisos de un catálogo permitido por los módulos activos del negocio. No se admitirán capacidades, SQL, nombres de rol ni permisos arbitrarios definidos por el usuario.
- La licencia es una condición adicional obligatoria: un acceso global asignado no habilita un negocio cuya licencia está vencida. Para la mesera global, el negocio se puede mostrar deshabilitado con el aviso correspondiente, sin permitir seleccionarlo.
- Las cuentas, contraseñas, ventas, pedidos, cierres, inventario, numeración de tickets, auditoría y el canal WhatsApp exclusivo de Mideli deben conservar su semántica actual.

## Fases de implementación

### 0. Preparación y protección del estado actual

- Revisar `git status` y separar cambios preexistentes de los de implementación; nunca limpiarlos, revertirlos ni incluirlos en un commit de forma incidental.
- Volver a leer `.opencode/plans/mideli-context.md` y la especificación antes de tocar código.
- Registrar baseline de negocio, membresías, grants, licencia y pruebas disponibles usando solo medios autorizados. No imprimir ni consultar `.env.local`.
- Confirmar si hay una ventana de mantenimiento y quién valida el piloto.

**Salida:** inventario reproducible y lista de archivos/rutas tocados, sin cambios de datos.

### 1. Auditoría completa de autorización

Seguir de extremo a extremo las decisiones de autorización, no solo la UI:

- Perfil heredado (`profiles.role`) y su uso en `src/proxy.ts`, WhatsApp, delivery, reportes y licencias. Mantener WhatsApp exclusivo de Mideli y no convertir una etiqueta antigua de perfil en permiso de negocio.
- Membresías (`memberships`), roles fijos, `membership_capabilities`, contexto multinegocio, selector de negocio, sesión y guardas de licencia.
- Acciones de servidor y RPC para listar/crear/vincular/editar/desactivar personal; abrir/cerrar caja; crear, modificar y cobrar pedidos; corregir pagos; actualizar estados; cocina; impresión/notificaciones.
- RLS y funciones `SECURITY DEFINER`, incluidos gateways que actualmente otorgan autoridad a `platform.manage_businesses`.
- Todas las referencias a `organization.operate_orders` y `organization.charge_orders`, ya que hoy pueden autorizar más de un negocio. Revisar también cómo `get_my_multibusiness_context()`, `getSelectedBusinessContext()`, el selector y `src/proxy.ts` combinan permisos.
- Pantallas de dashboard, Personal, caja y selector de menús; verificar que el servidor rechaza una operación aunque se invoque directamente sin pasar por la UI.

**Salida:** matriz `actor × negocio × operación × permiso × origen` y mapa de cada autorización desde UI hasta DB. No avanzar si quedan RPC o políticas sin dueño/alcance identificado.

### 2. Cerrar decisiones técnicas y compatibilidad

Validar estas reglas contra el estado real de datos antes de diseñar el backfill:

1. **Roles locales:** ofrecer rangos integrados y personalizados por negocio. Un rango local es compuesto, con un conjunto de permisos autorizado. La pertenencia global es otra asignación independiente; no se mezclan en el mismo rango.
2. **Asignaciones locales duplicadas:** detectar personas con varias membresías activas dentro del mismo negocio. No elegir una con `limit(1)` ni perder permisos: conservar su unión efectiva y convertirla a una asignación equivalente revisable antes de consolidar.
3. **Meseras globales:** el Coordinador asigna acceso explícito por negocio para pedidos/cobros. No convertir un grant organizacional amplio en acceso automático a todos los negocios. Preparar un reporte por persona y negocio para que el Coordinador confirme la lista inicial.
4. **Caja:** mantener la autorización por negocio. Preparar una comparación de grants de abrir/cerrar existentes y su reemplazo local; no revocar grants ni cambiar autoridad hasta demostrar equivalencia y aprobación del dueño correspondiente.
5. **Dueño principal:** permitir un dueño principal por negocio y rangos locales adicionales para encargados. Transferir al nuevo dueño sin recrear cuentas ni mover el historial. Recomendación para la cuenta saliente: revocar solo su autoridad de dueño en ese negocio y conservar su identidad y demás membresías; si debe seguir en el local, asignarle explícitamente un rango local.
6. **Contraseñas:** separar administración de membresía de control de credenciales. Un dueño local no debe cambiar la contraseña de una identidad compartida y afectar sus accesos globales u otros negocios. Definir recuperación de cuenta global por canal autenticado y auditable.
7. **Permisos disponibles:** limitar la lista de permisos de un rango a acciones y módulos habilitados del negocio y al conjunto que el actor puede delegar. No permitir que `business.manage_staff` se convierta en autoridad para conceder cualquier capacidad.
8. **Cuenta existente:** permitir vincular a la persona por identidad existente de forma autorizada, sin crear duplicado de Auth, cambiar contraseña/PIN ni revelar cuentas ajenas.

**Salida:** decisiones trazables en la especificación/ADR y reporte de compatibilidad de membresías, caja y acceso global. Cualquier cambio a las reglas aprobadas vuelve al usuario para revisión.

### 3. Migración de datos aditiva y compatible

- Crear migración nueva en `supabase/migrations/`; no editar migraciones históricas.
- Modelar rangos locales por negocio, permisos del rango y asignación de membresías. El esquema exacto se elige tras la auditoría; debe conservar autoría, fechas, activación/archivo y referencias de auditoría.
- Persistir el acceso global mesera-negocio como autorización explícita, auditable y revocable. Reutilizar `membership_capabilities` solo si la auditoría confirma semántica inequívoca; de lo contrario, separar la lista explícita de negocios de los permisos operativos.
- Definir un catálogo fijo de permisos delegables en servidor. Los datos del rango referencian identificadores permitidos; nunca se ejecutan permisos suministrados como texto libre.
- Hacer backfill de roles fijos a roles integrados compatibles por negocio y calcular las uniones efectivas de las membresías múltiples.
- Generar antes del backfill una vista/reporte de diferencias de acceso global y caja. Requerir confirmación del Coordinador/dueños para grants ambiguos; no ampliar silenciosamente alcance organizacional ni otorgar todos los negocios a todas las meseras.
- Registrar la procedencia de los grants migrados y conservar filas/eventos históricos. Archivar o revocar rutas antiguas solo después de validación; nunca borrar historia para simplificar el modelo.
- Revisar conflictos de dueño y datos huérfanos antes de imponer unicidad o restricciones nuevas.

**Salida:** migración idempotente cuando sea viable, informe de filas afectadas y pruebas de integridad/paridad. Revisión obligatoria con `npx supabase db push --linked --dry-run`; no aplicar migración remota en esta tarea de planificación.

### 4. Backend como frontera de seguridad

- Implementar un resolver central de capacidades efectivas para actor, negocio y operación; incorporar membresía local, allowlist global, estado del negocio y licencia.
- Actualizar o envolver las RPC sensibles para validar el negocio objetivo, el actor y la delegabilidad en la base de datos. No confiar en `business_id`, rol ni permisos mandados desde el cliente.
- Añadir operaciones transaccionales para crear/editar/archivar rangos, asignar/quitar una membresía local, vincular una identidad existente, editar la allowlist global y transferir dueño.
- Hacer que el Coordinador solo consulte equipos locales. La política debe denegar escritura también al invocar RPC directamente; cualquier operación de plataforma que necesite administrar negocios se conserva separada de personal local.
- Mantener autorización de abrir/cerrar caja independiente por negocio y auditar actor, objetivo, antes/después, motivo y fecha en altas, cambios, revocaciones y transferencias.
- Evitar que permisos organizacionales amplios vuelvan a filtrarse a todos los negocios por `src/proxy.ts` o el contexto seleccionado.
- Mantener el control de licencia como guard adicional en las mismas operaciones de servidor; nunca basta con ocultar el negocio en la interfaz.

**Salida:** backend deny-by-default, operaciones atómicas y auditoría verificable. Ningún cambio de UI debe ser necesario para que falle una operación no autorizada.

### 5. Integrar todos los consumidores existentes

Revisar y adaptar, como mínimo, estos puntos identificados; confirmar rutas exactas durante Fase 1:

- `src/lib/actions/users.ts`: consulta y edición por `business_id`, vinculación segura, rangos dinámicos y autoridad de credenciales.
- `src/types/database.ts`, `src/types/multibusiness.ts` y tipos de acciones: reflejar el esquema nuevo sin `any` ni rol global como fuente de autorización local.
- `src/lib/business-context-store.ts`, `src/lib/selected-business.ts`, `business-context-selection.ts` y `src/proxy.ts`: devolver solo negocios habilitados para esa identidad y aplicar licencia/permisos de forma coherente.
- Selector de negocio/menú en POS, `dashboard-shell.tsx`, estado de pedido, cocina, cobro, caja y rutas del dashboard.
- Todos los RPC/RLS que leen las capacidades de pedidos, cobros, caja, personal y actualización de preparación.
- Preservar que una comanda con artículos de varios locales produzca pedidos, tickets, caja, inventario e historial en el negocio correcto. Este trabajo no rediseña el flujo de cobro ni la numeración de tickets.

**Salida:** cada consumidor usa una autoridad común y el comportamiento actual de Mideli continúa dentro de sus permisos reales.

### 6. Interfaz administrativa y uso móvil/tablet

- **Rincón 404 / Personal global:** lista de meseras globales, negocios permitidos por persona, estados de licencia (negocio deshabilitado/no seleccionable), filtros y auditoría resumida. El Coordinador administra aquí la allowlist y solo consulta equipos locales.
- **Rincón 404 / Negocios:** consulta plegable del equipo por local, con rango, permisos legibles y estado. Es estrictamente de solo lectura para Coordinación.
- **Administración del negocio / Personal:** lista local, invitación de persona nueva o vinculación autorizada de cuenta existente, rol por negocio, permisos de caja, estado y acciones. Mostrar a qué negocio aplica cada cambio antes de confirmar.
- **Constructor de rangos:** crear nombre y descripción; seleccionar permisos desde una lista agrupada en categorías claras (pedidos/servicio, cocina si aplica, caja/cobros, catálogo/inventario, personal según delegación). Mostrar una vista previa en lenguaje sencillo de lo que podrá hacer el rango. Ocultar permisos no habilitados/no delegables.
- **Múltiples asignaciones:** presentar claramente global + local como dos tarjetas/secciones, sin dar la impresión de que el rango global concede permisos locales. Advertir al guardar una combinación que no otorga caja.
- **Transferencia de dueño:** flujo dedicado con identificación del dueño actual/nuevo, resumen de efectos, confirmación reforzada y registro de auditoría.
- Diseño responsivo: formularios de una columna, selector de negocio persistente y legible, matriz de permisos reemplazada por grupos/accordions en móvil, objetivos táctiles adecuados y estados vacíos/loading/error/reintento claros.
- Los módulos de catálogo para dueños no se deben confundir con los permisos del personal. WhatsApp sigue apareciendo solo donde está autorizado y sigue exclusivo de Mideli.

**Salida:** pruebas de flujo en teléfono y tablet; ningún permiso depende de que el usuario entienda códigos internos.

### 7. Verificación automatizada y revisión de seguridad

Extender pruebas pgTAP actuales de personal, contexto y caja. Incluir positivos **y** denegaciones:

- Dueño administra su negocio; falla al administrar otro.
- Coordinador administra acceso global; puede leer equipo local y falla al editarlo, incluso vía RPC directa.
- Mesera global solo puede ver/operar negocios expresamente asignados; no puede añadir otro ni inferir acceso por membresía organizacional.
- Global + local en la misma identidad funciona sin duplicar usuario. Los permisos locales (incluida caja) provienen solo de la asignación local correspondiente.
- Una persona con caja permitida en Mideli y no en Just Dipping puede cobrar/abrir/cerrar exactamente según las capacidades previstas y negarse fuera de ellas.
- Roles personalizados no escalan permisos; no aceptan capacidad desconocida, dueño/plataforma ni permiso no habilitado.
- Estado pausado/archivado/licencia vencida bloquea operación en backend, aunque el cliente fuerce el selector.
- Transferencia de dueño es atómica; no deja cero/dos dueños por error y preserva identidad, otras membresías e historial.
- Varias membresías existentes conservan la unión efectiva durante transición; no hay selección arbitraria por `limit(1)`.
- No hay filtración entre negocios en pedidos, tickets, caja, inventario, analytics ni historial; WhatsApp continúa exclusivo de Mideli.
- Correr pruebas pgTAP disponibles según `docs/OPERATIONS.md`, además de `npm run lint`, `npm run build` y `npm run test:e2e` cuando corresponda. No usar `supabase db reset --linked`.

**Salida:** evidencia de resultados y pruebas manuales documentadas. No considerar listo por compilar únicamente.

### 8. Piloto y despliegue de producción (solo tras aprobación posterior)

- Preparar un reporte previo de usuarios y accesos efectivos para Mideli y Just Dipping; el dueño/coordinador confirma casos uno por uno antes de activar el modelo nuevo.
- Aplicar primero migración aditiva compatible. Usar lectura dual/compatibilidad solo durante la transición y con fecha de retirada; si no existe un mecanismo seguro, no inventar una bandera que permita saltarse autorización.
- Validar con cuentas reales de prueba: dueño de Mideli, dueño de Just Dipping, Coordinador, mesera global con acceso a ambos, y la misma mesera sin permiso de caja en uno de ellos.
- Comprobar producción: inicio/salida de sesión, selector, alta/vinculación, asignación, pedido de uno y varios locales, cobro, caja, licencia, historial y registro de auditoría.
- Hacer despliegue de Vercel únicamente con verificación verde y migración revisada. Observar logs y métricas disponibles durante el piloto; tener responsables y procedimiento de soporte.
- Reversión segura: detener altas/cambios desde la nueva UI y corregir con migración hacia adelante. No restaurar permisos organizacionales amplios ni borrar tablas/grants/eventos. El apagado de interfaz nunca sustituye revocar una autorización insegura.

**Salida:** piloto aceptado por los responsables del local. Si falla una autorización o hay pérdida de visibilidad, detener la ampliación y corregir antes de continuar.

## Criterios globales de aceptación

1. La mesera global ve solo negocios asignados y una licencia vencida no se puede seleccionar ni operar.
2. La misma identidad puede ser global y empleada local sin duplicar su cuenta, y cada alcance conserva su autonomía.
3. Dueños administran únicamente su negocio; Coordinador administra el alcance global y no cambia roles locales.
4. Permisos de caja son independientes por negocio y distintos del permiso general de cobrar pedidos.
5. No se pierde acceso legítimo existente sin revisión humana, no se amplía acceso silenciosamente y todo cambio queda auditado.
6. Mideli mantiene sus flujos y WhatsApp exclusivo; pedidos, tickets, caja, inventario e historial siguen separados por negocio.
7. La experiencia de configuración funciona en teléfono y tablet, con etiquetas claras y resumen antes de guardar.
8. SQL dry-run, pgTAP aplicable, lint, build y E2E acordado están verdes antes de producción.

## Decisiones confirmadas y límites todavía pendientes

El usuario confirmó la siguiente operación:

- Una persona puede conservar la misma cuenta y combinar acceso global con rangos locales distintos, sin duplicar usuario ni compartir permisos de caja.
- El Coordinador elige por negocio dónde puede operar y cobrar una mesera global; un negocio nuevo no hereda acceso automáticamente.
- Cada dueño crea rangos locales combinando permisos de una lista segura; el dueño local, no Rincón 404, administra la caja y el equipo de su negocio.
- La cuenta global conserva su contraseña al vincularla a un negocio. Un dueño local no cambia la contraseña compartida.
- Los permisos de caja globales existentes se trasladan a un rango local equivalente, sin ampliar facultades; la migración conserva la auditoría y retira la vía de asignación global.

La migración se detiene antes de aplicarse si encuentra más de una membresía local no revocada para una misma persona y negocio, o si detecta traslape entre una asignación global de caja y un rango local. No consolida ni borra datos automáticamente. La transferencia de dueño y la ejecución pgTAP sobre una base real quedan fuera de este paso y requieren su propio procedimiento seguro.

## Historial de planificación

- 2026-09-27: usuario aprobó el diseño funcional y pidió proceder. Se creó este plan y su inventario. No se ha cambiado código, base remota, permisos ni producción.
- 2026-09-27: el usuario autorizó la implementación. Se agregaron localmente la migración aditiva, las acciones de servidor y la interfaz de rangos/acceso por negocio. Lint, build y dry-run terminaron correctamente; el dry-run no aplicó la migración. El SQL remoto y el piloto funcional siguen pendientes.
