# Especificación de cierre: plataforma multinegocio de Rincón 404 Food Park

**Estado:** diseño técnico listo para convertirse en implementación. No autoriza cambios de código, Supabase ni producción.

**Fecha de revisión:** 2026-09-19

## 1. Resultado que se busca

Rincón 404 Food Park tendrá una sola aplicación operativa. Dentro de ella existirán varios negocios independientes, cada uno con su propio menú, inventario, pedidos, estados, caja, gastos, pagos, historial, reportes, personal y configuración.

La mesera global podrá trabajar con todos los negocios desde una sola comanda. El sistema dividirá el pedido en cuentas y operaciones independientes sin pedirle que cambie de aplicación ni obligarla a capturar dos veces.

Mideli será el primer negocio migrado. Su comportamiento visible, folios y accesos actuales deben permanecer iguales. WhatsApp seguirá perteneciendo únicamente a Mideli en esta primera etapa.

Just Dipping se incorporará después, con sus datos reales y autorización. Su nombre canónico es `Just Dipping`.

## 2. Reglas no negociables

1. Un usuario local nunca puede leer, modificar, cobrar o preparar información de otro negocio.
2. Una mesera global puede operar y cobrar para cualquier negocio habilitado, pero no administrar menús, inventarios, usuarios ni configuración privada de esos negocios.
3. El dueño administra su negocio y su personal sin depender de la administración de Rincón 404 para la operación diaria.
4. El Coordinador administra meseras globales y el plano compartido de mesas, no los negocios ni su personal interno.
5. El administrador de plataforma administra el ciclo de vida de negocios, accesos excepcionales y salud técnica, pero no ve finanzas privadas por defecto.
6. Las mesas y zonas son recursos compartidos de Rincón 404. Los negocios las usan, pero no cambian el plano.
7. Un pedido mixto se confirma como una sola acción, pero se almacena como una visita de mesa con una cuenta hija por negocio.
8. Un pago solo puede afectar la cuenta y la caja del negocio correspondiente.
9. Un pedido, pago, gasto, movimiento de caja o auditoría financiera no se borra físicamente.
10. “Eliminar negocio” significa pausar, archivar o retirar. El borrado irreversible requiere que no existan dependencias y una autorización explícita.
11. El navegador nunca decide por sí solo qué negocio puede consultar. El servidor y RLS derivan el alcance desde la sesión y las membresías.
12. No se registra Just Dipping ni se importan datos de su sistema hasta que se confirme el alta con información real.

## 3. Jerarquía y modelo de acceso

```text
Administrador de plataforma
└── Rincón 404 Food Park
    ├── Coordinador global
    ├── Meseras globales
    ├── Mideli
    │   ├── Dueño o dueños
    │   ├── Personal local
    │   └── Cocina / caja
    └── Just Dipping
        ├── Dueño o dueños
        └── Personal local
```

### 3.1 Entidades de seguridad

Se conservará el `auth.users.id` actual y el perfil existente. Se agregarán conceptos separados:

- `organization`: Rincón 404 Food Park.
- `business`: un negocio que pertenece a la organización y tiene ciclo de vida.
- `organization_membership`: acceso global de plataforma, Coordinador o mesera global.
- `business_membership`: acceso del usuario a un negocio, con permisos operativos.
- `permission` o capacidades: acciones concretas como operar pedidos, cambiar estados, cobrar, abrir caja, administrar menú o administrar inventario.
- `audit_event`: cambios sensibles con actor, alcance, entidad, motivo y fecha.

Una persona podrá tener varias capacidades en un mismo negocio. Esto permite que Mauro sea Cocina y también caja cuando corresponda. La base no debe limitarse a un solo rol excluyente por usuario.

Aunque hoy se indicó que una persona no cambia de función entre negocios, el modelo de membresías por negocio debe permitirlo en el futuro sin rehacer la seguridad. Tener una función en Mideli no otorga acceso a Just Dipping.

### 3.2 Cuentas actuales

Los alias comprobados en Auth son:

| Alias actual | Función futura | Acción durante la migración |
|---|---|---|
| `admin` | Dueño de Mideli | Mantener acceso y credenciales |
| `andrea` | Mesera global | Mantener acceso; cambiar el alcance mediante membresía |
| `mideli1` | Cuenta antigua sin uso | Conservar y desactivar solo con autorización |
| `mauro` | Cocina y caja de Mideli | Mantener acceso; limitarlo a Mideli |

Actualmente esos accesos usan internamente el dominio heredado `@mideli.com`. No se cambiarán las cuentas de Auth ni sus contraseñas durante el primer paso. El dominio se ocultará de la interfaz mediante una tabla de identificadores de inicio.

Para cuentas nuevas:

- El dueño crea un nombre corto y una contraseña temporal.
- El nombre corto es único en toda la organización.
- El primer inicio exige cambio de contraseña.
- La aplicación conserva el correo técnico interno solo como detalle de Auth.
- No se solicitan correos si el flujo del negocio no los necesita.
- El dueño puede restablecer la contraseña del personal de su negocio y emitir
  una contraseña temporal sin intervención diaria de la plataforma.
- El dueño y el Coordinador pueden registrar un correo o teléfono verificado
  para recuperación; si no existe un medio verificado, la recuperación de una
  cuenta propietaria requiere una acción de plataforma auditada.
- Desactivar una cuenta impide nuevas operaciones después del pedido actual y conserva su historial.

El administrador de plataforma tendrá una cuenta independiente de `admin`. No se reutilizará la cuenta del dueño de Mideli.

## 4. Ciclo de vida de un negocio

Estados previstos:

| Estado | Puede recibir pedidos | Uso |
|---|---:|---|
| `draft` | No | Se está configurando |
| `active` | Sí | Operación normal |
| `paused` | No nuevos | Emergencia, falta de pago o pausa temporal; se terminan pedidos abiertos |
| `archived` | No | Fuera de operación, reversible |
| `retired` | No | Salió de Rincón 404; conserva histórico |

El dueño podrá completar y activar su negocio cuando tenga la configuración mínima. El administrador de plataforma podrá pausar por seguridad, servicio o licencia. Pausar no cancela silenciosamente pedidos abiertos.

La configuración mínima antes de activar será: dueño activo, nombre, catálogo válido, permisos, caja, zona horaria, reglas de cumplimiento y, si aplica, impresora o Cocina.

## 5. Alcance de cada tipo de dato

Cada tabla y RPC deberá clasificarse explícitamente antes de recibir una columna de negocio:

| Alcance | Ejemplos | Regla |
|---|---|---|
| Organización | zonas, mesas, meseras globales, auditoría de plataforma | Compartido, no financiero |
| Negocio | catálogo, pedidos, inventario, caja, pagos, gastos, reportes | Aislado por negocio |
| Canal | WhatsApp, horarios, tarifas, cotizaciones | Canal asignado a un negocio |
| Usuario/dispositivo | Push, onboarding, preferencias, impresora local | Limitado por usuario, dispositivo y negocio permitido |
| Privado | credenciales de licencia, secretos de vendedor | Solo servidor; nunca se expone por RLS normal |

Clientes y domicilios se modelarán como contacto técnico reutilizable en la organización, pero la vista de cada dueño será un vínculo filtrado por su negocio. Un dueño puede ver la dirección necesaria de sus pedidos y clientes relacionados, pero no el historial de compras ajeno.

## 6. Flujo de pedido mixto

### 6.1 Modelo

```text
Mesa 5 · Servicio 42
├── Cuenta Mideli · Folio M-18
│   ├── Pedido técnico actual
│   └── Consumos adicionales
└── Cuenta Just Dipping · Folio JD-7
    └── Pedido técnico actual
```

Se agregará una visita de mesa explícita. No se debe inferir la cuenta usando únicamente la mesa y el pedido más reciente, porque el cuestionario confirmó que una mesa puede tener más de un servicio abierto.

La mesera tendrá acciones claras:

- `Nuevo servicio` para comenzar otra visita en la misma mesa.
- `Continuar servicio` para agregar a una visita que siga abierta.
- `Ver cuentas` para consultar la separación por negocio.

### 6.2 Confirmación atómica

El RPC nuevo recibirá una clave de idempotencia y el carrito completo. Dentro de una sola transacción deberá:

1. Validar sesión y capacidad de operar la mesa.
2. Validar que cada producto está activo y pertenece a un negocio habilitado.
3. Agrupar las líneas por negocio sin confiar en un `business_id` enviado por el navegador.
4. Crear o usar la visita seleccionada.
5. Crear una cuenta hija por negocio.
6. Crear las órdenes hijas y sus líneas.
7. Ejecutar inventario, folios y caja con el negocio correcto.
8. Crear los eventos de estado y notificación con el alcance correcto.
9. Devolver a la mesera el servicio y sus cuentas agrupadas.

Si falla una parte, se revierte todo el conjunto. Un reintento con la misma clave no crea un segundo pedido ni vuelve a descontar inventario.

### 6.3 Correcciones

La mesera podrá corregir una línea enviada al negocio equivocado mediante una operación registrada. El servidor verificará que el pedido esté en un estado editable, devolverá inventario si ya se consumió, creará la línea correcta y dejará el motivo y el responsable. No se permitirá una edición silenciosa de un pedido cobrado.

Si una cuenta ya fue pagada y se agrega otro producto, se crea un consumo o cuenta adicional ligada a la misma visita. No se reabre el pago anterior.

## 7. Cumplimiento, Cocina y Estado

Cada negocio tendrá una configuración de cumplimiento:

- `kitchen_screen`: recibe KDS y cambios de Cocina.
- `status_only`: opera desde Estado.
- `printer`: genera ticket en su propia impresora.
- Se pueden combinar `status_only` y `printer`.

Primera etapa:

- Mideli: conserva Cocina, Estado y sus alertas actuales.
- Just Dipping: Estado con `Pendiente`, `Preparando` y `Listo`, con impresora propia cuando sus dueños lo confirmen. Nunca aparece en la Cocina de Mideli.

El dueño o el personal autorizado del negocio puede cambiar los estados de
preparación de sus pedidos. La mesera global puede consultar el estado, recibir
la notificación, entregar cada parte y cobrarla, pero no marca como `Listo` la
producción de otro negocio por defecto. Una excepción debe ser una capacidad
explícita y auditada. Cada negocio puede cancelarse o reemplazarse sin cancelar
automáticamente la parte de otro negocio.

Las notificaciones Push, Realtime, sonido y cola de impresión deben incluir el negocio. Andrea puede recibir varios negocios; Mauro solo Mideli. El texto de cada aviso debe mencionar negocio y mesa.

## 8. Cobros y caja

- Cada negocio tendrá una caja abierta independiente.
- La mesera global puede cobrar para cualquier negocio.
- El pago debe incluir órdenes de un solo negocio.
- La autorización de abrir, cerrar, descontar, corregir, devolver o anular se resolverá dentro de la membresía del negocio.
- La interfaz mostrará una acción de cobro independiente por negocio. El total
  general de la mesa será informativo y no creará una transacción financiera
  compartida.
- Se conservan pagos parciales, combinados y divididos, pero sin mezclar negocios en una transacción financiera.
- La propina se asigna a la mesera según la regla actual; no se reparte automáticamente entre negocios.
- No se necesita guardar la terminal física.

En pedidos de domicilio con repartidor externo, se deben separar siempre:

- subtotal de productos que pertenece al negocio;
- tarifa de envío informativa para el cliente o repartidor;
- importe efectivamente cobrado por el negocio.

La tarifa externa no debe inflar las ventas ni el efectivo del negocio si el repartidor la cobra aparte. Este principio se aplica a Estado, Historial, tickets, reportes y mensajes operativos.

## 9. Catálogo e inventario

Cada negocio tendrá sus propias categorías, productos, variaciones, imágenes, recetas, insumos, compras, lotes, conteos y movimientos.

Reglas:

- Un producto pertenece a una categoría y negocio.
- Una receta solo puede usar insumos del mismo negocio durante la primera versión.
- El inventario compartido físico no se resolverá por coincidencia de nombres. Si en el futuro se necesita, se creará como recurso compartido explícito con reglas de costo y consumo.
- No se mezclan precios, variaciones, costos ni existencias.
- Editar o cancelar una línea debe generar devolución y nuevo consumo correctamente.

La migración de Mideli asociará su catálogo e inventario existentes sin duplicarlos. El inventario remoto consultado contiene 5 insumos y ninguna receta registrada, por lo que no se debe inventar una receta durante el backfill.

## 10. WhatsApp

WhatsApp queda fuera del alta de Just Dipping en la primera etapa.

La configuración singleton actual se asociará explícitamente a Mideli junto con:

- conversaciones y mensajes;
- clientes y domicilios;
- catálogo visible;
- horarios, excepciones y tarifas;
- cotizaciones y notificaciones;
- pedidos externos y programados.

Después, si otro negocio conecta otro número, el canal resolverá su negocio antes de cargar catálogo, horario o delivery. Un pedido de WhatsApp de Mideli no podrá incluir productos de Just Dipping.

## 11. Migración segura de Mideli

### Fase 0: protección

- Congelar una versión estable identificable.
- Crear respaldo verificable y probar restauración en entorno separado.
- Crear staging o rama de base de datos sin tocar producción.
- Exportar conteos agregados y totales de control, sin guardar secretos.
- Ejecutar el conjunto de regresión existente y añadir pruebas de RLS.

### Fase 1: fundación aditiva

- Crear organización y negocio Mideli.
- Crear membresías del dueño, Andrea y Mauro.
- Mantener Auth, alias y folios actuales.
- Agregar contexto nullable o de transición a las tablas existentes.
- Asociar todo el histórico actual a Mideli.
- Asociar WhatsApp, caja, pagos, inventario y reportes a Mideli.

### Fase 2: seguridad en sombra

- Crear funciones de resolución de membresía.
- Revisar y reducir las políticas globales heredadas.
- Proteger las RPC nuevas y antiguas.
- Ejecutar consultas paralelas de comparación sin cambiar la interfaz.
- Probar que no exista lectura ni escritura cruzada.

### Fase 3: operación multinegocio apagada

- Implementar visita, cuentas por negocio y RPC idempotente.
- Mantener el flujo de Mideli funcionando mediante una ruta compatible.
- Ejecutar pedidos mixtos solo en pruebas controladas.
- Preparar Estado, impresora, Push, Realtime, caja y pagos por negocio.

### Fase 4: piloto Mideli

- Activar únicamente Mideli en operación.
- Probar una semana, preferentemente de lunes a jueves.
- No usar captura doble en el sistema anterior salvo contingencia documentada.
- Conciliar pedidos, pagos, caja e inventario cada día.
- Detener si hay pedido perdido, cobro incorrecto, negocio equivocado, inventario cruzado o datos ajenos visibles.

### Fase 5: alta de Just Dipping

Solo después de aprobar el piloto:

- Confirmar dueño, personal y permisos.
- Confirmar menú, inventario, impresora y reglas de Estado.
- Definir fecha de corte del sistema anterior.
- Importar solo datos autorizados y marcarlos como históricos/importados.
- Probar una mesa con productos de ambos negocios.

## 12. Reversión y punto de no retorno

Antes de activar el modelo nuevo se debe comprobar:

- conteo de filas y totales de Mideli antes y después;
- folios históricos sin cambios;
- pagos y caja conciliados;
- inventario y movimientos conciliados;
- clientes y domicilios asociados sin duplicar;
- Push, Cocina, Estado, WhatsApp y reportes funcionando;
- rollback probado en staging.

La reversión será una bandera o procedimiento operativo que detenga nuevas funciones multinegocio, no un `DROP` ni un borrado de datos. Las columnas de transición no se retirarán hasta completar el piloto.

## 13. Seguridad pendiente obligatoria antes de crear un segundo negocio

La auditoría remota reportó RLS sin políticas, funciones `SECURITY DEFINER` expuestas, políticas permisivas duplicadas, índices faltantes y protección de contraseñas filtradas no habilitada. Antes de crear Just Dipping se debe:

1. Revisar cada función pública y revocar `EXECUTE` a `anon` cuando no corresponda.
2. Documentar y endurecer cada `SECURITY DEFINER` con `auth.uid()`, `search_path` seguro y argumentos validados.
3. Reemplazar políticas globales por políticas basadas en membresía y alcance.
4. Crear índices para las claves foráneas y consultas por negocio/estado.
5. Corregir las expresiones RLS que se evalúan por fila.
6. Activar protección contra contraseñas filtradas si el plan de Auth lo permite.
7. Ejecutar asesores de Supabase y pruebas negativas con usuarios de cada rol.

No se debe interpretar que RLS habilitado equivale a aislamiento correcto. RLS sin política puede bloquear una operación o una RPC privilegiada puede saltarse el límite si no valida el negocio.

## 14. Criterios de aprobación del diseño

El diseño se considera listo para comenzar implementación cuando:

- se acepta este modelo como arquitectura base;
- se confirma que la cuenta de plataforma será distinta de `admin`;
- se conserva el login actual de Mideli;
- se acepta que WhatsApp permanezca solo en Mideli inicialmente;
- se acepta que la caja y el pago sean por negocio;
- se acepta que la mesa tenga visita y cuentas hijas;
- se acepta que no se borren ventas ni finanzas automáticamente;
- se confirma que Just Dipping se registrará después del piloto;
- se autoriza crear primero la migración de fundación en staging, sin tocar producción.

## 15. Decisiones que pueden esperar sin bloquear Mideli

- Dueños y empleados reales de Just Dipping.
- Conservación autorizada del historial antiguo de Just Dipping.
- Configuración exacta de impresora y sonidos de Just Dipping.
- Licencia comercial individual por negocio.
- Personalización de colores y logotipo por negocio.
- Inventario compartido entre negocios.
- WhatsApp propio de negocios futuros.

La única contradicción que no debe resolverse con código automático es la retención: en el cuestionario aparece “60 días” para un negocio retirado y también “nunca se borra” para el historial. La recomendación segura es conservar indefinidamente ventas, pagos, caja y auditoría; permitir exportar y retirar acceso operativo tras 60 días. Cualquier borrado posterior debe ser manual, autorizado y separado de la contabilidad.
