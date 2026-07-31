# Mideli - Instrucciones para Agentes

## Contexto de trabajo

Antes de modificar el proyecto, lee `.opencode/plans/mideli-context.md`. Ese archivo contiene el contexto de producto, las decisiones tomadas durante el desarrollo, el estado real de los módulos y los pendientes conocidos. `AGENTS.md` contiene las reglas obligatorias; el contexto extendido no las reemplaza.

El archivo `.opencode/plans/handoff.md` es histórico. Si contradice al contexto extendido o al código actual, verifica el código y usa `mideli-context.md` como referencia principal.

## Info del Proyecto
- **Repositorio**: https://github.com/charmar11/mideli
- **Proyecto Supabase**: qgnjennimvbrfxvcmowb
- **URL Supabase**: https://qgnjennimvbrfxvcmowb.supabase.co

## Stack

- **Framework**: Next.js 16 (App Router)
- **Lenguaje**: TypeScript
- **Estilos**: Tailwind CSS v4
- **UI**: shadcn/ui (Base UI)
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Email**: Resend
- **SMS**: Twilio
- **Pagos**: Polar

## Comandos de Verificación

**SIEMPRE ejecutar estos antes de dar trabajo por terminado:**

```bash
npm run lint          # Verificación ESLint
npm run build         # Build TypeScript + Next.js (detecta errores de tipos)
```

Si el build falla, corregir errores antes de continuar.

## Estilo de Código

- Usar modo estricto de TypeScript
- Preferir componentes funcionales con hooks
- Usar alias de importación `@/` (ej: `import { Button } from '@/components/ui/button'`)
- Seguir patrones de shadcn/ui para componentes
- Usar Server Components por defecto, Client Components solo cuando sea necesario (`'use client'`)

## Patrones de Supabase

- **Cliente navegador**: `import { createClient } from '@/lib/supabase/client'` (para Client Components)
- **Cliente servidor**: `import { createClient } from '@/lib/supabase/server'` (para Server Components/Actions)
- **Middleware**: `src/middleware.ts` maneja refresh de sesión y protección de rutas

## Servicios del Servidor

- **Email**: `import { sendEmail } from '@/server/resend'`
- **SMS**: `import { sendSMS } from '@/server/twilio'`
- **Pagos**: `import { polar } from '@/server/polar'`

## Variables de Entorno

Nunca commitear `.env.local`. Usar `.env.example` como fuente de verdad para variables requeridas.

## Reglas operativas adicionales

- No leer, imprimir, copiar ni solicitar tokens, claves privadas o valores de `.env.local`.
- No ejecutar `supabase db reset --linked`, borrar tablas remotas ni eliminar datos sin una autorización explícita para esa operación concreta.
- Los cambios de esquema deben vivir en una nueva migración dentro de `supabase/migrations/` y revisarse con `npx supabase db push --linked --dry-run` antes de aplicarse.
- Antes de tocar una zona sensible del código, revisar `git status` y conservar cambios no relacionados.
- Mantener la interfaz en español, optimizada para tablets y operación rápida durante un turno real.
- Respetar la identidad oscura de Mideli y evitar la raya larga en textos de interfaz y documentación.
- No afirmar que una integración está completa sin comprobar el código, la base remota y el flujo real.

## Testing

No hay framework de testing configurado aún. Agregar cuando sea necesario.

## Despliegue

- **Hosting**: Vercel (pendiente de configurar)
- **Base de datos**: Supabase (proyecto: `qgnjennimvbrfxvcmowb`)

## Notas

- Sistema de gestión para un local de comida (Burger & Sushi)
- Un solo local, no multi-tenant
- UI en español (mercado México/LATAM)
- Identidad de marca: fondo negro, rosa #F5145F, crema #FBF8E7, dorado #F6DDA4
- Tipografías: Pacifico (marca), Sora (headings), Karla (body), JetBrains Mono (datos)
- Vistas principales: Mesero (POS) y Cocina (KDS) con toggle en la misma URL
- El flujo de pedido es: armar pedido, elegir zona y mesa en el plano si es comedor, confirmar y enviar a cocina
- El mapa de mesas muestra todas las zonas activas juntas y permite mover zonas y mesas desde administración
- El inventario es configurable por insumos, recetas, existencias y movimientos
