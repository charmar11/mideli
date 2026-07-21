# Mideli

Sistema de gestión para restaurantes con Next.js 16, Supabase, shadcn/ui, Resend, Twilio y Polar.

## Stack

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- **Backend/DB**: Supabase (PostgreSQL + Auth + Storage)
- **UI**: shadcn/ui (Radix UI + Tailwind)
- **Email**: Resend
- **SMS**: Twilio
- **Pagos**: Polar
- **Hosting**: GitHub + Vercel (pendiente)

## Requisitos

- Node.js 24+
- npm 11+

## Setup local

1. Clonar el repo:
   ```bash
   git clone https://github.com/charmar11/mideli.git
   cd mideli
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Copiar variables de entorno:
   ```bash
   cp .env.example .env.local
   ```

4. Editar `.env.local` con tus credenciales reales.

5. Ejecutar servidor de desarrollo:
   ```bash
   npm run dev
   ```

6. Abrir [http://localhost:3000](http://localhost:3000).

## Scripts disponibles

```bash
npm run dev          # Servidor de desarrollo
npm run build        # Build de producción
npm run start        # Servidor de producción
npm run lint         # Verificar código con ESLint
```

## Estructura

```
src/
├── app/                  # Rutas y páginas (App Router)
├── components/           # Componentes React
│   └── ui/              # Componentes shadcn/ui
├── lib/                 # Utilidades y helpers
│   ├── supabase/        # Clientes Supabase
│   └── utils.ts         # Helpers (cn, etc.)
├── server/              # Servicios server-side
│   ├── resend.ts        # Email (Resend)
│   ├── twilio.ts        # SMS (Twilio)
│   └── polar.ts         # Pagos (Polar)
└── middleware.ts        # Middleware Next.js (refresh de sesión)
```

## Variables de entorno

Ver `.env.example` para la lista completa de variables requeridas.

## Licencia

Privado - Todos los derechos reservados.
