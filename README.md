# 🌐 Wuipi App — Plataforma de Gestión ISP

Dashboard de gestión integral para Wuipi Telecomunicaciones. Monitoreo de red, soporte, finanzas, y supervisor IA — todo en una plataforma.

## Tech Stack

- **Framework:** Next.js 14 (App Router, TypeScript)
- **Database:** Supabase (PostgreSQL + Auth + Realtime + RLS)
- **UI:** Tailwind CSS + Lucide Icons + Recharts
- **State:** Zustand
- **Validation:** Zod
- **Deploy:** Vercel

## Quick Start

```bash
# 1. Clone
git clone https://github.com/YOUR_USER/wuipi-app.git
cd wuipi-app

# 2. Install
npm install

# 3. Setup Supabase
# - Create project at supabase.com
# - Run migration: supabase/migrations/001_phase1_profiles_auth.sql
# - Create admin user in Supabase Dashboard

# 4. Environment
cp .env.example .env.local
# Fill in your Supabase URL and keys

# 5. Run
npm run dev
```

## Project Structure

```
src/
├── app/
│   ├── (auth)/login/          # Login page
│   ├── (dashboard)/           # Dashboard layout + pages
│   │   ├── comando/           # Centro de Comando
│   │   ├── supervisor/        # Supervisor IA
│   │   ├── infraestructura/   # Red (PRTG) — Phase 2
│   │   ├── soporte/           # Tickets (Kommo) — Phase 3
│   │   ├── finanzas/          # Fiscal VEN — Phase 4
│   │   └── configuracion/     # Settings
│   └── api/                   # API routes
├── components/
│   ├── ui/                    # Base components
│   ├── dashboard/             # Dashboard widgets
│   └── layout/                # Sidebar, TopBar
├── lib/
│   ├── supabase/              # Client + Server clients
│   └── utils/                 # Helpers
└── types/                     # TypeScript types
```

## Roadmap

| Phase | Module | Status |
|-------|--------|--------|
| 1 | Auth + Dashboard + Centro de Comando | ✅ |
| 2 | Infraestructura (PRTG) | 🔜 |
| 3 | Soporte (Kommo/CRM) | 🔜 |
| 4 | Finanzas + Fiscal Venezuela | 🔜 |
| 5 | Portal Clientes AI (Claude + Gemini) | 🔜 |
| 6 | CRM Propio | 📋 |
| 7 | ERP: Facturación + Inventario | 📋 |
| 8 | ERP: Contabilidad + RRHH | 📋 |

## Security

- Row Level Security (RLS) on all tables
- RBAC with role-based route protection
- Security headers (CSP, HSTS, X-Frame-Options)
- Middleware auth verification on every request
- Audit logging for all actions
