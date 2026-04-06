# Auditoría Arquitectónica — wuipi-app

## Fecha: 2026-04-06

---

## 1. Inventario

### 1.1 API Routes

**Total: 136 rutas** (incluyendo páginas y API endpoints). De estas, **~85 son API routes** en `src/app/api/`.

#### Rutas con `maxDuration` explícito

| Path | maxDuration | Servicio | Justificación |
|------|-------------|----------|---------------|
| `/api/cron/supervisor-briefing` | 60s | Gemini + Claude + Telegram | Dual AI + broadcast 4 canales |
| `/api/supervisor/briefing` | 60s | Gemini + Claude | Dual AI generation |
| `/api/supervisor/chat` | 60s | Claude/Gemini | AI chat response |
| `/api/supervisor/data` | 15s | Zabbix + Odoo + Kommo | Multi-source data gathering |
| `/api/supervisor/telegram` | 15s | Telegram | Send messages |
| `/api/odoo/financial-summary` | 15s | Odoo (7 RPC calls) + BCV | Cache 2min in-memory |
| `/api/portal/soportin` | 30s | Claude + Odoo + Mikrotik | AI chat con datos del cliente |
| `/api/cron/bcv-alert` | 15s | BCV + Telegram | Rate check + alert |
| `/api/cron/drafts-alert` | 15s | Odoo + Telegram | Draft count + alert |

Todas las demás rutas usan el default de Vercel (10s en Pro).

#### Rutas por servicio externo llamado

| Servicio | # Rutas | Rutas principales |
|----------|---------|-------------------|
| **Supabase** | ~45 | facturacion/*, crm-ventas/*, crm-cobranzas/*, tickets/*, cobranzas/*, users, permisos |
| **Odoo** | 8 | odoo/clients, odoo/invoices, odoo/financial-summary, odoo/payments-by-journal, odoo/status, pagar/cliente |
| **Zabbix** | 4 | infraestructura, infraestructura/hosts, infraestructura/problems, infraestructura/routers |
| **Bequant** | 8 | bequant/*, bequant/config/*, bequant/subscribers/*, bequant/policies/* |
| **Kommo** | 3 | soporte, ventas, debug/kommo |
| **Claude/Gemini** | 4 | supervisor/briefing, supervisor/chat, portal/soportin, cron/supervisor-briefing |
| **Mercantil** | 5 | mercantil/create-payment, mercantil/callback, mercantil/webhook, mercantil/reconcile, mercantil/status |
| **BCV** | 2 | cobranzas/bcv, cron/bcv-alert |
| **Telegram** | 3 | supervisor/telegram, cron/supervisor-briefing, cron/bcv-alert, cron/drafts-alert |
| **WhatsApp/Email** | 2 | cobranzas/send, cobranzas/remind (indirectamente) |
| **PayPal** | 2 | cobranzas/webhook/paypal |
| **Stripe** | 1 | cobranzas/webhook/stripe |

#### Rutas por tipo de caller

| Caller | # Rutas | Ejemplos |
|--------|---------|----------|
| **Frontend** | ~75 | Mayoría de rutas |
| **Cron (Vercel)** | 3 | cron/supervisor-briefing, cron/bcv-alert, cron/drafts-alert |
| **Webhook externo** | 5 | mercantil/callback, mercantil/webhook, cobranzas/webhook/paypal, cobranzas/webhook/stripe |
| **Debug/Manual** | 2 | debug/kommo, debug/tags |

#### Distribución de velocidad estimada

| Categoría | # Rutas | Ejemplos |
|-----------|---------|----------|
| **Rápida (<1s)** | ~50 | Todo lo de Supabase puro: tickets, crm-ventas, crm-cobranzas, users, permisos, health |
| **Media (1-5s)** | ~25 | Odoo RPC, Zabbix, Kommo, Bequant, cobranzas/send |
| **Lenta (5-30s)** | 3 | odoo/financial-summary (7 RPCs), supervisor/data, portal/soportin |
| **Pesada (>30s)** | 3 | supervisor/briefing, supervisor/chat, cron/supervisor-briefing |

---

### 1.2 Frontend Data Fetching

#### Centro de Comando (`/comando`) — EL PROBLEMA PRINCIPAL

**10 fetch calls al montar** (no 12, pero sigue siendo excesivo):

| # | Endpoint | Servicio real | Tipo |
|---|----------|---------------|------|
| 1 | `/api/odoo/financial-summary` | Odoo (7 RPCs) + BCV | Waterfall: primero intenta este, si falla llama a `/api/facturacion/stats` |
| 2 | `/api/infraestructura` | Zabbix | Promise.all con 3-4 |
| 3 | `/api/infraestructura/problems` | Zabbix | Promise.all |
| 4 | `/api/infraestructura/hosts` | Zabbix | Promise.all |
| 5 | `/api/tickets/stats` | Supabase | Independiente |
| 6 | `/api/soporte?period=30d` | Kommo | Independiente |
| 7 | `/api/crm-ventas/stats` | Supabase | Independiente |
| 8 | `/api/cobranzas/stats` | Supabase | Independiente |
| 9 | `/api/infraestructura/nodes` | Odoo Mikrotik | Independiente |
| 10 | `/api/odoo/payments-by-journal` | Odoo | Lazy (solo tab finanzas) |

**Polling:** `setInterval(loadInfraData, 60000)` — cada 60s recarga Zabbix (3 calls).
**Sin detección de tab oculto.**

**Impacto diario estimado** (1 usuario con tab abierto 8 horas):
- Mount: 10 invocaciones
- Polling: 3 invocaciones × 60 veces/hora × 8 horas = **1,440 invocaciones/día**
- Con 3 usuarios: **~4,320 invocaciones/día solo de infraestructura polling**

#### TopBar (presente en TODAS las páginas del dashboard)

| Endpoint | Servicio | Frecuencia |
|----------|----------|------------|
| `/api/odoo/financial-summary` | Odoo (7 RPCs) + BCV | **Una vez al montar** (cada navegación de página) |
| `/api/health` | Config check | Una vez al montar |

**Problema crítico:** `financial-summary` se llama en CADA navegación porque TopBar se remonta. Hace 7 llamadas RPC a Odoo por invocación. Cache in-memory de 2 min ayuda, pero cada instancia serverless tiene su propio cache.

#### Páginas con polling activo

| Página | Endpoint | Intervalo | Tab-hidden pause | Cleanup |
|--------|----------|-----------|------------------|---------|
| `/comando` | 3× infraestructura (Zabbix) | 60s | **NO** | Sí |
| `/soporte` | `/api/soporte` (Kommo) | 60s | **NO** | Sí |
| `/ventas` | `/api/ventas` (Kommo) | 120s | **NO** | Sí |
| CRM Cobranzas tab | `/api/crm-cobranzas/cases` | 120s | **NO** | Sí |
| CRM Ventas tab | `/api/crm-ventas/leads` | 120s | **NO** | Sí |
| `/pagar/[token]` | `/api/cobranzas/${token}` | 3s | **NO** | Sí (auto-stop) |
| `/pay/[token]` | `/api/mercantil/status/${token}` | 5s | **NO** | Sí (condicional) |

**Ninguna página implementa `visibilitychange` para pausar polling cuando el tab está oculto.**

#### Páginas sin polling (fetch on mount only)

| Página | # Calls al montar |
|--------|-------------------|
| `/infraestructura` | 3-5 (mismos endpoints que comando — **duplicados**) |
| `/clientes` | 1 (Odoo search paginado) |
| `/clientes/[id]` | 2-3 (detail + network + payment-link) |
| `/supervisor` | 2-4 (briefing + data + history) |
| `/bequant` | 2 (node + subscribers) |
| `/erp` | 1 (facturacion/stats) |
| `/configuracion/*` | 1 cada una |
| Portal pages | 1-2 cada una |

#### Patrones de fetching

- **No usa React Query ni SWR** — todo es `fetch()` con `useState/useEffect`
- **No hay cache compartido** entre páginas — misma data se re-fetcha al navegar
- **No hay request deduplication** — si 2 componentes piden el mismo endpoint, se hacen 2 requests
- **Debounce en búsquedas**: 400ms en clientes

---

### 1.3 Cron Jobs

| # | Schedule (UTC) | Hora VEN | Endpoint | Servicio | maxDuration | Ejecuciones/mes | Costo estimado/mes |
|---|----------------|----------|----------|----------|-------------|-----------------|---------------------|
| 1 | `0 11 * * *` | 7:00 AM diario | `/api/cron/supervisor-briefing` | Gemini + Claude + Odoo + Zabbix + Kommo + Telegram | 60s | 30 | ~$9.30 (AI tokens) + ~$0.50 (Vercel CPU) |
| 2 | `0 13,19 * * *` | 9am + 3pm | `/api/cron/bcv-alert` | BCV APIs + Telegram + Supabase | 15s | 60 | <$0.30 |
| 3 | `0 14 27-31 * *` | 10am días 27-31 | `/api/cron/drafts-alert` | Odoo + Telegram + Supabase | 15s | ~5 | <$0.05 |

**Total crons: 95 invocaciones/mes** (de 1,000 incluidas en Pro).
**Costo total estimado: ~$10.15/mes** (dominado por AI tokens del briefing).

El cron de briefing es el más pesado:
1. `gatherBusinessData()` — 9 llamadas paralelas (Zabbix ×2, Kommo, Odoo ×4, Supabase ×2)
2. Gemini Flash analiza datos → JSON
3. Claude Sonnet correlaciona → insights
4. Guarda en `briefing_history` (Supabase)
5. Envía a 4 canales Telegram con formato diferenciado

---

### 1.4 Integraciones Externas

| Integración | Archivo | Auth | Cache | Retry | Rate Limits | Fallback |
|-------------|---------|------|-------|-------|-------------|----------|
| **Odoo 18** | `integrations/odoo.ts` | API Key + JSON-RPC | UID 1h, fin-summary 2min | No | 200 items/query | No |
| **Zabbix 7** | `integrations/zabbix.ts` | Bearer token | 60-300s in-memory | No | 200-1000 items | Fallback object |
| **Kommo** | `integrations/kommo.ts` | Bearer token | 60s ISR | No | 40 pages max | ⚠️ Sin token refresh |
| **Kommo Ventas** | `integrations/kommo-ventas.ts` | Bearer token | 60s ISR | No | 40 pages max | ⚠️ Sin token refresh |
| **BCV** | `integrations/bcv.ts` | Ninguna (público) | 5min in-memory | Sí (3 APIs + manual) | N/A | `BCV_MANUAL_RATE` |
| **Bequant** | `integrations/bequant.ts` | Basic Auth HTTPS | Config 60s | No | ~1000 subs | No |
| **Mercantil** | `lib/mercantil/` | HMAC-SHA256 + Client ID | No | Sí (2× backoff) | Banking std | No |
| **PayPal** | `integrations/paypal.ts` | OAuth2 | No | No | 100 req/s | No |
| **Telegram** | `integrations/telegram.ts` | Bearer token | No | No | 30 msg/s | No |
| **WhatsApp** | `notifications/whatsapp.ts` | Bearer token | No | No | 60 msg/min | Template→text fallback |
| **Claude** | `ai/model-router.ts` | API Key (REST) | No | Cascade a Gemini | 10k tok/min | Gemini fallback |
| **Gemini** | `ai/model-router.ts` | API Key (REST) | No | Cascade a Claude | 10k req/min | Claude fallback |
| **Supabase** | `supabase/server.ts` | Anon key + Service role | No | SDK defaults | 200 req/s | No |

**Riesgos identificados:**
- ⚠️ **Kommo no implementa token refresh** — si el Bearer token expira, se pierde soporte + ventas
- ⚠️ **Odoo sin retry** — si Odoo está lento, financial-summary falla y afecta TopBar + Comando + Supervisor
- ⚠️ **In-memory cache** en serverless = cada instancia tiene su propio cache, no compartido

---

### 1.5 Bundle Analysis

**Build: Next.js 14.2.35** — compilación exitosa con warnings.

#### Rutas totales generadas: 136

| Tipo | Cantidad |
|------|----------|
| Estáticas (○) | 2 (`/login`, `/setup-password`) |
| Dinámicas (ƒ) | 134 |

#### Páginas más pesadas (First Load JS)

| Página | Page JS | First Load JS | Nota |
|--------|---------|---------------|------|
| `/cobranzas` | 21.3 kB | **229 kB** | XLSX export, campañas, kanban |
| `/clientes/importar` | 14.3 kB | **219 kB** | XLSX parsing |
| `/comando` | 9.76 kB | **216 kB** | Recharts + 1105 líneas |
| `/bequant` | 4.92 kB | **205 kB** | Recharts |
| `/supervisor` | 9.22 kB | **200 kB** | Markdown + AI chat |
| `/login` | 1.63 kB | 143 kB | Shared baseline |

**Shared JS por todas las páginas: 87.5 kB**
- `chunks/fd9d1056` (53.6 kB) — probablemente React + framework
- `chunks/2117` (31.9 kB) — Tailwind + utilidades

**Middleware: 74.1 kB** — Supabase SSR auth check.

#### Observaciones del bundle

1. **Recharts** se importa en `/comando`, `/bequant`, y potencialmente `/supervisor` — no se tree-shakea bien (agrega ~100 kB per page).
2. **XLSX (SheetJS)** se importa en `/cobranzas` y `/clientes/importar` — ~30 kB.
3. **El archivo comando/page.tsx tiene 1,105 líneas** — monolito que debería dividirse en componentes.
4. No hay `dynamic(() => import(...))` para lazy loading de tabs o charts.
5. API routes muestran 0 B en el build output (esto es normal — se compilan como serverless functions).

#### Warnings del build

- 6 imports no usados en `comando/page.tsx` (AlertTriangle, Clock, Shield, ChevronRight, loading var)
- 20+ `any` types en `erp/page.tsx`
- Uso de `<img>` en vez de `next/image` en login y setup-password

---

## 2. Problemas Encontrados

### P1: Polling de infraestructura 24/7 sin detección de tab oculto
- **Severidad: CRÍTICA**
- **Impacto:** ~4,320 invocaciones/día (3 usuarios × 3 endpoints × 60/hora × 8h). A $0.60/millón de invocaciones + CPU time, esto puede ser el 30-40% del consumo de Vercel.
- **Evidencia:** `comando/page.tsx:1060` — `setInterval(loadInfraData, 60000)` sin `visibilitychange`. Los runtime logs del usuario confirman que `/api/infraestructura`, `/hosts`, `/problems` se polleaban cada 60s 24/7.
- **Agravante:** Si el tab se queda abierto de noche o fin de semana, sigue polleando. 3 endpoints × 1/minuto × 1440 min/día = **4,320 invocaciones por tab abierto por día**.

### P2: TopBar re-fetcha financial-summary en cada navegación
- **Severidad: ALTA**
- **Impacto:** `financial-summary` hace 7 llamadas RPC a Odoo + 1 a BCV. Se ejecuta cada vez que el usuario navega entre páginas porque TopBar se remonta. Con navegación activa (20 cambios de página/hora), son ~160 invocaciones/día que internamente generan ~1,120 RPCs a Odoo.
- **Evidencia:** `topbar.tsx:32` — `fetch("/api/odoo/financial-summary")` en `useEffect` del mount. El cache in-memory de 2min en el endpoint ayuda pero es por instancia serverless.
- **Nota positiva:** El cache de 2min en `financial-summary/route.ts:17-18` mitiga parcialmente — pero en serverless, cada cold start tiene cache vacío.

### P3: Datos duplicados entre Comando e Infraestructura
- **Severidad: MEDIA**
- **Impacto:** Las mismas 3 llamadas a Zabbix (`/api/infraestructura`, `/problems`, `/hosts`) se hacen tanto en `/comando` como en `/infraestructura`. Si el usuario va de Comando → Infraestructura, son 6 calls redundantes.
- **Evidencia:** `comando/page.tsx:1005-1008` y `infraestructura/page.tsx:93-96` — código idéntico.

### P4: financial-summary se llama desde 3 lugares distintos sin cache compartido
- **Severidad: MEDIA**
- **Impacto:** `/api/odoo/financial-summary` se llama desde: TopBar (cada navegación), Comando (mount), y Supervisor (gather-data.ts internamente). Sin React Query/SWR, no hay deduplicación client-side.
- **Evidencia:** Grep muestra calls en `topbar.tsx:32`, `comando/page.tsx:996`, y `gather-data.ts` (server-side).

### P5: /api/soporte se llama desde Comando y Soporte sin cache compartido
- **Severidad: BAJA**
- **Impacto:** Kommo CRM se consulta duplicado: `comando/page.tsx:1026` (mount) y `soporte/page.tsx:148` (mount + polling 60s). Sin cache client-side.
- **Evidencia:** Grep confirma 3 fetch calls al endpoint desde componentes distintos.

### P6: Archivo monolítico comando/page.tsx (1,105 líneas)
- **Severidad: MEDIA (mantenibilidad)**
- **Impacto:** 1,105 líneas en un solo archivo "use client". No se puede tree-shake ni lazy-load tabs. Todo el código de los 3 tabs se carga aunque el usuario solo mire uno.
- **Evidencia:** `wc -l` = 1105 líneas. Incluye tipos, helpers, 3 tabs completos, overview, y toda la lógica de fetching.

### P7: Ausencia total de React Query/SWR
- **Severidad: ALTA (arquitectural)**
- **Impacto:** Sin librería de cache/fetching:
  - No hay deduplicación de requests (2 componentes pidiendo el mismo endpoint = 2 requests)
  - No hay stale-while-revalidate (usuario ve loading spinner en cada navegación)
  - No hay retry automático
  - No hay invalidación inteligente de cache
  - No hay prefetching
- **Evidencia:** `grep -r "useSWR\|useQuery\|@tanstack" src/` = 0 resultados.

### P8: Kommo sin token refresh implementado
- **Severidad: ALTA (riesgo operacional)**
- **Impacto:** Si el Bearer token de Kommo expira, se pierde visibilidad de soporte y ventas sin aviso. El código tiene las variables `KOMMO_REFRESH_TOKEN`, `KOMMO_CLIENT_ID`, `KOMMO_CLIENT_SECRET` pero el flujo de refresh **no está implementado**.
- **Evidencia:** `kommo.ts` — solo usa `KOMMO_ACCESS_TOKEN` directamente, sin lógica de refresh.

### P9: Cache in-memory en serverless = cache no compartido
- **Severidad: MEDIA**
- **Impacto:** Los caches in-memory (`financial-summary` 2min, `zabbix` 60-300s, `bcv` 5min) se pierden en cada cold start y no se comparten entre instancias concurrentes. En Vercel serverless, esto significa que el cache solo es efectivo si la misma instancia recibe requests seguidos.
- **Evidencia:** `financial-summary/route.ts:17` — `let cache: { data: any; ts: number } | null = null;` (variable module-level).

### P10: Sin React Error Boundaries
- **Severidad: BAJA**
- **Impacto:** Si un componente lanza una excepción de render, toda la página se cae en blanco. No hay error boundary que muestre un fallback UI.
- **Evidencia:** `grep -r "ErrorBoundary\|error.tsx" src/` = 0 resultados.

---

## 3. Propuestas de Mejora

### Quick Wins (implementar esta semana)

#### QW1: Pausar polling cuando tab está oculto
- **Qué cambiar:** Crear un hook `useVisibilityPolling(callback, interval)` que use `document.visibilitychange`. Aplicar en: `comando/page.tsx`, `soporte/page.tsx`, `ventas/page.tsx`, `crm-cobranzas-tab.tsx`, `crm-ventas-tab.tsx`.
- **Por qué:** Elimina ~70% de las invocaciones de polling (asumiendo que los tabs están ocultos 70% del tiempo). Estimado: **-3,000 invocaciones/día**.
- **Impacto en UX:** Igual o mejor — al volver al tab, hace un fetch inmediato.
- **Complejidad:** Trivial (~30 líneas de hook + reemplazar setInterval en 5 archivos).
- **Dependencias:** Ninguna.

#### QW2: Reducir polling de infraestructura de 60s a 300s (5 min)
- **Qué cambiar:** `comando/page.tsx:1060` — cambiar `60000` a `300000`.
- **Por qué:** Los datos de Zabbix ya tienen cache de 60s en el servidor. Polling cada 60s en el cliente no aporta frescura real y genera 1,440 invocaciones/día innecesarias. Con 5 min: 288 invocaciones/día = **-80%**.
- **Impacto en UX:** Mínimo — los problemas de red no se resuelven en 60s, 5 min es suficiente para un dashboard ejecutivo.
- **Complejidad:** Trivial (1 línea).
- **Dependencias:** Ninguna. Idealmente combinar con QW1.

#### QW3: Mover TopBar fetch a layout con estado compartido
- **Qué cambiar:** En lugar de que TopBar haga fetch en cada mount, crear un contexto React (`DashboardContext`) en el layout del dashboard que fetche `financial-summary` una vez y lo comparta vía Context API.
- **Por qué:** Elimina re-fetch en cada navegación de página. El layout del dashboard no se desmonta al navegar entre rutas hijas.
- **Impacto en UX:** Mejor — datos del topbar siempre presentes sin flash de loading.
- **Complejidad:** Medio (~50 líneas: crear context provider + mover fetch al layout).
- **Dependencias:** Ninguna.

#### QW4: Eliminar endpoints de debug en producción
- **Qué cambiar:** Eliminar o proteger `/api/debug/kommo` y `/api/debug/tags`. Agregar check de `NODE_ENV` o auth.
- **Por qué:** Son endpoints sin autenticación que exponen datos internos de Kommo.
- **Impacto en UX:** Ninguno (no los usa nadie en producción).
- **Complejidad:** Trivial.
- **Dependencias:** Ninguna.

---

### Mejoras Medianas (próximas 2 semanas)

#### MM1: Endpoint consolidado `/api/comando/summary`
- **Qué cambiar:** Crear un nuevo endpoint que ejecute las 9 queries del Centro de Comando en paralelo (server-side) y devuelva un solo JSON. Reemplazar las 10 fetch calls del frontend por 1.
- **Por qué:** 10 invocaciones → 1 invocación. Las queries ya se ejecutan en paralelo server-side en `gather-data.ts` (el briefing ya hace esto). Reduce latencia percibida y invocaciones 10:1.
- **Impacto en UX:** Mucho mejor — 1 loading state en vez de 10 independientes, datos llegan todos juntos.
- **Complejidad:** Medio.
- **Dependencias:** QW3 (para no duplicar financial-summary).
- **maxDuration recomendado:** 15s (las queries son paralelas, la más lenta es financial-summary ~3-5s).

#### MM2: Adoptar React Query (TanStack Query) para fetch/cache client-side
- **Qué cambiar:** Instalar `@tanstack/react-query`. Migrar los fetches más críticos primero (financial-summary, infraestructura, soporte). Configurar `staleTime` por tipo de dato.
- **Por qué:** Resuelve P3, P4, P5, P7 de un solo golpe:
  - Deduplicación automática de requests
  - `staleTime` evita re-fetches innecesarios
  - Retry automático con backoff
  - Cache compartido entre páginas
  - `refetchOnWindowFocus` reemplaza polling manual
- **staleTime sugeridos:**
  - `financial-summary`: 5 min (datos cambian pocas veces al día)
  - `infraestructura/*`: 2 min (monitoreo semi-real-time)
  - `soporte/ventas`: 2 min
  - `tickets/stats`: 5 min
  - `cobranzas/stats`: 10 min
- **Impacto en UX:** Significativamente mejor — navegación instantánea con datos cached, background refetch.
- **Complejidad:** Medio-alto (refactor progresivo, puede hacerse página por página).
- **Dependencias:** Ninguna.

#### MM3: Mover cache de Zabbix/BCV/financial-summary a Supabase
- **Qué cambiar:** En vez de cache in-memory (se pierde en cold start), guardar datos en una tabla `api_cache` de Supabase con TTL. El endpoint lee de Supabase primero; si expirado, consulta la fuente y actualiza.
- **Por qué:** Resuelve P9 completamente. En serverless, el cache in-memory es ~30% efectivo (estimado basado en cold start frequency de Vercel). Cache en Supabase es 100% compartido entre instancias.
- **Impacto en UX:** Mejor — respuestas más rápidas en cold starts.
- **Complejidad:** Medio.
- **Dependencias:** Ninguna.
- **Alternativa más simple:** Usar Vercel KV (Redis) o Next.js `unstable_cache` con revalidate tag.

#### MM4: Implementar token refresh para Kommo
- **Qué cambiar:** Implementar el flujo OAuth2 refresh en `kommo.ts` usando `KOMMO_REFRESH_TOKEN` + `KOMMO_CLIENT_SECRET`. Guardar tokens actualizados en Supabase.
- **Por qué:** Si el token expira, se pierde toda la data de soporte y ventas de Kommo sin aviso. Es un riesgo operacional.
- **Impacto en UX:** Sin impacto visible (previene degradación futura).
- **Complejidad:** Medio.
- **Dependencias:** Tabla en Supabase para guardar tokens.

#### MM5: Dividir comando/page.tsx en componentes
- **Qué cambiar:** Extraer cada tab en su propio componente: `ComandoFinanzas.tsx`, `ComandoOperaciones.tsx`, `ComandoCrecimiento.tsx`. Usar `dynamic(() => import(...))` para lazy loading.
- **Por qué:** Reduce First Load JS de la página. Los tabs inactivos no necesitan cargarse hasta que el usuario los selecciona.
- **Impacto en UX:** Mejor — carga inicial más rápida. Tab switch puede tener ~100ms de delay.
- **Complejidad:** Medio (refactor grande pero mecánico).
- **Dependencias:** Idealmente hacer junto con MM1 (endpoint consolidado).

---

### Refactors Estructurales (próximo mes)

#### RE1: Server Components para páginas read-only
- **Qué cambiar:** Convertir páginas que solo muestran datos (sin interactividad client-side heavy) a Server Components. Candidatas: `/configuracion/permisos`, `/configuracion/usuarios`, `/clientes` (tabla paginada), `/pagos`, `/portal/*`.
- **Por qué:** Server Components no envían JS al cliente. Reducen bundle size y eliminan el ciclo fetch del cliente: el dato viene pre-renderizado en HTML.
- **Impacto en UX:** Mejor — First Contentful Paint más rápido, menos JS parseado.
- **Complejidad:** Alto (requiere entender qué partes son interactivas y separarlas).
- **Dependencias:** MM2 (React Query) para las partes que sí necesitan client-side interactivity.

#### RE2: Cache layer centralizado con Supabase + cron de warm-up
- **Qué cambiar:** Crear un cron que cada 5 minutos actualice datos de Zabbix, Odoo financial-summary, y Kommo soporte en una tabla `dashboard_cache` de Supabase. El frontend lee de Supabase (rápido) en vez de llamar APIs externas.
- **Por qué:** Desacopla completamente el frontend de las APIs externas lentas. Reduce invocaciones de Vercel functions (reads de Supabase son gratis). Elimina timeouts y latencia variable.
- **Impacto en UX:** Mucho mejor — datos siempre disponibles en <500ms, sin loading spinners.
- **Complejidad:** Alto (nuevo cron, nueva tabla, refactor de endpoints).
- **Dependencias:** MM3 como paso intermedio.
- **Costo:** ~2,880 invocaciones cron/mes adicionales (5min × 24h × 30d). Pero elimina miles de invocaciones del frontend.

#### RE3: Edge Functions para endpoints simples
- **Qué cambiar:** Mover a Edge Runtime (`export const runtime = 'edge'`) los endpoints que solo hacen proxy/redirect/lectura simple: `/api/health`, `/api/cobranzas/bcv`, `/api/cobranzas/[token]`, `/api/mercantil/status/[token]`, `/api/mercantil/callback`.
- **Por qué:** Edge functions son ~10× más baratas (0ms cold start, menor CPU pricing). Para endpoints que solo leen de Supabase o hacen un fetch simple, no necesitan Node.js completo.
- **Impacto en UX:** Mejor — latencia ~50ms vs ~200-500ms de serverless cold start.
- **Complejidad:** Medio (algunos endpoints pueden necesitar ajustes por APIs de Node.js no disponibles en Edge).
- **Dependencias:** Verificar que las dependencias de cada endpoint sean Edge-compatible.

---

## 4. Respuestas a Preguntas Específicas

### 4.1 Server Components vs Client-Side Fetching

**Recomendación: migración selectiva, no total.**

**Candidatas fuertes para Server Components:**
- `/configuracion/permisos` — tabla estática, edición por modal
- `/configuracion/usuarios` — lista con acciones puntuales
- `/pagos` — tabla de pagos con filtros simples
- `/portal/facturas` — datos del usuario autenticado
- `/portal/suscripciones` — datos estáticos
- `/clientes` (tabla) — paginación podría ser server-side con searchParams

**Deben seguir como Client Components:**
- `/comando` — polling activo, tabs interactivos, charts
- `/supervisor` — chat en tiempo real, streaming potencial
- `/cobranzas` — drag-and-drop kanban, campañas complejas
- `/ventas` y `/soporte` — kanban + polling
- `/bequant` — interactividad pesada

**Enfoque recomendado:** Patrón híbrido — Server Component como wrapper que hace el fetch inicial, Client Component hijo para interactividad:
```tsx
// page.tsx (Server Component)
export default async function Page() {
  const data = await getFinancialData(); // Direct DB call, no API route needed
  return <FinanzasClient initialData={data} />;
}
```

Esto elimina la necesidad del API route para el dato inicial, reduciendo invocaciones.

### 4.2 Endpoint consolidado /api/comando/summary

**Recomendación: SÍ, implementar.**

Ya existe un precedente: `gather-data.ts` hace exactamente esto para el Supervisor (9 queries paralelas). La diferencia es que Comando necesita datos ligeramente diferentes (aging, top debtors, payments by journal) que el Supervisor no usa.

**Propuesta concreta:**
```typescript
// /api/comando/summary/route.ts
export async function GET() {
  const [finance, infra, problems, hosts, soporte, ventas, cobranzas, nodes] = 
    await Promise.allSettled([
      getFinancialSummary(),    // ya cachea 2min
      getInfraOverview(),       // ya cachea 60s
      getInfraProblems(),       // ya cachea 60s
      getInfraHosts(),          // ya cachea 60s
      getSoporteFromKommo(),    // Kommo ISR 60s
      getVentasStats(),         // Supabase ~<100ms
      getCobranzasStats(),      // Supabase ~<100ms
      getMikrotikNodes(),       // Odoo ~1-2s
    ]);
  return apiSuccess({ finance, infra, problems, hosts, soporte, ventas, cobranzas, nodes });
}
```

**Beneficios:** 10 invocaciones → 1. Latencia: ~3-5s (paralelo) vs ~5-8s (waterfall client-side). Cache del endpoint entero con TTL 2min.

### 4.3 Cache de Zabbix en Supabase

**Recomendación: SÍ, pero gradual.**

**Fase 1 (inmediata):** Mantener cache in-memory actual pero reducir polling del frontend a 5 min.

**Fase 2 (MM3):** Mover cache a Supabase tabla `dashboard_cache`:
```sql
CREATE TABLE dashboard_cache (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  ttl_seconds INT DEFAULT 300
);
```

**Fase 3 (RE2):** Cron cada 5 min que actualiza Zabbix, Odoo, Kommo en la tabla. Frontend lee directo de Supabase (gratis, <100ms).

Esto transforma el modelo de "pull on demand" a "push on schedule" — el frontend nunca espera a Zabbix directamente.

### 4.4 Edge Functions candidatas

| Endpoint | Edge viable | Razón |
|----------|-------------|-------|
| `/api/health` | ✅ Sí | Solo lee env vars, sin I/O pesado |
| `/api/cobranzas/bcv` | ✅ Sí | fetch() externo simple |
| `/api/cobranzas/[token]` | ⚠️ Parcial | Lee de Supabase — necesita @supabase/ssr edge-compatible |
| `/api/mercantil/status/[token]` | ⚠️ Parcial | Lee de Supabase |
| `/api/mercantil/callback` | ✅ Sí | Redirect simple |
| `/api/auth/callback` | ❌ No | Supabase SSR auth flow requiere Node.js |
| `/api/infraestructura/*` | ❌ No | Zabbix client usa Node.js TLS config |
| `/api/odoo/*` | ❌ No | JSON-RPC necesita Node.js |
| `/api/supervisor/*` | ❌ No | AI SDKs requieren Node.js |

**Candidatas realistas: 3-4 endpoints.** El ahorro es marginal (~$0.50-1/mes). No recomiendo priorizar esto.

### 4.5 Patrón de webhooks

**Mercantil:**
- `POST /api/mercantil/webhook` — Procesa inline (no responde 200 primero). Potencial timeout si el procesamiento es lento. **Debería** usar el patrón "respond 200, then process async" con Supabase queue.
- `GET /api/mercantil/callback` — Redirect simple, correcto.

**PayPal:**
- `POST /api/cobranzas/webhook/paypal` — Procesa inline. Sin validación de firma de webhook. ⚠️ **Riesgo de seguridad** — cualquiera podría enviar webhooks falsos.
- `GET /api/cobranzas/webhook/paypal` — Verification challenge, correcto.

**Stripe:**
- `POST /api/cobranzas/webhook/stripe` — No verificado si usa `stripe.webhooks.constructEvent()` para validar firma.

**Duplicados:** No hay protección explícita contra webhooks duplicados (PayPal y Stripe pueden reenviar). Se recomienda tabla `webhook_events` con idempotency key.

**Meta WhatsApp:** No hay webhook endpoint para recibir mensajes de WhatsApp — solo envía (outbound). Si se necesita recibir respuestas de clientes, se necesitaría un webhook endpoint.

### 4.6 Estrategia de AI

**¿Justifica el dual engine su complejidad?**

**Costo actual:**
- Briefing diario: Gemini Flash (~$0.01) + Claude Sonnet (~$0.30) = ~$0.31/día = **~$9.30/mes**
- Chat: ~$0.01-0.05 por interacción (variable)
- Soportín: ~$0.01-0.03 por interacción (Claude Sonnet)

**Alternativa solo Gemini Flash:** ~$0.02/día = ~$0.60/mes. Ahorro: ~$8.70/mes.

**Mi recomendación: mantener el dual engine para briefings, pero evaluar si Gemini 2.5 Flash es suficiente.**

Razones:
1. El paso de "correlación estratégica" de Claude es el que da valor diferenciado al briefing
2. $9.30/mes es un costo bajo comparado con el valor de las insights
3. Gemini 2.5 Flash podría cubrir ambos pasos — vale la pena probar con A/B testing

**Optimización de tokens:** Los prompts actuales incluyen `BUSINESS_RULES` completo (~500 tokens). Esto es correcto y necesario — las reglas evitan falsos positivos en alertas.

**Lo que SÍ se puede optimizar:**
- El briefing se genera fresh incluso si ya hay uno cacheado del mismo día (si alguien hace force=true)
- El chat no tiene historial comprimido — cada mensaje envía el historial completo

### 4.7 Código muerto

| Elemento | Estado | Acción recomendada |
|----------|--------|---------------------|
| `/api/debug/kommo` | Sin callers en frontend | Eliminar o proteger con auth |
| `/api/debug/tags` | Sin callers en frontend | Eliminar o proteger con auth |
| `/api/odoo/status` | Sin callers directos | Verificar si se usa en health checks |
| `/api/infraestructura/routers` | Sin callers en frontend | Verificar si se usa |
| `/api/finanzas` | Retorna **mock data** (TODO en código) | Eliminar si no se planea implementar |
| `/api/tickets/*` (4 rutas) | Duplican funcionalidad de Kommo soporte | ¿Se usan todavía o fueron reemplazados por Kommo? |
| 6 imports no usados en `comando/page.tsx` | Build warnings | Limpiar |
| Variable `loading` no usada en `comando/page.tsx:981` | Build warning | Limpiar |

**Nota positiva:** No hay features half-implemented ni dead branches significativos. El código es funcional en su totalidad.

### 4.8 Manejo de errores

**Lo bueno:**
- ✅ Try/catch sistemático en ~95% de API routes
- ✅ Fallback object para Zabbix (`zabbixConnected: false`)
- ✅ Chain de fallback para BCV (3 APIs + manual)
- ✅ Dual engine fallback para AI (Gemini ↔ Claude)
- ✅ Mercantil tiene retry con exponential backoff
- ✅ WhatsApp fallback de template a texto plano
- ✅ Rate limiting en endpoints de pago
- ✅ financial-summary tiene fallback a `/api/facturacion/stats`

**Lo que falta:**
- ❌ **No hay React Error Boundaries** — un crash de render = pantalla blanca
- ❌ **Odoo sin retry** — si está lento, falla el TopBar, Comando, Supervisor, Portal
- ❌ **Sin circuit breaker** para Odoo — si Odoo está caído, cada request sigue intentando (y fallando con timeout de 15s)
- ❌ **Kommo sin manejo de token expirado** — falla silenciosa
- ❌ **PayPal webhook sin validación de firma** — riesgo de seguridad
- ⚠️ **Errores en frontend se silencian** — muchos `.catch(() => {})` o `catch { /* ignore */ }` sin feedback al usuario
- ⚠️ **No hay monitoring/alerting** — si un servicio externo se cae, nadie se entera hasta que un usuario reporta

---

## 5. Resumen Ejecutivo

### Top 5 acciones por impacto/esfuerzo

| # | Acción | Esfuerzo | Ahorro estimado | Tipo |
|---|--------|----------|-----------------|------|
| 1 | **Pausar polling en tab oculto** (QW1) | 1 hora | -70% invocaciones de polling (~3,000/día) | Quick win |
| 2 | **Reducir polling infra de 60s a 300s** (QW2) | 5 min | -80% invocaciones infra (~1,150/día) | Quick win |
| 3 | **Endpoint consolidado `/api/comando/summary`** (MM1) | 4-6 horas | -90% invocaciones de Comando (10→1 por visit) | Mejora mediana |
| 4 | **React Query para cache client-side** (MM2) | 2-3 días | Elimina re-fetches en navegación, retry automático | Mejora mediana |
| 5 | **TopBar context en layout** (QW3) | 2 horas | Elimina ~20 financial-summary calls/día por usuario | Quick win |

### Lo que está bien diseñado
- Cache de `financial-summary` con TTL 2min server-side
- `Promise.all` para queries paralelas (Comando, Supervisor, Infra)
- `Promise.allSettled` en `gather-data.ts` — falla parcial no tumba todo
- Separación clara de integraciones en `src/lib/integrations/`
- DAL pattern para Supabase en `src/lib/dal/`
- Middleware de auth robusto con protección de rutas
- Cron jobs bien dimensionados (95/1000 invocaciones mensuales)
- BCV con 4 niveles de fallback
- Business rules externalizadas en `business-rules.ts`
- RBAC editable desde UI con cache de permisos 60s

### Estimado de ahorro total
Si se implementan QW1 + QW2 + QW3 + MM1:
- **Reducción estimada: 60-70% de invocaciones de functions**
- Esto llevaría el consumo de Vercel de ~76% a ~25-30% del crédito mensual
- Tiempo de implementación: ~1-2 días de trabajo
