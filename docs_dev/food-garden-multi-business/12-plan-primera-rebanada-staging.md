# Plan de la primera rebanada multinegocio

**Estado:** listo para revisión y autorización de implementación en staging.
**No incluye:** SQL ejecutado, backfill real, cambio de RLS en producción ni
alta de Just Dipping.

## Objetivo

Crear la base segura para que Mideli pueda convertirse en el primer negocio de
Rincón 404 Food Park sin cambiar sus credenciales ni su operación visible.

Al terminar esta rebanada todavía no se habilitarán pedidos mixtos en el turno
real. El resultado será una fundación comprobable sobre la que se puedan
migrar catálogo, pedidos, caja, pagos e inventario por etapas.

## Alcance incluido

### Organización y negocio

- Crear la organización `Rincón 404 Food Park`.
- Crear solamente `Mideli` como negocio inicial.
- Usar estados de ciclo de vida `draft`, `active`, `paused`, `archived` y
  `retired`.
- Mantener la zona horaria operativa de Hermosillo.
- No crear Just Dipping ni registros derivados de su sistema anterior.

### Membresías

Conservar los `auth.users.id` existentes y agregar relaciones de alcance:

| Perfil confirmado | Membresía inicial | Negocio |
|---|---|---|
| `Administrador` | dueño | Mideli |
| `andrea` | mesera global | organización y negocios habilitados |
| `mauro` | cocina | Mideli |
| `Mideli` | inactiva cuando exista autorización | ninguno operativo |

Las membresías deben tener estado, fechas, actor que las creó o desactivó y
capacidades derivadas. El rol global actual se conserva durante la transición
para no romper el login, pero deja de ser suficiente para autorizar datos
multinegocio.

Los nombres anteriores son los `full_name` observados en `public.profiles`, no
identificadores de inicio de sesión. Antes de sembrar membresías se debe
resolver cada `auth.users.id` en staging y registrar la correspondencia sin
adivinar correos, alias ni contraseñas.

### Capacidades mínimas

- `platform.manage_businesses`: ciclo de vida de negocios.
- `organization.manage_global_waiters`: altas y desactivaciones de meseras
  globales.
- `organization.manage_tables`: plano compartido.
- `business.manage_staff`: personal local del negocio.
- `business.manage_catalog`: menú y categorías propias.
- `business.manage_inventory`: inventario y recetas propias.
- `business.operate_orders`: capturar y consultar pedidos propios.
- `business.update_preparation`: estados de preparación propios.
- `business.charge_orders`: cobrar cuentas del negocio.
- `business.manage_cash`: abrir, cerrar y corregir caja según la regla actual.

La mesera global tendrá `business.operate_orders` y
`business.charge_orders` para negocios habilitados, pero no recibirá por
defecto `business.manage_catalog`, `business.manage_inventory` ni
`business.update_preparation`.

### Auditoría

Registrar, como mínimo:

- alta, pausa, archivo y restauración de un negocio;
- alta, cambio de alcance y desactivación de una membresía;
- cambio de capacidad o rol;
- recuperación o restablecimiento de contraseña;
- acciones de soporte del administrador de plataforma;
- excepciones para cambiar estados de preparación;
- operaciones financieras y correcciones sensibles.

El evento debe incluir actor, organización, negocio si aplica, entidad,
identificador, acción, motivo y fecha. No debe guardar contraseñas, tokens ni
datos innecesarios de clientes.

## Orden de trabajo propuesto

### Paso A: proteger el punto de partida

1. Crear una rama o etiqueta de trabajo basada en el estado estable acordado.
2. Provisionar una base Supabase de staging y un despliegue Preview que usen
   variables separadas de producción. La rama se creará sin clonar datos de
   producción por defecto; para validar el backfill se usará un conjunto
   anonimizado o un clon controlado con acceso restringido y autorización
   documentada.
3. Obtener un respaldo verificable de Supabase y documentar cómo restaurarlo
   en un entorno separado.
4. Ejecutar lint, build y pruebas de regresión actuales.
5. Capturar conteos y sumas de control sin exponer datos personales.

No se permite continuar si staging no está aislado, el respaldo no puede
restaurarse o el árbol de trabajo mezcla cambios sin identificar.

### Paso B: expandir el esquema

Crear en una migración aditiva las entidades de organización, negocio,
membresías, capacidades y auditoría. Todas las relaciones deben tener claves
foráneas e índices.

Reglas de esta etapa:

- no borrar columnas actuales;
- no hacer obligatorio aún el contexto de negocio en tablas históricas;
- no modificar folios existentes;
- no crear Just Dipping;
- no cambiar contraseñas ni correos técnicos de Auth;
- no permitir que el navegador cree una capacidad de plataforma.

### Paso C: sembrar solo Mideli en staging

En una base de prueba:

1. Crear la organización y Mideli.
2. Asociar las cuatro cuentas conocidas por su identidad de Auth, no por el
   nombre visible.
3. Marcar la cuenta antigua como inactiva solamente en la base de prueba para
   validar el comportamiento; no tocar producción en esta etapa.
4. Crear las capacidades de cada membresía.
5. Comprobar que el dueño pueda administrar su negocio y que Mauro no reciba
   acceso a otro negocio inexistente.

### Paso D: guardas de servidor y base

Implementar primero funciones de lectura y autorización que resuelvan:

- usuario autenticado y activo;
- membresía vigente;
- negocio habilitado;
- capacidad requerida;
- alcance de organización o negocio.

Las Server Actions que usan `service_role` deben llamar estas guardas antes de
leer o escribir. Las RPC `SECURITY DEFINER` deben fijar `search_path`, validar
`auth.uid()`, revisar membresía y recibir solamente argumentos necesarios.

Después se escriben políticas RLS de transición con pruebas negativas. No se
debe confiar en el proxy ni en filtros de React como única protección.

### Paso E: backfill en sombra

Una vez resuelto el gate de privacidad, asociar en staging los registros
actuales de Mideli, sin duplicar filas:

- categorías y productos;
- inventario, recetas, compras, lotes y conteos;
- pedidos, líneas y estados;
- pagos, asignaciones y correcciones;
- cajas, gastos y cortes;
- impresión, Push, reportes y preferencias;
- clientes, domicilios, conversaciones y pedidos de WhatsApp.

Cada dominio necesita un reporte antes/después con conteos, sumas, referencias
huérfanas y folios mínimo/máximo. Si una relación no puede asociarse con
seguridad, debe quedar en una lista de excepción y detener la activación.

### Paso F: compatibilidad de Mideli

Mantener el flujo actual mientras se ejecutan consultas paralelas de validación:

- login actual;
- menú y carrito;
- pedido a Cocina;
- Estado e Historial;
- cobro y caja;
- inventario y devolución;
- Push, Realtime e impresión;
- WhatsApp exclusivamente Mideli.

La UI no mostrará un selector de negocios hasta que estas consultas estén
aisladas y comparadas.

## Lo que queda fuera de esta rebanada

- Pedido mixto de producción real.
- Cuenta hija de cada negocio en una mesa.
- Cobro de dos negocios en una misma visita.
- Alta de Just Dipping.
- Importación del sistema Firebase anterior.
- WhatsApp para otro negocio.
- Inventario compartido.
- Licencia separada por negocio.
- Modo offline financiero.

## Gates de salida de staging

La rebanada solo se considera aprobada si todos pasan:

- [ ] Mideli entra con sus credenciales actuales.
- [ ] El dueño de Mideli no puede leer datos de otro negocio de prueba.
- [ ] Una cuenta local no puede leer ni modificar otro negocio.
- [ ] Andrea puede consultar y operar solo negocios explícitamente habilitados.
- [ ] Mauro ve únicamente la Cocina de Mideli.
- [ ] La mesera global puede cobrar, pero el pago se vincula a la caja correcta.
- [ ] La mesera global no puede marcar `Listo` de otro negocio por defecto.
- [ ] Un dueño puede administrar su personal sin ser administrador de plataforma.
- [ ] Desactivar una membresía bloquea nuevas operaciones y conserva historial.
- [ ] RLS y RPC rechazan un `business_id` manipulado desde el navegador.
- [ ] Los conteos y totales de Mideli coinciden antes y después del backfill.
- [ ] No hay referencias cruzadas de catálogo, inventario, pedidos, pagos o caja.
- [ ] Existe rollback operativo sin borrar datos.

## Paso posterior

Después de aprobar esta rebanada, la siguiente implementación será el contexto
de catálogo y configuración de Mideli. Luego se migrarán pedidos, inventario,
caja y pagos en pasos separados. El selector visible de negocio y el pedido
mixto se habilitarán al final del piloto de compatibilidad de Mideli.
