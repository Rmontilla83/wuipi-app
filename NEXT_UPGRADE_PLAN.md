# Next.js 14 → 15.5.15+ Upgrade Plan

**Status:** Pendiente — decisión de producto.

## Por qué es necesario

Los 5 CVEs high contra Next.js **no tienen parche en la rama 14.x**. Todos están resueltos en 15.x:

| CVE | Severity | Impact | Fixed in |
|---|---|---|---|
| GHSA-q4gf-8mx6-v5v3 | High | DoS Server Components | 15.5.15 |
| GHSA-ggv3-7p47-pfv8 | Moderate | HTTP request smuggling in rewrites | 15.5.13 |
| GHSA-3x4c-7xq6-9pq8 | Moderate | next/image cache growth → storage exhaustion | 15.5.14 |
| GHSA-9g9p-9gw9-jx7f | Moderate | Image Optimizer DoS via remotePatterns | 15.5.10 |
| GHSA-h25m-26qc-wcjf | High | Request deserialization DoS | 15.0.8 |

Quedarse en 14.2 = aceptar DoS conocido en producción.

## Recomendación

Upgrade directo a **Next 15.5.15** (última 15.x). Saltearse 16 por ahora — es major breaking adicional y 15.5.15 ya cierra todos los CVEs.

## Plan paso a paso

1. **Rama feature:** `git checkout -b chore/next-15-upgrade`
2. **Instalar:**
   ```bash
   npm install next@15.5.15 eslint-config-next@15.5.15
   ```
3. **Migration codemods oficiales:**
   ```bash
   npx @next/codemod@latest next-async-request-api .
   npx @next/codemod@latest upgrade .
   ```
   Estos actualizan:
   - `params` / `searchParams` / `cookies()` / `headers()` → async
   - `next/font` movidos (si aplica)
   - Metadata API si hay cambios
4. **Puntos de revisión manual** (revisión funcional):
   - Todas las páginas `app/**/page.tsx` que usan `params` directo — ahora son `await params`
   - Todas las rutas API en `app/api/**/route.ts` con `params` — idem
   - Middleware: compatible, no cambios esperados
   - React 19 compatibility: Next 15 fuerza React 19. Verificar que `recharts`, `@tanstack/react-query`, etc., soporten (todos los que usamos sí).
5. **CSP nonce** (A7 del audit): una vez en Next 15, migrar `next.config.js` de `'unsafe-inline'` a nonce-based usando el middleware:
   ```js
   // middleware.ts — generar nonce por request
   const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
   response.headers.set("Content-Security-Policy",
     `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; ...`);
   ```
6. **QA manual — checklist de smoke tests:**
   - [ ] `/login` — magic link + invite flow
   - [ ] `/comando` — render + 3 tabs
   - [ ] `/clientes/[id]` — detalle, tab Red con botón QoE
   - [ ] `/finanzas` — P&L, egresos, filtros
   - [ ] `/bequant` + `/bequant/suscriptores/[ip]` — live data
   - [ ] `/ventas` — pipeline Kanban + inbox
   - [ ] `/portal` login cliente → facturas → pagar
   - [ ] `/portal/mi-conexion` — score + history
   - [ ] Webhooks: Stripe, Mercantil, PayPal, Kommo (sim con curl)
   - [ ] Crons: cada `/api/*/cron/*` con `Authorization: Bearer $CRON_SECRET`
   - [ ] Soportín + Supervisor IA
7. **Deploy preview** en Vercel, verificar build y runtime logs.
8. **PR con screenshot de `npm audit --production`** mostrando 0 CVE high.
9. **Merge** sólo si todo el checklist pasa.

## Riesgo estimado

- **Build:** medio — codemods cubren 90%.
- **Runtime:** medio — `params` async es el cambio más frecuente; cualquier callsite que olvide el `await` rompe silenciosamente.
- **Producción:** bajo si se hace QA completo en preview. La base de código ya usa patrones modernos (`async` Server Components, `use client` explícito).

## Estimación

1 desarrollador-día (upgrade + codemods + QA manual). 0 downtime con deploy preview + promoción.
