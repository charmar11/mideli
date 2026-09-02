# Handoff: Mideli — Burger & Sushi

> Documento histórico. Para el estado vigente usa `.opencode/plans/mideli-context.md`, `AGENTS.md` y la documentación de `docs/`. Si este archivo contradice al código actual, no tiene prioridad.

## Resumen del Proyecto

**Mideli** es un sistema de gestión de pedidos (KDS + POS) para un local de comida en Ciudad Obregón, Sonora, México.

- **Giro:** Burger & Sushi
- **Slogan:** No se utiliza.
- **Horario:** 12:00 PM – 11:00 PM (cierra martes)
- **Ubicación:** C. Yaqui 404 Oriente, Cd. Obregón, Son.

**Stack:**
- Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- Supabase (PostgreSQL, Auth, Storage, Realtime)
- shadcn/ui (Base UI)
- Resend (emails)
- Polar (pagos)
- GitHub (control de versiones)

**Repositorio:** https://github.com/charmar11/mideli
**Proyecto Supabase:** qgnjennimvbrfxvcmowb
**URL Supabase:** https://qgnjennimvbrfxvcmowb.supabase.co

---

## Identidad Visual

### Paleta de colores (del logo)

| Token | HEX | Uso |
|---|---|---|
| `--background` | `#000000` | Fondo principal |
| `--brand` | `#F5145F` | Rosa principal (botones, acentos) |
| `--brand-hover` | `#D41050` | Hover/pressed |
| `--cream` | `#FBF8E7` | Texto secundario, bordes |
| `--gold` | `#F6DDA4` | Detalles, badges, separadores |
| `--foreground` | `#F8F8F0` | Texto principal |

### Tipografías

| Rol | Fuente | Uso |
|---|---|---|
| Marca | Pacifico | Logo "Mideli" en la UI |
| Headings | Sora | Títulos, botones, labels |
| Body | Karla | Texto general, formularios |
| Mono | JetBrains Mono | Números de orden, precios, tickets |

---

## Estructura del Proyecto

```
mideli/
├── .opencode/
│   └── skills/                    # Skills instaladas (UI/UX Pro Max, etc.)
├── src/
│   ├── app/
│   │   ├── globals.css            # Design tokens (paleta Mideli)
│   │   ├── layout.tsx             # Root layout (fuentes, lang=es)
│   │   ├── page.tsx               # Landing page
│   │   ├── login/page.tsx         # Login
│   │   ├── register/page.tsx      # Registro
│   │   ├── auth/callback/route.ts # Auth callback
│   │   ├── dashboard/
│   │   │   ├── layout.tsx         # Layout con toggle Mesero/Cocina
│   │   │   └── page.tsx           # Vista conmutable
│   │   ├── menu/page.tsx          # CRUD de menú
│   │   └── settings/page.tsx      # Configuración
│   ├── components/
│   │   ├── ui/                    # shadcn/ui (Button, Card, Input, Label)
│   │   ├── auth/
│   │   │   ├── login-form.tsx     # Formulario de login
│   │   │   └── register-form.tsx  # Formulario de registro
│   │   └── dashboard/
│   │       ├── mesero-view.tsx    # Vista POS (tomar pedidos)
│   │       └── cocina-view.tsx    # Vista KDS (pedidos en cocina)
│   ├── lib/
│   │   ├── supabase/              # Clientes Supabase
│   │   └── utils.ts               # Helpers (cn)
│   ├── server/
│   │   ├── resend.ts              # Email
│   │   ├── twilio.ts              # SMS
│   │   └── polar.ts               # Pagos
│   └── middleware.ts              # Protección de rutas
├── AGENTS.md                      # Instrucciones para agentes (español)
├── .env.local                     # Variables de entorno (NO commiteado)
└── .env.example                   # Plantilla de variables
```

---

## Base de Datos (Supabase)

### Tablas

| Tabla | Descripción |
|---|---|
| `profiles` | Perfiles de usuario (vinculado a auth.users) |
| `categories` | Categorías del menú |
| `menu_items` | Platillos (nombre, precio, categoría, activo/inactivo) |
| `orders` | Pedidos (número, status, tipo, total) |
| `order_items` | Items de cada pedido |
| `order_status_log` | Historial de cambios de status |

### Status de pedido

`pending` → `in_kitchen` → `ready` → `served` → `paid`

### Tipos de orden

`comedor`, `domicilio`, `para_llevar`

### Roles de usuario

`owner`, `admin`, `waiter`, `kitchen`

### Realtime

Habilitado para: `orders`, `order_items`, `order_status_log`

### RLS

Todas las tablas tienen Row Level Security habilitado. Usuarios autenticados pueden leer y escribir.

### Trigger

Al crear un usuario en `auth.users`, se crea automáticamente un registro en `profiles`.

---

## Flujo Principal

1. **Mesero** toma pedido en tablet → selecciona platillos por categoría → agrega notas → "Enviar a Cocina"
2. **Cocina** ve el pedido al instante (Realtime) → prepara → marca "Listo"
3. **Mesero** ve que está listo → sirve → cobra → marca "Pagado"

### Toggle Mesero/Cocina

- Misma URL (`/dashboard`), toggle en el header
- Se persiste en `localStorage`
- La tablet arranca en modo mesero, la pantalla de cocina en modo cocina
- El dueño puede cambiar en cualquier momento

---

## Servicios Configurados

| Servicio | Estado | Variables |
|---|---|---|
| Supabase | ✅ Configurado | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Resend | ✅ Configurado + probado | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| Polar | ✅ Configurado | `POLAR_ACCESS_TOKEN`, `POLAR_SERVER` |
| Twilio | ⏭️ Pendiente | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |

---

## Comandos

```bash
npm run dev          # Servidor de desarrollo
npm run build        # Build de producción
npm run lint         # Verificación ESLint
npm run start        # Servidor de producción
```

---

## Próximos Pasos

1. **Conectar vistas a Supabase** — Reemplazar datos demo con queries reales
2. **Realtime en cocina** — Suscribirse a cambios en `orders` con Supabase Realtime
3. **Menú desde DB** — CRUD conectado a tablas `categories` y `menu_items`
4. **Cobro** — Flujo de pago (efectivo / tarjeta)
5. **Historial** — Vista de órdenes pasadas y reportes básicos
6. **Despliegue** — Configurar Vercel

---

**Fecha de handoff:** 2026-07-21
**Sesión:** bases-completas
