# Diseño de monitoreo de errores con Sentry

Fecha: 2026-08-08
Estado: aprobado para implementación

## Objetivo

Detectar fallos reales de Mideli en producción, conocer la ruta y versión afectadas y disponer de trazas suficientes para encontrar la causa sin recolectar datos sensibles del personal, pedidos o clientes.

## Alcance de esta fase

- Integrar `@sentry/nextjs` con Next.js 16 App Router.
- Capturar errores no controlados del navegador, servidor y runtime Edge.
- Registrar trazas de rendimiento con muestreo limitado.
- Subir mapas de código durante el build para obtener errores legibles.
- Conservar las pantallas de error actuales de Mideli.
- Filtrar ruido producido por extensiones del navegador.
- Verificar un error controlado en desarrollo y confirmar su recepción mediante Sentry MCP.

Quedan fuera de esta fase:

- Session Replay.
- Logs enviados a Sentry.
- Profiling y métricas personalizadas.
- Captura de cuerpos de solicitudes, cookies, cabeceras, consultas o datos personales.
- Alertas comerciales o reportes diarios del dueño.
- Respaldos de Supabase, que tendrán un diseño y una verificación separados.

## Enfoques considerados

### 1. Integración manual con privacidad estricta

Es el enfoque elegido. Permite conservar `next.config.ts`, la integración de Serwist y las fronteras de error existentes. También permite declarar de forma explícita qué se captura y qué se elimina.

### 2. Asistente automático de Sentry

Reduce pasos iniciales, pero puede reescribir archivos de configuración, agregar una ruta de demostración y habilitar funciones que Mideli no necesita. No se usará para evitar cambios amplios y difíciles de auditar.

### 3. Captura mínima solo en cliente

Es más simple, pero dejaría sin visibilidad los errores de Server Components, rutas API, proxy y runtime Edge. No cubre un POS que depende de operaciones de servidor.

## Arquitectura

### Configuración por runtime

- `src/instrumentation-client.ts`: inicializa Sentry en el navegador.
- `sentry.server.config.ts`: inicializa Sentry en Node.js.
- `sentry.edge.config.ts`: inicializa Sentry en Edge.
- `src/instrumentation.ts`: carga la configuración correcta según el runtime y reporta errores de solicitudes del servidor.
- `src/app/error.tsx`: conserva la recuperación visual y reporta el error capturado.
- `src/app/global-error.tsx`: conserva la recuperación global y reporta el error capturado.
- `next.config.ts`: mantiene el wrapper de Serwist y agrega `withSentryConfig` en el orden compatible con ambos plugins.

### Variables de entorno

- `NEXT_PUBLIC_SENTRY_DSN`: identifica el proyecto para navegador y servidor.
- `SENTRY_AUTH_TOKEN`: se usa solo durante builds para subir mapas de código.
- `SENTRY_ORG`: organización de Sentry.
- `SENTRY_PROJECT`: proyecto de Sentry.

Los valores reales se configurarán fuera del repositorio. `.env.example` documentará únicamente los nombres y su propósito.

### Flujo de un error

1. Ocurre un error no controlado en navegador, servidor o Edge.
2. El SDK crea un evento con ruta, runtime, versión y traza técnica.
3. Los filtros eliminan información sensible y ruido conocido.
4. Sentry agrupa el evento en un issue.
5. Sentry MCP permite consultar el issue y validar que la traza sea legible.

## Privacidad y reducción de ruido

- `sendDefaultPii` permanecerá desactivado.
- No se enviarán cuerpos, cookies, cabeceras ni parámetros de consulta.
- No se asociarán nombres, correos, teléfonos ni identificadores del personal.
- `beforeSend` eliminará información sensible residual y descartará errores originados exclusivamente por extensiones del navegador.
- Se filtrarán los errores conocidos con mensajes como `Permission denied to access property` cuando sus frames pertenezcan a extensiones o scripts inyectados.
- La ruta `/api/health` no generará trazas para evitar ruido del monitor de disponibilidad.
- No se registrarán notas, productos, datos de mesa ni contenido de pedidos como contexto adicional.

## Rendimiento y costos

- Desarrollo: muestreo de trazas al 100 por ciento para facilitar la verificación local.
- Producción: muestreo inicial al 10 por ciento.
- Errores: se capturan siempre que Sentry esté configurado.
- Sin Replay, profiling, logs ni métricas para mantener bajo el uso del plan gratuito.
- El SDK no bloqueará el flujo de pedido, cocina o cobro si Sentry está caído.

## Compatibilidad con Mideli

- Las pantallas de error seguirán permitiendo reintentar.
- Serwist continuará generando el service worker de la PWA.
- La integración no cambiará Supabase, autenticación, RLS ni el esquema de datos.
- No se agregarán rutas de prueba visibles en producción.
- La configuración debe funcionar aunque las variables de Sentry no existan, para no bloquear desarrollo local ni builds de contingencia.

## Verificación

1. Ejecutar ESLint.
2. Ejecutar el build de producción.
3. Ejecutar la suite E2E existente.
4. Levantar Mideli localmente con Sentry configurado.
5. Provocar un error controlado desde una ejecución temporal, sin dejar una ruta de prueba publicada.
6. Consultar el evento mediante Sentry MCP.
7. Confirmar título, mensaje, URL y frames legibles.
8. Confirmar que no aparezcan datos personales, cookies, cuerpos ni parámetros sensibles.
9. Confirmar que `next.config.ts` siga produciendo el service worker de Serwist.

## Criterios de aceptación

- Los errores de cliente, servidor y Edge llegan al proyecto correcto.
- Los mapas de código permiten identificar archivos fuente.
- Las fronteras de error de Mideli conservan su interfaz y recuperación.
- Las extensiones del navegador no generan issues accionables falsos.
- `/api/health` no contamina las trazas.
- No se recolectan datos personales ni contenido operativo.
- `npm run lint`, `npm run build` y las pruebas E2E finalizan correctamente.
- Un evento real de verificación se puede consultar con Sentry MCP.

## Riesgos y mitigaciones

- Orden incorrecto de wrappers en Next.js: verificar el build y la salida de Serwist.
- Mapas de código ausentes: comprobar las variables de build y una traza real.
- Exceso de eventos: mantener muestreo bajo y filtros específicos.
- Filtrado excesivo: descartar solo ruido identificable por origen y conservar errores propios de Mideli.
- Sentry no disponible: el SDK debe fallar de forma aislada y nunca impedir operaciones del POS.
