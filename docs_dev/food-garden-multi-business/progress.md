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
- La línea base de aplicación se verificó de nuevo: `npm run lint` y
  `npm run build` pasaron sin errores.
