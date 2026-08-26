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

La implementación local aprobada quedó completa:

- Motor textual con catálogo por categorías, páginas de cinco productos, descripciones, variaciones, bebida, carrito, domicilio, referencia, pago y confirmación.
- Cotización en servidor con Google Geocoding y Routes, rangos por kilómetros, recargos por colonia y transferencia humana fuera de cobertura.
- Centro de control responsivo con resumen, conversaciones, catálogo de WhatsApp, entregas, horarios, bot y simulador.
- Atención humana con toma de conversación, respuesta directa, devolución al bot y cierre.
- Avisos idempotentes desde Cocina y Estado para preparación, listo, búsqueda de repartidor y repartidor en camino.
- Retención configurable de contenido y endpoint de limpieza protegido por `CRON_SECRET`.
- Compatibilidad segura mientras las dos migraciones continúan pendientes en Supabase remoto.
- 60 pruebas enfocadas pasan en escritorio, tableta y móvil.
- `npm run lint`, `npm run build`, `git diff --check` y `npx supabase db push --linked --dry-run` pasan.
- La página pública se verificó con navegador local sin overlay ni contenido vacío; la ruta protegida redirige correctamente a login.

## Próximo paso

Revisar y aprobar por separado la aplicación de las migraciones remotas. Después configurar la clave restringida de Google Maps, activar las opciones de forma gradual y ejecutar un pedido integral con el número de prueba antes de cualquier despliegue.
# Cierre operativo del piloto, 2026-08-26

- El webhook de Meta confirma recepción antes de ejecutar catálogo, Google Maps o Supabase mediante `after()` de Next.js.
- Los archivos no compatibles pasan a atención humana y el reclamo de conversaciones es exclusivo para evitar respuestas simultáneas.
- El carrito se vuelve a validar al confirmar. Si un producto dejó de estar disponible, se retira, se recalcula el total y se exige una nueva confirmación.
- La bandeja humana muestra productos, total, entrega, domicilio y pago.
- Se añadieron diagnóstico seguro, excepciones de horario y reintento manual de notificaciones fallidas.
- Los domicilios confirmados se conservan y se ofrecen en pedidos futuros, recalculando siempre la tarifa.
- Verificación local: ESLint correcto, build de producción correcto y 75 pruebas WhatsApp aprobadas en escritorio, tablet y móvil.
- Despliegue productivo listo en `https://mideli.vercel.app`, todavía con creación de pedidos y cotización automática apagadas en la base.

## 2026-08-26: persistencia y voz del piloto

- Se reprodujo el problema con la conversación real compartida por el usuario.
- Se confirmó que Meta sí entrega y recibe respuestas; el fallo principal es la memoria efímera usada por `WHATSAPP_DRY_RUN=true` en Vercel.
- Se aprobó persistir mensajes y estado en Supabase durante el piloto, con un bloqueo independiente que impida crear pedidos operativos.
- Se aprobó mejorar la voz de Mideli, los alias de categorías, los mensajes con varias intenciones y la bandeja de respuesta humana.
- El diseño aprobado vive en `docs/superpowers/specs/2026-08-26-whatsapp-voice-persistence-design.md`.
- El motor reconoce categoría singular y plural, prioriza una categoría específica sobre `menú` y procesa producto más navegación en el mismo mensaje.
- La conversación reportada quedó cubierta de principio a fin, incluido el rechazo de bebida con `No gracias`.
- La bandeja carga el historial automáticamente, se actualiza cada diez segundos y refresca el mensaje enviado desde Mideli.
- `WHATSAPP_ORDER_CREATION_ENABLED` añade un bloqueo técnico independiente y desactivado por defecto.
- Verificación completada: 90 pruebas de WhatsApp, ESLint, build de producción, detector Impeccable sin hallazgos y Supabase remoto sin migraciones pendientes.
