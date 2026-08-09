# Base de confiabilidad, diagnóstico y pruebas de humo

Fecha: 2026-08-08

## Objetivo

Crear la primera capa de confiabilidad comercial de Mideli para detectar fallos antes de una demostración o turno, recuperar la interfaz cuando ocurra un error y comprobar los recorridos esenciales sin modificar pedidos ni datos operativos.

Esta entrega se desarrollará y validará primero en localhost. No depende de Sentry ni de otra cuenta externa.

## Problema actual

Mideli ya contiene autenticación, Supabase, Realtime, PWA, Push e impresión, pero actualmente:

- No existe una suite de pruebas automáticas.
- Solo Analíticas tiene una pantalla específica de recuperación ante errores.
- No hay un lugar único donde el administrador pueda comprobar la conexión y las capacidades del dispositivo.
- Diagnosticar un problema requiere revisar manualmente distintas pantallas y la consola.
- No existe un endpoint mínimo que permita verificar si la aplicación está respondiendo.

## Enfoques considerados

### Base de confiabilidad local

Agregar pruebas E2E, recuperación global y un centro privado de diagnóstico que reutilice los módulos existentes.

Ventajas:

- Funciona inmediatamente en localhost.
- No requiere cuentas o claves nuevas.
- No altera datos operativos.
- Deja preparada la conexión con un monitor externo más adelante.

Desventaja:

- Los errores todavía no se envían automáticamente a un servicio externo.

Este es el enfoque aprobado.

### Observabilidad externa desde el inicio

Integrar Sentry u otro proveedor junto con las pruebas.

Ventaja: alertas y trazas remotas desde la primera entrega.

Desventajas: requiere una cuenta adicional, configuración de privacidad y variables de entorno antes de aportar valor en localhost.

### Solo revisión manual

Conservar una lista de comprobación sin agregar infraestructura.

Ventaja: menor cambio inicial.

Desventajas: depende de la memoria del operador, no detecta regresiones automáticamente y ofrece poca evidencia de confiabilidad para un servicio mensual.

## Alcance

### Incluido

- Centro de diagnóstico visible solo para propietario y administrador.
- Comprobaciones de aplicación, sesión, base de datos, Realtime, conectividad, PWA, Push, sonido e impresión.
- Estados consistentes: correcto, advertencia, error y sin comprobar.
- Ejecución paralela con tiempo límite por comprobación.
- Reintento general y reintento individual.
- Reporte técnico seguro que se pueda copiar para soporte.
- Endpoint público mínimo de actividad de la aplicación.
- Límite de error del panel autenticado.
- Límite de error global para fallos del layout raíz.
- Pruebas E2E de humo con Playwright.
- Perfiles de prueba para escritorio, tableta y móvil.
- Comandos npm para ejecutar las pruebas en modo normal y visual.
- Documentación breve de uso y de resultados esperados.

### No incluido

- Sentry, PostHog u otro proveedor externo.
- Captura remota y persistente de excepciones.
- Creación de usuarios de prueba en producción.
- Pedidos, cobros o movimientos de inventario automáticos.
- Respaldo o restauración de la base de datos.
- Cola de pedidos sin conexión.
- Reporte diario para el propietario.
- Despliegue a producción dentro de esta primera entrega.

## Centro de diagnóstico

### Ubicación y permisos

La nueva ruta será `/settings/diagnostico` y aparecerá dentro del grupo `Control` con el nombre `Diagnóstico`.

- Propietario y administrador pueden abrirla.
- Los demás roles serán redirigidos según las reglas actuales del proxy.
- La vista seguirá la identidad oscura de Mideli y se optimizará para tableta y celular.

### Comprobaciones

El centro mostrará las siguientes comprobaciones:

1. **Aplicación**
   - La interfaz terminó de cargar.
   - Versión disponible de la aplicación.
   - Fecha y hora del dispositivo.

2. **Conectividad**
   - Estado informado por el navegador.
   - Respuesta del endpoint local de salud.
   - Tiempo aproximado de respuesta.

3. **Sesión y permisos**
   - Sesión autenticada.
   - Perfil activo.
   - Rol reconocido como propietario o administrador.

4. **Base de datos**
   - Consulta de solo lectura contra una tabla ya autorizada para el usuario actual.
   - Tiempo de respuesta.
   - Mensaje sanitizado cuando falle.

5. **Realtime**
   - Apertura de un canal temporal.
   - Confirmación de suscripción dentro de un tiempo límite.
   - Eliminación del canal al terminar para evitar conexiones duplicadas.

6. **PWA y dispositivo**
   - Compatibilidad con Service Worker.
   - Registro activo de la PWA.
   - Ejecución instalada o desde navegador, cuando el navegador permita distinguirlo.

7. **Avisos Push y sonido**
   - Compatibilidad con notificaciones.
   - Permiso actual.
   - Suscripción activa, pausada o inexistente.
   - Disponibilidad del audio configurado, sin reproducirlo automáticamente.

8. **Impresión**
   - Configuración de estación disponible.
   - Impresión automática activa o pausada.
   - Cantidad de trabajos en espera o fallidos.
   - Sin ejecutar una impresión de prueba automáticamente.

### Presentación

Cada comprobación tendrá:

- Nombre y explicación breve.
- Indicador de color y texto, sin depender solo del color.
- Duración de la última revisión.
- Hora de la última ejecución.
- Acción `Comprobar de nuevo` cuando corresponda.

La cabecera mostrará un resumen con la cantidad de comprobaciones correctas, advertencias y errores. Un error no debe impedir que se presenten los resultados de las demás comprobaciones.

### Reporte para soporte

La acción `Copiar reporte` generará texto o JSON legible con:

- Versión de Mideli.
- Fecha y hora.
- Ruta actual.
- Tipo genérico de dispositivo y tamaño de pantalla.
- Navegador y sistema operativo a partir del agente de usuario.
- Estado y duración de cada comprobación.
- Identificador `digest` cuando exista un error de Next.js.

El reporte no incluirá:

- Tokens, cookies o claves.
- Contraseñas o PIN.
- Correo completo del usuario.
- Contenido de pedidos.
- Datos del cliente.
- Respuestas completas de Supabase.

## Endpoint de salud

Se agregará `GET /api/health` como comprobación mínima de actividad.

La respuesta exitosa contendrá únicamente:

- Estado general de la aplicación.
- Versión pública de compilación si está disponible.
- Marca de tiempo.

No consultará datos privados ni expondrá información del proyecto Supabase. La comprobación detallada de base de datos permanecerá dentro de la ruta autenticada.

El endpoint tendrá encabezados para evitar caché y permitirá conectar un monitor externo en una fase posterior sin cambiar el contrato.

## Recuperación de errores

### Panel autenticado

`src/app/error.tsx` capturará fallos no controlados dentro de la aplicación y mostrará:

- Mensaje claro en español.
- Confirmación de que no se modificaron datos por mostrar la pantalla de error.
- Botón `Reintentar`.
- Botón para volver al inicio permitido por el rol.
- Identificador técnico cuando Next.js proporcione un `digest`.

### Error global

`src/app/global-error.tsx` cubrirá fallos del layout raíz y definirá su propio documento HTML, como requiere App Router. Tendrá una versión mínima de la identidad Mideli y acciones para reintentar o volver al acceso.

Los errores esperados de formularios y operaciones seguirán usando mensajes controlados. Los límites de error se reservan para excepciones inesperadas.

## Pruebas automáticas

### Herramienta

Se utilizará Playwright porque prueba la aplicación completa en navegador y es apropiado para rutas con Server Components.

### Configuración

- Chromium como navegador inicial para reducir tiempo y mantenimiento.
- Servidor local iniciado automáticamente por la configuración de pruebas.
- Captura de traza y pantalla solo cuando una prueba falle.
- Sin reintentos en localhost para hacer visibles los fallos reales.
- Reintentos limitados cuando se conecte posteriormente a integración continua.

### Perfiles de pantalla

- Escritorio representativo.
- Tableta horizontal.
- Móvil representativo sin usar nombres comerciales en la interfaz.

### Casos iniciales

1. La página inicial carga y permite ir al acceso.
2. El formulario de acceso se presenta sin el sufijo visual `@mideli`.
3. Una ruta protegida sin sesión redirige al acceso.
4. El endpoint `/api/health` responde con el contrato mínimo y sin campos sensibles.
5. Las rutas públicas no producen errores fatales de JavaScript.
6. La navegación no crea desbordamiento horizontal en los tres perfiles de pantalla.
7. El manifiesto y el Service Worker requerido por la PWA se encuentran disponibles cuando aplica.

Las pruebas autenticadas de pedidos, cocina, cobro e inventario se agregarán después con usuarios y datos exclusivos de QA. Esta primera suite no usará cuentas reales ni escribirá en la base operativa.

### Comandos

Se agregarán scripts equivalentes a:

- `npm run test:e2e`
- `npm run test:e2e:ui`

Los comandos obligatorios existentes seguirán siendo:

- `npm run lint`
- `npm run build`

## Seguridad y datos

- No se agregará una tabla de diagnósticos en esta fase.
- Las consultas serán de solo lectura y respetarán las políticas RLS existentes.
- No se usará la clave de servicio en el navegador.
- Los errores enviados al cliente serán sanitizados.
- Los canales temporales de Realtime se eliminarán siempre, incluso al vencer el tiempo límite.
- La nueva ruta reutilizará la comprobación de rol existente en el proxy y validará nuevamente el perfil desde el servidor cuando solicite datos detallados.
- Ninguna prueba creará, editará o eliminará pedidos, pagos, turnos, inventario o personal.

## Rendimiento

- Las comprobaciones independientes se ejecutarán en paralelo.
- Cada comprobación tendrá un tiempo límite y podrá terminar sin bloquear la página.
- El centro de diagnóstico se cargará solo al visitar su ruta.
- No se agregarán listeners globales ni sondeos permanentes.
- La instrumentación inicial se mantendrá ligera para no retrasar la hidratación.

## Criterios de aceptación

La entrega estará terminada cuando:

1. Propietario y administrador puedan abrir `Diagnóstico` desde `Control`.
2. Otros roles no puedan acceder a la ruta.
3. Todas las comprobaciones terminen con estado visible aunque una falle.
4. El reporte copiado no contenga secretos ni datos operativos.
5. Un fallo inesperado muestre una pantalla recuperable en lugar de dejar la interfaz vacía.
6. `/api/health` responda sin consultar ni exponer información privada.
7. Las pruebas de humo pasen en los tres tamaños configurados.
8. `npm run lint` termine correctamente.
9. `npm run build` termine correctamente.
10. La revisión se realice primero en localhost.

## Entregas posteriores

Después de estabilizar esta base se continuará, en este orden, con:

1. Monitoreo remoto y alertas.
2. Respaldos verificados y procedimiento de recuperación.
3. Contingencia para pérdida temporal de conexión.
4. Resumen diario para el propietario.
5. Control de disponibilidad y rentabilidad de productos.
6. Herramientas de recompra y crecimiento de clientes.
