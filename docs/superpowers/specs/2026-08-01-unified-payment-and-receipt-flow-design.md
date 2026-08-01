# Flujo unificado de cobro y tickets de Mideli

Fecha: 2026-08-01

## Objetivo

Reemplazar los cobros duplicados y poco ágiles de Estado e Historial por un único flujo táctil, rápido y auditable que funcione desde todos los puntos de la operación. El sistema debe manejar cuentas de mesa, pagos pendientes, divisiones por productos o partes iguales, métodos combinados, propinas, descuentos autorizados, tickets imprimibles y anulaciones seguras.

El éxito se medirá por estos resultados:

1. Un mesero puede cobrar un pedido sencillo con pocos toques.
2. Una mesa con varios pedidos puede liquidarse completa o dividirse sin cálculos manuales.
3. Un pago combinado nunca puede registrar un total incompleto o duplicado.
4. Cada movimiento queda identificado, es reimprimible y puede auditarse.
5. El flujo se usa cómodamente en tableta y celular.

## Enfoques considerados

### 1. Motor de cobro centralizado

Es la opción aprobada. Un componente y una capa transaccional compartidos atienden Pedido, Estado, Historial y cuentas pendientes. Evita que cada pantalla calcule efectivo, cambio o saldos de una forma distinta.

### 2. Modificar los modales existentes

Se descartó porque Estado e Historial duplican actualmente la lógica de cobro. Extender ambos produciría divergencias y haría frágiles las cuentas divididas, anulaciones y reimpresiones.

### 3. Crear un módulo de caja independiente

Se descartó por ser demasiado amplio para un solo local. El cobro debe integrarse al flujo operativo existente y no obligar al mesero a cambiar a otra superficie.

## Principios del flujo

- La acción principal cambia según el contexto del pedido.
- Cobrar nunca depende de cuadros de diálogo nativos del navegador.
- El total pendiente siempre permanece visible.
- El sistema hace las sumas y validaciones; el mesero no debe calcular cambio o divisiones manualmente.
- El registro financiero es inmutable. Una corrección anula, no borra.
- El ticket es resultado de una transacción, no una captura temporal de pantalla.
- El acento rosa indica la siguiente acción. Verde confirma un pago concluido.

## Puntos de entrada

### Confirmación de pedido

- Comedor mantiene `Confirmar y enviar`.
- Para llevar y domicilio muestran `Enviar a cocina` y `Cobrar y enviar`.
- `Cobrar y enviar` crea primero el pedido y abre el cobro sobre ese pedido. El envío a cocina no debe depender de que la impresión termine.

### Estado

- En comedor, la acción principal del pedido listo es `Entregar`.
- En para llevar y domicilio, la acción principal es `Cobrar y entregar`.
- Siempre existe una acción secundaria para el caso menos frecuente.
- Al cobrar una mesa, se abre por defecto la cuenta completa de esa mesa.
- La cuenta incluye pedidos abiertos en preparación, listos y entregados. Los pedidos todavía en cocina se distinguen antes de confirmar.

### Historial y pendientes

- Los pedidos entregados sin pagar permanecen en el filtro persistente de pendientes.
- Desde ahí se puede cobrar una orden o la cuenta completa de la mesa.
- Los tickets del día pueden consultarse y reimprimirse por cualquier mesero.
- Solo dueño y administrador pueden consultar anulaciones o intervenir tickets de días anteriores según los permisos actuales del historial.

#### Resumen rápido de cuentas pendientes

Se consideraron tres formas de anticipar el contenido de una cuenta antes de cobrar:

1. Mostrar siempre el detalle completo. Aporta toda la información, pero vuelve muy larga la lista cuando existen varias mesas o pedidos.
2. Mostrar un resumen compacto expandible. Permite reconocer la cuenta en segundos y conserva una lista fácil de recorrer. Es la opción aprobada.
3. Abrir un modal separado de consulta. Mantiene las tarjetas pequeñas, pero agrega un paso y compite con el panel de cobro.

Cada tarjeta de mesa pendiente mostrará hasta tres líneas de productos con cantidad y nombre. Los extras o variaciones se presentarán debajo con menor jerarquía cuando ayuden a diferenciar el platillo. Si existen más líneas, una acción `Ver detalle` desplegará todos los productos dentro de la misma tarjeta y cambiará a `Ocultar detalle` al cerrarla.

Cuando una mesa reúna más de un pedido, el resumen conservará la separación por número de pedido para que el mesero entienda cómo se formó la cuenta. El saldo pendiente y la acción `Cobrar cuenta` permanecerán visibles aunque el detalle esté expandido. En móvil, la tarjeta apilará contenido, saldo y acción sin desplazamiento horizontal. El resumen reutilizará los productos ya cargados por Historial y no hará consultas adicionales a Supabase.

## Experiencia del panel de cobro

El cobro será un panel central amplio en tableta y escritorio, y una hoja inferior de altura completa en móvil. No será una cadena de modales. El contenido se organiza como un recorrido visible con resumen persistente.

### Encabezado

- Número de pedido o nombre de mesa.
- Tipo de servicio y estado operativo.
- Cantidad de pedidos incluidos.
- Saldo pendiente destacado con números tabulares.
- Cierre accesible que advierte antes de perder una división aún no cobrada.

### Resumen de cuenta

- Pedidos agrupados por mesa cuando corresponda.
- Productos, cantidades, precios y extras cobrados.
- Indicador visible para productos todavía en preparación.
- Notas internas disponibles en el resumen operativo, pero excluidas del ticket.

### Descuento

- Puede ser porcentaje o monto fijo.
- Se aplica a la cuenta completa antes de dividir.
- Al dividir, se distribuye proporcionalmente según el consumo original de cada parte. Cualquier centavo residual se asigna a la última parte para conservar el descuento exacto.
- Requiere autorización con PIN de cuatro dígitos de dueño o administrador.
- No requiere capturar un motivo.
- La autorización registra quién aprobó el descuento.
- El descuento nunca puede hacer negativo el total de consumo.

### División de cuenta

Se ofrecen tres modos:

1. `Cuenta completa`.
2. `Partes iguales`, entre 2 o más personas.
3. `Por productos`, asignando unidades concretas de cada producto.

Reglas:

- Una línea con cantidad mayor a uno se puede repartir por unidades.
- Una unidad no puede pertenecer a dos partes a la vez.
- Las partes iguales usan centavos. Cualquier residuo de redondeo se asigna a la última parte para conservar el total exacto.
- Las partes se nombran `Cuenta 1`, `Cuenta 2` y sucesivamente.
- Cada parte muestra pagado, pendiente y estado.
- Una parte pagada queda bloqueada contra modificaciones.
- Los productos sin asignar permanecen claramente visibles.
- Nuevos pedidos de la mesa posteriores al cobro parcial quedan como saldo abierto y no alteran tickets ya emitidos.

### Propina

- Se define por cada parte al momento de pagar.
- Opciones rápidas: sin propina, 10%, 15% y 20%.
- También admite monto personalizado.
- La propina se suma al total por cobrar de esa transacción.
- Se registra separada de la venta de alimentos y del descuento.

### Métodos de pago

El usuario elige uno de estos modos:

- Efectivo.
- Tarjeta.
- Transferencia.
- Pago combinado.

En pago combinado se pueden mezclar dos o los tres métodos. El sistema exige que la suma asignada sea igual al consumo de la parte más su propina.

Para efectivo:

- Campo grande sin controles nativos de incremento.
- Teclado numérico táctil dentro del panel.
- Cantidades sugeridas a partir del saldo, la siguiente decena, la siguiente centena y denominaciones útiles.
- El cambio se calcula únicamente contra el importe asignado a efectivo.
- No se permite confirmar si el efectivo recibido no cubre su parte.

Tarjeta y transferencia solo registran un pago realizado mediante una terminal o banco externo. No habrá integración directa con procesadores en esta fase.

### Confirmación

Antes de guardar se muestra:

- Consumo de la parte.
- Descuento proporcional aplicado.
- Propina.
- Total a cobrar.
- Desglose por método.
- Efectivo recibido y cambio.

El botón final tiene estado de carga, bloquea dobles pulsaciones y usa una clave de idempotencia por intento. La interfaz no afirma que el pago terminó hasta que Supabase devuelve la transacción confirmada.

## Resultado y ticket

Después de confirmar se muestra una vista de éxito con previsualización real del ticket y dos acciones principales:

- `Imprimir ticket`.
- `Cerrar`.

No se abre la impresión automáticamente. No existe descarga PDF.

### Contenido del ticket

- Mideli.
- Burger & Sushi.
- C. Yaqui 404 Oriente, Cd. Obregón, Sonora.
- Número de pedido y folio secuencial de ticket.
- Fecha y hora en la zona horaria de Hermosillo.
- Mesa o cliente.
- Nombre del mesero que registró el cobro.
- Productos, cantidades, precios y extras cobrados.
- Subtotal, descuento, propina y total.
- Desglose de efectivo, tarjeta y transferencia.
- Efectivo recibido y cambio cuando corresponda.
- Texto final `Gracias por tu compra`.

No se incluye eslogan, información fiscal, teléfono, redes sociales ni notas internas de preparación.

### Formato de impresión

- Previsualización seleccionable en 80 mm o 58 mm.
- La preferencia se conserva en el dispositivo.
- CSS de impresión elimina navegación, fondos del sistema y controles.
- El ticket usa alto flexible según su contenido.
- Las reimpresiones muestran `REIMPRESIÓN` de forma discreta.
- El resultado no depende de que exista una impresora durante el desarrollo.

## Modelo de datos

El modelo actual de una forma de pago directamente en `orders` no es suficiente para pagos parciales o combinados. Se añadirá un libro mayor de cobros.

### Entidades propuestas

#### `payment_transactions`

Representa un ticket confirmado.

- Folio secuencial.
- Estado `completed` o `voided`.
- Consumo cubierto, descuento aplicado, propina y total cobrado.
- Efectivo recibido y cambio total.
- Usuario que cobró.
- Usuario que anuló y fecha de anulación.
- Clave de idempotencia única.
- Fecha de creación.

#### `payment_tenders`

Una fila por método usado dentro de una transacción.

- Transacción.
- Método: efectivo, tarjeta o transferencia.
- Monto asignado.
- Efectivo recibido y cambio solo cuando aplique.

#### `payment_order_allocations`

Distribuye el consumo cobrado entre pedidos. Permite calcular el saldo pendiente exacto de cada orden.

#### `payment_item_allocations`

Congela los productos y unidades incluidos en cada parte. Conserva nombre, cantidad, precio y extras necesarios para reimprimir aunque el menú cambie posteriormente.

#### Autorización de descuento

La transacción conserva el descuento y el usuario administrador que lo autorizó. El PIN no se guarda en texto. Una tabla privada, fuera de la API pública, almacena únicamente un hash seguro y los datos de protección contra intentos repetidos.

### Compatibilidad con órdenes

- `orders.total` continúa representando el consumo original.
- El saldo se deriva de asignaciones de pagos completados menos anulaciones.
- Una orden pasa a `paid` solo cuando su saldo de consumo llega a cero.
- Una orden parcialmente pagada permanece operativamente pendiente.
- Los campos de pago actuales se mantienen temporalmente para compatibilidad y se actualizan cuando una orden se liquida con un solo método. La nueva fuente de verdad financiera son las transacciones.

## Operaciones atómicas en Supabase

Las operaciones financieras se ejecutan mediante funciones transaccionales con autorización explícita:

### Confirmar pago

1. Valida usuario activo y rol autorizado.
2. Bloquea las órdenes involucradas para evitar cobros concurrentes.
3. Comprueba saldos actuales y asignaciones.
4. Valida descuento y autorización, si existe.
5. Valida que los métodos sumen exactamente el total de la transacción.
6. Inserta transacción, métodos y asignaciones.
7. Actualiza órdenes completamente liquidadas.
8. Devuelve el ticket confirmado.

La clave de idempotencia hace que repetir la misma solicitud devuelva la transacción existente en lugar de cobrar dos veces.

### Anular pago

- Solo dueño o administrador.
- Cambia la transacción a `voided`; no elimina filas.
- Registra autor y fecha.
- Recalcula el saldo de las órdenes afectadas.
- Devuelve a pendiente las órdenes que ya no estén liquidadas.
- El ticket permanece disponible con estado anulado.

### Verificar PIN

- Solo acepta PIN de cuatro dígitos.
- Compara contra hash, nunca contra texto almacenado.
- Limita intentos repetidos por usuario y ventana temporal.
- Devuelve una autorización de uso único ligada al cobro, no una sesión administrativa general.

Todas las tablas expuestas tendrán RLS. Las funciones privilegiadas se mantendrán fuera del esquema expuesto cuando sea necesario, con comprobación de `auth.uid()`, permisos mínimos y `search_path` fijo.

## Reutilización en la interfaz

Se creará un conjunto único de componentes de cobro:

- `PaymentFlow`, coordinador del recorrido.
- `AccountSummary`, cuenta de mesa o pedido.
- `SplitBuilder`, división igual o por productos.
- `DiscountAuthorization`, captura y validación de PIN.
- `TenderSelector`, método único o combinado.
- `NumericKeypad`, captura táctil.
- `ReceiptPreview`, ticket original o reimpresión.

Estado, Historial y Confirmación de pedido solo preparan el contexto y abren `PaymentFlow`. No duplican cálculos financieros.

## Analíticas

Analíticas incorporará métricas separadas para:

- Propinas recibidas.
- Descuentos autorizados.
- Distribución por método, incluyendo transacciones combinadas.
- Cobros anulados.
- Saldo pendiente.

Las ventas de alimentos excluyen propina. Los cobros anulados no suman ingresos. El descuento reduce el ingreso de venta reportado sin modificar el precio histórico de los productos.

## Permisos

- Mesero: cobrar cualquier cuenta activa, dividir, registrar propina y reimprimir tickets del día.
- Cocina: sin acceso al cobro.
- Dueño y administrador: configurar PIN, autorizar descuentos, anular pagos y consultar tickets históricos.
- Supervisor conserva sus permisos actuales, pero no autoriza descuentos ni anula pagos en esta fase.

## Estados y errores

- Sin conexión: el botón de confirmar queda pendiente hasta conocer el resultado. Al reconectar se consulta la clave de idempotencia antes de reintentar.
- Saldo cambiado por otro dispositivo: se detiene el cobro y se actualiza la cuenta.
- Producto ya asignado o pagado: se informa qué parte cambió y se reconstruye la división.
- Efectivo insuficiente: no permite confirmar y enfoca el monto recibido.
- Suma combinada incompleta o excedida: muestra la diferencia restante.
- PIN incorrecto o bloqueado: mantiene el cobro intacto y no aplica el descuento.
- Error de impresión: el pago permanece confirmado y ofrece reintentar desde la vista de éxito o Historial.
- Cierre accidental: si todavía no existe transacción, no se registra dinero.

## Accesibilidad y respuesta táctil

- Objetivos táctiles mínimos de 44 por 44 px.
- Total, saldo, cambio y montos usan números tabulares.
- Foco visible y navegación por teclado en escritorio.
- El teclado táctil tiene etiquetas accesibles y no bloquea el teclado físico.
- El color nunca es el único indicador de estado.
- La animación se limita a transiciones cortas de entrada y confirmación, respetando reducción de movimiento.
- El panel mantiene la acción final visible sin ocultar el resumen de dinero.

## Validación

### Pruebas de base de datos

- Pago completo con cada método.
- Pago combinado con dos y tres métodos.
- Efectivo insuficiente.
- Reintento con la misma clave de idempotencia.
- Dos dispositivos intentando cobrar la misma orden.
- Pago parcial y posterior liquidación.
- Cuenta dividida por productos y partes iguales.
- Redondeo con centavos.
- Descuento con PIN válido, inválido y bloqueado.
- Anulación autorizada y denegada por rol.
- Reapertura correcta del saldo después de anular.

### Pruebas de interfaz

- Cobro desde confirmación, Estado, Historial y pendientes.
- Comedor frente a llevar y domicilio.
- Cuenta de una orden y cuenta con varios pedidos.
- División por unidades repetidas.
- Propina porcentual y personalizada.
- Teclado táctil y teclado físico.
- Prevención de doble pulsación.
- Recuperación tras desconexión simulada.
- Previsualización original, 58 mm, 80 mm y reimpresión.
- Tableta, móvil y escritorio sin desbordamiento.

## Fuera de alcance

- Integración directa con una terminal bancaria.
- Facturación fiscal o CFDI.
- Descarga de PDF.
- Envío de tickets por WhatsApp, SMS o correo.
- Reembolsos automáticos en terminales externas.
- Gestión completa de caja, turnos o corte de caja.
- Impresora específica o controlador de hardware en esta fase.
