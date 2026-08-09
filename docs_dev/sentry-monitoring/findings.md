# Hallazgos de Sentry

## Proyecto

- Next.js 16.2.12 con App Router.
- `next.config.ts` exporta `withSerwist(nextConfig)` y no tiene otros wrappers.
- Mideli ya tiene `src/app/error.tsx` y `src/app/global-error.tsx` con recuperación personalizada.
- No existen archivos previos de instrumentación o configuración Sentry.
- Existe `/api/health`, que debe excluirse del muestreo de trazas.
- La interfaz ha recibido ruido de extensiones con mensajes `Permission denied to access property`.
- El proyecto usa `package-lock.json` y npm.

## Integración elegida

- SDK: `@sentry/nextjs` 10.69.0, compatible con Next.js 16 según sus peer dependencies.
- Inicialización separada para navegador, Node.js y Edge.
- `sendDefaultPii: false`.
- Sin Replay, logs, profiling ni métricas.
- Trazas al 100 por ciento en desarrollo y 10 por ciento en producción.
- Source maps privados durante builds configurados.
- Sentry MCP autenticado para la organización `mideli`.
- La versión instalada admite `captureRouterTransitionStart`, `captureRequestError`, telemetría de build desactivable y borrado de source maps tras subirlos.

## Dependencias

- npm reporta 6 vulnerabilidades transitivas en dependencias de producción.
- No se ejecutará `npm audit fix` automáticamente porque puede cambiar el árbol de dependencias fuera del alcance.
- El origen y la actualización segura se revisarán después de estabilizar la integración.

## Pendiente de comprobar

- Nombre o identificador exacto del proyecto Sentry.
- DSN y token de build configurados fuera del repositorio.
- Recepción de un error real y calidad de sus frames.
