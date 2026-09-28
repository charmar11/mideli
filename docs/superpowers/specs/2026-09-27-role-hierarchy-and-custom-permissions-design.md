# Jerarquía de personal y permisos personalizados por negocio

**Estado:** Diseño aprobado en conversación; este documento está pendiente de revisión del usuario antes de planear o implementar cambios.

## Objetivo

Dar a Rincón 404 y a los dueños una forma clara, adaptable a teléfono y tablet, de administrar quién es responsable de cada negocio, qué rangos existen y qué puede hacer cada persona en cada local. Una misma cuenta podrá colaborar en varios negocios con permisos distintos, sin mezclar sus cajas, empleados ni operaciones.

## Contexto actual

- La plataforma ya separa membresías por alcance (plataforma, organización y negocio), pero los rangos locales aún son fijos: `local_waiter`, `local_kitchen` y `local_supervisor`.
- Las capacidades del dueño se configuran por negocio desde Rincón 404. Incluyen catálogo, inventario, pedidos, cocina, cobros, caja y personal.
- La membresía `global_waiter` es de organización y tiene capacidad para tomar y cobrar pedidos. El modelo actual todavía requiere un acceso explícito por negocio para limitar dónde puede operar.
- El Coordinador hoy asigna a meseras globales permisos granulares de apertura y cierre de caja por negocio, sin concederles la capacidad administrativa amplia `business.manage_cash`.
- Los dueños administran el personal local de su negocio; el Coordinador administra las meseras globales. El equipo local solo debe estar en modo consulta desde Rincón 404.
- Hay decisiones y lógica ya desplegadas descritas en `docs/superpowers/specs/2026-09-25-global-waiter-business-cash-roles-design.md`. El diseño nuevo cambia de forma importante quién administra los permisos locales de caja; se requiere migrar esa autoridad con cuidado y no asumir que la UI actual ya representa el modelo propuesto.

## Decisiones aprobadas en conversación

- Una persona tiene una sola cuenta y puede tener asignaciones independientes en varios negocios.
- Rincón 404 asigna un dueño principal a cada negocio. El negocio también puede tener encargados adicionales con rangos locales.
- El Coordinador puede consultar los equipos locales, pero solo el dueño o personal local autorizado administra altas, bajas, rangos y permisos de ese negocio.
- El Coordinador administra las cuentas de meseras globales y elige, por persona, en qué negocios pueden trabajar mediante el alcance global.
- Una mesera global puede tomar pedidos y cobrar en los negocios que el Coordinador le autorice. Abrir, cerrar caja o consultar el corte de cierre requiere autorización local específica por negocio.
- Cada dueño podrá crear rangos con nombres propios y permisos seleccionados de un catálogo seguro. No se podrán inventar capacidades arbitrarias ni asignar permisos que el responsable que configura el rango no tenga facultad de delegar.
- Los derechos de un local no se heredan a otro. La misma persona puede tener un rango y permisos diferentes en cada negocio.
- Las licencias por negocio siguen siendo una condición independiente: un negocio sin licencia vigente se muestra deshabilitado para la operación global y el backend rechaza el acceso operativo.
- Se preservan identidades, credenciales, ventas, tickets, cortes, inventario, auditoría y demás historial existente.

## Modelo mental de permisos

La interfaz presenta dos preguntas separadas, en ese orden:

1. **¿En qué negocios puede trabajar esta persona?** El Coordinador configura el alcance de una mesera global.
2. **¿Qué puede hacer dentro de este negocio?** El dueño asigna un rango local hecho con permisos permitidos para su negocio.

```text
Rincón 404 / Coordinador
├── asigna el dueño principal de cada negocio
├── habilita negocios para cada mesera global
└── consulta el personal local y sus rangos (solo lectura)

Dueño de cada negocio
├── administra el equipo de su propio local
├── crea rangos combinando permisos permitidos
└── asigna un rango local por empleado y negocio

Persona
├── mantiene una sola cuenta
├── puede tener alcance global más membresías locales
└── obtiene derechos evaluados por separado en cada negocio
```

El alcance global y la membresía local son independientes. Una asignación global da acceso al flujo global de pedidos solo en los negocios autorizados por el Coordinador. Si el dueño también registra a esa persona como empleado local, esa membresía local le da únicamente el rango que el dueño le asigne en ese local. En ambos casos, ninguna capacidad de un negocio habilita capacidades de otro.

Para evitar roles ambiguos, el diseño propone una asignación de rango local vigente por persona y negocio. Si alguien combina funciones dentro del mismo local, el dueño crea un rango compuesto, por ejemplo **Mesero con caja**, marcando los permisos correspondientes. La persona puede tener rangos distintos en otros negocios.

## Experiencia en Rincón 404

### Sección Negocios

- Cada tarjeta de negocio resume el nombre, estado, licencia, dueño principal y cantidad de miembros.
- **Ver equipo** abre el detalle administrativo del negocio, sin entrar al POS ni cambiar el contexto operativo del restaurante.
- El detalle presenta una lista vertical desplazable con nombre, estado de cuenta, rango local y resumen breve de permisos. Es de solo lectura para personal local.
- La acción **Cambiar dueño principal** usa una confirmación con negocio, persona entrante y saliente. Nunca crea otra cuenta automáticamente ni cambia contraseñas.
- Los encargados adicionales se administran desde la cuenta del negocio, no desde la consola de Rincón 404.

### Sección Personal global

- Presenta cuentas globales con búsqueda, estado y negocios autorizados.
- La ficha de una persona despliega la lista vertical de negocios. Cada negocio tiene un control visible de acceso global y un estado: disponible, sin licencia, pausado u otra condición operativa.
- Solo negocios elegibles pueden activarse. La licencia no vigente deshabilita el control, sin revelar adeudos ni detalles comerciales innecesarios.
- La pantalla muestra un resumen entendible: **Puede tomar y cobrar pedidos** en los negocios habilitados; **Caja: consultar permisos locales**.
- El Coordinador puede crear o desactivar miembros globales conforme a las reglas vigentes, pero no administrar los equipos locales desde esta pantalla.

## Experiencia dentro de cada negocio

La sección **Personal** pertenece al negocio seleccionado y solo aparece con autorización local.

- **Equipo:** lista de empleados con búsqueda y filtros simples por rango y estado. La lista se desplaza dentro del panel en tablet y móvil; las acciones no dependen de una tabla horizontal.
- **Rangos:** lista de rangos disponibles para ese negocio, con nombre, cantidad de personas y resumen de permisos.
- **Crear o editar rango:** captura de nombre y descripción breve, seguida de permisos agrupados. El formulario ofrece una vista previa en lenguaje simple de lo que el rango permite y lo que no.
- **Asignar empleado:** el dueño puede seleccionar una cuenta existente, incluida una persona que también sea mesera global, y asignarle un rango local sin crear credenciales duplicadas.
- Los controles muestran el negocio al que afecta cada cambio y requieren confirmación para revocar accesos o cambiar un rango en uso.
- En teléfono y tablet se usan secciones desplegables por negocio o categoría, controles grandes y un resumen fijo del rango antes de guardar. No habrá una matriz con negocios como columnas.

### Constructor de rangos

Los permisos se agrupan por tareas del negocio, no por nombres técnicos:

| Grupo | Ejemplos visibles | Límite relevante |
|---|---|---|
| Pedidos | Crear y operar pedidos | Alcance al negocio asignado |
| Cobros | Registrar/corregir cobros, según autorización definida | No equivale a administrar caja completa |
| Caja | Abrir, cerrar y consultar el corte autorizado | Apertura/cierre se conceden por separado; no habilitan gastos, correcciones ni administración financiera completa |
| Cocina | Consultar o actualizar preparación | Solo para negocios con ese flujo habilitado |
| Catálogo | Administrar menú y precios | No concede acceso a inventario por sí solo |
| Inventario | Insumos, recetas y existencias | Solo datos del negocio asignado |
| Personal | Administrar empleados y rangos locales | No concede gestión de Rincón 404 ni de otros negocios |

Los grupos son una presentación humana de un catálogo de capacidades mantenido por el sistema. El constructor no permite crear capacidades nuevas. Los permisos estructurales de plataforma, administración de licencias, coordinación global y transferencia de dueño principal no se pueden introducir en un rango local.

`business.manage_cash` es una capacidad administrativa amplia y no se usará como atajo para habilitar a una mesera a abrir o cerrar caja. Las capacidades granulares de operación de caja se mantienen separadas de gastos, correcciones, historial financiero y administración completa.

## Ejemplo de permisos efectivos

| Persona | Acceso global elegido por Coordinador | Rango local de Mideli | Rango local de Just Dipping |
|---|---|---|---|
| Andrea | Mideli y Just Dipping: tomar y cobrar pedidos | Mesero con caja, si su dueño lo asigna | Mesero sin caja, si su dueño lo asigna |

Si Andrea no tiene caja en Just Dipping, puede continuar con la operación que sí tenga autorizada, pero no podrá abrir ni cerrar esa caja. Un permiso local de Mideli no cambia ese resultado. Si se revoca su alcance global en Just Dipping, deja de usar el flujo global de pedidos allí; una membresía local que el dueño le asigne es una decisión separada y debe seguir visible como tal.

## Autoridad y seguridad

- La interfaz es una ayuda visual; no es el control de acceso. Server Actions, RPCs y políticas RLS deben validar usuario, membresía activa, rol, permiso y `business_id` en cada operación.
- El Coordinador solo modifica membresías y accesos globales dentro de su organización; no concede permisos locales de dueño, administra finanzas locales ni se convierte en personal de un negocio.
- El dueño principal y los encargados solo administran el negocio al que pertenecen y no pueden crear dueños, Coordinadores ni administradores de plataforma desde el constructor.
- Quien configura rangos solo puede delegar permisos que la política de delegación permita para su propia autoridad. Administrar personal no debe implicar automáticamente autoridad para delegar todos los módulos.
- Los rangos y asignaciones locales están vinculados a un solo negocio. La consulta, escritura, caja y licencias comprueban el mismo `business_id` en el servidor y en la base de datos.
- Las altas, cambios, transferencias de dueño, concesiones y revocaciones registran actor, persona afectada, negocio, capacidades modificadas, fecha y motivo cuando aplique.
- La desactivación es reversible y no elimina perfiles, transacciones ni auditoría. Al desactivar o quitar alcance, el acceso efectivo se invalida en el servidor aunque una pestaña permanezca abierta.
- Un negocio pausado o con licencia vencida no se habilita por pertenecer a una mesera global. Los permisos no reemplazan la licencia ni el estado operativo.

## Cambio respecto al control actual de caja

Actualmente, el Coordinador gestiona los permisos granulares de apertura y cierre de caja de las meseras globales. Este diseño propone mover la asignación de facultades **locales** de caja al dueño del negocio, a través de rangos y capacidades limitadas por local; el Coordinador conserva el control del alcance global, es decir, en cuáles negocios puede operar la mesera mediante la membresía global.

Antes de activar el nuevo modelo, se deberá:

1. Confirmar la equivalencia exacta entre los grants actuales de apertura/cierre y los nuevos permisos locales.
2. Migrar cada grant vigente a un rango o asignación local equivalente, sin ampliar accesos.
3. Conservar auditoría, motivo, autor y fechas de los cambios previos.
4. Verificar los permisos existentes por negocio, en particular que una autorización de Mideli no aparezca en Just Dipping.
5. Cambiar de forma transaccional las funciones/RPC de asignación para que solo el dueño autorizado gestione los nuevos permisos locales; no dejar rutas antiguas que permitan un bypass.
6. Mantener la capacidad de rollback lógico mediante datos y auditoría conservados, sin borrar el esquema viejo hasta verificar el piloto.

El cambio no se considera listo solo porque la nueva interfaz muestre rangos; las validaciones de Supabase y las pruebas negativas son un requisito de aceptación.

## Migración y compatibilidad

- No se recrean usuarios, perfiles, contraseñas ni PINs.
- Los puestos actuales `local_waiter`, `local_kitchen` y `local_supervisor` se convierten a rangos locales equivalentes, con permisos revisados contra su comportamiento real. Se conserva una forma de identificar los rangos del sistema frente a los rangos personalizados.
- `global_waiter` permanece como alcance de organización protegido; se agrega o consolida su lista de negocios habilitados sin convertirlo en un rango local.
- Los permisos actuales de dueño por negocio se conservan. No se elevan los módulos de un dueño como parte de la migración de personal.
- Pedidos, ventas, pagos, cortes, movimientos, inventario, folios y WhatsApp no cambian de dueño ni de `business_id`.
- El cambio se aplica mediante migraciones aditivas, con restricciones e índices revisados y pruebas SQL de permisos positivos y negativos. No se borran grants ni membresías hasta verificar equivalencia y rollback.

## Criterios de aceptación

1. El Coordinador puede cambiar el dueño principal de un negocio sin cambiar usuarios, contraseñas, ventas o historial.
2. El Coordinador ve una lista de empleados por negocio y sus rangos, pero no puede editar, activar, desactivar ni resetear personal local.
3. Un dueño solo ve y gestiona empleados y rangos de su negocio.
4. El dueño puede crear un rango con permisos del catálogo permitido, editarlo y asignarlo; el sistema impide delegar facultades que ese usuario no puede administrar.
5. Un mesero global solo puede operar el flujo global de los negocios seleccionados por el Coordinador y habilitados para operar.
6. Una persona puede tener alcance global y una asignación local independiente, usando la misma cuenta y credenciales.
7. El dueño de Mideli puede asignar a una persona permisos locales de caja en Mideli sin que estos aparezcan en Just Dipping. El dueño de Just Dipping puede dejarla sin caja allí.
8. Una persona sin permiso de apertura o cierre no puede ejecutar la acción llamando directamente a una Server Action, RPC o API.
9. Los permisos no se amplían al cambiar la cookie o el negocio seleccionado; los pedidos/caja mantienen su negocio original.
10. Los negocios sin licencia operativa aparecen deshabilitados en el selector global y son rechazados también en el backend.
11. Los cambios de roles y accesos se auditan y la revocación surte efecto sin eliminar historial.
12. La experiencia de administración funciona en teléfono, tablet y escritorio, con navegación clara, estados de carga/error/guardado y sin tablas horizontales obligatorias.
13. El flujo de Mideli y los accesos actuales de Just Dipping conservan su comportamiento durante la migración salvo permisos explícitamente revisados y aprobados.

## Secuencia propuesta, todavía no autorizada para ejecución

1. Inventariar permisos reales en funciones, RPC, políticas RLS, rutas, navegación, perfiles y grants remotos; producir una matriz de acción × permiso × negocio.
2. Diseñar el esquema mínimo de roles locales, capacidades seguras, acceso global a negocios, delegación y auditoría. Definir restricciones e índices con plan de reversión.
3. Probar las reglas nuevas en SQL y en una matriz de usuarios de prueba, incluyendo dueño, encargado, mesera global, mesera local y usuario sin permiso.
4. Crear migraciones aditivas y funciones seguras de gestión; ejecutar `npx supabase db push --linked --dry-run` antes de aplicar cualquier esquema remoto.
5. Hacer una migración de prueba/lectura que compare permisos antiguos y nuevos sin activar escrituras.
6. Implementar la consola de Rincón 404 y las pantallas locales de Personal una vez demostrada la autorización del backend.
7. Probar tablet y teléfono, ejecutar `npm run lint` y `npm run build`, y validar la operación de caja y pedidos con cuentas reales en una ventana acordada.
8. Desplegar solo después de revisar los resultados y acordar el piloto; conservar ruta de rollback y monitorear denegaciones inesperadas.

## Decisiones técnicas para la fase de planificación

- Determinar si los rangos se materializan en tablas propias o se representan con la capa existente de membresías y capacidades; elegir la opción más pequeña que respete RLS y auditoría.
- Establecer la lista definitiva de capacidades delegables a partir de las acciones actuales, separando abrir/cerrar caja de administración financiera y separar cobro de apertura de caja.
- Definir si cambiar el dueño principal revoca automáticamente la membresía anterior o si el Coordinador puede convertir a la persona saliente en encargada; la confirmación debe mostrar el resultado antes de guardar.
- Definir cómo se representan los rangos integrados y los personalizados en reportes y futuras áreas sin cambiar la autorización por negocio.
- Revisar compatibilidad con Coordinador, cuenta de plataforma, licencias, cierre de caja, menú global y rutas de login antes de publicar.

La revisión y aprobación de este documento precede a un plan de implementación. Este archivo no aplica migraciones, no cambia permisos remotos y no autoriza un deploy.
