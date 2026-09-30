# Rincón 404 Food Park

Sistema interno para operar negocios independientes en una sola aplicación.
Mideli y Just Dipping comparten acceso, pero conservan catálogo, pedidos, caja,
cobros, personal y licencia por negocio. WhatsApp continúa exclusivo de Mideli.

Si eres el dueño, puedes pedir cambios en palabras normales. Para investigar un
problema ayuda indicar la cuenta y el negocio, qué hiciste, qué esperabas y qué
apareció. Una captura, folio u hora ayudan; no necesitas conocer el código.
Consulta el [proceso de trabajo](docs/WORKFLOW.md) para saber cómo avanzaremos.

## Cómo orientarse rápidamente

Si eres una persona o un agente de IA que entra por primera vez:

1. Lee [AGENTS.md](AGENTS.md) para reglas obligatorias de trabajo.
2. Lee el [índice del proyecto](docs/README.md) para encontrar cada módulo y
   distinguir guías vigentes de planes históricos.
3. Antes de modificar, lee completo
   [el contexto acumulado](.opencode/plans/mideli-context.md).
4. Revisa `git status`, el código afectado y, cuando corresponda, el estado
   remoto. Conserva los cambios existentes.
5. Sigue el [proceso de trabajo](docs/WORKFLOW.md) y consulta
   [Operación](docs/OPERATIONS.md) antes de publicar o tocar Supabase.

El código actual y el estado remoto verificable tienen prioridad si existe una
contradicción. Un deploy desde esta carpeta puede incluir cambios sin commit;
GitHub no representa necesariamente la versión publicada.

## Producto actual

La aplicación es una herramienta interna para el personal de Rincón 404 durante
un turno real en Ciudad Obregón, Sonora. En la última comprobación documentada,
Mideli y Just Dipping figuraban activos. El estado operativo y las licencias
deben volver a consultarse cuando una tarea dependa de ellos.

Flujos principales:

- Mesero arma pedidos de comedor, domicilio o para llevar.
- Cocina recibe pedidos en un KDS y actualiza sus estados.
- El personal cobra con efectivo, tarjeta o transferencia mediante un libro mayor transaccional.
- Cada dueño administra las funciones autorizadas de su negocio; la cuenta de
  plataforma configura negocios, personal global y licencias.
- Meseras globales pueden operar los negocios para los que tienen permisos.
- WhatsApp recibe pedidos para Mideli y permite relevo humano.
- Just Dipping tiene catálogo y combos. Sus tickets anteriores de Firebase aún
  no figuran importados en el archivo histórico, según la última verificación
  documentada; no son ventas operativas.

## Límites actuales

La estructura multinegocio y las comandas mixtas de comedor ya están en el
código. Las comandas mixtas de domicilio y para llevar siguen pendientes. La
prueba completa en dispositivos, impresora y cuentas reales del local también
sigue pendiente; las pruebas automáticas no sustituyen ese piloto.

## Stack actual

- Next.js 16 con App Router.
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
npm run dev
```

Abre `http://localhost:3000`.

La configuración local requiere variables cuyos nombres se documentan en
`.env.example`. No leer, imprimir, copiar ni compartir valores de `.env.local`.

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
| `/settings/negocios` | Administración de plataforma y negocios |
| `/settings/licencias` | Licencias independientes por negocio |
| `/control/licencia` | Control técnico legado; no administra vigencias comerciales |

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
docs_dev/                Bitácoras y planes fechados, no estado actual
```

## Verificación mínima antes de terminar

```bash
npm run lint
npm run build
npx playwright test
```

Si se modifica Supabase, también revisar la lista de migraciones y ejecutar el dry-run indicado en `docs/OPERATIONS.md`. No usar `supabase db reset --linked`.

## Estado y despliegue

La aplicación está publicada en [mideli.vercel.app](https://mideli.vercel.app).
El procedimiento de publicación está en [Operación](docs/OPERATIONS.md) y la
aceptación en dispositivos reales en [Piloto](docs/releases/v0.9-piloto.md).

Los cambios sin commit pertenecen al trabajo en curso. Antes de que otra IA trabaje desde un clon de GitHub, hay que consolidar en Git la versión que se desea considerar fuente de verdad.

## Licencia

Privado. Todos los derechos reservados.
