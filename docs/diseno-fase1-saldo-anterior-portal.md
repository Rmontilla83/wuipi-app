# Diseño — Fase 1: Cobrar el saldo anterior (residual) en el portal de pago

**Autor:** Claude Code · **Fecha:** 2026-07-09 · **Estado:** propuesta (sin código todavía)
**Contexto:** casos Gabriel Maza / Alejandro Tepedino → saldos `posted` con residual invisibles al portal.

---

## 1. Problema

El portal de pago (`/pagar/cliente/[token]` y shortlinks) arma la deuda del cliente
listando **solo facturas en `draft`** (`listInvoices({ states: ["draft"] })`).

Cuando un cliente paga **incompleto en caja**, la factura se postea igual y queda
`posted` con `payment_state = "partial"` y un `amount_residual > 0`. Como Odoo **no
suspende** si el residual es menor a ~$3, ese saldo:

1. **No aparece** en el portal (no es `draft`).
2. **No se cobra** cuando el cliente vuelve a pagar (solo ve/paga la factura nueva).
3. Queda como **deuda fantasma** que se acumula.

**Caso testigo — Gabriel Maza (partner 2776):** factura `00057688` (58150) total
20.413,88 Bs, pagada 20.413,77 Bs en caja → `posted/partial`, residual **0,11 Bs**.
`partner.credit = 0,11`. El cliente pagó su factura de julio por débito y la 0,11 quedó colgada.

**Magnitud sistémica:** 690 facturas `posted` con residual > 0,01 Bs; 415 con residual
> 10 Bs (~901k Bs). Mezcla empresas (pagan por transferencia, no usan el portal) con
residenciales self-service — estos últimos son el universo a resolver.

---

## 2. Objetivo y alcance

**Objetivo:** que el portal muestre y cobre el **saldo total real** del cliente =
facturas nuevas (`draft`) **+ saldos anteriores** (`posted` con residual), en un solo pago.
Al cerrar el residual al 100%, Odoo reactiva por sus reglas normales.

**Dentro de alcance (Fase 1):**
- Portal incluye las `posted`-con-residual del partner en el link de pago.
- El pago liquida drafts **y** residuales, reconciliando cada factura.
- Auto-sanador: cualquier residual nuevo se barre en el próximo pago por la app.

**Fuera de alcance (documentado en §10):**
- Fase 2 (tolerancia de reactivación) — **no necesaria**: Odoo ya no suspende con residual < $3.
- Fase 3 (prevención en origen) — el residual nace en **caja**, no en el redondeo de la app.

---

## 3. Diagnóstico técnico

### 3.1 Modelo contable (verificado en vivo)
- **Deuda** = cuenta por cobrar. Las `draft` **no** están posteadas → **no** entran en
  `partner.credit`. Las `posted` con residual **sí** están en `partner.credit`.
- **Saldo a favor (anticipo)** = cuenta **2105007** (pasivo), se lee con el helper
  `wuipi_get_partner_anticipo(pid)`. Es el **otro lado** de la balanza.
- `partner.credit` **netea** favor contra deuda posteada y **mezcla monedas** → sirve
  como **chequeo de sanidad en pantalla**, NO como cifra de cobro.
  - Ej. Jose Guirola (1219): `credit = −5.913 Bs` (negativo) pero debe 14.511 Bs de
    residual + 61,71 USD de drafts. Si cobrara por el neto, no le cobraría nada. Por eso
    **se cobra factura por factura**, no por el neto.

### 3.2 El sync YA soporta posted (hallazgo clave)
`syncOdooForCollectionItem` (odoo.ts:1606) tiene un pre-check (líneas 1639-1654):
- Si la factura está `posted` y **totalmente pagada** → no hace nada (`already_synced`).
- Si está `posted` pero **NO pagada** → **salta el posteo** (`post_invoice_done = true`)
  y permite `registerPaymentForInvoice`.

O sea: si le pasamos el ID de una `posted`-con-residual, el sync **ya** intenta registrar
el pago. El único bug: registraría por `amount_total`, no por el residual (§5.4).

---

## 4. Diseño de la solución

### 4.1 Concepto
`Deuda a cobrar = Σ drafts (USD, se convierte a tasa del día) + Σ posted-residuales (Bs, FIJO)`

El favor se sigue manejando aparte (helper 2105007), sin cambios.

### 4.2 Flujo end-to-end
1. **iniciar** trae drafts **y** posted-con-residual del partner.
2. Construye el total: parte USD (drafts) + parte Bs fija (residuales).
3. El portal muestra: *"Mes actual: Bs X · Saldo anterior: Bs Z · **Total: Bs (X+Z)**"*.
4. El cliente paga el total por la pasarela (débito/transferencia/c2p → mismo journal VED).
5. El sync itera cada factura:
   - **draft** → `postInvoiceInVes` (postea en Bs) → paga su residual (= total) → reconcilia.
   - **posted-residual** → salta posteo → paga su residual (Bs) → reconcilia → cierra al 100%.
6. Todas en 0 → Odoo reactiva por sus reglas.

---

## 5. Cambios por archivo (wuipi-app)

> **Feature flag:** `PORTAL_SALDO_ANTERIOR_ENABLED` (off por defecto, idiom
> `=== "true"` como `ODOO_SYNC_ENABLED`). Toda la lógica nueva es **aditiva y gateada**:
> flag off → comportamiento **byte-idéntico** al actual. No hay helper central de flags
> (patrón inline). El browser NO lee env vars sin `NEXT_PUBLIC_`, así que el valor que
> necesite el render se expone por la respuesta de `/api/cobranzas/[token]`.
>
> **Los dos `iniciar` son copy-paste (sin helper compartido).** Todo edit de metadata/monto
> se duplica en `cliente/iniciar` y `shortlink/iniciar`. Ojo: `shortlink` es **siempre
> pago-todo** (no tiene ruta `invoice_ids` parcial ni guarda `isPayAll`) y aplica el anticipo
> incondicionalmente; en `cliente` el anticipo/reuse van dentro de `if (isPayAll)`.

### 5.1 `src/lib/integrations/odoo-new/invoices.ts` — SIN CAMBIOS
`listInvoices` ya acepta `states` + `unpaidOnly`. Basta llamarlo distinto desde iniciar.
Para traer drafts + posteadas-pendientes:
```ts
listInvoices({ partnerId, states: ["draft", "posted"], unpaidOnly: true, limit: 50 })
// unpaidOnly = payment_state in [not_paid, partial, in_payment]
```
⚠️ Excluir `in_payment` de las posted (pago registrado no reconciliado → riesgo de doble
cobro). Filtrar en el caller: posted que se incluyen = `payment_state === "partial"` (o
`not_paid`, según decisión §8.1) **y** `amountResidual > DUST` (ej. 0,01 Bs).

### 5.2 `src/app/api/pagar/cliente/iniciar/route.ts` + `shortlink/iniciar/route.ts`
- Separar el resultado en **`drafts`** (USD) y **`postedResiduals`** (Bs, con `amountResidual`).
- `selectedTotalUsd` = Σ drafts (como hoy).
- **Nuevo:** `postedResidualBs` = Σ `amountResidual` de las posted incluidas.
- `netDueUsd` = `max(selectedTotalUsd − creditFavorUsd, 0)` (favor solo a la parte USD; el
  residual Bs ya es neto de lo pagado en caja, no se le resta favor).
- `odoo_invoice_ids` = ids de drafts **+** ids de posted-residuales.
- **Nuevo metadata** `odoo_posted_residuals_bs = { [invoiceId]: residualBs }` para que el
  sync y el display sepan cuáles son residuales fijos en Bs.
- ⚠️ El residual **NO** entra en el array `odoo_invoices` (esa tabla se suma en el `<tfoot>`
  del portal y está en USD → mezclaría monedas). Va en un campo aparte `odoo_posted_residuals`
  (para render de línea separada), no en la tabla sumada.
- La lógica de **reuse** (idsChanged) ya refresca `odoo_invoice_ids`/`odoo_invoices` →
  incluir los residuales en ese set y en el refresco.

### 5.4-bis Monto Bs cobrado — se suma en 4 PUNTOS (MONEY-PATH) ⚠️
**Hallazgo clave de la implementación:** el `amount_bss` congelado **NO es fuente de verdad**
— cada método recalcula `amount_usd × tasa` por su cuenta (el débito hasta sobrescribe el
congelado). Así que sumar el residual solo en el congelado **no propaga**. Se suma en 4 puntos,
todos vía el helper `postedResidualBs(metadata)` (`src/lib/cobranzas/saldo-anterior.ts`, gateado,
0 con flag off):
1. **Congelado** `api/cobranzas/[token]/route.ts` — `amount_bss = convertUsdToBs(...) + residual`
   (monto esperado total) + expone `posted_residual_total_bs` + `odoo_posted_residuals`.
2. **Débito** `api/cobranzas/pay/route.ts:72` — `amountBss + residual` (va a Mercantil Botón Web).
3. **Transferencia** `api/cobranzas/pay/confirm/route.ts` — el fallback recompute suma el residual
   para que la baseline del mismatch iguale al `declaredAmountBss` (display, que ya lo incluye).
   ✅ El chequeo `isDifferentAmount` NO se altera: el residual se suma en ambos lados → la resta
   lo cancela; la diferencia sigue siendo solo la de tasa (idéntica a hoy).
4. **C2P** `api/cobranzas/pay/c2p-confirm/route.ts:36` — `amountBss + residual`.
⚠️ El `amount_bss` es el monto que **Mercantil transfer-search** casa. Como el residual se suma
consistentemente en display + declared + baseline, el auto-match no cambia — validar en E2E igual.

### 5.3 `collection_items` — nuevo dato en `metadata` (no migración de esquema)
```jsonc
metadata: {
  odoo_invoice_ids: [67213, 58150],            // drafts + posted-residuales
  odoo_invoice_amounts_usd: { "67213": 35.96 },// SOLO drafts (USD)
  odoo_posted_residuals_bs: { "58150": 0.11 }, // SOLO posted (Bs fijo)  ← NUEVO
  posted_residual_total_bs: 0.11,              // suma, para display     ← NUEVO
  is_pay_all: true,
}
```
`amount_usd` sigue siendo la parte USD. El **total en Bs a cobrar** = `round(amount_usd *
rate) + posted_residual_total_bs`.

### 5.4 `src/lib/integrations/odoo.ts` — `previewRegisterPayment` / `registerPaymentForInvoice`
**Cambio central (y universalmente más correcto):** registrar el pago por el
**`amount_residual`** de la factura, no por `amount_total`.
- `previewRegisterPayment` ya lee `fullInv.amount_residual` (línea 1159). Cambiar
  `amount: invoice.amount_total` → `amount: (posted && residual>0 ? residual : amount_total)`.
- Para el flujo draft normal: tras `postInvoiceInVes`, la factura recién posteada tiene
  `residual == total` → **idéntico** al comportamiento actual. Cero riesgo en el camino feliz.
- Para posted-partial: paga exactamente lo que falta (el residual Bs) → cierra a 0.
- El comparador de anticipo (`amountVesPaid < preview.amount`) sigue coherente con residual.
- **Beneficio:** para misma moneda, el sync **no necesita pasar montos** por factura — el
  residual se lee de Odoo al momento. Simplifica el multi-factura mixto (draft + residual).

### 5.5 `src/lib/integrations/odoo-sync-trigger.ts`
- `invoiceIds` ya viene de `metadata.odoo_invoice_ids` (ahora incluye residuales). El loop
  (línea 207) procesa cada uno; el pre-check del sync distingue draft vs posted solo.
- **Interacción con M2** (líneas 149-164): incluir residuales aumenta los casos
  multi-factura. Si el partner tiene anticipo y ahora hay ≥2 facturas (draft + residual),
  M2 desvía a revisión manual. Es el default seguro (no inflar), pero puede sobre-desviar.
  **Decisión §8.3:** el residual `posted` NO es candidato a inflado (se paga por su residual
  exacto, no por total) → se puede afinar M2 para contar solo **drafts** al evaluar el anticipo.

### 5.6 Portal UI — `src/app/pagar/[token]/page.tsx`
- La tabla de facturas (líneas 786-826) se deja **igual** (drafts, USD, `<tfoot>` suma USD).
- **Nuevo:** entre el `</tfoot>` (823) y el bloque "MONTO A PAGAR" (844), una línea separada
  **"Saldo anterior: Bs Z"** (precedente: la línea "Saldo a favor" en
  `src/app/pagar/cliente/[token]/page.tsx:136-141`). No se mezcla con la suma USD.
- El "MONTO A PAGAR" en Bs = parte USD convertida (live, tasa Odoo) **+** `posted_residual_total_bs`
  (fijo). El valor llega por la respuesta de `/api/cobranzas/[token]` (el cliente no lee env vars).
- Copy: aclarar que el saldo anterior es un monto fijo en Bs (no fluctúa con la tasa).

---

## 6. Manejo de moneda (el punto delicado)

| Componente | Moneda | Se convierte a tasa del día | Nota |
|---|---|---|---|
| Facturas `draft` | USD | **Sí** (al cobrar) | como hoy |
| Residuales `posted` | Bs | **No** — monto fijo | la factura ya está posteada en VES |

- El residual **nunca** se convierte USD↔Bs (evita reintroducir el céntimo de redondeo).
- Se cobra el residual **exacto** en Bs → reconcilia sin dejar nuevo residuo (a diferencia
  del caso draft-USD, donde el redondeo BCV sí puede dejar céntimos).
- **Decisión abierta §8.2:** cómo interactúa el residual fijo con el re-quote de la parte
  USD si la tasa se mueve entre crear el item y pagar. Propuesta: la parte USD se re-cotiza
  como hoy; el residual se suma tal cual (fijo).

---

## 7. Casos de prueba

| # | Cliente | Situación | Resultado esperado |
|---|---|---|---|
| 1 | Gabriel (2776) | 0 drafts + 1 residual 0,11 Bs | portal muestra "Saldo anterior 0,11 Bs"; al pagar cierra 58150 → residual 0 (⚠ ver §8.4: micro-standalone) |
| 2 | Guirola (1219) | 2 drafts (61,71 USD) + 1 residual 14.511 Bs + favor | cobra drafts (USD→Bs) + residual (Bs fijo); favor a la parte USD; NO se guía por `credit` negativo |
| 3 | Cliente normal | N drafts, 0 residuales | **idéntico** a hoy (sin regresión) |
| 4 | Post-pago | tras pagar, todas en residual 0 | `partner.credit` baja; si estaba suspendido, Odoo reactiva |
| 5 | Reuse | item abierto + aparece un residual nuevo | el refresco de `idsChanged` incorpora el residual |

**Verificación read-only previa** (Odoo): `partner.credit ≈ Σ posted-residuales` cuando no
hay favor (Gabriel ✓, Daniel Alezones ✓); difiere cuando hay favor (Guirola) → confirma que
NO se cobra por `credit`.

---

## 8. Decisiones (RESUELTAS 2026-07-09)

1. **§8.1 — ¿incluir `posted/not_paid` o solo `partial`?** ✅ **RESUELTO: incluir ambos**
   (cualquier residual > 0). Las corporativas no usan el portal → sin daño.
2. **§8.2 — re-quote:** ✅ parte USD live + residual Bs fijo (recomendación adoptada).
3. **§8.3 — afinar M2:** ✅ **RESUELTO: contar solo drafts** al evaluar el anticipo (el
   residual `posted` no es candidato a inflado → no debe desviar el pago a revisión manual).
4. **§8.4 — micro-residual standalone:** ✅ **RESUELTO: NINGUNA acción especial.** El cliente
   no necesita pagar los 0,11 solos; entrará a pagar cuando una factura nueva acompañe ese
   residual y se cobra todo junto. No está suspendido, no bloquea nada → no se maneja como caso.
5. **§8.5 — DUST floor:** ✅ incluir cualquier residual > 0,01 Bs (empaquetado con drafts se
   cobra igual; el piso 0,01 solo evita mostrar líneas de valor cero absoluto).

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Romper el camino feliz (>99% solo drafts) | El cambio de `amount_total`→`amount_residual` es idéntico para drafts recién posteadas (residual==total). Caso 3 lo verifica. |
| Doble cobro en `in_payment` | Excluir `in_payment` de las posted incluidas (§5.1). |
| Inflar banco vía residual + anticipo | El residual se paga por su monto exacto; la invariante "nunca registrar más que el residual" se mantiene. |
| Sobre-desvío a revisión manual (M2) | Afinar M2 para contar solo drafts (§8.3). |
| Corporativas apareciendo en cobro | No usan el portal (pagan por transferencia) → sin efecto práctico. |

**Regla de oro:** el camino de solo-drafts debe quedar **byte-idéntico**. Toda la lógica
nueva se activa únicamente cuando hay ≥1 residual en el set.

---

## 10. Qué queda fuera (confirmado con el usuario)

- **Fase 2 (reactivación con tolerancia):** innecesaria — Odoo ya no suspende con residual < $3.
- **Fase 3 (prevención en origen):** el residual nace en caja, no en la app. La Fase 1 los
  barre a medida que aparecen (auto-sanador).

---

## 11. Plan de implementación por pasos

1. **iniciar** (cliente + shortlink): traer drafts + posted-residuales, separar monedas,
   poblar `odoo_posted_residuals_bs` + display. *(sin tocar el sync todavía; feature-flag)*
2. **odoo.ts**: `previewRegisterPayment`/`registerPaymentForInvoice` → pagar por
   `amount_residual`. Validar con Caso 3 (regresión) en dev.
3. **sync-trigger**: afinar M2 (§8.3). Validar Caso 2 (mixto + favor) read-only primero.
4. **Portal UI**: línea "Saldo anterior".
5. **Prueba E2E controlada** con 1 cliente real de residual pequeño (tipo Gabriel) antes de
   soltar a todos.
6. Monitoreo: items que cierren residual; que `partner.credit` baje; 0 doble cobros.

**Coordinación con equipo Odoo (Ana):** revisar §3.2 y §5.4 (que el pago por residual
reconcilia y dispara reactivación como esperan del lado Odoo).
</content>
</invoke>
