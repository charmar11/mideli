# Plan: Hacer que Rincón 404 se sienta inmediato

## Meta

Reducir al máximo la espera percibida en Mesero, Estado, cobro e Historial, y
evitar que la aplicación se vuelva lenta al sumar negocios y dispositivos. La
optimización debe conservar exactitud de ventas, aislamiento por negocio,
permisos y recuperación de pedidos.

## Principio de trabajo

Medir primero y optimizar el cuello de botella comprobado. No añadir índices,
infraestructura de pago, cachés compartidas ni migraciones de Realtime por
intuición. No hacer pruebas de carga contra el turno de producción.

## Fases

- [ ] Fase 1: Cerrar un diagnóstico reproducible por flujo, dispositivo, red,
  frontend, acciones de servidor, Supabase y Realtime. Se confirmó que los logs
  actuales exponen PostgREST, PostgreSQL y Realtime; falta extraer métricas
  agregadas actuales y capturar la línea base de interacción.
- [~] Fase 2: Acelerar la experiencia principal: primer uso de Mesero,
  selección de menú, búsqueda, agregar/quitar productos, abrir comanda y
  cambiar a Estado. Reducir waterfalls, JavaScript inicial, renders y datos
  descargados; conservar la interfaz útil mientras actualiza. Primer ajuste,
  desplegado: Analíticas muestra sus métricas antes de terminar el control del
  dueño, manteniendo ambas consultas en paralelo. En Estado se desplegó una
  segunda mejora: cargar órdenes y artículos relacionados en una sola consulta;
  falta observar la respuesta real durante el turno.
- [ ] Fase 3: Optimizar pedidos, cobros, historial y analíticas desde consultas
  medidas: paginación donde corresponda, payloads pequeños, índices solo con
  plan de ejecución y agregaciones en servidor/base cuando el volumen lo
  justifique.
- [ ] Fase 4: Ajustar actualizaciones en vivo: suscripciones limitadas al
  negocio autorizado, reconexión y respaldo eficientes. Comparar Postgres
  Changes con Broadcast en una ruta aislada y migrar únicamente si las métricas
  demuestran una mejora sin debilitar RLS.
- [ ] Fase 5: Validar escritorio, tablet y teléfono con una prueba de carga
  controlada fuera del turno; comparar antes/después y desplegar en etapas con
  verificación y reversión rápida.
- [ ] Fase 6: Mantener límites de rendimiento y refactorizar archivos grandes
  de forma gradual solo donde el perfilador muestre costo o el tamaño impida
  seguir optimizando.

## Orden de impacto provisional

1. Medir la espera desde el toque hasta la respuesta en una sesión real y
   separar UI, red, servidor y base.
2. Revisar el camino de Estado: resolución de negocio, consulta de órdenes y
   consulta de artículos, además del sondeo y los eventos Realtime actuales.
3. Perfilar el paquete/hidratación de Mesero y renders del catálogo antes de
   refactorizar sus componentes grandes.
4. Medir consultas lentas y volumen; ajustar filtros, payloads e índices solo
   con evidencia.
5. Repetir la misma prueba en tablet y teléfono después de cada entrega.

## Medición y éxito

La primera fase registrará, sin datos personales ni contenido de pedidos:

- Tiempos p50/p95 y fallos para iniciar sesión, abrir Mesero, cargar/cambiar
  menú, buscar/agregar un producto, enviar un pedido, abrir Estado e Historial.
- Tiempo de respuesta y filas/payload de las consultas principales, y volumen,
  retraso y reconexiones de Realtime.
- Core Web Vitals y peso de JavaScript por vista, separados por teléfono,
  tablet y escritorio cuando haya muestra suficiente.

Los objetivos numéricos se fijan después de obtener esta línea base actual; no
se toma un pico aislado ni una prueba sintética como comportamiento normal. Una
mejora solo cuenta si no aumenta errores, pedidos duplicados/incompletos,
lecturas entre negocios ni datos desactualizados para el personal.

## Decisiones y límites

| Decisión | Motivo | Fecha |
|---|---|---|
| Priorizar la velocidad percibida por el personal durante el turno | Es el resultado de negocio solicitado | 2026-10-02 |
| Medir antes de cambiar caché, consultas, índices o Realtime | Evita optimizaciones contraproducentes y protege datos por negocio | 2026-10-02 |
| No hacer pruebas de carga en producción ni añadir servicios/costos sin evidencia | El sistema está en uso y el presupuesto importa | 2026-10-02 |
| Conservar un fallback de actualización y mostrar fallos con claridad | La rapidez no debe ocultar pedidos que no llegaron | 2026-10-02 |
| Publicar la carga desacoplada de Analíticas desde el árbol activo revisado | Evita revertir código en uso; el deploy de producción quedó READY | 2026-10-02 |
| En Estado, anidar artículos por sus FK en vez de hacer una segunda petición | Elimina una ronda de red sin cambiar filtros, membresía ni RLS; confirmar latencia real después de publicar | 2026-10-02 |
| No afirmar cuánto mejoró Estado solo por reducir solicitudes | Una menos vuelta de red es evidencia del cambio, no una medición de extremo a extremo | 2026-10-02 |

## Errores encontrados

| Error | Intento | Resolución |
|---|---:|---|
| El grafo Graphify actual devuelve demasiados nodos genéricos para este tema | 1 | Usarlo solo como índice y confirmar conclusiones con código, métricas y documentación vigente |
| La consulta de claves de atributos de logs remotos devolvió error del backend | 1 | No repetirla; usar consultas agregadas compatibles o medición local del flujo |
| El navegador de fuentes no abrió el changelog Markdown de Supabase por tipo de contenido | 1 | Consultar la documentación por el buscador oficial o la URL de documentación HTML |
| Dos intentos de parche documental no aplicaron por hunks mal formados | 1 | Separar cada archivo en un parche pequeño con contexto exacto; los archivos de aplicación permanecieron intactos |
| El explorador de esquema de logs no admite consultar el catálogo `system.columns` | 1 | No insistir; el diagnóstico de Postgres se obtuvo con `pg_stat_statements` y el catálogo PostgreSQL |
| Vercel MCP rechazó los dos esquemas probados para consultar el proyecto | 1 | No repetir; el estado de plan/Speed Insights queda sin verificar y no se activa nada que pueda generar costo |
| Un parche documental combinó referencias de contexto que no coincidían y otro contenía un hunk vacío | 1 | Leer el segmento actual y aplicar cambios pequeños por archivo; ningún archivo de aplicación fue tocado |
| Se intentó consultar `src/components/ui/skeleton.tsx`, que no existe | 1 | Definir el placeholder en el módulo de control diario existente, sin añadir dependencias |
| Un parche para actualizar el plan y los hallazgos no coincidió con las filas actuales | 1 | Volver a leer los fragmentos exactos y actualizar cada sección con contexto pequeño |
