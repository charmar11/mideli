# Progreso de integración Sentry

## 2026-08-08

- Se leyó el contexto extendido de Mideli.
- Se descargó y siguió la guía oficial de instrumentación de Sentry.
- Se conectó y autenticó `https://mcp.sentry.dev/mcp/mideli`.
- Se aprobó y guardó la especificación de privacidad y monitoreo.
- Se inició el plan de implementación.
- Se instaló `@sentry/nextjs` 10.69.0.
- Se configuraron navegador, Node.js y Edge.
- Se agregaron filtros de privacidad, ruido de extensiones y exclusión de `/api/health`.
- Se integró `withSentryConfig` por fuera de Serwist.
- `npm run lint` finalizó correctamente.
- Primer build: compilación y hook de Sentry correctos; TypeScript detectó una firma demasiado amplia en `beforeSend`.
- `npx tsc --noEmit` finalizó correctamente después de ajustar los tipos públicos del SDK.
- `npm run build` finalizó correctamente.
- Serwist generó 72 entradas de precache y conservó `sw.js` y su source map.
- Los 21 smoke tests pasaron en escritorio, tablet y móvil.
- La prueba aislada de privacidad confirmó redacción, limpieza de solicitudes, eliminación de breadcrumbs de consola, filtrado del error inyectado y exclusión de `/api/health`.
- Verificación final repetida: TypeScript, ESLint, build y 21 smoke tests correctos.
- Pendiente externo: recargar Codex, crear o seleccionar el proyecto Sentry, configurar sus variables y consultar un evento real mediante MCP.

## 2026-08-09

- Codex se recargó y expuso las herramientas de Sentry MCP.
- Se identificó el proyecto `javascript-nextjs` y su DSN público.
- Se enviaron eventos controlados para revisar el contenido real almacenado por Sentry.
- La primera verificación reveló geolocalización, hostname, contextos de hardware y rutas locales completas.
- Se desactivó la detección de hostname y los contextos de entorno no esenciales.
- Se amplió el saneamiento a `abs_path`, debug images y entradas de log.
- Se optó explícitamente por no recolectar usuario, cookies, headers, cuerpos, query params, GraphQL, contenido generativo, consultas de base ni variables locales.
- La verificación final `8d17c6b0eb0843cfb4a2ee166ff93678` conservó diagnóstico útil sin ubicación real, nombre del equipo, hardware, cultura ni nombre de usuario en rutas.
- El issue sintético [JAVASCRIPT-NEXTJS-1](https://mideli.sentry.io/issues/JAVASCRIPT-NEXTJS-1) quedó resuelto y el endpoint temporal se retiró.
- Vercel recibió las cuatro variables públicas de runtime de Sentry para Development y Production sin guardar valores en el repositorio.
- Preview y el token privado para source maps permanecen como configuración externa pendiente.
