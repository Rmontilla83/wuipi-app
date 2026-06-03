/**
 * Re-verifica contra Mercantil las transferencias colgadas en "conciliating".
 *
 * Para cada item:
 *   - Saca bank_code + amount del gateway log (request_sent)
 *   - Usa el SDK REAL (MercantilSDK.searchTransfers) — mismo cifrado AES,
 *     credenciales y formato que el endpoint de producción.
 *   - Busca en un rango AMPLIO de fechas (el endpoint solo probaba 3 días;
 *     acá probamos desde la fecha del reporte hacia atrás N días).
 *
 * NO escribe nada — solo reporta cuáles matchean.
 *
 * Uso: npx tsx scripts/verify-conciliating-transfers.ts [limite]
 *   limite: cuántos items procesar (default 5 para prueba; usar 200 para todos)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Cargar .env.local en process.env ANTES de importar el SDK (lee env al instanciar)
const envText = readFileSync(".env.local", "utf-8");
for (const line of envText.split("\n")) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  const k = line.slice(0, i).trim();
  const v = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  if (!process.env[k]) process.env[k] = v;
}

const WUIPI_ACCOUNT = "01050745651745103031";
const TRANSACTION_TYPE = 1;
const LIMIT = parseInt(process.argv[2] || "5", 10);
const DATE_WINDOW_DAYS = 10; // probar fecha del reporte hacia atrás N días

async function main() {
const { MercantilSDK, transferReferenceLast8 } = await import("../src/lib/mercantil");

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const sdk = new MercantilSDK();
console.log(`transfer_search configurado: ${sdk.isProductConfigured("transfer_search")}\n`);

// 1) Items conciliating + su gateway log con bank_code
const { data: items } = await sb
  .from("collection_items")
  .select("id, customer_name, customer_cedula_rif, amount_usd, amount_bss, payment_reference, created_at")
  .eq("status", "conciliating")
  .order("created_at", { ascending: true })
  .limit(LIMIT);

console.log(`Verificando ${items!.length} items conciliating (ventana ${DATE_WINDOW_DAYS} días)...\n`);

let matched = 0;
let noMatch = 0;
let errored = 0;
const results: Array<Record<string, unknown>> = [];

for (const it of items!) {
  // bank_code + amount del gateway log más reciente del item
  const { data: logs } = await sb
    .from("payment_gateway_logs")
    .select("request_payload, created_at")
    .eq("collection_item_id", it.id)
    .eq("gateway_product", "transfer_search")
    .eq("event_type", "request_sent")
    .order("created_at", { ascending: false })
    .limit(1);

  const req = (logs?.[0]?.request_payload || {}) as Record<string, unknown>;
  const bankCode = req.bank_code ? String(req.bank_code) : null;
  const amount = typeof req.amount === "number" ? req.amount : (it.amount_bss ? Number(it.amount_bss) : null);
  const reportDate = logs?.[0]?.created_at || it.created_at;

  if (!bankCode || !amount || !it.customer_cedula_rif) {
    console.log(`  ⊘ ${it.customer_name.slice(0, 30).padEnd(30)} | falta bankCode/amount/cedula — skip`);
    results.push({ id: it.id, customer: it.customer_name, status: "skip_no_data", bankCode, amount });
    errored++;
    continue;
  }

  // Rango de fechas: desde la fecha del reporte hacia atrás
  const baseDate = new Date(reportDate);
  const dates: string[] = [];
  for (let d = 0; d < DATE_WINDOW_DAYS; d++) {
    const dt = new Date(baseDate);
    dt.setUTCDate(dt.getUTCDate() - d);
    dates.push(dt.toISOString().split("T")[0]);
  }

  let hit: unknown = null;
  let matchedDate: string | null = null;
  let lastError: string | null = null;
  const expectedLast8 = transferReferenceLast8(it.payment_reference || "");

  for (const trxDate of dates) {
    try {
      const r = await sdk.searchTransfers({
        account: WUIPI_ACCOUNT,
        issuerCustomerId: String(it.customer_cedula_rif),
        trxDate,
        issuerBankId: parseInt(bankCode, 10),
        transactionType: TRANSACTION_TYPE,
        paymentReference: it.payment_reference || "",
        amount,
      });
      if (r.length > 0) {
        const found = r.find((t) => !t.paymentReference || t.paymentReference === expectedLast8);
        if (found) {
          hit = found;
          matchedDate = trxDate;
          break;
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (hit) {
    matched++;
    console.log(`  ✓ ${it.customer_name.slice(0, 30).padEnd(30)} | $${it.amount_usd} | ref=${it.payment_reference} | MATCH en ${matchedDate}`);
    results.push({ id: it.id, customer: it.customer_name, amount_usd: it.amount_usd, ref: it.payment_reference, status: "MATCH", matchedDate, bankCode });
  } else if (lastError) {
    errored++;
    console.log(`  ⚠ ${it.customer_name.slice(0, 30).padEnd(30)} | ERROR: ${lastError.slice(0, 50)}`);
    results.push({ id: it.id, customer: it.customer_name, status: "error", error: lastError, bankCode });
  } else {
    noMatch++;
    console.log(`  ✗ ${it.customer_name.slice(0, 30).padEnd(30)} | $${it.amount_usd} | ref=${it.payment_reference} | sin match en ${DATE_WINDOW_DAYS} días`);
    results.push({ id: it.id, customer: it.customer_name, amount_usd: it.amount_usd, ref: it.payment_reference, status: "no_match", bankCode });
  }
}

console.log(`\n=== RESUMEN ===`);
console.log(`  ✓ Match (transferencia existe):  ${matched}`);
console.log(`  ✗ Sin match (no encontrada):     ${noMatch}`);
console.log(`  ⚠ Error / sin datos:             ${errored}`);

try { mkdirSync("exports", { recursive: true }); } catch {}
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
writeFileSync(`exports/verify-conciliating-${stamp}.json`, JSON.stringify(results, null, 2));
console.log(`\n✅ Detalle: exports/verify-conciliating-${stamp}.json`);
}

main().catch((err) => { console.error(err); process.exit(1); });
