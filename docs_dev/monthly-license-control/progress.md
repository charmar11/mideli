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
