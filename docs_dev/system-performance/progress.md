# Avance: optimización de rendimiento

## 2026-10-02

- Se cambió la prioridad de trabajo: primero velocidad percibida en operación,
  luego escalabilidad medida; la refactorización queda subordinada a evidencia.
- Se leyeron las reglas del proyecto, el contexto acumulado, el índice y el
  proceso de trabajo. Se revisaron las skills de planificación, Graphify,
  Supabase y rendimiento React/Next.js.
- Se contrastaron mediciones históricas del contexto y documentación oficial
  vigente de Supabase/Vercel. Falta auditar las rutas de código y establecer una
  captura nueva, así que todavía no hay objetivos numéricos ni cambios de
  rendimiento implementados.
- Auditoría estática: Mesero ya carga catálogo/pedidos/mesas en paralelo y usa
  caché de catálogo por negocio; Estado obtiene primero el alcance, consulta
  hasta 200 pedidos y después sus artículos; Realtime escucha ambas tablas sin
  filtro de negocio y el respaldo sondea cada 15 segundos. No se encontró
  instrumentación de Web Vitals/Speed Insights en el código.
- Se reordenó el plan para medir primero la respuesta visible en Mesero/Estado,
  y priorizar luego sus rondas de red y actualizaciones Realtime antes de una
  refactorización amplia.
- No se modificó la aplicación, Supabase ni Vercel.
- La consulta de solo lectura a Supabase confirmó que existen logs de PostgREST,
  PostgreSQL y Realtime durante la ventana disponible. La consulta de atributos
  devolvió un error genérico; se dejó registrado y no se insistió ni se leyeron
  logs crudos.
- La salud pública de producción respondió correctamente (`ok`, versión
  `2b11bea0a00f`), aunque no ofrece métricas de latencia de base ni de UI.
- Vercel reporta únicamente errores de refresh token recientes en middleware;
  no hay grupo de error de pedidos que explique una lentitud general.
- Se revisó el changelog vigente de Supabase y su guía oficial de joins; una
  posible optimización de consultas anidadas requiere confirmar las FK y los
  tipos reales del proyecto antes de aplicarla.
- Se identificó un waterfall en `fetchActiveOrders`: pedidos y artículos se
  consultan secuencialmente. La opción de anidarlos queda en validación; el
  worktree contiene cambios previos no relacionados que impiden un deploy
  indiscriminado.
- La migración base confirma la FK `order_items.order_id -> orders.id`, y las
  policies vigentes atan la lectura de artículos a negocio/membresía/licencia.
- Los tipos de dominio son interfaces manuales; el helper para resolver nombre
  de producto ya acepta relación `menu_items` anidada.
- Las estadísticas PostgreSQL actuales estiman 269 pedidos y 452 artículos.
  `pg_stat_statements` muestra patrones relacionados con esos nombres con
  medias de 143–283 ms y máximos de 1.3–7.4 s; son acumuladas y todavía deben
  mapearse a plantillas sanitizadas. No se añadieron índices.
- La plantilla de mayor latencia filtra pedidos pagados por negocio y periodo
  y anida artículos; el código tiene consultas coincidentes en reportes de
  propietario/analíticas. Se revisará primero la proyección y la paginación de
  esas lecturas para decidir si el retraso es carga evitable o agregación real.
- Se leyeron las guías de Supabase Postgres sobre estadísticas, EXPLAIN,
  filtros/FK, RLS y paginación. Las estadísticas actuales no revelan p95 ni
  ventana temporal exacta; no se reiniciarán contadores en producción.
- Se identificaron dos plantillas remotas: el control diario del dueño baja
  IDs y artículos pagados completos del periodo sin límite antes de agregarlos
  en TypeScript; analíticas baja pedidos con artículos, nombres y categorías.
  La carga de reportes ya ejecuta sus consultas principales en paralelo.
- Se confirmó que `pg_stat_statements` acumula desde 2026-07-21, así que no es
  una muestra reciente. Asesor Supabase marca 60 FKs sin índice en varias tablas
  y policies RLS de perfiles/audit-events con initplan; ninguna observación
  justifica por sí sola alterar el esquema de pedidos o producción.
- Vercel confirma que producción `mideli.vercel.app` está READY y su versión
  coincide con el HEAD local. Hay cambios sin commit en el árbol, por lo que
  cualquier deploy debe aislar el conjunto exacto a publicar.
- Analíticas usa páginas de 500 y hoy estima 269 pedidos; el control diario ya
  inicia sus consultas en paralelo. No se hará una migración de agregados sin
  evidencia de payload/render que lo justifique.
- Se encontró un bloqueo de render concreto: la ruta de Analíticas espera a la
  vez los datos analíticos y el control operativo del dueño. El panel lento
  puede retrasar toda la página; se evaluará desacoplarlo manteniendo el
  contenido principal visible primero.
- Línea base estática local del árbol actual: `npm run lint` pasó y
  `npm run build` pasó con Next.js 16.3.5 (TypeScript y generación de 26 rutas
  completados). El build no incluyó tamaños de chunks por ruta. Aún no se ha
  modificado código de aplicación ni desplegado una optimización.
- La documentación oficial de Vercel confirma que Speed Insights requiere
  activación del proyecto y puede costar USD 10/mes en Pro. Se verificará el
  plan actual antes de decidir si se agrega la dependencia; no se autorizará
  costo ni cambio a Pro.
- El conector de Vercel no pudo devolver la ficha del proyecto por una
  incompatibilidad de esquema, y el listado de equipos no muestra el plan. Por
  seguridad no se añadió Speed Insights ni se activó una función facturable.
- Se separó la carga de Analíticas: la ruta inicia en paralelo el reporte del
  dueño, espera solo `fetchAnalytics` y muestra las métricas principales antes
  del panel operativo. El panel incluye placeholder y un reintento si falla;
  no se alteraron permisos, cálculos, tablas ni consultas.
- Validación del cambio: `npm run lint`, `npm run build` y
  `npx playwright test tests/e2e/analytics-period.spec.ts` pasaron; Playwright
  ejecutó 21 pruebas en escritorio, tablet y móvil.
- La publicación anterior compartía SHA con `HEAD` y Vercel indicaba
  `gitDirty=1`. Se compararon las fechas de los cambios locales para confirmar
  que el código activo no tenía ediciones posteriores; luego se hizo deploy
  real con `vercel --prod --yes`. Vercel terminó `READY`, asignó
  `https://mideli.vercel.app` y no se aplicaron migraciones.
- Siguiente optimización concreta: `fetchActiveOrders` hacía primero la
  consulta de órdenes y luego otra solicitud para sus artículos. Se cambió a
  una relación anidada en la misma solicitud, conservando columnas, filtros,
  normalización y el modelo que consume Estado. Las FK y políticas RLS vigentes
  se verificaron de manera de solo lectura en Supabase; no se consultaron ni
  modificaron filas operativas.
- Se añadieron pruebas para las FK explícitas, nombres anidados, separación
  Mideli/Just Dipping y órdenes con artículos vacíos o eliminados. Pasaron 60
  pruebas Playwright entre escritorio, tablet y móvil, además de lint y build.
  Deploy real `dpl_67Gv38V6B9c6awrCXGuqvMV8tGiC` quedó `READY`, alias
  `https://mideli.vercel.app`; `/api/health` respondió `ok` con SHA
  `2b11bea0a00f`. Falta observar la apertura en los dispositivos del local; no
  se atribuye todavía un porcentaje de aceleración.
