# Hallazgos: rendimiento de Rincón 404

Fecha de revisión: 2026-10-02. Las métricas con otra fecha son fotografías
históricas y necesitan una nueva captura para ser una línea base actual.

## Evidencia existente

- En la captura consultada el 2026-10-02, Supabase reporta fuentes de logs
  `postgrest_logs`, `postgres_logs` y `realtime_logs`, entre otras. Una
  exploración agregada de nombres de atributos falló en el backend, por lo que
  todavía no se obtuvo una métrica actual de duración ni se consultaron filas
  crudas que pudieran contener datos operativos.
- La comprobación pública del 2026-10-02 a `https://mideli.vercel.app/api/health`
  respondió `status: ok` y versión `2b11bea0a00f`. Este endpoint no mide la base
  de datos ni el tiempo de las interacciones del personal.
- Vercel confirma que producción está `READY`, aliasada a `mideli.vercel.app`,
  creada desde CLI y asociada al mismo SHA que `HEAD` (`2b11bea0a00f`). La
  versión reportada por health coincide. El árbol local conserva cambios sin
  commit; no se publicará de nuevo todo ese árbol como parte de una optimización
  aislada.
- Vercel no mostró grupos de errores operativos recientes de pedidos; el único
  grupo visible es `Invalid Refresh Token: Refresh Token Not Found` en
  `/middleware` (4 eventos, última vez 2026-10-02). Es un problema de sesión,
  no evidencia de lentitud del POS, por lo que no se mezcla con la optimización
  de rendimiento.

- El contexto extendido documenta que una lectura autenticada del catálogo de
  81 productos bajó de 6.55 s a 68.6 ms al corregir una evaluación costosa de
  licencia por fila. Evidencia histórica: `.opencode/plans/mideli-context.md`,
  sección 15.
- La medición de Supabase del 2026-10-01 registra `GET /orders`: 1,464
  solicitudes, p95 321 ms, máximo 3,965 ms y cero HTTP 5xx; y
  `GET /channel_conversations`: 2,791 solicitudes, p95 516 ms, máximo 6,077 ms
  y cero HTTP 5xx. No hubo SQLSTATE 57014 en esa ventana. Son datos agregados,
  no demuestran por sí solos qué interacción sintió lenta la mesera.
- El contexto ya documenta mejoras: consultas iniciales en paralelo,
  deduplicación, caché breve de catálogo/mesas, carga diferida, precarga ociosa,
  agrupación de refrescos, chart de analíticas bajo demanda y caché en memoria
  por negocio para cambiar de menú.
- Historial dejó los topes antiguos de 500 pedidos/1,000 tickets y ahora pagina
  de 100 en 100. Analíticas usa lecturas paginadas para recuperar todas las
  filas, evitando reportes parciales por el límite de respuesta.
- En la revisión del 2026-10-01, el selector de menús ya había recibido una
  optimización y la dueña confirmó que el cambio repetido se percibía más
  rápido.
- Supabase recomienda usar planes de ejecución y patrones de consulta para
  decidir índices; indexar indiscriminadamente también encarece escrituras.
- El changelog oficial consultado no muestra un cambio reciente de Supabase
  que impida las consultas PostgREST anidadas; sí confirma el cambio del endpoint
  de logs de Management API en julio de 2026. La guía actual de joins indica que
  el anidamiento REST depende de relaciones/FK detectadas. Fuente: [changelog
  Supabase](https://supabase.com/changelog?types=breaking-change) y [guía de
  joins](https://supabase.com/docs/guides/database/joins-and-nesting).
- La documentación vigente de Supabase recomienda Broadcast frente a Postgres
  Changes cuando se busca más escalabilidad y seguridad, pero exige autorización
  de canales privados. No es un cambio seguro para aplicar sin pruebas de RLS.
- Vercel Speed Insights permite observar Core Web Vitals por entorno; se debe
  confirmar si está habilitado antes de asumir que ya hay datos de usuario real.
- La documentación oficial consultada indica que Speed Insights requiere
  habilitarse en el proyecto y añade una petición de cliente. Hobby incluye
  10,000 data points/mes; en Pro el servicio tiene una tarifa base de USD 10
  por proyecto/mes. Dado el límite de costo del usuario, no instalarlo ni
  habilitarlo hasta verificar el plan actual y el estado de la función.
- La consulta de Vercel devolvió solo el equipo personal y no incluye plan ni
  estado de Speed Insights. La herramienta `get_project` tuvo dos esquemas
  incompatibles en el conector; no se insistirá. No se habilitó ni se añadió la
  dependencia.

## Pendiente de confirmar en el código/entorno

- Nueva línea base actual por dispositivo y por pasos reales del flujo POS.
- Peso real de los chunks JS/hidratación y componentes más costosos de Mesero.
- Cuántos datos/consultas repite cada navegación y si todas las consultas
  operativas tienen proyección y límite adecuados.
- Frecuencia y alcance efectivo de polling, filtros de negocio en canales,
  eventos duplicados y reconexiones en terminales activas.
- Slow queries actuales con EXPLAIN, Advisor y métricas de lectura/escritura.
- Estado de Vercel Speed Insights, dashboards de Supabase Realtime y alertas,
  sin exponer usuarios, direcciones, teléfonos ni contenido de pedidos.

## Código revisado en esta sesión

- Mesero ya inicia catálogo, pedidos activos y mesas en paralelo, y carga
  Historial, Estado, variaciones, combos y cobro bajo demanda. Esto evita que el
  plan proponga rehacer optimizaciones existentes.
- El catálogo de Mesero ya usa caché temporal en memoria por negocio y carga
  categorías/productos en paralelo. Antes de ampliar esa caché hay que medir
  cuánto demora una selección con datos ya visitados y una carga fría.
- `fetchActiveOrders` primero espera el alcance de negocio y consulta hasta 200
  órdenes con una selección explícita de columnas. Los artículos ahora vienen
  anidados en la misma consulta; se conserva el timeout de 12 s y las órdenes
  sin artículos se representan como `items: []`. Esto elimina una ronda de red,
  pero todavía no demuestra una mejora de p50/p95; medirla en operación sin
  hacer pruebas de carga en producción.
- Las FK `order_items_order_id_fkey` y `order_items_menu_item_id_fkey` fueron
  verificadas en el esquema remoto de Supabase. El anidamiento usa esos nombres
  explícitos; las políticas SELECT de `orders` y `order_items` conservan
  membresía por negocio y gate de licencia del negocio padre. La revisión remota
  fue solo de esquema/policies, sin leer filas operativas.
- `src/lib/active-order-query.ts` normaliza la relación anidada al modelo que
  usa Estado, incluyendo modificadores, nombre relacionado, fallback de
  productos eliminados y pedidos sin artículos. Tres pruebas cubren la
  proyección, nombres, separación Mideli/Just Dipping y relaciones vacías. La
  ejecución dirigida pasó 60 pruebas contando escritorio, tablet y móvil;
  `npm run lint` y `npm run build` también pasan.
- Consulta de solo lectura a estadísticas actuales de PostgreSQL: estimados de
  269 filas vivas en `orders` y 452 en `order_items`; counters acumulados de
  secuencial/índice existen, pero no se conoce el último reset, así que no se
  interpretan como carga de hoy ni justifican índices.
- Se confirmó `pg_stat_statements_info.stats_reset = 2026-07-21T03:06:43Z`;
  por tanto sus conteos/medias incluyen aproximadamente 73 días y no describen
  el estado de hoy. El asesor Supabase muestra 60 FKs sin índice en todo el
  proyecto, pero sí existen `idx_order_items_order`, `orders_business_created_at_idx`
  y otros índices base en tablas de pedidos/cobros. No se tocarán índices solo
  por la lista global del asesor.
- `pg_stat_statements` presenta varios patrones que coinciden con SQL de
  pedidos/artículos con medias de ~143–283 ms y máximos de ~1.3–7.4 s en 60–191
  ejecuciones; las consultas aún no están identificadas por plantilla. Esto es
  evidencia para investigar formas SQL, no una medición p95 de usuario ni
  necesariamente una ventana de 24 horas.
- Las guías de PostgreSQL/Supabase revisadas recomiendan identificar la forma
  SQL, revisar índices de FK/filtros y planes antes de tocar el esquema. La
  estadística de `pg_stat_statements` no da p95 y no se conoce `stats_reset`; no
  se deben reiniciar contadores de producción para esta prueba ni interpretar
  sus acumulados como datos de 24 horas.
- El patrón con media 282.5 ms y máximo 7.4 s coincide con
  `fetchOwnerOperationalData.soldOrdersQuery` en
  `src/lib/owner-report/data.ts`: descarga IDs y artículos de ventas pagadas
  por negocio/periodo sin límite explícito, para agregar en TypeScript.
- El patrón de 142.8 ms de media y 4.1 s de máximo coincide con la proyección
  anidada usada por analíticas, que trae pedido, artículos, producto y categoría.
  Son flujos distintos al Estado y constituyen objetivos medibles del diagnóstico.
- Analíticas pagina cada 500 filas en secuencia y solo pide páginas adicionales
  cuando una alcanza exactamente el límite. Con el estimado actual de 269
  pedidos pagados, la lectura habitual requiere una página; no conviene
  reemplazarla por RPC/aggregates hasta medir payload y render en producción.
- El control diario ya ejecuta sus nueve lecturas independientes en paralelo;
  la selección de ventas pagadas es pequeña hoy y no muestra un waterfall de
  consultas dentro de esa carga.
- La ruta `src/app/dashboard/analiticas/page.tsx` espera en `Promise.all` tanto
  `fetchAnalytics` como `fetchOwnerControl` antes de renderizar la página. El
  control del dueño tiene patrones SQL acumulados más lentos que analíticas;
  por lo tanto puede retrasar toda la pantalla aunque el contenido principal
  esté listo. Se implementó una separación local: ambas consultas empiezan en
  paralelo, pero la ruta espera solo las métricas; el control se transmite en
  su propio límite Suspense, después del resumen principal. Si falla, conserva
  las métricas y ofrece reintentar. No cambia consultas, cálculos, permisos ni
  datos de negocio.
- El árbol de trabajo tiene numerosas modificaciones anteriores ajenas a esta
  tarea (incluidos clientes, impresión, permisos, archivos de marca y dos
  migraciones nuevas). No desplegar todo el árbol para validar una optimización
  aislada sin identificar primero el alcance exacto de publicación.
- La publicación anterior de Vercel estaba `READY`, apuntaba al mismo SHA de
  `HEAD` y reportaba `gitDirty=1`. Antes de publicar, se compararon fechas de
  modificación: los archivos de aplicación pendientes eran anteriores a esa
  publicación y la única edición posterior ajena a esta tarea era una nota
  interna de contexto. Con esa evidencia se desplegó desde el árbol activo, sin
  descartar los cambios que ya estaban en uso. El nuevo deploy quedó `READY` y
  aliasado a `mideli.vercel.app`; no se aplicaron migraciones.
- Realtime escucha `orders` y `order_items` sin filtrar en el canal por
  negocio; cada cambio agrupa un refresco y, mientras la pestaña está visible,
  existe un sondeo de respaldo cada 15 s. Es un candidato de alto impacto para
  separar tráfico por negocio y reducir consultas, sujeto a preservar el acceso
  organizacional de meseras globales.
- La búsqueda de `src`, `package.json` y la configuración no encontró
  `@vercel/speed-insights`, mediciones de Web Vitals ni marcas propias de
  rendimiento. Sentry sí existe, pero monitorear errores no equivale a medir
  cuánto tarda cada interacción.
- La aplicación ya tiene división de código para Estado, Historial, variaciones,
  combos, cobro y la gráfica de analíticas. Confirmar el peso de bundles antes
  de agregar más `dynamic()` o mover componentes.
- La mejora de Estado quedó desplegada en Vercel como `dpl_67Gv38V6B9c6awrCXGuqvMV8tGiC`, `READY`, alias `mideli.vercel.app`. `/api/health` respondió `ok` y sigue reportando el SHA de Git `2b11bea0a00f`, porque este deploy se hizo desde el árbol local sin commit. Falta observar la apertura en dispositivos del local y recoger una medición real; no atribuir un porcentaje de aceleración hasta tener esa evidencia.

## Riesgos a evitar

- Caché compartida sin incluir negocio, permisos y vigencia de licencia en su
  límite: puede filtrar información de un local a otro.
- Reducir refrescos sin fallback: puede dejar cocina/mesera viendo estados
  viejos cuando se pierda un evento.
- Cambiar a Broadcast enviando payloads completos: aumenta el costo y puede
  publicar información innecesaria; preferir eventos mínimos y recargar datos
  autorizados por el servidor.
- Índices, réplicas, servicios externos o planes de pago sin medir beneficio
  real y costo de mantenimiento.
