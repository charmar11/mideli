# Diseño frontend multinegocio para Rincón 404 Food Park

**Fecha:** 2026-09-20  
**Estado:** Diseño aprobado; primera rebanada de POS implementada localmente, pendiente de prueba con más de un negocio real
**Alcance:** Entrada al sistema, contexto de negocio, Nuevo pedido, comanda mixta, cobro, Estado, Historial y administración visual de negocios

## 1. Decisiones de producto

- La aplicación conserva una sola entrada: `https://mideli.vercel.app`.
- La portada mostrará `Rincón 404 Food Park` como marca principal.
- El usuario visible del login será un nombre corto, no un correo.
- Las credenciales actuales de Mideli deben continuar funcionando sin cambios.
- Supabase puede conservar un identificador interno de tipo correo, pero nunca se mostrará al trabajador.
- Una persona tendrá una cuenta y podrá tener una o varias membresías.
- El negocio se determina por la sesión y sus permisos. El selector visual nunca será una autorización.
- Mideli es el único negocio real activo en esta etapa. `Just Dipping` no se creará hasta contar con autorización, dueño, menú e inventario reales.
- WhatsApp seguirá siendo exclusivo de Mideli.

## 2. Objetivo de la experiencia

Una mesera global debe poder tomar una comanda de una mesa, cambiar entre los menús habilitados y conservar todos los productos en un mismo carrito. Al enviar, la operación debe separarse por negocio sin que la mesera tenga que crear pedidos manualmente uno por uno.

Los dueños y trabajadores locales deben conservar una experiencia prácticamente igual a la actual, pero viendo exclusivamente su negocio. La separación de datos se debe notar en los lugares donde evita errores: menú, carrito, Estado, Caja, Historial e inventario.

## 3. Entrada y navegación

### 3.1 Portada

La portada tendrá una presentación neutral:

```text
Rincón 404 Food Park
Sistema de operación para los negocios del Food Park

[Entrar al sistema]
```

No se listarán negocios ni se pedirá seleccionar uno antes del login.

### 3.2 Login

```text
Rincón 404 Food Park

Usuario
Contraseña

[Entrar]
```

El campo se llamará `Usuario` y aceptará los identificadores actuales (`admin`, `andrea`, `mauro`) además de nuevos alias únicos. Las cuentas nuevas no dependerán de que la persona conozca un correo técnico.

La recuperación de contraseña deberá tener un flujo definido antes de crear cuentas reales sin correo visible. Las opciones permitidas son código al teléfono, restablecimiento autorizado por el dueño o un código temporal de soporte. No se debe dejar una cuenta sin forma de recuperación.

### 3.3 Shell autenticado

La barra superior mostrará el contexto sin saturar la operación:

```text
Rincón 404 Food Park       Andrea
Mesero · Comanda activa
```

El selector global de negocio solo aparecerá cuando la persona tenga más de un negocio y no esté armando una comanda mixta. Dentro de una comanda, el cambio de menú será local a ese pedido para no alterar accidentalmente el contexto del resto de la aplicación.

### 3.4 Inicio según función

- Dueño de un negocio: entra directamente a la operación de su negocio.
- Personal local: ve solamente los módulos autorizados de su negocio.
- Mesera global: entra a Mesero y puede usar los menús habilitados para su alcance.
- Coordinador: administra mesas compartidas y meseras globales.
- Administrador de plataforma: ve la administración de organizaciones y negocios.

## 4. Nuevo pedido para mesera global

La base móvil y de tablet de Nuevo pedido se conserva. No se reemplazará el POS actual; se ampliará el contexto de catálogo.

### 4.1 Encabezado de comanda

El pedido conserva el flujo actual:

```text
Nuevo pedido

[Comedor] [Domicilio] [Llevar]
Mesa o datos de entrega
```

La mesa, el domicilio o el tipo de servicio se eligen una sola vez para la comanda compartida.

### 4.2 Selector de menús

Dentro del pedido aparecerán los negocios habilitados:

```text
Menús
[Mideli] [Just Dipping] [Otros negocios habilitados]
```

Al cambiar de menú:

- Cambian categorías y productos visibles.
- No se borra el carrito.
- No se cambia la caja activa de forma silenciosa.
- El producto añadido conserva su `business_id`.
- Un negocio pausado deja de aceptar productos nuevos y muestra el motivo.

Un dueño o trabajador local verá únicamente su menú. Una mesera global verá los negocios que tenga habilitados, sin obtener permisos de administración de catálogo o inventario.

### 4.3 Carrito único agrupado

El carrito será uno solo, pero mostrará grupos por negocio:

```text
Comanda

MIDELI
1 Hamburguesa Triple             $190
1 Refresco                         $40
Subtotal Mideli                  $230

JUST DIPPING
1 Producto                        $120
Subtotal Just Dipping            $120

TOTAL GENERAL                    $350

[Continuar con datos]
```

Los modificadores, notas y variaciones seguirán ligados a la línea y al producto de su negocio. El carrito no debe permitir mezclar una variación de un negocio con un producto de otro.

### 4.4 Experiencia móvil y tablet

En tablet se conserva el catálogo y el carrito lado a lado cuando el ancho lo permita. En celular:

- Los menús son botones horizontales grandes.
- La comanda se abre mediante `Ver comanda` como panel completo o inferior.
- El total y la acción principal quedan fijos.
- Solo existe un scroll principal por vista.
- El cambio de menú no mueve la pantalla completa ni pierde la selección.
- Los controles mantienen un área táctil mínima de 44 píxeles.

## 5. Envío de una comanda mixta

Antes de enviar, la interfaz explicará cuántos pedidos relacionados se crearán:

```text
Se enviarán 2 pedidos relacionados

Mideli · $230 · Cocina
Just Dipping · $120 · Estado

Mesa: #5
Total general: $350

[Regresar] [Enviar pedidos]
```

El servidor debe crear los pedidos de manera atómica o dejar una operación recuperable sin partes invisibles. La operación compartirá una clave de creación y una referencia de visita o lote, pero cada pedido conservará:

- Su negocio.
- Su folio.
- Sus líneas.
- Su cuenta de mesa.
- Su inventario.
- Su estado de preparación.

Un doble toque o un reintento por timeout no debe duplicar pedidos, cobros ni movimientos de inventario.

## 6. Estado, Cocina y avisos

Una mesera global podrá filtrar:

```text
[Todos] [Mideli] [Just Dipping]
```

Cada tarjeta mostrará siempre el negocio:

```text
#245 · Mideli
Mesa #5 · Preparando

#246 · Just Dipping
Mesa #5 · Pendiente
```

- Mideli continúa apareciendo en Cocina.
- Los negocios sin Cocina aparecen en Estado.
- El personal local cambia los estados de su negocio.
- La mesera global consulta, recibe avisos, entrega y cobra.
- Marcar como `Listo` un pedido de otro negocio requiere una capacidad explícita y auditada.

Los colores de negocio se usarán como etiquetas sutiles. Los colores semánticos quedan reservados para estados: verde para listo o pagado, dorado para pendiente, azul para preparación y rojo para cancelación o error.

## 7. Caja e Historial

### 7.1 Cobro por negocio

Cada cuenta se puede cobrar desde el negocio que le corresponde:

```text
Mesa #5

Mideli                 $230   Pagado
Just Dipping           $120   Pendiente
```

Puede cobrar:

- La mesera global.
- El dueño del negocio.
- Un trabajador autorizado del negocio.
- El personal del negocio cuando el cliente acude directamente a pagar.

El pago se registra en la caja del negocio correcto y guarda quién lo realizó. No se requiere registrar una terminal. Si la cuenta ya está pagada, una segunda operación se bloquea con un mensaje claro.

### 7.2 Historial

El historial agrupa primero la visita y después las cuentas:

```text
Mesa #5 · Visita 38

Mideli
Pedido #245 · $230 · Pagado

Just Dipping
Pedido #246 · $120 · Pendiente
```

Filtros mínimos:

```text
[Todos] [Mideli] [Just Dipping]
[Pagados] [Pendientes] [Cancelados]
```

El dueño solo ve el historial de su negocio. La mesera global ve la información operativa necesaria para entregar y cobrar. Los reportes privados y finanzas permanecen delimitados.

## 8. Administración visual de negocios

El administrador de plataforma tendrá:

```text
Administrar → Negocios
```

La lista mostrará estado y responsable, con acciones de pausar, archivar y restaurar. No habrá borrado físico como operación normal.

El alta usará cuatro pasos:

1. Datos del negocio: nombre, identificador y zona horaria.
2. Dueño: nombre, usuario y contraseña temporal.
3. Configuración: Cocina, domicilios y capacidades iniciales.
4. Revisión y activación.

La creación será transaccional: negocio, dueño, membresía, capacidades y configuración inicial se crean juntos o no se activa nada.

## 9. Personal y permisos

El dueño administra `Administrar → Personal` para su propio negocio. Puede crear, desactivar y restablecer personal local sin borrar historial.

El Coordinador administra `Administrar → Meseras globales`. Puede crear o desactivar meseras globales y seleccionar los negocios donde pueden operar, sin administrar menús, inventarios o cajas de los dueños.

Cada cuenta mostrará un estado explícito:

- Pendiente de activación.
- Activa.
- Contraseña temporal.
- Suspendida.

Las acciones sensibles deben quedar auditadas.

## 10. Dirección visual

### Mundo del producto

Turnos, mesas, comandas, cocina, cobro, caja, inventario y reparto.

### Paleta

- Fondo negro y superficies oscuras para operación nocturna.
- Rosa Mideli para identidad y acciones principales.
- Crema para información primaria y lectura cálida.
- Verde para acciones confirmadas y estados positivos.
- Dorado para caja, pagos pendientes y atención requerida.
- Azul solo para preparación y estados informativos.

### Firma del producto

La firma será el contexto visible de la operación: una comanda única que muestra sus negocios como cuentas relacionadas, sin pedir a la mesera repetir el proceso.

### Reglas de composición

- Un foco principal por vista.
- Jerarquía por espacio, peso tipográfico y superficie, no por exceso de bordes.
- Tipografía existente de Mideli: Sora para títulos, Karla para operación y JetBrains Mono para importes y folios.
- Números de precios y contadores con ancho tabular.
- Una sola estrategia de profundidad basada en superficies y bordes sutiles.
- Estados de carga, vacío, error, desactivado y éxito en cada flujo.

## 11. Seguridad y límites

- El navegador propone el negocio, pero Supabase valida membresía, capacidad y estado activo.
- Un dueño no puede leer ni modificar otro negocio manipulando `business_id`.
- El negocio de una línea de carrito se valida contra el producto y la orden.
- WhatsApp no se vuelve multinegocio en esta fase.
- No se usarán datos inventados para crear `Just Dipping`.
- Un negocio se pausa o archiva lógicamente y conserva historial.
- Las credenciales actuales de Mideli se mantienen compatibles.

## 12.1 Estado de la primera rebanada implementada

- Mesero cuenta con un selector local de menús por negocio. Cambiarlo no cambia la sesión, la caja ni el negocio global seleccionado.
- El carrito conserva `business_id` por línea y agrupa los productos mixtos por negocio con subtotales visibles.
- La creación de una comanda mixta usa el RPC transaccional existente para comedor y crea un pedido por negocio relacionado con la misma mesa.
- Domicilio y para llevar mixtos quedan bloqueados de forma explícita hasta contar con un RPC atómico equivalente. Se conserva el flujo actual de un solo negocio.
- El resumen previo al envío explica cuántos pedidos relacionados se crearán y exige Comedor cuando la comanda contiene más de un negocio.
- Historial acepta el alcance de varios negocios para cuentas con capacidad organizacional, mantiene la restricción por negocio local y muestra el nombre del negocio en cada pedido.
- La primera rebanada no crea ni registra `Just Dipping`, no cambia WhatsApp y no se considera lista para producción hasta probarla con un segundo negocio autorizado.

## 12. Criterios de aceptación frontend

1. La portada muestra `Rincón 404 Food Park`.
2. El login funciona con usuario corto y no exige correo visible.
3. Las cuentas actuales de Mideli continúan entrando.
4. Una mesera global puede cambiar de menú sin perder el carrito.
5. El carrito agrupa productos por negocio y conserva un total general.
6. El envío muestra los negocios y subtotales que se crearán.
7. Estado y Caja identifican siempre el negocio.
8. Cada negocio puede cobrar sus propias cuentas.
9. Historial separa cuentas relacionadas de una misma mesa.
10. El flujo funciona en escritorio, tablet y celular sin scroll anidado problemático.
11. Un dueño local no ve menús, cajas, inventario ni reportes de otro negocio.
12. El alta, pausa y archivo de negocio no se habilitan en producción hasta contar con la pantalla y la operación transaccional completas.

## 13. Orden de implementación posterior

1. Capa de login por alias y shell neutral de Rincón 404.
2. Menús por negocio dentro de Nuevo pedido.
3. Carrito agrupado y comanda mixta.
4. Envío atómico, cuentas y Estados por negocio.
5. Cobro por negocio y actualización de Historial.
6. Administración de negocios y onboarding del dueño.
7. Personal local y meseras globales.
8. Pruebas con `Negocio Prueba` antes de registrar Just Dipping.

La implementación no debe comenzar hasta revisar esta especificación y confirmar que el flujo de comanda mixta, cobro independiente y administración de negocios refleja la operación real.
