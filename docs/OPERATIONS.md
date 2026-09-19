# Operación y mantenimiento

Este documento sirve para agentes y personas que necesiten levantar, verificar o publicar Mideli. No contiene credenciales.

## Entornos

- Desarrollo local: `http://localhost:3000`.
- Producción: [https://mideli.vercel.app](https://mideli.vercel.app).
- Salud: [https://mideli.vercel.app/api/health](https://mideli.vercel.app/api/health).
- Base de datos: proyecto Supabase `qgnjennimvbrfxvcmowb`.
- Producción ya contiene la primera rebanada multinegocio con Mideli como único
  negocio activo. No usar producción como staging para crear o probar otros
  negocios; la validación aislada continúa en GitHub Actions.

`.env.example` documenta los nombres de variables. `.env.local` nunca se lee para imprimirlo, nunca se commitea y nunca se comparte.

## Variables por integración

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` solo en servidor.
- Licencia: `MIDELI_LICENSE_ADMIN_SECRET`, `MIDELI_LICENSE_SESSION_SECRET` solo en servidor.
- WhatsApp/Meta: `WHATSAPP_ORDERS_ENABLED`, `WHATSAPP_ORDER_CREATION_ENABLED`, `WHATSAPP_PROVIDER`, `WHATSAPP_DRY_RUN`, credenciales `META_*` y `WHATSAPP_DELIVERY_TEMPLATE_*`.
- Gemini: `WHATSAPP_GEMINI_INTERPRETER_ENABLED`, `WHATSAPP_GEMINI_MODEL`, `GEMINI_API_KEY` solo en servidor.
- Maps: `GOOGLE_MAPS_SERVER_API_KEY` restringida a las APIs necesarias y solo en servidor.
- Notificaciones y correo: `RESEND_*`, `OWNER_REPORT_EMAIL_ENABLED`, `CRON_SECRET`.
- Scheduler de WhatsApp: `WHATSAPP_SCHEDULER_SECRET` en Vercel y los secretos `mideli_app_url` y `mideli_whatsapp_scheduler_secret` en Supabase Vault.
- Observabilidad: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` solo para build cuando aplique.

## Verificación local

```bash
npm install
npm run lint
npm run build
npx playwright test
```

Playwright inicia el servidor local si no se define `PLAYWRIGHT_BASE_URL`. También puede apuntarse a una URL existente con esa variable.

## Supabase

Las migraciones viven en `supabase/migrations/` y se aplican en orden por timestamp. Antes de tocar el esquema:

```bash
npx supabase migration list
npx supabase db push --linked --dry-run
```

Después de revisar el dry-run, aplicar solo la migración aprobada. Nunca ejecutar `supabase db reset --linked`, borrar tablas remotas ni eliminar datos sin autorización explícita para esa operación concreta.

La copia local incluye migraciones hasta `20260919203953_multibusiness_context_metadata_scope.sql`. La alineación remota debe comprobarse, no inferirse de esta documentación.

La resolución de negocios distingue una membresía local de una membresía de
organización. Un usuario local solo recibe el negocio de su membresía; una
membresía de organización solo habilita el selector completo cuando tiene una
capacidad explícitamente global, como operar/cobrar todos los negocios o
administrar meseras globales. Administrar el plano compartido por sí solo no
expone los datos privados de otros negocios.

Hay dos límites intencionalmente separados. `private.multibusiness_can_view_business`
protege datos privados como menú, pedidos, inventario, caja y finanzas. El RPC
`get_my_multibusiness_context()` usa un límite de metadatos distinto para que
un Coordinador con `organization.manage_tables` pueda resolver la organización,
los negocios y el plano compartido. Ese contexto no concede por sí mismo acceso
a las filas privadas de otro negocio.

### Gate aislado para multinegocio

No se usa producción como staging. Como no se contrató un entorno Preview de
Supabase para esta etapa, la validación reproducible vive en GitHub Actions:

```bash
supabase db reset --local --no-seed
supabase test db --local supabase/tests/multibusiness_*_test.sql
```

Ese gate valida migraciones, RLS, privilegios, triggers, índices y pruebas de
aislamiento sobre una base efímera sin datos de clientes. No reemplaza un
respaldo restaurable ni autoriza por sí mismo un `db push --linked`.

El runbook completo está en
`docs_dev/food-garden-multi-business/17-runbook-migracion-mideli.md`.

Antes de abrir el piloto prolongado queda un paso manual en Supabase: activar la
protección contra contraseñas filtradas en Authentication. Esa configuración no
se puede transportar de forma segura desde este repositorio y debe verificarse
en el proyecto remoto.

Para la preparación multinegocio, la rama Preview de Supabase debe ser
persistente y usar variables propias. No crearla con `--with-data` por defecto:
los clientes, domicilios, conversaciones y teléfonos son datos personales.
Usar fixtures anonimizados o documentar una copia controlada y restringida
antes de probar backfills.

## Publicación

La publicación de producción se realiza desde una copia de trabajo revisada:

```bash
npm run lint
npm run build
npx playwright test
npx vercel --prod --yes
```

Después de publicar:

```powershell
$response = Invoke-WebRequest -UseBasicParsing https://mideli.vercel.app/api/health
"STATUS $($response.StatusCode)"
```

La respuesta esperada es `STATUS 200`. Si se modificó Supabase, confirmar también las migraciones remotas y el comportamiento de la función afectada.

El scheduler de WhatsApp se ejecuta cada minuto en Supabase Cron para liberar pedidos programados hasta 20 minutos antes de la hora solicitada y procesar recordatorios de inactividad. La ruta acepta `WHATSAPP_SCHEDULER_SECRET`, que se guarda en Supabase Vault; `CRON_SECRET` se conserva para los cron diarios de Vercel. La actualización condicional evita liberar dos veces el mismo pedido.

No declarar un despliegue estable solo porque Vercel terminó el build. Los flujos de WhatsApp, Push, impresión, pagos y hardware requieren pruebas reales según `docs/releases/v0.9-piloto.md`.

## WhatsApp

Para activar creación automática, las dos condiciones deben estar activas:

```ini
WHATSAPP_ORDER_CREATION_ENABLED=true
create_orders_enabled=true
```

La primera es una variable de servidor; la segunda es una configuración persistida que se modifica desde la interfaz de WhatsApp. Si falta cualquiera, el sistema debe conservar el contexto y enviar la conversación a atención humana.

Antes de usar Meta en producción, comprobar proveedor, firma del webhook, plantilla aprobada, modo dry-run y allowlist. El bot no debe enviar mensajes de estado al cliente si no existe consentimiento aplicable.

## Notificaciones PWA

Cada dispositivo configura por separado avisos de pedidos nuevos y pedidos listos. Para depurarlos, revisar permiso del navegador, instalación PWA, suscripción del dispositivo, visibilidad de Cocina/Mesero, service worker activo y entrega de la Edge Function correspondiente. Cuando la vista ya está visible, puede usarse señal local o sonido en lugar de banner Push.

## Diagnóstico de un pedido

1. Confirmar folio y canal de origen.
2. Confirmar tipo de servicio y snapshot de ubicación.
3. Comparar subtotal, tarifa informativa de envío y total operativo.
4. Revisar líneas, modificadores y notas en Cocina.
5. Revisar transacciones y asignaciones en el libro mayor.
6. Revisar historial de estados y eventos Push si aplica.
7. No corregir datos directamente en tablas si existe una Server Action o RPC autorizada.

## Referencias

- Checklist de piloto: `docs/releases/v0.9-piloto.md`.
- Contexto completo: `.opencode/plans/mideli-context.md`.
- Decisiones: `docs/DECISIONS.md`.
