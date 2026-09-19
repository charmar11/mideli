# Contrato técnico de la fundación multinegocio

**Estado:** contrato aprobado para convertirse en migraciones; este documento
no es el SQL ejecutable ni autoriza aplicarlo en producción.

La primera versión ejecutable quedó preparada, sin datos reales, en
`supabase/migrations/20260919082935_multibusiness_foundation.sql` y
`supabase/migrations/20260919083624_multibusiness_capability_catalog.sql`.
La aplicación remota sigue pendiente de un entorno de staging aislado.

Este contrato fija lo que debe hacer la primera migración. Su objetivo es
evitar que la implementación tenga que decidir sobre la marcha cómo representar
organizaciones, negocios, membresías y capacidades.

## Principios

- Usar UUID para las entidades nuevas, igual que el esquema operativo actual.
- Usar `timestamptz` para todos los eventos y fechas de auditoría.
- Usar `text` más `CHECK` o tablas de referencia para estados y roles que pueden
  evolucionar; no crear enums para permisos que todavía pueden cambiar.
- Usar `jsonb` únicamente para metadatos opcionales, nunca para sustituir
  relaciones entre organización, negocio, usuario o capacidad.
- Todas las claves foráneas nuevas tendrán índices explícitos.
- La fundación no agrega todavía `business_id` a pedidos, catálogo, caja o
  inventario. Esas migraciones serán posteriores y separadas.

## Entidades de la primera migración

### `organizations`

Representa un Food Park u organización operativa.

Campos mínimos:

- `id uuid primary key` con generación del servidor.
- `slug text not null unique` para referencias técnicas estables.
- `name text not null`.
- `timezone text not null`, inicialmente `America/Hermosillo`.
- `lifecycle_status text not null`, con `draft`, `active`, `paused`,
  `archived` y `retired`.
- `created_by uuid` y `created_at`, `updated_at`.

No guardar el nombre del usuario como propietario de seguridad. La relación de
control se resuelve mediante la membresía y la capacidad.

### `businesses`

Representa un negocio dentro de una organización.

Campos mínimos:

- `id uuid primary key`.
- `organization_id uuid not null references organizations(id)`.
- `slug text not null` y unicidad `(organization_id, slug)`.
- `display_name text not null`.
- `lifecycle_status text not null`, con `draft`, `active`, `paused`,
  `archived` y `retired`.
- `timezone text not null`, heredada inicialmente de la organización.
- `created_by uuid`, `created_at`, `updated_at`.
- Fechas opcionales de pausa, archivo y retiro.

No crear una columna de dueño como segunda fuente de verdad. El dueño será una
membresía `business_owner` activa.

### `memberships`

Representa el alcance de una persona y su función. Debe permitir alcance de
plataforma, organización o negocio sin duplicar cuentas de Auth.

Campos mínimos:

- `id uuid primary key`.
- `user_id uuid not null references auth.users(id)`.
- `scope_type text not null`: `platform`, `organization` o `business`.
- `organization_id uuid` nullable.
- `business_id uuid` nullable.
- `role_code text not null`.
- `status text not null`: `active`, `inactive` o `revoked`.
- `must_change_password boolean not null default false`.
- `created_by uuid`, `deactivated_by uuid`, `created_at`, `updated_at`.
- `deactivated_at timestamptz` y motivo opcional.

Restricción de alcance:

- `platform`: no requiere organización ni negocio;
- `organization`: requiere organización y no permite negocio;
- `business`: requiere organización y negocio;
- un trigger valida que el negocio pertenezca a la organización indicada;
- una membresía inactiva nunca autoriza una operación nueva.

La unicidad de membresías activas debe evitar duplicar el mismo usuario,
alcance y rol, pero permitir que una persona tenga funciones explícitas
distintas solo cuando el producto lo autorice. La primera versión no usará
roles implícitos derivados del nombre visible.

### `capabilities`

Catálogo interno de capacidades, con código estable como clave primaria:

- `platform.manage_businesses`.
- `organization.manage_global_waiters`.
- `organization.manage_tables`.
- `business.manage_staff`.
- `business.manage_catalog`.
- `business.manage_inventory`.
- `business.operate_orders`.
- `business.update_preparation`.
- `business.charge_orders`.
- `business.manage_cash`.

### `membership_capabilities`

Relaciona una membresía con una capacidad explícita cuando el rol base la
recibe. Debe guardar quién otorgó o revocó la capacidad y el motivo. El
navegador nunca puede insertar una capacidad de plataforma directamente.

La resolución efectiva será servidor + RLS:

1. sesión válida;
2. membresía activa;
3. negocio activo y dentro del alcance;
4. capacidad requerida;
5. relación entre todas las entidades validada.

### `audit_events`

Registra cambios administrativos y correcciones sensibles.

Campos mínimos:

- `id uuid primary key`.
- `actor_user_id uuid` nullable para eventos de soporte controlado.
- `organization_id uuid` nullable.
- `business_id uuid` nullable.
- `action text not null`.
- `entity_type text not null`.
- `entity_id uuid` nullable.
- `reason text not null` para acciones sensibles.
- `metadata jsonb not null default '{}'`, sin contraseñas, tokens ni datos
  innecesarios de clientes.
- `created_at timestamptz not null default now()`.

Debe ser insertable solamente mediante una función segura o un servicio de
servidor autorizado. No permitir que un cliente cambie el actor o la fecha.

## Restricciones e índices obligatorios

- Índice en `businesses(organization_id, lifecycle_status)`.
- Índices en `memberships(user_id, status)`,
  `memberships(organization_id, status)` y
  `memberships(business_id, status)`.
- Índice en `audit_events(organization_id, created_at desc)` y
  `audit_events(business_id, created_at desc)`.
- Índice parcial para membresías activas cuando corresponda a la unicidad
  real del rol y alcance.
- `ON DELETE RESTRICT` para no borrar una organización o negocio con historial.
- Desactivación lógica para negocios y membresías; nunca borrado físico como
  operación normal.

## RLS y funciones

Todas las entidades nuevas tendrán RLS habilitado desde su creación.

- Plataforma: administra el ciclo de vida de organizaciones y negocios y
  acciones de soporte auditadas.
- Organización: el Coordinador administra meseras globales y mesas compartidas.
- Negocio: el dueño administra personal, catálogo, inventario y operación de
  su negocio según sus capacidades.
- Mesera global: no administra catálogo ni inventario por defecto; su permiso
  operativo se aplicará cuando los dominios de pedidos se migren.

Las funciones `SECURITY DEFINER` deben fijar `search_path`, validar
`auth.uid()`, comprobar membresía activa y no confiar en un `business_id`
proporcionado por el navegador.

## Orden de implementación

1. Crear las tablas nuevas y sus índices, sin tocar todavía tablas operativas.
2. Crear funciones de resolución de alcance y auditoría.
3. Aplicar RLS y pruebas negativas de las entidades nuevas.
4. Sembrar en staging únicamente Rincón 404 Food Park y Mideli.
5. Asociar perfiles mediante `auth.users.id` verificado.
6. Comprobar capacidades de Administrador, Andrea, Mauro y la cuenta antigua
   antes de decidir su desactivación.
7. Ejecutar lint, build, pruebas E2E, dry-run de Supabase y pruebas de
   manipulación de IDs desde el navegador.

## Fuera de esta migración

- No agregar `business_id` a `orders`, `menu_items`, `categories`, caja,
  pagos, inventario o clientes todavía.
- No cambiar credenciales ni alias actuales.
- No crear Just Dipping.
- No mover WhatsApp.
- No crear pedidos mixtos.
- No modificar folios ni reescribir historiales.
- No cambiar la caja global hasta que pagos y órdenes tengan contexto seguro.

## Criterio de aceptación

La fundación está aprobada cuando una cuenta de staging no puede manipular una
membresía o negocio fuera de su alcance, el dueño de Mideli puede administrar
su membresía local, el Coordinador puede administrar meseras globales y la
aplicación actual sigue entrando sin cambios visibles. Si cualquier prueba
requiere confiar en un filtro del frontend, la migración no está lista.
