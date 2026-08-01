# Licencia mensual y rediseño de acceso

## Objetivo

Bloquear automáticamente el sistema Mideli al vencer su licencia mensual, permitir que únicamente el vendedor lo reactive y mejorar Inicio/Login sin el texto "Mi Momento" ni el sufijo visible `@mideli.com`.

## Licencia

- Una fila única en `public.app_license` conserva estado, fecha de vencimiento y fecha de actualización.
- La tabla tendrá RLS habilitado. Usuarios `anon` y `authenticated` podrán consultar el estado, pero no insertar, editar ni eliminar.
- La aplicación considerará vigente la licencia solo cuando esté activa y `valid_until` sea posterior a la hora actual.
- Las rutas `/dashboard`, `/menu` y `/settings` redirigirán a `/sistema-bloqueado` cuando no esté vigente.
- Un guardado cliente comprobará periódicamente el estado para bloquear sesiones que permanecieron abiertas al ocurrir el vencimiento.
- `/control/licencia` será una herramienta privada del vendedor. Cada operación requerirá `MIDELI_LICENSE_ADMIN_SECRET`, almacenado únicamente en variables del servidor.
- Las escrituras de licencia usarán `SUPABASE_SERVICE_ROLE_KEY` exclusivamente en código servidor.
- El control permitirá activar 30 días, definir una fecha exacta y suspender inmediatamente.

## Experiencia bloqueada

- La pantalla explicará que el servicio está temporalmente pausado, sin culpar al personal ni mostrar detalles técnicos.
- Mostrará la fecha de vencimiento disponible y una única salida para cerrar sesión.
- No expondrá la ruta de control ni la clave de activación.

## Inicio y Login

- Se elimina "Mi Momento" de Inicio y metadatos.
- Inicio se convierte en una entrada operativa premium: marca, capacidades del sistema y flujo visual Pedido, Cocina, Cobro.
- Login comparte la misma identidad y reduce espacio improductivo en móvil.
- El campo Usuario deja de mostrar `@mideli.com`. Internamente seguirá completando el dominio para no romper las cuentas actuales y continuará aceptando correos completos.
- Se mantienen la paleta oscura, rosa Mideli, crema, Sora, Karla y Pacifico.

## Errores y seguridad

- Una falla temporal al consultar la licencia no bloqueará una operación ya autenticada; se registrará y se volverá a comprobar.
- Una clave incorrecta no revelará información sensible.
- La clave maestra nunca se enviará al navegador salvo dentro del formulario POST y nunca se guardará en almacenamiento cliente.
- Todas las fechas se almacenarán en UTC y se mostrarán con la zona local.

## Verificación

- Probar licencia vigente, vencida, suspendida, clave incorrecta y reactivación.
- Confirmar que el administrador del restaurante no puede modificar `app_license`.
- Verificar Inicio, Login y pantalla bloqueada en escritorio y móvil.
- Ejecutar `npm run lint` y `npm run build`.
