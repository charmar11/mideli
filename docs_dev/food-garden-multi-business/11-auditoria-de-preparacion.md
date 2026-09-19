# Auditoría de preparación para multinegocio

**Fecha:** 2026-09-19
**Estado:** auditoría local en modo lectura. No autoriza migraciones, cambios de permisos, datos reales ni despliegues.

## Objetivo

Determinar qué tan listo está Mideli para comenzar una migración segura hacia
Rincón 404 Food Park, sin cambiar su operación actual ni mezclar datos con un
futuro negocio como Just Dipping.

La evidencia se obtuvo del código local, las migraciones versionadas y las
especificaciones de `docs_dev/food-garden-multi-business`. El estado remoto de
Supabase debe volver a verificarse inmediatamente antes de aplicar cualquier
migración.

La línea base de código pasó `npm run lint`, `npm run build` y `git diff --check`.
Supabase confirmó que las migraciones locales y remotas están alineadas y que
el dry-run no tiene cambios pendientes. El asesor de rendimiento reportó avisos
existentes de índices foráneos faltantes y políticas RLS permisivas duplicadas.
El asesor de seguridad terminó en modo de solo lectura con 36 hallazgos: 21
informativos de RLS sin política, 3 advertencias de funciones `SECURITY DEFINER`
ejecutables por `anon`, 11 ejecutables por `authenticated` y 1 advertencia por
protección de contraseñas filtradas desactivada. La seguridad todavía no puede
declararse aprobada.

Una consulta remota de solo lectura del 2026-09-19 confirmó que existen `0`
columnas `business_id` o `organization_id` en los esquemas `public` y `private`,
y que sigue activo el índice global `cash_shifts_single_open_idx`. Esto confirma
que la base remota aún es de un solo negocio.

La misma consulta confirmó cuatro perfiles activos en `public.profiles`:
`Administrador` con rol `owner`, y `andrea`, `mauro` y `Mideli` con rol técnico
`supervisor`. Los alias de inicio de sesión no se deben inferir desde
`full_name`; la migración debe asociar cada membresía usando el `auth.users.id`
verificado en staging. Tampoco se comprobó todavía un proyecto Supabase de
staging separado. Esa es una precondición operativa antes de ejecutar la
primera migración.

La consulta `supabase branches list` del 2026-09-19 devolvió una lista vacía
para el proyecto vinculado. No existe actualmente una rama Preview de Supabase
que pueda usarse como staging; crearla será una acción separada y explícita.

La cuenta de Vercel tiene el proyecto `mideli` y su producción apunta a
`https://mideli.vercel.app`. La lista de variables, consultada sin mostrar
valores, muestra `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` solamente en
Production; Preview no tiene todavía las credenciales de Supabase aisladas.
No se debe copiar ningún valor de Production al Preview.

## Conclusión ejecutiva

El sistema actual es una base reutilizable, pero todavía es de un solo negocio.
La primera migración no debe empezar por el selector de negocios ni por la
interfaz. El bloqueo principal está en que la base y las funciones operativas
no tienen `business_id`, membresías por negocio ni políticas RLS por negocio.

La ruta segura es:

1. Crear la fundación de organización, negocios, membresías, capacidades y
   auditoría.
2. Asociar todo el histórico actual a Mideli sin duplicarlo ni cambiar folios.
3. Endurecer RLS, RPCs y triggers en un entorno de prueba.
4. Agregar contexto al catálogo, configuración, pedidos, caja, pagos e
   inventario mediante migraciones compatibles.
5. Ejecutar el piloto únicamente con Mideli.
6. Incorporar Just Dipping después de la conciliación y autorización de su
   información real.

## Matriz de brechas actual

| Área | Evidencia actual | Estado | Trabajo requerido |
|---|---|---|---|
| Organización y negocios | No existen entidades de organización ni negocio | Bloqueado | Crear ciclo de vida, propietario y asociación a Rincón 404 |
| Usuarios | `profiles.role` es un rol global; las acciones consultan el rol global | Bloqueado | Agregar membresías, capacidades y alcance por negocio |
| Catálogo | `categories` y `menu_items` no tienen frontera de negocio | Bloqueado | Asociar categorías y productos a Mideli |
| Carrito | El estado actual representa un solo catálogo | Parcial | Agrupar líneas por negocio y conservar el negocio en el borrador |
| Pedidos | `orders` y `order_items` no tienen `business_id`; el RPC crea una sola orden | Bloqueado | Introducir servicio de mesa, cuentas por negocio y creación transaccional |
| Folios | `orders.number` y `order_folio_counter` son globales | Bloqueado | Decidir folio visible global o por negocio sin renumerar históricos |
| Mesas | `table_zones` y `restaurant_tables` son recursos físicos compartidos | Parcial | Conservarlos compartidos; agregar visitas y cuentas hijas |
| Cocina y Estado | La consulta de pedidos es global y Cocina es la de Mideli | Bloqueado | Filtrar por membresía y configuración de cumplimiento |
| Pagos | Las transacciones se relacionan con órdenes, pero no hay regla de un negocio | Bloqueado | Validar negocio de todas las asignaciones dentro del RPC |
| Caja | Existe una sola caja abierta global | Bloqueado | Cambiar unicidad y triggers a una caja por negocio |
| Gastos y movimientos | Dependen de la caja global | Bloqueado | Heredar negocio desde la caja y mantener auditoría |
| Inventario | Insumos, recetas y movimientos son globales | Bloqueado | Asociar producto, receta e insumo al mismo negocio |
| Reportes | Consultan tablas globales y hay configuración singleton | Bloqueado | Filtrar por negocio y separar configuración de plataforma |
| Realtime y Push | Las suscripciones pertenecen al usuario, no al negocio | Parcial | Incluir alcance en eventos, topics, caché y notificaciones |
| Impresión | `print_station_settings` es global | Parcial | Mantener Mideli; preparar estaciones por negocio |
| WhatsApp | Es un canal único de Mideli y las tablas no tienen negocio | Aceptable como excepción | Asociar explícitamente el canal a Mideli; no habilitar otro aún |
| Licencia | `app_license` es global | Posterior | Decidir licencia de plataforma o por negocio |
| Datos de staging | Supabase puede clonar producción con `--with-data` | Gate de privacidad | Usar fixtures anonimizados o aprobar, restringir y documentar un clon controlado |

## Hallazgos de seguridad

### El frontend no puede ser el límite

Varias políticas actuales usan condiciones amplias como `USING (true)` y las
acciones operativas consultan el rol global. Ocultar un negocio en React no
impediría que un usuario consulte o modifique datos ajenos.

El límite debe existir en:

- RLS de cada tabla expuesta.
- Validaciones de cada función `SECURITY DEFINER`.
- Acciones de servidor que utilizan el cliente con `service_role`.
- Triggers de pedidos, inventario, caja y pagos.
- Realtime, cachés y suscripciones Push.

### Las acciones administrativas usan cliente privilegiado

`src/lib/actions/users.ts` crea un cliente administrativo en el servidor para
operar Auth y perfiles. Esto es válido para tareas administrativas, pero en un
modelo multinegocio no se puede asumir que `service_role` resolverá el alcance.
Cada acción que lo use debe validar membresía, capacidad y negocio objetivo
antes de tocar datos.

### Las funciones privilegiadas requieren una segunda revisión

El repositorio tiene funciones `SECURITY DEFINER` para pedidos, inventario,
pagos, caja, WhatsApp e impresión. Antes de crear Just Dipping cada una debe
validar usuario, alcance, estado activo del negocio, argumentos y relaciones
entre entidades. También se deben revocar ejecuciones innecesarias para
`anon` o `authenticated`.

## Cadenas que deben migrarse juntas

### Pedido e inventario

`menu_items -> order_items -> orders -> inventory_recipes -> inventory_items -> inventory_movements`

Una línea de Mideli no puede consumir una receta o insumo de otro negocio.

### Pedido, pago y caja

`orders -> payment_order_allocations -> payment_transactions -> cash_shifts -> cash_movements`

Un cobro debe afectar una sola cuenta y la caja del negocio correspondiente. La
mesera puede ser quien cobra, pero el dinero pertenece al negocio dueño de la
orden.

### Mesa y cuentas

`restaurant_tables -> table_visit -> business_account -> orders`

La mesa es compartida físicamente. La visita y las cuentas deben evitar que un
pedido nuevo se mezcle con una visita anterior o con otro negocio.

### Canal de WhatsApp

`whatsapp_channel -> conversations -> customers/addresses -> external orders`

En la primera etapa el canal se fija a Mideli. No se debe permitir que un
catálogo o una conversación de Just Dipping sea cargado por accidente desde la
configuración singleton actual.

## Orden técnico recomendado

### Etapa 0: congelar y medir

- Identificar una versión estable de Mideli.
- Crear respaldo verificable y probar restauración fuera de producción.
- Capturar conteos y totales de control de menú, pedidos, pagos, caja,
  inventario, clientes y domicilios.
- Ejecutar la regresión existente antes de cambiar el esquema.

### Etapa 1: fundación aditiva

- Crear organización Rincón 404 Food Park.
- Crear únicamente el negocio Mideli.
- Crear membresías para el dueño, Andrea y Mauro sin cambiar credenciales.
- Crear capacidades y auditoría.
- Mantener columnas existentes compatibles y agregar contexto nullable durante
  la transición.

### Etapa 2: catálogo y configuración

- Asociar categorías y productos existentes a Mideli.
- Asociar inventario, recetas, compras y conteos existentes a Mideli.
- Asociar configuración de impresión, reportes, Push y domicilio según su
  alcance real.
- Validar que las cachés incluyan el negocio.

### Etapa 3: seguridad en sombra

- Implementar funciones de resolución de membresía.
- Probar lectura y escritura con cada rol actual.
- Ejecutar pruebas negativas de RLS y RPC.
- Comparar consultas nuevas contra las actuales sin cambiar la interfaz.

### Etapa 4: pedidos, caja y pagos

- Agregar visita de mesa y cuenta hija por negocio.
- Mantener una ruta compatible para pedidos solo de Mideli.
- Cambiar caja, pagos y triggers para validar negocio.
- Introducir idempotencia para pedidos mixtos antes de habilitarlos.

### Etapa 5: piloto Mideli

- Activar únicamente Mideli.
- Conciliar pedidos, pagos, caja e inventario diariamente.
- Detener la migración si aparece un pedido perdido, cobro incorrecto,
  inventario cruzado o dato de otro negocio visible.

### Etapa 6: Just Dipping

Solo después del piloto de Mideli y con autorización de su dueño:

- Crear el negocio real.
- Importar catálogo con reporte de duplicados y variaciones.
- Configurar Estado, caja, personal e impresión si corresponde.
- Probar un pedido mixto y dos cobros separados.

## Gates antes de escribir la primera migración

- [ ] La cuenta de plataforma es distinta del dueño de Mideli.
- [ ] Se conserva el inicio de sesión actual de Mideli.
- [ ] WhatsApp se mantiene exclusivo de Mideli.
- [ ] Se confirma quién puede abrir, cerrar y corregir caja para una mesera global.
- [ ] Se decide si el folio visible será global o por negocio, sin renumerar el histórico.
- [ ] Se define si una mesera global puede operar una visita abierta de cualquier negocio.
- [ ] Se aprueba el modelo de visita de mesa y cuentas hijas.
- [ ] Existe respaldo restaurable en un entorno separado.
- [ ] Se cuenta con una base Supabase de staging separada para backfill y pruebas de RLS.
- [ ] La aplicación de staging tiene sus propias variables y no puede escribir en producción.
- [ ] Se definió si staging usará fixtures anonimizados o un clon controlado; no se
      copiarán PII de clientes por defecto.
- [ ] Existe una matriz de tablas, RPCs, triggers e índices con su alcance.

## Huecos residuales y recomendación de diseño

Estos puntos no impiden terminar la arquitectura, pero sí deben quedar fijados
antes de activar operaciones multinegocio:

| Hueco | Recomendación para la primera versión | Motivo |
|---|---|---|
| Recuperación de cuentas | El dueño administra contraseñas del personal local; el dueño y el Coordinador usan correo o teléfono verificado si desean recuperación; un restablecimiento de plataforma requiere auditoría | Evita depender del administrador en la operación diaria sin dejar cuentas irrecuperables |
| Alta del administrador de plataforma | Crear la cuenta una sola vez mediante procedimiento seguro de despliegue; nunca permitir que un dueño se eleve a plataforma desde la interfaz | Evita escalamiento de privilegios |
| Estados de preparación | Personal autorizado del negocio cambia `Pendiente`, `Preparando` y `Listo`; la mesera global consulta, entrega y cobra | Evita que una persona externa marque producción terminada por accidente |
| Pago de una mesa mixta | Mostrar una tarjeta de cobro por negocio y registrar una transacción por negocio; no permitir un pago financiero combinado | Cada dueño conserva su caja y conciliación |
| Efectivo entregado en una sola exhibición | Mostrar el total general como ayuda, pero capturar y cerrar cada cuenta por separado; el cambio se calcula dentro de la cuenta correspondiente | No atribuye dinero de un negocio a otro |
| Caja global | La mesera global puede cobrar si existe una caja abierta del negocio; abrir, cerrar y corregir caja sigue sujeto a la autorización de ese negocio | Conserva la autorización actual y permite cobrar sin dar control contable total |
| Concurrencia de mesa | Al iniciar un servicio, el servidor debe reservarlo con una clave idempotente; si hay visitas abiertas, la mesera elige `Nuevo servicio` o `Continuar servicio` | Evita duplicar visitas cuando dos tabletas tocan la misma mesa |
| Desactivación de usuario | Bloquear nuevas operaciones, revocar sesiones cuando sea posible y validar `is_active` en cada RPC sensible | El cambio de perfil no debe dejar una sesión privilegiada funcionando indefinidamente |
| Catálogo de negocio pausado | Rechazar nuevos pedidos en servidor aunque el catálogo siga visible para terminar operaciones abiertas | La interfaz no puede saltarse el ciclo de vida |
| Insumos compartidos | No compartir insumos en la primera etapa; si se requiere después, crear una relación explícita de recurso compartido y reglas de costo | Evita cruces por nombres iguales |

La primera migración debe convertir estas recomendaciones en pruebas de
aceptación, no solo en texto de interfaz.

## Qué sigue

La siguiente acción técnica correcta es convertir esta auditoría en un plan de
migraciones de fundación para staging. Todavía no debe crear datos en
producción. Incluirá primero organización, negocio, membresías, capacidades y
auditoría, y después un backfill controlado de Mideli.

No se debe iniciar todavía Just Dipping, un selector de negocio visible ni una
migración que haga `business_id` obligatorio. Primero debe pasar el gate de
compatibilidad de Mideli y seguridad en sombra.
