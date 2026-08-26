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
- Se añadió `/dashboard/whatsapp` con acceso para owner, admin, supervisor y waiter.
- Cocina queda redirigida fuera del canal de WhatsApp.
- Se creó un simulador responsivo con conversación, comanda viva y confirmación segura.
- El catálogo se carga en el servidor y el cliente recibe solo los datos necesarios.
- La navegación muestra WhatsApp según permisos en escritorio, tableta y móvil.
- `.env.example` documenta variables sin valores sensibles.
- `npm run lint`, las ocho pruebas enfocadas y `npm run build` pasan.
- Se implementaron firma HMAC, normalización de webhooks, configuración privada y adaptador de Meta.
- El endpoint `/api/integraciones/whatsapp/meta` valida el reto GET y la firma POST.
- El webhook solo acepta teléfonos de prueba permitidos y no responde automáticamente todavía.
- Una prueba HTTP local confirmó GET 200, POST firmado 200 y `dryRun: true`.
- Doce pruebas enfocadas y el build completo pasan con las rutas nuevas.
- No se aplicaron migraciones ni se desplegó.

## Próximo paso

Implementar Fase 3: firma, adaptador Meta y webhook local sin escrituras.
