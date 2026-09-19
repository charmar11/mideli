# Mideli: contexto completo para OpenCode

Actualizado: 2026-09-19

Este documento resume lo que se ha decidido y construido para Mideli. Sirve como memoria de trabajo para cualquier agente de IA, no solo OpenCode. Antes de modificar algo, confirma los detalles contra el código actual y contra la base de datos cuando el cambio toque Supabase.

## 0. Fuentes de verdad y mantenimiento

La prioridad cuando exista una contradicción es: código y tipos actuales, estado remoto verificable, `AGENTS.md`, este contexto, y después `PRODUCT.md`, `DESIGN.md` y la documentación técnica en `docs/`.

Este archivo debe actualizarse cuando cambien una decisión de producto, un flujo crítico, una migración, un permiso, una integración o un pendiente operativo. No debe guardar tokens, datos de clientes ni fotografías estáticas que puedan confundirse con el estado actual.

La rama de trabajo puede contener cambios sin commit. Esos cambios pertenecen al trabajo en curso y no deben descartarse. Para que otra IA los reciba desde GitHub, primero hay que consolidarlos en un commit estable.

## 1. Producto

Mideli es un sistema operativo para un solo local de comida Burger & Sushi en Ciudad Obregón, Sonora. Lo usan personas del equipo durante el turno, no clientes finales.

Usuarios principales:

- Mesero: arma pedidos en tablet, elige tipo de servicio, selecciona mesa, agrega notas, envía a cocina y cobra.
- Cocina: consulta la cola de pedidos, prepara y cambia estados.
- Dueño o administrador: administra menú, categorías, usuarios, mesas, zonas, inventario y analíticas.

Objetivo del producto: que el equipo pueda pasar de pedido a cocina y de pedido listo a cobro con el menor número de pasos posible, sin depender de papel.

La operación visible sigue siendo Mideli en una sola interfaz y un solo negocio
activo. La base remota ya tiene aplicada la primera rebanada multinegocio para
Rincón 404 Food Park, pero todavía no existe un segundo negocio operativo ni se
ha habilitado WhatsApp fuera de Mideli.

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

### Licencia de acceso

Desde 2026-08-01 el sistema se bloquea al vencer la licencia mensual:

- Una fila única en `public.app_license` guarda estado, `valid_until` y `updated_at`. RLS: lectura para `anon` y `authenticated`; escritura solo en servidor con service role.
- El proxy (`src/proxy.ts`) redirige `/dashboard`, `/menu` y `/settings` a `/sistema-bloqueado` cuando la licencia no está vigente, y `LicenseHeartbeat` bloquea sesiones abiertas al vencer.
- `/control/licencia` es la herramienta privada del vendedor. Si todavía no existe una credencial, una sesión activa owner/admin permite crearla una sola vez sin pedir el secreto técnico. Después, todas las operaciones exigen la contraseña privada del vendedor y una sesión firmada de 30 minutos.
- `MIDELI_LICENSE_ADMIN_SECRET` queda reservado para recuperación técnica. La contraseña privada usa `scrypt`, bloqueo temporal tras cinco fallos y auditoría de renovaciones, suspensión y reactivación.
- La pantalla de bloqueo no expone la ruta de control ni detalles técnicos.
- Login e Inicio se rediseñaron: sin texto "Mi Momento", el campo Usuario ya no muestra el sufijo `@mideli.com` (se completa internamente) y se aceptan correos completos.

### Turnos de caja

Caja compartida del local con apertura y cierre explícitos (migración `20260801125712_cash_shifts_and_location_snapshots.sql`):

- Solo un turno abierto a la vez; pedidos y cobros nuevos se vinculan al turno de forma transaccional. No se vende fuera de turno.
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
- Desde 2026-08-13 cada dispositivo configura por separado `kitchen_alerts` para pedidos nuevos y `ready_alerts` para pedidos listos. Propietario, administrador y supervisor pueden activar ambos al entrar a las vistas correspondientes.
- La Edge Function `send-order-notification` valida JWT, consulta el pedido en servidor, entrega a todos los perfiles activos que habilitaron el tema y evita duplicados mediante `push_notification_events`.
- El service worker suprime el banner si Cocina o Mesero ya están visibles; en esa situación se usa el sonido y la señal local. En otra sección, segundo plano o aplicación cerrada se muestra Push.
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
- `/sistema-bloqueado`: pantalla de licencia vencida.
- `/control/licencia`: herramienta privada del vendedor.

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
- El scheduler de WhatsApp corre cada minuto desde Supabase Cron mediante `pg_net` y Vault para liberar pedidos programados y procesar inactividad; la ruta acepta un secreto dedicado y la liberación es idempotente.

Antes de añadir más optimizaciones, medir qué interacción sigue lenta. No reemplazar consultas reales por datos falsos para aparentar velocidad.

## 8. Supabase y seguridad

Proyecto:

- Project ref: `qgnjennimvbrfxvcmowb`.
- URL pública: `https://qgnjennimvbrfxvcmowb.supabase.co`.
- CLI inicializada en `supabase/config.toml` (versionada en git desde 2026-08-02 junto con todas las migraciones).
- CLI enlazada al proyecto remoto.
- El repositorio local contiene las migraciones históricas y las rebanadas
  multinegocio de septiembre, hasta `20260919205139_multibusiness_account_payment_runtime.sql`.
  `npx supabase migration list` confirmó que el repositorio y el proyecto
  remoto están alineados en esa migración el 2026-09-19.

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

El plan ordenado para continuar vive en `.opencode/plans/next-session-plan.md`.

### Evolución aprobada en diseño: Rincón 404 Food Park

La aplicación sigue operando como Mideli en una sola interfaz, pero la
migración multinegocio ya está versionada localmente en rebanadas aditivas.
Durante septiembre de 2026 se preparó la evolución para `Rincón 404 Food Park`:

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

### Auditoría de cierre de la primera rebanada

- La rama `codex/whatsapp-orders` quedó con lint, build y `git diff --check`
  correctos. GitHub Actions validó la revisión `06a628a` en el run
  `35461058199`, incluyendo las migraciones y 260 checks pgTAP.
- La versión compatible se publicó en producción en `mideli.vercel.app` y las
  migraciones `20260919082935` a `20260919134500`, más
  `20260919200649_multibusiness_security_revoke_staff_anon.sql` y
  `20260919202503_multibusiness_scope_staff_credentials.sql` y
  `20260919203147_multibusiness_scope_visibility.sql` y
  `20260919203953_multibusiness_context_metadata_scope.sql`, quedaron
  aplicadas en Supabase. `npx supabase db push --linked --dry-run` reporta
  `upToDate: true`.
- El preflight remoto antes y después del corte conservó 214 pedidos, 215
  transacciones, 43 turnos, 7 categorías, 52 productos, 5 insumos y cero
  huérfanos. La verificación repetible está en
  `supabase/verification/mideli_post_multibusiness.sql`; el contexto por
  perfil se comprueba en `supabase/verification/mideli_runtime_context.sql`.
- El POS ya puede resolver un negocio seleccionado, pero la comanda mixta de
  una mesa y la creación atómica de cuentas por negocio todavía no están
  conectadas a una experiencia completa de Mesero. No se debe presentar el
  selector como prueba de que Just Dipping ya está operativo.
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
  la sesión se cierra y vuelve al login con una razón técnica, evitando bucles
  entre `/dashboard` y una vista sin permisos. El fallback por rol queda solo
  para instalaciones antiguas donde todavía no existe la función de contexto.

La auditoría remota del 2026-09-19 confirmó una organización activa, un negocio
Mideli activo, cuatro membresías activas y aislamiento sin filas operativas sin
negocio. Los avisos `anon` de RPC privilegiadas fueron revocados; permanecen
avisos informativos para RPC `SECURITY DEFINER` autenticadas que validan
capacidades internamente. La protección de contraseñas filtradas de Supabase
Auth sigue pendiente de activarse manualmente antes del piloto prolongado.
El dump local no pudo generarse en este equipo porque la CLI requiere Docker o
Podman; no se debe presentar ese respaldo como existente. Just Dipping y un
segundo negocio aún no están creados.

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
