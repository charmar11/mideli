# Puestos combinables y permisos de caja por negocio

**Estado:** diseño aprobado en conversación, pendiente de revisión de este documento antes de implementar.

## Objetivo

Permitir que el Coordinador de Rincón 404 asigne a cada mesera global funciones adicionales por negocio, sin crear cuentas duplicadas ni extender permisos de caja a todos los locales. Por ejemplo, Andrea puede abrir y cerrar la caja de Mideli y consultar ese corte, pero no operar la caja de Just Dipping.

## Decisiones aprobadas

- La cuenta existente de `rincon404` conserva su acceso de Administrador de plataforma y recibe también la función de Coordinador. No se crea una segunda cuenta ni se cambian sus credenciales.
- Las meseras globales conservan sus permisos organizacionales aprobados para tomar y cobrar pedidos en los negocios habilitados.
- Los puestos son combinables y se asignan por persona y negocio. La primera combinación soportada es `Mesera global` + `Caja operativa`.
- `Caja operativa` permite abrir un turno, cerrarlo y consultar el corte digital correspondiente. No permite administrar gastos, corregir movimientos, ni operar el historial financiero completo.
- El Coordinador administra meseras globales y sus puestos por negocio. El dueño de cada negocio conserva el control de su personal local y de la administración financiera de su negocio.
- Una autorización en un negocio no se hereda a otro. Asignar `Caja operativa` en Mideli no habilita Just Dipping.
- No se registra ni selecciona una terminal de cobro.

## Contexto técnico confirmado

- Una persona puede tener una sola identidad de autenticación y membresías con diferentes alcances. La membresía `global_waiter` pertenece a la organización y obtiene permisos para pedidos y cobros.
- `membership_capabilities` ya permite registrar permisos adicionales con alcance de negocio. `private.multibusiness_has_capability` comprueba tanto el negocio objetivo como la organización, incluso cuando la membresía base tiene alcance organizacional.
- La capacidad actual `business.manage_cash` es demasiado amplia para meseras: cubre apertura, cierre, historial, movimientos y varias acciones de administración. No se debe asignar esa capacidad a Andrea como atajo para habilitar el corte.
- La interfaz de Personal actual permite al Coordinador crear y desactivar meseras globales, pero no editar permisos de caja por negocio. Las operaciones de caja tampoco distinguen todavía entre operar el turno y administrar finanzas.
- En la revisión remota del 25 de septiembre de 2026, la cuenta `Administrador de plataforma` tenía `platform.manage_businesses`; aún no tenía `organization.manage_global_waiters`. Andrea tenía membresía global para pedidos y cobros, sin permisos de caja por negocio. Este es un dato de diagnóstico de esa fecha, no una condición permanente.

## Experiencia propuesta

En la administración de plataforma de `rincon404` habrá una entrada **Personal global**. El Coordinador podrá buscar una mesera y revisar una matriz de negocios activos:

| Persona | Permiso global | Mideli | Just Dipping |
|---|---|---|---|
| Andrea | Tomar y cobrar pedidos | Caja operativa | Sin permiso de caja |

El permiso global de pedidos y cobros se muestra como alcance organizacional existente; no se duplica como una casilla independiente por negocio. `Caja operativa` es un puesto rápido que activa apertura y cierre con consulta del corte. La opción **Ajustar permisos** permitirá activar solo apertura o solo cierre/corte cuando el trabajo de esa persona lo requiera. Ambos permisos siguen ligados al negocio seleccionado. La administración financiera se mantiene separada y no se asigna desde este flujo.

La interfaz estará optimizada para móvil y tablet. Guardar o retirar un puesto mostrará claramente a qué persona y negocio afecta. Un error de autorización o de guardado mantendrá la pantalla abierta y no mostrará el cambio como aplicado hasta confirmar el resultado del servidor.

## Identidad y administración

- El perfil de autenticación de `rincon404` no se reemplaza ni se transfiere. Su capacidad `platform.manage_businesses` permanece intacta y se agrega el permiso organizacional de Coordinador para la organización Rincón 404 Food Park.
- El Coordinador puede administrar membresías `global_waiter` de esa organización y concederles únicamente el puesto organizacional aprobado y los permisos de caja operativa por negocio.
- El Coordinador no puede concederse a sí mismo permisos de negocio, crear dueños, administrar personal local, ni otorgar `business.manage_cash` u otros permisos de administración financiera.
- Los dueños siguen asignando personal local dentro de su propio negocio, sin depender del Coordinador.

## Autorización y datos

Se reutiliza el modelo existente de membresías y capacidades; no se crea una segunda cuenta para Andrea ni una membresía local duplicada solo para representar cada puesto.

La implementación añadirá capacidades granulares para las acciones cubiertas por `Caja operativa`. Los nombres finales de los códigos se fijarán durante el plan técnico. La autorización deberá comprobar en Supabase:

1. La sesión autenticada y la membresía activa de la persona.
2. El permiso específico de caja para el `business_id` solicitado.
3. Que el turno que se abre, consulta o cierra pertenece a ese mismo negocio.
4. Que el negocio está activo para operar.

Las funciones de base de datos que abren y cierran turnos deben validar el permiso granular directamente. La interfaz solo refleja la autorización; no constituye una barrera de seguridad. `business.manage_cash` se conserva para las facultades completas de dueños y administradores locales.

El puesto `Caja operativa` no habilita consulta general de cortes pasados, gastos, correcciones, archivo o eliminación de turnos. La mesera podrá ver el corte digital que acaba de cerrar conforme a la ventana operativa existente. Los límites actuales de autorización por PIN para diferencias de caja se mantienen.

## Auditoría y revocación

Cada asignación y revocación debe conservar actor, persona afectada, organización, negocio, puesto/capacidades, fecha y motivo. Se reutilizan los campos auditables de `membership_capabilities` y `audit_events`; no se borran filas históricas ni turnos de caja.

Desactivar a una mesera global detiene todos sus accesos mediante el estado de su membresía. Al reactivarla, solo vuelven a estar vigentes los permisos por negocio que no se hayan revocado; la interfaz debe mostrar esas asignaciones antes de confirmar la reactivación.

## Fuera de alcance de la primera versión

- Dar permisos de caja a personal local desde la pantalla del Coordinador.
- Conceder acceso a gastos, retiros, correcciones, configuración o administración del historial financiero.
- Añadir funciones de Cocina, inventario o catálogo a las meseras globales.
- Cambiar el alcance global ya aprobado para tomar y cobrar pedidos.
- Crear cuentas o contraseñas por restaurante, y seleccionar terminales.

## Verificación de aceptación

- Andrea conserva la capacidad de tomar y cobrar pedidos en los negocios habilitados.
- Con `Caja operativa` en Mideli puede consultar el turno actual, abrir la caja, cerrarla y consultar el corte recién cerrado. Si el Coordinador ajusta el puesto a solo apertura o solo cierre, la acción no concedida es rechazada en Supabase.
- En Just Dipping, las operaciones de caja de Andrea son rechazadas por Supabase y no cambian turnos ni saldos.
- Andrea no puede consultar el historial completo, gastos, correcciones ni administración de caja.
- Un dueño local mantiene su acceso administrativo de caja y no obtiene acceso a otro negocio.
- Un Coordinador puede conceder y revocar el puesto solo dentro de Rincón 404 y no puede otorgar permisos más amplios.
- La auditoría identifica quién hizo cada cambio, a qué persona y negocio, y cuándo.
- Los cambios de negocio seleccionado o de cookie no permiten evadir el límite de negocio.
- La pantalla funciona en móvil, tablet y escritorio, con estados de carga, guardado, error y confirmación claros.
- Los turnos, pagos, movimientos e historial existentes permanecen intactos.

## Secuencia de implementación propuesta

1. Agregar y probar capacidades granulares de apertura y cierre/consulta del corte, manteniendo el permiso amplio de caja para dueños y administradores.
2. Actualizar los RPC de caja para validar permisos por negocio y cubrir intentos fuera de alcance con pruebas de base de datos.
3. Añadir acciones de servidor auditadas para consultar, asignar y revocar los puestos de meseras globales.
4. Construir **Personal global** para la cuenta de plataforma-Coordinador, con asignación por negocio y experiencia responsive.
5. Conceder `organization.manage_global_waiters` a la identidad existente de `rincon404`, conservando `platform.manage_businesses`, y verificar su navegación.
6. Asignar a Andrea `Caja operativa` solo en Mideli después de comprobar las membresías y los identificadores de negocio vigentes.
7. Ejecutar pruebas negativas y positivas, `npm run lint`, `npm run build`, validación de migración en seco y una verificación controlada antes de desplegar.

La implementación no debe aplicar permisos remotos ni desplegarse hasta que el usuario revise y apruebe esta especificación final.
