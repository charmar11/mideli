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
- Se instaló `cloudflared` 2026.8.2 desde el paquete oficial de Windows.
- Se creó un asistente local que genera el token en el dispositivo, inicia Mideli, abre el túnel y muestra la URL sin exponer secretos al agente.
- No se aplicaron migraciones ni se desplegó.
- Meta verificó el callback temporal de desarrollo.
- El lanzador local se corrigió para comprobar el puerto sin bloquearse en la respuesta de Next.
- Se creó una migración local para clientes, domicilios, conversaciones, mensajes y pedidos externos idempotentes.
- Se implementó un repositorio de servidor y un procesador que responde en `dry-run` sin crear pedidos.
- El motor ahora responde saludos y muestra sugerencias sin contarlas como errores.
- Se creó un asistente local para introducir App Secret, token temporal, Phone Number ID y teléfono permitido sin escribirlos en archivos ni mostrarlos en el chat.
- TypeScript, ESLint, el build completo y 39 pruebas enfocadas pasan.
- `supabase db push --linked --dry-run` identifica solamente la migración nueva y no aplicó cambios.
- La validación local de PostgreSQL está pendiente porque Docker y Podman no están instalados.
- Se corrigió el fallo de Turbopack en desarrollo causado por el escaneo de junctions externos.

## Próximo paso

Completar la prueba real de mensajes Meta en `dry-run`, validar la migración en PostgreSQL y solicitar aprobación independiente antes de aplicarla al proyecto remoto.
