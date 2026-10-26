# Rincón 404: contexto acumulado para agentes

Actualizado: 2026-10-10

Este documento resume lo que se ha decidido y construido para Mideli. Sirve como memoria de trabajo para cualquier agente de IA, no solo OpenCode. Antes de modificar algo, confirma los detalles contra el código actual y contra la base de datos cuando el cambio toque Supabase.

Este archivo conserva decisiones en orden cronológico. Algunas fotografías
anteriores, sobre todo de la fase de un solo negocio, han sido superadas por
las secciones posteriores. Empieza por `docs/README.md` para ubicar el tema y
usa `docs/WORKFLOW.md` para ejecutar la tarea. No tomes cifras o fechas de
este historial como estado remoto presente sin verificarlas.

## 0. Fuentes de verdad y mantenimiento

La prioridad cuando exista una contradicción es: código y tipos actuales, estado remoto verificable, `AGENTS.md`, este contexto, y después `PRODUCT.md`, `DESIGN.md` y la documentación técnica en `docs/`.

Este archivo debe actualizarse cuando cambien una decisión de producto, un flujo crítico, una migración, un permiso, una integración o un pendiente operativo. No debe guardar tokens, datos de clientes ni fotografías estáticas que puedan confundirse con el estado actual.

La rama de trabajo puede contener cambios sin commit. Esos cambios pertenecen al trabajo en curso y no deben descartarse. Para que otra IA los reciba desde GitHub, primero hay que consolidarlos en un commit estable.

## 1. Producto

Rincón 404 Food Park usa una aplicación interna para operar negocios separados
en Ciudad Obregón, Sonora. Mideli y Just Dipping figuran activos en la última
verificación documentada. Cada uno conserva sus datos y permisos; el estado
actual de operación y licencias requiere nueva comprobación si afecta una
tarea. El sistema lo usa el equipo durante el turno, no los clientes finales.

Usuarios principales:

- Mesero: arma pedidos en tablet, elige tipo de servicio, selecciona mesa, agrega notas, envía a cocina y cobra.
- Cocina: consulta la cola de pedidos, prepara y cambia estados.
- Dueño o administrador: administra menú, categorías, usuarios, mesas, zonas, inventario y analíticas.

Objetivo del producto: que el equipo pueda pasar de pedido a cocina y de pedido listo a cobro con el menor número de pasos posible, sin depender de papel.

Mideli conserva Cocina y el canal WhatsApp. Just Dipping cuenta con catálogo y
combos propios. Las meseras globales pueden crear pedidos en los negocios
autorizados, con caja y permisos separados. WhatsApp no se ha habilitado fuera
de Mideli. Los tickets históricos de Firebase siguen sin importarse al archivo
de Just Dipping según la última verificación documentada.

## 2. Forma de colaborar con el dueño

El dueño no programa. Explica las necesidades en español natural y espera que el agente tome decisiones profesionales y mantenga el avance.

- Responder y nombrar los elementos de interfaz en español de México.
- Priorizar claridad, velocidad de operación, targets grandes para touch y estados visibles.
- No pedir decisiones técnicas que el código o el contexto permitan resolver de forma segura.
- Si una decisión cambia el flujo de trabajo o puede borrar datos, explicarla y pedir autorización antes de ejecutarla.
- No usar datos inventados como si fueran métricas reales.
- Evitar la raya larga en copy, documentación y nombres visibles.
- Conservar cambios existentes y revisar `git status` antes de editar.

## 3. Identidad y dirección visual

La dirección visual aprobada es Mideli oscuro, profesional y vendible. Debe sentirse como una herramienta POS de alto nivel, cercana a la claridad operativa de Toast, Lightspeed, Square o Mercado Pago Point, sin copiar interfaces.

Paleta principal:

| Token | Valor | Uso |
|---|---|---|
| canvas | `#111014` | Fondo general |
| surface | `#211D24` | Tarjetas y paneles |
| raised | `#2A242E` | Controles secundarios y secciones internas |
| ink | `#0D0B10` | Navegación y pie del carrito |
| brand | `#F5145F` | Acción principal, selección y precios |
| brand-hover | `#FF3B78` | Hover y pressed |
| cream | `#FBF8E7` | Texto principal cálido |
| gold | `#F6DDA4` | Valor, totales y acentos premium |
| muted | `#B9AEB1` | Texto auxiliar |
| success | `#36C275` | Listo, confirmaciones y estados positivos |
| warning | `#F3A34D` | Atención |
| danger | `#FF667A` | Cancelación y errores |
| border | `#3A323D` | Límites y agrupación |

Tipografías:

- Pacifico solo para el wordmark Mideli.
- Sora para títulos, labels y controles de UI.
- Karla para cuerpo, descripciones y formularios.
- JetBrains Mono para precios, números de pedido, tiempos y datos de inventario.

Reglas de diseño:

- Fondo oscuro en capas, no una pantalla completamente plana.
- Rosa reservado para la acción importante, la navegación activa y el dinero.
- Gold comunica valor, no debe convertirse en CTA principal.
- Mantener controles de al menos 44 a 48 px para tablet.
- Evitar motion decorativo que retrase el servicio.
- En tablet, el header ocupa la franja superior; las categorías van arriba del catálogo y el pedido ocupa un panel rectangular amplio a la derecha cuando hay espacio.

## 4. Decisiones funcionales acumuladas

### Menú

El usuario aprobó reemplazar el menú provisional porque el sistema no se había usado en producción y no importaba conservar datos antiguos. La migración `00004_menu_refresh.sql` elimina el catálogo anterior y carga el menú nuevo.

El cambio solicitado para sabores de boneless fue:

- Quitar Mango Habanero.
- Usar Buffalo Ranch, Cajun, Ajo Parmesano y Honey Mustard.
- Conservar las opciones existentes que siguen siendo válidas, como Buffalo y BBQ.

Los toppings no son productos independientes: se agregan como un grupo opcional dentro de cada sushi. Los conteos vigentes del catálogo se documentan en la sección de estado y deben volver a consultarse cuando una tarea dependa de ellos.

Cada opción de variación puede tener información adicional. En los toppings de sushi se muestran sus ingredientes: Dracarys contiene queso, tocino y spicy; Mr. Crab contiene queso, zanahoria, surimi empanizado y spicy; Cordon Blue contiene queso, tocino y serrano; Gratinado contiene queso; Especial contiene Philadelphia y spicy.

La administración del menú debe ser completamente editable: nombre, precio, descripción, imagen, categoría, estado activo y grupos de variaciones. El editor permite crear, renombrar, eliminar y marcar como requeridos los grupos, además de editar sus opciones y precios extra. Cada grupo se configura como selección de una opción o selección múltiple con máximo opcional. Las acciones de edición se mantienen visibles para tablet y los errores de guardado no cierran el formulario.

Desde la migración `20260808160831_payment_correction_auth_and_category_order.sql`, owner y admin pueden ordenar todas las categorías mediante arrastre. El orden completo se guarda en un solo RPC transaccional y se consume igual en Menú y POS. El cliente publica el cambio de forma optimista y restaura el orden anterior si el guardado falla. Las categorías nuevas se agregan al final.

### Mesas y zonas

El sistema debe permitir que el dueño de un local configure su plano sin depender de una distribución fija.

- Todas las zonas activas se ven en un mismo canvas, no como pantallas separadas por zona.
- Cada zona tiene nombre, tamaño, posición y contador de mesas.
- Las zonas se pueden mover en administración.
- Las mesas se pueden mover dentro de su zona, cambiar de nombre, forma y capacidad.
- En tablet, tocar una zona o mesa abre un editor central con controles grandes; arrastrar el cuerpo mueve el elemento y arrastrar la esquina inferior derecha cambia su tamaño.
- Las zonas permiten editar nombre y tamaño del área; las mesas permiten editar nombre, zona, forma, capacidad, tamaño y rotación.
- Las formas soportadas son `round`, `square`, `rectangle` y `bar`.
- El mapa usa posiciones normalizadas de 0 a 1 para adaptarse a distintas pantallas.
- Durante un pedido, el mesero selecciona la mesa directamente en el dibujo.
- La selección se hace después de armar el pedido, no antes.

La migración `00005_global_table_map.sql` agrega geometría a `table_zones` y acomoda las zonas activas existentes en un grid inicial. La base remota tenía 2 zonas y 5 mesas en el corte del 2026-07-30. Esta cifra es histórica y debe volver a consultarse antes de usarla.

### Flujo de pedidos

Flujo aprobado:

1. El mesero pulsa Nuevo pedido.
2. Busca y agrega platillos por categoría.
3. Ajusta cantidades, modificadores y notas.
4. Para comedor, abre el selector de mesa y toca la mesa en el mapa global.
5. Confirma el pedido.
6. Envía a cocina.
7. Cocina prepara y cambia el estado.
8. Mesero sirve y registra el cobro.

En pedidos manuales a domicilio, Google Maps intenta confirmar la dirección, colonia,
coordenadas y tarifa. Si no puede hacerlo, Mesero puede enviar el pedido a cocina tras
confirmar un aviso explícito de que queda sin ubicación validada. El teléfono del cliente
es opcional; si falta o está incompleto, se muestra el mismo aviso antes de enviar y el
pedido se guarda sin teléfono para completarlo después desde Estado.

El campo visible `Referencia` se eliminó porque ocupaba espacio y duplicaba el flujo de selección de mesa. La orden conserva `table_id` y `table_number` para trazabilidad.

El panel del pedido debe ser legible y dominante: nombres de platillos, cantidad, modificadores, notas, total y botón de envío deben tener espacio suficiente. En tablet no debe convertirse en una barra angosta ni quedar cortado.

### Inventario

El inventario se diseñó como una herramienta personalizable, no como un catálogo fijo:

- Insumos con nombre, unidad, existencias actuales, mínimo y costo unitario.
- Recetas que relacionan platillos con insumos y cantidades.
- Movimientos de compra, ajuste, consumo y devolución.
- Alertas de existencias bajas mediante la comparación entre `current_stock` y `minimum_stock`.

La interfaz administrativa vive en `/settings/inventario`. La base ya tiene `inventory_items`, `inventory_recipes` e `inventory_movements`. El descuento automático por receta se ejecuta al vender y permite existencias negativas para que un faltante de captura no bloquee la operación; el valor negativo queda visible para corregir compras, conteos o recetas.

Actualización 2026-08: el inventario se endureció con unidades de compra, recepciones (`inventory_receipts`), órdenes de compra, lotes, conteos físicos (`inventory_counts` con líneas), guías de captura vía RPC, borrado seguro de insumos, reemplazo transaccional de recetas y corrección de inventario al editar pedidos. La interfaz se reorganizó en paneles (`src/components/admin/inventory/`) con biblioteca de recetas y un tutorial de 20 pasos que recorre cada pestaña, explica unidades, compras, recetas, conteos, diferencias, mermas y la rutina recomendada.

Actualización 2026-09-20: las líneas de conteos y órdenes de compra no tienen `business_id` propio por diseño; heredan el negocio de `inventory_counts` o `inventory_purchase_orders`. `src/lib/stores/inventory-store.ts` debe consultar primero esos padres y filtrar las líneas por `count_id` y `purchase_order_id`. No agregar una columna redundante a las tablas hijas.

### Licencia de acceso

Desde 2026-09-27 la vigencia comercial se controla por negocio:

- `public.business_licenses` guarda una fecha local inclusiva por negocio y `public.business_license_events` conserva el historial. La fecha global existente se copia a los negocios operativos sin extenderla; no se calcula ni almacena saldo.
- Sólo la capacidad de plataforma `platform.manage_business_licenses`, asignada a `rincon404`, permite activar, renovar, suspender o cambiar vigencias desde `/settings/licencias`.
- `public.app_license.status` se conserva únicamente como interruptor técnico global. Su `valid_until` ya no bloquea por fecha ni representa una licencia comercial.
- Proxy, heartbeat, contexto de negocios, stores, RLS y triggers del servidor bloquean lectura/operación cuando el negocio no está disponible. La identidad y el inicio de sesión siguen funcionando para mostrar el motivo correcto y permitir cerrar sesión.
- Las meseras globales no reciben fechas ni motivos: ven “No disponible” en el selector y pueden seguir operando negocios autorizados vigentes.
- WhatsApp pertenece sólo a Mideli. Si Mideli no está disponible, el webhook confirma técnicamente eventos válidos sin procesarlos; el scheduler y todos los envíos salientes se detienen. Pedidos programados atrasados quedan para revisión humana al reactivar.
- La pantalla bloqueada diferencia vencimiento, suspensión manual, negocio pausado, licencia sin asignar y error de verificación. Sólo el vencimiento confirmado menciona pagos pendientes.
- Login e Inicio se rediseñaron: sin texto "Mi Momento", el campo Usuario ya no muestra el sufijo `@mideli.com` (se completa internamente) y se aceptan correos completos.

### Turnos de caja

Caja por negocio con apertura y cierre explícitos (origen en la migración
`20260801125712_cash_shifts_and_location_snapshots.sql`):

- Solo un turno abierto por negocio a la vez; pedidos y cobros nuevos se
  vinculan al turno de ese negocio de forma transaccional. No se vende fuera
  de turno.
- Cierre con conteo ciego, separación por efectivo, tarjeta y transferencia, y autorización cuando la diferencia es importante.
- Después del conteo ciego, el corte muestra fondo inicial, ventas en efectivo, entradas, retiros, gastos y correcciones que forman el efectivo esperado.
- Durante el conteo ciego se muestra únicamente el fondo inicial registrado; el efectivo esperado y la diferencia permanecen ocultos hasta comparar el conteo.
- Owner y admin pueden corregir el fondo inicial solo mientras el turno está abierto desde `/settings/caja`. El valor anterior, el nuevo, el motivo, el responsable y la fecha quedan auditados en `cash_shift_opening_float_changes` mediante `correct_cash_shift_opening_float`.
- Movimientos de efectivo (retiros, gastos, fondos, correcciones) con responsable, motivo y autorización.
- Cuentas sin pagar pasan explícitamente al siguiente turno (`cash_shift_pending_orders`).
- Historial inmutable en `/settings/caja` (`cash-history-manager`), control operativo en `src/components/cash/cash-shift-control.tsx` y store `cash-shift-store.ts`.
- Los pedidos guardan snapshot de ubicación (zona y mesa) para mostrarla en Estado, Historial, cuentas, cobro y tickets aunque el plano cambie después (`src/lib/order-location.ts`).
- El conteo por denominaciones tiene botones grandes para aumentar y disminuir. El cierre no se descarta al tocar fuera del modal.
- Desde la migración `20260906160106_cash_shift_digital_close.sql`, quien cierra un turno puede consultar su corte digital durante las dos horas siguientes. Al terminar el cierre, la interfaz carga el detalle persistido con ventas por tipo de servicio, métodos de pago, arqueo, pendientes y auditoría. El mismo reporte se reutiliza en `/settings/caja`, cuyo historial permite filtrar por periodo y por cortes cuadrados, con diferencia o con pendientes.
- Desde `20260907090000_cash_movements_management.sql`, `/settings/caja` incluye la pestaña `Gastos y movimientos` para owner/admin. Permite consultar gastos, retiros, fondos y correcciones por mes, semana y día, además de tipo, estado y búsqueda; corregir un importe o anularlo exige autorización con PIN. El movimiento original nunca se borra: `cash_movement_corrections` conserva el importe, motivo, solicitante y autorizador, y los totales del turno usan el importe corregido. La agrupación usa la zona horaria operativa de Hermosillo y no distingue todavía entre gasto externo y salida de caja.
- El selector de mesas usa la composición compacta hasta 1023 px. En tablet vertical, el plano ya no oculta el resumen ni la confirmación; la acción permanece visible y muestra el nombre de la mesa seleccionada.

### Cobro unificado y tickets

El cobro pasó a un libro mayor transaccional (migración `20260801092945_unified_payment_ledger.sql` y siguientes):

- Tablas: `payment_transactions`, `payment_tenders`, `payment_order_allocations`, `payment_item_allocations`. Los pedidos tienen `payment_status` y `paid_amount`, separados del estado operativo (permite prepago de para llevar y domicilio sin ocultar el pedido de cocina).
- Soporta pago completo, parcial, combinado, dividido (equitativo o por productos), propina y descuento con PIN administrativo de un solo uso (intentos persistidos, autorización ligada al monto).
- Confirmación y anulación con bloqueos de fila e idempotencia en PostgreSQL; las escrituras directas legacy fueron retiradas.
- Interfaz: `src/components/payments/payment-flow.tsx` (panel central en tableta, hoja inferior en móvil), ticket fijo de 48 mm, reimpresión marcada, anulación administrativa y guía interna para todas las variantes de cobro.
- Owner y admin pueden corregir directamente el método de un pago desde Historial. Un mesero también puede hacerlo, pero requiere un PIN vigente de owner o admin. Cada corrección exige motivo, identifica solicitante y autorizador, queda en `payment_tender_method_changes` y actualiza el libro mayor y el snapshot del ticket.
- Si la corrección pertenece a un corte cerrado, el snapshot original se conserva y se registran dos reclasificaciones auditables en `cash_shift_adjustments`.
- Folios de orden consecutivos vía `order_folio_counter`.

### PWA y notificaciones

- Serwist configurado (`src/app/sw.ts`, `src/app/serwist/`, `src/app/manifest.ts`, `pwa-provider.tsx`), iconos en `public/icons/`.
- Suscripciones push en `push_subscriptions`, control en `push-notification-control.tsx`, lógica en `src/lib/push-notifications.ts`.
- Desde 2026-08-13 cada dispositivo configura por separado `kitchen_alerts` para pedidos nuevos y `ready_alerts` para eventos de estado. Meseras locales y globales reciben únicamente el evento `ready`; el personal de cocina y otros rangos autorizados conservan avisos de preparación y listo. Mesero ofrece ambos temas desde un único control compacto; Cocina conserva el acceso directo a los avisos de pedidos nuevos.
- La Edge Function `send-order-notification` valida JWT y perfil activo, consulta el pedido en servidor y limita destinatarios al negocio exacto según membresías activas, capacidades y preferencia Push del dispositivo. Los permisos de plataforma u organización no se mezclan con permisos de otro negocio.
- En pedidos multinegocio se emite un aviso por cada pedido persistido con su `business_id`; las capacidades actuales aplican automáticamente a negocios nuevos, sin una lista fija de nombres. El destino al tocar el aviso es Mesero o Cocina según el permiso de la persona.
- Para eventos multinegocio, publicar un aviso de pedido nuevo requiere permiso para operar pedidos y que la persona sea quien creó la orden; publicar avisos de preparación iniciada o pedido listo requiere permiso para actualizar preparación. Los pedidos legacy conservan su validación por rol.
- Las meseras globales reciben avisos de comedor en negocios sin acceso de pedidos asignado; domicilio y para llevar requieren acceso operativo explícito a ese negocio. Estado e Historial siguen el mismo límite en la lectura de filas.
- El service worker muestra Push aunque Mesero o Cocina estén visibles; el sonido y las señales locales son complementarios, no reemplazan el aviso del sistema.
- Avisos locales en `ready-order-notifier.tsx`, `ready-order-audio.ts` y `kitchen-order-audio.ts`, con desbloqueo después de una interacción válida.
- Los textos de ayuda usan términos genéricos como `dispositivo`, sin marcas.
- Cada usuario puede pausar o reactivar cada tema solo en su dispositivo. `is_active` indica que al menos un tema permanece activo.
- Cocina conserva los pedidos visibles ante fallos transitorios, cancela consultas colgadas a los 12 segundos y reconecta Realtime con backoff de hasta 30 segundos.

### Estación de impresión

La ruta `/settings/impresion` convierte una laptop conectada por USB en estación de tickets de cocina:

- `print_station_settings` activa o pausa la creación automática de tickets.
- `print_jobs` conserva una cola durable, evita duplicados por pedido y reintenta trabajos interrumpidos.
- La estación usa Realtime más sondeo de respaldo y reclama cada trabajo de forma atómica.
- El ticket de cocina es de 48 mm, sin precios, con zona, mesa, productos, variaciones y notas.
- En navegador normal se confirma la impresión. Para operación sin diálogo, la laptop debe abrir el navegador en modo impresión directa con la impresora predeterminada.

### Central de servicio de WhatsApp

La sección `/dashboard/whatsapp` funciona como una bandeja operativa para owner, admin, supervisor y mesero:

- La vista inicial prioriza conversaciones en relevo humano y permite buscar por nombre, teléfono o folio.
- En escritorio muestra cola, chat y comanda contextual. En móvil separa bandeja y conversación con regreso visible.
- En móvil, `Ver carrito y cliente` abre una hoja inferior con desplazamiento propio para que cliente, comanda, entrega y acciones nunca queden recortados por el alto del chat.
- La comanda reúne cliente, responsable, pedido, total, entrega, pago, dirección, copia y acceso a Google Maps.
- El chat baja al final al abrirlo, pero conserva la posición cuando el personal revisa mensajes anteriores y avisa si llegan mensajes nuevos.
- Responder desde Mideli toma la conversación y pausa el bot; también se puede devolver al bot o cerrar.
- Owner y admin pueden limpiar el contenido conversacional sin eliminar pedidos, folios ni auditoría.
- Los nombres públicos recibidos en el webhook de Meta se guardan en `customers.display_name` para reconocer al cliente.
- Catálogo y Resumen permanecen visibles; Entregas, Horarios, Bot y Diagnóstico viven bajo `Configurar`. El simulador fue retirado de la interfaz y del bundle.
- La carga inicial ya no consulta el catálogo completo para un simulador. La bandeja usa una instantánea ligera cada dos segundos solo mientras la página está visible.
- Owner y admin tienen la pestaña `Clientes` dentro de WhatsApp. Permite buscar globalmente por nombre, teléfono o folio, revisar totales pagados, domicilios e historial de hasta 100 pedidos, editar nombre y domicilios y abrir la conversación asociada. Los datos se cargan bajo demanda y no se agrega otra opción a la navegación principal.
- Toda dirección nueva escrita se geocodifica como candidata y se envía al cliente como ubicación nativa de WhatsApp. El costo de envío y el domicilio se guardan solo después de que el cliente confirma el punto. Una ubicación compartida o un domicilio previamente confirmado conserva el flujo rápido.
- La geocodificación valida direcciones numeradas por ciudad, calle y número, y también acepta lugares nombrados como plazas, parques, escuelas y comercios cuando Google devuelve un destino concreto dentro de Ciudad Obregón. Si el primer resultado no trae colonia, se intenta enriquecer con una consulta de geocodificación inversa y se reconocen componentes administrativos o textos etiquetados como fraccionamiento/colonia; la tarifa no se calcula con una colonia inventada. El domicilio y la colonia se envían en un solo paso, sin pedir la colonia como dato separado; la referencia de entrega queda opcional. El cliente siempre confirma el mapa y dispone de dos correcciones antes del relevo humano.
- Las decisiones breves usan botones nativos cuando caben en tres opciones: bebida, tipo de entrega, confirmación del domicilio, método de pago y confirmación final. El catálogo y las variaciones amplias conservan texto natural y numeración.
- El menú de WhatsApp consume las categorías reales activas del catálogo y muestra automáticamente cualquier categoría nueva. Las categorías compuestas únicamente por productos alcohólicos/cheves quedan fuera; los productos alcohólicos también se filtran si comparten una categoría con otros productos.
- El bot reconoce indicaciones naturales de preparación, notas generales y datos de acceso. Las notas de producto llegan a la comanda; las generales se guardan en el pedido; los PIN y accesos privados se reservan para entrega y no aparecen en avisos Push.
- Cada dispositivo puede activar o pausar `Chats por atender`. El primer relevo humano del ciclo genera un Push idempotente y abre directamente la conversación correspondiente.
- La creación automática de pedidos valida la configuración técnica y operativa, registra la orden mediante un RPC protegido y solicita el aviso a Cocina después de persistirla. En pedidos a domicilio, `orders.total` conserva el subtotal de productos y `delivery_fee` conserva la tarifa informativa del repartidor externo.
- Si una creación automática falla, la conversación pasa a atención humana. Mientras ninguna persona la haya tomado, un saludo, `Hacer pedido` o `Ver menú` permite retomar el bot desde cero; una conversación ya asignada a una persona permanece en silencio para no interferir con la atención manual.
- El intérprete semántico usa `gemini-3.5-flash-lite` de forma predeterminada y conserva `WHATSAPP_GEMINI_MODEL` como anulación. Es un modelo estable y de baja latencia; los botones y reglas locales siguen siendo la ruta principal, y Gemini solo interviene ante instrucciones libres complejas o ambiguas. Mideli clasifica credencial, cuota, modelo, solicitud incompatible, timeout y respuesta inválida sin mostrar datos del proveedor; solo reintenta una vez fallos transitorios dentro de un presupuesto de tres segundos. El esquema enviado a Google omite límites numéricos y de longitud que el endpoint rechaza; los mismos límites se validan localmente antes de tocar el carrito. Para reducir latencia y consumo, Gemini recibe solo productos mencionados, productos presentes en el carrito o, como respaldo, hasta doce productos de la categoría activa, nunca el catálogo completo. Las distribuciones explícitas de un mismo producto con opciones distintas, como `uno de res y otro de pollo`, se resuelven localmente y no dependen de la variabilidad de Gemini.

### Imágenes de productos

El editor de productos carga fotos desde el dispositivo (cámara, galería o archivos), sin campo de URL. Bucket público `menu-product-images` con escritura y borrado solo para owner y admin. Compresión a WebP, límite de 8 MB antes de optimizar, rutas por UUID y limpieza del archivo anterior al reemplazar o quitar. Lógica en `src/lib/product-images.ts`.

### Roles y acceso

Se agregó el rol `supervisor` (puede usar POS y KDS, no administración) y el estado activo de cuentas (`profiles.is_active`). El proxy solo cierra sesión si el perfil falta o está explícitamente inactivo; errores transitorios envían a `/reconectando` y conservan la sesión. El middleware de Next se reemplazó por `src/proxy.ts` (convención de Next 16) con control de rutas por rol: administración y analíticas solo owner/admin, inventario solo owner/admin, POS y KDS según rol.

La navegación operativa mantiene Mesero, Cocina y Analíticas visibles según permisos. Owner y admin encuentran Menú, Personal y Mesas en `Administrar`, e Inventario, Caja e Impresión en `Control`. En móvil, las herramientas administrativas viven dentro de `Más`; en tablet usan menús desplegables y en escritorio grupos colapsables.

## 5. Arquitectura actual

Stack:

- Next.js 16.2.12 con App Router.
- React 19 y TypeScript estricto.
- Tailwind CSS v4.
- shadcn/ui sobre Base UI.
- Zustand para estado de catálogo, carrito, órdenes, mesas, inventario y UI.
- Supabase para PostgreSQL, Auth, RLS, Realtime y Storage.
- Serwist para PWA.
- Resend, Twilio y Polar preparados como servicios del servidor.

Rutas principales:

- `/`: home de marca y entrada operativa.
- `/login`: acceso del personal (usuario sin sufijo visible).
- `/auth/callback`: callback de sesión.
- `/dashboard/mesero`: POS.
- `/dashboard/cocina`: KDS.
- `/dashboard/analiticas`: métricas (solo owner y admin).
- `/menu`: administración de categorías y platillos.
- `/settings`: personal y roles.
- `/settings/mesas`: editor del plano global.
- `/settings/inventario`: inventario, recetas, compras y conteos.
- `/settings/impresion`: estación de impresión automática de cocina y supervisión de cola.
- `/settings/caja`: historial de turnos y cortes.
- `/sistema-bloqueado`: pantalla de acceso limitado por licencia o suspensión técnica.
- `/settings/licencias`: control comercial por negocio, exclusivo de la cuenta Rincón 404.
- `/control/licencia`: control técnico legado; no administra vigencias comerciales.

El layout del dashboard cambia la navegación según el tamaño:

- Desktop: rail lateral con grupos administrativos colapsables.
- Tablet: header superior con operación visible y menús `Administrar` y `Control`.
- Móvil: header compacto, navegación inferior operativa y hoja `Más` para administración.

## 6. Archivos importantes

| Archivo o carpeta | Responsabilidad |
|---|---|
| `src/components/dashboard/mesero-view.tsx` | Orquesta POS, carga inicial, flujo de envío y panel de pedido |
| `src/components/pos/product-grid.tsx` | Catálogo de productos seleccionables |
| `src/components/pos/category-tabs.tsx` | Categorías del catálogo |
| `src/components/pos/cart-panel.tsx` | Pedido, tipo de servicio, mesa, total y envío |
| `src/components/pos/table-picker.tsx` | Selector visual de mesa después de armar el pedido |
| `src/components/tables/table-floor-map.tsx` | Canvas común de zonas y mesas, selección y arrastre |
| `src/components/admin/table-layout-editor.tsx` | Administración del plano, zonas y mesas |
| `src/components/admin/table-layout-inspector.tsx` | Editor central táctil para zonas y mesas |
| `src/components/admin/inventory-manager.tsx` y `src/components/admin/inventory/` | Administración de inventario, recetas, compras y conteos |
| `src/components/payments/payment-flow.tsx` | Flujo táctil de cobro: descuento, división, propina, métodos combinados |
| `src/components/payments/payment-method-correction-dialog.tsx` | Corrección auditada de métodos de pago y autorización por PIN para mesero |
| `src/components/cash/cash-shift-control.tsx` y `src/lib/stores/cash-shift-store.ts` | Apertura, movimientos y cierre de caja |
| `src/components/admin/cash-movements-manager.tsx` | Consulta, corrección y anulación auditada de gastos y movimientos |
| `src/lib/cash-movement-periods.ts` | Agrupación de movimientos por mes, semana y día en la zona horaria del local |
| `src/components/license-heartbeat.tsx`, `src/lib/license.ts`, `src/lib/license-server.ts` | Vigencia de licencia en cliente y servidor |
| `src/proxy.ts` | Sesión, licencia y control de rutas por rol (reemplaza a `src/middleware.ts`) |
| `src/lib/push-notifications.ts`, `src/components/dashboard/push-notification-control.tsx`, `src/components/dashboard/ready-order-notifier.tsx` | Suscripciones Push por dispositivo, temas de cocina y pedidos listos, y aviso sonoro |
| `src/lib/product-images.ts` | Carga y limpieza de fotos de productos |
| `src/lib/order-location.ts` | Snapshot de ubicación del pedido (zona y mesa) |
| `src/lib/stores/catalog-store.ts` | Lectura y CRUD de categorías y menú, con caché de 30 s en carga conjunta |
| `src/components/admin/category-manager.tsx` | Edición y orden accesible de categorías por mouse, tacto y teclado |
| `src/components/dashboard/dashboard-shell.tsx` | Navegación responsiva por rol, operación y grupos administrativos |
| `src/lib/stores/cart-store.ts` | Estado local del pedido actual |
| `src/lib/stores/order-store.ts` | CRUD de órdenes, estados, cobro y suscripción Realtime |
| `src/lib/stores/tables-store.ts` | Lectura y CRUD del mapa, con deduplicación y caché de 30 s |
| `src/lib/stores/inventory-store.ts` | Insumos, recetas, movimientos y ajustes de stock |
| `src/lib/order-totals.ts`, `src/lib/order-visuals.ts` | Regla de totales operativos y semántica visual por tipo/estado |
| `src/components/pos/order-details-modal.tsx` | Datos finales del pedido, validación de requisitos y envío/cobro |
| `src/components/whatsapp/whatsapp-inbox.tsx` | Bandeja, filtros, chat y scroll táctil contenido |
| `src/components/whatsapp/whatsapp-customers.tsx` | Directorio de clientes, domicilios y edición segura |
| `src/components/whatsapp/whatsapp-message-text.tsx` | Presentación segura del formato de mensajes de WhatsApp |
| `src/lib/actions/delivery.ts` | Cotización y avisos de domicilio manual |
| `src/lib/whatsapp/pos-draft.ts` | Transferencia del borrador de WhatsApp a Mesero |
| `src/types/database.ts` | Tipos TypeScript del dominio |
| `src/app/dashboard/layout.tsx` | Navegación, sesión y roles |
| `src/app/globals.css` | Tokens y estilos globales |
| `supabase/migrations/00001_initial_schema.sql` | Tablas y enums iniciales |
| `supabase/migrations/00002_rls_policies.sql` | RLS inicial |
| `supabase/migrations/00003_tables_and_inventory.sql` | Mesas, zonas, inventario y referencias de mesa |
| `supabase/migrations/00004_menu_refresh.sql` | Reemplazo aprobado del menú provisional |
| `supabase/migrations/00005_global_table_map.sql` | Geometría y distribución inicial de todas las zonas |
| `supabase/migrations/20260731060825_menu_reset_from_docx.sql` | Reconstrucción final del menú desde el Word fuente |
| `supabase/migrations/20260731062255_move_toppings_into_sushi_modifiers.sql` | Convierte toppings en extras opcionales de sushi |
| `supabase/migrations/20260731065417_add_topping_descriptions.sql` | Agrega la información de ingredientes a las opciones de toppings |

## 7. Carga y rendimiento ya aplicado

Se atendieron los problemas de lentitud percibida del POS con estas decisiones:

- Carga paralela de catálogo, órdenes activas y mesas.
- Deduplicación de solicitudes simultáneas en stores.
- Caché breve de catálogo y mesas para evitar consultas repetidas al navegar.
- Carga diferida de estado, variaciones y confirmación de pedido.
- Precarga en tiempo ocioso de módulos secundarios.
- Suscripción Realtime con refresh agrupado para evitar ráfagas de consultas.
- `useCallback` en handlers de productos y variaciones.
- Las alertas Push de pedido nuevo y pedido listo se solicitan en segundo plano después de persistir o cambiar el pedido. La operación no queda bloqueada por la latencia de una Edge Function secundaria.
- El POS conserva el catálogo en pantalla cuando una consulta temporal falla, muestra reintento y actualiza categorías y productos abiertos tras cambios Realtime.
- La gráfica de tendencia de analíticas se carga bajo demanda para reducir el JavaScript inicial de la ruta.
- En Estado, `fetchActiveOrders` carga órdenes y artículos relacionados en una sola consulta PostgREST usando las FK explícitas; elimina una ronda de red y conserva filtros y normalización del modelo. No cambia el alcance de negocio ni RLS. Tiene pruebas para artículos vacíos, productos eliminados y separación Mideli/Just Dipping. El impacto en latencia real debe observarse después del deploy, sin asumir una cifra de aceleración.
- Esta optimización quedó desplegada en producción (`dpl_67Gv38V6B9c6awrCXGuqvMV8tGiC`, `READY`, alias `mideli.vercel.app`) el 2026-10-02. Health respondió `ok`; al desplegar sin commit, la versión reportada sigue siendo el SHA base `2b11bea0a00f`. Falta comparar su respuesta real en los equipos del local.
- El scheduler de WhatsApp corre cada minuto desde Supabase Cron mediante `pg_net` y Vault para liberar pedidos programados y procesar inactividad; la ruta acepta un secreto dedicado y la liberación es idempotente.

Antes de añadir más optimizaciones, medir qué interacción sigue lenta. No reemplazar consultas reales por datos falsos para aparentar velocidad.

## 8. Supabase y seguridad

Proyecto:

- Project ref: `qgnjennimvbrfxvcmowb`.
- URL pública: `https://qgnjennimvbrfxvcmowb.supabase.co`.
- CLI inicializada en `supabase/config.toml` (versionada en git desde 2026-08-02 junto con todas las migraciones).
- CLI enlazada al proyecto remoto.
- El repositorio local contiene las migraciones históricas y las rebanadas
  multinegocio de septiembre. El 2026-09-29, la consulta de solo lectura
  `npx supabase migration list --linked` mostró alineación local/remota hasta
  `20260928084400_fix_cash_authorizers_to_local_business.sql`. Volver a
  consultarla antes de depender de ese dato.

Tablas de dominio (verificado 2026-08-02, todas con RLS):

`profiles`, `categories`, `menu_items`, `orders`, `order_items`, `order_status_log`, `order_folio_counter`, `table_zones`, `restaurant_tables`, `table_map_labels`, `inventory_items`, `inventory_recipes`, `inventory_movements`, `inventory_lots`, `inventory_receipts`, `inventory_receipt_lines`, `inventory_purchase_orders`, `inventory_purchase_order_lines`, `inventory_counts`, `inventory_count_lines`, `payment_transactions`, `payment_tenders`, `payment_order_allocations`, `payment_item_allocations`, `cash_shifts`, `cash_movements`, `cash_movement_corrections`, `cash_shift_adjustments`, `cash_shift_opening_float_changes`, `cash_shift_pending_orders`, `app_license`, `push_subscriptions`, `user_onboarding_progress`.

Enums:

- Estados: `pending`, `in_kitchen`, `ready`, `served`, `paid`, `cancelled`.
- Tipos de orden: `comedor`, `domicilio`, `para_llevar`.
- Pago: `efectivo`, `tarjeta`, `transferencia`.
- Roles: `owner`, `admin`, `supervisor`, `waiter`, `kitchen`.

Patrones obligatorios:

- Navegador: `createClient` desde `src/lib/supabase/client.ts`.
- Servidor o acciones: `createClient` desde `src/lib/supabase/server.ts`.
- No usar `SUPABASE_SERVICE_ROLE_KEY` en Client Components.
- Toda modificación de esquema requiere migración nueva y revisión de RLS.
- Verificar con `npx supabase migration list` y `npx supabase db push --linked --dry-run`.
- No ejecutar `db reset --linked`.
- Nunca guardar tokens en este documento, en el código, en commits ni en respuestas.

## 9. Estado real y pendientes

Estado remoto verificado funcionalmente el 2026-08-09. Los conteos inferiores son una fotografía histórica detallada del 2026-08-02 y no deben usarse como inventario o métrica actual:

- 7 categorías.
- 50 productos.
- 4 zonas.
- 26 mesas.
- 0 insumos (1 conteo físico registrado).
- 3 perfiles de staff.
- 3 órdenes con cobros en el libro mayor (pruebas del flujo unificado).
- 2 turnos de caja históricos.
- 1 licencia registrada en `app_license`.
- 12 suscripciones push activas.

Cambios posteriores documentados en el código local incluyen el ciclo de vida de domicilios manuales con avisos opcionales por WhatsApp, snapshots de ubicación, separación del envío que cobra el repartidor externo, deduplicación canónica de domicilios y conservación de la colonia confirmada en la orden para el mensaje del repartidor. La colonia se muestra de forma explícita en WhatsApp, Mesero, Estado, Historial y Clientes; el cotizador automático rechaza una ubicación si Google Maps no identifica una colonia para evitar tarifas de zona incorrectas. Antes de depender de estos cambios en una tarea de base de datos, confirmar su estado remoto.

El menú vigente proviene de `Menu_Mideli_Completo_Provisional.docx` mediante la migración `20260731060825_menu_reset_from_docx.sql`. Mango Habanero fue reemplazado por Buffalo Ranch, Cajun, Ajo Parmesano y Honey Mustard. Los modificadores de sabor y proteína tienen precio cero; solo "Con papas" agrega 30 pesos.

Los toppings Dracarys, Mr. Crab, Cordon Blue, Gratinado y Especial viven como un grupo opcional en los 15 sushis, con precios de 30, 35, 30, 25 y 35 pesos.

El Word no muestra precio para Low Carb, Limonada Natural, Limonada Mineral, Té Helado ni Refrescos de temporada. Se conservaron temporalmente los precios anteriores de 150, 40, 45, 40 y 30 pesos, respectivamente.

Los conteos son una fotografía, no una garantía futura. Si una tarea depende de ellos, volver a consultar.

### Monitoreo de errores

Sentry está integrado manualmente con `@sentry/nextjs` 10.69.0 en navegador, Node.js y Edge. Conserva los wrappers de Serwist y las pantallas de error de Mideli. Captura errores y trazas con 10 por ciento de muestreo en producción, excluye `/api/health` y descarta ruido conocido de extensiones.

La política es de privacidad estricta: no recolecta identidad, cookies, headers, cuerpos, query params, variables locales ni contenido operativo; anonimiza rutas locales y evita ubicación, hostname, hardware y cultura. Vercel tiene las variables de runtime en Development y Production. Preview y el token externo de source maps siguen pendientes. La verificación real quedó documentada en `docs_dev/sentry-monitoring/`.

### Control diario y rentabilidad

Analíticas incorpora un centro de control para owner/admin con alertas de caja, cocina, inventario, cobertura de recetas, productos sin movimiento y márgenes estimados. El selector de fechas inicia en el día actual cuando no hay periodo explícito, permite cambiar a semana, mes o año tomando como ancla el día actual y usa la zona horaria operativa de Hermosillo para evitar desplazamientos entre dispositivos. El mismo selector reutilizable se comparte con Historial de ventas y Caja/cortes; Gastos y movimientos conserva su navegación mes → semana → día sobre la misma lógica. Las funciones comunes viven en `src/lib/date-period.ts` y el control visual se expone como `DatePeriodPicker`. El reporte del día anterior puede enviarse a un único correo reemplazable, con una ruta cron protegida y registro idempotente por fecha. Para entregar a correos distintos a la cuenta de prueba, el proveedor necesita un remitente verificado. Antes de desplegar esta fase, Vercel debe tener `CRON_SECRET` configurado.

La disponibilidad manual de productos fue eliminada por decisión del dueño. Menú, Cocina y POS ya no muestran ni bloquean estados Disponible, Limitado o Agotado. El inventario se descuenta por recetas y puede quedar negativo.

Los indicadores de caja excluyen cortes archivados. La eliminación definitiva solo se permite sobre cortes cerrados, archivados y sin pedidos, pagos, movimientos, correcciones ni traspasos asociados. Los cortes con actividad real permanecen archivados y fuera de las métricas. Impresión y Diagnóstico tienen regreso visible al panel, igual que Caja, Inventario, Mesas, Menú y Personal.

Pendientes prioritarios:

1. Ejecutar el checklist de piloto de `docs/releases/v0.9-piloto.md` en tablet, móvil, laptop e impresora reales.
2. Diseñar e implementar un modo de contingencia para continuar tomando pedidos ante una caída de internet.
3. Completar monitoreo técnico, source maps privados y un procedimiento probado de respaldo y restauración.
4. Validar en operación real todos los cobros, correcciones, cierres de caja, impresión, inventario negativo y notificaciones PWA.
5. Ampliar la cobertura automatizada para pedidos, cobro, caja, impresión, inventario y permisos. Actualmente hay 20 archivos E2E de Playwright, con proyectos de escritorio, tablet y móvil; todavía no cubren toda la operación real.
6. Después de estabilizar el piloto, priorizar clientes/lealtad y pedidos directos.

El proceso vigente para continuar está en `docs/WORKFLOW.md` y el checklist de
operación real en `docs/releases/v0.9-piloto.md`. El archivo
`.opencode/plans/next-session-plan.md` conserva un plan histórico de septiembre.

### Historial de la evolución multinegocio: Rincón 404 Food Park

Los puntos siguientes registran decisiones y avances de septiembre de 2026.
Algunos verbos en futuro describen el plan de aquel momento: para el estado
actual, leer primero las secciones 12 a 23 y verificar código y remoto.

- `Mideli` será el primer negocio migrado y conservará credenciales, folios, WhatsApp y funcionamiento visible.
- `Just Dipping` es el segundo negocio confirmado, pero no se registrará ni se importarán datos hasta contar con autorización y datos reales.
- La aplicación será única. La separación se hará con organización, negocios, membresías, capacidades, RLS y RPCs, no con copias de la aplicación.
- El administrador de plataforma será una cuenta separada del dueño actual de Mideli (`admin`). El `Coordinador` administrará meseras globales y mesas compartidas. Cada dueño administrará su propio personal y operación.
- Una mesera global podrá capturar y cobrar para varios negocios. Una cuenta local quedará limitada a su negocio. Una mesa podrá contener una visita con cuentas hijas por negocio.
- Mideli conservará Cocina. Just Dipping utilizará Estado con `Pendiente`, `Preparando` y `Listo`; una impresora propia es una capacidad contemplada, pero no se habilitará hasta confirmar su configuración.
- Como regla operativa recomendada, el personal autorizado de cada negocio cambia sus estados de preparación; la mesera global consulta, recibe avisos, entrega y cobra, pero no marca `Listo` de otro negocio por defecto. Una excepción deberá ser una capacidad explícita y auditada.
- WhatsApp seguirá exclusivo de Mideli en la primera etapa.
- La fundación y las fronteras de catálogo, pedidos, mesas, inventario, caja, pagos, impresión, Push, personal y navegación están aplicadas en producción desde las migraciones `20260919082935` a `20260919134500`. El bootstrap resolvió únicamente los perfiles activos existentes por nombre exacto, no inventó usuarios y conserva WhatsApp exclusivo de Mideli. La última corrección de privilegios anónimos quedó en `20260919200649_multibusiness_security_revoke_staff_anon.sql`. La preparación, brechas, pruebas, reversión y gates siguen en `docs_dev/food-garden-multi-business/`.
- El repositorio tiene `.github/workflows/verify.yml` para validar lint, build, migraciones y pgTAP en GitHub Actions sin crear una base Supabase adicional. La CI no sustituye un staging persistente ni autoriza aplicar cambios remotos.
- La migración local `20260919124500_multibusiness_order_status_runtime.sql` protege
  los cambios de estado por negocio. Cocina local y el dueño pueden actualizar
  preparación; la mesera global conserva operación, entrega y cobro sin recibir
  automáticamente permiso para marcar como listo otro negocio. Mesero, Cocina y
  Estado usan la pasarela y el filtro del negocio seleccionado, con fallback
  histórico mientras la fundación no exista en instalaciones antiguas. La
  migración ya está aplicada a producción y el contexto real queda activo.
- Analíticas y el reporte diario también reciben el negocio seleccionado para
  filtrar caja, inventario, menú, cocina, ventas, pagos, cancelaciones y cuentas
  abiertas. El cron usa el negocio canónico `mideli` cuando la fundación existe;
  la configuración del correo y sus ejecuciones siguen globales de transición
  hasta diseñar su separación por dueño.
- La corrección de métodos de pago ya tiene una frontera multinegocio local en
  `20260919130000_multibusiness_payment_correction_runtime.sql`. El gateway
  comprueba pertenencia del tender al negocio seleccionado, estado completado y
  capacidad antes de ejecutar la autorización por PIN o la reclasificación.
  El modal filtra sus lecturas con el mismo `business_id` y no usa el fallback
  histórico cuando el contexto multinegocio existe pero no hay negocio
  seleccionado. Los wrappers públicos antiguos quedan revocados después de
  esta migración, que ya está aplicada a producción.
- La impresión y los avisos Push tienen una frontera local en
  `20260919131500_multibusiness_print_push_runtime.sql`. Los trabajos de
  impresión y eventos Push conservan el negocio del pedido; la estación física
  existente solo encola Mideli, y el reclamo nuevo exige negocio y capacidad.
  El reclamo antiguo queda limitado al negocio canónico de Mideli para que una
  pestaña vieja no se rompa durante la transición. `send-order-notification`
  filtra destinatarios mediante membresías y capacidades; `send-order-ready`
  solo adapta llamadas antiguas al worker único. Esta frontera ya está aplicada
  a producción y WhatsApp continúa limitado deliberadamente a Mideli.
- La administración de personal tiene una frontera local en
  `20260919133000_multibusiness_staff_runtime.sql`. El dueño administra solo
  personal local de su negocio y el Coordinador administra únicamente meseras
  globales. Las altas asignan capacidades derivadas del rol mediante RPCs
  auditadas; el navegador ya no puede insertar o actualizar membresías
  directamente. Las bajas son reversibles y las cuentas multinegocio no se
  eliminan para conservar historial. La pantalla `/settings` ya filtra la lista
  por el alcance actual y adapta los roles visibles. Restablecer contraseñas y
  configurar PIN ahora exigen la membresía administrable del alcance actual en
  `src/lib/actions/users.ts`; la función de PIN también lo valida en Supabase
  mediante `20260919202503_multibusiness_scope_staff_credentials.sql`. El
  Coordinador todavía requiere una política de credenciales propia antes de
  recibir permisos de plataforma.
- La autorización de navegación ya consume las capacidades del contexto
  multinegocio desde `src/proxy.ts`. El negocio seleccionado se resuelve a
  partir de la membresía real y la cookie solo funciona como pista; el proxy
  publica capacidades efímeras hacia el layout para mostrar y proteger Menú,
  Personal, Mesas, Caja, Inventario, POS y Cocina. Si la función de contexto
  todavía no existe, se conserva el fallback histórico de Mideli. Cuando la
  función existe, una cuenta no administradora sin contexto o con un error de
  evaluación queda bloqueada, en vez de recuperar permisos por su rol legado.
  WhatsApp mantiene su alcance exclusivo de Mideli y solo se publica para una
  membresía visible de Mideli; Analíticas conserva su regla heredada porque
  todavía no tiene una capacidad separada.
- La migración `20260919203147_multibusiness_scope_visibility.sql` corrigió el
  límite del selector y de las políticas de negocio: una membresía local solo
  puede ver su `business_id`; una membresía de organización obtiene todos los
  negocios únicamente cuando tiene una capacidad organizacional explícita de
  operación, cobro o coordinación de meseras. `organization.manage_tables` no
  otorga acceso a datos privados de negocios.
- La migración `20260919203953_multibusiness_context_metadata_scope.sql` separó
  el límite de metadatos del selector del límite de datos privados. El RPC
  `get_my_multibusiness_context()` puede resolver el negocio y la organización
  para un Coordinador con `organization.manage_tables`, necesario para el plano
  compartido, pero las políticas privadas continúan usando
  `private.multibusiness_can_view_business(uuid)`, que no considera ese permiso
  suficiente para leer menú, pedidos, inventario, caja o finanzas.
- La migración `20260920100000_multibusiness_rls_privilege_cleanup.sql` restauró
  el permiso `EXECUTE` de las funciones RLS que usan las lecturas por negocio y
  retiró las políticas legacy abiertas que sobrevivieron a la migración inicial.
  La verificación remota confirmó lecturas autenticadas de pedidos, pagos, caja,
  inventario, historial e impresión, sin permisos equivalentes para `anon`.
- La consulta de analíticas identifica explícitamente la relación compuesta
  `menu_items_business_category_fkey` al leer categorías. Esto evita el error
  `PGRST201` que aparece al conservar simultáneamente la relación histórica por
  `category_id` y la relación delimitada por `business_id`.

### Auditoría de cierre de la primera rebanada

- La rama `codex/whatsapp-orders` quedó con lint, build y `git diff --check`
  correctos. GitHub Actions validó la revisión `06a628a` en el run
  `35461058199`, incluyendo las migraciones y 260 checks pgTAP.
- La versión compatible se publicó en producción en `mideli.vercel.app` y las
  migraciones `20260919082935` a `20260919134500`, más
  `20260919200649_multibusiness_security_revoke_staff_anon.sql` y
  `20260919202503_multibusiness_scope_staff_credentials.sql` y
  `20260919203147_multibusiness_scope_visibility.sql` y
  `20260919203953_multibusiness_context_metadata_scope.sql` y
  `20260920100000_multibusiness_rls_privilege_cleanup.sql`, quedaron
  aplicadas en Supabase. `npx supabase db push --linked --dry-run` reporta
  `upToDate: true`.
- El preflight remoto antes y después del corte conservó 214 pedidos, 215
  transacciones, 43 turnos, 7 categorías, 52 productos, 5 insumos y cero
  huérfanos. La verificación repetible está en
  `supabase/verification/mideli_post_multibusiness.sql`; el contexto por
  perfil se comprueba en `supabase/verification/mideli_runtime_context.sql`.
- La primera rebanada visual de la comanda mixta ya está conectada localmente:
  BusinessMenuSelector cambia el catálogo sin cambiar la sesión ni la caja,
  cada línea conserva business_id, el carrito y el resumen agrupan por
  negocio, y Mesero usa create_multibusiness_table_orders para comedor. La
  creación mixta de domicilio y para llevar se bloquea explícitamente porque
  todavía no existe un RPC atómico equivalente. Historial amplía su consulta
  al alcance organizacional autorizado y etiqueta cada pedido con su negocio.
  Esto aún requiere probarse con un segundo negocio autorizado; no se debe
  presentar el selector como prueba de que Just Dipping ya está operativo.
- La configuración del correo de reportes y sus ejecuciones siguen siendo
  globales de transición. Antes de habilitar reportes para otro negocio deben
  tener `business_id`, permisos por dueño y folios de ejecución separados.
- WhatsApp, el catálogo del bot y sus pedidos siguen restringidos a Mideli de
  forma deliberada. No se debe reutilizar ese canal para otro negocio hasta
  definir número, credenciales, configuración y retención independientes.
- El Coordinador aún no tiene una identidad de plataforma sembrada ni un
  flujo final para administrar sus propias credenciales. Para crear esa cuenta
  faltan nombre, correo real y decisión explícita sobre el acceso de plataforma;
  no se deben inventar esos datos.
- La migración `20260919205139_multibusiness_account_payment_runtime.sql`
  completó el primer límite financiero de las cuentas de mesa. Los estados de
  `business_accounts` ahora se sincronizan con los pagos de sus órdenes y una
  orden nueva no puede reutilizar una cuenta pagada, cerrada o cancelada.
  `StatusView` consulta la caja del negocio del pedido y agrupa por
  `business_account_id`; el carrito marca las líneas de una comanda mixta por
  negocio. La migración está aplicada en producción y la verificación remota
  conservó los conteos existentes. El flujo visual completo para operar un
  segundo negocio sigue pendiente porque todavía no existe un negocio real
  adicional autorizado.
- La navegación multinegocio también quedó cerrada contra el fallback de rol:
  `src/proxy.ts` y `DashboardShell` usan el contexto real para autorizar y
  mostrar POS, Cocina y WhatsApp. Si el contexto existe pero no otorga acceso,
  se redirige a otra superficie autorizada o a `/dashboard/sin-acceso` sin
  cerrar la sesión. El fallback por rol queda solo para instalaciones antiguas
  donde todavía no existe la función de contexto.

### Estado local posterior a la auditoría

- La rama local añade `BusinessScopeFilter` a Estado e Historial. Un alcance
  organizacional puede consultar varios negocios sin mezclar cuentas de mesa;
  cada cobro y corrección de método resuelve la caja del `business_id` del
  pedido, no la caja que quedó seleccionada por accidente en la pantalla.
- `/settings/negocios` ya tiene el primer registro de plataforma: lista
  negocios, crea una cuenta de dueño con alias de usuario, inicia cada negocio
  como `draft`, permite editar nombre, identificador y zona horaria, y permite
  activar, pausar, archivar o restaurar sin borrar su historial. La acción
  valida `platform.manage_businesses` directamente con Supabase en servidor,
  registra la edición en `audit_events` y no expone errores internos.
- Después de iniciar sesión, una cuenta con `platform.manage_businesses` llega
  automáticamente a `/settings/negocios` desde `/dashboard`; ya no depende de
  que la persona escriba la ruta manualmente. La ruta sigue protegida por la
  sesión y la capacidad, por lo que conocer la URL no concede acceso.
- La transferencia a una cuenta de plataforma independiente se ejecuta desde
  la misma vista con una acción protegida: crea el perfil `admin`, la membresía
  `platform_admin` y su capacidad, audita el cambio y retira únicamente la
  membresía de plataforma del dueño actual de Mideli. No toca su membresía,
  pedidos, caja, inventario ni WhatsApp de negocio.
- Un dueño de un negocio `draft` o `paused` puede configurar catálogo,
  inventario y personal, pero no puede operar pedidos, preparación, caja o
  cobros hasta que el negocio esté `active`. La selección operativa sólo admite
  negocios activos y WhatsApp continúa limitado a Mideli.
- La administración de plataforma ahora consulta las capacidades activas del
  dueño desde `membership_capabilities` y las muestra por negocio en
  `/settings/negocios`: catálogo, inventario, pedidos, cocina, cobros, caja y
  personal. El alta y la edición permiten seleccionar esos permisos mediante
  casillas reales; Catálogo es obligatorio. Las capacidades desactivadas se
  conservan como revocaciones auditables, por lo que activar o reactivar un
  negocio no las habilita accidentalmente. WhatsApp se muestra como exclusivo
  de Mideli durante esta primera etapa.
- La migración local
  `20260920103000_platform_manager_and_active_business_guards.sql` otorga la
  capacidad de plataforma al perfil existente `Administrador` únicamente si
  sigue siendo dueño activo de Mideli, y agrega barreras de ciclo de vida a
  caja y cobros. Ya está aplicada en remoto y el dry-run posterior confirma que
  la base está al día. En ese momento no se había creado Just Dipping; la
  auditoría remota del 2026-09-25 lo encontró ya registrado como borrador.

La auditoría remota del 2026-09-19 confirmó una organización activa, un negocio
Mideli activo, cuatro membresías activas y aislamiento sin filas operativas sin
negocio. Los avisos `anon` de RPC privilegiadas fueron revocados; permanecen
avisos informativos para RPC `SECURITY DEFINER` autenticadas que validan
capacidades internamente. La protección de contraseñas filtradas de Supabase
Auth sigue pendiente de activarse manualmente antes del piloto prolongado.
El dump local no pudo generarse en este equipo porque la CLI requiere Docker o
Podman; no se debe presentar ese respaldo como existente. El estado actual y
las verificaciones de producción se documentan en la siguiente auditoría.

### Auditoría remota y flujo de preparación (2026-09-25)

- Supabase tiene Mideli `active` y Just Dipping `draft`. Just Dipping conserva
  su catálogo propio (1 producto), pero no tiene insumos de inventario ni
  pedidos. Su dueño tiene permisos de catálogo, inventario y personal; los
  permisos de operación, cocina, caja y cobro están revocados/inactivos para
  la fase de borrador. No copiar datos ni activar el negocio sin revisar los
  datos reales de su dueño.
- La navegación atrapaba al dueño en `/menu`: `/dashboard` redirigía al menú y
  la flecha del menú regresaba a `/dashboard`. Los registros de producción del
  2026-09-25 confirmaron el ciclo. Se corrige `/dashboard` como centro de
  preparación para que los permisos de menú, inventario y personal abran
  herramientas separadas, con el estado de borrador visible.
- El diagnóstico técnico de negocio no debe probar pedidos o caja de un
  borrador, aunque sus capacidades aparezcan configuradas en la base; el proxy
  filtra esos permisos hasta que el negocio esté activo.
- La RPC `update_business_order_status` acepta que un miembro con
  `business.operate_orders` actualice `in_kitchen` y `ready` de su propio
  negocio. Para locales activos sin `business.update_preparation`, Estado
  muestra acciones para avanzar a Preparando y Listo. Esto no otorga esa
  capacidad a meseras globales ni crea una pantalla de Cocina adicional.
- La comanda mixta está soportada en comedor mediante
  `create_multibusiness_table_orders`, con órdenes y cuentas por negocio. El
  carrito mixto para llevar o domicilio sigue bloqueado. No habilitarlo con
  inserciones cliente no atómicas; domicilio además requiere acordar cómo
  mostrar una sola tarifa externa sin duplicarla en ventas/cobros.
- WhatsApp permanece exclusivo de Mideli. En los registros Vercel de las 24
  horas previas a esta revisión no aparecen llamadas a
  `/api/integraciones/whatsapp/meta`, aunque el cron de WhatsApp se ejecutaba
  regularmente y no hay errores de runtime agrupados para el webhook. Esto no
  prueba que Meta esté bien configurado; se añadió al Diagnóstico la URL
  esperada y la hora del último mensaje entrante visible para comparar con la
  configuración del webhook de Meta.
- Supabase registró un 401 aislado en `send-order-notification`; los demás
  avisos muestreados respondieron 200. Es la función de Push de pedidos, no el
  webhook entrante de WhatsApp, y no hay evidencia para atribuirle la falla
  del bot.

### Puestos combinables de caja para meseras globales (2026-09-26)

- El Coordinador de Rincón 404 configura por mesera y por negocio permisos
  separados para abrir y cerrar caja. La asignación no entrega
  `business.manage_cash`: movimientos, correcciones, gastos e historial
  completo siguen reservados al administrador del negocio. El permiso de
  cierre permite ver únicamente el corte propio recién cerrado.
- Quien solo opera pedidos o puede abrir caja recibe del RPC únicamente el
  estado de la caja abierta, no totales, datos de apertura ni identidades del
  personal. La pantalla usa el estado para permitir pedidos/cobros y oculta
  las cifras si no tiene permiso de cierre o administración.
- `/settings` muestra asignaciones por negocio, apertura/cierre combinables,
  auditoría al cambiar permisos y una vista previa de lo que se conserva al
  reactivar una mesera. Los grants revocados no se restauran implícitamente.
- Las migraciones locales
  `20260926065953_global_waiter_business_cash_permissions.sql` y
  `20260926065956_seed_global_waiter_cash_coordinator_and_andrea.sql` preparan
  el RPC protegido, RLS, el endurecimiento de los RPCs legacy y la asignación
  inicial aprobada: Coordinador para la cuenta existente de plataforma y caja
  operativa de Mideli para Andrea. La verificación de unicidad remota se hizo
  sin escrituras antes de aplicar. Ambas migraciones quedaron aplicadas en
  Supabase producción el 2026-09-26; la verificación remota confirmó el RPC,
  las dos capacidades de Andrea en Mideli, ninguna capacidad de caja suya en
  otros negocios y el permiso de coordinación activo para la cuenta de
  plataforma existente. La versión quedó desplegada en producción en
  `https://mideli.vercel.app` con estado `READY`; `npm run lint` y el build de
  Vercel terminaron correctamente. Las pruebas pgTAP locales no se ejecutaron
  porque Docker no está disponible en este equipo.
- La migración `20260928084400_fix_cash_authorizers_to_local_business.sql`
  conserva el flujo de caja pero limita la lista y validación de PIN a perfiles
  activos con membresía local activa (`scope_type = business`) en el negocio
  seleccionado. Tener únicamente un puesto de organización o plataforma ya no
  permite autorizar retiros/cierres de otro local. La implementación anterior
  se movió al esquema privado y la RPC pública conserva el nombre usado por la
  aplicación. La migración quedó aplicada en producción; las consultas remotas
  verificaron el alcance local, el acceso de la RPC pública y el bloqueo de la
  implementación interna. El pgTAP remoto no pudo ejecutarse porque la base no
  tiene instalada la función `plan()`.

### Sesión de administrador se cerraba por negocio seleccionado (2026-09-26)

- Causa: el proxy confiaba en la cookie de negocio seleccionada aunque ese
  contexto sólo mostrara un permiso organizacional compartido, como administrar
  el plano de mesas, y no permisos operativos del negocio. Si la cookie antigua
  señalaba Just Dipping mientras el usuario era dueño de Mideli, desaparecían
  sus capacidades de Mideli y el flujo de acceso terminaba en `/login?reason=scope`,
  donde se cerraba la sesión.
- La selección ahora usa una política común en navegador, proxy y servicios de
  servidor: respeta contextos con capacidades de negocio o permisos
  organizacionales explícitos; si la cookie apunta a un contexto no autorizado,
  la corrige al negocio permitido. El permiso compartido de mesas continúa
  habilitando `/settings/mesas` sin cerrar la sesión. Un negocio propio en
  preparación conserva prioridad aunque el usuario también vea metadatos de
  otros negocios activos.
- No se modificaron cuentas, permisos remotos ni el esquema de Supabase. Pasaron
  `npm run lint`, `npm run build` y tres pruebas Playwright de selección. La
  versión quedó desplegada como producción en `https://mideli.vercel.app`,
  deployment `dpl_9RCkfdFmApfPXP7RKjqhRoPXjMmu`, estado `READY`; Vercel no reportó
  errores de runtime en los 15 minutos posteriores al despliegue. El inicio con
  credenciales reales debe confirmarse en el dispositivo del usuario.

### Selector de negocio en Mesero (2026-09-26)

- `/dashboard/mesero` oculta el selector global de contexto: el selector
  `Menús` de esa vista ya elige el catálogo de cada negocio sin cambiar la
  sesión ni perder la comanda mixta. El selector global permanece en las demás
  superficies donde cambiar el negocio sí cambia el contexto administrativo u
  operativo.
- `Menús` solo muestra negocios activos donde la cuenta tenga
  `business.operate_orders` o `organization.operate_orders`. La visibilidad de
  metadatos, `organization.manage_tables`, administrar catálogo o permisos de
  plataforma no habilitan pedidos ni hacen aparecer una pestaña vacía. La
  cuenta dueña de Mideli conserva su menú local; la mesera global mantiene los
  menús de la organización. Si quedó seleccionado un catálogo fuera del acceso
  actual, se limpia y se vuelve al primer menú autorizado. Los RPC de Supabase
  siguen siendo la autoridad para crear pedidos; no se cambiaron permisos ni
  datos remotos.
- Se agregaron pruebas para dueño local, mesera global y contextos solo
  administrativos o en borrador. Pasaron las seis pruebas de selección, lint y
  build. Desplegado a producción en `https://mideli.vercel.app`, deployment
  `dpl_9onrj5cGPyeSgPPAiHNbEzyXnT2E`, estado `READY`.
- Pasaron `npm run lint`, `npm run build` y el detector de layout. El navegador
  de revisión no tenía una sesión autenticada de Mesero y redirigió a login, así
  que la comprobación visual del estado autenticado queda pendiente. Cambio
  publicado en producción como `dpl_CbQhMUtUgqhBv9BR1VmMB3MZGYWK` (`READY`).

## 10. Verificación obligatoria

Al terminar cualquier cambio de código:

```bash
npm run lint
npm run build
```

Si se toca Supabase:

```bash
npx supabase migration list
npx supabase db push --linked --dry-run
```

Si hay un fallo, corregirlo antes de afirmar que la tarea está completa. Reportar claramente qué se verificó y qué quedó pendiente.

## 11. Regla de inicio para futuras tareas

Primero inspecciona el archivo afectado, sus consumidores y `git status`. Después resume el plan en español, implementa el cambio más pequeño que resuelva la necesidad, prueba el flujo principal y ejecuta las verificaciones obligatorias. Si la solicitud toca más de un módulo, divide el trabajo en pasos y conserva las decisiones de este documento.

## 12. Just Dipping: combos y archivo histórico (2026-09-26)

- La interfaz de Mesero muestra un selector compacto de menú en teléfonos y
  tablets; cambiar el catálogo no cambia el negocio operativo ni vacía la
  comanda. Al cambiar de negocio, las categorías vuelven al inicio y las
  tarjetas de producto son más bajas en pantallas pequeñas.
- Un combo nativo se cobra como una sola línea y un precio base. Sus partes
  fijas y opciones elegidas quedan como snapshots en carrito, cocina, ticket e
  inventario. El servidor valida productos, cantidades y recargos contra el
  catálogo del mismo negocio; no confía en precios enviados por el navegador.
- Una opción elegida en un grupo de combo se puede quitar volviendo a tocarla.
  En grupos obligatorios, el botón de agregar permanece deshabilitado hasta que
  se seleccione una opción; elegir otra sustituye la anterior.
- La regresión pasó sus 2 pruebas Playwright, `npm run lint` y `npm run build`.
  Producción quedó `READY` en `https://mideli.vercel.app`, deployment
  `dpl_A8Z73hKTwyYpE8h12xbiKqEpb8VV`.
- Pedidos, aperturas de caja y pagos pasarán a contadores de folio por negocio.
  La migración local `20260926120000_business_combos_and_folios.sql` conserva
  el mayor folio emitido por cada negocio y no renumera el historial existente.
- Los tickets del Firestore anterior se preparan en una tabla separada y de
  solo consulta. No cuentan en caja, ventas actuales ni analíticas. La
  importación permite solamente campos de ticket/artículos y descarta datos
  personales.
- La inspección de solo lectura encontró 7 categorías, 28 artículos, 3 combos
  y 1,138 tickets en Just Dipping. “Regular Box” coincide con el artículo ya
  sembrado en Supabase, pero debe mapearse explícitamente para no duplicarlo.
  “Promo Lunes” menciona cheesecake que no está guardado como componente; no
  activarla hasta que el dueño confirme la receta correcta.
- Supabase registra aplicadas las migraciones `20260926120000_business_combos_and_folios.sql`,
  `20260926123000_legacy_sales_archive.sql`, `20260927033000_combo_item_sale_policies.sql`
  y `20260927033100_import_just_dipping_catalog.sql`; Just Dipping figura activo.
  En la última lectura remota hay 5 categorías, 28 productos y 3 combos.
- La inspección previa de Firestore encontró 1,138 tickets históricos, pero la
  tabla `legacy_sales_tickets` de producción tiene 0 registros para Just Dipping.
  Por tanto, el catálogo está migrado y los tickets históricos no; no declarar
  completa la migración de ventas hasta importarlos y reconciliar sus totales.

## 13. Identidad visual por negocio (2026-09-26)

- El acceso compartido, el landing y la PWA identifican a Rincón 404 Food Park.
- Una cuenta con alcance global conserva esa identidad, incluso al cambiar el
  menú activo. Una cuenta de un único negocio puede ver su marca local en la
  operación; en una comanda que mezcla negocios, el selector identifica cada
  menú, pero no recolorea toda la comanda.
- Al crear o editar un negocio, la administración de plataforma puede cambiar
  el nombre visible, elegir una paleta sencilla o colores personalizados y
  subir o quitar su logo. El identificador interno no se mezcla con el nombre
  visible. El dueño y sus credenciales no se recrean al editar la marca.
- Los logos se convierten a WebP y se sirven desde un bucket público de sólo
  lectura; la escritura y eliminación pasan por una ruta de servidor que exige
  una membresía y permiso vigentes de administración de plataforma y registra
  auditoría. No se permite subirlos directamente desde el cliente a Storage.
- Mideli conserva su rosa/dorado y WhatsApp sigue siendo exclusivo de Mideli.
  Just Dipping parte de amarillo; los demás negocios nuevos usan una identidad
  neutra editable. La identidad no cambia la autorización ni el negocio al que
  pertenecen pedidos, inventario, caja o ventas.
- La migración `20260927063115_business_branding_and_assets.sql` se aplicó y se
  verificó en producción. La interfaz pasó lint/build y el landing/login se
  revisó con Playwright en escritorio, tablet y teléfono; falta una prueba
  autenticada de la gestión de negocios porque la sesión de revisión no tiene
  credenciales.

## 14. Consola de plataforma (2026-09-27)

- Un usuario con `platform.manage_businesses` se redirige desde el layout de
  `/dashboard` a `/settings/negocios` antes de montar la navegación operativa;
  no debe ver primero Mesero, menús ni otros módulos del restaurante.
- La consola separa las secciones Negocios y Personal global en navegación
  propia. La tarjeta del local resume cuántas áreas tiene habilitadas su dueño;
  el detalle de permisos se consulta al configurar ese negocio.
- La creación/separación de una cuenta de plataforma está aislada bajo
  Seguridad de plataforma. Estos cambios son de presentación y encaminamiento;
  no modifican datos, credenciales, permisos ni el flujo de creación de negocios.

## 15. Licencias independientes y verificación de producción (2026-09-27)

- La licencia comercial es por negocio. Rincón 404 es la única cuenta con
  `platform.manage_business_licenses`; en meseras globales, los menús
  autorizados sin licencia quedan deshabilitados sin mostrar deuda, fechas ni
  motivos internos.
- Las migraciones `20260927090929`, `20260927090931`, `20260927090934`,
  `20260927091600` y `20260927091700` se aplicaron en Supabase de producción.
  Mideli y Just Dipping siguen activos, cada uno con licencia activa hasta el
  2026-10-01 en su fecha local y un evento de auditoría inicial. Hay un único
  administrador de licencias, 29 guards de escritura por negocio, 33 políticas
  de lectura y ningún trigger del guard global antiguo.
- El webhook, el runtime, el scheduler y todos los envíos salientes de
  WhatsApp comprueban la licencia de Mideli. Cuando no está disponible, Meta
  recibe confirmación técnica del webhook válido, pero el bot no procesa ni
  contesta al cliente, no deriva atención humana ni libera tareas atrasadas.
  No se envió un mensaje de prueba real a clientes durante la verificación.
- El linter remoto encontró una ambigüedad real en la RPC de alta de personal
  local; se corrigió en `20260927091700_fix_business_staff_membership_ambiguity.sql`.
  Los errores que permanecen en `db lint` son referencias estáticas a tablas
  temporales creadas dentro de `create_multibusiness_table_orders` y
  `create_business_order_with_items`, patrón que el analizador no resuelve, y
  advertencias de inmutabilidad/variables no utilizadas. La ambigüedad nueva
  de `get_platform_business_license_events` también se corrigió con una
  migración forward-only.
- Pasaron lint, build y 558 pruebas E2E: 186 escritorio, 186 tablet y 186
  móvil. Vercel producción está `READY` en `https://mideli.vercel.app`,
  deployment `dpl_BCQoEKpMnYSuK7Qren9aXtVuhWvz`. No se cambió ninguna fecha de
  licencia ni dato operativo para simular expiración.

### Rendimiento de RLS de licencias (2026-09-27)

- Se confirmó que la consulta del catálogo de `menu_items` evaluaba la política
  de licencia por fila y volvía a recorrer `pg_timezone_names`. En producción,
  el SELECT autenticado de los dos menús tardó 6.55 s para 81 productos.
- La migración `20260927110859_optimize_business_license_rls_timezone.sql`
  valida la zona horaria al insertar o editar un negocio y usa el valor ya
  validado en las lecturas de vigencia. No modificó pedidos, fechas ni estados
  de licencias. El mismo SELECT autenticado bajó a 68.6 ms; 81 evaluaciones del
  guard de lectura de licencia tardaron 36.5 ms.
- `fetchActiveOrders` solo usa la selección antigua cuando la respuesta indica
  que falta una columna de metadatos nueva (`42703` o `PGRST204`). Un timeout
  `57014` ya no dispara otra consulta duplicada.
- Migración aplicada y `npx supabase db push --linked --dry-run` confirmó la
  base alineada. Pasaron `npm run lint` y `npm run build`. Desplegado a
  producción en `https://mideli.vercel.app`, deployment
  `dpl_4Lv4YbzEtY2iQxPocbS16pLSrhXp`, estado `READY`.

### PIN de autorización del dueño local (2026-09-27)

- En la sección Personal de un negocio, se muestra la membresía `business_owner`
  únicamente al mismo dueño autenticado. Esa fila permite configurar su propio
  PIN de autorización, pero no editar ni desactivar la cuenta desde Personal.
- La acción de PIN valida la membresía activa del dueño dentro del negocio y la
  organización seleccionados antes de invocar la RPC existente. Supabase guarda
  un hash del PIN; no se solicita ni se guarda durante la creación del negocio.
- El alta del negocio indica al administrador que el dueño configura su PIN
  privado después de iniciar sesión, desde Personal.
- La regresión tiene pruebas para mostrar el dueño solo a sí mismo y conservar
  la lista de personal local. Sin cambios de esquema ni datos remotos.
- Pasaron ESLint, build y seis pruebas de regresión en escritorio, tablet y
  teléfono. Desplegado en producción como `dpl_5r5k1sXiHJcxrAzNFSi5y5xafSi5`,
  estado `READY`, con alias `https://mideli.vercel.app`.

## 16. Sesión persistente y recuperación de comanda (2026-09-27)

- Supabase ya conserva la sesión en el navegador (`persistSession: true`); el
  almacenamiento SSR de `@supabase/ssr` usa una cookie persistente de hasta 400
  días por defecto. Cerrar y volver a abrir la app no debe cerrar la sesión.
  La cuenta aún puede requerir acceso de nuevo si se cierra sesión, se desactiva
  el perfil o la configuración remota de Auth invalida su sesión.
- Si una cuenta autenticada no tiene permiso para una sección, el proxy la
  envía a otra vista permitida o a `/dashboard/sin-acceso`; no termina la sesión
  solo por intentar abrir una función sin permiso. Un perfil inexistente o
  desactivado sí cierra la sesión por seguridad.
- La comanda manual en Mesero se guarda localmente por ID de usuario: productos,
  negocio de cada línea, cantidades, modificadores, notas, tipo de pedido, mesa
  y programación. No se guardan nombre, teléfono, domicilio, ubicación ni pago.
  Al restaurar un pedido a domicilio, hay que volver a capturar y confirmar esos
  datos. Vaciar la comanda o enviarla correctamente borra el borrador.
- Los borradores se quedan en el navegador hasta vaciarlos o enviar el pedido;
  no tienen vencimiento automático. Una comanda importada de WhatsApp o una
  orden existente que se está editando no reemplaza el borrador manual guardado.

## 17. Visibilidad del catálogo para meseras globales (2026-09-27)

- La migración de rangos por negocio cambió los permisos de pedidos/cobros de
  alcance organizacional a capacidades específicas por negocio. El contexto
  del selector ya permitía Just Dipping, pero la función de seguridad que filtra
  `categories` y `menu_items` sólo reconocía los permisos organizacionales
  antiguos; por eso el menú aparecía vacío.
- `20260928035510_fix_global_waiter_catalog_rls.sql` alinea la regla de lectura:
  acepta el permiso de coordinación global o un permiso activo
  `business.operate_orders` / `business.charge_orders` asignado al mismo
  negocio. Conserva la restricción del negocio solicitado y no reactiva accesos
  generales a toda la organización.
- Migración aplicada en Supabase producción. La comprobación autenticada simulada
  confirmó que una mesera global con permiso para Just Dipping puede pasar la
  regla RLS, y que el dueño local de Mideli continúa sin acceso al catálogo de
  Just Dipping. Los asesores de seguridad y rendimiento no reportaron errores.
- Pasaron `npm run lint` y `npm run build`. La prueba pgTAP local no pudo correr
  porque no hay una base Supabase local escuchando en este equipo; queda como
  regresión automatizada para el próximo entorno local disponible.

## 18. Alcance de Historial y Estado para meseras globales (2026-09-27)

- Historial y Estado ahora consultan todos los negocios activos de la misma
  organización donde la persona tenga `business.operate_orders`,
  `business.charge_orders` o `business.update_preparation`, y cuya licencia
  esté disponible. El negocio seleccionado en la navegación ya no reduce ese
  alcance por accidente.
- Crear pedidos conserva un permiso más estricto: solo negocios con
  `business.operate_orders` (o el alcance organizacional equivalente) forman
  parte del alcance de creación. El filtro visible solo ofrece los negocios
  realmente autorizados y con licencia vigente.
- Borrar pedidos del historial ya no depende del rol genérico del perfil: en
  el modelo multinegocio solo puede hacerlo la persona con membresía
  `business_owner` y permiso de lectura de pedidos para ese negocio. En el
  modo anterior de un solo negocio se conserva el acceso de `owner`/`admin` y
  se resuelve primero el pedido mediante RLS antes de usar el cliente de
  servicio.
- El archivo histórico de Just Dipping solo puede consultarse desde Historial
  cuando hay permiso de pedidos y la licencia del negocio está disponible. La
  corrección de visibilidad no importa los tickets históricos que aún no están
  en Supabase.
- `npx supabase migration list --linked` confirmó que las migraciones locales y
  remotas están alineadas; no se necesitó cambiar el esquema. Pasaron lint,
  build y las 12 pruebas de selección/permisos en Playwright. Producción quedó
  `READY` en `https://mideli.vercel.app`, deployment
  `dpl_4wbZwBYZ1T3T3Ni3J4jBGZYYucZt`.

## 19. Acceso de Rincón 404 (2026-09-27)

- `/` y `/login` comparten una pantalla de acceso directa para no interponer un
  botón antes del formulario. Se conserva Supabase Auth, el usuario sin sufijo
  visible, la contraseña y el destino seguro `next` de `/login`.
- Por decisión del dueño, la pantalla se simplificó a la marca textual
  `Rincón 404 Food Park`, el encabezado `Iniciar sesión`, los campos Usuario y
  Contraseña y la acción principal. Se retiraron eslogan, ilustración, textos
  explicativos, pie promocional y ejemplos de los campos; no cambian el flujo
  de autenticación ni el destino por cuenta.
- El diseño conserva controles accesibles, mostrar/ocultar contraseña, errores
  de acceso y estado de espera. Se mantiene adaptable a escritorio y móvil y
  no abre el teclado automáticamente.
- `npm run lint` y `npm run build` pasaron. La inspección manual con Playwright
  revisó `/` y `/login` en escritorio y móvil, sin desbordamiento ni errores de
  consola; el detector visual no encontró hallazgos.
- Desplegado a producción en `https://mideli.vercel.app`, deployment
  `dpl_4MGLLAigAngXPvTyaX6XofMwY1W8`, estado `READY`.

## 20. Borrado seguro de pedidos (2026-09-28)

- El guard de licencias valida la orden principal antes de borrarla. Durante
  `ON DELETE CASCADE`, los artículos y estados hijos ya no pueden resolver el
  negocio desde la orden eliminada; el guard permite ese borrado hijo sólo
  cuando ocurre dentro de una cascada anidada. Los borrados directos conservan
  su validación de licencia.
- El servidor vuelve a verificar el negocio permitido por la membresía del
  dueño y ejecuta pagos relacionados más orden en una sola RPC transaccional.
  Bloquea pedidos, asignaciones, pagos y cortes sin esperar a otra operación;
  si hay un cobro/cierre concurrente, pide reintentar sin cambios parciales.
  Rechaza pagos compartidos o pertenecientes a un corte cerrado.
- La licencia de Just Dipping estaba activa al investigar. La corrección no
  toca datos reales de pedidos ni caja. La revisión agregada encontró cero
  pedidos pagados en Just Dipping y cero órdenes pagadas sin asignación de pago.
- Las migraciones `20260928070125` y `20260928070741` quedaron aplicadas y
  sincronizadas en Supabase. La comprobación remota confirmó que el RPC sólo
  puede ser ejecutado por `service_role`, rechaza accesos `authenticated` y
  maneja sin escritura un identificador de pedido inexistente. El asesor de
  seguridad no señaló el nuevo RPC; quedan 27 avisos existentes no relacionados.
- Pasaron `npm run lint` y `npm run build`. Producción quedó `READY` en
  `https://mideli.vercel.app`, deployment `dpl_4npvJMc9GiwaeGpWYzouMbsqyx67`.

## 21. Operación de pedidos por meseras globales (2026-09-28; regla refinada en §50)

- Regla histórica refinada por §50: una membresía `global_waiter` con alcance
  `organization` ve pedidos de comedor en los negocios de la organización sin
  acceso de pedidos asignado; al tener permiso operativo explícito por negocio,
  conserva los tres tipos de servicio allí. El equipo local mantiene su flujo.
  La regla usa membresías/capacidades, sin IDs ni excepciones por nombre.
- Los artículos de pedidos activos cargan el nombre mediante la relación con
  `menu_items`, como ya hacía Historial. Al editar, se carga el catálogo del
  negocio de esa orden. Si se quita el último producto, la aplicación muestra
  por qué no puede guardar una orden vacía y ofrece cancelarla desde Estado.
- La mesera puede cancelar pedidos sin pagos y conservarlos como cancelados en
  Historial. La actualización usa el RPC de estado con alcance por negocio; el
  borrado permanente sigue reservado al dueño para proteger la auditoría. Los
  pedidos con pagos requieren corregir/anular el cobro primero.
- Este cambio reutiliza permisos, RPC y disparadores existentes, sin migración
  nueva ni escrituras sobre pedidos reales. Pasaron lint, build y las 13 pruebas
  Playwright de selección/contexto de negocio. Pendiente: validar el flujo con
  una sesión real de mesera en producción después del despliegue.
- Producción quedó `READY` en `https://mideli.vercel.app`, deployment
  `dpl_7WesveH3qYkfvNhK53QHCScQBk4E`.

## 22. Permiso de preparación para cocina (2026-09-28)

- Andrea veía las acciones de preparación por una condición invertida en Estado:
  mostraba el botón al tener `business.operate_orders` y no tener
  `business.update_preparation`. El guard de Supabase también aceptaba el
  permiso general de pedidos para pasar a `in_kitchen` o `ready`.
- Estado ahora exige el permiso explícito `business.update_preparation`, igual
  que el guard del servidor. Los rangos Mesero y Mesera global pueden seguir
  creando/cobrando según sus permisos, pero no mover estados de cocina. Cocina,
  Supervisor y dueño conservan esa función cuando su contexto les da el permiso.
- La migración `20260928074300_require_preparation_capability_for_kitchen_status.sql`
  se aplicó a Supabase producción; no modifica filas de pedidos. La consulta
  remota confirmó que la rama de preparación exige únicamente el permiso de
  preparación, y las migraciones local/remoto quedaron sincronizadas.
- Pasaron lint, build y las 14 pruebas Playwright de contexto/permisos. La
  consulta de autorización remota pasó; falta la comprobación visual de Andrea
  desde su dispositivo después de actualizar la PWA.
- Producción quedó `READY` en `https://mideli.vercel.app`, deployment
  `dpl_HrJrhKdxSZQTCsAVeUuwLbUijxRA`.

## 23. Caja por negocio para meseras globales (2026-09-28)

- La vista de Mesero deriva los negocios de caja desde los permisos efectivos
  del contexto multinegocio, sin confundir el menú seleccionado con el negocio
  operativo de caja. Andrea conserva acceso de apertura y cierre en Mideli,
  pero no obtiene acceso a caja de Just Dipping por ser mesera global.
- Si sólo hay un negocio autorizado, Caja lo selecciona automáticamente; si
  hay varios, permite elegirlo. Consultas, aperturas, autorizaciones,
  movimientos, cierres y realtime usan el `business_id` explícito.
- La transición de negocio limpia sincrónicamente el turno anterior para no
  mostrar ni reutilizar temporalmente la caja de otro local. Se reutilizan los
  RPCs y permisos actuales; no hubo cambios ni migración de base de datos.

## 24. Creación atómica de pedidos POS individuales (2026-09-29)

- El POS ya no crea primero un pedido de negocio y luego guarda domicilio,
  cliente o programación en otra petición. Para pedidos de un solo negocio usa
  `create_business_order_with_details`: llama a la creación canónica y guarda
  esos datos dentro de la misma transacción. Si el segundo paso falla, la
  creación completa se revierte.
- La función es `SECURITY INVOKER`, conserva el guard de negocio y catálogo del
  RPC existente, usa RLS para actualizar el pedido y sólo se concede a
  `authenticated`. Los reintentos con la misma clave devuelven el pedido
  existente sin sobrescribir cambios posteriores.
- Los clientes antiguos pueden seguir usando el RPC anterior. La ruta legacy
  sin contexto multinegocio aún usa dos peticiones y debe revisarse por
  separado antes de considerarla atómica. La clave de idempotencia del POS
  todavía vive en memoria y no sobrevive al cierre de la aplicación.
- Migración `20260930061500_atomic_pos_order_details.sql` aplicada en Supabase.
  Se validó el SQL en una transacción revertida, los permisos en remoto,
  `npm run lint`, `npm run build` y la salud pública tras el despliegue.
  No había una caja abierta para probar la creación de un pedido real sin
  intervenir la operación; esa verificación autenticada sigue pendiente.

## 25. Recuperación de envíos POS interrumpidos (2026-09-30)

- Mesero guarda un UUID aleatorio del intento junto al borrador antes de llamar
  al RPC. La clave se reutiliza si el cliente pierde la respuesta; sólo se
  limpia al recuperar la orden o confirmar un envío exitoso. Un error SQL o de
  red no autoriza a crear otra clave.
- Al volver a Mesero se consulta el pedido o lote mediante Server Action con
  sesión normal, perfil activo, capacidades de lectura, licencia vigente,
  creador y organización. Para comandas mixtas exige que aparezcan todos los
  negocios esperados. Los errores o resultados parciales conservan la clave y
  bloquean el reenvío hasta volver a comprobar.
- Si la orden aparece, Estado/Historial se refresca y el borrador se limpia sin
  toast adicional. Mientras el resultado esté pendiente se bloquean cambios a
  productos, tipo, mesa y notas; datos personales y de domicilio se vuelven a
  ingresar si hacen falta y nunca se persisten en el navegador.
- WhatsApp queda sin cambios. No se usa `service_role`, no hubo migración ni
  cambios a datos remotos. Esta sección actualiza el punto de §24 que indicaba
  que la clave de idempotencia sólo vivía en memoria.
- Verificación: lint/build locales pasan; 144 pruebas Playwright operativas
  pasan en escritorio, tablet y teléfono; GitHub `Verify Mideli` pasó,
  incluido el gate PostgreSQL/pgTAP aislado. Deploy de producción
  `dpl_7sfNkHrETwaCvzPCXi694GxUiiGD` quedó `READY`; `/api/health` respondió
  `ok` con versión `4d0c05b9a18b`.
- No se creó ni alteró una venta real para simular la recuperación. La primera
  recuperación con pedido auténtico se observará durante el uso normal.

## 26. Rendimiento de consultas y autorización (2026-10-01)

- En los logs agregados de Supabase de las últimas 24 horas UTC, `GET /orders`
  registró 1,464 solicitudes, p95 de 321 ms y máximo de 3,965 ms, sin HTTP 5xx.
  `GET /channel_conversations` registró 2,791 solicitudes, p95 de 516 ms y
  máximo de 6,077 ms, también sin HTTP 5xx. No se encontraron eventos SQLSTATE
  `57014` registrados en Postgres durante esa ventana; esto no descarta errores
  más antiguos ni fallos no registrados.
- `pg_stat_statements` conserva estadísticas desde el 2026-07-21, por lo que
  sus máximos de varios segundos son históricos y no bastan para atribuir la
  lentitud actual a una consulta concreta. El asesor de Supabase reporta varios
  avisos de índices y RLS; no se agregó ni eliminó ningún índice por esos avisos
  sin evidencia de un plan de ejecución actual.
- En `src/proxy.ts`, después de validar que el perfil está activo, la consulta
  del contexto multinegocio y la disponibilidad de licencias ahora se ejecutan
  concurrentemente. Son lecturas independientes; se conservan los mismos
  resultados requeridos para autorizar cada pantalla. No se cambia el esquema ni
  datos operativos.
- La usuaria confirmó que ahora se percibe más rápido el cambio repetido entre
  los menús de los negocios en producción.

## 27. Cambio rápido entre menús de negocios (2026-10-01)

- El selector sólo conservaba la última carta cargada. Además, una sola promesa
  compartida hacía esperar a una carga de otro negocio antes de iniciar la
  siguiente. Por eso volver a un menú ya visitado podía repetir dos lecturas de
  red y esperar innecesariamente.
- Los catálogos autorizados ahora se guardan sólo en memoria por negocio durante
  30 segundos, con límite de 12 negocios. Cada selección vuelve a comprobar el
  contexto/licencia antes de usar la caché. Se invalida al recibir cambios de
  catálogo, forzar actualización o guardar cambios del menú; las respuestas
  tardías no pueden reemplazar el negocio seleccionado más recientemente.
- La caché no se persiste en navegador ni incluye datos de clientes/pedidos.
  No hay cambios de esquema ni escrituras en ventas. Playwright cubre separación
  por negocio, expiración e invalidación; la usuaria confirmó que ahora se
  percibe más rápido el regreso entre menús en producción.

## 28. Historial sin topes de 500 pedidos y 1,000 tickets (2026-10-01)

- Historial reemplaza los topes fijos por páginas de 100 pedidos y 100 tickets
  históricos. Usa un cursor compuesto por fecha e ID, orden estable en ambas
  columnas y lectura de una fila extra para saber si hay otra página; evita
  desplazamientos que podrían duplicar o saltar registros al entrar pedidos.
- «Cargar más historial» aparece junto a pedidos y después del archivo. Continúa
  por cada fuente solo si le quedan filas. Buscar y filtrar siguen operando sobre
  lo cargado; contadores y avisos de cobro aclaran ese alcance.
- Cada página vuelve a autenticar y resolver negocios/licencias. Se mantienen
  filtros de fecha, RLS y separación de tickets históricos; no hay migración,
  escritura de ventas ni cambio de permisos.
- Una consulta agregada de solo lectura en Supabase el 2026-10-01 encontró 267
  pedidos operativos y cero filas en `legacy_sales_tickets`. La paginación no
  importa los 1,138 tickets Firestore: esa migración continúa pendiente.
- Se agregaron pruebas de límite de página, cursores empatados por timestamp y
  validación de entrada; Playwright y aislamiento entre negocios pasan en
  desktop, tablet y móvil. El workflow de GitHub ejecuta la prueba nueva.
- Verificación: `npm run lint`, `npm run build` y 63 pruebas Playwright pasan
  localmente en desktop, tablet y móvil. GitHub `Verify Mideli` (run 54)
  concluyó `success`, incluidos build, regresiones operativas y gate aislado de
  Supabase. Producción `dpl_Aip9ma2frH8uZVS2Mzb5wgEBWtrV` quedó `READY`, alias
  `mideli.vercel.app`; `/api/health` respondió HTTP 200, versión `fa7f5f3865cc`.
- No se alteraron pedidos ni tickets y no se probó el botón con una sesión de
  empleado real. El archivo histórico sigue pendiente de importar desde
  Firebase.

## 29. Clientes e impresión de tickets por negocio (2026-10-01)

- Se ocultó la central de WhatsApp en la navegación y `/dashboard/whatsapp`
  redirige al inicio según el permiso actual. El bot, los webhooks y los
  programadores siguen activos; no se migró ni apagó ninguna automatización.
- `business_customers`, `business_customer_addresses` y
  `business_receipt_settings` separan directorios y formatos por negocio. Las
  acciones de servidor verifican sesión, perfil, negocio, licencia y capacidad;
  las tablas no dan lectura directa a `authenticated` ni `anon`. Los pedidos
  mixtos guardan un cliente por negocio.
- Se copiaron 1 cliente y 5 domicilios del directorio legado de WhatsApp a
  Mideli, sin duplicados ni cambios a los datos originales. No había pedidos
  ligados al ID legado de cliente para completar su historial.
- Historial prepara un ticket por pedido con logo/marca, dirección del negocio,
  teléfono, pie y ancho 48/58 mm; incluye líneas, modificadores, notas,
  subtotal, descuento, productos, envío, total del cliente, importe cobrado,
  saldo y método de pago. Se usa el diálogo de impresión del dispositivo, no
  una conexión Bluetooth directa.
- Migraciones aplicadas: `20261002042252_business_customers_and_receipt_printing`,
  `20261002051941_business_customer_history_backfill` y
  `20261002053959_customer_rpc_invoker_security`. El RPC de comanda mixta usa
  permisos del invocador y RLS; la verificación remota confirmó que solo
  `authenticated` puede ejecutarlo.
- Verificación final: `npm run lint` y `npm run build` correctos; 69 pruebas
  Playwright de contexto multinegocio, paginación de Historial y cálculos del
  ticket pasan en escritorio, tablet y móvil. El SQL pgTAP no se pudo ejecutar
  localmente porque este entorno no tiene Docker. En Supabase se verificaron
  esquema, RLS, privilegios y backfill mediante consultas agregadas; el dry-run
  final no reportó migraciones pendientes.
- El asesor de Supabase marca como informativa la falta de políticas RLS en las
  tablas nuevas. Es intencional: no se concedió acceso API a usuarios finales;
  las acciones autorizadas usan el rol del servidor.
- Producción `READY`: deployment `dpl_2TtdYDaDNRgeysWyk4vfbr8JKeFC`, alias
  `https://mideli.vercel.app`. `/api/health` respondió `ok`, versión
  `2b11bea0a00f` (2026-10-02 UTC).
- Falta la prueba con impresora física: identificar el modelo y ajustar el
  ancho en el diálogo del dispositivo. En iPad requiere AirPrint en la misma
  red; la app no empareja Bluetooth directamente.

### Mejora de Clientes para captura rápida de domicilio (2026-10-01)

- La ficha de cada cliente muestra por defecto resúmenes compactos y desplegables
  de sus domicilios guardados y sus pedidos recientes. Al desplegar, presenta
  colonia, referencia, última utilización, destino y estados de pago/operación.
- Los pedidos recientes descuentan descuentos de transacciones completadas; en
  domicilio suman el envío al total mostrado al cliente. Comedor y para llevar
  conservan el total de productos ya descontado.
- En captura de domicilio, el teléfono es opcional. Desde cuatro dígitos aparece
  la búsqueda de clientes del negocio actual. Al seleccionar uno, se completan
  nombre y teléfono y se aplica automáticamente su domicilio principal; si no
  existe, se usa el más reciente. La colonia, referencia y cotización guardadas
  también se cargan, pero una dirección no confirmada por Maps vuelve a pedir
  confirmación antes del envío.
- Un selector permite cambiar a otra dirección guardada o escribir una nueva.
  La dirección escrita se guarda en el cliente al enviar correctamente el pedido.
  En Clientes se pueden agregar domicilios con colonia/fraccionamiento obligatorio
  y eliminar uno con confirmación. Si se borra el principal, se intenta promover
  el domicilio restante más usado recientemente; los pedidos anteriores conservan
  su snapshot de dirección.
- Los resultados de búsqueda del POS quedan asociados al negocio y teléfono de
  la consulta vigente para evitar mostrar resultados viejos al cambiar menú.
- No requirió una migración nueva. El estado remoto confirmó las tres migraciones
  existentes de clientes/recibos y el esquema de domicilios requerido. No se
  consultaron ni modificaron registros reales de clientes.
- Verificación local: lint, build y 666 pruebas Playwright pasaron en los
  proyectos de escritorio, tablet y móvil. Desplegado a producción por Vercel
  el 2026-10-01; despliegue `dpl_HdzAdPyQsUjqTS9M1qX6YF1Rj2Cm` quedó `READY`
  y asociado a `https://mideli.vercel.app`. Se publicó desde el árbol de trabajo
  vía CLI, sin commit/push; GitHub no contiene necesariamente estos cambios.

## 30. Recuperación y validación de domicilios de Google Maps (2026-10-02)

- En Mesero, la dirección y la colonia explícita viajan juntas a la cotización.
  Si el personal escribe `Col. ...` o `Fracc. ...` en el mismo campo, el sistema
  conserva ese dato cuando Geocoding omite la colonia; una dirección de cliente
  guardada también puede aportar su colonia. No se infiere colonia de segmentos
  ambiguos.
- Si la respuesta inicial trae calle y punto, pero no la colonia, se intenta
  primero geocodificación inversa y luego una búsqueda de texto de Places; esta
  última sólo se usa en el caso de colonia faltante y se valida contra ciudad,
  calle y número antes de aceptar el dato.
- Se pueden procesar coordenadas decimales, enlaces de Maps con `query`, `@lat,lng`
  o `!3d...!4d...`, y enlaces cortos `maps.app.goo.gl`/`goo.gl/maps`. La expansión
  de enlaces cortos sólo visita dominios HTTPS allowlist de Google, bloquea otros
  destinos y limita redirecciones/tiempo. No se consulta una URL arbitraria.
- Los resultados de Autocomplete se validan al confirmar: localidad Cajeme,
  coordenadas válidas y, para domicilios numerados, coincidencia exacta de
  calle y número exterior. Las calles numeradas no confunden el número de calle
  con el exterior. Cambiar el texto o cliente invalida la cotización anterior; una
  respuesta tardía no reemplaza un domicilio nuevo. Los errores de red/API ya
  no dejan el control de cotización cargando indefinidamente.
- El autocomplete ahora consulta sólo el origen necesario en vez de cargar
  horarios, tarifas y recargos en cada búsqueda. Cotizar desde Mesero no depende
  del interruptor de cotizaciones del bot WhatsApp; conserva el motor de precios
  existente y autoriza el negocio/licencia/capacidad real del operador.
- Revisión remota de solo lectura (2026-10-02): Maps tiene origen configurado,
  13 tarifas por distancia y 8 recargos activos; la cotización del canal legado
  aparece habilitada. No se modificaron tablas ni datos.
- Límite conocido: Google no garantiza que `address_components` siempre incluya
  colonia, y una zona privada/nueva puede seguir sin resultados. Mesero permite
  agregarla como `Col.` o `Fracc.` en el mismo campo; si no hay colonia oficial,
  ofrece bajo confirmación una tarifa por distancia sin recargo de colonia. No
  inventa una colonia ni asigna el recargo silenciosamente. Los ajustes de origen,
  tarifas y recargos aún son globales/legacy de WhatsApp, no por negocio; esta
  revisión no los migró a configuración independiente por local.
- Corrección posterior al despliegue: Google puede incluir un municipio o
  demarcación de nivel administrativo junto a la colonia en la dirección
  formateada. La extracción ahora prefiere `neighborhood` y segmentos de colonia
  antes de niveles administrativos amplios, por lo que
  `Av. Miguel Alemán 162, Centro, Fundo Legal, ...` conserva `Centro` como
  colonia. Hay una prueba de regresión con esa respuesta y otra que conserva
  Puente Real cuando Google solo proporciona ese segmento.
- Si Maps confirma el punto pero no identifica una colonia oficial, Mesero
  muestra una opción explícita para cotizar con tarifa por distancia y sin
  recargo de colonia. Esta decisión no es automática: se aclara antes de
  confirmar y el pedido/ticket conserva “Sin colonia registrada”. El cálculo
  omite cualquier recargo que pudiera coincidir con palabras ambiguas de la
  dirección. La excepción solo está disponible en captura manual de Mesero;
  WhatsApp conserva su política estricta. No cambia el esquema ni los datos
  existentes.
- Verificación local previa a publicación: `npm run lint`, `npm run build` y las
  687 pruebas Playwright completas en escritorio, tablet y móvil pasan. El
  `db push --linked --dry-run` confirmó que Supabase estaba al día; no se
  aplicaron migraciones.
- Publicado a producción el 2026-10-02 vía Vercel CLI desde el árbol de trabajo
  revisado (sin commit/push), incluyendo la corrección de prioridad de colonia:
  deployment `dpl_6agLeyYZ6MPvjXkMJFbkoGkoFLqV`,
  estado `READY`, alias `https://mideli.vercel.app`. `/api/health` respondió
  HTTP 200 y `ok`, versión `2b11bea0a00f`.
- Actualización posterior del flujo manual de Mesero (2026-10-02): cuando Maps
  ubica el punto pero no conoce la colonia, permite optar por la tarifa de
  distancia sin recargo de colonia. La elección se confirma explícitamente y
  deja el indicador “Sin colonia registrada” en el pedido y ticket. WhatsApp
  mantiene la validación estricta. `npm run lint`, `npm run build` y las 60
  pruebas dirigidas en escritorio, tablet y móvil pasan. Publicado a producción
  vía Vercel CLI desde el árbol de trabajo (sin commit/push), deployment
  `dpl_BsHRVs2T9iVny9P5iX8jdy1eEtMn`, estado `READY`, alias
  `https://mideli.vercel.app`. No se modificaron el esquema ni datos de Supabase.

## 31. Reintento visible de una comanda POS (2026-10-02)

- Cuando la comprobación autenticada confirma que la clave de envío no existe
  todavía en pedidos, el botón `Completar envío` abre directamente los datos de
  la comanda para corregir lo que falte y volver a enviarla. Conserva productos,
  clave idempotente y protecciones para evitar duplicados; no crea un pedido al
  abrir el formulario.
- Si la comprobación no está disponible, se mantiene `Revisar envío` y no se
  permite enviar mientras no haya certeza. No se cambió ninguna función de
  creación, permiso, tabla ni dato real de Supabase.
- La prueba del flujo de recuperación pasa en escritorio, tablet y móvil;
  `npm run lint` y `npm run build` pasan. Publicado a producción con Vercel CLI,
  deployment `dpl_E9SJeAordaGLnGH8ZDzCWSUcfd5H`, estado `READY`, alias
  `https://mideli.vercel.app`; `/api/health` respondió HTTP 200 y `ok`.

## 32. Actualización táctil sin controles de recarga (2026-10-02)

- Se quitaron los botones normales de actualización en Historial, Cocina,
  personal, clientes, negocios, licencias, inventario, caja, equipos y estación
  de impresión. Historial conserva el título pero ya no ocupa una tarjeta alta
  con un botón de recarga.
- En esas superficies se puede deslizar hacia abajo desde el inicio del área
  desplazable para volver a cargar sus datos. El gesto requiere un arrastre
  vertical de 72 px; no actualiza si comienza a media lista, es horizontal o
  empieza en un campo/control. No hay instrucción ni control visual permanente.
- Cada pantalla llama únicamente su carga existente; no hace una recarga global,
  no cierra sesión y no altera el carrito ni el pedido en curso. Los botones de
  reintento que solo aparecen después de un error se conservan.
- La lógica compartida está en `src/lib/hooks/use-pull-to-refresh.ts`. No hubo
  cambios de esquema, permisos, consultas de negocio ni datos operativos.
- Pruebas del umbral, dirección y posición inicial pasan en escritorio, tablet
  y móvil; `npm run lint` y `npm run build` pasan. Publicado a producción el
  2026-10-02 por Vercel CLI: `dpl_4wjLsW2VkLDSwN1gqAmQ7FnPqEWp`, estado
  `READY`, alias `https://mideli.vercel.app`. `/api/health` respondió HTTP 200,
  versión `2b11bea0a00f`. La prueba del gesto en el hardware físico del local
  queda pendiente.

## 33. Fallo de envío POS por tipo de pago (2026-10-02)

- Los registros de producción confirmaron HTTP 400 / SQLSTATE `42804` en
  `create_business_order_with_details`: el `CASE` que asigna
  `payment_method_requested` mezclaba el enum `public.payment_method` con el
  texto proveniente de JSON. Esto rechazaba los pedidos de un solo negocio que
  pasan por ese RPC, incluso si no se seleccionaba domicilio. El flujo de
  comanda mixta de comedor usa otro RPC.
- La migración `20261002233708_fix_pos_order_payment_method_enum_cast.sql` ya se
  aplicó a Supabase producción. Convierte explícitamente el valor recibido al
  enum antes de la asignación y conserva seguridad `INVOKER`, permisos,
  idempotencia y escritura atómica. No altera tablas ni pedidos existentes.
  Es una corrección forward-only: restaurar el cuerpo anterior reintroduciría
  el fallo, así que cualquier reversión futura debe ser otra migración segura.
- La verificación remota confirmó que el RPC sigue disponible solo para
  `authenticated`, conserva sus guardas y reintentos, y que el `CASE` resuelve
  al tipo `payment_method`. No se insertó un pedido real de prueba. La prueba
  pgTAP del esquema se amplió con esta regresión, pero no pudo ejecutarse desde
  la sesión MCP porque pgTAP no está expuesto allí (`plan(integer)` no existe);
  los mismos puntos se comprobaron con consultas remotas de solo lectura.
- `npm run lint`, `npm run build` y las 33 pruebas del borrador/reintento POS
  pasan en los proyectos desktop, tablet y mobile. La salud pública sigue en
  HTTP 200. No se hizo deploy web porque no hubo cambios de frontend y el árbol
  local contiene otros cambios pendientes; la corrección del backend ya está
  activa sin publicar esos cambios.

## 34. Preparación desde Estado sin estación Cocina (2026-10-03)

- `business.update_preparation` autoriza `Pendiente → Preparando → Listo` desde
  Mesero · Estado. `business.access_kitchen` controla por separado la estación
  `/dashboard/cocina`. Abrir el KDS no implica poder modificar estados; se
  necesita el permiso de preparación además.
- Los negocios nuevos reciben preparación desde Estado para el dueño, pero la
  pantalla Cocina queda desactivada por defecto. La puede habilitar Rincón 404
  y luego el dueño puede delegarla a rangos locales. El rango integrado Cocina
  en negocios nuevos actualiza estados desde Estado sin abrir el KDS.
- Una migración de compatibilidad preserva KDS para los permisos explícitos
  existentes de negocios distintos de Just Dipping. Just Dipping conserva el
  flujo sin KDS y su dueño activo recibe únicamente `business.update_preparation`;
  la mesera global no recibe permiso de preparación automáticamente.
- El frontend separa el acceso directo a `/dashboard/cocina`, el destino inicial
  de cuentas con preparación pero sin KDS, navegación y opciones de impresión.
  En KDS se ocultan los controles de estado si la cuenta solo tiene acceso de
  lectura a esa pantalla. La autorización de cambios sigue protegida por la
  función de estado/RLS de Supabase ya existente.
- Migraciones nuevas: `20261003021649_separate_kitchen_screen_access.sql`,
  `20261003021652_backfill_status_workflow_for_just_dipping.sql` y
  `20261003022543_preserve_existing_kitchen_screen_permissions.sql`. El dry-run
  mostró únicamente estas tres migraciones y quedaron aplicadas en Supabase;
  la lista remota confirma sus tres versiones.
- Verificación en una copia de trabajo aislada: lint y build correctos; 54
  pruebas Playwright de selección de negocio/permisos pasaron en escritorio,
  tablet y móvil. El deploy de producción `dpl_2F4sDeKv2bZKzan4Jvo1xwLVRFPe`
  quedó `READY` y se asignó a `https://mideli.vercel.app`; `/api/health`
  respondió HTTP 200 con `status: ok`.
- Verificación remota agregada: dueño de Just Dipping con preparación 1 y con
  pantalla Cocina 0; dueños de Mideli con preparación 1 y Cocina 1; meseras
  globales con alguno de esos permisos 0 en ambos locales. No se creó un pedido
  de prueba en producción. El deploy salió desde una copia aislada para no
  incluir los otros cambios pendientes del árbol local; no se hizo commit/push.

## 35. Reparto manual sin WhatsApp y hora opcional para recoger (2026-10-03)

- Los pedidos creados desde Mesero ya no disparan avisos de estado por WhatsApp.
  El seguimiento de domicilio se opera desde Estado con transiciones protegidas
  por el permiso de pedidos del negocio; no requiere el módulo Cocina ni una
  conversación de WhatsApp. En los pedidos listos de domicilio se conserva el
  botón manual `Enviar a repartidor`: abre WhatsApp con el negocio, folio,
  estado actual, domicilio, pago y envío en el texto. No envía nada hasta que
  la persona confirma el envío. Los avisos automáticos al cliente siguen
  desactivados; el bot y la integración técnica existente no se borraron.
- Los pedidos `Para llevar` aceptan una hora opcional del mismo día operativo,
  interpretada con la zona horaria del negocio. La comanda se crea y queda
  visible al equipo de inmediato; la hora indica cuándo la solicita el cliente,
  no cuándo se libera a cocina. Se puede borrar al editar el pedido.
- Nombre y teléfono del cliente continúan siendo opcionales. No se crean
  pedidos de prueba en producción para validar estos flujos.

## 36. Publicación acumulada para demostración (2026-10-03)

- Se publicó a producción desde el árbol de trabajo con Vercel CLI. Deploy
  `dpl_EMRckKxGJKBN5h6LjPEGM5b4S4mV` quedó `READY` y asignado a
  `https://mideli.vercel.app`. Incluye los cambios de aplicación pendientes del
  árbol, entre ellos actualización por gesto de deslizar hacia abajo y la
  eliminación de los bloques grandes de actualización manual.
- Verificación local: `npm run lint`, `npm run build` y `npm run test:e2e`
  pasaron; Playwright ejecutó 726 pruebas en escritorio, tablet y móvil.
- Verificación pública de producción, sin iniciar sesión ni modificar datos:
  22 pruebas de smoke pasaron en escritorio y móvil; login, redirecciones,
  diseño móvil, PWA, errores de JavaScript y salud pública fueron comprobados.
  `/api/health` respondió HTTP 200 (`status: ok`) y la consola del navegador
  reportó cero errores.
- La lista de migraciones local y la remota coincidían hasta
  `20261003022543`; no se aplicó SQL ni se modificaron pedidos, clientes o
  ventas. El comando `db push --dry-run` no terminó porque se quedó esperando
  inicializar el rol de inicio de sesión; como no había migraciones pendientes,
  no bloqueó el deploy.
- El árbol de trabajo sigue sin commit/push y conserva cambios de código,
  documentación, pruebas y actualización de Impeccable. Esta publicación de
  producción no equivale a una prueba autenticada del flujo real, dispositivos,
  impresora o cuentas del local; esos puntos requieren validación operativa.

## 37. Compartir manualmente pedidos al repartidor (2026-10-03)

- **Histórico; el formato fue reemplazado por §40.** Se restauró en Estado el enlace manual `Enviar a repartidor` para las tarjetas
  de domicilio en entrega. Abre `wa.me` con un mensaje para revisión/envío manual;
  el encabezado se construye con el nombre del negocio (por ejemplo,
  `SALE PEDIDO DE JUST DIPPING`) y el cuerpo incluye folio, estado del reparto,
  domicilio, colonia, referencia, forma de pago, productos, envío y teléfono
  cuando está disponible.
- No reactiva respuestas ni avisos automáticos de WhatsApp al cliente, ni cambia
  la actualización operativa del estado de entrega. No requiere esquema ni
  migración de base de datos.
- Pruebas: `npm run lint`, `npm run build` y las 732 pruebas Playwright pasaron;
  7 pruebas dirigidas validan mensaje, marca por negocio, estado y enlace.
- Deploy de producción `dpl_Cgjwvz9DLoTam979rMd6MViYKPYB` quedó `READY` y
  asociado a `https://mideli.vercel.app`. La página pública abrió, la ruta de
  salud respondió `status: ok` y Playwright no detectó errores de consola.
  No se inició sesión ni se abrió WhatsApp real; el dispositivo y el envío
  final del mensaje requieren una comprobación manual en el teléfono.

## 38. Cobro desde Estado en móvil (2026-10-03)

- La hoja de cobro se renderiza ahora en `#mideli-overlay-root`, fuera del área
  principal del dashboard que usa `overflow-hidden`. Antes quedaba recortada
  por el encabezado y la navegación inferior fija: se alcanzaba a ver el saldo,
  pero no la acción `Continuar` / `Confirmar pago`.
- El portal vive dentro del límite de marca global para conservar los colores
  del negocio seleccionado. No modifica permisos, importes, caja ni lógica de
  registro; tampoco requiere cambios de base de datos.
- Añadida comprobación de la raíz de diálogos en Playwright. Suite completa:
  735 pruebas aprobadas en escritorio, tablet y móvil; tras el ajuste final,
  la prueba enfocada pasó en los tres proyectos y también pasaron lint y build.
- Deploy `dpl_GKG6E7x9hji8P8q5EhAtXzQdRFHE` quedó `READY` y asociado a
  `https://mideli.vercel.app`. En navegador público se comprobó que la raíz de
  overlays está fuera de `main`, conserva el tema, y la salud responde
  `status: ok`; consola sin errores.
- No se inició sesión ni se registró un cobro de prueba. El turno real y el
  teléfono deben confirmar que `Continuar` y `Confirmar pago` quedan a la vista.

## 39. Avisos Push de preparación y alcance de meseras globales (2026-10-03)

- `updateOrderStatus` solicita un Push secundario al entrar a `in_kitchen` y al
  pasar a `ready`; no retrasa ni revierte la transición si Push falla. Ambos
  avisos respetan el tema `ready_alerts`, ahora rotulado como preparación y
  pedidos listos. Se usa el ID de transición de estado para evitar duplicados.
- `send-order-notification` valida el estado actual, la transición registrada,
  el permiso `business.update_preparation`, las suscripciones activas y el
  negocio. La mesera global recibe pedidos de comedor en locales sin acceso de
  pedidos asignado; los permisos operativos explícitos habilitan los demás
  servicios del negocio.
- No se requiere migración. La función quedó activa en Supabase como versión 5.
  Vercel producción `dpl_97m5JLDw5ejcxAsgnnmpCaXsNbyS` quedó `READY`, alias
  `https://mideli.vercel.app`; `/api/health` respondió HTTP 200 y `ok`.
- Antes del cambio, los últimos 24 h de producción mostraban 2 eventos de
  pedidos nuevos con 6 entregas aceptadas por el proveedor, 1 evento omitido,
  6 eventos de pedidos listos con 16 entregas aceptadas y 0 fallidas/expiradas.
  Esto confirma aceptación por Web Push, no que el sistema operativo mostrara
  cada aviso en pantalla.
- En preferencias remotas había 5 dispositivos activos: 3 con avisos de pedidos
  nuevos y 3 con avisos de preparación/listo. Para la membresía global había 0
  dispositivos con pedidos nuevos y 1 con estado activado; las preferencias se
  conservaron y no se cambiaron sin consentimiento. Andrea debe activar
  `Pedidos nuevos` en el menú de notificaciones si quiere recibir también ese
  tipo de aviso.
- `npm run lint`, `npm run build` y las 30 pruebas de políticas Playwright en
  escritorio, tablet y móvil pasan. No se creó un pedido real ni se envió un
  Push de prueba al personal. Falta confirmar visualmente el aviso en el
  dispositivo real de Andrea y en una terminal de Cocina.

## 40. Entregas separadas por negocio y mensaje manual para repartidor (2026-10-04)

- Se agregó **Control → Entregas** para configurar por negocio dirección y
  ubicación de origen, rangos de distancia/tarifas y recargos/alias de colonia.
  Las acciones validan el permiso de dueño o coordinador en servidor; las filas
  están separadas por `business_id` y no son accesibles directamente desde el
  cliente autenticado. El cálculo de Mesero usa la configuración del local
  activo, no la tarifa global heredada.
- La migración `20261004024138_business_scoped_delivery_settings.sql` fue
  aplicada. Mideli y Just Dipping tienen filas independientes, con copia
  inicial del origen actual, 13 rangos y 8 recargos. Los negocios nuevos
  reciben sus tarifas como copia independiente y deben confirmar su propio
  origen antes de cotizar. El bot legado de WhatsApp sigue exclusivo de Mideli.
- Se conservó la acción manual de compartir al repartidor en Estado. El mensaje
  identifica el negocio, agrega folio, `De` con dirección y mapa del local,
  `A` con calle/número/colonia y mapa del destino, el tipo de pago y monto solo
  si es efectivo. Omite monto de envío, total estimado, teléfono, productos y
  referencia. No se reactivaron respuestas ni avisos automáticos de WhatsApp.
- Vercel producción `dpl_4MgmnBg6F4eK3mX5D55VRuTxwSZt` quedó `READY` y alias
  `https://mideli.vercel.app`. Publicado desde el árbol local con Vercel CLI;
  el árbol conserva cambios sin commit, así que los metadatos Git del deploy no
  representan todos los archivos locales que se subieron. Supabase dry-run
  confirmó que no hay migraciones pendientes.
- Verificación de esta entrega: lint y build pasan; 11 pruebas de mensaje y
  ciclo de entrega pasan en escritorio; 30 pruebas de políticas Push pasan en
  escritorio, tablet y móvil. Impeccable no detecta patrones visuales en los
  componentes revisados.
- Auditoría remota de Push de los últimos 7 días: Just Dipping tuvo un evento
  de pedidos nuevos omitido por no tener dispositivos suscritos al tema Cocina,
  y un aviso de listo aceptado por Push (0 fallidos/expirados). Mideli registró
  21 eventos de pedidos nuevos con 64 aceptaciones y 23 de preparación/listo
  con 69 aceptaciones (0 fallidos/expirados). Hay 5 dispositivos activos en
  total; 3 tienen `Pedidos nuevos` y 3 `Preparación y listos` habilitados.
  Andrea/el personal deben activar el tema que les falte desde sus propios
  dispositivos. Aceptación del proveedor no garantiza que iOS/Android muestre
  la notificación si el permiso del sistema está desactivado.
- No se creó pedido real ni se envió Push de prueba al equipo. Falta comprobar
  el aviso en una terminal de Cocina y en el dispositivo real de Andrea.

## 41. Acceso móvil a configuración de entregas (2026-10-05)

- Causa confirmada: `Entregas` estaba visible en **Más** y el enlace navegaba,
  pero el proxy de Next.js no incluía `/settings/entregas` en su lista de rutas
  administrativas permitidas. La ruta se redirigía al inicio, dando la
  impresión de que el toque no hacía nada.
- Se conectó la ruta al control de permisos existente: dueño con
  `business.manage_catalog` y coordinación Rincón 404 con
  `platform.manage_businesses` pueden abrirla; el resto sigue bloqueado. Las
  acciones de servidor y la separación de ajustes por `business_id` no
  cambiaron.
- Una prueba nueva reprodujo el rechazo para ambas cuentas antes del arreglo;
  las 12 variantes desktop/tablet/mobile pasan tras corregirlo. `npm run lint`
  y `npm run build` también pasan.
- Producción: `dpl_8LUt9PNJJsqJ9wdP9GbUxv6vmWV9`, `READY`, alias
  `https://mideli.vercel.app`. No se modificó Supabase ni se tocaron tarifas,
  ubicaciones o pedidos.

## 42. Pedidos manuales de Uber Eats y Didi Food (2026-10-09)

- Es un canal separado del domicilio local, mostrador y método de pago local.
  Cuando el negocio lo tiene habilitado, Mesero ofrece Domicilio local,
  Mostrador y las plataformas disponibles en el paso de datos del pedido.
  Los pedidos de plataforma usan el flujo para llevar, sin dirección, tarifa
  local, asignación a repartidor propio ni horario de recogida.
- Rincón 404 habilita el módulo por negocio desde Administración. El valor
  predeterminado para negocios nuevos es apagado; la migración local enciende
  solo el negocio `just-dipping` de la organización `rincon-404-food-park`.
  El dueño configura por canal habilitado el precio opcional por producto y
  comisión de referencia; la comisión no calcula netos ni modifica caja.
- Uber Eats exige “pagado en app”. Didi Food permite app o efectivo al entregar.
  El efectivo real se captura en Estado al entregar al repartidor, nunca se
  estima antes. La operación transaccional asigna esa cantidad al corte abierto
  del mismo negocio, una vez, sin crear cobro local. Los pedidos de plataforma
  se excluyen de saldos de cobro local. El borrado después de entregar se rige
  por las actualizaciones de las secciones 48 y 49.
- Historial y ticket muestran plataforma y forma de pago; el ticket distingue
  el efectivo real de Didi sin declararlo cobro local. La ruta de ajustes es
  `/settings/plataformas`.
- Archivos principales: `src/lib/marketplace-orders.ts`,
  `src/lib/actions/business-marketplace.ts`,
  `src/components/admin/business-marketplace-settings-manager.tsx`,
  `src/components/pos/order-details-modal.tsx`,
  `src/components/dashboard/status-view.tsx` y la migración
  `20261009221644_just_dipping_marketplace_orders.sql`.
- Verificación antes de publicar: `npm run lint`, `npm run build` y 783
  ejecuciones Playwright en escritorio, tablet y móvil pasaron. La prueba pgTAP
  no se ejecutó: este equipo no tiene Docker/Postgres y producción no tiene
  instalada la extensión pgTAP.
- La migración `20261009221644_just_dipping_marketplace_orders.sql` se aplicó
  a Supabase de producción después de confirmar en dry-run que era la única
  pendiente. Consultas remotas de solo lectura verificaron 16 condiciones de
  permisos, RLS, flujo atómico, idempotencia y caja por negocio; todas pasaron.
  La lista de migraciones quedó sincronizada (`upToDate: true`). No se crearon
  pedidos, cobros ni movimientos de caja reales.
- Publicado a producción con Vercel CLI: `dpl_2VLWRDQs4JF1g2SrFrRfu9oJAbat`,
  estado `READY`, alias `https://mideli.vercel.app`. `/api/health` respondió
  HTTP 200, `status: ok`, versión `d6182a5da31a`. Se publicó el árbol local
  aprobado sin commit/push; la versión reportada es el SHA base y no identifica
  por sí sola los cambios locales incluidos.
- Para empezar a capturar estas órdenes, el dueño de Just Dipping debe entrar
  a `/settings/plataformas`, activar Uber Eats y/o Didi Food y guardar sus
  precios opcionales. El sistema registra manualmente pedidos provenientes de
  esas plataformas; no se conecta a sus APIs ni recibe pedidos automáticamente.

## 43. Acceso a configuración de plataformas (2026-10-09)

- Causa confirmada: el enlace `/settings/plataformas` se mostraba a dueños y a
  Rincón 404, pero `canUseAdminRoute` no reconocía esa ruta en el control del
  proxy. Al tocarla, el proxy redirigía a Inicio.
- La ruta acepta ahora `business.manage_catalog` para el dueño del negocio y
  `platform.manage_businesses` para Rincón 404. El personal sin esos permisos
  continúa bloqueado. No se cambiaron la base, los canales habilitados, precios
  ni pedidos.
- Una prueba nueva reprodujo el rechazo previo. Después del cambio pasaron 12
  variantes de escritorio, tablet y móvil, junto con `npm run lint` y
  `npm run build`.
- Vercel producción `dpl_Bsb8Eh37Rw8s7DdpJ8ntTFSHE5ak` quedó `READY` y asignado
  a `https://mideli.vercel.app`. La pantalla protegida no se probó iniciando
  sesión con una cuenta real.

## 44. Disponibilidad de productos por plataforma (2026-10-09)

- Plataformas mantiene una casilla independiente por artículo y canal Uber Eats
  o Didi Food. Los productos nuevos del catálogo aparecen automáticamente
  desmarcados en ambos hasta que el dueño los habilite.
- Mesero lista precios solo para productos habilitados. Al dejar vacío el precio
  usa el del menú; la creación de pedido queda bloqueada si algún artículo no
  está disponible. Un trigger de base de datos repite la validación para evitar
  omisiones por una sesión vieja o una llamada directa.
- Las capturas de Uber Eats y Didi Food se cotejaron con los artículos activos
  de Just Dipping. Se prepararon precios para 18 artículos de Uber y 9 de Didi;
  los demás quedaron desactivados. Los canales siguen apagados y no se habilitan
  hasta que el dueño los active en `/settings/plataformas`.
- La migración nueva es
  `supabase/migrations/20261009231817_marketplace_product_availability.sql`,
  seguida por la carga de precios
  `supabase/migrations/20261009232342_seed_just_dipping_marketplace_prices.sql`.
  Conserva los precios personalizados ya existentes y da precio del menú a los
  productos de canales que ya estuvieran activos antes del cambio.
- `npm run lint`, `npm run build` y 18 pruebas Playwright de permisos y
  disponibilidad en desktop/tablet/móvil pasaron. Supabase confirmó los
  defaults, RLS, función, triggers, 18 productos Uber, 9 Didi y canales apagados.
  La suite pgTAP no se pudo correr sin Docker/Postgres local; no se crearon
  comandas reales.
- Despliegue Vercel producción `dpl_2ZsULYGRuiMBUve6BqHjYneYvmRJ` en estado
  `READY`, alias `https://mideli.vercel.app`. No se consultó la ruta de salud.

## 45. Selector visual de plataformas en Mesero (2026-10-09)

- En el paso de datos, Mesero distingue `Domicilio local`, `Para llevar` y las
  plataformas activadas para el negocio. `Para llevar` no aparece en pedidos
  de comedor o domicilio local.
- Uber Eats y DiDi Food se identifican con sus logotipos SVG locales y colores
  de marca. El wordmark de Uber Eats se obtuvo de
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Uber_Eats_2020_logo.svg)
  (archivo atribuido a Uber Eats); el logotipo blanco de DiDi Food procede de
  [DiDi Food](https://web.didiglobal.com/images/logos/didi-food-logo-white.svg).
  La guía oficial de DiDi especifica `#FF7D41` para Naranja DiDi:
  [Guía para restaurantes](https://web.didiglobal.com/pe/restaurantes/kit-digital/Guia-General-sobre-Redes-Sociales-para-Restaurantes-PE.pdf).
- No hubo cambios de esquema, permisos ni datos operativos. Las pruebas del
  selector, disponibilidad y entrega de ambos logos pasaron en tablet y móvil
  (10 ejecuciones); lint y build también pasaron. El selector se publicó en
  producción; una regresión relacionada con la selección de plataforma se
  documenta y corrige en la sección 46.

## 46. Selector de canal para pedidos para llevar (2026-10-09)

- Causa: Mesero representa internamente los pedidos Uber Eats y Didi Food con
  `orderType: para_llevar`. Ocultar la alternativa directa al elegir plataforma
  impedía volver al pedido no-plataforma sin salir del modal.
- La opción ahora se llama `Para llevar` y queda disponible junto con Uber Eats
  y Didi Food. Se marca seleccionada solo si no hay plataforma; al tocarla,
  limpia la plataforma en el mismo pedido. Domicilio local no la muestra.
- Se añadieron pruebas de estado para Uber, Didi, domicilio y pedido directo.
  Pasaron 12 ejecuciones en tablet y móvil; `npm run lint` y `npm run build`
  también pasaron. No hubo cambios de base de datos ni de pedidos operativos.
- Producción Vercel `dpl_GpmNt7wUdTYuF4MGdHGhPQcDaaVL` quedó `READY` y asignada
  a `https://mideli.vercel.app`.

## 47. Navegación agrupada por tarea (2026-10-09)

- La navegación conserva Mesero, Cocina y Analíticas como accesos directos.
  Los ajustes se agrupan por tarea: Turno (Caja, Entregas y Clientes), Negocio
  (Menú, Personal e Inventario) y Configuración (Plataformas, Impresión, Mesas
  y Negocios). Diagnóstico permanece al final como acceso independiente.
- En escritorio sólo una categoría desplegable puede estar abierta; al cambiar
  de ruta se abre la categoría que contiene esa pantalla. La fila de tablet y
  el cajón Más de móvil conservan las mismas categorías. El cajón abre la
  primera categoría disponible cuando la pantalla actual no pertenece a una.
- Los elementos vacíos no aparecen y la organización reutiliza los permisos y
  destinos existentes; no agrega privilegios ni cambia el acceso al servidor.
- Se verifica con las pruebas dirigidas de agrupación/permisos y responsive,
  además de lint y build antes de publicar. No se hace deploy en esta tarea.

## 48. Borrado de pedidos autorizado por negocio (2026-10-09)

- El flujo anterior solo mostraba borrar a la membresía `business_owner`, y la
  acción moderna del servidor no tenía campo de PIN. El RPC de PIN anterior se
  había retirado durante la migración multinegocio porque no delimitaba bien el
  negocio autorizador.
- Ahora el dueño activo del negocio puede borrar directamente. Personal con
  `business.operate_orders` puede solicitarlo con el PIN de un dueño activo de
  ese mismo negocio, configurado en Personal. La consulta de autorizadores solo
  devuelve ID, nombre y si existe PIN, nunca el hash.
- Una mesera global conserva el límite de solo comedor en otros locales. Los
  pedidos de Uber Eats/DiDi Food pueden borrarse con la misma autorización del
  negocio; se mantienen los bloqueos para turnos cerrados, cobros compartidos y
  operaciones de caja concurrentes. La protección inicial del efectivo Didi ya
  entregado fue reemplazada por la regla vigente de la sección 49: se borra la
  comanda, pero el recibo de caja se conserva de forma independiente.
- La acción moderna valida y ejecuta el borrado atómico mediante un RPC
  autenticado. La ruta legacy owner/admin mantiene su comportamiento actual.
- **Histórico, actualizado en §49.** La migración
  `20261010003718_allow_marketplace_order_deletion_with_cash_protection.sql`
  se aplicó con la regla anterior que impedía borrar Didi en efectivo ya
  entregado. El reemplazo conserva los permisos del negocio y mantiene el
  importe en la caja mediante un registro de auditoría.
- Lint, build y 102 pruebas dirigidas de escritorio, tablet y móvil pasaron.
  Producción Vercel `dpl_47SR1oNXwYQhAfu3t1FANXc2AiH4` quedó `READY` y asociada
  a `https://mideli.vercel.app`. No se borraron pedidos reales.
- Just Dipping tenía dueño activo y PIN configurado en la última consulta
  remota de solo lectura; no se modificó ningún pedido real. La migración nueva
  es `20261010001844_business_scoped_order_deletion_authorization.sql`.
- Pruebas: 18 escenarios de `business-context-selection` pasan en escritorio,
  tablet y móvil (54 ejecuciones); `npm run lint` y `npm run build` pasan.
  Migración aplicada y confirmada en el historial de
  Supabase; el `--dry-run` posterior reporta la base al día. Los RPC se
  verificaron en el catálogo: ejecución anónima denegada y autenticada
  permitida, con `search_path` vacío. No se ejecutó pgTAP ni se borraron
  pedidos reales.
- Deploy de producción `dpl_CTVnF24Jv7RmhhGb4Fgaxs5KtsP2` quedó `READY` y
  asociado a `https://mideli.vercel.app` el 2026-10-09.

## 49. Borrado de Didi en efectivo con conservación del corte (2026-10-09)

- El dueño puede borrar directamente y el personal conserva el mismo requisito
  de PIN de un dueño activo de ese negocio. La mesera global sigue limitada a
  pedidos de comedor en otros locales.
- Una comanda Didi pagada en efectivo puede borrarse incluso después de quedar
  entregada y ligada a un corte. Antes de eliminarla, la base archiva folio,
  monto, turno, fecha y responsables, sin datos personales ni artículos. Los
  totales del corte abierto y el cierre siguen sumando ese importe; el recibo
  archivado queda disponible en el detalle devuelto por la función de caja.
- Si el cierre de caja está en curso, el borrado falla rápidamente para evitar
  una carrera. Se mantienen los bloqueos de pedidos con pago local en cortes
  cerrados y de pagos compartidos.
- La migración `20261010004843_archive_didi_cash_receipts_on_order_deletion.sql`
  crea el archivo privado y conecta sus recibos con totales, detalle y cierre.
  La interfaz informa que el efectivo permanece en caja y ya no oculta la opción
  de borrar por tratarse de un DiDi en efectivo.
- No se borraron pedidos reales para probar. `npm run lint`, `npm run build` y
  102 pruebas Playwright dirigidas (escritorio, tablet y móvil) pasaron. La
  migración se aplicó en Supabase y una consulta de solo lectura confirmó el
  archivo privado, el bloqueo de acceso directo y la conservación del efectivo
  en totales y cierre. `supabase db push --dry-run` confirmó que no quedan
  migraciones pendientes. El deploy de producción
  `dpl_4yb7DhvJYs4Srym2iCV261wB5gbP` quedó `READY` y asociado a
  `https://mideli.vercel.app` el 2026-10-09.

## 50. Visibilidad de pedidos para meseras globales por negocio (2026-10-10)

- Una membresía global de organización puede ver pedidos de `comer aquí` en
  todos los locales activos y con licencia de su organización, aunque no tenga
  acceso operativo asignado a ese local. Domicilios y pedidos para llevar solo
  son visibles donde tenga una capacidad de negocio explícita: operar/cobrar
  pedidos, actualizar preparación o acceder a Cocina. Un negocio propio o
  autorizado conserva todos sus tipos de servicio.
- El alcance se valida en RLS para `orders`, `order_items` y
  `order_status_log`; el filtro de Estado aplica el mismo criterio a filas ya
  cargadas. La consulta base incluye los negocios de la organización para que
  RLS pueda entregar solo los pedidos de comedor permitidos. Se conservan el
  límite del negocio seleccionado y la restricción de licencia.
- Historial usa la misma lectura protegida. El permiso para borrar pedidos y
  su autorización con PIN no se modificaron en esta entrega.
- La migración `20261010010407_global_waiter_order_service_visibility.sql` fue
  aplicada en producción; el `db push --dry-run` confirmó después que no quedan
  migraciones pendientes. El catálogo remoto confirmó `SECURITY DEFINER`,
  `search_path` vacío, ejecución denegada a `anon`, ejecución a
  `authenticated` y las tres políticas de lectura. Los asesores no señalaron
  la nueva función; permanecen avisos generales previos del proyecto.
- `npm run lint`, `npm run build` y 57 pruebas Playwright de contexto en
  escritorio, tablet y móvil pasaron. Se añadieron regresiones pgTAP para CI;
  no se ejecutaron localmente porque el entorno no tiene PostgreSQL/Docker.
  No se crearon pedidos ni se modificaron datos operativos. Falta que Andrea
  confirme el comportamiento con su sesión real después de actualizar la app.
- Vercel producción `dpl_Gksri6FgrtVzkxx7UTo8MqmiNX98` quedó `READY` y
  asociado a `https://mideli.vercel.app`.

## 52. Validación de caja al crear pedidos multinegocio (2026-10-10)

- Mesero comparaba el carrito con `currentCashShift`, estado global que el
  control Caja carga para el negocio administrativo seleccionado. En una
  mesera global, el menú de Just Dipping puede ser distinto de ese contexto;
  si Mideli no tenía turno abierto, el cliente detenía el pedido antes de
  consultar la caja de Just Dipping.
- La validación previa ahora consulta el estado de caja por cada
  `business_id` del carrito mediante `multibusiness_cash_action('current')`.
  Solo necesita conocer si hay turno abierto; la base de datos conserva la
  validación transaccional y asigna cada orden al turno del mismo negocio.
  Una comanda de comedor con varios negocios requiere turno abierto en cada
  uno. El fallback legado de un solo negocio permanece sin cambios.
- No hubo cambios de esquema ni de datos operativos. Dos regresiones cubren
  Just Dipping abierto con Mideli cerrado y una comanda mixta con un solo
  turno cerrado. Pasaron 63 pruebas de contexto en escritorio, tablet y móvil,
  `npm run lint` y `npm run build`.
- Una consulta de solo lectura a producción, durante esta revisión, encontró
  ambos turnos abiertos; por eso no se reprodujo allí el estado exacto reportado.
  No se creó ningún pedido ni se modificó caja. El cambio aislado se publicó en
  Vercel producción como `dpl_5LnHUGbUZfPZMBgtCQyjpFFHNkpC`, estado `READY`,
  alias `https://mideli.vercel.app`.

## 51. Meseras globales: solo pedidos de comedor (2026-10-10)

- La primera regla permitía que los permisos operativos por negocio mostraran
  a una mesera global también pedidos de domicilio y para llevar. Andrea tenía
  esos permisos en Mideli y Just Dipping; por eso veía la cola completa.
- La regla vigente limita a toda cuenta con rol `global_waiter` a pedidos de
  `comedor` en Estado e Historial, aunque tenga permisos operativos asignados.
  Esto excluye domicilio local, para llevar y plataformas Uber/DiDi. Los roles
  de personal local conservan sus vistas.
- La restricción se aplica tanto en RLS para pedidos, artículos e historial,
  como en el filtro de Estado para filas ya cargadas. El permiso de negocio
  sigue gobernando el uso del menú y cobros; caja continúa por separado.
- La migración vigente es
  `20261010011748_restrict_global_waiters_to_dine_in_only.sql`. Una prueba
  dirigida falló antes del cambio mostrando Uber, DiDi, domicilio y para llevar
  visibles; tras el cambio pasó en escritorio, tablet y móvil. Pendientes:
  no quedan cambios requeridos para aplicar en producción.
- La migración se aplicó en Supabase producción. La comprobación con la cuenta
  de Andrea y Just Dipping devolvió `comedor=true`, `domicilio=false` y
  `para_llevar=false`; Uber y DiDi usan `para_llevar`. El historial de
  migraciones local/remoto quedó sincronizado.
- Lint, build y las 57 pruebas de contexto de Playwright pasaron en escritorio,
  tablet y móvil. La producción vigente consulta pedidos bajo RLS y recibe la
  restricción sin redeploy de Vercel; el árbol de trabajo conserva otras
  modificaciones sin revisar, así que no se publicó un frontend más amplio.
  Andrea solo necesita actualizar/reabrir la app para limpiar pedidos que
  pudieran quedar cargados en memoria.

## 53. Suspensión de licencia en tiempo real (2026-10-10)

- La suspensión o reactivación de la licencia de un negocio publica por un
  canal privado `business:<id>:license` únicamente el ID del negocio y su
  disponibilidad. La autorización de lectura del canal reutiliza el permiso
  multinegocio; no expone notas, vigencias ni información de pagos.
- Mesero, Estado, Historial, Control y Configuración escuchan cambios para los
  negocios a los que la cuenta tiene acceso. Cuando cambia la disponibilidad,
  la sesión se renueva para que el proxy seleccione un negocio aún autorizado
  o muestre la pantalla bloqueada. La revisión periódica y al recuperar foco
  permanece como respaldo para expiraciones o desconexiones.
- En suspensión o vencimiento confirmado, la pantalla muestra de forma breve
  “Favor de liquidar pagos pendientes.” Las demás causas de acceso bloqueado
  conservan su explicación específica.
- La migración `20261010015500_business_license_realtime_notifications.sql`
  está aplicada en Supabase producción. La verificación remota confirmó RLS,
  una política de canal privado, tres triggers de disponibilidad y que los
  clientes autenticados no pueden leer filas de licencia ni invocar el emisor.
  El dry-run posterior quedó sin migraciones pendientes.
- Lint, build y 57 pruebas de contexto pasaron en el espacio aislado. No se
  suspendió un negocio real para simular el evento; la recepción visual no se
  probó con una cuenta activa del local. Vercel producción quedó `READY` como
  `dpl_Hk9qQ3Syz28ZBc4Q6diMctMBaaxc`, alias `https://mideli.vercel.app`.

## 54. Analíticas de plataformas y jerarquía visual (2026-10-09)

- Analíticas consultaba cobros de caja (`payment_transactions`) y por eso no
  representaba los pedidos Uber Eats/DiDi Food, que se guardan como `para_llevar`
  y se cierran con entrega al repartidor. Se agregó un filtro `Plataformas` y
  un desglose también visible en `Todos` y `Para llevar`, con pedidos,
  entregas, valor bruto de tickets, pago en app y efectivo Didi realmente
  recibido.
- El efectivo de Didi permanece separado del ingreso/cobro de caja de pedidos
  locales. Los productos y categorías sí cuentan tickets entregados, sin
  sumar órdenes pendientes o canceladas. Las consultas conservan el ámbito del
  negocio activo y usan la fecha de creación del pedido para el periodo.
- La pantalla muestra ventas, pedidos y ticket promedio arriba; los detalles
  siguen disponibles agrupados debajo y el control del dueño se conserva. En
  móvil las métricas usan una disposición compacta. No se eliminaron métricas.
- Una consulta de solo lectura a producción no encontró pedidos de plataforma
  almacenados para Just Dipping, así que el resultado con órdenes reales no se
  pudo confirmar. No se crearon órdenes ni se modificaron datos operativos.
  Una prueba aislada cubre Uber, DiDi con pago en app, efectivo Didi variable,
  pedido pendiente y cancelación.
- Pasaron 24 pruebas Playwright en escritorio, tablet y móvil, `npm run lint`,
  `npm run build` y el detector visual Impeccable. Vercel producción quedó
  `READY` como `dpl_E3FYVnGkqkQiVnhS7s5zbig38z3j`, alias
  `https://mideli.vercel.app`; `/api/health` respondió `200`.

## 55. Tickets compactos para ahorrar papel (2026-10-09)

- Los tickets de pedido impresos desde Historial ya no llevan logos. Usan
  tipografía monoespaciada pequeña, separaciones y márgenes reducidos; mantienen
  nombre configurado, datos del negocio, folio, servicio/mesa, cliente,
  productos, modificadores, notas, subtotal, descuento, total, pago y saldo.
  Domicilio conserva destino, colonia, referencia, envío y total del cliente;
  Uber Eats y Didi Food conservan plataforma y su tratamiento de pago.
- El ancho configurado de 48 o 58 mm sigue siendo independiente por negocio.
  El margen de impresión baja de 3 a 1 mm. Los comprobantes de cobro también
  pierden logos, dirección fija exclusiva de Mideli y espacios amplios, y
  conservan los datos de la transacción y negocio.
- No cambia la operación de pedidos, pagos, permisos ni Supabase. La impresión
  continúa usando el diálogo del dispositivo; el ahorro y la legibilidad final
  dependen del controlador y del modelo de impresora, por lo que falta validar
  físicamente en el local.
- Verificación: 18 pruebas dirigidas pasan en escritorio, tablet y móvil;
  `npm run lint` y `npm run build` pasan. Vercel producción
  `dpl_AgPsqnm4v6bKKE65eVriHUAsK5rP` quedó `READY` con alias
  `https://mideli.vercel.app`; `/api/health` respondió HTTP 200 y `status: ok`.

## 56. Rueda del ratón en todas las áreas (2026-10-09)

- La app mantiene el dashboard a la altura de la ventana y desplaza cada panel
  por separado. Sobre cabeceras y zonas estáticas no había un contenedor que
  recibiera la rueda; algunos paneles anidados también cortaban la continuidad
  al llegar a su límite.
- `src/lib/wheel-scroll-fallback.ts` redirige la rueda a la región desplazable
  visible más cercana. Se monta desde `src/app/layout.tsx`, por lo que cubre el
  dashboard, Menú y páginas de administración que usan otro layout. Si un panel
  anidado llegó a su límite, continúa al siguiente contenedor disponible.
  Respeta controles de formulario, gestos horizontales y zoom; con un diálogo
  modal activo no mueve el fondo.
- No cambia el diseño, los gestos táctiles, permisos, pedidos ni datos de
  Supabase. Cuatro pruebas Playwright (incluida una pantalla de administración
  fuera del dashboard) pasan en escritorio, tablet y móvil; `npm run lint` y
  `npm run build` pasan.
- No se publicó en Vercel en esta revisión: el árbol de trabajo contiene otros
  cambios pendientes ajenos, y desplegarlos juntos podría alterar producción.

## 57. Mensaje más legible para repartidores (formato anterior; reemplazado por §58)

- **Histórico; el método y la línea de cobro fueron reemplazados por §58.**

- El texto de WhatsApp se genera en `src/lib/delivery-driver-message.ts` para
  cualquier negocio. Ahora separa cliente, recolección, destino y cobro con
  espacios en blanco para facilitar la lectura durante la entrega.
- Si el pedido tiene nombre y/o teléfono, se muestran bajo **Cliente**; el
  teléfono usa el formato de lectura de la app. Como ambos campos son
  opcionales, se omite el bloque cuando faltan los dos.
- Se conservan los dos enlaces de Maps y los datos opcionales del cliente.
- El formato de cobro anterior ya no es vigente; consultar §58. Los datos del
  cliente y mapas descritos aquí se conservan.

## 58. Pago requerido en domicilios locales y mensaje de cobro al repartidor (2026-10-09)

- En un domicilio local, Mesero exige elegir **Efectivo** o **Transferencia**
  antes de enviar o cobrar/enviar. No preselecciona un método. Uber Eats, Didi
  Food, comedor y para llevar no usan este requisito.
- El borrador local puede restaurar únicamente el enum del método; no guarda
  nombre, teléfono ni domicilio.
- El botón manual **Enviar a repartidor** sigue disponible. En efectivo, el
  mensaje muestra `Productos: $X + envío`, donde X es `orders.total` (productos)
  del mismo pedido. No muestra efectivo entregado, cambio, ni suma de envío. En
  transferencia solo aparece el método, sin monto ni `+ envío`.
- Se mantiene `payment_method_requested`; no se requiere una migración. Los
  avisos automáticos de WhatsApp, caja y registro de cobros no cambian.
- Pasaron las 879 pruebas Playwright completas en escritorio, tablet y móvil,
  `npm run lint` y `npm run build`. El listado de solo lectura de migraciones
  mostró el esquema local y remoto sincronizados. No se envió un WhatsApp real.
- Publicado en Vercel producción como `dpl_3A5uR7iXfAicwCBoNhmWxsCCoTi9`,
  `READY`, con alias `https://mideli.vercel.app`. La comprobación fue mediante
  metadatos de Vercel; no se consultó la ruta pública de salud.

## 59. Persistencia y recuperación de sesión (2026-10-09)

- La sesión de Supabase ya se persistía en el navegador. Ahora las opciones de
  cookie están explícitas y compartidas entre cliente, servidor y proxy: ruta
  `/`, `SameSite=Lax`, duración de 400 días y `Secure` en producción.
- Si una ruta protegida conserva la cookie pero el proxy no puede verificar
  temporalmente sus claims, mantiene accesible `/reconectando` en vez de
  mandarla inmediatamente a login. Esa pantalla intenta renovar la sesión con
  `auth.refreshSession()` al entrar, cada cinco segundos y al recuperar red;
  el botón de regreso a login ya no ejecuta `signOut`.
- Esto conserva sesiones válidas ante fallos recuperables, pero no anula cierre
  de sesión explícito, revocación del refresh token, perfil desactivado ni
  límites que establezca Supabase Auth; esas situaciones aún requieren volver
  a iniciar sesión.
- Pruebas: 894 Playwright pasan en escritorio/tablet/móvil; la prueba dirigida
  de recuperación pasa (5 casos). `npm run lint` y `npm run build` pasan. No se
  probó con las credenciales de una mesera en un dispositivo real ni se
  modificó configuración o datos de Supabase.
- Publicado en Vercel producción como `dpl_6pZu8PN1jbs9yeUfdiRy2epv7Xre`,
  `READY`, con alias `https://mideli.vercel.app`; se confirmó el estado mediante
  metadatos del despliegue.

## 60. Canales de plataforma aislados por negocio en Mesero (2026-10-09)

- La configuración remota se verificó en solo lectura: Mideli tiene los pedidos
  de plataformas apagados y no tiene filas de configuración; Just Dipping tiene
  Uber Eats y Didi Food activados. Los precios y comisiones se mantienen
  vinculados a `business_id`; la comisión es de referencia y no altera el cobro.
- En Mesero, al cambiar el menú, se asignaba la clave del negocio nuevo a un
  estado que todavía conservaba canales, precios y disponibilidad del anterior.
  El selector podía mostrar temporalmente ambos canales mientras cargaba el
  nuevo negocio. Además, un carrito de otro negocio podía conservar esos canales
  aunque el menú activo ya fuera distinto.
- La carga ahora limpia los datos anteriores, y el POS solo usa canales cuando
  la configuración vigente terminó de cargar y el menú activo coincide con el
  único negocio de los productos. Si no coinciden, conserva el carrito, oculta
  plataformas y explica que se debe volver al menú de ese negocio.
- Verificación: 24 ejecuciones de pruebas de modalidades y 108 pruebas de
  contexto, disponibilidad y borrador pasaron en escritorio, tablet y móvil;
  `npm run lint` y `npm run build` pasaron. La consulta de producción fue de
  solo lectura y no se crearon pedidos ni se modificaron datos.
- No se desplegó este cambio. Hace falta publicar explícitamente para que llegue
  a `https://mideli.vercel.app`.

## 61. Push de negocio a meseras solo al quedar listo (2026-10-09)

- La función `send-order-notification` ahora identifica los rangos `waiter`,
  `local_waiter` y `global_waiter` por la membresía del negocio (y el rol de
  perfil para pedidos legacy). Esos destinatarios no reciben Push al registrar
  un pedido ni al iniciar preparación; sí pueden recibirlo al pasar a `ready`,
  dentro de los límites vigentes de negocio y servicio.
- Cocina y los demás rangos autorizados conservan los avisos que ya recibían.
  No cambia `ready_alerts`, sus preferencias por dispositivo ni el sonido/toast
  local, que ya se dispara únicamente cuando un pedido aparece como listo.
- No requiere migración ni modifica pedidos, suscripciones o preferencias
  guardadas. La regresión de política pasó en escritorio, tablet y móvil (18
  casos); `npm run lint`, `npm run build` y `git diff --check` pasaron.
- No se desplegó la Edge Function y no se envió un Push real. El comportamiento
  en producción permanece igual hasta publicar `send-order-notification` en
  Supabase.

## 62. Agrupar pedidos activos y cobrar por mesa desde Estado (2026-10-09)

- En Estado, los pedidos de comedor se agrupan por visita física (`table_visit_id`)
  dentro de cada etapa existente. Pedidos legacy usan `table_id`, o zona y número
  como último recurso. Domicilio y para llevar conservan tarjetas individuales.
- La mesa puede contener cuentas de varios negocios. Cada botón abre el modal de
  cobro actual para un solo negocio y su caja. La cuenta reúne pedidos con saldo
  de la misma visita y `business_account_id`, incluso si alguno está en otra
  etapa; no combina visitas distintas, negocios, efectivo ni cortes.
- El modal identifica mesa y negocio. No hay cambios de esquema ni se crean
  movimientos al agrupar la vista.
- Verificación: 18 pruebas dirigidas pasaron en escritorio, tablet y móvil;
  `npm run lint` y `npm run build` pasan. No se hicieron cobros reales.
- Este cambio aún no se desplegó a producción.

## 63. Fluidez: menos redibujados en Cocina, Mesero y Estado (2026-10-26)

- Auditoría con la guía de rendimiento React/Next.js de Vercel. El problema
  principal no era la red sino pantallas que se redibujaban completas sin
  necesidad.
- Cocina: el reloj de 1 s vivía en el componente raíz y redibujaba, filtraba y
  ordenaba todas las comandas cada segundo. Ahora la hora y los cronómetros de
  cada tarjeta usan un reloj compartido (`src/lib/hooks/use-second-tick.ts`)
  que solo actualiza esos textos. La urgencia y la liberación de programados se
  recalculan cada 10 s; `OrderCard` está memorizada y recibe la urgencia y
  callbacks estables. Las suscripciones a la store usan selectores.
- Store de pedidos: cada recarga reutiliza los pedidos sin cambios
  (`src/lib/order-structural-sharing.ts`) y no notifica a la UI si nada
  cambió. Las recargas de fondo (tiempo real, sondeo, volver a la pestaña) ya
  no alternan `loading`; las manuales y la inicial sí.
- Sondeo de respaldo adaptativo: 60 s mientras el canal en vivo está
  `SUBSCRIBED` y 15 s si está caído o reconectando
  (`getActiveOrdersPollInterval`). Antes eran 15 s siempre en cada tablet.
- Mesero ya no se suscribe a la lista completa de pedidos: lee el número de
  pedidos listos y el negocio del pedido en edición con selectores derivados.
  `CartPanel` está memorizado y recibe callbacks estables.
- Proxy: el perfil, el contexto multinegocio y la disponibilidad de licencias
  se consultan en paralelo; se ahorra un viaje a Supabase en cada navegación.
  El reintento del perfil y las salidas por perfil inexistente o inactivo no
  cambian.
- Sin cambios de esquema, permisos, cálculos ni flujos. Verificación:
  `npm run lint`, `npm run build` y la suite Playwright completa (942 pruebas
  en escritorio, tablet y móvil) pasan. Falta medir en las tablets del local.
- No desplegado a producción al cerrar esta sección.
