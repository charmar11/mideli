# Progreso

## 2026-08-09

- Se aprobó el diseño de licencia mensual automática.
- Se confirmó que solamente el vendedor podrá suspender, renovar y reactivar.
- Se incluyó creación, cambio y recuperación de contraseña propia.
- Se incluyó ocultar Analíticas de correo y bloquear envíos manuales y automáticos.
- Se inició la fase de investigación e implementación.
- Se inventariaron las escrituras operativas, las políticas de Storage y la configuración Realtime.
- Se creó la migración mensual con credencial privada, auditoría y bloqueo de escrituras.
- El `dry-run` y la prueba SQL remota transaccional terminaron correctamente sin persistir cambios.
- Se implementó contraseña propia con `scrypt`, recuperación, cambio de clave, sesión firmada y bloqueo de 15 minutos tras cinco fallos.
- Se implementaron renovación por meses calendario, fecha personalizada, suspensión con motivo, reactivación y auditoría.
- `LicenseHeartbeat` escucha cambios de licencia por Realtime y conserva la consulta de respaldo.
- La sección de correo solo existe visualmente cuando `OWNER_REPORT_EMAIL_ENABLED=true`; acciones manuales y entrega automática rechazan el flujo cuando está apagado.
- La migración se aplicó al proyecto remoto y la prueba transaccional posterior terminó correctamente.
- El panel inicial se verificó en escritorio y móvil. `npm run lint` y `npm run build` terminaron sin errores.
- Se configuraron en Vercel `MIDELI_LICENSE_SESSION_SECRET` y `OWNER_REPORT_EMAIL_ENABLED=false` sin exponer valores.
- Producción quedó desplegada en `https://mideli.vercel.app`; salud y control de licencia respondieron 200, la configuración inicial es visible y no expone nombres de secretos.
- Se reprodujo el error de primer acceso y se confirmó que la pantalla exigía un secreto técnico desconocido para el vendedor.
- El usuario aprobó autorizar una sola vez la creación inicial mediante una sesión activa owner/admin.
- La interfaz inicial ya no solicita la clave técnica y ofrece acceso directo al login con retorno al control.
- La Server Action valida `getClaims()`, perfil activo y rol owner/admin antes de crear la primera credencial.
- Una prueba Playwright confirmó que una sesión anónima es rechazada y la base remota conserva cero credenciales.
- La regresión local confirmó que la configuración inicial ya no muestra `recoverySecret` y que un visitante anónimo no puede registrar una clave.
- `npm run lint` y `npm run build` finalizaron sin errores; Supabase confirmó mediante `db push --linked --dry-run` que no hay migraciones pendientes.
