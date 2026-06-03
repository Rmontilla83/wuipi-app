/**
 * CSV de los items en "conciliating" para que el dpto de Cobranzas concilie
 * manualmente contra el extracto bancario.
 *
 * Por cada item: datos del cliente, monto, referencia declarada, banco origen
 * (del gateway log), estado de la factura en Odoo, y el pago en Odoo si ya
 * existe (con su journal — para detectar los que entraron por Banesco u otros
 * bancos que el transfer-search de Mercantil nunca ve).
 *
 * Output: exports/conciliating-cobranzas-{stamp}.csv (UTF-8 con BOM para Excel)
 * Uso: npx tsx scripts/export-conciliating-para-cobranzas.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envText = readFileSync(".env.local", "utf-8");
for (const line of envText.split("\n")) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  const k = line.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
}

async function rpc(s: string, m: string, a: unknown[]) {
  const r = await fetch(process.env.ODOO_BASE_URL + "/jsonrpc", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "call", params: { service: s, method: m, args: a } }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.data?.message || d.error.message);
  return d.result;
}

// Mapeo código banco → nombre (los más comunes en VE)
const BANCOS: Record<string, string> = {
  "0102": "Banco de Venezuela", "0104": "Venezolano de Crédito", "0105": "Mercantil",
  "0108": "Provincial", "0114": "Bancaribe", "0115": "Exterior", "0128": "Bancaribe",
  "0134": "Banesco", "0137": "Sofitasa", "0138": "Banco Plaza", "0151": "BFC",
  "0156": "100% Banco", "0163": "Banco del Tesoro", "0166": "Banco Agrícola",
  "0168": "Bancrecer", "0169": "Mi Banco", "0171": "Banco Activo", "0172": "Bancamiga",
  "0174": "Banplus", "0175": "Banco Bicentenario", "0177": "Banfanb", "0191": "BNC",
};

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const uid = await rpc("common", "authenticate", ["wuipi", process.env.ODOO_INT_LOGIN, process.env.ODOO_INT_API_KEY, {}]);

  const { data: items } = await sb
    .from("collection_items")
    .select("id, created_at, customer_name, customer_cedula_rif, customer_phone, amount_usd, amount_bss, payment_reference, metadata")
    .eq("status", "conciliating")
    .order("created_at", { ascending: true });

  console.log(`Items conciliating: ${items!.length}\n`);

  const rows: Record<string, string | number>[] = [];
  for (const it of items!) {
    const ids = (it.metadata as { odoo_invoice_ids?: number[] })?.odoo_invoice_ids || [];
    // Estado factura + pago en Odoo
    let estadoFactura = "(sin factura)";
    let journalPago = "";
    let montoPagoOdoo = "";
    if (ids.length) {
      const inv = await rpc("object", "execute_kw", ["wuipi", uid, process.env.ODOO_INT_API_KEY, "account.move", "read", [ids, ["name", "state", "payment_state", "amount_residual"]]]) as Record<string, unknown>[];
      estadoFactura = inv.map((m) => `${m.name}:${m.state}/${m.payment_state}`).join(" | ");
      const pays = await rpc("object", "execute_kw", ["wuipi", uid, process.env.ODOO_INT_API_KEY, "account.payment", "search_read", [[["reconciled_invoice_ids", "in", ids]]], { fields: ["amount", "journal_id", "date"], limit: 3 }]) as Record<string, unknown>[];
      if (pays.length) {
        journalPago = pays.map((p) => (p.journal_id as [number, string])?.[1]).join(" | ");
        montoPagoOdoo = pays.map((p) => p.amount).join(" | ");
      }
    }
    // Banco origen del gateway log
    const { data: logs } = await sb
      .from("payment_gateway_logs")
      .select("request_payload")
      .eq("collection_item_id", it.id)
      .eq("event_type", "request_sent")
      .eq("gateway_product", "transfer_search")
      .order("created_at", { ascending: false })
      .limit(1);
    const bankCode = (logs?.[0]?.request_payload as { bank_code?: string })?.bank_code || "";
    const bankName = BANCOS[bankCode] || bankCode || "(no reportado)";

    // Diagnóstico real: la señal confiable de "dónde entró el dinero" es el
    // journal del pago en Odoo (si ya está conciliado). Si entró por una cuenta
    // != Mercantil, el transfer-search de Mercantil nunca lo iba a ver.
    let diagnostico: string;
    if (!journalPago) {
      diagnostico = "SIN CONCILIAR — verificar en extracto";
    } else if (/mercantil/i.test(journalPago)) {
      diagnostico = "Ya conciliado en Mercantil";
    } else {
      diagnostico = `Ya conciliado en OTRO banco (${journalPago}) — transfer-search no lo ve`;
    }

    rows.push({
      fecha_reporte: new Date(it.created_at).toLocaleString("sv-SE", { timeZone: "America/Caracas" }).slice(0, 16),
      cliente: it.customer_name,
      cedula_rif: it.customer_cedula_rif,
      telefono: it.customer_phone || "",
      banco_origen_cliente: bankName,
      diagnostico,
      monto_usd: it.amount_usd,
      monto_bs_adeudado: it.amount_bss || "",
      ref_declarada: it.payment_reference || "",
      factura_odoo: estadoFactura,
      pago_ya_en_odoo: montoPagoOdoo,
      journal_pago: journalPago,
      collection_item_id: it.id,
    });
  }

  const headers = ["fecha_reporte", "cliente", "cedula_rif", "telefono", "banco_origen_cliente", "diagnostico", "monto_usd", "monto_bs_adeudado", "ref_declarada", "factura_odoo", "pago_ya_en_odoo", "journal_pago", "collection_item_id"];
  const LABELS: Record<string, string> = {
    fecha_reporte: "Fecha reporte (Caracas)", cliente: "Cliente", cedula_rif: "Cédula/RIF",
    telefono: "Teléfono", banco_origen_cliente: "Banco origen (cliente)", diagnostico: "Diagnóstico",
    monto_usd: "Monto USD", monto_bs_adeudado: "Monto Bs adeudado", ref_declarada: "Ref. declarada",
    factura_odoo: "Estado factura Odoo", pago_ya_en_odoo: "Monto pago ya en Odoo", journal_pago: "Banco registrado en Odoo",
    collection_item_id: "ID interno",
  };
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = "﻿" + [
    headers.map((h) => esc(LABELS[h])).join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ].join("\r\n");

  try { mkdirSync("exports", { recursive: true }); } catch {}
  const stamp = new Date().toISOString().slice(0, 10);
  const file = `exports/conciliating-cobranzas-${stamp}.csv`;
  writeFileSync(file, csv, "utf-8");

  const yaMercantil = rows.filter((r) => String(r.diagnostico).startsWith("Ya conciliado en Mercantil")).length;
  const yaOtro = rows.filter((r) => String(r.diagnostico).includes("OTRO banco")).length;
  const sinConciliar = rows.filter((r) => String(r.diagnostico).startsWith("SIN")).length;
  console.log(`\n=== EXPORT LISTO ===`);
  console.log(`Archivo: ${file}`);
  console.log(`Total: ${rows.length} items conciliando`);
  console.log(`  Ya conciliado en Mercantil (limpiar estado app):   ${yaMercantil}`);
  console.log(`  Ya conciliado en OTRO banco (limpiar + nota):       ${yaOtro}`);
  console.log(`  SIN conciliar (verificar en extracto):              ${sinConciliar}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
