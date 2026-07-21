# Handoff: Configuración Inicial de Mideli

## Resumen del Proyecto

**Mideli** es un sistema SaaS para restaurantes construido con:
- Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- Supabase (PostgreSQL, Auth, Storage)
- shadcn/ui (componentes UI)
- Resend (emails)
- Polar (pagos)
- GitHub (control de versiones)

**Repositorio:** https://github.com/charmar11/mideli  
**Proyecto Supabase:** qgnjennimvbrfxvcmowb  
**URL Supabase:** https://qgnjennimvbrfxvcmowb.supabase.co

---

## Skills Instaladas (18)

Todas las skills están en `.opencode/skills/` y se activan automáticamente según el contexto:

### Desarrollo Frontend
- **frontend-design** - Diseño visual distintivo e intencional
- **interface-design** - Diseño de interfaces de usuario
- **vercel-react-best-practices** - Optimización de rendimiento React/Next.js

### Planificación y Creatividad
- **brainstorming** - Exploración de intención y requisitos antes de implementar
- **revenue-centric-design** - Diseño centrado en conversión y monetización

### Backend y Base de Datos
- **supabase** - Todo lo relacionado con Supabase
- **supabase-postgres-best-practices** - Optimización de PostgreSQL
- **postgresql-table-design** - Diseño de tablas PostgreSQL
- **api-design-principles** - Principios de diseño REST/GraphQL

### Calidad y Debugging
- **systematic-debugging** - Debugging sistemático de problemas
- **error-handling-patterns** - Patrones de manejo de errores
- **debug-issue** - Navegación de código con grafo de conocimiento
- **explore-codebase** - Exploración de estructura del código

### Code Review
- **review-pr** - Revisión de PRs con análisis de impacto
- **review-changes** - Revisión estructurada de cambios

### Documentación y Prompts
- **changelog-generator** - Generación automática de changelogs
- **prompt-engineering-patterns** - Patrones de ingeniería de prompts

### Otros
- **grill-me** - Entrevista para mejorar planes o diseños

---

## Configuración de Servicios

### Supabase (Backend + Base de Datos)

**Estado:** ✅ Configurado y autenticado

**Variables de entorno:**
- `NEXT_PUBLIC_SUPABASE_URL` - URL del proyecto Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Clave pública anónima
- `SUPABASE_SERVICE_ROLE_KEY` - Clave de servicio (solo servidor)

*Ver `.env.local` para los valores reales.*

**MCP de Supabase:**
- Configurado en `~/.config/opencode/opencode.json`
- Autenticado con OAuth
- URL: `https://mcp.supabase.com/mcp?project_ref=qgnjennimvbrfxvcmowb`

**Archivos creados:**
- `src/lib/supabase/client.ts` - Cliente para navegador
- `src/lib/supabase/server.ts` - Cliente para servidor
- `src/lib/supabase/middleware.ts` - Helper para refresh de sesión
- `src/middleware.ts` - Middleware Next.js

---

### Resend (Emails)

**Estado:** ✅ Configurado y probado

**Variables de entorno:**
- `RESEND_API_KEY` - API key de Resend
- `RESEND_FROM_EMAIL` - Email remitente

*Ver `.env.local` para los valores reales.*

**Archivo creado:**
- `src/server/resend.ts` - Cliente de Resend con función `sendEmail()`

**Prueba realizada:**
- Email de prueba enviado exitosamente a blackdayg@gmail.com
- ID del email: 1834fab5-492a-449a-9dbd-e5e2b08b871e

---

### Polar (Pagos)

**Estado:** ✅ Configurado y verificado

**Variables de entorno:**
- `POLAR_ACCESS_TOKEN` - Token de acceso a Polar API
- `POLAR_WEBHOOK_SECRET` - Secreto para webhooks (pendiente)
- `POLAR_SERVER` - Entorno (production/sandbox)

*Ver `.env.local` para los valores reales.*

**Archivo creado:**
- `src/server/polar.ts` - Cliente de Polar

**Organización verificada:**
- Nombre: pierspenunuri
- ID: 2b069460-7605-4dce-8342-16c3036e7971
- Moneda por defecto: MXN (pesos mexicanos)
- Estado: created

---

### Twilio (SMS)

**Estado:** ⏭️ Omitido por ahora

El usuario indicó que no necesita SMS en este momento. Las variables están vacías en `.env.local` pero el archivo `src/server/twilio.ts` ya está creado y listo para usar.

---

## Estructura del Proyecto

```
mideli/
├── .opencode/
│   └── skills/              # 18 skills instaladas
├── src/
│   ├── app/                 # Rutas Next.js (App Router)
│   ├── components/
│   │   └── ui/             # Componentes shadcn/ui
│   ├── lib/
│   │   ├── supabase/       # Clientes de Supabase
│   │   └── utils.ts        # Utilidades (cn, etc.)
│   ├── server/
│   │   ├── resend.ts       # Cliente de Resend
│   │   ├── twilio.ts       # Cliente de Twilio
│   │   └── polar.ts        # Cliente de Polar
│   └── middleware.ts       # Middleware Next.js
├── .env.local              # Variables de entorno (NO commiteado)
├── .env.example            # Plantilla de variables
├── AGENTS.md               # Instrucciones para agentes
├── CLAUDE.md               # Instrucciones específicas de Claude
└── README.md               # Documentación del proyecto
```

---

## Decisiones Tomadas

1. **Nombre del proyecto:** mideli (minúsculas por restricciones de npm)
2. **Ubicación:** C:\Users\XPERT\Desktop\mideli
3. **Stack:** Next.js 16 + Supabase + shadcn/ui + Resend + Polar
4. **Skills:** 18 skills instaladas globalmente y en el proyecto
5. **Moneda:** MXN (pesos mexicanos) en Polar
6. **Servidor:** Actualmente corriendo en http://localhost:3000

---

## Archivos de Configuración

### .env.local
Este archivo contiene todas las variables de entorno con valores reales. **No está commiteado** por seguridad.

Para ver los valores actuales, ejecuta:
```bash
cat .env.local
```

### opencode.json (global)
El archivo de configuración global de opencode está en `~/.config/opencode/opencode.json` e incluye:
- MCP de Context7 (documentación)
- MCP de Firebase
- MCP de Supabase (autenticado con OAuth)

---

## Comandos Útiles

```bash
# Iniciar servidor de desarrollo
npm run dev

# Construir para producción
npm run build

# Verificar código con ESLint
npm run lint

# Ver skills disponibles
/skills

# Ver planes guardados
/plans
```

---

## Próximos Pasos

El proyecto está listo para empezar a construir funcionalidad. Todas las dependencias están instaladas, los servicios configurados, y las skills activas.

**Para continuar:**
1. Abrir una terminal en `C:\Users\XPERT\Desktop\mideli`
2. Ejecutar `opencode`
3. Las skills se cargarán automáticamente
4. Empezar a construir

---

**Fecha de handoff:** 2026-07-21  
**Sesión original:** just-dipping-landingpage  
**Proyecto destino:** mideli
