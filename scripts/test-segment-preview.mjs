// Smoke test de previewSegment — simula la lógica del backend contra Odoo prod.
// NO toca Supabase. NO requiere auth. Solo valida que los filtros funcionen
// matemáticamente y devuelvan resultados coherentes.
//
// Reproduce previewSegment en JS puro (igual lógica que TS, copiado).

import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(".env.local","utf-8").split("\n").filter(l => l && !l.startsWith("#") && l.includes("=")).map(l => { const i=l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]; }));

async function rpc(s,m,a){const r=await fetch(env.ODOO_URL+"/jsonrpc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:Date.now(),method:"call",params:{service:s,method:m,args:a}})});const d=await r.json();if(d.error)throw new Error(d.error.data?.message||d.error.message);return d.result;}

const uid = await rpc("common","authenticate",[env.ODOO_DB,env.ODOO_USER,env.ODOO_API_KEY,{}]);

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function computeMonthBilled(due) {
  const start = new Date(due + "T12:00:00Z");
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(end.getUTCDate() - 1);
  const midpoint = new Date((start.getTime() + end.getTime()) / 2);
  return MESES[midpoint.getUTCMonth()];
}

function daysSince(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function matchRange(value, range) {
  if (!range) return true;
  if (typeof range.min === "number" && value < range.min) return false;
  if (typeof range.max === "number" && value > range.max) return false;
  return true;
}

function matchDoc(vat, allowed) {
  if (!allowed?.length) return true;
  const letter = vat.trim().match(/^[VEJGPvejgp]/)?.[0]?.toUpperCase();
  return letter ? allowed.includes(letter) : false;
}

async function preview(filters) {
  const domain = [["move_type","=","out_invoice"],["state","=","draft"]];
  if (filters.due_date?.from) domain.push(["invoice_date_due",">=",filters.due_date.from]);
  if (filters.due_date?.to)   domain.push(["invoice_date_due","<=",filters.due_date.to]);
  if (filters.amount_per_invoice?.min) domain.push(["amount_total",">=",filters.amount_per_invoice.min]);
  if (filters.amount_per_invoice?.max) domain.push(["amount_total","<=",filters.amount_per_invoice.max]);

  const invs = await rpc("object","execute_kw",[env.ODOO_DB,uid,env.ODOO_API_KEY,"account.move","search_read",[domain],{fields:["id","partner_id","invoice_date_due","amount_total","subscription_id"],limit:5000}]);
  if (invs.length === 0) return { count: 0, total_usd: 0, sample: [] };

  const pids = [...new Set(invs.map(i => i.partner_id[0]))];
  const partners = await rpc("object","execute_kw",[env.ODOO_DB,uid,env.ODOO_API_KEY,"res.partner","read",[pids,["name","email","mobile","phone","vat","credit","is_company","city"]]]);
  const partnerMap = new Map(partners.map(p => [p.id, p]));

  // Group by partner
  const grouped = new Map();
  for (const inv of invs) {
    const pid = inv.partner_id[0];
    if (!grouped.has(pid)) grouped.set(pid, { partner: partnerMap.get(pid), invoices: [] });
    grouped.get(pid).invoices.push(inv);
  }

  const customers = [];
  let total = 0;
  for (const [pid, data] of grouped) {
    const p = data.partner; if (!p) continue;
    const vat = String(p.vat || "");
    const isCompany = !!p.is_company;
    const email = String(p.email || "");
    const phone = String(p.mobile || p.phone || "");
    const city = String(p.city || "");
    const credit = Number(p.credit || 0);

    if (!matchDoc(vat, filters.doc_type)) continue;
    if (typeof filters.is_company === "boolean" && isCompany !== filters.is_company) continue;
    if (filters.has_email === true && !email) continue;
    if (filters.has_phone === true && !phone) continue;
    if (filters.city && !city.toLowerCase().includes(filters.city.toLowerCase())) continue;
    if (filters.exclude_credit && credit < 0) continue;

    let billedMatch = !filters.billed_month?.length;
    let oldestDue = "9999-12-31";
    let draftTotal = 0;
    const invoiceList = [];
    for (const inv of data.invoices) {
      const due = typeof inv.invoice_date_due === "string" ? inv.invoice_date_due : "";
      const amt = inv.amount_total || 0;
      const bm = due ? computeMonthBilled(due) : "";
      if (filters.billed_month?.length && filters.billed_month.includes(bm)) billedMatch = true;
      if (due && due < oldestDue) oldestDue = due;
      draftTotal += amt;
      invoiceList.push({ id: inv.id, due, amt, bm });
    }
    if (!billedMatch || invoiceList.length === 0) continue;
    if (!matchRange(invoiceList.length, filters.draft_count)) continue;

    const totalDue = Math.max(draftTotal + credit/474, 0);
    if (!matchRange(totalDue, filters.amount_total)) continue;

    const overdue = oldestDue !== "9999-12-31" ? daysSince(oldestDue) : 0;
    if (!matchRange(overdue, filters.overdue_days)) continue;

    total += totalDue;
    customers.push({
      pid, name: p.name, vat, isCompany, city, email,
      invCount: invoiceList.length,
      total: Math.round(totalDue*100)/100,
      oldest: oldestDue,
      overdue,
    });
  }

  customers.sort((a,b) => b.total - a.total);
  return { count: customers.length, total_usd: Math.round(total*100)/100, sample: customers.slice(0, 10) };
}

// ── Tests ────────────────────────────────────────────────────────────────
console.log("\n=== TEST 1: sin filtros (universo total) ===");
const t1 = await preview({});
console.log(`count=${t1.count} total=$${t1.total_usd}`);

console.log("\n=== TEST 2: solo jurídicos (J) ===");
const t2 = await preview({ doc_type: ["J"] });
console.log(`count=${t2.count} total=$${t2.total_usd}`);
console.log(`Top 3:`); for (const c of t2.sample.slice(0,3)) console.log(`  ${c.vat} ${c.name} — $${c.total}`);

console.log("\n=== TEST 3: morosos +60 días ===");
const t3 = await preview({ overdue_days: { min: 60 } });
console.log(`count=${t3.count} total=$${t3.total_usd}`);
console.log(`Top 3:`); for (const c of t3.sample.slice(0,3)) console.log(`  ${c.name} — ${c.overdue}d morosos — $${c.total}`);

console.log("\n=== TEST 4: clientes con 2+ drafts y total >$50 ===");
const t4 = await preview({ draft_count: { min: 2 }, amount_total: { min: 50 } });
console.log(`count=${t4.count} total=$${t4.total_usd}`);
console.log(`Top 3:`); for (const c of t4.sample.slice(0,3)) console.log(`  ${c.name} — ${c.invCount} drafts — $${c.total}`);

console.log("\n=== TEST 5: facturas vencidas en abril (due 2026-04-01 a 2026-04-30) ===");
const t5 = await preview({ due_date: { from: "2026-04-01", to: "2026-04-30" } });
console.log(`count=${t5.count} total=$${t5.total_usd}`);

console.log("\n=== TEST 6: combinatoria — naturales (V), con email, $20-$200, mes facturado abril ===");
const t6 = await preview({ doc_type: ["V"], has_email: true, amount_total: { min: 20, max: 200 }, billed_month: ["Abril"] });
console.log(`count=${t6.count} total=$${t6.total_usd}`);

console.log("\n=== TEST 7: solo Lechería (city ilike) ===");
const t7 = await preview({ city: "Lechería" });
console.log(`count=${t7.count} total=$${t7.total_usd}`);

console.log("\n=== TEST 8: excluir clientes con saldo a favor ===");
const t8 = await preview({ exclude_credit: true });
console.log(`count=${t8.count} total=$${t8.total_usd}`);
console.log(`(comparado con sin filtro: ${t1.count} → diff = ${t1.count - t8.count} clientes excluidos por tener credito)`);

console.log("\n✅ Todos los tests corrieron sin errores.");
