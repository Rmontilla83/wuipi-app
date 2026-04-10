# Auditoría de Seguridad — Wuipi App
**Fecha:** 2026-04-09
**Alcance:** Auditoría completa (Auth, APIs, Secrets, Frontend, Pagos, Config)

---

## Resumen Ejecutivo

Se auditaron los 4 frentes de seguridad de la aplicación. Se encontraron **42 hallazgos** clasificados por severidad:

| Severidad | Cantidad | Descripción |
|-----------|----------|-------------|
| CRITICAL  | 5        | Explotables hoy, acceso a datos o dinero |
| HIGH      | 8        | Riesgo alto, requieren acción esta semana |
| MEDIUM    | 12       | Mejoras importantes de defensa |
| LOW       | 4        | Buenas prácticas y hardening |

**La app tiene buena base de seguridad** (headers, HSTS, X-Frame-Options, middleware con Supabase SSR), pero hay brechas serias en la capa de autorización de APIs y en el flujo de pagos.

---

## CRITICAL — Acción Inmediata

### C1. Rutas `/api/odoo/*` son 100% públicas (sin autenticación)
**Archivo:** `src/middleware.ts:18`
```typescript
"/api/odoo/",  // Odoo integration (read-only)
```
**Impacto:** Cualquier persona en internet puede llamar:
- `GET /api/odoo/clients` → lista de todos los clientes con datos personales
- `GET /api/odoo/invoices` → todas las facturas
- `GET /api/odoo/financial-summary` → resumen financiero completo
- `GET /api/odoo/clients/[partnerId]` → datos de cualquier cliente específico
- `GET /api/odoo/payments-by-journal` → pagos por diario contable

**Remediación:** Eliminar `/api/odoo/` de `publicPaths` en el middleware. Estas rutas solo las usa el dashboard (ya autenticado).

---

### C2. 72 rutas API sin verificación de rol (RBAC bypass)
**Archivo:** Todas las rutas en `src/app/api/` excepto `/api/users/` y `/api/permissions/`

El middleware solo verifica que el usuario tenga una sesión válida, pero **ninguna ruta API verifica el rol del usuario**. Cualquier usuario autenticado (vendedor, técnico, soporte) puede:
- Leer facturas y datos financieros (`/api/facturacion/*`)
- Acceder al chat de IA con datos sensibles (`/api/supervisor/chat`)
- Ver datos de infraestructura y red (`/api/infraestructura/*`)
- Crear/modificar leads de ventas (`/api/crm-ventas/*`)
- Gestionar campañas de cobranza (`/api/cobranzas/*`)
- Importar clientes en bulk (`/api/facturacion/clients/import`)

**Remediación:** Crear un middleware de autorización reutilizable:
```typescript
// src/lib/auth/api-guard.ts
export async function requireRole(request: NextRequest, allowedRoles: UserRole[]) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("No autenticado", 401);
  const role = user.app_metadata?.role;
  if (!allowedRoles.includes(role)) return apiError("Sin permisos", 403);
  return { user, role };
}
```

---

### C3. Middleware usa `getSession()` en vez de `getUser()` — JWT no verificado server-side
**Archivo:** `src/middleware.ts:64`
```typescript
const { data: { session } } = await supabase.auth.getSession();
```
**Impacto:** `getSession()` solo lee el JWT del cookie y lo decodifica localmente **sin validar con Supabase**. Un JWT expirado, revocado, o manipulado podría pasar la verificación. Supabase documenta explícitamente que `getSession()` no es seguro para autorización server-side.

**Nota:** Se usa por el timeout de 1.5s en Vercel Hobby. Esto es un tradeoff conocido.

**Remediación:** Usar `getUser()` en las rutas API (no en middleware) para verificar sesión real:
```typescript
// En cada API route que maneje datos sensibles:
const { data: { user }, error } = await supabase.auth.getUser();
if (error || !user) return apiError("Sesión inválida", 401);
```

---

### C4. Token de pago usa secret público como fallback
**Archivo:** `src/lib/utils/payment-token.ts:3`
```typescript
const SECRET = process.env.PAYMENT_TOKEN_SECRET
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY  // ← PÚBLICO en el cliente
  || "wuipi-payment-secret";                     // ← hardcodeado en source code
```
**Impacto:** Si `PAYMENT_TOKEN_SECRET` no está configurado en Vercel:
1. Usa la anon key de Supabase (visible en el HTML de la app)
2. O peor, un string hardcodeado
3. Un atacante puede **forjar tokens de pago para cualquier cliente**

**Remediación:**
```typescript
const SECRET = process.env.PAYMENT_TOKEN_SECRET;
if (!SECRET) throw new Error("PAYMENT_TOKEN_SECRET is required");
```

---

### C5. XSS almacenado via notas de Odoo
**Archivo:** `src/app/(dashboard)/clientes/[id]/page.tsx:479`
```tsx
<div dangerouslySetInnerHTML={{ __html: data.notes }} />
```
**Impacto:** Las notas de clientes en Odoo se renderizan como HTML sin sanitizar. Si un atacante inyecta `<script>` en las notas de un cliente en Odoo, el script se ejecuta en el navegador de cualquier empleado que visite ese cliente.

**Remediación:**
```tsx
import DOMPurify from "isomorphic-dompurify";
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data.notes) }} />
```

---

## HIGH — Esta Semana

### H1. Rutas `/api/portal/*` son públicas sin autenticación propia
**Archivo:** `src/middleware.ts:22`
```typescript
"/api/portal/",  // Portal API endpoints
```
**Impacto:** Endpoints del portal de clientes accesibles sin autenticación:
- `/api/portal/soportin` → chat de IA con datos del cliente
- `/api/portal/tickets` → tickets de soporte
- `/api/portal/plan-requests` → solicitudes de cambio de plan
- `/api/portal/payment-link` → generación de links de pago

**Remediación:** Estas rutas deben validar el Magic Link token internamente, no ser bypassed del middleware.

---

### H2. Error responses exponen detalles internos
**Archivo:** `src/lib/api-helpers.ts:11-14`
```typescript
export function apiServerError(error: unknown) {
  const message = error instanceof Error ? error.message : "Error interno del servidor";
  return NextResponse.json({ error: message }, { status: 500 });
}
```
**Impacto:** Mensajes de error de librerías internas (Supabase, Odoo, Stripe) se envían directamente al cliente. Revelan paths internos, nombres de tablas, y detalles de implementación.

**Remediación:**
```typescript
export function apiServerError(error: unknown) {
  console.error("[API Error]", error);
  return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
}
```

---

### H3. CSP permite `unsafe-eval` y `unsafe-inline`
**Archivo:** `next.config.js:27-28`
```
script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com
style-src 'self' 'unsafe-inline'
```
**Impacto:** Anula gran parte de la protección contra XSS. Un atacante que logre inyectar contenido puede ejecutar scripts arbitrarios.

**Remediación:** Eliminar `unsafe-eval` (Next.js no lo necesita en producción). Para `unsafe-inline` en styles, es necesario por Tailwind — aceptable. Para scripts, usar nonces.

---

### H4. Webhook de Mercantil sin verificación de firma
**Archivo:** `src/app/api/mercantil/webhook/route.ts`

El webhook procesa pagos entrantes sin verificar que realmente provienen de Mercantil. Un atacante podría enviar un POST falso para marcar pagos como confirmados sin que el dinero haya llegado.

**Remediación:** Verificar firma HMAC del webhook según documentación de Mercantil.

---

### H5. Mercantil SDK usa AES-128-ECB (sin IV)
**Archivo:** `src/lib/mercantil/core/crypto.ts:9,29`
```typescript
const ALGORITHM = 'aes-128-ecb';
const cipher = crypto.createCipheriv(ALGORITHM, key, null); // null IV
```
**Impacto:** ECB es determinístico — mismos datos producen mismo ciphertext. Permite análisis de patrones en montos de pago.

**Nota:** Esto es la implementación que **Mercantil exige** en su SDK. No se puede cambiar unilateralmente — está dictado por `github.com/apimercantil/encrypt-examples`. Documentar como riesgo aceptado.

---

### H6. HMAC del payment token truncado a 64 bits
**Archivo:** `src/lib/utils/payment-token.ts:12`
```typescript
.digest("hex").substring(0, 16);  // Solo 64 bits de los 256
```
**Impacto:** 16 chars hex = 64 bits. Con rate limiting débil y partner IDs secuenciales, un atacante podría intentar fuerza bruta.

**Remediación:** Usar al menos 32 chars (128 bits):
```typescript
.digest("hex").substring(0, 32);
```

---

### H7. Comparación de HMAC vulnerable a timing attack
**Archivo:** `src/lib/utils/payment-token.ts:30`
```typescript
if (signature !== expectedHmac) return null;
```
**Remediación:**
```typescript
import { timingSafeEqual } from "crypto";
if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedHmac))) return null;
```

---

### H8. Sin rate limiting en endpoints públicos de pago por cliente
**Archivos:** `src/app/api/pagar/cliente/route.ts`, `src/app/api/pagar/cliente/iniciar/route.ts`

Endpoints públicos que consultan Odoo sin límite de tasa. Un atacante puede enumerar todos los clientes.

**Remediación:** Agregar `checkRateLimit()` como ya existe en `/api/cobranzas/[token]`.

---

## MEDIUM — Próximas 2 Semanas

### M1. ilike en DAL con input sin escapar
**Archivos:** `src/lib/dal/facturacion.ts:42-44`, `tickets.ts:51`, `crm-ventas.ts:54`, `crm-cobranzas.ts:53`
```typescript
query = query.or(`legal_name.ilike.%${options.search}%,...`);
```
Aunque Supabase usa queries parametrizados, el string del `.or()` se construye con input del usuario. Caracteres especiales (`,`, `.`) podrían alterar la lógica del filtro.

**Remediación:** Escapar caracteres especiales del search term antes de interpolar.

---

### M2. Bulk import sin validación de schema
**Archivo:** `src/app/api/facturacion/clients/import/route.ts:60-62`
Acepta campos arbitrarios sin validar contra un Zod schema.

---

### M3. `dangerouslySetInnerHTML` con JSON en campañas
**Archivo:** `src/components/crm-cobranzas/campaigns-tab.tsx:1246,1250`
Aunque usa JSON.stringify (menor riesgo), debería usar `<pre><code>` en su lugar.

---

### M4. Console.log con datos sensibles en producción
**Archivos:** Múltiples rutas API logean tokens, montos, y detalles de error completos.

---

### M5. Sin CSRF token en formularios de pago
**Archivos:** `src/app/pagar/cliente/[token]/page.tsx`, `src/app/api/cobranzas/pay/confirm/route.ts`
Las cookies de Supabase usan `SameSite=Lax` (protección parcial). Un CSRF token explícito sería más robusto.

---

### M6. Raw webhook payload almacenado en DB
**Archivo:** `src/app/api/mercantil/webhook/route.ts:22-25`
Almacena el payload completo del webhook. Podría contener datos sensibles.

---

### M7. SSRF potencial en config de Bequant
**Archivo:** `src/lib/integrations/bequant.ts:49`
El `host` viene de la DB. Si se compromete, podría apuntar a IPs internas.

---

### M8. Prompt injection en AI orchestrator
**Archivo:** `src/lib/ai/orchestrator.ts:54`
Contexto con datos de Odoo se concatena directamente al prompt sin separación clara.

---

### M9. `metadata: z.any()` en schemas de validación
**Archivo:** `src/lib/validations/schemas.ts:150,253`
Permite objetos arbitrarios sin límite de tamaño.

---

### M10. Sin audit logging en operaciones financieras
Creación de facturas, pagos, y modificaciones de clientes no dejan registro de auditoría.

---

### M11. Token de pago sin expiración
**Archivo:** `src/lib/utils/payment-token.ts`
Los tokens permanentes nunca expiran. Si un link se filtra, es válido para siempre.

---

### M12. Posible manipulación de monto en collection items
**Archivos:** `src/lib/dal/collection-campaigns.ts:182-210`
`amount_usd` puede ser actualizado vía API antes de confirmar pago.

---

## LOW — Mejora Continua

### L1. Sin `frame-ancestors` en CSP (redundante con X-Frame-Options)
### L2. Rate limiting solo por IP (bypasseable con proxies)
### L3. Sin monitoreo de accesos anómalos a APIs
### L4. Dependencias sin Dependabot configurado

---

## Estado Positivo (lo que ya está bien)

- **Headers de seguridad completos**: HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP
- **`.env.local` NO está en git** — correctamente en `.gitignore`
- **Cron routes validan `CRON_SECRET`** en los 3 endpoints
- **Supabase SSR** con cookies HttpOnly para auth
- **Rate limiting** implementado en endpoints de pago por token
- **Open redirect** protegido en auth callback con regex whitelist
- **`poweredByHeader: false`** — no expone Next.js
- **`crypto.ts` para Bequant** usa AES-256-GCM correctamente (solo Mercantil usa ECB por requerimiento del banco)
- **RLS habilitado** en todas las tablas de Supabase
- **Validación Zod** en la mayoría de endpoints con `validate()`

---

## Plan de Remediación Propuesto

### Fase 1 — URGENTE (esta semana)
| # | Tarea | Esfuerzo | Impacto |
|---|-------|----------|---------|
| 1 | Quitar `/api/odoo/` y `/api/portal/` de publicPaths en middleware | 15 min | CRITICAL |
| 2 | Verificar `PAYMENT_TOKEN_SECRET` existe (throw si no) | 10 min | CRITICAL |
| 3 | Sanitizar `data.notes` con DOMPurify | 15 min | CRITICAL |
| 4 | Cambiar `apiServerError()` para no exponer mensajes internos | 10 min | HIGH |
| 5 | Agregar rate limiting a `/api/pagar/cliente/*` | 15 min | HIGH |
| 6 | Extender HMAC a 32 chars + timingSafeEqual | 15 min | HIGH |

**Total Fase 1: ~1.5 horas**

### Fase 2 — IMPORTANTE (próxima semana)
| # | Tarea | Esfuerzo | Impacto |
|---|-------|----------|---------|
| 7 | Crear `requireRole()` helper y aplicar en top-10 APIs sensibles | 2 horas | CRITICAL |
| 8 | Usar `getUser()` en API routes financieras/admin | 1 hora | CRITICAL |
| 9 | Verificar firma en webhook Mercantil | 1 hora | HIGH |
| 10 | Quitar `unsafe-eval` de CSP | 30 min | HIGH |
| 11 | Escapar search terms en DAL `.or()` queries | 1 hora | MEDIUM |
| 12 | Reemplazar `dangerouslySetInnerHTML` en campaigns-tab | 15 min | MEDIUM |

**Total Fase 2: ~6 horas**

### Fase 3 — HARDENING (mes de abril)
| # | Tarea | Esfuerzo | Impacto |
|---|-------|----------|---------|
| 13 | Aplicar `requireRole()` a las 72 rutas restantes | 4 horas | HIGH |
| 14 | Implementar audit logging en operaciones financieras | 3 horas | MEDIUM |
| 15 | Agregar expiración a payment tokens (30 días) | 1 hora | MEDIUM |
| 16 | Limpiar console.log de datos sensibles | 1 hora | MEDIUM |
| 17 | Agregar CSRF tokens a formularios de pago | 2 horas | MEDIUM |
| 18 | Validar schema en bulk import | 30 min | MEDIUM |
| 19 | Configurar Dependabot en GitHub | 15 min | LOW |

**Total Fase 3: ~12 horas**

---

## Decisiones que Necesitan tu Input

1. **Mercantil ECB**: Es requerimiento del banco. Lo documentamos como riesgo aceptado?
2. **`getSession()` en middleware**: Si pasamos a `getUser()`, puede haber timeouts en Vercel Hobby. Prefieres upgrade a Pro o mantener `getSession()` en middleware + `getUser()` solo en API routes?
3. **72 rutas sin RBAC**: Hacemos todas de una vez o priorizamos las financieras/admin primero?
4. **Payment tokens permanentes**: Agregamos expiración (30 días) o prefieres que sigan siendo permanentes para los links de WhatsApp?
