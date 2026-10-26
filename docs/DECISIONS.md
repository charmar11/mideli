# Decisiones de producto y arquitectura

Este archivo resume decisiones que no deben revertirse por accidente al modificar una interfaz o un flujo.

## Alcance

La lectura remota del 2026-09-27 confirmó Mideli y Just Dipping registrados
como negocios activos en Rincón 404 Food Park. El catálogo de Just Dipping y
la estructura de su archivo histórico son independientes de Mideli; la carga
de tickets anteriores sigue pendiente según la última revisión documentada.
Esos tickets no se convertirán en órdenes, pagos ni caja activa. El estado
`active` del negocio no sustituye la verificación operativa de su menú,
inventario, permisos y flujo de cobro antes del piloto.

No se agregarán abstracciones de marketplace o multisucursal distintas del
alcance aprobado.

La migración prevista desde el Firebase histórico de Just Dipping se acotó a
catálogo y tickets. El catálogo ya se importó; los tickets todavía no figuran
importados en la última verificación documentada. No incluye `web_orders`,
cajas, inventario ni datos personales de clientes. Cuando se importen, los
tickets vivirán en un archivo de consulta separado, nunca en ventas, caja o
analíticas operativas.

## Multinegocio en transición

- Cada negocio tendrá su propio catálogo, inventario, pedidos, caja, pagos,
  gastos, historial, personal y permisos.
- Rincón 404 tendrá una cuenta de plataforma separada de los dueños.
- El dueño administra su propio personal; el Coordinador administra meseras
  globales y recursos compartidos, no las finanzas o personal interno de cada
  negocio.
- El Coordinador puede asignar a una mesera global permisos independientes de
  apertura y cierre de caja para cada negocio. Esto no concede `business.manage_cash`:
  movimientos, ajustes, historial completo y administración de cortes siguen
  reservados al personal administrador de ese negocio. El permiso de cierre
  solo permite consultar el corte que esa persona acaba de cerrar.
- Quien solo opera pedidos o abre caja recibe el estado de la caja, no cifras
  financieras ni datos del personal del turno.
- Una mesera global puede capturar, entregar y cobrar pedidos de negocios
  habilitados, pero no marca `Listo` de otro negocio por defecto.
- Habilitar un negocio a una mesera global no amplía sus listas de Estado ni
  Historial: como tal rol, solo consulta pedidos de `comer aquí` en cualquier
  negocio. Domicilio, para llevar y Uber/DiDi quedan a cargo del equipo local.
- Las comandas mixtas de varios negocios se crean como pedidos y cuentas
  independientes por negocio cuando son de comedor. Domicilio y para llevar
  mixtos permanecen bloqueados hasta tener una operación atómica y reglas
  claras para la tarifa externa de reparto.
- Los negocios sin pantalla de Cocina pueden avanzar `Pendiente → Preparando →
  Listo` desde Estado con el permiso explícito de preparación del negocio;
  operar pedidos no concede ese permiso.
- Avanzar pedidos y abrir la estación Cocina son permisos separados:
  `business.update_preparation` habilita los estados desde Estado y
  `business.access_kitchen` muestra el KDS. Los negocios nuevos no reciben KDS
  por defecto; el rol de preparación no da permisos a meseras globales.
- Las credenciales actuales de Mideli se conservan.
- WhatsApp permanece exclusivo de Mideli durante la primera etapa.
- Just Dipping conserva catálogo, inventario, pedidos, caja y permisos
  separados de Mideli. La estructura del archivo histórico ya existe; la
  importación de tickets anteriores sigue pendiente según la última revisión.
- Los combos básicos son un producto vendible con precio de paquete,
  componentes fijos y grupos de opciones. El servidor valida la selección
  contra el menú del mismo negocio y guarda snapshots para cocina e inventario.
  No se permiten combos anidados.
- Los folios de pedidos, aperturas de caja y pagos se cuentan por negocio; los
  documentos existentes conservan su número y cada contador inicia desde el
  máximo ya emitido en su negocio.
- Las migraciones de combos, folios, identidad, catálogo y estructura del
  archivo histórico constan aplicadas al corte verificado del 2026-09-27.
  No renumerar pedidos ni duplicar el catálogo. La carga de tickets anteriores
  es una tarea separada que requiere conciliación antes de declararse hecha.

## Orden de servicio

El pedido se arma primero y después se elige el contexto de servicio. Para comedor se selecciona mesa en el plano; para domicilio se confirma el punto; para llevar no se pide información innecesaria.

## WhatsApp

- El bot debe saludar con personalidad, emojis y categorías legibles, pero las opciones interactivas deben coincidir exactamente con el texto mostrado.
- `Hablar con alguien` no aparece al inicio. Se ofrece cuando el cliente lo solicita o cuando el bot ya no puede resolver la indicación.
- Las variaciones y extras deben mostrar claramente qué opción incrementa el precio y cuánto incrementa.
- El teléfono identifica principalmente al cliente; el nombre es opcional.
- Un relevo humano conserva carrito, datos del cliente, dirección, notas y método de pago.
- La creación automática queda controlada por una bandera técnica y una configuración visible en WhatsApp.

## Domicilios

- Se prefiere capturar calle, número y colonia para geocodificar, con corrección mediante mapa.
- Las direcciones repetidas del mismo cliente se unifican usando el resultado canónico de Maps.
- El usuario puede editar o eliminar domicilios desde el directorio autorizado.
- El envío se calcula y se muestra al cliente, pero un repartidor externo cobra la tarifa por separado. El cobro operativo de Mideli es el subtotal de productos.
- Las coordenadas, distancia y dirección de la orden se guardan como snapshot para historial y seguimiento.

## Pagos y caja

El pago no reemplaza el estado de preparación. Una orden puede estar en cocina aunque todavía no esté pagada. Las correcciones, divisiones, descuentos y cierres deben quedar auditados en el libro mayor y no resolverse con escrituras legacy.

## Interfaz móvil

- Las acciones de enviar, cobrar, confirmar y entregar deben ser grandes, accesibles y visibles.
- Cada vista debe tener un scroll principal claro. Los paneles que sí necesitan desplazamiento propio deben capturar el gesto vertical sin desplazar la pantalla completa.
- El color comunica estado además del texto: rosa para selección/acción de marca, verde para completar, ámbar para atención, rojo para acciones irreversibles y dorado para valor.
- No ocultar nombres de categorías en escritorio si eso dificulta reconocer el menú.

## Notificaciones

Las notificaciones Push se configuran por dispositivo y por tema. Los pedidos
nuevos usan el tema de pedidos nuevos; preparación y pedido listo usan el tema
de estado del pedido para el personal que opera cocina. Las meseras, locales y
globales, solo reciben el aviso cuando el pedido queda listo, no al registrarse
ni al iniciar preparación. Cada aviso debe ser idempotente y respetar el
negocio, el permiso y el alcance de la membresía del destinatario. La mesera
global conserva además el límite de recibir solo pedidos de comedor en otros
locales; domicilio y para llevar requieren el acceso correspondiente. El
service worker puede mostrar Push aunque Cocina o Mesero estén visibles; sonido
y señales locales son complementarios.

Los avisos de WhatsApp al cliente se mantienen desactivados por defecto en pedidos manuales y solo se envían con consentimiento aplicable.

## Datos y seguridad

- El service role de Supabase, claves de Meta, Gemini, Maps, licencia y Sentry nunca llegan a Client Components.
- Las migraciones son la única vía para cambios de esquema.
- Las licencias comerciales se controlan por negocio desde `/settings/licencias`, exclusivamente con la capacidad de plataforma `platform.manage_business_licenses` asignada a la cuenta Rincón 404. La vigencia antigua sólo se usa para migrar la fecha inicial; `app_license.status` queda como suspensión técnica global, sin fecha comercial.
- El bloqueo de un negocio no revela deuda calculada ni afecta a los demás. Las meseras globales conservan los menús autorizados de negocios vigentes; un local no disponible aparece deshabilitado y sin detalles de licencia. Errores de verificación se muestran como problemas técnicos, no como falta de pago.
- Al vencer Mideli, WhatsApp no responde ni procesa pedidos, relevo humano o tareas programadas. Los pedidos programados que queden atrasados al reactivar requieren revisión humana, nunca envío retroactivo automático.
- Los datos conversacionales pueden limpiarse mediante la operación autorizada sin borrar órdenes, folios ni auditoría.
- El número de teléfono se normaliza internamente para búsquedas y proveedores, pero la interfaz muestra el formato local cómodo cuando es posible.

## Rendimiento y tolerancia a fallos

- Las alertas Push son secundarias: guardar un pedido y cambiar su estado no esperan la respuesta del proveedor. La operación confirmada usa la persistencia y Realtime; Push se solicita en segundo plano y sus fallos quedan registrados para diagnóstico.
- El POS conserva el último catálogo válido si una consulta temporal falla y muestra una acción de reintento. Los cambios de productos y categorías invalidan el caché y actualizan las vistas abiertas.
- La gráfica pesada de analíticas se carga bajo demanda para que el cambio entre vistas operativas no arrastre su dependencia al primer render.
- Los pedidos programados dependen de un cron de producción por minuto en Supabase, no del plan de cron de Vercel. El endpoint usa un secreto dedicado almacenado en Vault y reclama cada orden con una actualización condicional para que ejecuciones simultáneas sean seguras.

## Clientes e impresión por negocio (2026-10-01)

- El directorio operativo usa `business_customers` y
  `business_customer_addresses`, separados por `business_id`. Un mismo teléfono
  puede existir en dos negocios con historial y domicilios propios; no se crea
  un perfil compartido entre locales.
- Los registros legacy que pertenecían al flujo de WhatsApp se copian al
  directorio de Mideli; las tablas legacy no se eliminan ni se reutilizan para
  Just Dipping. Las órdenes nuevas enlazan a su cliente local y los domicilios
  se actualizan transaccionalmente.
- La comanda mixta de comedor usa un RPC autorizado para enlazar una identidad
  local a cada orden dentro de la misma transacción. Una clave de reintento no
  puede cambiar un cliente ya asociado a otro.
- Historial imprime tickets de pedido compactos, sin logo, con tipografía
  monoespaciada pequeña y márgenes reducidos. Conserva los datos configurables
  por negocio, ancho de 48/58 mm y el desglose necesario de pedido, domicilio,
  descuento, envío, total y pago. Los comprobantes de cobro también usan una
  presentación compacta sin logo e identifican el negocio y la transacción.
- La web abre el diálogo de impresión del dispositivo. No implementa Bluetooth
  directo porque iPad requiere una impresora compatible con AirPrint en la
  misma red Wi‑Fi; el modelo real debe probarse antes de asegurar compatibilidad.
- Se oculta la interfaz de WhatsApp al personal y se redirige su ruta, pero el
  webhook, el bot y las tareas programadas quedan intactos por la instrucción
  de no modificar todavía esa integración. Ocultar la bandeja no desactiva el
  canal.

## Origen y tarifas de domicilio por negocio (2026-10-04)

- El punto de salida, los rangos por distancia y los recargos por colonia son
  propios de cada negocio. El POS cotiza con la configuración de la orden y no
  con la configuración compartida del WhatsApp legado.
- Para no interrumpir el piloto, la migración copió la configuración vigente a
  cada negocio activo como registros independientes. Los negocios nuevos
  reciben tarifas iniciales copiadas, pero requieren confirmar su propio
  origen antes de cotizar.
- La tarifa sigue siendo un estimado del local; el repartidor cobra el envío.
  El mensaje manual comparte origen/destino y Maps, muestra monto solo si es
  efectivo y no incluye el número del envío ni el total estimado del cliente.
- WhatsApp automático al cliente sigue desactivado para órdenes manuales. El
  enlace manual `Enviar a repartidor` permanece disponible y requiere que la
  persona confirme el envío desde WhatsApp.

## Pedidos manuales de Uber Eats y Didi Food (2026-10-09)

- La plataforma de venta es un atributo separado del tipo de servicio y del
  método de pago local. Uber Eats solo permite “pagado en app”; Didi Food
  permite “pagado en app” o “efectivo al entregar”. Los pedidos de plataforma
  no piden domicilio, tarifa local, horario de recogida ni un cobro normal.
- Rincón 404 habilita esta capacidad por negocio; los negocios nuevos nacen
  desactivados. El precio por producto de plataforma es opcional y se conserva
  en el snapshot de la orden. La comisión es solo una referencia y no se usa
  para estimar liquidaciones o ventas netas.
- Al entregar Didi en efectivo, el empleado registra el importe realmente
  recibido. Una operación atómica, autorizada por negocio, lo asocia al turno
  de caja abierto del mismo negocio una sola vez; no genera una transacción de
  pago local. Uber y Didi pagado en app no agregan efectivo a caja.
- Estado conserva el botón de entrega a repartidor; Historial y el ticket
  identifican la plataforma y forma de pago. Los pedidos pueden borrarse con la
  autorización habitual del negocio; la auditoría del efectivo Didi permanece
  en caja según la decisión de borrado registrada más abajo.
- La migración `20261009221644_just_dipping_marketplace_orders.sql` y la interfaz
  quedaron publicadas el 2026-10-09. Se verificaron 16 condiciones SQL remotas
  de solo lectura, además de lint, build y 783 ejecuciones Playwright. pgTAP no
  se ejecutó porque no hay Docker/Postgres local y la extensión no está instalada
  en producción; no se crearon pedidos, cobros ni movimientos reales para probar.
- El módulo está habilitado para que el dueño de Just Dipping configure sus
  canales desde `/settings/plataformas`; Uber Eats y Didi Food no quedan
  activados hasta que el dueño los habilite y guarde su configuración. Es un
  registro operativo manual, no una integración de recepción automática con las
  APIs de Uber Eats o Didi Food.
- Vercel producción `dpl_2VLWRDQs4JF1g2SrFrRfu9oJAbat` quedó `READY`, alias
  `https://mideli.vercel.app`; `/api/health` respondió HTTP 200 y `status: ok`.

## Disponibilidad de productos por plataforma (2026-10-09)

- Uber Eats y Didi Food tienen una casilla de disponibilidad independiente por
  producto y negocio. Si se agrega un producto al menú, aparece en Plataformas
  sin marcar; debe activarse manualmente por cada canal.
- Un artículo no marcado no se puede seleccionar para el canal en Mesero y la
  base de datos también bloquea su envío. Si está marcado y no tiene precio
  especial, se usa el precio normal del menú. Cambiar un precio no altera
  pedidos históricos.
- Las capturas compartidas se compararon con el catálogo real de Just Dipping:
  se prepararon 18 productos de Uber Eats y 9 de Didi Food con sus precios de
  captura. Los productos que no aparecen en un menú quedaron desmarcados. Los
  canales permanecen apagados hasta que el dueño los active.
- La migración `20261009231817_marketplace_product_availability.sql` agrega la
  disponibilidad, conserva la separación por negocio, actualiza el validador
  del servidor. La migración de datos
  `20261009232342_seed_just_dipping_marketplace_prices.sql` registra los precios
  de las capturas sin crear ventas.
- `npm run lint`, `npm run build` y las 18 pruebas Playwright de acceso y
  disponibilidad en escritorio, tablet y móvil pasaron. La consulta remota
  confirmó el esquema, el bloqueo en base, los precios y que ambos canales siguen
  apagados. pgTAP no se ejecutó porque este equipo no tiene Docker/Postgres.
- Producción quedó `READY` en Vercel como `dpl_2ZsULYGRuiMBUve6BqHjYneYvmRJ`,
  con alias `https://mideli.vercel.app`. No se consultó `/api/health` ni se
  crearon pedidos reales.

## Borrado de pedidos con autorización del dueño local (2026-10-09)

- El dueño activo del negocio puede borrar pedidos directamente. El personal
  autorizado para operar pedidos puede solicitar el borrado ingresando el PIN
  de un dueño activo del mismo negocio; no se aceptan dueños de otro local.
- La mesera global solo puede solicitar borrado de pedidos de comedor en otros
  negocios. Los pedidos de plataforma, los cobros asociados a cortes cerrados,
  las cuentas compartidas y las operaciones de caja en curso conservan sus
  protecciones existentes.
- La verificación del PIN, su bloqueo por intentos y el borrado atómico viven en
  una sola función de base de datos. El PIN/hash no se devuelve a la interfaz.
- Migración `20261010001844_business_scoped_order_deletion_authorization.sql`
  aplicada a producción. Se verificó que `anon` no puede ejecutar los RPC y
  que `authenticated` sí, con `search_path` vacío. El despliegue Vercel
  `dpl_CTVnF24Jv7RmhhGb4Fgaxs5KtsP2` quedó `READY` y asociado a
  `https://mideli.vercel.app` el 2026-10-09. No se borraron pedidos reales;
  los 18 escenarios E2E pasaron en escritorio, tablet y móvil (54 ejecuciones);
  pgTAP no se ejecutó contra producción.

## Borrado de pedidos de plataformas (2026-10-09)

- Uber Eats y Didi Food siguen la autorización de borrado normal del negocio:
  dueño directo, o personal autorizado con PIN del dueño del mismo local.
- **Regla histórica, reemplazada abajo.** Inicialmente, los pedidos Didi en
  efectivo que ya se entregaron y quedaron vinculados a una caja no se podían
  borrar, para evitar eliminar del corte un efectivo ya registrado.
- Se mantienen las protecciones de cortes cerrados, pagos compartidos y
  operaciones concurrentes. La restricción de borrar todos los pedidos de
  plataforma quedó reemplazada por estas protecciones más específicas.
- La migración `20261010003718_allow_marketplace_order_deletion_with_cash_protection.sql`
  se aplicó y verificó en Supabase. `anon` no puede ejecutar el RPC; el rol
  autenticado conserva validación de negocio, permisos y PIN. No se borraron
  pedidos reales.
- `npm run lint`, `npm run build` y las pruebas dirigidas pasaron: 102
  ejecuciones en escritorio, tablet y móvil. Vercel producción
  `dpl_47SR1oNXwYQhAfu3t1FANXc2AiH4` quedó `READY` y asociado a
  `https://mideli.vercel.app`.

## Borrado de DiDi en efectivo con conservación del corte (2026-10-09)

- El dueño borra directamente; el personal requiere el PIN de un dueño activo
  del mismo negocio. Se conserva la restricción de alcance de meseras globales.
- Un pedido DiDi pagado en efectivo puede borrarse incluso tras entregarlo. La
  base guarda un recibo privado de auditoría con folio, monto, turno, fecha y
  responsables. No conserva nombre, teléfono, domicilio ni artículos del pedido.
- Los totales del turno abierto y el cierre incluyen ese recibo después de
  borrar la comanda. La función de detalle de caja conserva la marca de borrado.
  Si un cierre está en curso, el bloqueo de concurrencia sigue activo. También se
  mantienen los bloqueos de pagos locales en turnos cerrados y de pagos
  compartidos.
- La migración `20261010004843_archive_didi_cash_receipts_on_order_deletion.sql`
  actualiza la eliminación y los cálculos de caja sin alterar pedidos ni
  cierres existentes.
- Verificación: lint, build y 102 pruebas Playwright dirigidas pasaron; la
  migración quedó aplicada y verificada en Supabase. Producción Vercel
  `dpl_4yb7DhvJYs4Srym2iCV261wB5gbP` quedó `READY` el 2026-10-09.

## Visibilidad de pedidos para meseras globales (2026-10-10)

- Las meseras globales pueden consultar pedidos de `comer aquí` en los
  negocios de su organización. El permiso operativo asignado por negocio no
  habilita pedidos de domicilio, para llevar ni de Uber/DiDi para una mesera
  global; esos pedidos permanecen con el personal local.
- Los pedidos, artículos y estados se filtran en RLS; la pantalla aplica el
  mismo criterio para proteger los estados ya cargados. Los roles locales, los
  límites de negocio seleccionado y las licencias conservan su control.
- La regla es por organización y rol, no por nombre del empleado ni por una
  lista fija de locales; aplica también a negocios futuros.
- La migración `20261010010407_global_waiter_order_service_visibility.sql`
  estableció inicialmente el filtro por tipo de servicio; su corrección vigente
  es `20261010011748_restrict_global_waiters_to_dine_in_only.sql`.
- La corrección ya está aplicada en Supabase producción. La comprobación de la
  regla con la membresía real de Andrea en Just Dipping devuelve permitido para
  comedor y denegado para domicilio y para llevar; por tanto tampoco expone
  Uber Eats ni DiDi Food, que son pedidos para llevar.
- Lint, build y las 57 pruebas Playwright de contexto pasaron. El flujo de
  producción se restringe desde RLS, así que la web desplegada lo aplica al
  volver a consultar; no se publicó un nuevo frontend porque el árbol local
  contiene otros cambios pendientes que no corresponden a este arreglo.
- Pasaron lint, build y 57 pruebas Playwright en escritorio, tablet y móvil.
  Se agregó una prueba pgTAP para CI; no pudo ejecutarse localmente porque no
  está disponible Docker. Vercel producción
  `dpl_Gksri6FgrtVzkxx7UTo8MqmiNX98` quedó `READY` y asociado a
  `https://mideli.vercel.app` el 2026-10-10. Andrea aún debe confirmar en su
  sesión real tras actualizar la aplicación.
