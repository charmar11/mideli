# Task: Evaluador temporal del piloto de WhatsApp

## Goal

Implementar una herramienta temporal para que owner/admin evalúen 25 conversaciones aisladas con catálogo, motor híbrido, Gemini y dos comprobaciones de Maps, sin enviar mensajes ni crear o persistir pedidos.

## Corrección posterior a la primera ejecución

- [x] Diagnosticar los dos fallos de Gemini y la revisión de Maps.
- [x] Exponer causas sanitizadas de dependencias en cada escenario.
- [x] Sustituir la ruta de distancia cero por un punto sintético cercano.
- [x] Agregar regresiones y ejecutar suite completa.
- [ ] Commit, actualización segura de Gemini y deploy autorizado.

## Phases

- [x] Fase 1: Revisar diseño, permisos, diagnóstico y banco de evaluación existente.
- [x] Fase 2: Definir tipos, escenarios e invariantes con pruebas.
- [x] Fase 3: Implementar cargador compartido y ejecutor seguro por bloques.
- [x] Fase 4: Integrar acción owner/admin e interfaz temporal móvil.
- [x] Fase 5: Ejecutar pruebas, lint, build y revisar seguridad/diff.
- [x] Fase 6: Commit y entrega local; despliegue solo con autorización nueva.

## Decisions

| Decisión | Motivo | Fecha |
|---|---|---|
| Ejecutar cinco escenarios por llamada | Evita timeouts de Vercel y muestra progreso | 2026-08-28 |
| No usar `processMetaWebhook` | Garantiza que el evaluador no contacte Meta ni persista mensajes | 2026-08-28 |
| Cotizar Maps con `conversationId: null` | Impide guardar domicilios o cotizaciones | 2026-08-28 |
| Sin migraciones ni dependencias | La herramienta debe poder eliminarse por completo tras el piloto | 2026-08-28 |
| Maps usará coordenadas sintéticas cercanas | Evita la ruta de cero metros sin emplear domicilios de clientes | 2026-08-28 |
| El reporte mostrará categorías de error, no contenido | Permite corregir credenciales o cuota sin exponer datos | 2026-08-28 |

## Errors Encountered

| Error | Intento | Resolución |
|---|---:|---|
| El comodín `whatsapp-*.spec.ts` no fue expandido al pasarlo a Playwright | 2 | Se confirmó que era el argumento de PowerShell y se usó una lista con splatting; 111 pruebas pasaron |
| La ejecución local de TypeScript no pudo resolver `server-only` | 2 | Se abandonó ese camino y se diagnosticaron Maps/Gemini directamente contra sus APIs sin leer ni mostrar claves |
| Una prueba segura de mensaje desconocido quedó como revisión por baja confianza | 1 | Se separó baja confianza esperada de fallos reales de autenticación, cuota, timeout o proveedor |
