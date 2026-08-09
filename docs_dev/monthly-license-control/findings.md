# Hallazgos

## Estado inicial

- `app_license` ya soporta `active`, `suspended` y vencimiento por `valid_until`.
- `src/proxy.ts` bloquea las rutas operativas, pero no impide por sí solo todas las escrituras directas a Supabase.
- `LicenseHeartbeat` consulta cada 60 segundos y al recuperar foco; falta una reacción Realtime inmediata.
- `/control/licencia` usa una clave de entorno en cada acción. Todavía no permite crear una contraseña propia ni mantener una sesión privada.
- El reporte del dueño se controla en Analíticas, una Server Action y una ruta cron. Los tres puntos deben respetar el mismo feature flag.
- El proyecto usa migraciones imperativas y no tiene `supabase/schemas` declarativos.
- Supabase CLI 2.113.0 admite `db query --linked`, `db advisors` y `db push --linked --dry-run`.
- `app_license` ya está cerrado para escritura de `anon` y `authenticated`; su lectura pública autenticada permite al proxy y al heartbeat resolver el estado.
- `owner_report_settings.enabled` ya inicia en `false`, pero puede haber sido activado después. La nueva migración lo devolverá explícitamente a `false`.
- Vercel todavía programa `/api/cron/owner-daily-report` diariamente. Se conservará el cron, pero regresará `disabled` antes de preparar el reporte cuando el feature flag no sea exactamente `true`.
- El cliente de administración usa una instancia independiente de `supabase-js` con service role y sin persistencia de sesión, apropiada para las credenciales privadas del vendedor.
- La base remota usa PostgreSQL 17.6 y tiene 36 tablas públicas, todas con RLS habilitado.
- El bloqueo de escritura debe cubrir las 35 tablas operativas existentes. Se excluirán únicamente `app_license`, `license_control_credentials` y `license_control_events`; el reporte tendrá además su propio feature flag de servidor.
- Existen triggers de inventario, folios, caja, impresión y pagos. El nuevo trigger de licencia debe ejecutarse antes de ellos para rechazar temprano sin producir efectos secundarios.
- No existe hoy una abstracción de contraseña propia o sesión privada; `license.ts` compara directamente la variable maestra en cada acción.
- Next.js 16 permite leer cookies de forma asíncrona en Server Components y escribir cookies en Server Actions. La sesión privada puede usar `HttpOnly`, `Secure`, `SameSite=Strict` y ruta limitada.
- Node.js 22 proporciona `scrypt`, salt aleatorio, HMAC y comparación constante sin añadir dependencias. Se usará `scrypt` asíncrono con salt de al menos 16 bytes.
- La licencia remota está activa y vence el 2026-08-31, pero la hora histórica no corresponde al final del día local. La migración normalizará la vigencia existente al cierre del mismo día en Hermosillo, sin acortarla.
- El reporte automático remoto ya está en `enabled=false`; se mantendrá así y el feature flag añadirá una segunda barrera.
- `app_license` todavía no forma parte de la publicación `supabase_realtime`. La migración la agregará para que suspensión y reactivación lleguen de inmediato a dispositivos abiertos.
- Storage tiene tres políticas de escritura para imágenes de productos. Se añadirá una política restrictiva que exija licencia activa, sin modificar objetos internos del esquema `storage`.
- Varias tablas conservan grants amplios heredados para `anon` y `authenticated`, aunque RLS limita las filas. Un trigger central aporta la defensa necesaria incluso si una política permisiva cambia después.
- El cliente Supabase del navegador ya es singleton y tiene reconexión al recuperar red o visibilidad. `LicenseHeartbeat` puede reutilizarlo para un canal de licencia sin crear conexiones adicionales.
- `OwnerDailyControl` mezcla las métricas del dueño con la tarjeta de correo. Se conservarán todas las métricas y se renderizará la tarjeta únicamente cuando el feature flag del servidor sea verdadero.
- Playwright ya está instalado, pero no hay pruebas unitarias. Las funciones criptográficas se mantendrán puras donde sea posible y la verificación combinará SQL transaccional, lint, build y flujo de navegador.
- La migración completa pasó una prueba remota dentro de una sola transacción con `ROLLBACK`: credencial inicial, bloqueo tras cinco intentos, renovación, suspensión, rechazo de escrituras y reactivación.

## Fuentes

- Especificación aprobada: `docs/superpowers/specs/2026-08-09-monthly-license-and-email-disable-design.md`.
- Contexto del producto: `.opencode/plans/mideli-context.md`.
- Changelog de Supabase revisado el 2026-08-09: no hay un cambio incompatible con triggers de tablas o RLS para este trabajo. La exposición automática de tablas al Data API cambió en 2026, por lo que se usarán grants explícitos y RLS.
- La documentación vigente confirma que `service_role` debe vivir solo en servidor y puede omitir RLS; las tablas de credenciales se cerrarán a `anon` y `authenticated`.
- Las funciones PostgreSQL reciben `EXECUTE` para `PUBLIC` por defecto. Toda función nueva se revocará explícitamente y solo se concederá cuando un flujo cliente la necesite.
- Las funciones `SECURITY DEFINER` deben fijar `search_path` vacío y usar nombres de esquema completos. Los triggers de licencia seguirán esa regla.
