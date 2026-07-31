# Mideli: contexto completo para OpenCode

Actualizado: 2026-07-30

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

La base remota tiene 6 categorías y 39 productos en el corte del 2026-07-31. Los toppings no son productos independientes: se agregan como un grupo opcional dentro de cada sushi.

### Mesas y zonas

El sistema debe permitir que el dueño de un local configure su plano sin depender de una distribución fija.

- Todas las zonas activas se ven en un mismo canvas, no como pantallas separadas por zona.
- Cada zona tiene nombre, tamaño, posición y contador de mesas.
- Las zonas se pueden mover en administración.
- Las mesas se pueden mover dentro de su zona, cambiar de nombre, forma y capacidad.
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

La interfaz administrativa vive en `/settings/inventario`. La base ya tiene `inventory_items`, `inventory_recipes` e `inventory_movements`. En el corte actual no hay insumos capturados. El descuento automático de inventario al vender todavía debe validarse o implementarse con una operación transaccional antes de considerarse terminado.

## 5. Arquitectura actual

Stack:

- Next.js 16.2.10 con App Router.
- React 19 y TypeScript estricto.
- Tailwind CSS v4.
- shadcn/ui sobre Base UI.
- Zustand para estado de catálogo, carrito, órdenes, mesas, inventario y UI.
- Supabase para PostgreSQL, Auth, RLS, Realtime y Storage.
- Serwist para PWA.
- Resend, Twilio y Polar preparados como servicios del servidor.

Rutas principales:

- `/`: home mínima de marca.
- `/login`: acceso del personal.
- `/dashboard/mesero`: POS.
- `/dashboard/cocina`: KDS.
- `/dashboard/analiticas`: métricas.
- `/menu`: administración de categorías y platillos.
- `/settings`: personal y roles.
- `/settings/mesas`: editor del plano global.
- `/settings/inventario`: inventario, recetas y movimientos.

El layout del dashboard cambia la navegación según el tamaño:

- Desktop: rail lateral.
- Tablet: header superior con navegación horizontal.
- Móvil: header compacto y navegación inferior.

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
| `src/components/admin/inventory-manager.tsx` | Administración de inventario y recetas |
| `src/lib/stores/catalog-store.ts` | Lectura y CRUD de categorías y menú, con caché de 30 s en carga conjunta |
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
- CLI inicializada en `supabase/config.toml`.
- CLI enlazada al proyecto remoto.
- Migraciones locales y remotas alineadas: `00001` a `00005`.

Tablas de dominio:

`profiles`, `categories`, `menu_items`, `orders`, `order_items`, `order_status_log`, `table_zones`, `restaurant_tables`, `inventory_items`, `inventory_recipes`, `inventory_movements`.

Enums:

- Estados: `pending`, `in_kitchen`, `ready`, `served`, `paid`, `cancelled`.
- Tipos de orden: `comedor`, `domicilio`, `para_llevar`.
- Pago: `efectivo`, `tarjeta`, `transferencia`.
- Roles: `owner`, `admin`, `waiter`, `kitchen`.

Patrones obligatorios:

- Navegador: `createClient` desde `src/lib/supabase/client.ts`.
- Servidor o acciones: `createClient` desde `src/lib/supabase/server.ts`.
- No usar `SUPABASE_SERVICE_ROLE_KEY` en Client Components.
- Toda modificación de esquema requiere migración nueva y revisión de RLS.
- Verificar con `npx supabase migration list` y `npx supabase db push --linked --dry-run`.
- No ejecutar `db reset --linked`.
- Nunca guardar tokens en este documento, en el código, en commits ni en respuestas.

## 9. Estado real y pendientes

Estado remoto verificado el 2026-07-31:

- 6 categorías.
- 39 productos.
- 2 zonas.
- 5 mesas.
- 0 insumos.
- 0 órdenes históricas.

El menú vigente proviene de `Menu_Mideli_Completo_Provisional.docx` mediante la migración `20260731060825_menu_reset_from_docx.sql`. Mango Habanero fue reemplazado por Buffalo Ranch, Cajun, Ajo Parmesano y Honey Mustard. Los modificadores de sabor y proteína tienen precio cero; solo "Con papas" agrega 30 pesos.

Los toppings Dracarys, Mr. Crab, Cordon Blue, Gratinado y Especial viven como un grupo opcional en los 15 sushis, con precios de 30, 35, 30, 25 y 35 pesos.

El Word no muestra precio para Low Carb, Limonada Natural, Limonada Mineral, Té Helado ni Refrescos de temporada. Se conservaron temporalmente los precios anteriores de 150, 40, 45, 40 y 30 pesos, respectivamente.

Los conteos son una fotografía, no una garantía futura. Si una tarea depende de ellos, volver a consultar.

Pendientes prioritarios:

1. Hacer QA manual del POS en tabletas reales y corregir cualquier clipping, panel cortado o categoría ilegible.
2. Revisar el flujo completo de cobro y validar efectivo, tarjeta y transferencia con una orden real de prueba.
3. Hacer transaccional el descuento de inventario por receta cuando corresponda al negocio.
4. Revisar atomicidad de creación de orden y sus items, especialmente el cálculo del siguiente número.
5. Completar auditoría de RLS y permisos por rol antes de producción.
6. Agregar pruebas para stores y flujos críticos.
7. Preparar despliegue en Vercel y revisar variables sin exponer secretos.

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
