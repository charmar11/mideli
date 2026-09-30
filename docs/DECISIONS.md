# Decisiones de producto y arquitectura

Este archivo resume decisiones que no deben revertirse por accidente al modificar una interfaz o un flujo.

## Alcance

La lectura remota del 2026-09-27 confirmó Mideli y Just Dipping registrados
como negocios activos en Rincón 404 Food Park. El catálogo de Just Dipping y
la estructura de su archivo histórico son independientes de Mideli; la carga
de tickets anteriores sigue pendiente según la última revisión documentada.
Esos tickets no se convertirán en órdenes, pagos ni caja activa. El estado
`active` del negocio no sustituye la verificación operativa de su menú,
inventario, permisos y flujo de cobro antes del piloto.

No se agregarán abstracciones de marketplace o multisucursal distintas del
alcance aprobado.

La migración prevista desde el Firebase histórico de Just Dipping se acotó a
catálogo y tickets. El catálogo ya se importó; los tickets todavía no figuran
importados en la última verificación documentada. No incluye `web_orders`,
cajas, inventario ni datos personales de clientes. Cuando se importen, los
tickets vivirán en un archivo de consulta separado, nunca en ventas, caja o
analíticas operativas.

## Multinegocio en transición

- Cada negocio tendrá su propio catálogo, inventario, pedidos, caja, pagos,
  gastos, historial, personal y permisos.
- Rincón 404 tendrá una cuenta de plataforma separada de los dueños.
- El dueño administra su propio personal; el Coordinador administra meseras
  globales y recursos compartidos, no las finanzas o personal interno de cada
  negocio.
- El Coordinador puede asignar a una mesera global permisos independientes de
  apertura y cierre de caja para cada negocio. Esto no concede `business.manage_cash`:
  movimientos, ajustes, historial completo y administración de cortes siguen
  reservados al personal administrador de ese negocio. El permiso de cierre
  solo permite consultar el corte que esa persona acaba de cerrar.
- Quien solo opera pedidos o abre caja recibe el estado de la caja, no cifras
  financieras ni datos del personal del turno.
- Una mesera global puede capturar, entregar y cobrar pedidos de negocios
  habilitados, pero no marca `Listo` de otro negocio por defecto.
- Las comandas mixtas de varios negocios se crean como pedidos y cuentas
  independientes por negocio cuando son de comedor. Domicilio y para llevar
  mixtos permanecen bloqueados hasta tener una operación atómica y reglas
  claras para la tarifa externa de reparto.
- Los negocios sin pantalla de Cocina pueden avanzar `Pendiente → Preparando →
  Listo` desde Estado con el permiso explícito de preparación del negocio;
  operar pedidos no concede ese permiso.
- Las credenciales actuales de Mideli se conservan.
- WhatsApp permanece exclusivo de Mideli durante la primera etapa.
- Just Dipping conserva catálogo, inventario, pedidos, caja y permisos
  separados de Mideli. La estructura del archivo histórico ya existe; la
  importación de tickets anteriores sigue pendiente según la última revisión.
- Los combos básicos son un producto vendible con precio de paquete,
  componentes fijos y grupos de opciones. El servidor valida la selección
  contra el menú del mismo negocio y guarda snapshots para cocina e inventario.
  No se permiten combos anidados.
- Los folios de pedidos, aperturas de caja y pagos se cuentan por negocio; los
  documentos existentes conservan su número y cada contador inicia desde el
  máximo ya emitido en su negocio.
- Las migraciones de combos, folios, identidad, catálogo y estructura del
  archivo histórico constan aplicadas al corte verificado del 2026-09-27.
  No renumerar pedidos ni duplicar el catálogo. La carga de tickets anteriores
  es una tarea separada que requiere conciliación antes de declararse hecha.

## Orden de servicio

El pedido se arma primero y después se elige el contexto de servicio. Para comedor se selecciona mesa en el plano; para domicilio se confirma el punto; para llevar no se pide información innecesaria.

## WhatsApp

- El bot debe saludar con personalidad, emojis y categorías legibles, pero las opciones interactivas deben coincidir exactamente con el texto mostrado.
- `Hablar con alguien` no aparece al inicio. Se ofrece cuando el cliente lo solicita o cuando el bot ya no puede resolver la indicación.
- Las variaciones y extras deben mostrar claramente qué opción incrementa el precio y cuánto incrementa.
- El teléfono identifica principalmente al cliente; el nombre es opcional.
- Un relevo humano conserva carrito, datos del cliente, dirección, notas y método de pago.
- La creación automática queda controlada por una bandera técnica y una configuración visible en WhatsApp.

## Domicilios

- Se prefiere capturar calle, número y colonia para geocodificar, con corrección mediante mapa.
- Las direcciones repetidas del mismo cliente se unifican usando el resultado canónico de Maps.
- El usuario puede editar o eliminar domicilios desde el directorio autorizado.
- El envío se calcula y se muestra al cliente, pero un repartidor externo cobra la tarifa por separado. El cobro operativo de Mideli es el subtotal de productos.
- Las coordenadas, distancia y dirección de la orden se guardan como snapshot para historial y seguimiento.

## Pagos y caja

El pago no reemplaza el estado de preparación. Una orden puede estar en cocina aunque todavía no esté pagada. Las correcciones, divisiones, descuentos y cierres deben quedar auditados en el libro mayor y no resolverse con escrituras legacy.

## Interfaz móvil

- Las acciones de enviar, cobrar, confirmar y entregar deben ser grandes, accesibles y visibles.
- Cada vista debe tener un scroll principal claro. Los paneles que sí necesitan desplazamiento propio deben capturar el gesto vertical sin desplazar la pantalla completa.
- El color comunica estado además del texto: rosa para selección/acción de marca, verde para completar, ámbar para atención, rojo para acciones irreversibles y dorado para valor.
- No ocultar nombres de categorías en escritorio si eso dificulta reconocer el menú.

## Notificaciones

Las notificaciones Push se configuran por dispositivo y por tema. El aviso debe
ser idempotente y respetar el negocio y permiso del destinatario. El service
worker puede mostrar Push aunque Cocina o Mesero estén visibles; sonido y
señales locales son complementarios.

Los avisos de WhatsApp al cliente se mantienen desactivados por defecto en pedidos manuales y solo se envían con consentimiento aplicable.

## Datos y seguridad

- El service role de Supabase, claves de Meta, Gemini, Maps, licencia y Sentry nunca llegan a Client Components.
- Las migraciones son la única vía para cambios de esquema.
- Las licencias comerciales se controlan por negocio desde `/settings/licencias`, exclusivamente con la capacidad de plataforma `platform.manage_business_licenses` asignada a la cuenta Rincón 404. La vigencia antigua sólo se usa para migrar la fecha inicial; `app_license.status` queda como suspensión técnica global, sin fecha comercial.
- El bloqueo de un negocio no revela deuda calculada ni afecta a los demás. Las meseras globales conservan los menús autorizados de negocios vigentes; un local no disponible aparece deshabilitado y sin detalles de licencia. Errores de verificación se muestran como problemas técnicos, no como falta de pago.
- Al vencer Mideli, WhatsApp no responde ni procesa pedidos, relevo humano o tareas programadas. Los pedidos programados que queden atrasados al reactivar requieren revisión humana, nunca envío retroactivo automático.
- Los datos conversacionales pueden limpiarse mediante la operación autorizada sin borrar órdenes, folios ni auditoría.
- El número de teléfono se normaliza internamente para búsquedas y proveedores, pero la interfaz muestra el formato local cómodo cuando es posible.

## Rendimiento y tolerancia a fallos

- Las alertas Push son secundarias: guardar un pedido y cambiar su estado no esperan la respuesta del proveedor. La operación confirmada usa la persistencia y Realtime; Push se solicita en segundo plano y sus fallos quedan registrados para diagnóstico.
- El POS conserva el último catálogo válido si una consulta temporal falla y muestra una acción de reintento. Los cambios de productos y categorías invalidan el caché y actualizan las vistas abiertas.
- La gráfica pesada de analíticas se carga bajo demanda para que el cambio entre vistas operativas no arrastre su dependencia al primer render.
- Los pedidos programados dependen de un cron de producción por minuto en Supabase, no del plan de cron de Vercel. El endpoint usa un secreto dedicado almacenado en Vault y reclama cada orden con una actualización condicional para que ejecuciones simultáneas sean seguras.
