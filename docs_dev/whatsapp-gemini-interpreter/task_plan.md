# Task: Intérprete híbrido de pedidos con Gemini

## Goal

Mejorar la comprensión de pedidos naturales sin hacer que Gemini controle reglas críticas ni sea requisito para operar.

## Phases

- [x] Phase 1: Auditar arquitectura y reproducir errores
- [x] Phase 2: Agregar pruebas fallidas
- [x] Phase 3: Implementar contexto determinista
- [x] Phase 4: Implementar Gemini y validación
- [x] Phase 5: Integrar y documentar configuración
- [x] Phase 6: Verificar y revisar el diff

## Decisions

| Decision | Rationale | Date |
|---|---|---|
| Mantener motor híbrido | El flujo no puede depender de una API gratuita | 2026-08-26 |
| No enviar PII | La modalidad gratuita puede usar contenido para mejorar productos | 2026-08-26 |
| Gemini devuelve datos, no mensajes | Mideli conserva tono y reglas del negocio | 2026-08-26 |
| Mantener creación de órdenes desactivada | El usuario está validando el piloto | 2026-08-26 |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| Playwright no tiene proyecto `chromium` | Ejecución dirigida inicial | Usar el proyecto configurado `desktop` |
| `npm run lint` inspeccionó artefactos de Playwright y produjo errores ajenos al código | Primera verificación global | Eliminar únicamente `playwright-report/` y `test-results/` generados por esta ejecución y repetir |
| Playwright no expandió `tests/e2e/whatsapp-*.spec.ts` en PowerShell | Suite completa de WhatsApp | Ejecutar los seis archivos de forma explícita |
