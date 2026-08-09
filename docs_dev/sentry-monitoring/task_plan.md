# Tarea: Integrar Sentry con privacidad estricta

## Objetivo

Instrumentar Mideli en navegador, servidor y Edge sin afectar Serwist, el flujo operativo ni la privacidad.

## Fases

- [x] Fase 1: Investigar el proyecto y definir el diseño.
- [x] Fase 2: Conectar y autenticar Sentry MCP.
- [x] Fase 3: Inspeccionar configuración y fronteras de error actuales.
- [x] Fase 4: Instalar y configurar `@sentry/nextjs`.
- [x] Fase 5: Aplicar filtros de privacidad y ruido.
- [x] Fase 6: Verificar lint, build, E2E y Serwist.
- [x] Fase 7: Verificar un evento real mediante Sentry MCP después de recargar Codex.

## Decisiones

| Decisión | Motivo | Fecha |
|---|---|---|
| Integración manual | Evita que el asistente automático sobrescriba Serwist o las pantallas de error | 2026-08-08 |
| Errores y trazas solamente | Mantiene el uso bajo y evita funciones innecesarias | 2026-08-08 |
| Sin datos personales | Mideli contiene información operativa que no debe salir del sistema | 2026-08-08 |
| Muestreo del 10 por ciento en producción | Ofrece señal útil con costo y sobrecarga limitados | 2026-08-08 |

## Errores encontrados

| Error | Intento | Resolución |
|---|---|---|
| El ejecutable empaquetado de Codex devolvió acceso denegado | 1 | Se usó el CLI oficial en una carpeta temporal |
| La unidad C no tenía espacio | 1 | El usuario liberó espacio antes de continuar |
| Las herramientas MCP no aparecen en la sesión actual | 1 | La configuración quedó autenticada; Codex debe recargarse para exponerlas |
| El build exigió que `beforeSend` devolviera `ErrorEvent` | 1 | Se estrechó la firma del filtro sin cambiar su comportamiento |
| `TracesSamplerSamplingContext` no se reexporta desde `@sentry/nextjs` | 1 | Se definió una interfaz estructural mínima para no depender de un paquete transitivo |
| `git diff --check` detectó líneas vacías finales | 1 | Se retiraron antes de crear el commit |
| El servidor de desarrollo conservó la configuración anterior tras el hot reload | 1 | Se reinició solo el proceso de Next.js antes de repetir la verificación |
| Sentry infirió geolocalización con `ip_address: null` en Node.js | 1 | Se usa la IP no enrutable `0.0.0.0`, se elimina la ubicación real y todos los eventos comparten una identidad técnica anónima |
