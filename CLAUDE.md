# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wuipi App is an ISP management dashboard for Wuipi Telecomunicaciones (Venezuela). Next.js 14 App Router with TypeScript, Supabase (PostgreSQL + Auth + RLS), Tailwind CSS, and dual AI engines (Claude + Gemini).

## Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build (includes type checking)
npm run lint         # ESLint
npm run db:types     # Regenerate Supabase types → src/types/database.ts
```

No test framework is configured. CI (.github/workflows/ci.yml) runs lint, type-check, build, and `npm audit --production`.

## Architecture

### Routing & Layout

Next.js App Router with two route groups:
- `src/app/(auth)/login/` — public login page
- `src/app/(dashboard)/` — protected layout with sidebar/topbar, contains all feature modules

Feature modules: `comando/` (hub), `supervisor/` (AI), `ventas/` (sales), `soporte/` (support), `clientes/` (clients), `finanzas/`, `facturacion/`, `erp/`, `infraestructura/`, `portal-admin/`, `configuracion/`

### Auth & Middleware

`src/middleware.ts` uses Supabase SSR to protect all routes except `/login`, `/api/health`, `/api/auth/callback`. Authenticated users on `/login` redirect to `/comando`.

Two Supabase clients in `src/lib/supabase/server.ts`:
- `createServerSupabase()` — user-scoped (anon key, cookie-based session)
- `createAdminSupabase()` — service role for privileged server-only operations

Browser client in `src/lib/supabase/client.ts`.

### RBAC

Roles defined in `src/types/index.ts` as `UserRole`: admin, gerente, soporte, finanzas, infraestructura, tecnico, vendedor, cliente. Permission map `ROLE_PERMISSIONS` controls sidebar navigation access. Database enforces RLS policies.

### Data Access Layer (DAL)

`src/lib/dal/` — repository-pattern functions using Supabase client. `facturacion.ts` handles clients, invoices, payments, plans. `tickets.ts` handles support tickets. Uses soft deletes (`is_deleted` flag) and offset/limit pagination.

### API Routes

`src/app/api/` — all routes use `export const dynamic = "force-dynamic"`. Pattern:
1. Validate input with Zod (`validate()` from `src/lib/validations/schemas.ts`)
2. Call DAL functions
3. Return via `apiSuccess()`, `apiError()`, `apiServerError()` from `src/lib/api-helpers.ts`

When external integrations are unavailable, some routes fall back to mock/hardcoded data.

### External Integrations (`src/lib/integrations/`)

- **PRTG** (`prtg.ts`) — network monitoring, HTTP API with passhash auth, 30s cache
- **Kommo** (`kommo.ts`, `kommo-ventas.ts`) — CRM for support and sales pipelines, Bearer token auth
- **BCV** (`bcv.ts`) — Venezuelan exchange rates (USD/VES)

### AI

`src/lib/ai/orchestrator.ts` routes between Anthropic Claude and Google Gemini. Gathers cross-module context for intelligent briefings. Falls back to mock responses.

### Validation

All input validation via Zod schemas in `src/lib/validations/schemas.ts`. Use the `validate<T>(schema, data)` helper which returns typed data or a formatted error with issues array.

### UI Patterns

- Tailwind CSS with custom `wuipi` theme colors (dark mode via `class` strategy)
- `cn()` utility (clsx + tailwind-merge) from `src/lib/utils/index.ts`
- Recharts for data visualization
- Lucide React for icons
- Geist font family

### Types

`src/types/index.ts` is the main entry point, re-exports from `prtg.ts`, `support.ts`, `finance.ts`. Path alias: `@/*` maps to `./src/*`.

## Key Conventions

- UI text and validation messages are in **Spanish**
- Multi-currency throughout: USD and VES with BCV exchange rates
- Venezuelan fiscal system: IVA, IGTF, ISLR, SENIAT tax handling
- Document types: V (venezolano), J (jurídico), E (extranjero), G (gobierno), P (pasaporte)
- Database migrations in `supabase/migrations/`, schema files in `supabase/`
