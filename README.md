# Mideli

Sistema operativo para un restaurante de un solo local: punto de venta, cocina, caja, inventario, menú, analíticas y atención de pedidos por WhatsApp.

## Cómo orientarse rápidamente

Si eres una persona o un agente de IA que entra por primera vez:

1. Lee `AGENTS.md` para reglas obligatorias de trabajo.
2. Lee `.opencode/plans/mideli-context.md` para decisiones de producto y estado conocido.
3. Lee `PRODUCT.md` para el alcance funcional.
4. Lee `DESIGN.md` para la identidad visual y reglas de interfaz.
5. Consulta `docs/ARCHITECTURE.md` para seguir los módulos y flujos técnicos.
6. Consulta `docs/OPERATIONS.md` antes de cambiar Supabase, variables de entorno o despliegues.
7. Consulta `docs/DECISIONS.md` antes de modificar un flujo que ya tenga una decisión aprobada.

La documentación anterior describe el sistema; el código actual y el estado remoto verificable tienen prioridad si existe una contradicción.

## Producto

Mideli es una herramienta interna para el personal durante un turno real en Ciudad Obregón, Sonora. No es un marketplace, no es multi-sucursal y no tiene una superficie de pedido para el comensal.

Flujos principales:

- Mesero arma pedidos de comedor, domicilio o para llevar.
- Cocina recibe pedidos en un KDS y actualiza sus estados.
- El personal cobra con efectivo, tarjeta o transferencia mediante un libro mayor transaccional.
- Owner y admin administran menú, categorías, mesas, usuarios, inventario, caja, impresión y analíticas.
- WhatsApp recibe pedidos, conserva el contexto del cliente y permite relevo humano cuando el bot no puede continuar.

## Stack actual

- Next.js 16.2.12 con App Router.
- React 19 y TypeScript estricto.
- Tailwind CSS v4 y shadcn/ui sobre Base UI.
- Supabase para PostgreSQL, Auth, RLS, Realtime y Storage.
- Zustand para estado local de catálogo, carrito, órdenes, mesas, inventario y caja.
- Serwist para la PWA y el service worker.
- Resend, Twilio y Polar como integraciones de servidor preparadas.
- Gemini para interpretación semántica acotada del flujo conversacional de WhatsApp.
- Google Maps para geocodificación y rutas del domicilio.
- Vercel para producción.

## Requisitos y desarrollo local

- Node.js 24 o posterior.
- npm 11 o posterior.
- Una cuenta de Supabase configurada para el entorno de trabajo.

```bash
git clone https://github.com/charmar11/mideli.git
cd mideli
npm install
cp .env.example .env.local
npm run dev
```

Abre `http://localhost:3000`.

No se debe imprimir, copiar ni compartir `.env.local`. Usa `.env.example` como referencia de nombres, no como almacén de credenciales.

## Scripts

```bash
npm run dev          # Desarrollo local
npm run lint         # ESLint
npm run build        # Build de producción y comprobación de tipos
npm run start        # Servir el build local
npm run test:e2e     # Suite Playwright
```

Playwright tiene proyectos para escritorio, tablet táctil y móvil táctil. La suite vive en `tests/e2e/`.

## Rutas principales

| Ruta | Propósito |
|---|---|
| `/login` | Acceso del personal |
| `/dashboard/mesero` | POS y creación de pedidos |
| `/dashboard/cocina` | KDS y estados de cocina |
| `/dashboard/whatsapp` | Bandeja, clientes, configuración y operaciones de WhatsApp |
| `/dashboard/analiticas` | Analíticas y control diario, owner/admin |
| `/menu` | Categorías, platillos, imágenes y orden del menú |
| `/settings/mesas` | Plano global de zonas y mesas |
| `/settings/inventario` | Insumos, recetas, compras y conteos |
| `/settings/caja` | Turnos, movimientos, cortes e historial |
| `/settings/impresion` | Estación de impresión de cocina |
| `/settings/diagnostico` | Diagnósticos operativos |
| `/control/licencia` | Control privado de licencia del vendedor |

## Estructura técnica

```text
src/app/                 Rutas, layouts, API routes y service worker
src/components/          Interfaces por dominio
src/components/ui/       Primitivas compartidas de UI
src/lib/actions/         Server Actions y operaciones mutantes
src/lib/stores/          Estado cliente y suscripciones Realtime
src/lib/whatsapp/        Motor conversacional, Meta, clientes y operaciones
src/lib/supabase/        Clientes browser/server y utilidades de sesión
src/server/              Integraciones server-only
src/types/               Contratos TypeScript del dominio
supabase/migrations/     Evolución versionada del esquema
supabase/functions/      Edge Functions de notificaciones y atención
tests/e2e/               Regresiones de flujos de producto
docs/                    Arquitectura, operación y decisiones
```

## Verificación mínima antes de terminar

```bash
npm run lint
npm run build
npx playwright test
```

Si se modifica Supabase, también revisar la lista de migraciones y ejecutar el dry-run indicado en `docs/OPERATIONS.md`. No usar `supabase db reset --linked`.

## Estado y despliegue

La aplicación está publicada en [mideli.vercel.app](https://mideli.vercel.app). El procedimiento de publicación y la comprobación de salud están en `docs/OPERATIONS.md`.

Los cambios sin commit pertenecen al trabajo en curso. Antes de que otra IA trabaje desde un clon de GitHub, hay que consolidar en Git la versión que se desea considerar fuente de verdad.

## Licencia

Privado. Todos los derechos reservados.
