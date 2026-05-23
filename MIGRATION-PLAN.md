# Plan de Adaptación — Wuipi App al nuevo Odoo

> Diseñado: 2026-05-23
> Anexos: `MIGRATION-DISCOVERY.md`, `MIGRATION-DISCOVERY-CONTRACTS.md`, `MIGRATION-DISCOVERY-SERVICES.md`
> Estado del plan: **PROPUESTO — pendiente aprobación**

---

## 1. Resumen ejecutivo

Migración de Wuipi App de Odoo.sh Enterprise (`wuipitech-master-25136766`) a Odoo 18 Community self-hosted (`https://erp.wuipi.net`, DB `wuipi`).

**No se migran datos**. Eso es responsabilidad del usuario por fuera de este plan.

El nuevo Odoo absorbe la mayoría de la lógica que hoy vive en la app (CRM, bot, campañas, suscripciones, billing automation, fiscal SENIAT). La app queda con dos responsabilidades únicas:

1. **Flujo completo de pagos** (Mercantil, Stripe, PayPal, C2P, Cash) → registra resultado en Odoo vía `payment.transaction`.
2. **Portal del usuario** (login Magic Link, ver facturas, ver servicio ISP, pagar).

Todo lo demás se ELIMINA en Fase 5 (post-cutover estable).

---

## 2. Decisiones cerradas

| # | Decisión | Valor |
|---|---|---|
| D1 | Estado del nuevo Odoo | Vacío (con data de prueba mínima) |
| D2 | Estrategia | Big bang, sin coexistencia |
| D3 | Migración de datos | Fuera de scope (responsable: usuario) |
| D4 | IDs en Supabase | **Reset total** de tablas que referencian Odoo viejo al momento del switch |
| D5 | Modelo de suscripciones | `contract.contract` (OCA contract extendido por Wuipi) |
| D6 | Arquitectura de pagos | `payment.transaction` nativo Odoo |
| D7 | Mercantil | App = source of truth; Odoo recibe pago ya confirmado |
| D8 | Stripe/PayPal | Provider nativo activado en Odoo; app sincroniza estados |
| D9 | Roles app post-switch | (a) Flujo de pagos, (b) Portal usuario |
| D10 | Reestructuración profunda | Fase 5, post-estabilización |

---

## 3. Estado objetivo

### Lo que la app HACE post-switch

- Portal cliente: login Magic Link, dashboard, listado de facturas (lectura `account.move`), detalle de servicio (`wuipi.isp.service`), pago.
- Portal de pago público: `/pagar/cliente/[token]`, `/pagar/[token]`, `/i/[token]`.
- Pasarelas: Mercantil Botón Web + C2P + Búsqueda de Transferencias, Stripe, PayPal, Cash (oficina).
- Webhooks: `/api/mercantil`, `/api/cobranzas/webhook/stripe`, `/api/cobranzas/webhook/paypal`.
- Sincronización pago → Odoo: crear/actualizar `payment.transaction`.
- Herramientas admin: `/api/admin/odoo/post-invoice`, `register-payment`, `preview-*`, `invoice-info`, `journal-info`.

### Lo que la app NO HACE post-switch

- Cobranzas, segmentos, campañas, notificaciones WhatsApp/Email (lo hace `wuipi_campaigns`).
- Inbox multicanal, bot ventas, lead lifecycle (lo hace `wuipi_crm` + `wuipi_crm_bot`).
- Cron `odoo-sync`, `drafts-alert` (lo hace cron nativo `Generate Recurring Invoices from Contracts`).
- Centro de Comando, Finanzas, Supervisor IA, briefings Telegram (queda como dashboards de lectura como máximo; reestructurar en Fase 5).
- Bequant integration: evaluar en Fase 5 (puede sobrevivir si aporta valor).

---

## 4. Mapeo viejo → nuevo

### 4.1 Modelos

| Viejo (Enterprise) | Nuevo (Community + Wuipi modules) |
|---|---|
| `sale.subscription` | `contract.contract` |
| `sale.subscription.line` | `contract.line` |
| (no existía) | `wuipi.isp.service` (modelo de servicio ISP del cliente) |
| (no existía) | `wuipi.payment.promise` |
| (no existía) | `wuipi.isp.suspension.log` |
| `account.payment` directo | `payment.transaction` → genera `account.payment` |

### 4.2 Campos clave en `contract.contract`

| Concepto app | Field nuevo |
|---|---|
| Identificador legible | `name` (ej. `"SUB-00029"`) |
| Próxima factura | `recurring_next_date` |
| Estado lifecycle | `wuipi_state` (`active`/`grace_period`/`suspended`/`cancelled`/`churned`) |
| Estado comercial | `wuipi_subscription_state` (`1_draft`/`2_renewal`/`3_progress`/`4_paused`/`6_churn`/`7_upsell`) |
| Día de facturación | `wuipi_default_fixed_day` |
| ¿Vencido? | `is_overdue` (ya calculado por Odoo) |
| Servicios ISP del cliente | `wuipi_isp_service_ids` (one2many → `wuipi.isp.service`) |

### 4.3 Campos clave en `wuipi.isp.service`

`name`, `subscription_id` (→ contract), `partner_id`, `wuipi_plan_product_id`, `wuipi_plan_category_id`, `router_id`, `node_id`, `sector_id`, `ipv4_id`, `ip_cpe`, `device_type_id`, `installation_date`, `installation_address`, `state`, `is_active`.

### 4.4 Currencies (IDs cambian)

| Currency | Viejo | Nuevo |
|---|---:|---:|
| USD | 1 | 1 |
| VED | 166 | **171** |
| EUR | — | 126 |

### 4.5 Journals (mapping completo)

| Banco / Concepto | Viejo (estimado) | Nuevo (confirmado) |
|---|---|---|
| BNK1 Genérico | ? | id=6 |
| Banesco 1730 | ? | id=9 (`BNK2`) |
| BdV 8937 | ? | id=10 (`BNK3`) |
| BNC 5214 | ? | id=11 (`BNK4`) |
| Tesoro 9877 | ? | id=12 (`BNK5`) |
| Mercantil USD 9021 | ? | id=13 (`BNK6`, USD) |
| Mercantil EUR 9048 | ? | id=14 (`BNK7`, EUR) |
| Pagos Electrónicos (Stripe/PayPal/MP) | ? | id=15 (`BNK8`, USD) |
| Bancamiga 1945 | NUEVO | id=16 (`BNK9`) |
| Cash | ? | id=7 (`CSH1`) |
| Retenciones | ? | id=18 (`CSH2`) |
| IGTF | ? | id=19 (`IGTF`) |
| Customer Invoices | ? | id=1 (`INV`) |
| Recibos Suscripciones | NUEVO | id=24 (`REC`) |
| Facturas Históricas | NUEVO | id=25 (`REC1`) |

> Acción: extraer todos los hardcodes de `payment_journal_id` a `src/lib/integrations/odoo-config.ts`.

### 4.6 Pasarelas y `payment.transaction`

| Pasarela | Provider Odoo | Quien crea tx | Quien marca done |
|---|---|---|---|
| Mercantil Botón Web | (custom o "Wire Transfer") | App | App (post-confirmación SDK) |
| Mercantil C2P | (custom o "Wire Transfer") | App | App (post-confirmación) |
| Mercantil Búsqueda Transferencias | (custom o "Wire Transfer") | App | App (post-match) |
| Stripe | `stripe` (nativo, activar) | App + webhook | App via webhook |
| PayPal | `paypal` (nativo, activar) | App + webhook | App via webhook |
| Cash (oficina) | "Wire Transfer" / custom | App | App (al confirmar admin) |

---

## 5. Arquitectura de la capa de integración

### 5.1 Cliente Odoo

`src/lib/integrations/odoo.ts` se refactoriza para:

- Leer `ODOO_*` env vars como hoy (no se cambian los nombres).
- Mantener el helper `jsonRpc()`, `sanitizeOdooSearch()`, cache de uid.
- Las **funciones de alto nivel** que hoy hablan de `sale.subscription` se reescriben para hablar de `contract.contract`.

### 5.2 Tabla de configuración Odoo

`src/lib/integrations/odoo-config.ts` (NUEVO) contiene:

```ts
export const ODOO_CURRENCY_IDS = { USD: 1, VED: 171, EUR: 126 } as const;
export const ODOO_JOURNAL_IDS = {
  MERCANTIL_USD: 13,    // BNK6
  MERCANTIL_EUR: 14,    // BNK7
  PAGOS_ELECTRONICOS: 15, // BNK8 (Stripe/PayPal)
  BANESCO: 9,           // BNK2
  BDV: 10,              // BNK3
  BNC: 11,              // BNK4
  TESORO: 12,           // BNK5
  BANCAMIGA: 16,        // BNK9
  CASH: 7,              // CSH1
  IGTF: 19,             // IGTF
  CUSTOMER_INVOICES: 1, // INV
  RECIBOS_SUSCRIPCIONES: 24, // REC
} as const;
```

> Si en producción los IDs llegaran a cambiar, esto se convierte en `loadOdooConfig()` que los resuelve al boot por `code`.

### 5.3 Dominio de la app (domain models)

Crear types neutrales que NO dependan del modelo Odoo exacto. Ejemplo:

```ts
// src/types/odoo-domain.ts
export interface Subscription {
  id: number;
  reference: string;          // contract.name → "SUB-00029"
  partnerId: number;
  partnerName: string;
  state: "active" | "grace_period" | "suspended" | "cancelled" | "churned";
  subscriptionState: "draft" | "renewal" | "progress" | "paused" | "churn" | "upsell";
  recurringNextDate: string;
  isOverdue: boolean;
  // ...
}
```

Las funciones del cliente devuelven esos tipos. Los componentes NO leen `contract.contract` directamente.

---

## 6. Adaptación módulo por módulo (orden de ejecución)

> Cada módulo se hace en branch propia, smoke-test en local contra erp.wuipi.net, merge.

### Etapa A — Capa base (1 PR)

1. Crear `src/lib/integrations/odoo-config.ts`.
2. Crear `src/types/odoo-domain.ts`.
3. Refactorizar `src/lib/integrations/odoo.ts`:
   - Helpers `getPartner()`, `listPartners()`, `getInvoice()`, `listInvoices()`, `getSubscription()`, `listSubscriptionsForPartner()`, `getService()`, `listServicesForPartner()`.
   - Cualquier referencia a `sale.subscription` desaparece.
4. **Test de aceptación**: `npm run build` + `node scripts/smoke-odoo-new.mjs` (a crear) que lee 1 partner, 1 contract, 1 service y 1 invoice del nuevo Odoo y los imprime.

### Etapa B — Portal cliente lectura (1 PR)

Rutas afectadas:
- `/api/odoo/clients/route.ts`
- `/api/odoo/clients/[partnerId]/route.ts`
- `/api/odoo/clients/[partnerId]/network/route.ts` → ahora lee de `wuipi.isp.service`
- `/api/odoo/invoices/route.ts`
- `/api/odoo/invoices/grouped/route.ts`
- `/api/odoo/status/route.ts`
- `/api/odoo/financial-summary/route.ts`
- `/api/odoo/payments-by-journal/route.ts`
- `/api/portal/verify-email/route.ts`
- Componentes en `src/app/portal/**`

**Test de aceptación**: login con un usuario test, ver listado de facturas con datos del nuevo Odoo, ver `wuipi.isp.service` del cliente.

### Etapa C — Portal de pago lectura (1 PR)

- `/api/cobranzas/[token]/route.ts` → lee partner + invoices pendientes del nuevo
- `/api/pagar/cliente/route.ts`
- `/api/pagar/cliente/iniciar/route.ts`
- `/i/[token]/route.ts`
- `/pagar/cliente/[token]/page.tsx`
- `/pagar/[token]/page.tsx`

**Test de aceptación**: abrir `/pagar/cliente/[token]` para un partner test del nuevo Odoo, ver deuda pendiente correcta.

### Etapa D — `payment.transaction` (1 PR)

Helper nuevo: `src/lib/integrations/odoo-payments.ts`

```ts
export async function createPendingTransaction(opts: {
  partnerId: number;
  invoiceIds: number[];
  amount: number;
  currencyCode: "USD" | "VED" | "EUR";
  providerCode: "mercantil_boton_web" | "mercantil_c2p" | "stripe" | "paypal" | "cash" | "wire_transfer";
  reference: string;     // nuestro token de la app
  partnerEmail?: string;
  partnerPhone?: string;
}): Promise<{ transactionId: number }>;

export async function markTransactionDone(opts: {
  transactionId: number;
  providerReference: string;  // ID del lado de la pasarela
  journalId?: number;          // Si queremos forzar BNK6/7/etc.
  isIgtf?: boolean;            // efectivo USD = true
}): Promise<{ paymentId: number | null }>;

export async function markTransactionFailed(opts: {
  transactionId: number;
  reason: string;
}): Promise<void>;
```

### Etapa E — Mercantil end-to-end (1 PR)

Adaptar:
- `/api/mercantil/route.ts` (webhook) → al confirmar Mercantil llama `markTransactionDone()`.
- `/api/cobranzas/pay/confirm/route.ts` → crea `payment.transaction` y luego la marca done o pending.
- `/api/cobranzas/pay/c2p-confirm/route.ts`
- `src/lib/mercantil/**` se mantiene tal cual (SDK no cambia).

**Test de aceptación**: pago real con tarjeta de prueba Mercantil (sandbox o monto pequeño en prod) → ver `payment.transaction` creada en Odoo, ver `account.payment` autogenerado, ver invoice reconciliada.

### Etapa F — Stripe + PayPal (1 PR)

- Activar provider Stripe en Odoo (configurar API keys del Odoo nuevo).
- Activar provider PayPal en Odoo.
- Adaptar `/api/cobranzas/webhook/stripe/route.ts` → resolver `payment.transaction` Odoo correspondiente y marcarla done.
- Idem PayPal.

**Test de aceptación**: pago Stripe sandbox → `payment.transaction` done → `account.payment` autogenerado.

### Etapa G — Admin tools (1 PR)

- `/api/admin/odoo/post-invoice/route.ts`
- `/api/admin/odoo/register-payment/route.ts`
- `/api/admin/odoo/preview-payment/route.ts`
- `/api/admin/odoo/preview-posting/route.ts`
- `/api/admin/odoo/invoice-info/route.ts`
- `/api/admin/odoo/journal-info/route.ts`
- `/api/admin/odoo/queue/*` → estos posiblemente desaparecen (la cola era para retries del cron viejo)

### Etapa H — Limpieza pre-cutover (1 PR)

Quita todo lo que ya no se va a usar de las branches anteriores. NO borra todavía cobranzas/segmentos/inbox — eso es Fase 5.

---

## 7. Datos Supabase: reset total en el día del switch

Se vacían estas tablas (no se borra el schema):

```
collection_items
collection_campaigns
collection_segments
collection_notifications
payment_gateway_logs
odoo_sync_queue
bequant_subscriber_snapshots
leads                        -- si tienen odoo_partner_id como FK lógica
conversations                -- idem
```

Script: `scripts/reset-supabase-tables.mjs` (a crear). Ejecuta `TRUNCATE` con confirmación interactiva.

**Tokens HMAC `/pagar/cliente/[token]`**: NO se guardan en DB. Se firman on-the-fly con `PAYMENT_TOKEN_SECRET`. Los links viejos en circulación (WhatsApp, email) van a fallar porque el partner_id firmado ya no existe en el nuevo Odoo. **Esto es esperado**.

---

## 8. Cutover (día D)

Ventana esperada: **15 minutos**. Pasos:

1. (–24 h) Aviso a equipo / clientes que hubiera operaciones críticas.
2. (T-0) Modo mantenimiento opcional: `/api/health` devuelve 503 hasta el final.
3. Cambiar env vars en Vercel:
   - `ODOO_URL` ← `https://erp.wuipi.net`
   - `ODOO_DB` ← `wuipi`
   - `ODOO_USER` ← `rmontilla@wuipi.net` (o un service account dedicado)
   - `ODOO_API_KEY` ← API key del nuevo
4. Redeploy a producción.
5. Ejecutar `scripts/reset-supabase-tables.mjs`.
6. Smoke checks (script `scripts/smoke-cutover.mjs`):
   - Handshake Odoo nuevo
   - Login portal con usuario test
   - `/pagar/cliente/[token]` para un partner real del nuevo
   - Webhook Mercantil dummy
7. Salir de modo mantenimiento.
8. Monitoreo 2 horas.

### Plan de rollback

Si algo va mal en pasos 4-7:
- Revertir env vars a los del Odoo viejo (Vercel rollback de env).
- Redeploy a deployment anterior (Vercel rollback).
- Restaurar tablas Supabase desde backup (a tomar antes del paso 5).
- Tiempo estimado de rollback: 5 min.

---

## 9. Fase 5 — Reestructuración (post-estabilización)

Después de 1-2 semanas estables, eliminar:

### Rutas a borrar
- `/api/cobranzas/segments/**`
- `/api/cobranzas/items/**` (lo que no use el flujo de pago)
- `/api/cron/odoo-sync/**`, `/api/cron/odoo-state-sync/**`, `/api/cron/drafts-alert/**`
- `/api/comando/**` (o reducir a 1 lectura simple)
- `/api/finanzas/**`
- `/api/inbox/**`, `/api/leads/**` (si existen)
- Bot ventas, briefings telegram, supervisor IA (decisión caso por caso)

### Tablas Supabase a dropear
- `collection_*` (todas)
- `odoo_sync_queue`
- `briefing_history`, `supervisor_*`
- `inbox_*` (si existen)

### Páginas dashboard a borrar
- `/cobranzas`, `/configuracion/telegram`, `/configuracion/permisos` (a revisar)
- `/erp`, `/comando`, `/finanzas`, `/facturacion` (a revisar)
- Sidebar: dejar solo Portal Admin + Configuración mínima + Auditoría

### Decisión pendiente Fase 5: Bequant
Si los datos QoE siguen siendo valor real para el portal cliente, se queda. Si se duplica con `wuipi.isp.service`, se va.

---

## 10. Riesgos identificados y mitigación

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Algún hardcode de ID que se nos escape | Alta | Test E2E manual de cada flujo en Etapa B-G antes del cutover |
| Mercantil no acepta sandbox del nuevo Odoo | Media | Mercantil no interactúa con Odoo directo, solo la app — bajo riesgo |
| IGTF se duplica (app + Odoo) | Alta | Confirmar en Etapa E que solo Odoo calcula IGTF cuando creamos `account.payment` |
| Token HMAC compatible | Baja | Confirmado: no depende del partner_id del Odoo viejo |
| Webhook Mercantil registrado a la app | Baja | URL es `api.wuipi.net/api/mercantil` — no cambia |
| Pérdida de tracking de campañas históricas | Asumida | Decisión D4 — reset total |
| Stripe webhook tiene endpoint custom configurado | Media | Revisar dashboard Stripe → puntar a `api.wuipi.net/api/cobranzas/webhook/stripe` (no cambia) |

---

## 11. Checklist de aceptación final

Antes de declarar la migración exitosa:

- [ ] Login portal cliente con cliente real del nuevo Odoo
- [ ] Cliente ve sus facturas pendientes
- [ ] Cliente ve su servicio ISP (`wuipi.isp.service`)
- [ ] Cliente paga con Mercantil Botón Web → invoice reconciliada
- [ ] Cliente paga con Mercantil C2P → invoice reconciliada
- [ ] Cliente paga con Stripe → invoice reconciliada
- [ ] Cliente paga con PayPal → invoice reconciliada
- [ ] Admin paga cash desde back office → invoice reconciliada
- [ ] Admin postea draft → reconciliación correcta con IGTF
- [ ] Webhook Mercantil idempotente (mismo evento 2 veces no duplica)
- [ ] Webhook Stripe idempotente
- [ ] Monitoreo 48h sin errores nuevos

---

## 12. Cronograma estimado (sin contar la migración de datos del usuario)

| Etapa | Duración estimada |
|---|---|
| A — Capa base | 0.5 día |
| B — Portal cliente lectura | 1 día |
| C — Portal de pago lectura | 0.5 día |
| D — `payment.transaction` helper | 0.5 día |
| E — Mercantil E2E | 1 día |
| F — Stripe + PayPal | 0.5 día |
| G — Admin tools | 0.5 día |
| H — Limpieza pre-cutover | 0.5 día |
| Cutover + smoke | 0.5 día |
| Buffer / fixes | 1 día |
| **Total** | **~6.5 días** |

Fase 5 (limpieza profunda): 2-3 días adicionales después de 1-2 semanas estables.

---

## 13. Próximo paso

Una vez aprobado este plan:

1. Crear branch `feat/odoo-new-migration`.
2. Empezar Etapa A (capa base).
3. Por cada etapa: PR + smoke local + merge a main (sin tocar producción hasta el día D).

**Pendientes a confirmar antes de arrancar Etapa A**:

- [ ] ¿Service account dedicado en Odoo nuevo (recomendado), o seguimos con `rmontilla@wuipi.net`?
- [ ] ¿Hay deadline objetivo de cutover (semana, mes)? Eso ajusta el ritmo de cada etapa.
- [ ] ¿Querés que cada PR tenga preview deploy en Vercel apuntando al nuevo Odoo para que pruebes vos antes de mergear?
