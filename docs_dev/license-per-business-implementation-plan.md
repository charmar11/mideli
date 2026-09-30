# Plan técnico: licencias independientes por negocio

Fecha: 2026-09-27

Estado: plan para revisión; no implementado. No aplicar SQL ni desplegar como parte de este documento.

## Objetivo y límites

Reemplazar el vencimiento comercial global por vigencias independientes para los negocios de Rincón 404, conservando un control técnico global de emergencia separado. La cuenta rincon404 es la única que administra las licencias de los locales.

Las cuentas limitadas a un negocio vencido podrán autenticarse, pero sólo verán el aviso de pagos pendientes. No tendrán módulos operativos ni historial de sólo lectura. Meseras globales no verán referencias, fechas ni mensajes sobre licencias: las opciones de sus negocios asignados seguirán visibles en el selector; las no disponibles aparecerán atenuadas, con una etiqueta neutral y no seleccionables. No se consultará ni mostrará su catálogo de categorías o productos. Los negocios fuera de sus permisos no se mostrarán.

No se calculan saldos ni se procesa un pago. El plan prepara fases para revisión; no autoriza implementación, cambios remotos ni deploy.

## Hechos locales que afectan el diseño

- public.app_license es singleton; valid_until es timestamptz y se evalúa contra now().
- El cálculo de renovación existente usa fin del día de America/Hermosillo y meses calendario.
- El proxy aplica el mismo registro global a /dashboard, /menu y /settings.
- LicenseHeartbeat lee el mismo registro global desde el navegador, por sondeo y Realtime.
- La lectura de licencia no confirmada se representa hoy como isActive=true en src/lib/license-server.ts. La nueva validación no podrá tratar indisponibilidad como autorización.
- La migración de licencia instala triggers globales FOR EACH STATEMENT sobre tablas de pedidos, cocina, catálogo, inventario, caja, cobros, perfiles y otras; además incluye reglas restrictivas de Storage para imágenes.
- src/components/pos/business-menu-selector.tsx hoy sólo deshabilita negocios pausados. src/lib/multibusiness/business-context-selection.ts y business-context-store.ts resuelven qué negocio se puede seleccionar, sin licencia.
- Existen RPCs de pedido por negocio y de comanda multinegocio. La comanda de comedor crea un batch y órdenes por negocio dentro de una transacción, por lo que un rechazo a mitad no debe producir órdenes parciales.
- WhatsApp entra por el webhook Meta, pasa por meta-runtime.server.ts y también tiene scheduler para pedidos programados y conversaciones inactivas.
- El worktree tiene cambios previos ajenos a esta especificación. En una futura implementación se debe verificar git status y aislar los cambios; no limpiar ni revertir trabajo existente.

## Secuencia propuesta

### Fase 0: preflight protegido

1. Leer el estado del repositorio, las instrucciones, la especificación aprobada y las migraciones actuales.
2. No usar una fecha de vencimiento modificada en producción para probar. No ejecutar resets, escrituras directas, despliegues ni aplicar migraciones.
3. En el inicio de implementación, hacer consultas remotas sólo de lectura para confirmar:
   - UID y membresías reales de la cuenta rincon404, sin autorizar por el nombre visible del usuario.
   - negocios y lifecycle_status reales.
   - estado y fecha exactos de app_license, más sus últimos eventos administrativos pertinentes.
   - migraciones aplicadas y políticas/triggers desplegados.
4. Si el estado global actual es suspended, detener el corte y confirmar si representa una suspensión técnica que debe seguir globalmente activa. No liberar negocios por efecto de una migración.
5. Guardar la salida de la inspección sin credenciales, datos personales o valores secretos.

**Puerta de salida:** tabla de correspondencia revisada de negocio, estado actual y fecha inicial que recibiría; ninguna escritura ejecutada.

### Fase 1: inventario completo de enforcement

Construir un inventario verificable con objeto, tipo de acceso, negocio directo/heredado, consumidor y nuevo guard necesario. Incluir:

1. Aplicación: proxy, LicenseHeartbeat, pantalla bloqueada, login, ruta y Server Actions.
2. Base de datos: lista exacta de triggers de licencia, tablas enumeradas en la migración, RLS, RPCs SECURITY DEFINER, vistas, permisos EXECUTE y funciones que usan service role.
3. Datos hijos: relación al padre para líneas de conteo/compra/recibo, order_items, pagos, caja, cuentas de mesa, batches, impresiones, notificaciones y auditorías. No añadir business_id redundante.
4. Storage: reglas de insert/update/delete y estructura de rutas de archivos.
5. Procesos no interactivos: cron, scheduler, webhook Meta, pedidos programados, notificaciones de cocina, cierres conversacionales y reintentos.
6. Roles: dueño/empleado local, mesera global, coordinador/plataforma y soporte técnico de emergencia.
7. Operaciones sensibles: crear/editar/cancelar pedidos, transicionar estados, cobro parcial/total, abrir/cerrar caja, movimientos, inventario, menú, personal y configuración.

Clasificar cada tabla como negocio-scoped, organización-scoped, usuario-global o plataforma. Resolver explícitamente objetos sin business_id antes de crear triggers nuevos. No aplicar un guard por negocio a perfiles globales o estructuras de plataforma sin definir la relación correcta.

**Puerta de salida:** ningún consumidor de app_license sin dueño; cada ruta de escritura se asocia a su negocio o queda documentada como excepción.

### Fase 2: modelo y administración de licencias

1. Añadir por migración nueva un registro uno-a-uno por negocio con fecha de vencimiento como fecha local, estado de suspensión manual y auditoría temporal/de actor. El nombre físico y constraints se fijan tras la Fase 1.
2. Añadir historial append-only de activación, renovación, cambio manual de fecha, suspensión y reactivación. Guardar actor, instante, estado/fecha anterior y nueva, y nota opcional; no guardar importes, pagos, referencias ni saldos.
3. Habilitar RLS y revocar acceso público y directo de anon/authenticated a las tablas privadas. Sólo acciones de servidor autorizadas y funciones privadas mínimas las consultan.
4. Crear capacidad dedicada de administrar licencias y asignarla exclusivamente a la UID confirmada de rincon404. El nombre de usuario, rol owner y platform.manage_businesses por sí solos no autorizan renovar licencias.
5. Integrar la sección Licencias a la consola de plataforma ya existente. Lista adaptable con filtros, vigentes, por vencer en siete días, vencidas, suspendidas y borradores; acciones y confirmaciones; historial por negocio.
6. Al crear un negocio se deja sin vigencia y bloqueado como borrador. Activar requiere que rincon404 establezca fecha. Archivar o pausar no borra ni detiene la licencia.
7. Convertir la ruta de control privada existente para que no siga ofreciendo renovación comercial global. Si se conserva el singleton, queda sólo como interruptor técnico de emergencia, en superficie y credencial separadas.

**Puerta de salida:** las acciones se prueban con rincon404 permitido y con dueños, empleados y otros gestores rechazados; el historial no acepta edición/eliminación desde cliente.

### Fase 3: backfill compatible

1. Crear las tablas y funciones de forma aditiva, sin editar migraciones aplicadas y sin retirar aún la protección global actual.
2. Para cada negocio operativo existente, copiar la fecha global actual a su licencia. Convertir el instante usando la zona horaria efectiva del negocio y comprobar que conserva exactamente el último día que hoy permite operar.
3. Conservar drafts sin licencia habilitada. Los negocios pausados existentes se incluyen en la matriz de backfill porque la regla aprobada dice que pausar no detiene el reloj; se les copia la misma fecha sólo si pertenecían al conjunto ya provisionado, sin concederles vigencia nueva.
4. Si la licencia global actual está expirada, todas las fechas copiadas mantienen ese vencimiento; la cuenta rincon404 tendrá que renovar individualmente.
5. Si el estado global aparece suspendido, no traducirlo silenciosamente a renovaciones ni reactivaciones. Mantener el bloqueo seguro y detener el corte hasta clasificar el estado.
6. Ejecutar vista previa que reporte conteos y fechas anteriores/nuevas; comparar filas y zonas horarias antes de confirmar aplicación.

**Puerta de salida:** equivalencia del comportamiento previo documentada para cada negocio y aceptación explícita de cualquier estado global suspendido o inconsistente.

### Fase 4: disponibilidad de negocio y UX

1. Crear un helper server-only que responda vigente, no disponible o verificación temporalmente fallida, y use la zona horaria del negocio. No enviar fechas ni estado de licencia al cliente global de meseras.
2. Actualizar el contexto multinegocio con sólo un booleano de disponibilidad operativa para cada negocio al que la persona ya tiene acceso, o usar una consulta dedicada al POS si la función compartida expone demasiado.
3. El selector global conserva las opciones de negocio autorizadas:
   - vigente: seleccionable.
   - licencia vencida/suspendida/no activada: sólo la opción de negocio visible, neutral, disabled, texto “No disponible”, sin cargar catálogo ni exponer causa, importe o fecha.
   - pausado/archivado: conserva su estado lifecycle, por separado de disponibilidad por licencia.
   - fuera de los permisos del usuario: no aparece.
4. No aceptar un ID seleccionado desde localStorage/cookie sólo porque estaba seleccionado antes. Validar permiso, lifecycle y licencia en cada selección/carga del menú y en servidor.
5. Si licencia vence con productos en la comanda, preservar el carrito y marcar sólo esas líneas como no disponibles. Pedir confirmación para quitarlas; continuar con el resto. Nunca borrar líneas sin aviso.
6. Como create_multibusiness_table_orders es transaccional, la RPC valida todas las líneas antes de crear batch, visita, cuentas u órdenes. Una carrera entre preflight y submit devuelve error estructurado sin escrituras; la UI actualiza disponibilidad y vuelve a pedir confirmación para excluir líneas.
7. El personal limitado a un negocio vencido conserva login, pero todas las rutas muestran únicamente aviso personalizado del local, cerrar sesión y comprobar acceso. rincon404 conserva la consola de licencias.
8. La pantalla de bloqueo no revela rutas privadas, lógica interna ni una cantidad de deuda.

**Puerta de salida:** pruebas E2E confirman que la mesera global puede operar en un local vigente, no seleccionar el vencido y no ver información de licencia.

### Fase 5: enforcement de servidor, RLS y base de datos

1. Mantener el control de emergencia separado y no basado en fecha comercial.
2. Añadir una función privada para validar que una operación del usuario afecta un negocio vigente; el acceso a funciones privilegiadas debe verificar auth.uid(), membresía/capacidad y negocio. search_path explícito, permisos EXECUTE mínimos y sin exponer SECURITY DEFINER en una API pública sin validación.
3. Reemplazar los triggers statement-level de licencia comercial por enforcement consciente del negocio. Para tabla directa, comprobar business_id. Para tabla hija, derivar business_id de padre. Para operación con varias filas, validar todos los negocios afectados.
4. Reforzar lecturas con RLS para que los usuarios de un negocio vencido no consulten historial, menú, personal o datos financieros por API directa, no sólo por rutas Next.js.
5. Reforzar INSERT/UPDATE/DELETE y todas las RPCs:
   - pedido individual, batch/comanda mixta, edición, cancelación y estado.
   - cocina, cobro, allocations, tender, cuentas por mesa, caja, cortes y movimientos.
   - menú, inventario, compras, conteos, recetas, personal, mesas, impresiones y push.
   - rutas de servidor que usan service role, ya que service role evita RLS y debe validar explícitamente.
6. Proteger Storage por negocio sin permitir que una licencia de un local bloquee imágenes de otros; mantener autorización de dueño/administración además de licencia.
7. No permitir que un UPDATE mueva una fila de un negocio vigente a uno vencido para evadir la validación. Validar negocio anterior y nuevo.
8. Para negocio no verificable por fallo de red/DB, no mostrar “pagos pendientes”. Bloquear escrituras de ese negocio hasta confirmar acceso y ofrecer reintento.

**Puerta de salida:** pruebas directas de RLS/RPC y de acciones server-side rechazan negocio vencido y permiten otro vigente, sin depender de la UI.

### Fase 6: WhatsApp y trabajos programados

1. Tras validar firma de Meta, consultar la disponibilidad de la licencia de Mideli antes de procesar efectos. Si está vencida/suspendida, el webhook confirma recepción técnica para que Meta no reintente, pero no genera respuesta saliente, pedido, atención humana, cotización, cambio de estado ni aviso al cliente.
2. No encolar mensajes para responder automáticamente cuando la licencia vuelva. Los mensajes entrantes del periodo bloqueado no deben convertirse en pedidos al renovar.
3. El scheduler omite envíos, recordatorios, cierres de conversación y liberación de pedidos de WhatsApp cuando Mideli no esté vigente.
4. Al reactivar, los pedidos programados cuyo momento de liberación ya pasó quedan para revisión humana; los que aún son futuros pueden continuar según su fecha. No enviar mensajes retroactivos al cliente.
5. Conservar órdenes, conversaciones y registros previos; el gate no limpia datos.
6. No modificar WhatsApp de otros negocios, ya que continúa siendo exclusivo de Mideli.

**Puerta de salida:** pruebas del webhook firmado confirman cero mensajes/pedidos y respuesta HTTP de aceptación al proveedor; las tareas no procesan trabajos vencidos ni los liberan en masa al reactivar.

### Fase 7: rollout, verificación y reversión

1. Usar una secuencia expand/verify/switch: objetos y backfill aditivos; desplegar aplicación que entiende licencias locales; verificar; cambiar guards a la fuente por negocio; retirar sólo después la regla de fecha comercial global.
2. No asumir orden entre deploy web y migración. Definir compatibilidad explícita con el build previo y PWA/cache; conservar tablas y funciones antiguas durante la ventana de transición.
3. Antes de switch, probar con usuario rincon404 y cuentas de prueba autorizadas, sin tocar la vigencia de un local que atiende clientes.
4. Verificar health, login, Mesero, selector global, carrito mixto, Cocina/Estado, cobros, caja, inventario, historial, licencia vencida, renovación, WhatsApp y sesiones ya abiertas.
5. Ejecutar npm run lint y npm run build. Correr pruebas de migración SQL en transacción reversible donde aplique y npx supabase db push --linked --dry-run. No correr db reset --linked.
6. Revisar RLS y advisors de Supabase antes de aplicar; luego de la aplicación, verificar migraciones, registros de licencias y comportamiento remoto con consultas de sólo lectura.
7. Si el nuevo acceso falla, volver a la versión web compatible y conservar el nuevo esquema. Nunca borrar licencias, auditoría ni datos operativos como rollback.
8. No desplegar a producción si cualquier escritura directa puede eludir la licencia o si el vencimiento de un negocio afecta a otro.

## Casos de prueba mínimos

| Usuario / estado | Resultado esperado |
|---|---|
| rincon404 | Administra fecha y suspensión de todos los locales desde la consola; conserva acceso aunque un local esté bloqueado. |
| Dueño/empleado de negocio vigente | Opera sólo sus módulos permitidos. |
| Dueño/empleado de negocio vencido o suspendido | Puede autenticarse; ve sólo el aviso de ese local; no consulta datos ni ejecuta escrituras. |
| Mesera global con dos negocios vigentes | Ve ambos menús y puede operar según sus permisos. |
| Mesera global con un local vencido | Ve la opción de negocio disabled “No disponible”, no obtiene categorías/productos ni ve licencia/fecha/deuda; opera los demás vigentes. |
| Usuario sin membresía de un local | El menú no aparece, aunque la licencia de ese local esté vigente. |
| Carrito mixto con una licencia que vence antes de enviar | Sin escrituras parciales; identifica líneas y solicita confirmación para excluirlas; el resto puede enviarse. |
| Suspensión durante sesión abierta | La cuenta local queda bloqueada; los otros negocios de la mesera global siguen disponibles. |
| Error transitorio al consultar licencia | No se muestra deuda; no se aceptan nuevas escrituras hasta verificar; hay reintento. |
| WhatsApp de Mideli no vigente | Meta obtiene aceptación técnica, no hay respuesta de bot/persona, pedidos o tareas salientes. |
| WhatsApp se renueva con programados atrasados | No hay envío tardío automático; atrasados requieren revisión y futuros conservan su programación. |

## Riesgos de operación que deben revisarse antes de la fecha de corte

- Vencer una licencia con caja abierta, cuenta de mesa pendiente, pedido en preparación o devolución pendiente bloqueará sus operaciones, incluido el cierre/cobro, si se mantiene la regla de “sólo aviso”. Por eso el checklist de corte debe revisar caja y pedidos sin resolver. No agregar un modo de cierre de emergencia sin nueva aprobación.
- Los últimos siete días se resaltan a rincon404 en su panel, pero no se ha aprobado un recordatorio al dueño local.
- El bloqueo total de WhatsApp implica que un cliente que escriba durante la suspensión no recibe respuesta y su mensaje no se retoma automáticamente después.
- El estado suspendido actual de app_license no expresa si la suspensión fue comercial o técnica. Debe clasificarse antes del switch.
- La lista de negocios y la fecha de producción no se han consultado en esta fase; no inventar valores en backfill o pruebas.

## Decisiones técnicas que se concretan sólo después del inventario

- Nombres y constraints definitivos de tablas, estados y RPC.
- Mapa tabla/triggers/RLS por ámbito y lista completa de operaciones con service role.
- Tratamiento de vistas y tablas globales cuyo acceso depende de un negocio.
- Account/UID y capacidad exacta de rincon404.
- Compatibilidad temporal de app_license y control de emergencia con Vercel/PWA.
- Momento y procedimiento para quitar triggers comerciales globales.
- Comportamiento exacto de Meta para eventos duplicados y statuses mientras la licencia está bloqueada.
- Política de cutover si existen sesiones de caja o pedidos abiertos.

## Recomendación de ejecución

Implementar en PRs pequeños o lotes revisables por fase. El orden tiene que priorizar modelar y verificar la licencia por negocio antes de cambiar la autorización de escrituras. Usar migraciones nuevas; no borrar ni editar las aplicadas. Mantener un check de salida por fase y detener el despliegue si una propiedad de seguridad no está probada.
