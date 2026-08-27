# Mideli: contexto completo para OpenCode

Actualizado: 2026-08-27

Este documento resume lo que se ha decidido y construido para Mideli. Sirve como memoria de trabajo para OpenCode. Antes de modificar algo, confirma los detalles contra el código actual y contra la base de datos cuando el cambio toque Supabase.

## 1. Producto

Mideli es un sistema operativo para un solo local de comida Burger & Sushi en Ciudad Obregón, Sonora. Lo usan personas del equipo durante el turno, no clientes finales.

Usuarios principales:

- Mesero: arma pedidos en tablet, elige tipo de servicio, selecciona mesa, agrega notas, envía a cocina y cobra.
- Cocina: consulta la cola de pedidos, prepara y cambia estados.
- Dueño o administrador: administra menú, categorías, usuarios, mesas, zonas, inventario y analíticas.

Objetivo del producto: que el equipo pueda pasar de pedido a cocina y de pedido listo a cobro con el menor número de pasos posible, sin depender de papel.

No es una plataforma multi-sucursal ni un marketplace. El alcance actual es un solo local y operación interna.

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

La migración `00005_global_table_map.sql` agrega geometría a `table_zones` y acomoda las zonas activas existentes en un grid inicial. La base remota tiene 2 zonas y 5 mesas en el corte del 2026-07-30.

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
- La comanda reúne cliente, responsable, pedido, total, entrega, pago, dirección, copia y acceso a Google Maps.
- El chat baja al final al abrirlo, pero conserva la posición cuando el personal revisa mensajes anteriores y avisa si llegan mensajes nuevos.
- Responder desde Mideli toma la conversación y pausa el bot; también se puede devolver al bot o cerrar.
- Owner y admin pueden limpiar el contenido conversacional sin eliminar pedidos, folios ni auditoría.
- Los nombres públicos recibidos en el webhook de Meta se guardan en `customers.display_name` para reconocer al cliente.
- Catálogo y Resumen permanecen visibles; Entregas, Horarios, Bot y Diagnóstico viven bajo `Configurar`. El simulador fue retirado de la interfaz y del bundle.
- La carga inicial ya no consulta el catálogo completo para un simulador. La bandeja usa una instantánea ligera cada dos segundos solo mientras la página está visible.

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
| `src/components/license-heartbeat.tsx`, `src/lib/license.ts`, `src/lib/license-server.ts` | Vigencia de licencia en cliente y servidor |
| `src/proxy.ts` | Sesión, licencia y control de rutas por rol (reemplaza a `src/middleware.ts`) |
| `src/lib/push-notifications.ts`, `src/components/dashboard/ready-order-notifier.tsx` | Push y aviso sonoro de pedidos listos |
| `src/lib/product-images.ts` | Carga y limpieza de fotos de productos |
| `src/lib/order-location.ts` | Snapshot de ubicación del pedido (zona y mesa) |
| `src/lib/stores/catalog-store.ts` | Lectura y CRUD de categorías y menú, con caché de 30 s en carga conjunta |
| `src/components/admin/category-manager.tsx` | Edición y orden accesible de categorías por mouse, tacto y teclado |
| `src/components/dashboard/dashboard-shell.tsx` | Navegación responsiva por rol, operación y grupos administrativos |
| `src/lib/stores/cart-store.ts` | Estado local del pedido actual |
| `src/lib/stores/order-store.ts` | CRUD de órdenes, estados, cobro y suscripción Realtime |
| `src/lib/stores/tables-store.ts` | Lectura y CRUD del mapa, con deduplicación y caché de 30 s |
| `src/lib/stores/inventory-store.ts` | Insumos, recetas, movimientos y ajustes de stock |
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

Antes de añadir más optimizaciones, medir qué interacción sigue lenta. No reemplazar consultas reales por datos falsos para aparentar velocidad.

## 8. Supabase y seguridad

Proyecto:

- Project ref: `qgnjennimvbrfxvcmowb`.
- URL pública: `https://qgnjennimvbrfxvcmowb.supabase.co`.
- CLI inicializada en `supabase/config.toml` (versionada en git desde 2026-08-02 junto con todas las migraciones).
- CLI enlazada al proyecto remoto.
- Migraciones locales y remotas alineadas: 43 migraciones, de `00001` a `20260814030217`.

Tablas de dominio (verificado 2026-08-02, todas con RLS):

`profiles`, `categories`, `menu_items`, `orders`, `order_items`, `order_status_log`, `order_folio_counter`, `table_zones`, `restaurant_tables`, `table_map_labels`, `inventory_items`, `inventory_recipes`, `inventory_movements`, `inventory_lots`, `inventory_receipts`, `inventory_receipt_lines`, `inventory_purchase_orders`, `inventory_purchase_order_lines`, `inventory_counts`, `inventory_count_lines`, `payment_transactions`, `payment_tenders`, `payment_order_allocations`, `payment_item_allocations`, `cash_shifts`, `cash_movements`, `cash_shift_adjustments`, `cash_shift_opening_float_changes`, `cash_shift_pending_orders`, `app_license`, `push_subscriptions`, `user_onboarding_progress`.

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

Estado remoto verificado funcionalmente el 2026-08-09. Los conteos inferiores son la última fotografía detallada del 2026-08-02:

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

El menú vigente proviene de `Menu_Mideli_Completo_Provisional.docx` mediante la migración `20260731060825_menu_reset_from_docx.sql`. Mango Habanero fue reemplazado por Buffalo Ranch, Cajun, Ajo Parmesano y Honey Mustard. Los modificadores de sabor y proteína tienen precio cero; solo "Con papas" agrega 30 pesos.

Los toppings Dracarys, Mr. Crab, Cordon Blue, Gratinado y Especial viven como un grupo opcional en los 15 sushis, con precios de 30, 35, 30, 25 y 35 pesos.

El Word no muestra precio para Low Carb, Limonada Natural, Limonada Mineral, Té Helado ni Refrescos de temporada. Se conservaron temporalmente los precios anteriores de 150, 40, 45, 40 y 30 pesos, respectivamente.

Los conteos son una fotografía, no una garantía futura. Si una tarea depende de ellos, volver a consultar.

### Monitoreo de errores

Sentry está integrado manualmente con `@sentry/nextjs` 10.69.0 en navegador, Node.js y Edge. Conserva los wrappers de Serwist y las pantallas de error de Mideli. Captura errores y trazas con 10 por ciento de muestreo en producción, excluye `/api/health` y descarta ruido conocido de extensiones.

La política es de privacidad estricta: no recolecta identidad, cookies, headers, cuerpos, query params, variables locales ni contenido operativo; anonimiza rutas locales y evita ubicación, hostname, hardware y cultura. Vercel tiene las variables de runtime en Development y Production. Preview y el token externo de source maps siguen pendientes. La verificación real quedó documentada en `docs_dev/sentry-monitoring/`.

### Control diario y rentabilidad

Analíticas incorpora un centro de control para owner/admin con alertas de caja, cocina, inventario, cobertura de recetas, productos sin movimiento y márgenes estimados. El reporte del día anterior puede enviarse a un único correo reemplazable, con una ruta cron protegida y registro idempotente por fecha. Para entregar a correos distintos a la cuenta de prueba, el proveedor necesita un remitente verificado. Antes de desplegar esta fase, Vercel debe tener `CRON_SECRET` configurado.

La disponibilidad manual de productos fue eliminada por decisión del dueño. Menú, Cocina y POS ya no muestran ni bloquean estados Disponible, Limitado o Agotado. El inventario se descuenta por recetas y puede quedar negativo.

Los indicadores de caja excluyen cortes archivados. La eliminación definitiva solo se permite sobre cortes cerrados, archivados y sin pedidos, pagos, movimientos, correcciones ni traspasos asociados. Los cortes con actividad real permanecen archivados y fuera de las métricas. Impresión y Diagnóstico tienen regreso visible al panel, igual que Caja, Inventario, Mesas, Menú y Personal.

Pendientes prioritarios:

1. Ejecutar el checklist de piloto de `docs/releases/v0.9-piloto.md` en tablet, móvil, laptop e impresora reales.
2. Diseñar e implementar un modo de contingencia para continuar tomando pedidos ante una caída de internet.
3. Completar monitoreo técnico, source maps privados y un procedimiento probado de respaldo y restauración.
4. Validar en operación real todos los cobros, correcciones, cierres de caja, impresión, inventario negativo y notificaciones PWA.
5. Agregar pruebas automatizadas para pedidos, cobro, caja, impresión, inventario y permisos.
6. Después de estabilizar el piloto, priorizar clientes/lealtad y pedidos directos.

El plan ordenado para continuar vive en `.opencode/plans/next-session-plan.md`.

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
