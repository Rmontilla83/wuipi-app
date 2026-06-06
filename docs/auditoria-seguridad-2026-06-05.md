# 🔒 Auditoría de seguridad 360 — Portales y pasarelas Wuipi

**Fecha:** 2026-06-05 · **Modo:** solo lectura (sin cambios aplicados)
**Alcance:** portal del cliente, portal de pago, pasarelas (Mercantil/Stripe/PayPal), rutas API,
gestión de secretos, headers/CSP, dependencias.
**Método:** 4 auditores en paralelo (auth/sesión, pasarelas/webhooks, autorización/inputs,
secretos/headers/deps) + verificación manual de los hallazgos críticos.

> **Veredicto general:** postura **sólida en lo fundamental** — Stripe y PayPal ejemplares, control
> de acceso (IDOR/permisos) consistente, secretos sin fallback inseguro, crons fail-closed. **Pero
> hay un agujero crítico explotable hoy** (`/api/version`) y la pasarela **Mercantil** es el eslabón
> débil (confía en el webhook sin validar monto ni autenticidad). Esos dos concentran el riesgo.

---

## 🔴 CRÍTICO

### C1 — `/api/version` público, sin auth: ejecuta transferencias reales contra el banco y filtra secretos
**Evidencia:** `src/app/api/version/route.ts` (`// Publico. Sin auth.`, línea 8). `middleware.ts` no
protege rutas. Verificado línea por línea:
- **Sin parámetros** (líneas 47-68) ya devuelve a cualquiera: `person_number`,
  `transfer_merchant_id`, `transfer_base_url`, whitelist de partners Odoo, y **fingerprints de las
  secret keys/client-ids** de Mercantil (len + últimos 6 chars + primeros 16 hex de SHA-256).
- Con `?test-transfer=1` / `?test-transfer=sdk` (líneas 77-180) ejecuta un **`POST
  /v1/payment/transfer-search` real contra Mercantil** y devuelve `body_sent`,
  `x-global-transaction-id` y la respuesta cruda del banco.

**Riesgo:** reconnaissance (confirmar secretos filtrados por otra vía, reducir espacio de búsqueda),
abuso de la API de banca de Wuipi (rate-limit/bloqueo del integrador, fuga de GTIDs), exposición de
la lógica de cifrado y del body exacto al banco.
**Recomendación:** eliminar los modos `test-transfer`/`sdk` y los bloques `mercantil_env`/`odoo_env`.
Dejar solo el commit marker. Diagnóstico futuro detrás de `requirePermission()`/`Bearer CRON_SECRET`.

### C2 — El webhook de Mercantil marca pagado sin validar monto y confía en "descifrar = auténtico"
**Evidencia:** `src/app/api/mercantil/route.ts:322-343` — con `status === "approved"` llama
`markItemPaid(..., { amount_bss: normalized.amount })` **sin comparar el monto contra lo adeudado**.
Stripe (`webhook/stripe/route.ts:71-87`) y PayPal (`webhook/paypal/route.ts:76-91`) **sí** validan
con tolerancia $0.01 y abren `amount_mismatch`. AES-128-ECB no es autenticado: descifrar ≠ auténtico.
**Riesgo:** saldar $100 con un evento "approved" de $0.01; si la secret key se filtra (C1 expone su
fingerprint), forjar el evento "approved".
**Recomendación:** (1) comparar monto contra `item.amount_bss` con tolerancia de céntimo igual que
Stripe/PayPal; (2) **no confiar en el push como única verdad** — confirmar contra la search API antes
de marcar paid; (3) evaluar allow-list de IPs de Mercantil. *El ECB es requisito del banco, no bug
propio — por eso la mitigación es no confiar en el webhook, no cambiar el cifrado.*

---

## 🟠 ALTO

### A1 — Inyección de operador PostgREST con `invoice_number` del webhook *(reportado por 2 auditores + verificado)*
**Evidencia:** `src/app/api/mercantil/route.ts:332` y `:483` —
`.or(\`invoice_number.eq.${normalized.invoice_number},payment_token.eq.${...}\`)` con el campo
descifrado sin sanitizar. Un valor con comas/operadores altera la lógica del `.or()`.
**Riesgo:** inyección de operadores de filtro (no SQLi clásica; PostgREST parametriza valores);
explotable junto con C2.
**Recomendación:** validar contra `/^[A-Za-z0-9_-]{1,32}$/` o el formato `WPY-XXXXXXXX` antes de
interpolar, o usar `.eq()` separados. Precedente de sanitización en `transactions/route.ts`.

### A2 — Rate limiting solo en memoria (per-lambda) → brute-force / password spraying
**Evidencia:** `src/lib/utils/rate-limit.ts:4` — `const store = new Map()` por instancia; se reinicia
en cold start y no se comparte entre lambdas.
**Riesgo:** el límite efectivo de login se multiplica por nº de instancias; habilita spraying
(agravado por contraseña mínima de 8, B1).
**Recomendación:** store compartido (tabla Supabase con ventana, o Vercel KV/Upstash) al menos para
login/change-password/reset.

### A3 — Dependencias con vulnerabilidades High: Next.js y `tmp`
**Evidencia:** `npm audit --omit=dev` → 8 vulns (2 high, 6 moderate). `next@^14.2.0` arrastra DoS por
Server Components, request smuggling en rewrites, cache-poisoning de redirects de middleware; `tmp`
(transitiva) high.
**Riesgo:** DoS y posible cache-poisoning/smuggling en producción.
**Recomendación:** planificar upgrade de Next (probar en preview, fix es major) y `npm update` de las
moderate no-major (`tmp`, `ws`, `postcss`, `resend`, `svix`). No usar `--fix --force` a ciegas.

---

## 🟡 MEDIO

### M1 — `verify-email` enumera clientes y devuelve `partner_id`
`src/app/api/portal/verify-email/route.ts:54-64` revela en el body `exists`/`hasAccount` + el
`partner_id` real. **Rec:** quitar `partner_id` del body, endurecer rate-limit / CAPTCHA.

### M2 — Secret key de prod de Mercantil en scripts de debug + script trackeado que la imprime
`scripts/debug-mercantil-crypto-compare.ts:24` y `debug-mercantil-spa-replicate.ts:18` con la clave de
prod del Botón Web hardcodeada (gitignored, pero en disco/backups). `scripts/diagnose-rafael-transfer-
round2.mjs:24` hace `console.log("secret:", TS_SECRET)` completo y **sí está en git**. **Rec:** mover a
`.env.local`, ofuscar el log, **considerar rotar** la secret key del Botón Web.

### M3 — Token de pago permanente + `/api/pagar/cliente` expone PII (cédula) con solo el token
`src/lib/utils/payment-token.ts` (token bearer permanente sin expiración/revocación) +
`src/app/api/pagar/cliente/route.ts:112-122` (devuelve nombre, email, cédula/RIF, deuda, facturas). El
token no es adivinable (HMAC fuerte, timing-safe); riesgo **post-filtración** (screenshot, reenvío de
WhatsApp). **Rec:** enmascarar cédula, minimizar payload, no devolver el token en la respuesta;
expiración para flujos sensibles. Trade-off de UX consciente — documentar.

### M4 — CSP con `'unsafe-inline'` en `script-src` en producción
`next.config.js:8` — `unsafe-eval` solo en dev (bien), pero `'unsafe-inline'` permanece en
`script-src` en prod, debilitando la protección XSS. **Rec:** migrar a nonces/hashes y quitar
`'unsafe-inline'` de `script-src`.

### M5 — `MIGRATION-DISCOVERY*.md` versionados exponen infra de Odoo
`MIGRATION-DISCOVERY.md:3` — `Server: https://erp.wuipi.net · DB: wuipi · User: rmontilla@wuipi.net`.
**Rec:** sacar de git o redactar usuario/DB.

### M6 — Idempotencia del webhook Mercantil: carrera en el dedupe por referencia
`mercantil/route.ts:299-320` — check-then-act no atómico. El doble-cobro del **mismo item** sí está
protegido por `markItemPaid` (UPDATE atómico `.neq("status","paid")`); el residual es doble-log/caso.
**Rec:** constraint UNIQUE en `payment_webhook_logs(reference_number) WHERE processed`.

---

## 🟢 BAJO

- **B1 — Contraseña débil:** mínimo 8 sin complejidad (`portal-auth.ts:70,155`). Subir a 10-12 y/o
  validar contra comunes (o activar política de Supabase). Multiplica el efecto de A2.
- **B2 — CI no bloquea por vulns ni hace secret scanning:** `.github/workflows/ci.yml:45`
  `npm audit ... || true` con `--audit-level=critical`. Subir a `high` sin `|| true` + gitleaks.
- **B3 — `change-password` no invalida otras sesiones; refresh 180d sin revocación:** cookie robada
  sobrevive a un cambio de clave hasta su `exp`. Considerar `ver`/contador en el payload y reducir el
  refresh.
- **B4 — PII en `exports/*.csv` en disco** (gitignored): nombres, cédulas, teléfonos, montos. Tratar
  `exports/` como efímero, purgar, no incluir en backups sin cifrar.
- **B5 — Webhook Mercantil siempre responde 200 y es permisivo:** permite inundar
  `payment_webhook_logs`. Considerar rate-limit por IP.

---

## ✅ Lo que está BIEN hecho

- **Stripe:** `constructEvent` con raw body + anti-replay + validación de monto + idempotencia atómica.
- **PayPal:** binding por `customId` echo-back (no el query param) → anti cross-credit/IDOR; verifica
  firma contra endpoint oficial con allow-list `*.paypal.com`; open-redirect mitigado.
- **IDOR:** todas las rutas `/api/portal/*` atan el `partnerId` a la cookie HMAC firmada. Sin IDOR.
- **Rutas admin de pago:** `super_admin` + kill-switch + whitelist + idempotencia. Crons fail-closed
  con `CRON_SECRET`.
- **Secretos:** sin fallback inseguro (lanza si falta o `<32`), HMAC timing-safe, `service_role` solo
  server-side, `.env.local` fuera de git, nada en `NEXT_PUBLIC_*`.
- **Headers:** HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  COOP. `poweredByHeader: false`.
- **TLS:** bypass de cert self-signed scoped al Pool de Bequant, no global.
- **Soportín:** `sanitizeForPrompt` en cada campo de Odoo + `<client_data>` tratado como datos +
  `partnerId` bloqueado al del caller. Peor caso: el bot le repite su propio prompt al propio dueño.
- **AES-128-ECB de Mercantil:** requisito del banco, no error propio.

---

## 🎯 Hoja de ruta sugerida (orden de ejecución)

1. **Hoy:** neutralizar `/api/version` (C1). El más expuesto y el más barato.
2. **Esta semana:** validación de monto + confirmación contra search API en el webhook Mercantil (C2)
   + sanitizar `invoice_number` (A1). Mismo archivo.
3. **Corto plazo:** rate-limit persistente (A2) + política de contraseña (B1); rotar/ofuscar secretos
   de scripts (M2); quitar `partner_id` de verify-email (M1).
4. **Mantenimiento:** upgrade de dependencias (A3), endurecer CSP (M4) y CI (B2), limpiar docs/exports
   con datos sensibles (M5, B4).

---

*Auditoría de solo lectura. Ningún archivo de la aplicación fue modificado. Hallazgos C1, C2 y A1
verificados manualmente sobre el código fuente.*
