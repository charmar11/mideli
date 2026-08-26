# Progreso: pedidos por WhatsApp

## 2026-08-25

- Se creó y aprobó la especificación funcional.
- Se creó la rama `codex/whatsapp-orders`.
- Se confirmó que Meta envía mensajes al destinatario de prueba.
- Se inspeccionaron pedidos, caja, impresión, inventario, navegación, rutas API y clientes Supabase.
- Se verificaron prácticas actuales de seguridad de Supabase.
- Se definió el plan de implementación por fases y sus puertas de seguridad.
- Se implementaron contratos, normalización, búsqueda segura de catálogo y motor conversacional puro.
- El motor admite productos múltiples, cantidades, variaciones, cambios, eliminación, domicilio, pago y confirmación explícita.
- Ocho pruebas enfocadas pasan en Playwright y TypeScript compila sin errores.
- Los módulos no contienen red, persistencia, impresión ni escritura comercial.
- No se aplicaron migraciones ni se desplegó.

## Próximo paso

Implementar Fase 2: bandeja protegida y simulador local en `dry-run`.
