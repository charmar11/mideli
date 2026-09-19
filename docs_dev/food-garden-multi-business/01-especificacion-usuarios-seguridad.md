# Especificación 1: usuarios y seguridad

**Estado:** borrador para revisión. No autoriza implementación ni cambios de base de datos.

## Objetivo

Permitir que Rincón 404 Food Park administre negocios independientes sin mezclar sus datos, usuarios ni permisos, manteniendo las credenciales actuales de Mideli.

La interfaz debe ser una sola aplicación. El alcance de los datos se resuelve mediante la cuenta, la membresía y el negocio asignado, no mediante copias distintas de la aplicación.

## Jerarquía

```text
Administrador de plataforma
└── Rincón 404 Food Park
    ├── Coordinador
    ├── Mideli
    │   ├── Dueño
    │   ├── Personal local
    │   └── Cocina
    └── Just Dipping
        ├── Dueño
        └── Personal local
```

La cuenta actual `Administrador` no será el administrador de plataforma. Permanecerá como dueño de Mideli. El administrador de Rincón 404 tendrá una cuenta separada.

## Mapeo actual verificado

La consulta de solo lectura a Supabase encontró estos perfiles activos:

| Cuenta visible | Función real confirmada | Negocio o alcance futuro | Rol guardado actualmente |
|---|---|---|---|
| Administrador | Dueño de Mideli | Mideli | `owner` |
| andrea | Mesera global | Todos los negocios | `supervisor` |
| Mideli | Cuenta antigua sin uso | Ninguno mientras esté inactiva | `supervisor` |
| mauro | Cocinero | Mideli | `supervisor` |

Estos perfiles no se modificarán durante la fase de diseño. El cambio de rol y la desactivación de la cuenta antigua se harán únicamente dentro de una migración aprobada.

## Roles previstos

### Administrador de plataforma

Cuenta independiente del dueño de Mideli. Puede:

- Crear, activar, pausar, archivar y restaurar negocios.
- Entregar o recuperar excepcionalmente el acceso inicial del dueño.
- Administrar la salud técnica y las licencias.
- Crear o administrar al Coordinador.
- Consultar información técnica mínima.

Por defecto no verá ventas detalladas, inventario, gastos, clientes ni caja de un negocio sin una acción de soporte auditada.

### Coordinador

Rol operativo global de Rincón 404. Puede:

- Crear, activar y desactivar meseras globales.
- Consultar el estado operativo necesario para coordinar pedidos.
- Administrar el plano, zonas y numeración de mesas compartidas.

No administra dueños, menús, inventarios, cajas ni personal interno de los negocios.

### Dueño de negocio

Puede administrar únicamente su negocio:

- Personal local y sus permisos.
- Menú, categorías, precios y variaciones.
- Inventario, recetas y compras.
- Estado de pedidos de su negocio.
- Caja, gastos, cortes, correcciones y reportes.

El dueño de Mideli no obtiene acceso automático a Just Dipping.

### Mesera global

Puede:

- Ver los menús habilitados de todos los negocios.
- Crear un pedido mixto para una mesa.
- Enviar cada parte al negocio correspondiente.
- Ver el estado de cada negocio.
- Cobrar libremente para cualquier negocio, según la regla confirmada por el usuario.
- Ver lo necesario para entregar cada parte del pedido.

No puede modificar menús, inventarios, usuarios ni permisos de los negocios.
Por seguridad operativa, tampoco cambia los estados internos de preparación de
otro negocio. Puede consultar esos estados, confirmar la entrega o el servicio
y cobrar la cuenta. Un dueño puede otorgar una capacidad de excepción auditada
si la operación realmente la necesita.

### Personal local

El personal de un negocio solo opera dentro de ese negocio. Puede existir un perfil local de mesero, caja, cocina o supervisor, según las funciones que el dueño le asigne.

Un usuario local no puede:

- Enviar productos a otro negocio.
- Ver pedidos de otro negocio.
- Modificar el menú o inventario de otro negocio.
- Cambiar el estado de pedidos ajenos.

El personal autorizado de cada negocio sí puede avanzar los estados de sus
propios pedidos, incluidos `Pendiente`, `Preparando` y `Listo`, sin afectar a
otro negocio.

### Cocina de Mideli

Mauro quedará asociado a Mideli como personal de Cocina. Solo verá pedidos de Mideli en la pantalla de Cocina.

Just Dipping no usará la pantalla de Cocina por ahora. Sus pedidos aparecerán en Estado con `Pendiente`, `Preparando` y `Listo`, visibles para su personal autorizado.

## Reglas de seguridad

- El servidor debe derivar el negocio permitido desde la sesión y la membresía.
- El navegador nunca debe poder elegir libremente un identificador de negocio para obtener datos.
- Las políticas RLS deben comprobar membresía y permiso, no solo el rol global actual.
- Los cambios de rol, altas, desactivaciones, correcciones y acciones de soporte deben quedar auditados.
- Desactivar una cuenta conserva su historial.
- Una sesión abierta en un dispositivo debe dejar de permitir nuevas operaciones al terminar el pedido actual cuando el usuario sea desactivado.
- Los pedidos y movimientos financieros no se borran físicamente; se corrigen o anulan con motivo y responsable.
- El administrador de plataforma y el dueño de Mideli son identidades separadas, aunque la misma persona física pudiera operar ambas.

## Decisiones pendientes no bloqueantes

- Nombre y datos del administrador de plataforma.
- Dueño y personal real de Just Dipping.
- Lista completa de cuentas que se crearán cuando los empleados estén confirmados.
- Alcance exacto de la vista técnica del administrador de plataforma durante soporte.
