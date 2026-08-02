# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary:** Meseros en servicio real (salón, barra o caja). Usan Mideli bajo presión de turno para tomar pedidos, armar carrito con modificadores, enviar a cocina, seguir estados y cobrar.

**Secondary:**
- Cocina: lee la cola de pedidos (KDS), marca progreso y listos; trabaja con urgencia por tiempo en pantalla.
- Dueño / admin: gestiona menú, usuarios/roles y revisa analíticas del local.

No hay usuario comensal en el producto actual (sin pedidos online del cliente).

## Product Purpose

Mideli es el sistema de gestión de pedidos de un solo local de comida (Burger & Sushi) en Cd. Obregón, Sonora. Existe para que el equipo opere el servicio del día a día: capturar órdenes, coordinar cocina y cerrar cobros sin depender de papel o herramientas genéricas desconectadas de la marca del local.

**Éxito:** pedidos correctos y rápidos de mesa/caja a cocina y de listo a cobro, con catálogo y equipo administrables por el dueño.

## Positioning

No es un POS genérico multi-local. Es la herramienta operativa de **Mideli** — con la identidad y el lenguaje del local dentro de la operación — hecha a la medida de un solo restaurante Burger & Sushi, no de una cadena.

## Operating Context

- Un local físico: C. Yaqui 404 Oriente, Cd. Obregón, Sonora.
- Uso en tablets/móviles/navegador (PWA) durante el turno.
- Flujos de servicio: comedor (mesa), para llevar y domicilio.
- Mesero y cocina comparten el mismo sistema con vistas distintas y actualizaciones en tiempo real.
- UI y copy en español (mercado México / LATAM).
- Ritual del turno: abrir sesión → tomar pedidos → cocina prepara → listo → servir/entregar → cobrar → (admin) menú, usuarios, analíticas.

## Capabilities and Constraints

**Capacidades confirmadas:**
- Auth de staff (Supabase) con roles: `owner`, `admin`, `waiter`, `kitchen`.
- POS mesero: catálogo por categorías, modificadores, carrito, notas, tipos de orden, mesa/cliente, cobro (efectivo / tarjeta / transferencia).
- KDS cocina: cola activa, urgencia por tiempo, cambio de estados, feedback sonoro.
- Admin de menú: categorías, productos, precios, activar/desactivar, modificadores, imágenes.
- Settings (owner/admin): altas y gestión de usuarios del local.
- Analíticas del local (resúmenes, productos top, desgloses).
- Estados de orden: `pending` → `in_kitchen` → `ready` → `served` → `paid` (o `cancelled`).
- Stack: Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Supabase (DB + Auth + Realtime + Storage), PWA (Serwist). Integraciones preparadas: Resend, Twilio, Polar.

**Restricciones:**
- Un solo local; no multi-tenant.
- Sin superficie de pedidos para el comensal (operación interna solamente).
- Rutas protegidas: `/dashboard`, `/menu`, `/settings`; admin de settings solo owner/admin.
- Hosting Vercel pendiente de configurar; fuente de verdad de env en `.env.example`.
- Sin framework de tests configurado aún.

**Superficies de producto a preservar:**
- `/login` — acceso staff
- `/dashboard/mesero` — POS
- `/dashboard/cocina` — KDS
- `/dashboard/analiticas` — métricas
- `/menu` — catálogo
- `/settings` — usuarios y roles
- `/` — home mínima de marca (no es el foco operativo)

## Brand Commitments

- Nombre: **Mideli**
- Categoría del local: **Burger & Sushi**
- Tagline: no se utiliza un slogan público.
- Ubicación pública: C. Yaqui 404 Oriente, Cd. Obregón, Sonora
- Voz de producto: español claro, operativo, del turno (mesero/cocina/dueño)
- La marca del local debe sentirse **dentro de la operación**, no solo en marketing externo
- **Preferencia visual (canon):** UI de POS de categoría jugada a full fidelity, sin ironía ni “quirk” forzado. Barra de craft: **Toast, Lightspeed, Square, Mercado Pago Point**. La marca vive en wordmark + acento primario; la herramienta debe desaparecer en la tarea. Velocidad del turno gana sobre expresión: más clics o más lento = falla.

(La identidad visual detallada vive en DESIGN.md.)

## Evidence on Hand

- Código de producto en `src/` (rutas, POS, KDS, menú, settings, analíticas, stores, tipos).
- Metadata y PWA: `src/app/layout.tsx`, `src/app/manifest.ts`, iconos en `public/`.
- Imágenes de marca/contenido en `imagenes/` y `public/` según existan.
- Docs internas: `AGENTS.md`, `README.md`.
- Backend: proyecto Supabase `qgnjennimvbrfxvcmowb`.

**No fabricar:** testimonios de clientes, métricas de negocio no medidas, comparación pública con competidores, precios de menú o claims de prensa que no estén en el repo.

## Product Principles

1. **El mesero primero** — el camino feliz del POS debe ser el más rápido y claro bajo presión de servicio.
2. **Cocina sin fricción** — el KDS prioriza legibilidad, urgencia y un toque para avanzar estados.
3. **Marca en la herramienta** — Mideli se siente del local; no un panel anónimo de software.
4. **Un local, una verdad** — catálogo, órdenes y roles de este restaurante; sin abstracciones de cadena.
5. **Operación completa del turno** — de pedido a cobro y de menú a equipo, en el mismo sistema.
