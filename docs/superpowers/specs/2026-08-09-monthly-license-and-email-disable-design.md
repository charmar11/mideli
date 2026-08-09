# Licencia mensual privada y desactivación temporal del correo

Fecha: 2026-08-09

Estado: diseño principal aprobado; corrección de primer acceso aprobada y pendiente de revisión escrita

## Objetivo

Convertir el control de licencia existente en una herramienta mensual administrada únicamente por el vendedor de Mideli. El restaurante podrá operar hasta la fecha pagada y el sistema se bloqueará automáticamente al vencer. Cuando el vendedor registre el siguiente pago, podrá renovar y reactivar el acceso desde un panel privado.

Mientras Mideli no tenga un dominio verificado para correo, el resumen diario quedará oculto y bloqueado tanto en interfaz como en servidor.

## 1. Alcance del bloqueo

El registro único `app_license` seguirá siendo la fuente de verdad. Una licencia estará operativa únicamente cuando su estado sea `active` y `valid_until` sea posterior a la hora actual.

Al vencer o suspenderse:

- El proxy redirigirá las rutas de Mesero, Cocina, Analíticas, Menú y Configuración a `/sistema-bloqueado`.
- Las sesiones que ya estén abiertas recibirán el cambio mediante Realtime, con comprobación periódica como respaldo.
- La base de datos rechazará escrituras operativas aunque un dispositivo conserve una pantalla antigua o intente llamar directamente a Supabase.
- Se bloquearán pedidos, cocina, cobros, caja, inventario, menú, personal, mesas, impresión y notificaciones.
- Los datos existentes no se borrarán ni modificarán.
- El panel privado de licencia seguirá disponible para que el vendedor pueda reactivar el servicio.

La lectura técnica necesaria para comprobar la licencia permanecerá disponible. Ante un fallo transitorio de consulta no se suspenderá a un cliente por error; solamente una expiración o suspensión confirmada producirá el bloqueo.

## 2. Ciclo mensual

La fecha de vencimiento se interpretará al final del día elegido, a las 11:59:59 p. m. en `America/Hermosillo`.

El panel tendrá estas acciones:

1. `Registrar pago y renovar 1 mes`: si la licencia sigue activa, añade un mes calendario a la vigencia actual. Si está vencida, inicia una vigencia nueva desde el día de la reactivación.
2. `Renovar varios meses`: permite registrar 1, 3, 6 o 12 meses en una sola operación.
3. `Elegir fecha`: fija una fecha de vencimiento específica.
4. `Suspender ahora`: bloquea inmediatamente sin borrar la fecha pagada.
5. `Reactivar`: solo conserva la fecha existente cuando todavía está en el futuro. Si ya venció, exige registrar una renovación.

Los cálculos usarán meses calendario. Cuando el día no exista en el mes de destino, se usará el último día de ese mes.

El panel mostrará estado, fecha de vencimiento, días restantes, última renovación y último cambio. Renovar podrá guardar una referencia de pago opcional. Suspender o cambiar manualmente la vigencia exigirá un motivo.

## 3. Acceso exclusivo del vendedor

La ruta `/control/licencia` no aparecerá en la navegación del restaurante. Owner, admin y demás perfiles de Mideli no obtendrán acceso por su rol, salvo la autorización de una sola vez para crear la primera credencial cuando todavía no existe ninguna.

La primera configuración funcionará así:

1. El vendedor inicia sesión en Mideli como un perfil activo `owner` o `admin` en el mismo dispositivo.
2. Entra al panel privado. El servidor valida el JWT con `supabase.auth.getClaims()` y consulta el rol activo en `profiles`.
3. Crea directamente su propia contraseña de vendedor de al menos 8 caracteres, sin introducir la clave técnica de recuperación.
4. El servidor deriva y guarda un hash con `scrypt` y salt aleatorio, nunca la contraseña original.

La sesión administrativa solo autoriza esta configuración cuando todavía no existe una credencial de vendedor. Después de crearla, pertenecer a `owner` o `admin` no concede acceso al control de licencia: será obligatorio iniciar la sesión privada con la contraseña del vendedor.

Si no existe una sesión administrativa válida, el panel indicará que primero debe iniciarse sesión como propietario o administrador. No ofrecerá una configuración inicial pública ni permitirá que una persona anónima reclame el control.

Después de configurarla:

- Cinco intentos fallidos bloquearán el acceso durante 15 minutos.
- Un acceso correcto creará una sesión firmada con HMAC en una cookie `HttpOnly`, `Secure` y `SameSite=Strict`, limitada a la ruta de control.
- La sesión durará 30 minutos y cada acción volverá a comprobar su validez.
- Cambiar la contraseña exigirá la contraseña actual.
- La clave maestra técnica de recuperación permitirá establecer una contraseña nueva si se olvida. Esta opción se mostrará separada del primer acceso.
- Cambiar o recuperar la contraseña invalidará las sesiones privadas anteriores.

Las variables de servidor serán:

```env
MIDELI_LICENSE_ADMIN_SECRET=clave_maestra_de_recuperacion
MIDELI_LICENSE_SESSION_SECRET=secreto_para_firmar_sesiones
```

Ninguna de las dos llevará el prefijo `NEXT_PUBLIC_` ni llegará al navegador.

## 4. Persistencia y auditoría

Se crearán dos tablas de servidor en `public`, cerradas por RLS y revocación explícita para el cliente:

- `license_control_credentials`: credencial única con hash, salt, versión, intentos fallidos, bloqueo temporal y fecha del último cambio.
- `license_control_events`: historial inmutable de creación y cambio de contraseña, acceso bloqueado, renovación, cambio de fecha, suspensión y reactivación.

Estas estructuras tendrán RLS habilitado, sin políticas ni permisos para `anon` o `authenticated`. Solo el servidor con service role podrá consultarlas. El historial no almacenará contraseñas, claves maestras, cookies ni valores sensibles.

Las migraciones aplicadas no se editarán. El cambio vivirá en una migración nueva y los bloqueos de escritura se implementarán con una función central y triggers sobre las tablas operativas. `app_license` y las estructuras privadas de control quedarán fuera de esos triggers para permitir la reactivación.

## 5. Experiencia del restaurante bloqueado

La pantalla bloqueada conservará un mensaje neutral. Indicará que el acceso necesita renovación y que los datos permanecen protegidos, sin revelar la ruta privada, la contraseña, el motivo interno ni información del vendedor.

Después de una renovación, los dispositivos abiertos recibirán la reactivación mediante Realtime. El botón `Comprobar acceso` seguirá disponible como respaldo.

## 6. Desactivación temporal del correo

Se añadirá esta variable de servidor en `.env.example` y Vercel, y quedará apagada inicialmente:

```env
OWNER_REPORT_EMAIL_ENABLED=false
```

Con el valor `false`:

- La tarjeta completa del reporte por correo desaparecerá de Analíticas.
- La acción de envío de prueba rechazará la operación antes de invocar Resend.
- El cron validará su autorización y responderá como desactivado sin preparar datos ni invocar Resend.
- La configuración persistida de envío automático quedará en `enabled=false` para impedir que se reactive accidentalmente al cambiar la variable en el futuro.
- No se eliminarán las plantillas ni el código de generación del reporte.

Solo el valor exacto `true` habilitará la función. Una variable ausente también se interpretará como desactivada.

Cuando exista un dominio verificado, se configurará `RESEND_FROM_EMAIL`, se cambiará `OWNER_REPORT_EMAIL_ENABLED=true`, se desplegará y el dueño podrá habilitar manualmente el envío desde Analíticas.

## 7. Seguridad y errores

- Todas las operaciones del panel serán Server Actions y validarán la sesión privada del vendedor.
- La clave maestra solamente servirá para recuperación técnica, no se almacenará en base de datos.
- La autorización administrativa de configuración inicial usará `getClaims()` en servidor y comprobará `profiles.role` e `is_active`; nunca confiará en metadatos editables del usuario.
- Las comparaciones criptográficas evitarán diferencias de tiempo evidentes.
- Los errores visibles no confirmarán si una credencial existe ni mostrarán detalles de Supabase.
- Cada renovación o suspensión será transaccional y producirá un evento de auditoría.
- El trigger de licencia devolverá un código reconocible para que la interfaz redirija a la pantalla bloqueada en lugar de mostrar un error técnico.
- El control no revocará ni eliminará cuentas del restaurante; la reactivación permitirá continuar con los mismos datos y sesiones válidas.

## 8. Verificación

La implementación se considerará completa únicamente después de comprobar:

1. Configuración inicial con sesión activa de owner/admin y creación directa de contraseña.
2. Rechazo de la configuración inicial anónima y confirmación de que el rol administrativo deja de conceder acceso después de crear la credencial.
3. Inicio correcto y rechazo de contraseña incorrecta.
4. Bloqueo temporal después de cinco intentos.
5. Cambio y recuperación de contraseña con invalidación de sesiones anteriores.
6. Renovación de un mes activo, un mes vencido y meses que requieran ajustar el último día.
7. Suspensión y reactivación desde el panel privado.
8. Redirección de todas las rutas operativas.
9. Rechazo transaccional de escrituras con licencia vencida o suspendida.
10. Escrituras permitidas con licencia activa.
11. Reactivación de dispositivos mediante Realtime y comprobación manual.
12. Ausencia total de la tarjeta de correo en Analíticas.
13. Rechazo de envío manual y cron desactivado sin llamadas a Resend.
14. `npm run lint` y `npm run build`.
15. `npx supabase db push --linked --dry-run`, aplicación controlada y prueba SQL dentro de una transacción revertida.

No se desplegará a producción si una licencia inactiva todavía permite crear pedidos, cobros, movimientos de caja o cambios administrativos.
