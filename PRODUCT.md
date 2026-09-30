# Product

## Plataforma

Aplicación web instalable como PWA para la operación interna de los negocios de
Rincón 404 Food Park.

## Usuarios

**Principales:** meseros en servicio real, personal de caja y cocina. Usan Mideli bajo presión de turno para tomar pedidos, modificarlos, enviarlos a cocina, seguir estados y cobrar.

**Administrativos:** owner y admin. Gestionan menú, categorías, imágenes, mesas, usuarios, caja, inventario, impresión, WhatsApp y analíticas.

**Supervisor:** puede operar POS y KDS, pero no administrar configuración.

No existe usuario comensal dentro de la aplicación. WhatsApp sí es un canal externo para que el cliente converse con el bot o sea atendido por el equipo.

## Propósito

La aplicación coordina los turnos de negocios independientes en Ciudad
Obregón, Sonora: capturar pedidos correctamente, prepararlos, entregarlos y
cobrarlos en el negocio correspondiente. Mideli conserva Cocina y WhatsApp;
Just Dipping opera con su propio catálogo y estados.

**Éxito:** pedidos correctos y rápidos, estados visibles, cobros auditables y suficiente contexto para resolver excepciones durante el turno.

## Alcance funcional actual

- POS para comedor, domicilio y para llevar.
- Selección visual de zona y mesa en el plano global.
- Catálogo agrupado por categorías, modificadores, cantidades y notas.
- KDS con estados, tiempos, prioridad, sonido y avisos.
- Cobro completo, parcial, combinado y dividido, con propina, descuentos autorizados y cuentas pendientes.
- Historial de ventas con dirección, ubicación, tipo de servicio, cobro y seguimiento del pedido.
- Turnos de caja, movimientos, conteo ciego, cortes, correcciones y auditoría.
- Menú editable con categorías ordenables, productos, precios, estado, variaciones e imágenes.
- Inventario por insumos, recetas, compras, lotes, conteos y mermas.
- Estación de impresión automática para tickets de cocina de 48 mm.
- PWA con notificaciones por dispositivo para pedidos nuevos y pedidos listos.
- Licencias manuales independientes por negocio; la cuenta Rincón 404 gestiona vigencias y el control técnico global queda separado.
- Analíticas, control diario y rentabilidad estimada por receta.
- WhatsApp con bot, catálogo, carrito, variaciones, domicilio, cliente por teléfono, direcciones guardadas, notas, confirmación, relevo humano, clientes, limpieza conversacional y avisos de estado.

## Flujos críticos

### Licencias por negocio

La vigencia se conserva de forma independiente para cada negocio y se administra
desde `/settings/licencias` por la cuenta de plataforma Rincón 404. Los dueños y
empleados pueden iniciar sesión, pero un negocio vencido queda en modo bloqueado
sin mostrar saldos ni montos. Las meseras globales conservan los demás negocios
y sólo ven una opción neutral deshabilitada para el que no esté disponible.
WhatsApp continúa ligado exclusivamente a Mideli y no procesa mensajes ni tareas
salientes mientras Mideli no tenga acceso operativo.

### Pedido interno

1. Mesero crea pedido nuevo.
2. Agrega productos y modificadores.
3. Elige comedor, domicilio o para llevar.
4. Selecciona mesa si es comedor o confirma domicilio si es entrega.
5. Envía a cocina.
6. Cocina prepara y marca listo.
7. El personal entrega o sirve.
8. Se registra el cobro y queda en historial.

### Pedido de WhatsApp

1. Meta entrega el mensaje al webhook.
2. El motor serializa el procesamiento por conversación.
3. El bot muestra opciones y catálogo con precios claros.
4. El cliente arma y confirma su pedido.
5. El pedido se crea con canal WhatsApp e idempotencia.
6. Si el bot no puede continuar, la conversación pasa a atención humana con su contexto.
7. El equipo puede cargar el pedido en Mesero, editarlo y enviarlo a cocina.

### Domicilio

El cliente conoce el costo estimado de envío, pero el total operativo de Mideli para un repartidor externo corresponde solo al subtotal de productos. El envío se conserva como dato informativo y lo cobra el repartidor aparte.

## Roles y permisos

El acceso efectivo depende de la membresía y las capacidades asignadas a cada
negocio; el nombre de un rol legado no concede acceso a otros locales.

| Acceso | Alcance |
|---|---|
| Plataforma Rincón 404 | Negocios, coordinación global y licencias; cuenta distinta de los dueños |
| Dueño local | Administración y operación autorizadas de su negocio |
| Mesera global | Menús y acciones autorizadas por negocio; puede tener además un rango local |
| Personal local | Rangos configurables de pedidos, cobros, cocina o caja dentro de su negocio |

Los permisos exactos se verifican en el contexto del usuario, las acciones del
servidor y RLS, no solamente en la navegación.

## Restricciones

- Una organización con negocios independientes; no incluye multisucursal ni
  un marketplace público.
- Sin pedidos web directos para el comensal.
- Las operaciones financieras requieren validación del servidor.
- No se confirma un cobro, corrección o cierre de caja sin conexión con el servidor.
- La contingencia completa sin internet todavía está pendiente.
- PWA, impresora, push, WhatsApp real y flujos financieros requieren validación en hardware y cuentas reales.

## Estado multinegocio y límites

La estructura multinegocio ya está aplicada. Mideli y Just Dipping figuraban
activos en la última verificación documentada; comprobar de nuevo el estado
remoto antes de depender de él. Cada negocio conserva su catálogo, inventario,
pedidos, caja, pagos, historial, personal, permisos y licencia.

El POS permite una comanda mixta de comedor: la mesera cambia de menú, el
carrito identifica el negocio de cada línea y el servidor crea órdenes y
cuentas separadas de forma atómica. El cobro consulta la caja del negocio
correcto. Las comandas mixtas de domicilio y para llevar siguen bloqueadas.
El catálogo y combos de Just Dipping están importados; sus tickets históricos
de Firebase siguen pendientes de importación al archivo, según la última
verificación documentada.

## Superficies de producto

- `/login`: acceso del personal.
- `/dashboard/mesero`: POS.
- `/dashboard/cocina`: KDS.
- `/dashboard/whatsapp`: central de servicio.
- `/dashboard/analiticas`: control y métricas.
- `/menu`: menú y categorías.
- `/settings/mesas`: plano.
- `/settings/inventario`: inventario.
- `/settings/caja`: caja.
- `/settings/impresion`: impresión.
- `/settings/diagnostico`: diagnósticos.
- `/settings/negocios`: administración de negocios y personal global.
- `/settings/licencias`: control de vigencias por negocio, exclusivo de la cuenta Rincón 404.

## Principios de producto

1. El mesero primero: el camino feliz debe ser rápido y claro bajo presión.
2. Cocina sin fricción: la comanda debe llegar completa y ser fácil de avanzar.
3. Una verdad operativa: pedido, cobro, ubicación y cliente deben conservar el mismo contexto.
4. La excepción es visible: pendientes, errores, atención humana y pagos incompletos no se esconden.
5. La marca acompaña la operación: Mideli tiene personalidad, pero la velocidad del turno gana.
