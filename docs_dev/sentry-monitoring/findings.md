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
- Proyecto Sentry verificado: `javascript-nextjs`.
- La versión instalada admite `captureRouterTransitionStart`, `captureRequestError`, telemetría de build desactivable y borrado de source maps tras subirlos.

## Verificación real

- El evento controlado `8d17c6b0eb0843cfb4a2ee166ff93678` llegó al issue `JAVASCRIPT-NEXTJS-1`.
- Sentry conservó el título, la URL sin query string, el runtime y un frame de primera parte.
- La ruta local se guardó como `C:\Users\[usuario]\...`.
- No se guardaron ubicación real, nombre del equipo, hardware, cultura, correo, token ni contenido operativo.
- Node.js requirió la IP no enrutable `0.0.0.0` para impedir la inferencia geográfica de Relay. Por ello Sentry muestra una sola identidad técnica anónima y no personas reales.
- El endpoint temporal de verificación se eliminó y el issue sintético quedó resuelto.

## Dependencias

- npm reporta 6 vulnerabilidades transitivas en dependencias de producción.
- No se ejecutará `npm audit fix` automáticamente porque puede cambiar el árbol de dependencias fuera del alcance.
- El origen y la actualización segura se revisarán después de estabilizar la integración.

## Pendiente externo

- Vercel ya tiene `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG` y `SENTRY_PROJECT` en Development y Production. Se activarán en el siguiente despliegue.
- Preview quedó pendiente porque el CLI no interactivo de Vercel exige una rama concreta aunque su documentación permite aplicar la variable a todas las ramas.
- Configurar el token de build fuera del repositorio para subir source maps privados.
