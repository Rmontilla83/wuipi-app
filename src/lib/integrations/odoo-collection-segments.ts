// ============================================================
// Odoo — Filtros exhaustivos para segmentos de cobranza
// ============================================================
//
// Universo: facturas account.move state=draft (cuentas por cobrar) agrupadas
// por partner. A diferencia de getPendingByCustomer (filtros básicos:
// nombre + monto mínimo), acá se permite combinatoria libre de criterios para
// armar segmentos dirigidos.
//
// Estrategia:
//  1. Filtros nativos de Odoo (state, fechas, partner_ids) → al `domain`.
//  2. Filtros que requieren joins (subscription_state, billed_month, etc) →
//     post-fetch en JS. Aceptable porque el universo está acotado a drafts
//     pendientes (~640 hoy en producción).
//  3. Anti-spam (`exclude_recent_days`) → consulta Supabase para descartar
//     partners contactados recientemente vía collection_items.
//
// La función NO consulta Supabase directamente — recibe `excludePartnerIds`
// ya calculados desde el caller. Eso mantiene esta función pura sobre Odoo
// y testeable sin Supabase.

import {
  searchRead,
  read,
  isOdooConfigured,
  computeMonthBilled,
} from "@/lib/integrations/odoo";

const PARTNER_FIELDS_FULL = [
  "name", "email", "mobile", "phone", "vat", "credit",
  "is_company", "city",
] as const;

const INVOICE_FIELDS_FULL = [
  "name", "partner_id", "invoice_date", "invoice_date_due",
  "amount_total", "amount_residual", "currency_id",
  "subscription_id",  // many2one a sale.order — para filtros de plan/estado
] as const;

// ── Tipos ────────────────────────────────────────────────────────────────

/**
 * Combinatoria de filtros aceptados por un segmento. Todos opcionales.
 * Semántica: filtros con array de valores son OR dentro del filtro
 * (ej. doc_type:["V","J"] = V o J). Filtros distintos son AND
 * entre sí (ej. doc_type+amount_total = V/J Y monto entre rango).
 *
 * Para filtros por factura individual (overdue_days, due_date,
 * amount_per_invoice, billed_month): un cliente "cumple" si AL MENOS UNA
 * de sus facturas cumple el filtro (OR semántico). Útil para "cualquier
 * cliente con al menos 1 factura morosa".
 */
export interface SegmentFilters {
  /** Total adeudado por cliente, en USD (después de descontar credit). */
  amount_total?: { min?: number; max?: number };
  /** Monto USD de cada factura individual. Cliente cumple si tiene ≥1 factura en rango. */
  amount_per_invoice?: { min?: number; max?: number };
  /** Días de mora calculados desde la factura MÁS ANTIGUA del cliente vs hoy. */
  overdue_days?: { min?: number; max?: number };
  /** Rango de invoice_date_due. Cliente cumple si tiene ≥1 factura con due en rango. */
  due_date?: { from?: string; to?: string };
  /** Cantidad de drafts del cliente. */
  draft_count?: { min?: number; max?: number };
  /** Tipo de documento (prefijo del vat). */
  doc_type?: Array<"V" | "J" | "G" | "E" | "P">;
  /** True = solo personas jurídicas (is_company=true en Odoo). False = solo naturales. */
  is_company?: boolean;
  /** Cliente debe tener email no vacío. */
  has_email?: boolean;
  /** Cliente debe tener teléfono no vacío. */
  has_phone?: boolean;
  /** Filtro por ciudad del partner (ilike). */
  city?: string;
  /** Excluir clientes con saldo a favor (credit < 0 en Odoo). */
  exclude_credit?: boolean;
  /** Estados de suscripción aceptados (3_progress, 6_churn, etc). */
  subscription_state?: string[];
  /** Mes facturado (calculado vía computeMonthBilled). Cliente cumple si ≥1 factura coincide. */
  billed_month?: string[];
  /** Whitelist explícita: SOLO incluir estos partners. */
  include_partner_ids?: number[];
  /** Blacklist: NUNCA incluir estos partners. */
  exclude_partner_ids?: number[];
  /** Filtro libre por nombre/cédula del partner (ilike). */
  search?: string;
}

export interface SegmentPreviewResult {
  /** Cantidad de clientes que cumplen los filtros. */
  count: number;
  /** Suma USD del total_due de todos los clientes que cumplen. */
  total_usd: number;
  /** Sample de hasta `sampleSize` clientes (default 20) para mostrar al admin. */
  sample: SegmentCustomer[];
  /** Lista completa de partner_ids que cumplen — útil para snapshot al ejecutar. */
  partner_ids: number[];
  /** Aplicado por el caller, para audit. */
  excluded_recent_count: number;
}

export interface SegmentCustomer {
  odoo_partner_id: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_cedula_rif: string;
  is_company: boolean;
  city: string;
  invoice_count: number;
  total_due_usd: number;
  oldest_due_date: string;
  overdue_days: number;
  invoices: Array<{
    id: number;
    invoice_number: string;
    due_date: string;
    amount_total_usd: number;
    billed_month: string;
    subscription_id: number | null;
    subscription_name: string;
  }>;
}

// ── Helpers de filtrado ──────────────────────────────────────────────────

function matchAmountRange(value: number, range?: { min?: number; max?: number }): boolean {
  if (!range) return true;
  if (typeof range.min === "number" && value < range.min) return false;
  if (typeof range.max === "number" && value > range.max) return false;
  return true;
}

function matchDocType(vat: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  const letter = vat.trim().match(/^[VEJGPvejgp]/)?.[0]?.toUpperCase();
  if (!letter) return false;
  return allowed.includes(letter);
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return 0;
  const diffMs = Date.now() - d.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ── Función principal ───────────────────────────────────────────────────

export interface SegmentPreviewInput {
  filters: SegmentFilters;
  /** Partners ya contactados recientemente — vienen de Supabase (collection_items). */
  excludePartnerIdsFromRecent?: number[];
  /** Tasa BCV para conversión credit VED → USD. Default 474. */
  bcvRate?: number;
  /** Cuántos clientes devolver en `sample`. Default 20. */
  sampleSize?: number;
}

export async function previewSegment(input: SegmentPreviewInput): Promise<SegmentPreviewResult> {
  if (!isOdooConfigured()) {
    return { count: 0, total_usd: 0, sample: [], partner_ids: [], excluded_recent_count: 0 };
  }

  const filters = input.filters || {};
  const rate = input.bcvRate || 474;
  const sampleSize = input.sampleSize ?? 20;
  const excludeRecent = new Set(input.excludePartnerIdsFromRecent || []);

  // ── Construir domain Odoo ──────────────────────────────────────────────
  // Tipo de Odoo domain es Array<string | number | boolean | string[] | number[]>;
  // cada entry es una tupla [field, op, value] que el cliente JSON-RPC arma.
  type DomainEntry = (string | number | boolean | string[] | number[])[];
  const domain: DomainEntry[] = [
    ["move_type", "=", "out_invoice"],
    ["state", "=", "draft"],
  ];

  // include_partner_ids — whitelist directa (skip search por nombre)
  if (Array.isArray(filters.include_partner_ids) && filters.include_partner_ids.length > 0) {
    domain.push(["partner_id", "in", filters.include_partner_ids]);
  } else if (filters.search) {
    // search por nombre del partner — convertimos a partner_ids
    const safeSearch = filters.search.replace(/[%_]/g, "");
    if (safeSearch) {
      const partners = await searchRead("res.partner", [
        ["name", "ilike", safeSearch],
      ], { fields: ["id"], limit: 500 });
      const pids = partners.map((p: { id: number }) => p.id);
      if (pids.length === 0) {
        return { count: 0, total_usd: 0, sample: [], partner_ids: [], excluded_recent_count: 0 };
      }
      domain.push(["partner_id", "in", pids]);
    }
  }

  // due_date.from/to — Odoo nativo
  if (filters.due_date?.from) {
    domain.push(["invoice_date_due", ">=", filters.due_date.from]);
  }
  if (filters.due_date?.to) {
    domain.push(["invoice_date_due", "<=", filters.due_date.to]);
  }

  // amount_per_invoice — Odoo nativo (filtra A NIVEL DE FACTURA)
  if (typeof filters.amount_per_invoice?.min === "number") {
    domain.push(["amount_total", ">=", filters.amount_per_invoice.min]);
  }
  if (typeof filters.amount_per_invoice?.max === "number") {
    domain.push(["amount_total", "<=", filters.amount_per_invoice.max]);
  }

  // ── Fetch invoices ─────────────────────────────────────────────────────
  const rawInvoices = await searchRead("account.move", domain, {
    fields: [...INVOICE_FIELDS_FULL],
    limit: 5000,
    order: "partner_id asc, invoice_date_due asc",
  });

  if (rawInvoices.length === 0) {
    return { count: 0, total_usd: 0, sample: [], partner_ids: [], excluded_recent_count: 0 };
  }

  // ── Fetch partners ─────────────────────────────────────────────────────
  const allPartnerIds = Array.from(
    new Set(rawInvoices.map((inv: { partner_id: [number, string] }) => inv.partner_id[0]))
  ) as number[];

  // Aplicar exclude_partner_ids ANTES del fetch para ahorrar
  const partnerIdsToFetch = filters.exclude_partner_ids
    ? allPartnerIds.filter((pid) => !filters.exclude_partner_ids!.includes(pid))
    : allPartnerIds;

  const partners = await read("res.partner", partnerIdsToFetch, [...PARTNER_FIELDS_FULL]);
  const partnerMap = new Map<number, Record<string, unknown>>(
    partners.map((p: { id: number } & Record<string, unknown>) => [p.id, p])
  );

  // ── Fetch suscripciones (solo si el filtro las requiere) ───────────────
  let subscriptionMap = new Map<number, { id: number; name: string; state: string; subscription_state: string }>();
  if (filters.subscription_state && filters.subscription_state.length > 0) {
    const subIds = Array.from(
      new Set(
        rawInvoices
          .map((inv: { subscription_id: false | [number, string] }) =>
            inv.subscription_id ? inv.subscription_id[0] : null
          )
          .filter((id): id is number => typeof id === "number")
      )
    );
    if (subIds.length > 0) {
      const subs = await searchRead("sale.order",
        [["id", "in", subIds]],
        { fields: ["id", "name", "state", "subscription_state"], limit: subIds.length }
      );
      subscriptionMap = new Map(subs.map((s: { id: number; name: string; state: string; subscription_state: string }) => [s.id, s]));
    }
  }

  // ── Agrupar por partner ────────────────────────────────────────────────
  type RawInvoice = {
    id: number;
    name: string;
    partner_id: [number, string];
    invoice_date_due: string | false;
    amount_total: number;
    amount_residual: number;
    currency_id: [number, string];
    subscription_id: false | [number, string];
  };
  const grouped = new Map<number, { partner: Record<string, unknown>; invoices: RawInvoice[] }>();
  for (const inv of rawInvoices as RawInvoice[]) {
    const pid = inv.partner_id[0];
    const partner = partnerMap.get(pid);
    if (!partner) continue;  // excluido por exclude_partner_ids
    if (!grouped.has(pid)) {
      grouped.set(pid, { partner, invoices: [] });
    }
    grouped.get(pid)!.invoices.push(inv);
  }

  // ── Aplicar filtros de cliente y construir resultado ───────────────────
  let excludedRecent = 0;
  const customers: SegmentCustomer[] = [];
  let grandTotalUsd = 0;

  for (const [pid, data] of grouped) {
    const p = data.partner;
    const vat = String(p.vat || "");
    const isCompany = !!p.is_company;
    const email = String(p.email || "");
    const phone = String(p.mobile || p.phone || "");
    const city = String(p.city || "");
    const credit = Number(p.credit || 0);  // VED (positivo = debe, negativo = saldo a favor)

    // Anti-spam: excluir partners contactados recientemente
    if (excludeRecent.has(pid)) {
      excludedRecent++;
      continue;
    }

    // Filtros de cliente (rápidos, fail-fast)
    if (filters.doc_type && filters.doc_type.length > 0 && !matchDocType(vat, filters.doc_type)) continue;
    if (typeof filters.is_company === "boolean" && isCompany !== filters.is_company) continue;
    if (filters.has_email === true && !email) continue;
    if (filters.has_email === false && email) continue;
    if (filters.has_phone === true && !phone) continue;
    if (filters.has_phone === false && phone) continue;
    if (filters.city && !city.toLowerCase().includes(filters.city.toLowerCase())) continue;
    if (filters.exclude_credit && credit < 0) continue;

    // Filtros sobre las facturas (OR: cliente cumple si AL MENOS UNA cumple)
    let billedMonthMatch = !filters.billed_month || filters.billed_month.length === 0;
    let dueDateMatch = !filters.due_date?.from && !filters.due_date?.to;
    let amountPerInvoiceMatch = !filters.amount_per_invoice;
    // Estos ya fueron filtrados a nivel de domain, pero algunos clientes
    // pueden tener facturas que ya pasaron el filtro al estar en el rango
    // y otras que no. Revalidamos para flag de "al menos una".

    let oldestDue = "9999-12-31";
    let draftTotalUsd = 0;
    const invoiceList: SegmentCustomer["invoices"] = [];

    for (const inv of data.invoices) {
      const due = typeof inv.invoice_date_due === "string" ? inv.invoice_date_due : "";
      const amount = inv.amount_total || 0;
      const subId = inv.subscription_id ? inv.subscription_id[0] : null;
      const subName = inv.subscription_id ? inv.subscription_id[1] : "";

      // Filtro suscripción (ya filtrado por estado si aplica)
      if (filters.subscription_state && filters.subscription_state.length > 0) {
        if (!subId) continue;
        const sub = subscriptionMap.get(subId);
        if (!sub || !filters.subscription_state.includes(sub.subscription_state)) continue;
      }

      const billedMonth = due ? computeMonthBilled(due) : "";

      if (filters.billed_month && filters.billed_month.length > 0) {
        if (filters.billed_month.includes(billedMonth)) billedMonthMatch = true;
      }
      if (filters.due_date?.from || filters.due_date?.to) {
        const okFrom = !filters.due_date.from || (due && due >= filters.due_date.from);
        const okTo = !filters.due_date.to || (due && due <= filters.due_date.to);
        if (okFrom && okTo) dueDateMatch = true;
      }
      if (filters.amount_per_invoice) {
        if (matchAmountRange(amount, filters.amount_per_invoice)) amountPerInvoiceMatch = true;
      }

      if (due && due < oldestDue) oldestDue = due;
      draftTotalUsd += amount;
      invoiceList.push({
        id: inv.id,
        invoice_number: inv.name || "",
        due_date: due,
        amount_total_usd: Math.round(amount * 100) / 100,
        billed_month: billedMonth,
        subscription_id: subId,
        subscription_name: subName,
      });
    }

    // Si filtros de factura no encontraron al menos 1 match → excluir cliente
    if (!billedMonthMatch || !dueDateMatch || !amountPerInvoiceMatch) continue;
    if (invoiceList.length === 0) continue;

    // Filtro draft_count
    if (!matchAmountRange(invoiceList.length, filters.draft_count)) continue;

    // total_due después de credit
    const creditUsd = credit / rate;  // negativo = saldo a favor
    const totalDueUsd = Math.max(draftTotalUsd + creditUsd, 0);
    if (!matchAmountRange(totalDueUsd, filters.amount_total)) continue;

    // overdue_days desde oldest_due
    const overdue = oldestDue !== "9999-12-31" ? daysSince(oldestDue) : 0;
    if (!matchAmountRange(overdue, filters.overdue_days)) continue;

    grandTotalUsd += totalDueUsd;
    customers.push({
      odoo_partner_id: pid,
      customer_name: String(p.name || ""),
      customer_email: email,
      customer_phone: phone,
      customer_cedula_rif: vat,
      is_company: isCompany,
      city,
      invoice_count: invoiceList.length,
      total_due_usd: Math.round(totalDueUsd * 100) / 100,
      oldest_due_date: oldestDue === "9999-12-31" ? "" : oldestDue,
      overdue_days: overdue,
      invoices: invoiceList,
    });
  }

  // Ordenar por total_due_usd descendente
  customers.sort((a, b) => b.total_due_usd - a.total_due_usd);

  return {
    count: customers.length,
    total_usd: Math.round(grandTotalUsd * 100) / 100,
    sample: customers.slice(0, sampleSize),
    partner_ids: customers.map((c) => c.odoo_partner_id),
    excluded_recent_count: excludedRecent,
  };
}
