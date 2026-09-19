# Progreso de diseño: Rincón 404 Food Park y negocios independientes

## 2026-09-13

- El usuario corrigió el nombre de la sede: Rincón 404 Food Park.
- Se confirmaron los restaurantes actuales: Mideli y Just Dipping.
- Se confirmó que el dueño de cada negocio debe administrar su menú, inventario y operación sin intervención del administrador central.
- Se estableció que esta etapa es solo planificación; no se implementarán cambios hasta aprobar la especificación.
- Se leyeron las instrucciones de brainstorming, planning y diseño de tablas PostgreSQL.
- Se revisó el contexto actual del proyecto y se detectó que la documentación todavía asume un solo local.
- Se auditaron migraciones y módulos de código relevantes en modo lectura.
- Se confirmó que el modelo actual no tiene `business_id`, membresías por negocio ni RLS por negocio.
- Se confirmó que el canal WhatsApp actual es único y está acoplado al catálogo global y a una configuración fija de Mideli.
- Se identificaron tres estrategias posibles para WhatsApp. La recomendación provisional es conservar el número actual exclusivo de Mideli mientras se construye la base multi-negocio.
- Se identificó como riesgo principal la mezcla de una mesa con productos de varios negocios, porque el POS actual crea una orden única.
- No se modificó código, esquema, configuración, datos reales ni despliegue.

- Se confirmó que el objetivo no es crear una copia de WhatsApp, sino convertir el núcleo en multi-negocio y mantener el canal existente asignado a Mideli al inicio.
- Se definió provisionalmente un administrador de plataforma separado de los dueños de negocio.
- Se definió provisionalmente un ciclo de vida reversible: borrador, activo, pausado, archivado y retirado.
- Se definió como requisito estructural un contenedor de servicio de Rincón 404 Food Park con una orden hija por negocio para evitar mezclar inventarios y cocinas.
- Se registró una estrategia de migración gradual con Mideli como negocio inicial y una bandera de activación para reducir riesgos.
- Se verificó que Supabase Auth y `profiles` están separados: conservar el mismo usuario de Mideli es viable si se conserva el registro de Auth y se agrega la membresía, en lugar de crear una cuenta de reemplazo.
- Se detectó que el alias corto con sufijo `@mideli.com`, el rol global del proxy, la caché del catálogo, el carrito local, Realtime y Push deben recibir una estrategia explícita para el contexto de negocio.
- Se registró que el login recomendado será directo cuando la persona tenga un solo negocio y mostrará un selector breve cuando tenga varios.
- Se registró que la migración no debe cambiar credenciales, folios históricos ni el comportamiento del WhatsApp de Mideli.
- Se confirmó que el dueño de cada negocio, no el administrador de Rincón 404 Food Park, debe asignar y administrar a su personal.
- Se ajustó el alcance del administrador de plataforma a creación, ciclo de vida, entrega del acceso inicial y recuperación excepcional del dueño, con auditoría.
- Se auditó en modo lectura el sistema público anterior de Just Dipping sin crear, editar, guardar ni eliminar información.
- Se confirmó que `Just Dipping POS` usa Firebase/Firestore en tiempo real y que POS, Historial y buena parte de Administración son visibles sin login.
- Se registró como hecho que Estadísticas solicita PIN, pero que esa protección visible no cubre de manera consistente otras áreas sensibles.
- Se diferenció entre exposición pública confirmada y permisos de escritura no verificados; las reglas de Firebase deberán auditarse antes de una migración.
- Se detectaron riesgos de categorías duplicadas, mapeo de extras, colisión de folios, caja independiente, entrega, impresión y doble captura durante una transición.
- Se recomendó migrar mediante exportación validada y fecha de corte, no conectar el sistema anterior directamente a la nueva operación multi-negocio.
- El usuario expresó preferencia por conservar el historial y los cortes anteriores de Just Dipping como archivo de solo lectura, pero indicó que aún debe hablarlo con los demás dueños. Se registró como decisión pendiente, no como autorización de migración.
- Se creó `cuestionario-descubrimiento.md` con 173 preguntas organizadas por operación, negocios, usuarios, mesas, cocina, cobro, menú, inventario, clientes, reportes, dispositivos, migración de Just Dipping, piloto y crecimiento futuro.
- El cuestionario separa las decisiones del dueño de las verificaciones técnicas que realizará el programador y permite responder `Por confirmar` sin inventar información.
- El rol operativo compartido de Rincón 404 se llamará `Coordinador`, reemplazando el nombre provisional `Hoster`.
- Se confirmó que el Coordinador podrá crear, activar y desactivar cuentas de meseras globales.
- El dueño de cada negocio seguirá administrando únicamente a su personal local; el Coordinador no administrará dueños, cocina, caja ni supervisores internos de los negocios.
- La desactivación de una mesera global conservará su historial y requerirá resolver o reasignar sus servicios abiertos.
- Se confirmó que el Coordinador administrará el plano, las zonas y la numeración de las mesas compartidas de Rincón 404.
- Los dueños y su personal podrán consultar y usar las mesas al registrar pedidos, pero no modificarán la estructura compartida del plano.
- Se acordó dividir el diseño en tres especificaciones: usuarios y seguridad; pedidos y cobros multinegocio; migración y piloto.
- Se acordó una transición Mideli-first: convertir primero Mideli al nuevo modelo sin cambios visibles, verificar su funcionamiento y después incorporar Just Dipping.

## 2026-09-18

- Se confirmó que la cuenta actual `Administrador` representa al dueño de Mideli y que el administrador de Rincón 404 tendrá una cuenta separada.
- Se consultó Supabase en modo lectura y se identificaron cuatro perfiles activos: `Administrador` con `owner`, `andrea` con `supervisor`, `Mideli` con `supervisor` y `mauro` con `supervisor`.
- Se documentó que `andrea` es mesera global, `mauro` es cocinero de Mideli y la cuenta `Mideli` ya no se utiliza. Los roles técnicos actuales no se modificarán durante la planificación.
- Se confirmó que solo Mideli usa la pantalla de Cocina. Just Dipping usará Estado con `Pendiente`, `Preparando` y `Listo`.
- Se incorporó la distinción entre mesera global, que puede enviar pedidos a cualquier negocio, y personal local, que solo puede operar dentro de su propio negocio.
- Se redactaron las tres especificaciones de diseño: usuarios y seguridad, pedidos y cobros multinegocio, y migración y piloto.
- Se creó una matriz de brechas y dependencias que compara el código actual con el objetivo multinegocio. Identifica como riesgos críticos la identidad global, la separación de pedidos mixtos, la caja global, los pagos, el inventario y las políticas RLS.
- Se documentó que el modelo debe soportar meseras globales y personal local limitado a su negocio, con una sola interfaz y contexto seguro por sesión.
- Se creó el modelo lógico de organización, negocio, membresía, visita de mesa, cuenta de negocio, pedidos, cobros e inventario, junto con los flujos de pedido mixto, pedido local, Estado y cierre de mesa.
- Se creó el mapa de migración por dominio para conservar Mideli, asociar su histórico sin duplicarlo y revisar funciones, triggers, RLS, cachés y notificaciones antes de habilitar un segundo negocio.
- Se creó el diseño físico propuesto, aún sin SQL, para organización, negocios, membresías, visitas, cuentas, pedidos, pagos, caja, inventario, RLS, RPCs, índices y transición compatible.
- Se creó la matriz de pruebas para continuidad de Mideli, permisos, pedidos mixtos, cobros, inventario, aislamiento, rendimiento y pérdida de conexión.
- Se creó el plan de migraciones y archivos afectados, con orden por etapas, funciones RPC, triggers, RLS, componentes y punto de no retorno.
- No se modificó código, esquema, configuración, datos reales ni despliegue.

## 2026-09-19

- Se verificó que las migraciones remotas de Supabase coinciden con los archivos locales hasta `20260915190000_add_delivery_colony_to_orders`.
- Se revisaron en modo lectura las tablas, funciones, triggers, políticas, restricciones, conteos agregados y consumidores principales del código actual.
- Estado remoto observado sin exponer datos privados: 4 perfiles activos, 214 pedidos POS pagados, 43 turnos cerrados, 5 zonas, 50 mesas registradas, 5 insumos y ninguna receta de inventario.
- Se confirmó que las cuentas actuales conservan los alias `admin`, `andrea`, `mideli1` y `mauro`, todos con dominio técnico heredado. Se documentó una estrategia de identificadores cortos sin renombrar Auth.
- La auditoría de Supabase reportó RLS sin políticas, funciones `SECURITY DEFINER` expuestas, políticas permisivas duplicadas, índices faltantes, evaluación de RLS por fila y protección de contraseñas filtradas pendiente. La ejecución remota de seguridad de esta revisión terminó en modo de solo lectura con 36 hallazgos: 21 informativos de RLS sin política, 3 advertencias para `anon`, 11 para `authenticated` y 1 de protección de contraseñas filtradas. Se incorporaron como gates obligatorios antes de crear un segundo negocio.
- Se añadieron a `findings.md` los huecos técnicos de identidad, alcance de datos secundarios, transacción mixta, caja, Estado sin Cocina, dispositivos, corte, retiro de negocio, folios y Just Dipping.
- Se creó `10-especificacion-final-y-gates.md` con el contrato de arquitectura, reglas no negociables, cuentas actuales, visita de mesa, cuentas por negocio, pagos, inventario, WhatsApp Mideli, migración, rollback y criterios de aprobación.
- La planificación sigue sin implementar cambios de código, esquema, configuración, datos reales ni despliegues.
- La auditoría de preparación quedó documentada en `11-auditoria-de-preparacion.md`, con la matriz de brechas por dominio y el orden de migración recomendado.
- La línea base local pasó `npm run lint`, `npm run build` y `git diff --check`.
- `npx supabase migration list` y `npx supabase db push --linked --dry-run` confirmaron que el remoto está alineado y no tiene migraciones pendientes.
- Una consulta remota de solo lectura confirmó que todavía existen `0` columnas `business_id` o `organization_id` y que la caja abierta conserva una unicidad global.
- Graphify revisó temporalmente 204 archivos de `src` y confirmó las relaciones entre POS, pedidos, Cocina, Estado, caja, pagos, inventario y WhatsApp. Sus artefactos temporales no se conservaron en el repositorio.
- Se fijó como recomendación operativa que el personal local cambie los estados de preparación de su negocio; la mesera global consulta, entrega y cobra, pero no marca `Listo` de otro negocio por defecto.
- Se corrigió en la documentación el nombre canónico `Just Dipping` para evitar ambigüedad durante una futura migración.
- Se añadió una auditoría de preparación y el plan de la primera rebanada en
  staging. El plan distingue nombres visibles de perfiles y los `auth.users.id`;
  no se crearán membresías con alias supuestos.
- Se verificó que todavía no existe un entorno Supabase de staging comprobado.
  Crear ese entorno, separar sus variables y probar un respaldo restaurable son
  los gates operativos siguientes.
- La lista remota de ramas Preview de Supabase devolvió `[]`; no se creó ninguna
  rama ni se modificó la base de producción.
- Se detectó que el CLI puede clonar datos de producción con `--with-data`. El
  plan ahora exige fixtures anonimizados o autorización y acceso restringido
  para cualquier clon usado en pruebas de backfill.
- Se creó el checklist operativo de staging y reversión, incluyendo la regla de
  no conectar webhooks productivos al Preview ni borrar datos para revertir.
- Se generó un diagrama de arquitectura objetivo con Archify. Quedó validado
  sin cruces ni advertencias y enlazado desde el README de la iniciativa.
- Se consolidaron en `14-gates-decision-negocio.md` las cuatro confirmaciones
  mínimas que faltan: staging aislado, identidad de plataforma, retención y
  uso de datos anonimizados. El resto de decisiones puede esperar sin bloquear
  la fundación.
- Se fijó en `15-contrato-fundacion.md` el contrato técnico de las entidades
  nuevas, restricciones, índices, RLS, capacidades y orden de migración, sin
  crear todavía un archivo SQL ejecutable.
- Se creó `16-matriz-tablas-y-alcance.md` para cubrir tablas secundarias que
  también deben aislarse o derivar su negocio: folios, disponibilidad,
  impresión, Push, reportes, autorizaciones privadas y WhatsApp de Mideli.
- Se comprobó que Docker no está instalado en este entorno, por lo que no es
  posible levantar una instancia local de Supabase para probar la migración.
  La siguiente prueba aislada requiere el Preview remoto o una instalación
  local de Docker aprobada por el operador.
- Se verificó en modo lectura el proyecto Vercel `mideli`: existe el proyecto
  productivo, pero las variables de Supabase aparecen solo en Production y no
  hay configuración equivalente para Preview. No se leyeron valores secretos.
- Se verificó que el proyecto Supabase remoto `Mideli` está saludable y ubicado
  en `us-east-2`; quedó preparado el comando para una rama persistente `micro`
  sin `--with-data`, pero no se ejecutó porque crear el recurso requiere la
  autorización explícita del operador.
- Con la autorización recibida se intentó crear `mideli-multibusiness-staging`;
  Supabase respondió `402 entitlement_required` porque Branching requiere Pro o
  superior. No se creó ninguna rama ni se modificó el proyecto productivo. La
  alternativa pendiente es una base Supabase separada, sujeta a cuota/costo.
- La línea base de aplicación se verificó de nuevo: `npm run lint` y
  `npm run build` pasaron sin errores.

## 2026-09-19: fundación versionada

- Se creó la migración aditiva `20260919082935_multibusiness_foundation.sql`
  con organizaciones, negocios, membresías, capacidades, auditoría, índices,
  triggers, RLS y privilegios explícitos.
- Se creó la migración separada
  `20260919083624_multibusiness_capability_catalog.sql` con las diez
  capacidades aprobadas. No se sembraron organizaciones, negocios, usuarios,
  membresías ni datos de Just Dipping.
- Las guardas de membresías limitan al Coordinador a `global_waiter` y al
  personal autorizado de un negocio a roles locales; las capacidades de
  plataforma no se pueden insertar desde el navegador.
- Se agregó `supabase/tests/multibusiness_foundation_test.sql` para comprobar
  tablas, RLS, catálogo y ausencia de datos inventados.
- `npx supabase db push --linked --dry-run` detecta únicamente estas dos
  migraciones pendientes. No se aplicaron porque el proyecto no tiene staging.
- `npx supabase test db` y el lint SQL local no pudieron ejecutarse porque no
  hay una base local levantada en `127.0.0.1:54322` y Docker no está instalado.
- La fundación queda pendiente de probar en staging antes de asociar Mideli o
  tocar cualquier tabla operativa.
- Se agregó `.github/workflows/verify.yml` para que GitHub ejecute lint, build,
  todas las migraciones locales y las pruebas pgTAP en un runner aislado. Es
  una verificación de CI, no un entorno Supabase compartido ni un deploy.

## 2026-09-19: primera rebanada sin staging de pago

- Se confirmó que no se creará otro proyecto Supabase ni se contratará Pro para
  esta etapa. La validación aislada se hará en GitHub Actions; la base remota
  sigue protegida hasta aprobar un `db push` explícito.
- Se agregó `20260919090030_multibusiness_global_waiter_capabilities.sql` con
  permisos organizacionales para que una mesera global pueda operar y cobrar en
  todos los negocios futuros.
- Se agregó `20260919090126_multibusiness_seed_mideli.sql`. Resuelve por nombre
  los perfiles activos existentes (`Administrador`, `andrea`, `mauro` y
  `Mideli`), crea únicamente Rincón 404 Food Park y Mideli, conserva los
  logins, deja la cuenta heredada sin capacidades y falla si los perfiles son
  ambiguos. En un Supabase local vacío se omite sin inventar usuarios.
- Se agregó `20260919091500_multibusiness_catalog_boundary.sql`. Asocia
  categorías y productos a Mideli, impide categorías cruzadas, reemplaza las
  políticas globales por RLS de membresía/capacidad y limita el reordenamiento
  al negocio correspondiente.
- Se agregó `20260919093000_multibusiness_order_boundary.sql`. Asocia los
  pedidos históricos a Mideli, exige `orders.business_id` y rechaza artículos
  cuyo producto pertenezca a otro negocio. Todavía no reemplaza el RLS de
  pedidos ni separa cuentas mixtas de mesa.
- Se agregó `20260919094500_multibusiness_table_visits_accounts.sql`. Define la
  visita compartida de una mesa y una cuenta independiente por negocio, con
  vínculos opcionales desde los pedidos y validaciones para evitar cruces. La
  interfaz aún no las crea; falta el RPC transaccional y el flujo visual.
- WhatsApp sigue exclusivo de Mideli y ahora filtra el catálogo por negocio
  cuando la fundación está disponible; conserva un fallback acotado para el
  despliegue gradual mientras faltan columnas en una base anterior.
- Se agregaron pruebas pgTAP estructurales para catálogo y pedidos, y se
  actualizó el catálogo esperado a doce capacidades.
- `npm run lint`, `npm run build`, `git diff --check` y
  `npx supabase db push --linked --dry-run` pasaron. El dry-run enumera cinco
  migraciones pendientes; todavía no se aplicaron al proyecto productivo.

## 2026-09-19: inventario, pedidos mixtos y frontera financiera

- Se agregó `20260919101500_multibusiness_inventory_boundary.sql`. Insumos,
  recetas, movimientos, conteos, compras, recibos y lotes quedan asociados al
  negocio; las recetas rechazan componentes de negocios distintos.
- Se agregó `20260919103000_multibusiness_order_batches.sql`. Una comanda de
  comedor puede agrupar productos de varios negocios, pero crea un pedido y
  una cuenta por negocio dentro de la misma visita. El RPC es idempotente,
  recalcula precios y variaciones desde el catálogo y revierte toda la
  transacción si una línea, permiso o negocio falla.
- Se agregó `20260919110000_multibusiness_financial_boundary.sql`. Caja,
  gastos, ajustes, pagos, asignaciones y correcciones conservan el negocio de
  origen. La restricción de caja abierta cambió de global a una por negocio.
  Los procedimientos actuales siguen usando Mideli como fallback controlado.
- La CI `Verify Mideli` ya comprueba estas migraciones y sus pruebas pgTAP en
  una base efímera. Los smoke tests operativos quedaron fuera del comando
  pgTAP porque requieren perfiles de producción y no son planes TAP.
- Ninguna de estas migraciones se ha aplicado a Supabase productivo. Falta la
  revisión remota y el flujo visual antes de permitir que una mesera cree
  comandas mixtas desde la interfaz.

## 2026-09-19: plano de mesas compartido con frontera de organización

- `20260919113000_multibusiness_table_map_boundary.sql` asocia zonas, mesas y referencias visuales a la organización `Rincón 404 Food Park`.
- Las mesas y visitas conservan una clave compuesta organización-mesa para impedir asociaciones cruzadas.
- Se reemplazaron las políticas globales heredadas por lectura por membresía y escritura mediante `organization.manage_tables`.
- La cuenta existente del dueño de Mideli recibe una membresía transitoria de organización y ese permiso para conservar la administración actual del plano sin cambiar su login.
- Los inserts existentes que no envían `organization_id` siguen resolviendo Mideli durante la transición.
- La migración todavía no se ha aplicado a producción; falta comprobarla en CI y después continuar con el contexto de negocio en la interfaz.

## 2026-09-19: contexto de negocio y pedido POS seguro

- `20260919114500_multibusiness_runtime_context.sql` agrega `get_my_multibusiness_context()`, que devuelve únicamente los negocios visibles para la sesión junto con el rol y capacidades efectivas.
- Se agregó `create_business_order_with_items(...)`. Recalcula el catálogo y las variaciones en PostgreSQL, rechaza artículos de otro negocio, comprueba la capacidad de operar y conserva idempotencia.
- El RPC antiguo de Mideli permanece durante la transición; WhatsApp no entra al selector.
- El contexto ya está conectado de forma gradual al catálogo, mesas y pedidos; la ausencia de las migraciones activa únicamente el fallback histórico de Mideli.
- Falta conectar caja, cobro, estados y la barra visual de selección. No se debe mostrar un selector hasta que esos consumidores usen el mismo negocio.

## 2026-09-19: guardas para editar pedidos por negocio

- `20260919120000_multibusiness_order_runtime_guards.sql` agrega la actualización de pedidos con validación de negocio y capacidad antes de delegar al procedimiento histórico de edición.
- Después de la migración se revocan los RPC históricos de crear y editar pedidos para que el cliente no pueda saltarse la frontera; la interfaz gradual usará los RPC nuevos.

## 2026-09-19: frontera financiera explícita

- `20260919121500_multibusiness_financial_runtime.sql` agrega un contexto de negocio transaccional para caja y cobros. El contexto se valida dentro de Supabase y no se guarda en la sesión ni en el navegador como una autorización.
- El POS puede abrir, consultar, operar y cerrar la caja del negocio seleccionado mediante una sola pasarela protegida. El modo anterior conserva los RPC de Mideli mientras la migración todavía no está aplicada.
- Los cobros ya rechazan pedidos o productos de otro negocio y las autorizaciones de descuento quedan vinculadas al negocio del ticket.
- El cierre de caja calcula pendientes y snapshots únicamente del negocio de ese turno; se evita mezclar pedidos no pagados de otros locales.
- El store de caja y el flujo de cobro ya usan la frontera nueva cuando el contexto multinegocio está disponible, y regresan al flujo histórico solo cuando faltan las migraciones.
- Se agregó `multibusiness_financial_runtime_test.sql` para verificar funciones, permisos, triggers y la implementación de cierre por negocio.
- La barra visual para cambiar de negocio todavía no se muestra: falta conectar los usuarios/membresías actuales, estados de preparación y navegación para que el cambio sea coherente en toda la sesión.

## 2026-09-19: selector visual e inventario aislado

- La barra de navegación ya muestra un selector de negocio únicamente cuando la
  cuenta realmente tiene más de un negocio visible. Con una sola membresía el
  diseño de Mideli no cambia.
- El selector guarda solo el identificador del negocio elegido en el navegador;
  la autorización sigue validándose en Supabase para cada operación.
- `20260919123000_multibusiness_inventory_runtime.sql` agrega una pasarela
  transaccional para conteos, movimientos, recetas, compras, recepciones y
  eliminación definitiva de insumos. Las políticas de escritura exigen el
  contexto transaccional; el RPC público destructivo queda cerrado y la
  pasarela valida antes de usar su implementación protegida.
- El store de inventario filtra todas sus lecturas por `business_id`, cambia de
  contexto al seleccionar otro negocio y conserva fallback solo para una base
  que todavía no tenga la fundación multinegocio.
- Se agregó una prueba pgTAP estructural para comprobar permisos, contexto,
  RLS y retiro de los RPC históricos. Todavía no se ha aplicado ninguna de
  estas migraciones a Supabase productivo.
- El negocio seleccionado también se replica como una pista de navegación en
  una cookie no sensible. El servidor la valida contra
  `get_my_multibusiness_context()` antes de filtrar historial y analíticas;
  nunca se usa como permiso.
- Historial de ventas, eliminación de pedidos y analíticas ya agregan el
  filtro del negocio seleccionado cuando la fundación está disponible. Al
  cambiar el selector, la vista server-side se refresca para no mostrar datos
  del negocio anterior.
