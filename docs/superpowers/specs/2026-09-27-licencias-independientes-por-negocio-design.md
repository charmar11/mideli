# Licencias independientes por negocio

Fecha: 2026-09-27

Estado: diseño aprobado por el usuario; plan técnico en preparación. No implementado.

## Objetivo

Permitir que Rincón 404 Food Park controle la vigencia de cada negocio desde un solo panel, sin que el vencimiento o falta de pago de un local interrumpa a los demás. La licencia representa una fecha de acceso, no un sistema contable de cobros.

La cuenta rincon404 será la única que podrá activar, renovar, cambiar, suspender o reactivar licencias. No se calcularán montos pendientes, pagos parciales, facturas ni saldos.

## Estado actual y relación con decisiones anteriores

Actualmente la aplicación tiene una licencia global singleton en public.app_license. El proxy, el heartbeat de licencia y varios bloqueos de base de datos usan ese estado global. El diseño existente de agosto describe el comportamiento desplegado hasta hoy.

Esta especificación reemplazará ese comportamiento comercial global cuando se implemente. La licencia vigente actual será la fecha inicial de cada negocio que esté activo en el momento de la migración. No se cambiará ni borrará información de ventas, pedidos, inventario, caja o personal.

La licencia de negocio y el estado operativo del negocio son conceptos separados:

- Pausar, archivar o retirar un negocio seguirá siendo una decisión de ciclo de vida del negocio.
- Vencer o suspender una licencia será una decisión de acceso.
- Pausar un negocio no congela ni extiende su vigencia.

El mecanismo global que pueda necesitar el equipo técnico para una emergencia quedará separado de las licencias comerciales. No tendrá vencimiento de pago automático ni se mostrará como una licencia adicional de los locales.

## Reglas de producto aprobadas

### Estados y vigencia

- Un negocio nuevo permanece como borrador y no puede vender ni recibir pedidos.
- Rincón 404 asigna la vigencia al activar el negocio. El periodo empieza en la fecha de activación.
- Cada negocio que ya esté activo recibe como fecha inicial la fecha de vencimiento global actual.
- La fecha de vencimiento es inclusiva hasta el final del día local del negocio, usando su zona horaria configurada.
- Una licencia activa dentro de los últimos siete días de vigencia se identifica como “Por vencer” en el panel de licencias. No se envían recordatorios automáticos por correo, WhatsApp, SMS o push.
- Si la fecha pasó, la licencia se considera vencida automáticamente.
- La suspensión manual es inmediata y diferente del vencimiento. La suspensión no detiene el paso del tiempo.
- Reactivar una licencia suspendida restaura el acceso sólo si todavía está dentro de su vigencia. Si venció, primero se debe asignar una nueva fecha.

“Vigente”, “Por vencer” y “Vencida” se derivan de la fecha y la zona horaria. “Suspendida” es un estado manual. El ciclo de vida del negocio no se reutiliza para representar el estado de licencia.

### Renovación

El panel ofrecerá extensiones rápidas de 1, 3, 6 y 12 meses, más la opción de elegir una fecha concreta.

- Si se renueva antes del vencimiento, el periodo se suma a la fecha de vencimiento vigente.
- Si se renueva después del vencimiento, el nuevo periodo comienza el día de la renovación.
- Los periodos son meses calendario. Si el día correspondiente no existe en el mes de destino, se usa el último día de ese mes.
- El panel no solicita ni calcula importes.

### Acceso del negocio vencido o suspendido

El dueño o empleado cuya cuenta esté limitada a ese negocio conserva la posibilidad de autenticarse, pero no entra en las áreas operativas ni consulta información en modo de sólo lectura. En su lugar ve una pantalla de acceso bloqueado, con la marca y el nombre del negocio, el estado y la acción de contactar a Rincón 404. La pantalla permite cerrar sesión y volver a comprobar el acceso, pero no expone rutas administrativas ni detalles técnicos.

Una mesera global no pierde acceso a los demás negocios vigentes por el vencimiento de uno. Sólo se filtra el negocio vencido y se rechazan las operaciones que intenten afectarlo.

Texto propuesto para licencia vencida:

> La licencia de [negocio] está vencida. Contacta a Rincón 404 para liquidar los pagos pendientes y recuperar el acceso.

El texto no muestra una cantidad, desglose o saldo. Para una suspensión manual se muestra un aviso diferente que indica que el acceso está suspendido y que se contacte a Rincón 404.

Las cuentas de plataforma conservan acceso al panel de administración de licencias aunque un negocio esté vencido. El bloqueo de un negocio nunca debe impedir que Rincón 404 lo renueve.

### Meseras globales y comandas mixtas

- El selector de mesera global muestra las opciones de negocio a las que esa persona tiene acceso por sus permisos. Las opciones sin licencia vigente siguen visibles, pero atenuadas y no se pueden seleccionar; no se cargan sus categorías ni productos.
- La mesera global no ve pantallas, fechas, etiquetas ni mensajes que revelen la licencia o la causa comercial del bloqueo. El menú deshabilitado usa un estado neutral, por ejemplo “No disponible”.
- Los negocios para los que la mesera no tiene asignación o permiso no aparecen, independientemente de su licencia.
- La restricción también se aplica en servidor y base de datos. Ocultar una opción en la interfaz no constituye autorización.
- Cada producto de una comanda mixta conserva su negocio. Al enviar, el servidor comprueba la licencia de cada negocio.
- Si una licencia vence después de agregar productos al carrito, se identifican claramente las líneas afectadas. No se eliminan en silencio.
- La mesera puede retirar o confirmar la exclusión de las líneas del negocio vencido y continuar con los negocios vigentes. El pedido de un negocio vigente no debe rechazarse sólo porque otro negocio de la comanda venció.
- No se crea ni cobra una orden para un negocio vencido.

### WhatsApp de Mideli

Si vence o se suspende la licencia de Mideli, WhatsApp no responde mensajes entrantes, no crea pedidos y no inicia una atención humana. El webhook debe confirmar técnicamente la recepción al proveedor para evitar reintentos, pero no envía mensajes salientes ni revela el motivo de licencia al cliente. La información existente no se borra.

WhatsApp sigue siendo exclusivo de Mideli. La licencia de otros negocios no cambia el comportamiento del canal.

## Panel de licencias

### Ubicación y acceso

El panel será una sección identificable como “Licencias” dentro de la administración de plataforma de Rincón 404, separada de los módulos de los restaurantes y del editor de cada negocio.

La autorización será una capacidad dedicada que sólo se asigna a la cuenta rincon404. Tener rol de dueño de negocio, administrador local o permiso general para administrar negocios no concede por sí solo permiso para modificar licencias. La autorización se valida en servidor en cada lectura y acción.

### Resumen y listado

La cabecera explica que el panel controla vigencias por negocio y que no calcula saldos. Muestra contadores de:

- Vigentes
- Por vencer en los próximos siete días
- Vencidas
- Suspendidas
- Borradores sin activar

Cada negocio muestra nombre y logo, estado, fecha de vencimiento y días restantes cuando corresponda. En escritorio puede usarse una tabla; en móvil y tablet, tarjetas con las mismas acciones disponibles y objetivos táctiles cómodos. Los estados siempre incluyen texto e icono, no sólo color.

Filtros: todos, vigentes, por vencer, vencidos, suspendidos y borradores. La búsqueda permite encontrar un negocio por nombre.

Acciones por negocio:

- Activar y fijar primera vigencia para un borrador.
- Renovar por 1, 3, 6 o 12 meses.
- Elegir o corregir una fecha manualmente.
- Suspender ahora.
- Reactivar cuando la vigencia siga vigente.
- Consultar historial de cambios.

Las acciones de suspensión, cambio manual de fecha y reactivación muestran confirmación clara. Si se cambia una fecha, el resumen de resultado indica la fecha anterior y la nueva.

### Historial visible

La cuenta rincon404 puede consultar un historial por negocio que registra quién hizo qué cambio, cuándo y las fechas anteriores y nuevas. Puede incluir una nota opcional para explicar una corrección o suspensión.

El historial no contiene montos, referencias de pago, saldos ni datos de tarjetas. Los eventos son de sólo lectura y no se eliminan desde el panel.

### Dirección visual

El panel forma parte de la consola de Rincón 404 y conserva el sistema visual oscuro ya aprobado, con capas legibles, estados semánticos y controles táctiles adecuados. La densidad visual prioriza comparar locales y actuar rápido; en móvil las acciones secundarias pueden agruparse, pero renovar, suspender y revisar el estado deben ser fáciles de encontrar.

La alerta de siete días aparece sólo dentro del panel de licencias. No modifica el acceso del negocio y no genera notificaciones externas.

## Requisitos de arquitectura y seguridad

### Fuente de verdad por negocio

Se implementará un registro de licencia asociado uno a uno a cada negocio, más un historial append-only de eventos. Los nombres finales de tablas, columnas y funciones se fijarán en la planificación técnica después de revisar todos los consumidores actuales.

El modelo lógico necesita representar:

- Negocio asociado.
- Fecha de vencimiento inclusiva en la zona horaria del negocio.
- Estado de suspensión manual, si aplica.
- Fecha y actor de activación y de la última modificación.
- Historial inmutable de activación, renovación, cambio de fecha, suspensión y reactivación.
- Nota opcional asociada a cambios administrativos.

No se guardan importes, saldos, pagos parciales ni facturas.

### Validación de acceso

La aplicación debe comprobar licencia por negocio en:

- Proxy y navegación, para redirigir al aviso correcto.
- Server Actions, Route Handlers, RPCs y procesos programados que creen o modifiquen operaciones.
- Políticas y funciones de base de datos que protegen pedidos, cocina, cobros, caja, menú, inventario, personal, mesas, analíticas y demás datos privados del local.
- Storage y cualquier recurso asociado a un negocio.
- Consultas del selector global de menús.
- Webhook y acciones operativas de WhatsApp de Mideli.

Las tablas hijas que no tienen business_id propio se deben comprobar a través de su fila padre. No se agregan columnas redundantes sin necesidad.

El control debe identificar el negocio real afectado por cada fila. Los triggers globales de nivel sentencia de la licencia actual no bastan para tomar decisiones por negocio. La implementación debe usar validación por fila o RPCs transaccionales equivalentes, según el flujo existente, y debe cubrir INSERT, UPDATE y DELETE donde corresponda.

Una sesión ya abierta limitada exclusivamente al negocio afectado debe perder acceso operativo al vencer o suspenderse la licencia. Una sesión de mesera global conserva el acceso a los otros negocios vigentes. Realtime y/o comprobación periódica pueden actualizar la interfaz; cada escritura vuelve a validar en servidor para no depender del navegador.

Un fallo técnico al consultar la licencia no se presenta como “pago pendiente” ni se registra como vencimiento. La interfaz muestra un error temporal de verificación. Mientras el servidor no pueda confirmar que la licencia permite una operación, no acepta nuevas escrituras de ese negocio; al restablecerse la consulta, el flujo puede reintentarse. Así no se confunde una falla técnica con deuda ni se permite una operación sin autorización comprobada.

### Control de emergencia global

La licencia comercial global deja de bloquear a los negocios por vencimiento. Se conserva por separado un control global de suspensión técnica explícita para emergencias; no se renueva por meses, no se presenta a los dueños y no sustituye los controles individuales de licencia. Su ruta y autorización técnicas permanecen separadas de la administración cotidiana de los locales. La fecha global anterior no se convierte en un segundo vencimiento comercial.

## Transición y despliegue

No se modifica una migración ya aplicada. La implementación se hace mediante nuevas migraciones y cambios de código compatibles y revisables.

Secuencia obligatoria:

1. Inventariar cada lectura de app_license, redirect, heartbeat, trigger, política RLS, Storage policy, RPC, acción, webhook y tarea programada.
2. Crear el modelo de licencias por negocio y su auditoría sin retirar todavía la protección existente.
3. Consultar los negocios realmente activos al momento de aplicar el cambio y copiarles la fecha global vigente. No confiar en una lista de negocios histórica o escrita en esta especificación.
4. Comparar el número de negocios, fechas y estados antes de cambiar el guardado. Si la licencia global está suspendida por una emergencia técnica, conservar y revisar ese estado por separado, no reactivar locales de forma implícita.
5. Cambiar los accesos de lectura y escritura para comprobar el negocio dueño de cada operación, incluidos datos heredados de tablas padre.
6. Retirar el vencimiento global como regla comercial sólo después de verificar que todas las rutas operativas están protegidas por negocio.
7. Revisar el dry-run de migración y ejecutar pruebas SQL transaccionales antes de aplicar cambios remotos.
8. Desplegar y probar con un negocio sin actividad de clientes. No cambiar la fecha de un local que esté operando para simular vencimiento.
9. Verificar salud, inicio de sesión, POS, estado de pedidos, caja, inventario, histórico, selector de meseras globales y WhatsApp según el estado de licencia.

No se borra ni renumera ningún pedido, ticket, movimiento, turno, cuenta, producto, usuario o conversación como parte de la transición.

## Criterios de aceptación

1. Sólo rincon404 puede ver y modificar el panel de licencias.
2. Cada negocio conserva una fecha independiente después de la transición.
3. Los negocios activos reciben la fecha global actual sin pérdida de datos.
4. Un borrador no vende ni recibe pedidos; su vigencia inicia al activarlo.
5. Los días restantes se calculan según la zona horaria del negocio y la fecha vence al final de ese día.
6. Pausar el negocio no detiene la vigencia.
7. El panel marca “Por vencer” durante los siete días previos, sin enviar notificaciones ni bloquear antes de vencer.
8. Al vencer, las cuentas limitadas a ese negocio ven sólo el aviso; no pueden consultar módulos operativos o históricos. Las meseras globales conservan acceso a otros negocios vigentes.
9. Un negocio vencido no acepta escrituras aun llamando directamente a rutas, RPCs o Supabase.
10. Las meseras globales ven las opciones de negocio permitidas por su rol; las que no tienen licencia vigente aparecen deshabilitadas y no seleccionables, sin exponer licencia, fecha, deuda o causa comercial, y sin cargar su catálogo.
11. Una comanda mixta conserva los productos de locales vigentes y bloquea con confirmación sólo las líneas del local vencido.
12. WhatsApp de Mideli no contesta ni crea pedidos con una licencia no vigente, pero evita reintentos del proveedor y conserva los datos existentes.
13. Las extensiones previas al vencimiento se suman a la fecha vigente; las posteriores parten de la fecha de renovación.
14. Suspender bloquea al instante, y reactivar no otorga tiempo adicional ni reactiva una fecha ya vencida.
15. Cada cambio de licencia queda auditado y el historial no se puede alterar desde la interfaz.
16. Un fallo técnico de verificación no se confunde con una licencia vencida.
17. Vencer o suspender un negocio no interrumpe a otros negocios al corriente.
18. La migración tiene dry-run revisado y la interfaz pasa lint, build y pruebas del flujo crítico.

## Fuera de alcance

- Cálculo de deuda, saldo, pagos parciales, facturas o contabilidad.
- Cobros automáticos o integración con un proveedor de pagos para esta licencia.
- Avisos automáticos por correo, SMS, push o WhatsApp antes del vencimiento.
- Cambiar la licencia comercial de un negocio desde el perfil de su dueño.
- Alterar el flujo de pedidos, el cobro, caja o permisos más allá de aplicar el guardado por negocio.
- Eliminar información histórica durante activación, vencimiento o renovación.

## Revisión antes de implementación

Esta especificación refleja las decisiones aprobadas en conversación, incluida la decisión de no responder WhatsApp cuando la licencia de Mideli no esté vigente. Antes de escribir código o SQL, se debe revisar este documento con el usuario y luego preparar un plan de implementación por fases. La implementación requiere una migración nueva, comprobación dry-run, auditoría completa de las rutas de acceso y verificación en producción; no queda autorizada sólo por la aprobación de este diseño.
