# Turnos de caja, cortes y ubicaciones históricas de Mideli

Fecha: 2026-08-01

## Objetivo

Incorporar una caja compartida por turno para el único local de Mideli. El sistema debe impedir ventas fuera de turno, asociar cada pedido y cobro a la operación correcta, controlar efectivo, registrar movimientos no relacionados con ventas, realizar un cierre con conteo ciego y conservar un historial administrativo inmutable.

También debe mostrar la ubicación completa de los pedidos como `Reservado · Mesa #1` en Estado, Historial, cuentas pendientes, cobro y tickets, conservando esa ubicación aunque después cambien los nombres del plano. Todo texto de ayuda relacionado con notificaciones o instalación debe usar términos genéricos como `dispositivo`, sin mencionar marcas.

El éxito se medirá por estos resultados:

1. El personal puede abrir una sola caja compartida y empezar a operar en pocos pasos.
2. Ningún pedido ni cobro nuevo queda fuera de un turno abierto.
3. El cierre separa efectivo, tarjeta y transferencia, y explica cualquier diferencia.
4. El conteo es ciego y una diferencia importante requiere autorización.
5. Los retiros, gastos, fondos y correcciones tienen responsable, motivo y autorización.
6. Las cuentas sin pagar pasan de manera explícita al siguiente turno.
7. Dueño y administrador pueden consultar cortes históricos completos sin modificar el registro original.
8. La interfaz funciona cómodamente en celular, tableta y escritorio.

## Enfoques considerados

### 1. Corte diario calculado por fecha

Se descartó porque no representa cambios reales de personal, turnos que cruzan medianoche, fondos iniciales, movimientos de efectivo ni responsables.

### 2. Caja operativa auditada

Es el enfoque aprobado. Existe una caja compartida con apertura y cierre explícitos. Pedidos, cobros, movimientos y cuentas transferidas se vinculan al turno mediante operaciones transaccionales en Supabase.

### 3. Sistema multicaja

Se descartó porque Mideli opera actualmente en un solo local y no necesita conciliaciones entre varias cajas físicas. El modelo aprobado mantiene límites que permitirán agregar cajas en el futuro sin exponer esa complejidad ahora.

## Modelo operativo

- Solo puede existir un turno de caja abierto.
- La caja es compartida por el local, no pertenece a una persona ni a un dispositivo.
- Mesero, supervisor, administrador y dueño pueden abrir caja y registrar cobros si su rol ya permite usar el POS.
- El rol `supervisor` representa a la persona que puede trabajar en Cocina y también cobrar. El rol `kitchen` permanece sin acceso financiero.
- Un mesero puede realizar el conteo y cerrar si la diferencia absoluta no supera $20.
- Una diferencia absoluta mayor a $20 requiere PIN de dueño, administrador o supervisor autorizado.
- Retiros, gastos, fondos adicionales y correcciones requieren motivo y autorización mediante PIN de dueño, administrador o supervisor.
- El PIN para caja no concede permisos generales de administración ni modifica las reglas de descuentos o anulaciones.
- Los cortes cerrados no se editan ni se eliminan. Una corrección posterior crea un registro adicional ligado al corte.

## Apertura de caja

Cuando un usuario entra al POS y no existe un turno abierto, se muestra una superficie compacta de apertura en lugar de permitir pedidos o cobros.

La apertura solicita:

- Fondo inicial en efectivo.
- Captura opcional por denominaciones mexicanas.
- Nota opcional.
- Confirmación del responsable.

El sistema crea un número secuencial de turno, guarda al usuario que abrió y registra la hora de Supabase. La base de datos impide dos aperturas simultáneas mediante una restricción única parcial y bloqueo transaccional.

Cocina puede seguir consultando y preparando pedidos existentes aunque no exista un turno abierto. No puede crear ventas ni cobrar.

## Operación durante el turno

Cada pedido nuevo guarda el turno vigente. Cada transacción de pago guarda el turno en el que fue cobrada, aunque el pedido provenga de un turno anterior.

El encabezado del POS muestra un indicador compacto como `Turno #12 · Abierto`. Al tocarlo se abre el panel de Caja con:

- Hora y responsable de apertura.
- Fondo inicial.
- Ventas cobradas por método.
- Movimientos de efectivo.
- Cantidad de cuentas pendientes.
- Acciones `Registrar movimiento`, `Ver turno` y `Cerrar turno`.

La información sensible se ajusta al rol. El mesero puede consultar la operación necesaria, pero el efectivo esperado permanece oculto durante el conteo ciego. Dueño y administrador disponen del historial completo.

## Movimientos de caja

Se admiten cuatro tipos:

- `Fondo adicional`: efectivo que entra sin ser una venta.
- `Retiro`: efectivo retirado para resguardo.
- `Gasto`: pago operativo realizado desde caja.
- `Corrección`: ajuste documentado por un error identificado.

Cada movimiento conserva:

- Turno.
- Tipo e importe positivo.
- Dirección contable derivada del tipo.
- Motivo obligatorio.
- Usuario que lo capturó.
- Usuario que lo autorizó.
- Fecha del servidor.

Los movimientos no se eliminan. Un error se compensa con otro movimiento o, después del cierre, con una corrección administrativa.

## Cierre y conteo ciego

El cierre es un recorrido guiado:

1. Revisar ventas y cuentas pendientes, sin revelar el efectivo esperado.
2. Confirmar las cuentas que pasarán al siguiente turno.
3. Contar efectivo por denominaciones mexicanas o introducir un total rápido.
4. Confirmar el conteo.
5. Calcular y revelar efectivo esperado, efectivo contado y diferencia.
6. Solicitar PIN si la diferencia absoluta supera $20.
7. Confirmar el cierre y mostrar el corte final.

Las denominaciones disponibles serán billetes de $1,000, $500, $200, $100, $50 y $20; monedas de $20, $10, $5, $2, $1 y $0.50. El usuario captura cantidades, no subtotales. El sistema calcula el total.

La fórmula de efectivo esperado es:

`fondo inicial + cobros netos en efectivo + fondos adicionales − retiros − gastos ± correcciones`

Los cobros netos usan el importe asignado a efectivo en `payment_tenders`; el cambio ya está descontado de ese importe y no se resta por segunda vez. Tarjeta y transferencia se concilian por separado. Pagos anulados no forman parte de los totales vigentes, pero permanecen visibles en la auditoría.

El turno se delimita por sus marcas de apertura y cierre, no por día calendario. Puede cruzar medianoche y siempre usa `America/Hermosillo`.

## Cuentas pendientes y transferencia

La existencia de cuentas sin pagar no bloquea el cierre.

Antes de cerrar se presenta:

- Zona y mesa o tipo de servicio.
- Pedidos incluidos.
- Resumen de productos.
- Saldo pendiente.

Al cerrar se crea una fotografía de cada cuenta pendiente. El siguiente turno las muestra como `Cuentas abiertas anteriores`. La venta pertenece al turno en el que se realiza el cobro, no al turno en que se creó el pedido.

La fotografía conserva los datos mínimos para auditoría aunque un pedido se cancele o elimine posteriormente: número, ubicación, saldo e identificadores disponibles.

## Modelo de datos

### `cash_shifts`

Representa una apertura y cierre de la caja compartida.

- Identificador UUID y número secuencial.
- Estado `open` o `closed`.
- Fondo inicial.
- Usuario y fecha de apertura.
- Usuario y fecha de cierre.
- Método de conteo `denominations` o `total`.
- Conteo de denominaciones validado.
- Efectivo contado, esperado y diferencia.
- Totales congelados de venta, descuentos, propinas, anulaciones y métodos de pago.
- Totales congelados de entradas, retiros, gastos y correcciones.
- Nota de apertura y cierre.
- Usuario que autorizó una diferencia, cuando corresponda.
- Restricción única parcial para permitir un solo turno abierto.

### `cash_movements`

Registra movimientos durante un turno abierto. Usa importe positivo, tipo restringido, motivo obligatorio, capturista, autorizador y fecha.

### `cash_shift_pending_orders`

Relaciona el corte cerrado con las cuentas pendientes transferidas. Conserva referencias opcionales al pedido y fotografías de número, zona, mesa, saldo y resumen.

### `cash_shift_adjustments`

Registra correcciones posteriores sobre un turno cerrado sin alterar sus totales originales. Conserva método afectado, dirección, importe, motivo, capturista, autorizador y fecha. La vista administrativa muestra resultado original y resultado ajustado por separado.

### Cambios en pedidos y pagos

- `orders.cash_shift_id` identifica el turno de creación.
- `orders.table_zone_id` y `orders.table_zone_name` conservan la ubicación histórica.
- `payment_transactions.cash_shift_id` identifica el turno de cobro.
- `payment_transactions.table_zone_name` conserva la zona mostrada en el ticket.
- Las relaciones con turnos usan `ON DELETE RESTRICT`; los turnos y transacciones financieras no se eliminan.
- Los pedidos históricos anteriores al módulo permiten `cash_shift_id` nulo y reciben una zona inicial cuando pueda derivarse de su mesa actual.

## Ubicación de mesas

Estado, Historial, cuentas pendientes, panel de cobro y ticket usarán un formateador compartido:

- Con zona y mesa: `Reservado · Mesa #1`.
- Solo mesa: `Mesa #1`.
- Sin mesa: etiqueta correspondiente a domicilio o para llevar.

Al crear o editar un pedido, Supabase deriva la zona desde `table_id`. El cliente no puede inventar la zona histórica. Cambiar posteriormente el nombre de una zona o mover una mesa no modifica pedidos existentes.

Para datos antiguos, una migración completa `table_zone_id` y `table_zone_name` cuando la mesa todavía existe. Si no puede resolverla, conserva únicamente la mesa disponible.

## Operaciones transaccionales en Supabase

### Abrir turno

`open_cash_shift` valida sesión, perfil activo, rol con POS, importe no negativo y ausencia de otro turno abierto. Inserta la apertura y devuelve el resumen visible para el rol.

### Crear pedido

`create_order_with_items` bloquea y valida el turno abierto antes de insertar. Asigna `cash_shift_id` y obtiene la zona desde la mesa seleccionada. Si no hay turno, devuelve un error operativo claro.

### Confirmar pago

`finalize_payment` bloquea el turno abierto y las órdenes implicadas. Revalida que el turno siga abierto, crea la transacción con `cash_shift_id` y conserva su idempotencia actual. Un pedido de un turno anterior puede cobrarse en el actual.

### Registrar movimiento

`record_cash_movement` valida turno abierto, importe, motivo, rol y una autorización de PIN de uso único. Inserta el movimiento de forma inmutable.

### Preparar cierre

`prepare_cash_shift_close` devuelve ventas por método, movimientos y cuentas pendientes, pero no devuelve el efectivo esperado a usuarios que todavía no confirmaron su conteo.

### Cerrar turno

`close_cash_shift` bloquea la fila del turno. Calcula todos los totales desde transacciones completadas y movimientos vigentes, valida el conteo y exige autorización cuando corresponde. Inserta las cuentas transferidas, congela el resumen y cambia el estado a `closed` en la misma transacción.

El mismo bloqueo usado por `finalize_payment` evita que un cobro y un cierre se confirmen simultáneamente. La primera operación confirmada obliga a la segunda a revalidar el estado.

### Corregir corte

`record_cash_shift_adjustment` solo opera sobre turnos cerrados y requiere autorización. Inserta una corrección, pero nunca actualiza el resumen original.

## Seguridad y RLS

- Todas las tablas públicas nuevas tienen RLS habilitado.
- Mesero y supervisor pueden consultar el turno abierto necesario para operar.
- Dueño y administrador pueden consultar todo el historial.
- Supervisor puede consultar los turnos en los que participó y autorizar operaciones de caja si tiene PIN configurado.
- Cocina no puede consultar importes de caja ni ejecutar funciones financieras.
- Las funciones públicas son envoltorios `SECURITY INVOKER` con permisos explícitos.
- La lógica privilegiada se mantiene en el esquema privado, valida `auth.uid()`, perfil activo y rol, fija `search_path` y revoca ejecución a `PUBLIC` y `anon`.
- Las autorizaciones de PIN son de uso único, tienen vencimiento breve y quedan ligadas a tipo de acción, turno, importe y solicitante.
- Los importes y totales se recalculan en la base de datos; el cliente no determina el efectivo esperado.
- Las tablas financieras no conceden `INSERT`, `UPDATE` o `DELETE` directos al cliente.

## Interfaz de Caja

### Acceso operativo

El POS no agrega una barra permanente. Usa un indicador compacto en el encabezado. En celular abre una hoja de altura completa; en tableta y escritorio abre un panel central amplio.

Estados visuales:

- Verde: turno abierto o corte cuadrado.
- Dorado: cierre pendiente o diferencia menor.
- Rojo: diferencia importante o acción destructiva.
- Gris: turno cerrado.

El color siempre se acompaña de texto e icono.

### Apertura

La pantalla prioriza el fondo inicial, ofrece conteo por denominaciones y explica en una línea que ese importe es el efectivo disponible al comenzar.

### Movimiento

El formulario presenta primero el tipo, después importe y motivo. La autorización aparece al final sin borrar lo capturado si el PIN falla.

### Cierre

En celular usa pasos de una sola columna y acción fija inferior. En tableta y escritorio muestra resumen y captura en dos columnas. El efectivo esperado nunca aparece antes de confirmar el conteo.

### Resultado

El corte final presenta:

- Número, apertura, cierre y duración.
- Responsables.
- Fondo inicial.
- Venta neta, descuentos y propinas.
- Efectivo, tarjeta y transferencia.
- Movimientos de caja.
- Efectivo esperado, contado y diferencia.
- Cuentas transferidas.
- Autorizaciones y correcciones.

Incluye `Imprimir corte`, que usa una vista de impresión sin guardar PDF. No depende de tener una impresora durante el desarrollo.

## Historial administrativo

Dueño y administrador disponen de una pantalla `Caja` con:

- Turno abierto destacado.
- Historial filtrable por fecha, número, responsable y resultado.
- Totales por método y diferencias.
- Detalle expandible de movimientos, cobros, anulaciones, cuentas transferidas y personas que cobraron.
- Vista original y vista ajustada cuando existan correcciones.
- Acción para registrar una corrección documentada.
- Previsualización imprimible.

El mesero accede al turno abierto desde el encabezado, no al historial administrativo completo. Esto evita saturar la navegación móvil.

## Lenguaje neutral de dispositivo

Se reemplazarán textos de interfaz que mencionen marcas o modelos. Ejemplos aprobados:

- `Este dispositivo no admite avisos Push`.
- `Agrega Mideli a la pantalla de inicio desde las opciones del navegador`.
- `Revisa que el dispositivo tenga volumen y permisos de notificación`.

La detección técnica por plataforma puede permanecer internamente cuando sea necesaria, pero nunca se muestra como marca al usuario.

## Estados y errores

- Turno ya abierto: se carga el existente en vez de crear otro.
- Turno cerrado por otro dispositivo: se detiene la operación y se actualiza la pantalla.
- Pago simultáneo al cierre: la segunda operación revalida y muestra el resultado real.
- Sin conexión: apertura, movimientos, pagos y cierre no se simulan localmente. Los formularios conservan los datos y ofrecen reintentar.
- PIN inválido o bloqueado: mantiene importe, motivo y conteo.
- Diferencia mayor a $20: no permite cerrar sin autorización válida.
- Conteo por denominaciones inconsistente: recalcula desde cantidades y no acepta subtotales enviados por el cliente.
- Cuenta pendiente eliminada después del cierre: la fotografía transferida conserva la auditoría.
- Impresión fallida: el turno sigue cerrado y el corte puede reimprimirse desde Historial.

## Rendimiento

- El estado del turno abierto se obtiene en paralelo con los datos del POS.
- La pantalla no consulta el historial completo para determinar si existe caja abierta.
- Los totales se calculan al preparar o confirmar cierre, no en cada render.
- Índices parciales cubren turno abierto, fecha de cierre, responsable, movimientos por turno y transacciones por turno.
- El indicador del encabezado se actualiza por Realtime y con una comprobación ligera al recuperar visibilidad.
- Componentes pesados de cierre e historial se cargan solo al abrir Caja.

## Validación

### Base de datos

- Apertura correcta y rechazo de dos turnos simultáneos.
- Rechazo de pedidos y pagos sin turno abierto.
- Asignación automática de turno y zona.
- Pago efectivo, tarjeta, transferencia y combinado.
- Pago de una cuenta proveniente de un turno anterior.
- Fondo adicional, retiro, gasto y corrección con autorización válida e inválida.
- Conteo ciego sin fuga del efectivo esperado.
- Cierre cuadrado, diferencia menor y diferencia mayor a $20.
- Cierre con cuentas pendientes y transferencia al siguiente turno.
- Turno que cruza medianoche.
- Pago y cierre simultáneos.
- Anulación de pago reflejada en totales.
- Corrección posterior sin modificar el corte original.
- Permisos de dueño, administrador, supervisor, mesero y cocina.

### Interfaz

- Apertura desde celular, tableta y escritorio.
- Indicador compacto sin reducir el espacio del POS.
- Movimiento con conservación de datos tras error de PIN.
- Conteo por denominaciones y total rápido.
- Recorrido de cierre completo con teclado y tacto.
- Historial y detalle administrativo.
- Vista imprimible sin PDF.
- Estado e Historial muestran `Zona · Mesa`.
- Copia visible sin nombres de marcas de dispositivos.
- Estados vacíos, carga, desconexión y concurrencia.

### Verificación del proyecto

- Consultas reales de las funciones con perfiles de prueba y limpieza posterior.
- Revisión de RLS, privilegios y asesores de Supabase.
- `npm run lint`.
- `npm run build`.
- Inspección visual acotada en resoluciones móvil, tableta y escritorio.

## Migración y compatibilidad

- Los pedidos y pagos existentes permanecen válidos con `cash_shift_id` nulo.
- La migración intenta completar la zona de pedidos históricos desde la mesa actual.
- No se inventan turnos históricos a partir de días calendario.
- Después del despliegue, el primer pedido nuevo exige abrir caja.
- Las cuentas pendientes existentes se pueden cobrar en el primer turno real.
- No se cierra automáticamente un turno por hora ni al cerrar sesión.

## Fuera de alcance

- Varias cajas físicas o sucursales.
- Integración directa con terminal bancaria.
- Depósitos bancarios automáticos.
- Contabilidad fiscal o CFDI.
- Cálculo de nómina o asistencia laboral.
- Eliminación o edición de cortes cerrados.
- Descarga o almacenamiento de PDF.
- Hardware de impresora específico.
