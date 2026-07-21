# Mideli - Agent Instructions

## Project Info
- **Repository**: https://github.com/charmar11/mideli
- **Supabase Project**: qgnjennimvbrfxvcmowb
- **Supabase URL**: https://qgnjennimvbrfxvcmowb.supabase.co

## Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **UI**: shadcn/ui (Radix UI)
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Email**: Resend
- **SMS**: Twilio
- **Payments**: Polar

## Verification Commands

**ALWAYS run these before claiming work is complete:**

```bash
npm run lint          # ESLint checks
npm run build         # TypeScript + Next.js build (catches type errors)
```

If build fails, fix errors before proceeding.

## Code Style

- Use TypeScript strict mode
- Prefer functional components with hooks
- Use `@/` import alias (e.g., `import { Button } from '@/components/ui/button'`)
- Follow shadcn/ui patterns for components
- Use Server Components by default, Client Components only when needed (`'use client'`)

## Supabase Patterns

- **Browser client**: `import { createClient } from '@/lib/supabase/client'` (for Client Components)
- **Server client**: `import { createClient } from '@/lib/supabase/server'` (for Server Components/Actions)
- **Middleware**: `src/middleware.ts` handles session refresh automatically

## Server Services

- **Email**: `import { sendEmail } from '@/server/resend'`
- **SMS**: `import { sendSMS } from '@/server/twilio'`
- **Payments**: `import { polar } from '@/server/polar'`

## Environment Variables

Never commit `.env.local`. Use `.env.example` as the source of truth for required variables.

## Testing

No test framework configured yet. Add when needed.

## Deployment

- **Hosting**: Vercel (pending setup)
- **Database**: Supabase (project: `qgnjennimvbrfxvcmowb`)

## Notes

- This is a restaurant management SaaS
- Multi-tenant architecture (multiple restaurants)
- Spanish language UI (Mexico/LATAM market)
