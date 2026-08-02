# Mideli: reforma operativa de inventario, folios y tutoriales

Fecha: 2026-07-31  
Estado: diseño aprobado por el usuario  
Entorno de entrega: localhost, sin despliegue a Vercel

## 1. Propósito

Reorganizar el inventario de Mideli para que una persona sin experiencia técnica pueda crear insumos, registrar compras, controlar existencias y entender las tareas pendientes desde teléfono, tableta o computadora.

El trabajo también corrige el inicio de los folios de pedidos y agrega una guía inicial por usuario y rol.

Esta especificación amplía y reemplaza las decisiones de interfaz y modelo de compra de inventario descritas en:

- `2026-07-30-mesas-inventario-design.md`
- `2026-07-31-mobile-push-inventory-design.md`

Se conservan de esos documentos el consumo mediante recetas, la trazabilidad, los conteos, las mermas, las compras y las operaciones transaccionales.

## 2. Hallazgos actuales

- Supabase contiene un único pedido de prueba con folio `101` y un artículo relacionado.
- No existen insumos, movimientos, órdenes de compra ni recepciones de inventario.
- El primer folio se calcula actualmente con una base manual de `100`, lo que además puede producir conflictos si dos dispositivos crean pedidos al mismo tiempo.
- La creación de insumos está escondida en la sección `Más`.
- El formulario actual no distingue entre unidad de consumo y presentación de compra.
- El buscador de insumos tiene un conflicto visual: el icono invade el texto del campo.
- No existe un tutorial inicial por usuario.

## 3. Decisiones confirmadas

- El pedido de prueba se eliminará y el siguiente pedido será el número `1`.
- Los folios continuarán de forma permanente: `1`, `2`, `3` y así sucesivamente.
- La presentación comprada se convertirá automáticamente a la unidad de uso.
- Mideli calculará el costo unitario y el costo promedio ponderado.
- Cada insumo comenzará con un proveedor principal, con nombre y teléfono.
- Las recetas descontarán inventario al enviar el pedido a cocina.
- Editar, cancelar o eliminar un pedido corregirá el inventario de forma idempotente.
- El tutorial se mostrará una vez por usuario, se adaptará al rol y podrá repetirse desde Ayuda.
- El diseño conservará el tema oscuro y la identidad visual de Mideli.
- No se realizará despliegue público durante esta entrega.

## 4. Alcance

### Incluido

- Reinicio seguro del folio de pedidos.
- Asignación atómica de folios.
- Nueva arquitectura de navegación del inventario.
- Alta y edición guiada de insumos.
- Unidades de uso y de compra.
- Conversión de presentaciones a existencias base.
- Costos por presentación, costo unitario y costo promedio ponderado.
- Proveedor principal y teléfono.
- Alertas y sugerencias de compra.
- Registro de compras y recepción.
- Conteos físicos, ajustes, mermas y movimientos.
- Configuración de recetas.
- Consumo y restitución de inventario por pedidos.
- Tutorial por rol y ayudas contextuales.
- Corrección del buscador de insumos.
- Diseño adaptable para móvil, tableta y escritorio.

### Fuera de alcance

- Múltiples sucursales.
- Varios proveedores por insumo.
- Integración contable o facturación de proveedores.
- Código de barras.
- Pronóstico avanzado con inteligencia artificial.
- Despliegue a producción.

## 5. Arquitectura de información

El inventario tendrá cinco destinos principales:

1. `Resumen`: tareas urgentes, valor del inventario, críticos, caducidades, conteos y compras pendientes.
2. `Insumos`: catálogo, buscador, filtros y alta de insumos.
3. `Comprar`: sugerencias, órdenes y recepción de mercancía.
4. `Contar`: conteos físicos, borradores y conciliación.
5. `Movimientos`: entradas, ventas, mermas, ajustes y auditoría.

En móvil se utilizará una navegación inferior compacta. En tableta y escritorio se mostrará una navegación horizontal. Las tablas anchas se convertirán en tarjetas en móvil.

El botón `Nuevo insumo` estará visible en Resumen e Insumos. No dependerá de abrir una sección secundaria.

## 6. Estado vacío y primera acción

Cuando no existan insumos, Resumen mostrará una bienvenida operativa con tres acciones:

1. Crear el primer insumo.
2. Configurar una receta.
3. Registrar una compra.

La acción principal será `Crear primer insumo`. Las otras acciones explicarán su dependencia si todavía no se puede avanzar.

No se mostrarán métricas vacías que parezcan errores.

## 7. Alta y edición de insumos

El formulario será un panel central con tres pasos y resumen final.

### Paso 1: datos básicos

- Nombre.
- Unidad de uso.
- Existencia inicial.
- Nivel mínimo.
- Existencia ideal.

Unidades predefinidas:

- pieza
- gramo
- kilogramo
- mililitro
- litro
- porción
- unidad personalizada

### Paso 2: forma de compra

- Unidad de compra.
- Cantidad de unidades de uso contenidas en una presentación.
- Precio habitual de la presentación.
- Cantidad mínima de presentaciones que se pueden pedir.
- Vista previa del costo por unidad de uso.

Ejemplo:

- Unidad de uso: pieza.
- Unidad de compra: caja.
- Conversión: 100 piezas por caja.
- Precio de compra: $500 por caja.
- Resultado: $5 por pieza.

Reglas de validación:

- el factor de conversión debe ser mayor que cero;
- la existencia inicial, el mínimo, el ideal y el precio habitual pueden ser cero, pero no negativos;
- la existencia ideal debe ser mayor o igual que el nivel mínimo;
- el pedido mínimo debe ser al menos una presentación;
- una recepción confirmada debe contener una cantidad mayor que cero;
- cantidades y conversiones se almacenarán con cuatro decimales;
- totales monetarios se almacenarán con dos decimales;
- costos unitarios internos se almacenarán con seis decimales para admitir costos por gramo o mililitro menores a un centavo;
- el redondeo a dos decimales será visual y no reducirá la precisión de los cálculos.

### Paso 3: proveedor y control

- Nombre del proveedor principal.
- Teléfono.
- Ubicación de almacenamiento.
- Frecuencia de conteo.
- Seguimiento de caducidad opcional.

### Edición

Editar un insumo modificará su configuración futura, pero nunca reescribirá movimientos, recepciones o costos históricos. Los registros operativos conservarán una copia de la conversión y del precio usados al momento de la operación.

La unidad de uso quedará bloqueada después del primer movimiento o de vincular el insumo a una receta. Para corregirla será necesario crear otro insumo o ejecutar una conversión administrativa específica que ajuste existencias y recetas con auditoría completa.

Si el insumo se crea con existencia inicial mayor que cero, Mideli generará un movimiento de apertura con usuario, fecha, cantidad y costo. El costo inicial se derivará del precio habitual y del factor de conversión. Si todavía no se conoce el precio, se permitirá costo cero con una advertencia visible.

## 8. Modelo de costos y compras

### Principio

El stock siempre se almacenará en la unidad de uso. Las compras se capturarán en presentaciones.

### Fórmulas

```text
unidades_recibidas = presentaciones_recibidas * factor_conversion
costo_unitario_compra = costo_total_compra / unidades_recibidas
nuevo_costo_promedio =
  ((stock_anterior * costo_promedio_anterior) + costo_total_compra)
  / (stock_anterior + unidades_recibidas)
```

Si el stock anterior es cero o negativo, el nuevo costo promedio será el costo unitario de la compra recibida. Esta regla evita asignar valor monetario ficticio a existencias negativas y elimina divisiones inválidas. La recepción deberá guardar el costo total, la cantidad de presentaciones, las unidades base resultantes, el factor aplicado y el costo unitario resultante.

### Sugerencias de compra

La necesidad base será:

```text
necesidad = max(existencia_ideal - existencia_actual, 0)
```

Cuando la necesidad sea mayor que cero, las presentaciones sugeridas se redondearán hacia arriba y respetarán el pedido mínimo:

```text
si necesidad = 0:
  presentaciones = 0
si necesidad > 0:
  presentaciones = max(
    ceil(necesidad / factor_conversion),
    pedido_minimo_presentaciones
  )
```

El costo estimado utilizará el último precio conocido de la presentación. Si no existe, utilizará el costo unitario promedio multiplicado por la conversión y marcará la cifra como estimada.

### Modelo de datos propuesto

Los nombres finales se ajustarán a las tablas existentes, pero el modelo deberá conservar estas responsabilidades:

- `inventory_items`: unidad de uso, unidad de compra, factor de conversión, pedido mínimo, costo unitario con seis decimales, último precio por presentación, proveedor, teléfono y versión de stock.
- `inventory_purchase_order_lines`: cantidad base actual para compatibilidad y nuevos campos de presentaciones pedidas, unidad de compra, conversión y costo esperado por presentación.
- `inventory_receipt_lines`: presentaciones recibidas, costo total, unidades base resultantes, conversión aplicada, costo unitario y lote.
- `inventory_movements`: stock anterior, variación, stock nuevo, costo, tipo, motivo, actor y referencias.
- `inventory_recipe_components`: relación de un insumo con un producto base o con una opción modificadora estable.
- `user_onboarding_progress`: usuario, rol, versión, estado, paso actual y fechas.
- `order_folio_counter`: siguiente folio y bloqueo transaccional.
- `orders`: clave idempotente única para la creación y folio asignado por servidor.

Los grupos y opciones modificadoras actuales recibirán identificadores persistentes dentro de su configuración. Los clientes anteriores podrán ignorar esos identificadores. Durante la transición, los pedidos antiguos conservarán sus nombres y los pedidos nuevos guardarán también el identificador estable para que cambiar el texto de una salsa o topping no rompa su receta.

## 9. Operaciones de inventario

### Registrar compra y recepción

Una orden de compra será opcional. Para una operación rápida se podrá registrar una recepción directa. Las órdenes usarán estos estados:

- borrador;
- pedida;
- recibida parcialmente;
- recibida;
- cancelada.

Se permitirán entregas parciales y varias recepciones para una misma orden. Recibir de más requerirá confirmación. El usuario podrá cancelar únicamente el remanente pendiente sin alterar lo ya recibido.

El usuario capturará:

- presentaciones recibidas;
- costo total;
- fecha de recepción;
- caducidad opcional;
- diferencia contra lo pedido;
- observación opcional.

La interfaz mostrará antes de confirmar:

- unidades que se agregarán;
- costo por unidad de esta compra;
- costo promedio actual;
- nuevo costo promedio calculado.

La opción `Actualizar precio habitual` estará activada de forma predeterminada. Al confirmar guardará el precio de la presentación, la fecha y el proveedor utilizado. El usuario podrá desactivarla si la compra fue excepcional.

Cuando un insumo controle caducidad, cada lote recibido requerirá fecha de caducidad. Una entrega con fechas distintas se capturará en líneas o lotes separados. El consumo operativo sugerirá primero el lote con vencimiento más próximo, siguiendo FEFO, sin impedir una corrección manual autorizada.

### Merma o salida

Se capturará cantidad en unidad de uso y un motivo obligatorio. Motivos sugeridos:

- caducidad;
- preparación;
- producto dañado;
- consumo interno;
- devolución;
- pérdida no explicada;
- otro.

### Conteo físico

El usuario escribirá la cantidad encontrada. Mideli mostrará existencia esperada, diferencia y resultado antes de guardar. Toda diferencia requerirá un motivo.

### Movimientos

Cada movimiento conservará:

- usuario responsable;
- fecha y hora;
- insumo;
- tipo;
- cantidad anterior;
- variación;
- cantidad nueva;
- costo aplicable;
- referencia de pedido, compra, recepción o conteo;
- motivo.

## 10. Recetas y pedidos

Cada producto del menú podrá tener una receta con uno o más insumos y una cantidad de consumo por unidad vendida.

Al enviar un pedido a cocina:

- se calcula el consumo por artículo y cantidad;
- se registra el movimiento de consumo;
- se evita aplicar dos veces el mismo consumo en reintentos;
- no se bloquea el pedido si el inventario queda negativo;
- se genera una alerta crítica para administración.

Las recetas podrán pertenecer al producto base o a una opción seleccionable, como variación, extra, topping de sushi o salsa. El consumo final será la suma de la receta base y las recetas de todas las opciones elegidas. La aplicación conservará una copia de esas selecciones con el pedido.

Vender un producto u opción sin receta configurada no bloqueará el servicio. Mideli mostrará una alerta administrativa y lo incluirá en una lista de productos sin receta, pero no inventará consumos.

Al editar un pedido:

- se calcula la diferencia entre la versión anterior y la nueva;
- solo se consume o restituye la diferencia;
- cada cambio queda vinculado al pedido.

Al cancelar o eliminar un pedido activo en estado pendiente, en cocina, listo o servido sin pago:

- se restituye exactamente el consumo aplicado;
- la restitución es idempotente;
- el historial conserva la razón de la reversión.

Eliminar de la vista histórica un pedido pagado borrará sus registros comerciales visibles sin reponer inventario, porque los ingredientes ya fueron consumidos. Los movimientos de inventario conservarán una copia del folio, productos y cantidades, aunque su referencia directa al pedido quede vacía. Una anulación administrativa de una venta pagada será una operación separada, con motivo obligatorio y sin corrección automática de existencias.

## 11. Folios de pedidos

### Reinicio

La operación de reinicio tendrá una guarda de seguridad:

- verificar que existe únicamente el pedido de prueba `101`;
- identificar y contar previamente artículos, pagos, estados, eventos, notificaciones y referencias de inventario relacionados;
- ejecutar el borrado completo en una sola transacción;
- abortar si aparece una dependencia o cantidad distinta a la inspeccionada;
- no tocar menú, usuarios, mesas ni inventario;
- inicializar el siguiente folio en `1`.

Si los datos dejan de coincidir con esta condición antes de ejecutar la migración, el reinicio se detendrá en lugar de borrar información inesperada.

### Asignación futura

El folio se asignará en PostgreSQL mediante un contador transaccional bloqueado por fila y una función de creación idempotente. Se eliminará el cálculo cliente basado en `max(number) + 1`. La base ignorará el número propuesto por clientes anteriores para que la versión pública siga siendo compatible mientras el frontend local cambia.

Requisitos:

- folios únicos;
- orden continuo sin reinicios diarios;
- seguridad ante pedidos simultáneos;
- ningún reinicio diario;
- reintentos sin crear dos pedidos ni dos folios visibles;
- clave idempotente única por intento de creación.

El contador se actualizará dentro de la misma transacción que crea el pedido. Si la transacción se revierte antes de crear el pedido, también se revierte el incremento. Un pedido que sí fue creado conserva su folio aunque después sea cancelado o eliminado, por lo que esos números no se reutilizan.

## 12. Tutorial inicial

El tutorial se guardará por usuario, rol y versión con uno de estos estados:

- no iniciado;
- en progreso;
- omitido;
- completado.

Un tutorial omitido no reaparecerá automáticamente en esa versión, pero seguirá disponible desde Ayuda. Un cambio de rol iniciará la guía del nuevo rol. Una versión nueva podrá mostrar solamente los pasos añadidos. Si un control no está disponible por permisos o tamaño de pantalla, el paso se omitirá sin bloquear el resto.

### Administrador

- personal;
- menú;
- mesas;
- inventario;
- compras;
- recetas;
- analíticas.

### Mesero

- crear pedido;
- elegir mesa;
- enviar a cocina;
- revisar cuentas pendientes;
- cobrar;
- consultar historial.

### Cocina

- aceptar pedidos;
- iniciar preparación;
- reconocer urgentes;
- marcar como listo.

### Supervisor, rol combinado

- flujo de mesero;
- flujo de cocina;
- sin opciones administrativas.

La guía podrá omitirse, reanudarse y repetirse desde `Ayuda y tutoriales`. Los pasos resaltarán controles reales y no bloquearán permanentemente el uso de la aplicación.

Las ayudas de estado vacío complementarán el tutorial, pero no dependerán de él.

## 13. Permisos

- Dueño y administrador: configuración completa, costos, compras, ajustes, recetas y auditoría.
- Mesero: operación del POS y consulta limitada de disponibilidad si la vista lo requiere.
- Cocina: operación del KDS sin acceso a costos, compras o ajustes administrativos.
- Supervisor, rol combinado: POS y KDS sin configuración administrativa de costos o existencias.

Las políticas RLS y las funciones con privilegios elevados deberán validar el rol en servidor. Ocultar un botón no sustituirá el control de permisos.

Las pruebas de permisos se realizarán contra la API y las funciones RPC, no solo mediante la interfaz. Un mesero podrá provocar el consumo autorizado únicamente al enviar su pedido mediante la operación de pedidos; no podrá invocar directamente una recepción, merma, conteo o ajuste administrativo.

## 14. Interfaz visual

- Tema oscuro de Mideli.
- Rosa para acciones principales.
- Amarillo para atención.
- Rojo para estados críticos.
- Crema para texto principal y superficies de contraste.
- Paneles centrales para alta, compra, merma y conteo.
- Una columna en móvil y hasta dos columnas en pantallas amplias.
- Áreas táctiles de al menos 44 px.
- Números y costos con tipografía monoespaciada o tabular.
- Estados de carga que preserven el tamaño de los componentes.
- Mensajes de error junto al campo correspondiente.
- Confirmaciones para operaciones destructivas o que cambien stock.
- Corrección explícita del padding del buscador de insumos.
- Movimiento reducido cuando el sistema operativo lo solicite.
- Sin animaciones decorativas pesadas.

## 15. Estados de error y recuperación

- Sin conexión: conservar borradores locales, pero no confirmar cambios de stock sin respuesta del servidor.
- Conflicto: recargar la existencia actual y volver a mostrar el resultado antes de reintentar.
- Conversión inválida: bloquear guardado y explicar el ejemplo correcto.
- Costo inválido: bloquear cantidades negativas o divisiones por cero.
- Permiso insuficiente: explicar que la acción requiere administración.
- Falla parcial: las operaciones transaccionales revierten todos sus cambios.
- Reintento: usar claves idempotentes para no duplicar compras, recepciones ni consumo por pedido.
- Operaciones simultáneas: bloquear la fila del insumo durante el cálculo y actualización de stock y costo. Un conteo iniciado sobre una versión antigua deberá recargar la existencia y solicitar confirmación.

## 16. Estrategia de migración

1. Obtener y revisar el changelog actual de Supabase antes de escribir cambios.
2. Crear una migración imperativa nueva, sin modificar migraciones ya aplicadas.
3. Agregar campos y restricciones para compra, conversión y proveedor.
4. Agregar el modelo de progreso del tutorial con RLS.
5. Crear o adaptar funciones transaccionales de recepción, ajuste y consumo.
6. Crear asignación atómica de folios.
7. Ejecutar el reinicio protegido del único pedido de prueba.
8. Regenerar o actualizar tipos de TypeScript.
9. Probar cada función SQL con una consulta real y verificar el resultado.
10. Ejecutar `supabase db push --linked --dry-run` antes de aplicar la migración.
11. Mantener las columnas y firmas RPC actuales durante la transición o proporcionar envoltorios compatibles.
12. Verificar que la versión pública siga abriendo, leyendo menú y mostrando pedidos después de la migración.
13. Mantener el despliegue público sin cambios.

La base de datos Supabase es compartida con el proyecto conectado. Aunque la interfaz se pruebe en localhost, el reinicio autorizado del pedido afectará ese proyecto remoto. La guarda descrita evita borrar datos distintos al pedido de prueba confirmado.

Antes de aplicar cambios se exportarán el pedido de prueba y sus dependencias a un respaldo local temporal. La migración de esquema será aditiva y retrocompatible. Si una función nueva falla, se restaurarán las firmas anteriores y se desactivará el uso local de los campos nuevos; no será necesario revertir columnas para mantener el cliente público operativo.

## 17. Criterios de aceptación

### Folios

- No existe el pedido de prueba `101`.
- El primer pedido nuevo recibe el folio `1`.
- Dos pedidos simultáneos reciben folios diferentes.
- El siguiente pedido conserva la secuencia aunque se cierre el navegador.

### Insumos y compras

- Crear una caja de 100 piezas por $500 muestra $5 por pieza.
- Recibir dos cajas agrega 200 piezas.
- El costo promedio ponderado coincide con la fórmula documentada.
- Un costo por gramo menor a $0.01 conserva seis decimales internamente.
- El pedido mínimo y el redondeo de presentaciones producen una sugerencia válida.
- Si no existe necesidad, la sugerencia es cero.
- Editar la conversión futura no cambia movimientos anteriores.
- Una recepción parcial mantiene la orden abierta y una segunda recepción puede completarla.
- Una recepción y una venta simultáneas no pierden ninguna actualización.
- Dos recepciones simultáneas producen un stock y costo promedio correctos.

### Pedidos y recetas

- Enviar a cocina descuenta una sola vez.
- Reintentar no duplica el descuento.
- Editar consume o repone solo la diferencia.
- Cancelar y eliminar restauran lo aplicado.
- Stock insuficiente alerta sin impedir el servicio.
- Las variaciones, extras, toppings y salsas descuentan su propia receta.
- Un producto sin receta se vende sin descuento inventado y genera una alerta administrativa.
- Eliminar del historial una venta pagada no repone ingredientes.

### Tutorial y permisos

- Un usuario nuevo ve la guía adecuada a su rol.
- La guía no vuelve a aparecer después de completarse.
- Puede repetirse desde Ayuda.
- Mesero, cocina y supervisor no pueden alterar costos ni stock administrativo.

### Interfaz

- `Nuevo insumo` es visible sin abrir `Más`.
- El buscador no solapa icono y texto.
- Los formularios no se cortan a 360 px de ancho.
- A 768 x 1024 y 1024 x 768 no existe desbordamiento horizontal, incluso con el teclado virtual abierto, y la acción principal permanece accesible.
- Los estados vacíos explican el siguiente paso.

### Verificación técnica

- Políticas RLS revisadas.
- Funciones transaccionales probadas contra Supabase.
- `npm run lint` sin errores.
- `npm run build` sin errores.
- Prueba manual en móvil, tableta y escritorio.
- Servidor local operativo en el puerto acordado.
- Ningún despliegue a Vercel.
