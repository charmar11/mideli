# Hallazgos de diseño: Rincón 404 Food Park y negocios independientes

## Contexto actual verificado

### Auditoría de preparación del 2026-09-19

La revisión del código y las migraciones confirmó que la aplicación sigue
siendo de un solo negocio. No existe todavía una frontera de negocio en las
tablas operativas ni en las membresías. La matriz detallada, la evidencia y el
orden recomendado están en `11-auditoria-de-preparacion.md`.

Los bloqueantes principales son:

- catálogo y pedidos sin `business_id`;
- roles globales en `profiles` y acciones de servidor;
- caja abierta global y folio global;
- funciones de inventario, pagos y caja que todavía no pueden validar negocio;
- RLS histórica que autoriza por rol y no por membresía;
- configuraciones singleton de reporte, impresión y WhatsApp que deben
  clasificarse antes del backfill.

La siguiente rebanada debe ser una fundación aditiva en staging. No se deben
crear datos de Just Dipping ni cambiar el comportamiento de Mideli durante esa
rebanada.

- `.opencode/plans/mideli-context.md` describe actualmente a Mideli como un sistema para un solo local de comida.
- El sistema ya tiene autenticación y roles operativos como owner, admin, supervisor, waiter y kitchen.
- El menú existente usa categorías, productos, variaciones y opciones editables.
- El inventario existente incluye insumos, recetas, existencias, compras, conteos, mermas y movimientos.
- El POS, Cocina, WhatsApp, caja, historial y analíticas comparten el mismo contexto operativo actual.
- La base de datos actual no tiene todavía una entidad de negocio que separe estos recursos por local.

## Lenguaje aprobado

- Organización o sede: Rincón 404 Food Park.
- Negocios confirmados por el usuario: Mideli y Just Dipping.
- Evitar usar “Juis Dipping”, “Mi Deli” o inventar nombres de otros negocios cuando se hable de los nombres oficiales confirmados. El nombre confirmado es `Mideli`.
- “Administrador de Rincón 404 Food Park” y “dueño del negocio” deben ser permisos distintos en la futura especificación.

## Principio central

Rincón 404 Food Park debe ser el contexto superior y cada negocio debe ser el límite de propiedad. El personal compartido puede tener acceso a varios negocios mediante asignaciones explícitas; el dueño de un negocio solo debe operar dentro de los negocios que administra.

## Preguntas de producto pendientes

El cuestionario maestro vive en `cuestionario-descubrimiento.md`. Los bloques que primero deben resolverse son:

1. Propiedad de mesas y operación de la mesera con pedidos de varios negocios.
2. Separación del pedido, preparación, entrega, cobro, caja y devoluciones.
3. Estaciones de cocina, impresión y dispositivos que utiliza cada negocio.
4. Visibilidad permitida para el administrador de plataforma y para personal compartido.
5. Alcance autorizado de la migración del sistema anterior de Just Dipping.

## Huecos técnicos verificados

### Datos y propiedad

- `profiles` tiene un solo rol global por usuario; no existe una membresía que permita que una persona tenga permisos distintos en varios negocios.
- `categories`, `menu_items`, `inventory_items`, `inventory_recipes`, `orders`, `cash_shifts`, `cash_movements`, reportes y estaciones no tienen todavía una frontera de negocio.
- Las políticas RLS actuales autorizan principalmente por rol global. Filtrar por negocio solo en React no sería suficiente para separar datos.
- `restaurant_tables` y `table_zones` parecen representar el plano físico de Rincón 404 Food Park y no deberían duplicarse automáticamente por cada negocio.
- `orders` tiene actualmente una sola orden con sus líneas. El diseño aprobado deberá sustituir esa limitación por un servicio compartido con una orden hija por negocio, porque una mesa sí podrá pedir artículos de varios negocios.
- Los movimientos automáticos de inventario dependen de la relación global entre línea de pedido, producto, receta e insumo; esa cadena tendrá que validar que todos pertenezcan al mismo negocio.
- El historial y los reportes actuales consultan tablas globales y deberán conservar el historial de Mideli durante la migración.

### WhatsApp de Mideli

- El webhook de Meta usa una sola configuración privada de servidor (`META_WHATSAPP_PHONE_NUMBER_ID`, WABA y token).
- `whatsapp_channel_settings` usa una fila fija (`id = 1`) para recepción, bot, horarios, domicilio, tarifas y mensajes.
- `loadWhatsappCatalog()` carga el catálogo actual de `menu_items` sin resolver un negocio o canal.
- `customers`, `customer_addresses`, `channel_conversations` y `channel_messages` son datos del canal actual y no tienen `business_id`.
- La conversación abierta se identifica por proveedor y teléfono externo, no por negocio o número de WhatsApp.
- Los pedidos de WhatsApp sí conservan `source_channel` y `channel_conversation_id`, pero todavía no conservan el negocio dueño de cada pedido o línea.

Conclusión: WhatsApp está integrado con el sistema y no conviene duplicarlo. En la primera migración debe seguir siendo el canal de Mideli, con todos sus datos asignados explícitamente a Mideli. La plataforma futura debe introducir una abstracción de canal asignable a un negocio antes de permitir que Just Dipping u otro negocio use WhatsApp.

### Alternativas para WhatsApp

1. Mantener el número actual exclusivo de Mideli. Es el camino de menor riesgo y permite construir la base multi-negocio sin alterar el piloto actual.
2. Usar un número único de Rincón 404 Food Park y pedir al cliente que elija negocio. Requiere contexto de negocio dentro de cada conversación, catálogo por negocio, reglas de disponibilidad y una política clara para pedidos mixtos.
3. Usar un número de Meta por negocio. Es la opción más aislada y escalable para operación independiente, pero requiere configurar cada número, webhook/canal, plantillas, horarios y credenciales.

Recomendación provisional: opción 1 durante la migración; diseñar el modelo para que después soporte las opciones 2 o 3 sin reescribir el motor conversacional.

## Auditoría pública del sistema anterior de Just Dipping

Se revisó `https://just-dipping.web.app/` en modo lectura, sin crear pedidos, guardar configuración, editar tickets ni eliminar datos.

### Hechos observados

- La aplicación se identifica como `Just Dipping POS` y usa conexiones en tiempo real con Firebase/Firestore.
- El POS, el catálogo, el historial y buena parte de Administración se pueden abrir sin un login visible.
- Administración muestra controles para categorías, productos, extras y configuración de entrega. Historial muestra tickets y controles visibles para reimpresión, edición y eliminación.
- Estadísticas sí presenta una solicitud de PIN. La protección es inconsistente porque otras áreas sensibles ya muestran información y acciones antes de pedir autenticación.
- La sesión pública abrió canales `Firestore/Listen`. Esto confirma lectura o escucha desde el navegador, pero no demuestra por sí solo que las escrituras estén permitidas; las reglas de Firebase deben auditarse por separado.
- El catálogo público muestra `Extras` dos veces en la navegación, aunque la vista administrativa observada presenta una sola categoría con ese nombre. Debe tratarse como posible duplicación de agregación, identificadores o datos derivados.
- Los productos soportan modificadores opcionales con recargo. Ese modelo debe mapearse a los grupos y opciones de variación de Mideli sin aplanar ni duplicar precios.
- En móvil el POS es utilizable, pero reduce información secundaria de los productos y mantiene accesos administrativos visibles. No debe tomarse como patrón de permisos ni como experiencia final multi-negocio.
- No se observó una sección pública de inventario equivalente a la de Mideli. Esto no prueba que no exista; significa que no se puede asumir que habrá recetas, existencias o movimientos compatibles para importar.

### Riesgos para la plataforma multi-negocio

1. **Seguridad heredada:** no se deben reutilizar sesiones, PIN, permisos ni reglas del sistema anterior. Just Dipping recibirá cuentas y membresías nuevas dentro de la seguridad de la plataforma.
2. **Fuente de verdad ambigua:** si ambos sistemas aceptan ventas durante la transición, pueden duplicarse folios, caja, historial e inventario.
3. **Colisión de identificadores:** folios, IDs de productos y nombres de categorías del sistema anterior no pueden convertirse directamente en identificadores globales.
4. **Catálogo y variaciones:** categorías repetidas, extras y recargos requieren una importación validada que conserve el precio base y el aumento de cada opción.
5. **Caja y retiros:** el sistema anterior tiene funciones propias de turno, retiro y corte. Mezclar esos registros con los cortes de Mideli sin una conciliación produciría totales incorrectos.
6. **Entrega:** Just Dipping tiene su propia configuración de distancia y recargos. No debe heredar la configuración de domicilio o WhatsApp de Mideli.
7. **Impresión:** la impresora y el estado de conexión parecen depender del dispositivo. Cada negocio y estación necesitarán una asignación explícita.
8. **Privacidad:** los dueños no deben ver tickets, clientes, direcciones ni resultados de otro negocio, aunque una mesera compartida opere pedidos de ambos.
9. **Integridad histórica:** editar o eliminar tickets heredados podría cambiar cifras anteriores. Si se migra el historial, conviene importarlo como archivo histórico de solo lectura con trazabilidad de origen.
10. **Retiro del sistema anterior:** debe existir una fecha de corte, un respaldo verificable y un periodo breve de consulta sin permitir doble captura.

### Estrategia recomendada para Just Dipping

1. Auditar reglas de Firebase y obtener un respaldo/exportación autorizada antes de depender de sus datos.
2. Crear Just Dipping como negocio independiente solo cuando se inicie la implementación con sus datos reales y dueño confirmado.
3. Dar al dueño su cuenta y permitirle administrar personal, catálogo, inventario y operación sin intervención diaria del administrador de plataforma.
4. Importar primero categorías, productos y modificadores a un entorno de prueba, con reporte de duplicados, elementos incompletos y recargos.
5. Preparar la arquitectura para conservar historial y cortes como archivo de solo lectura, sin ejecutar esa migración hasta que los demás dueños involucrados la confirmen y autoricen su alcance.
6. Conciliar conteos y obtener aprobación del dueño antes de activar el catálogo importado.
7. Fijar una fecha de corte. Desde ese momento, el sistema anterior queda solo como respaldo de consulta y las ventas nuevas entran únicamente a la plataforma multi-negocio.

Conclusión: el sistema anterior no bloquea la evolución multi-negocio, pero añade un frente específico de seguridad y migración. No conviene conectarlo en vivo ni copiar su estructura de permisos; debe migrarse de forma controlada hacia el mismo modelo aislado que usará Mideli.

La conservación del historial de Just Dipping es por ahora una preferencia provisional. Debe permanecer como capacidad contemplada en el diseño, no como una decisión cerrada ni como autorización para acceder, exportar o migrar esos datos.

## Arquitectura objetivo provisional

### Orden de especificación

La arquitectura se definirá mediante tres especificaciones separadas y aprobables: `usuarios y seguridad`, `pedidos y cobros multinegocio`, y `migración y piloto`. La primera debe cerrar la identidad y los límites de acceso antes de diseñar operaciones que dependan de ellos.

La transición será Mideli-first. Primero se asociará el sistema actual con Rincón 404 y el negocio Mideli, manteniendo credenciales, flujos y resultados visibles. Just Dipping se incorporará únicamente después de validar esa conversión y recibir las autorizaciones necesarias. Esta secuencia reduce el riesgo de mezclar una migración estructural con el alta simultánea de otro negocio.

### Jerarquía

`Administrador de plataforma → Rincón 404 Food Park → Coordinador y negocios independientes`.

`Coordinador → meseras globales y operación compartida`.

`Negocio → dueño → personal local, catálogo, inventario, pedidos, caja, gastos, reportes y estaciones`.

Rincón 404 Food Park será el contexto físico compartido. El negocio será el límite de propiedad y seguridad. Las mesas pueden ser de Rincón 404 Food Park; los pedidos, productos, inventarios y movimientos financieros serán de un negocio.

### Login y continuidad de cuentas

- No se deben crear cuentas nuevas para reemplazar las cuentas actuales de Mideli.
- La cuenta existente conserva su registro de Supabase Auth, UUID, identificador actual, correo interno, contraseña, sesiones recuperables y actividad histórica.
- La relación nueva será una membresía de esa misma cuenta con el negocio Mideli.
- El acceso de un nuevo dueño se creará mediante invitación o alta controlada, sin exigirle al administrador máximo compartir contraseñas por mensajes.
- El login debe aceptar correo y, si se conserva el formato actual, usuario corto. El alias histórico que agrega `@mideli.com` se mantendrá como compatibilidad exclusiva de cuentas antiguas de Mideli, no como regla global.
- Para nuevos usuarios se necesita un identificador estable, preferentemente correo o alias único, que no cambie si el dueño administra más de un negocio.
- Después de iniciar sesión, quien tenga un solo negocio entrará directamente a él. Quien tenga varios verá una pantalla breve de selección y un selector persistente en el encabezado.
- El negocio activo debe viajar en una sesión o contexto validado por el servidor. Un valor en localStorage o un parámetro de URL nunca será suficiente para autorizar datos.
- Al cambiar de negocio se deben invalidar o particionar el catálogo, carrito, pedidos en borrador, cachés, suscripciones Realtime y notificaciones del negocio anterior.

### Cuenta del administrador máximo

El usuario que opera la plataforma tendrá un permiso separado de los dueños de negocio, por ejemplo `platform_owner`. Ese permiso podrá crear, activar, pausar, archivar, restaurar y transferir negocios, además de entregar o recuperar el acceso del dueño cuando sea estrictamente necesario. No se reutilizará el rol `owner` actual con un significado ambiguo.

No asignará meseros, supervisores ni personal de cocina. Tampoco administrará los roles diarios del negocio. Cualquier acceso excepcional a información operativa deberá ser temporal, explícito y auditado.

El dueño de negocio será una membresía del negocio, no un rol global del perfil. Así una misma persona podrá tener un rol en un negocio y otro rol diferente en otro, si se autoriza explícitamente.

### Coordinador de Rincón 404

El `Coordinador` será un rol operativo de Rincón 404 Food Park. No sustituye al administrador de plataforma ni a los dueños de los negocios.

Podrá:

- Crear cuentas de meseras globales con usuario y contraseña temporal.
- Activar y desactivar cuentas de meseras globales.
- Crear, editar, activar, desactivar y ordenar las zonas y mesas del plano compartido de Rincón 404.
- Administrar la numeración, capacidad y ubicación visual de las mesas compartidas.
- Consultar y coordinar la información mínima necesaria para la operación compartida.
- Reasignar de forma controlada los servicios abiertos de una mesera global desactivada o que terminó su turno.

No podrá:

- Crear, pausar, archivar, retirar o transferir negocios.
- Crear, modificar o desactivar dueños ni personal interno de un negocio.
- Administrar menús, inventarios, ventas, cajas, gastos, costos o reportes privados de los negocios.
- Obtener acceso automático a un negocio por haber creado una cuenta global. La autorización operativa para enviar pedidos a cada negocio debe quedar explícita y auditada.

Crear o desactivar una mesera global no borrará su historial. Las altas, activaciones, desactivaciones, autorizaciones y reasignaciones deberán conservar un registro de auditoría.

El plano y la numeración de las mesas son recursos compartidos de Rincón 404 y tendrán al Coordinador como responsable operativo. Los dueños y su personal podrán consultarlos y seleccionar mesas al registrar pedidos, pero no cambiarán su estructura. Esto evita que un negocio renumere, mueva o desactive una mesa que también utilizan los demás.

### Administración autónoma del personal

- El dueño entra a la sección `Personal` dentro del contexto de su negocio.
- Desde ahí invita o crea empleados, asigna roles, activa o desactiva cuentas y revoca accesos.
- Puede asignar una misma cuenta a varios negocios solo si tiene autorización sobre esos negocios; una asignación nunca otorga acceso automático a los demás.
- El dueño no puede crear ni modificar cuentas del administrador máximo ni cambiar la propiedad de otro negocio.
- El personal verá únicamente los negocios y módulos que sus membresías permitan.
- Si el dueño pierde el acceso, Rincón 404 Food Park podrá iniciar un flujo de recuperación o transferencia de propiedad, pero no administrará normalmente su plantilla.

### Creación rápida

1. El administrador máximo registra únicamente los datos reales del negocio y lo deja en estado borrador.
2. Invita al dueño mediante el mecanismo de autenticación existente; no se crearán contraseñas ficticias ni datos de prueba.
3. El dueño configura menú, categorías, inventario, recetas, gastos, usuarios y estaciones de su negocio.
4. El dueño configura y administra a su personal.
5. El administrador activa el negocio cuando tenga los datos mínimos y permisos revisados.

Un negocio en borrador no recibe pedidos. Si no tiene dueño activo o configuración mínima, no se puede activar.

### Estados y eliminación

- `borrador`: se está configurando y no opera.
- `activo`: aparece en POS y recibe operación.
- `pausado`: no recibe nuevos pedidos, pero conserva operación e historial.
- `archivado`: sale de la operación normal y puede restaurarse.
- `retirado`: conserva información histórica y queda fuera de la sede.

“Deshacer” significará archivar o retirar, no borrar físicamente. Solo un negocio vacío y sin dependencias podría eliminarse de forma irreversible, siempre con confirmación explícita del administrador máximo y registro de auditoría.

### Pedidos de varios negocios

Para no mezclar cocinas ni inventarios, la estructura futura tendrá un ticket o sesión de servicio de Rincón 404 Food Park como contenedor y una orden hija por negocio. Una mesa puede tener artículos de Mideli y Just Dipping, pero cada negocio recibe únicamente su orden hija, sus líneas y sus movimientos de inventario.

La separación final del cobro se podrá agregar sobre ese contenedor sin rediseñar los pedidos. Mientras no exista esa función, la interfaz debe mostrar con claridad qué negocio pertenece a cada grupo y evitar cobrar un total ambiguo.

### WhatsApp

El canal actual seguirá asignado a Mideli. En la primera migración, conversaciones, clientes del canal, domicilios y pedidos de WhatsApp recibirán la asociación de Mideli sin cambiar el flujo del bot.

Después se podrá agregar una tabla de canales que relacione cada número o proveedor con un negocio. El motor nunca cargará el catálogo global: resolverá el negocio a partir del canal y solo leerá su catálogo, horarios, domicilio y configuración.

No se copiará el bot. Se reutilizará el motor conversacional con un contexto de canal y negocio. Los negocios nuevos no tendrán WhatsApp hasta que exista una asignación explícita y pruebas de aislamiento.

### Aislamiento de datos

Las tablas propiedad de un negocio deberán tener una referencia obligatoria al negocio, con índices y políticas RLS por membresía. Esto incluye como mínimo categorías, productos, modificadores, inventario, recetas, movimientos, compras, conteos, pedidos, líneas, gastos, turnos, movimientos de caja, reportes y estaciones.

Las mesas y zonas del plano serán recursos de Rincón 404 Food Park y serán administradas por el Coordinador. El acceso de consulta y uso operativo se dará mediante la membresía del negocio, sin duplicar el plano físico ni permitir que un dueño cambie su estructura compartida.

El servidor derivará el negocio desde la sesión y la membresía. Nunca confiará únicamente en un `business_id` enviado por el navegador. Productos e insumos de negocios diferentes no podrán formar recetas, líneas de pedido ni movimientos de inventario cruzados.

### Migración segura de Mideli

1. Crear Rincón 404 Food Park y el negocio Mideli.
2. Asociar los registros existentes a Mideli con conteos antes y después.
3. Mantener una compatibilidad temporal para las consultas actuales.
4. Ejecutar pruebas de POS, Cocina, WhatsApp, clientes, domicilios, caja, gastos, historial, reportes y permisos.
5. Activar el selector de negocio únicamente después de validar que los resultados de Mideli no cambiaron.

La función multi-negocio tendrá una bandera de activación para poder detener la exposición de negocios nuevos sin apagar Mideli. No se eliminarán columnas antiguas ni se borrarán datos durante la primera migración.

## Otros riesgos que deben entrar en la especificación

- La navegación actual decide el acceso con `profiles.role` global y rutas fijas. Debe pasar a resolver permisos por membresía sin cerrar la sesión actual.
- Las Server Actions consultan tablas globales directamente. Necesitan un único guard de negocio que derive la membresía del usuario y rechace cualquier referencia ajena.
- El catálogo tiene caché en el navegador. La clave debe incluir el negocio para evitar que al cambiar de restaurante aparezcan productos anteriores.
- El carrito local debe estar ligado al negocio activo y bloquear el cambio si hay una comanda sin guardar, o conservar borradores separados.
- Cocina, Realtime, audio y Push deben identificar el negocio en cada evento. Un mesero compartido puede recibir varios negocios, pero el aviso debe mostrar claramente cuál corresponde.
- Las imágenes de productos, estaciones de impresión, ajustes de horarios, delivery y reportes deben tener un alcance definido: sede, negocio o canal. No todas las configuraciones deben hacerse globales por accidente.
- La licencia actual es global de la plataforma y puede mantenerse así; no debe confundirse con los permisos operativos de cada negocio.
- Los folios existentes deben conservarse. La especificación debe decidir si los nuevos folios son globales o por negocio sin renumerar ventas históricas.
- Clientes y domicilios requieren una decisión de privacidad: se puede reutilizar una identidad técnica de contacto, pero cada dueño solo debe ver conversaciones, pedidos y notas de su negocio.
- Los triggers de inventario, pagos, cortes, gastos y reportes deben comprobar la misma pertenencia de negocio en toda la cadena, no solo en la fila principal.

### Estrategia de conservación

- Crear primero la entidad de sede Rincón 404 Food Park y la entidad de negocio, sin borrar ni renombrar datos existentes.
- Crear el negocio inicial Mideli y asociar mediante una migración controlada todos los registros actuales que le pertenecen.
- No crear Just Dipping en la base hasta que el usuario confirme que ya se va a registrar con sus datos reales.
- Mantener compatibilidad temporal con columnas antiguas durante la migración y retirar compatibilidad solo después de verificar consultas, RLS y flujos operativos.
- Probar en una copia o entorno de staging antes de tocar producción. La migración real debe tener conteos antes y después, validación de referencias y plan de reversión.

## Auditoría remota de Supabase: 2026-09-19

La migración remota coincide con los archivos locales hasta `20260915190000_add_delivery_colony_to_orders`. No hay evidencia de deriva de migraciones entre el repositorio y el proyecto remoto en esta revisión. La base sigue siendo de un solo negocio: las tablas operativas no tienen `business_id`, membresías ni visitas de mesa.

El tamaño real observado en producción fue:

- 4 perfiles activos: 1 `owner` y 3 `supervisor`.
- 7 categorías y 52 productos activos o registrados.
- 214 pedidos, todos de origen POS y todos actualmente pagados en el corte de la consulta.
- 85 pedidos de comedor, 107 para llevar y 22 a domicilio.
- 43 turnos de caja cerrados y ninguna caja abierta en el momento de la consulta.
- 5 zonas, 50 mesas registradas, 16 activas.
- 5 insumos, 0 recetas de inventario y 5 movimientos de inventario.
- WhatsApp con una configuración singleton y pedidos automáticos habilitados en la fila remota consultada.

Esto confirma dos límites importantes para el corte de migración: no se puede asumir que exista una caja abierta que trasladar, pero sí se debe diseñar el corte para pedidos, pagos, inventario y conversaciones que lleguen mientras se despliega. También confirma que el historial real es pequeño y auditable, pero no se debe usar el conteo actual como dato permanente porque cambia con la operación.

La auditoría de Supabase reportó riesgos de seguridad y rendimiento existentes que deben entrar en la etapa de endurecimiento, aunque no se corregirán durante esta fase de diseño:

- Hay tablas con RLS habilitado pero sin políticas explícitas, incluidas varias tablas de WhatsApp, clientes, eventos y correcciones.
- Hay funciones `SECURITY DEFINER` expuestas con ejecución para `anon` o `authenticated`, entre ellas `get_user_role`, `is_admin`, funciones de conteo, impresión, Push y registro de suscripciones. Cada función deberá tener un motivo documentado, validar `auth.uid()` y limitar su `EXECUTE` antes de activar el modelo multinegocio.
- Existen políticas permisivas duplicadas en categorías, productos, pedidos, perfiles e inventario. Al pasar a membresías, deben sustituirse por políticas de negocio únicas y comprobables, no acumular otra capa de `OR` global.
- El asesor detectó índices faltantes sobre varias claves foráneas y expresiones de RLS que pueden evaluarse por fila. La nueva migración debe corregir los índices de acceso que realmente usen las pantallas y envolver las funciones de sesión en `select` cuando aplique.

El resumen de asesores remoto de esta fecha fue: RLS sin políticas (21 hallazgos informativos), funciones `SECURITY DEFINER` ejecutables por `anon` (3 advertencias), funciones `SECURITY DEFINER` ejecutables por `authenticated` (11 advertencias), protección contra contraseñas filtradas no habilitada (1 advertencia), claves foráneas sin índice (35 hallazgos informativos), `auth` reevaluado por fila en RLS (3 advertencias), índices no usados (19 informativos) y políticas permisivas duplicadas (13 advertencias). Las referencias de remediación quedan registradas para la etapa de endurecimiento: [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [SECURITY DEFINER expuesto a anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [SECURITY DEFINER expuesto a authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [RLS con auth por fila](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan) y [políticas permisivas duplicadas](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies).

La consecuencia práctica es que el aislamiento multinegocio no puede empezar únicamente agregando columnas. Primero debe existir una matriz de funciones públicas, sus permisos `EXECUTE`, las políticas por tabla y las funciones privadas que atraviesan triggers. De lo contrario, una consulta aparentemente filtrada podría seguir exponiendo o modificando información ajena por una RPC o una política heredada.

## Huecos técnicos nuevos que deben cerrarse antes de implementar

1. **Identidad sin romper el login actual.** El login y la creación de usuarios todavía fabrican o aceptan el alias `@mideli.com`. Debemos conservar el correo real interno de Auth de las cuentas actuales, introducir un identificador de inicio amigable para los usuarios nuevos y definir la transición sin renombrar ni borrar las cuentas existentes. La pantalla no debe prometer que un usuario corto es un correo real si después habrá cuentas de distintos negocios.
2. **Rol global contra membresía.** `profiles.role` todavía es la fuente de verdad del proxy, Server Actions y Edge Functions. La nueva fuente debe ser una membresía con alcance y permisos, pero hay que conservar una ruta de compatibilidad durante la migración para que `Administrador`, `andrea`, `mauro` y la cuenta antigua `Mideli` no pierdan acceso accidentalmente.
3. **Cobertura de datos secundarios.** No basta con asociar `orders`, `categories` y `menu_items`. También deben tener dueño o alcance explícito las colas de impresión, suscripciones Push, eventos de notificación, reportes diarios, ajustes de licencia, imágenes, horarios de WhatsApp, clientes y domicilios. Cada uno debe clasificarse como global de sede, propiedad de negocio o propiedad de canal.
4. **Transacción mixta.** El RPC actual recibe un solo `p_items` y crea una sola orden. Antes de modificar la interfaz hay que definir una función nueva que calcule el agrupamiento por negocio a partir de los productos, cree una visita, cree las cuentas hijas, consuma inventario por negocio y devuelva un resultado idempotente. Un fallo en cualquier grupo debe revertir el conjunto completo.
5. **Caja y pagos históricos.** La base actual tiene una caja global por turno y las asignaciones de pago no tienen negocio. El backfill debe asociar cada registro a Mideli y hacer que los nuevos RPC rechacen mezclas. También se debe decidir cómo se muestra un cobro de una mesa mixta sin inventar una cuenta global que confunda al personal.
6. **Estado sin Cocina.** La regla de negocio ya está clara para Just Dipping: Estado con `Pendiente`, `Preparando` y `Listo`. La recomendación operativa es que el dueño o personal autorizado del negocio avance los estados de preparación; la mesera global consulta, recibe la notificación, entrega y cobra, pero no marca `Listo` de otro negocio por defecto. Una excepción debe ser una capacidad explícita y auditada. Las notificaciones deben incluir negocio y nunca enviar pedidos a la Cocina de Mideli por accidente.
7. **Contexto de dispositivo y sesión.** Un login compartido o una tableta global no debe conservar en caché el catálogo o el negocio anterior. Debe existir un contexto de negocio verificable por sesión o dispositivo para personal local, mientras Andrea y otras meseras globales podrán cambiar de negocio sin dejar una comanda pendiente en el contexto anterior.
8. **Corte y reversión.** La primera migración debe tener un bloqueo corto de escritura, respaldos verificables y una regla explícita para los eventos que lleguen durante el despliegue. Una bandera de aplicación por sí sola no evita doble folio o doble consumo si el cliente reintenta.
9. **Retiro de negocio.** “Desactivar” debe detener nuevas ventas sin borrar historial. Si en el futuro se exige borrar datos después de 60 días, eso requiere exportación, confirmación explícita y revisión legal/contable; no debe ser un borrado automático por defecto de ventas, pagos, caja o auditoría.
10. **Just Dipping todavía no está listo para alta.** Antes de crear ese negocio se necesitan dueño real, usuarios, menú autorizado, reglas de inventario, decisión sobre conservar su historial anterior, fecha de corte y decisión sobre impresora/entrega. El nombre confirmado es `Just Dipping`, pero no se deben importar registros por inferencia.

## Identidad actual y compatibilidad del login

La consulta de solo lectura a Auth mostró únicamente el alias local, no los correos completos. Los accesos existentes son:

| Cuenta | Alias que debe seguir funcionando | Situación futura |
|---|---|---|
| Administrador | `admin` | Dueño de Mideli |
| andrea | `andrea` | Mesera global |
| Mideli | `mideli1` | Conservar y dejar inactiva cuando se autorice |
| mauro | `mauro` | Cocina y caja de Mideli |

Todos usan internamente el dominio heredado `@mideli.com`. La solución segura no es cambiar las cuentas de Auth en la migración: se debe agregar un identificador de acceso corto administrado por la aplicación, aceptar los alias actuales como compatibilidad y dejar el dominio interno fuera de la interfaz. Los usuarios nuevos se crearán con nombre corto y contraseña temporal; el primer acceso exigirá cambio de contraseña. La unicidad del nombre corto deberá ser global dentro de Rincón 404 para evitar que dos empleados puedan iniciar sesión ambiguamente.

## Inventario técnico de superficies que deben recibir contexto

La búsqueda de consumidores confirmó que el límite de negocio debe atravesar más que POS y Cocina:

- Catálogo, imágenes, categorías, variaciones y disponibilidad.
- Carrito, pedidos, líneas, edición, estados, folios y ubicación de mesa.
- Caja, gastos, cortes, pagos, asignaciones, descuentos, devoluciones y reportes.
- Inventario, recetas, compras, lotes, conteos y movimientos automáticos.
- Realtime, Push, sonido local, colas de impresión y preferencias por dispositivo.
- Analíticas, reporte diario, historial, perfiles y onboarding.
- Clientes, domicilios, conversaciones, cotizaciones, horarios, tarifas y notificaciones de WhatsApp.
- Licencia de la aplicación y cualquier futura licencia por negocio.

La migración debe crear una matriz de alcance para cada tabla y RPC: `sede`, `negocio`, `canal`, `usuario/dispositivo` o `auditoría privada`. Si una superficie no tiene una clasificación, no puede activarse para un segundo negocio.

## Riesgos descubiertos en las operaciones transaccionales actuales

- `create_order_with_items` recibe del cliente el total, el precio unitario y las líneas, y la función actual no recalcula todos esos valores contra el catálogo. En el modelo nuevo el servidor debe calcular precio, variaciones, total y pertenencia al negocio; el cliente solo propone la comanda.
- `finalize_payment` puede recibir varias órdenes en una misma transacción y hoy no verifica que pertenezcan al mismo negocio ni a una caja del negocio. Esa validación debe ser una regla del RPC, no una condición visual del `PaymentFlow`.
- Los triggers de pedido y pago buscan la única caja abierta global. Deben recibir el negocio derivado y bloquear el cobro si la caja de ese negocio no está abierta.
- El inventario se consume mediante triggers de `order_items`. En un pedido mixto, la transacción debe validar producto, receta e insumo antes de permitir que cualquier trigger descuente existencias.
- El pedido externo de WhatsApp se crea mediante una función privilegiada del servidor y usa el catálogo global actual. Al asociarlo a Mideli, la función debe comprobar el canal, negocio, producto, horario y estado del negocio antes de crear el pedido.
- Push identifica al usuario y el tema, pero no al negocio. Una mesera global puede recibir avisos de varios negocios; una cuenta local y Mauro deben recibir únicamente los eventos de su alcance. La suscripción y el evento deben filtrar por negocio o por membresía válida.
- La configuración de impresión es singleton. Para Just Dipping se requiere una configuración por negocio o una asociación explícita de impresora; no se debe reutilizar la estación actual por accidente.

## Folios y números de servicio

Se conservará `orders.number` para no cambiar folios de Mideli ni romper referencias existentes. Para el modelo nuevo se recomienda agregar dos conceptos separados:

- `service_number`: número visible de la visita general de una mesa.
- `business_order_number`: folio operativo por negocio, único dentro de cada negocio.

Así una mesera puede decir “mesa 5, servicio 42” y cada negocio puede tener su propia secuencia sin renumerar el historial actual. El folio técnico global seguirá existiendo para idempotencia, trazabilidad y soporte, pero no sustituirá el folio que cada dueño consulta en su historial.

## Reglas operativas que quedaron confirmadas

- Just Dipping no tendrá pantalla de Cocina en la primera etapa, pero el cuestionario sí contempla una impresora propia. Por eso el modelo debe permitir `Estado` como cumplimiento principal y una impresión opcional por negocio, sin enviar sus pedidos al KDS de Mideli.
- La mesera global puede cobrar para cualquier negocio, pero cada pago se registra en la caja del negocio correspondiente. No se necesita identificar la terminal física.
- Una mesa puede tener varios servicios abiertos, por lo que la visita debe tener un identificador explícito y nunca inferirse solo por `table_id` y “último pedido”.
- La mesera puede añadir productos después del primer envío y después de un pago. Si la cuenta ya fue pagada, se crea una cuenta adicional relacionada, sin reabrir el cobro anterior.
- El administrador de plataforma solo recibe indicadores técnicos y de ciclo de vida. No se debe incluir una consulta global de ventas, clientes o caja disfrazada de “panel de salud”.
