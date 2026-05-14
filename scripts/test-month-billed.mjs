// Smoke test de computeMonthBilled (nueva fórmula basada en invoice_date_due)
// + comparación contra el cálculo viejo para todas las drafts reales en Odoo.
//
// NO toca Odoo (solo lee). Reproduce las dos funciones en JS puro y devuelve
// el delta para que sepamos exactamente cuántas drafts cambian de mes.

import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(".env.local","utf-8").split("\n").filter(l => l && !l.startsWith("#") && l.includes("=")).map(l => { const i=l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]; }));

async function rpc(s,m,a){const r=await fetch(env.ODOO_URL+"/jsonrpc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:Date.now(),method:"call",params:{service:s,method:m,args:a}})});const d=await r.json();if(d.error)throw new Error(d.error.data?.message||d.error.message);return d.result;}

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// NUEVA fórmula — usa invoice_date_due
function newCompute(due) {
  const start = new Date(due + "T12:00:00Z");
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(end.getUTCDate() - 1);
  const midpoint = new Date((start.getTime() + end.getTime()) / 2);
  return MESES[midpoint.getUTCMonth()];
}

// VIEJA fórmula — usa next_invoice_date de la suscripción
function oldCompute(next) {
  const n = new Date(next + "T12:00:00Z");
  if (Number.isNaN(n.getTime())) return "";
  const periodEnd = new Date(n);
  periodEnd.setUTCDate(periodEnd.getUTCDate() - 1);
  const periodStart = new Date(periodEnd);
  periodStart.setUTCMonth(periodStart.getUTCMonth() - 1);
  periodStart.setUTCDate(periodStart.getUTCDate() + 1);
  const midpoint = new Date((periodStart.getTime() + periodEnd.getTime()) / 2);
  return MESES[midpoint.getUTCMonth()];
}

// ── Tests unit del usuario ────────────────────────────────────────────────
console.log("=== TESTS UNIT (nueva formula) ===");
const tests = [
  { due: "2026-04-27", expect: "Mayo",     why: "periodo 27-04→26-05 midpoint mayo 11" },
  { due: "2026-03-27", expect: "Abril",    why: "periodo 27-03→26-04 midpoint abril 11" },
  { due: "2026-03-11", expect: "Marzo",    why: "periodo 11-03→10-04 midpoint marzo 26" },
  { due: "2026-01-28", expect: "Febrero",  why: "periodo 28-01→27-02 midpoint feb 12" },
  { due: "2026-01-27", expect: "Febrero",  why: "periodo 27-01→26-02 midpoint feb 11" },
  { due: "2026-05-27", expect: "Junio",    why: "draft anticipada del ciclo siguiente" },
  { due: "2026-12-15", expect: "Diciembre",why: "mid-month ej diciembre" },
  { due: "2026-12-31", expect: "Enero",    why: "ultimo dia → midpoint cae en enero next" },
];
let pass = 0, fail = 0;
for (const t of tests) {
  const got = newCompute(t.due);
  const ok = got === t.expect;
  console.log(`${ok?"✅":"❌"} due=${t.due} → ${got} ${ok?"":"(esperado " + t.expect + ")"} | ${t.why}`);
  if (ok) pass++; else fail++;
}
console.log(`\n${pass}/${tests.length} pass\n`);

// ── Comparación contra TODAS las drafts en Odoo ───────────────────────────
console.log("=== COMPARACION REAL: todas las drafts en Odoo ===");
const uid = await rpc("common","authenticate",[env.ODOO_DB,env.ODOO_USER,env.ODOO_API_KEY,{}]);
const drafts = await rpc("object","execute_kw",[env.ODOO_DB,uid,env.ODOO_API_KEY,"account.move","search_read",
  [[["state","=","draft"],["move_type","=","out_invoice"]]],
  {fields:["id","invoice_date_due","invoice_origin","subscription_id","amount_total"],limit:10000}]);

console.log(`Total drafts: ${drafts.length}`);

// Necesitamos sub.next_invoice_date para el cálculo viejo. Lo obtenemos en batch.
const subIds = [...new Set(drafts.filter(d => d.subscription_id).map(d => d.subscription_id[0]))];
const subs = await rpc("object","execute_kw",[env.ODOO_DB,uid,env.ODOO_API_KEY,"sale.order","search_read",
  [[["id","in",subIds]]],
  {fields:["id","name","next_invoice_date"]}]);
const subMap = Object.fromEntries(subs.map(s => [s.id, s.next_invoice_date]));

// Comparar
let withDue = 0, withoutDue = 0;
let sameMes = 0, diffMes = 0, oldNoData = 0;
const diffs = [];
for (const d of drafts) {
  const due = d.invoice_date_due;
  const subId = d.subscription_id?.[0];
  const next = subId ? subMap[subId] : null;

  if (!due) { withoutDue++; continue; }
  withDue++;

  const newM = newCompute(due);
  const oldM = next ? oldCompute(next) : null;

  if (!oldM) { oldNoData++; continue; }
  if (newM === oldM) sameMes++;
  else {
    diffMes++;
    if (diffs.length < 20) diffs.push({ id: d.id, due, next, oldM, newM, total: d.amount_total });
  }
}
console.log(`\nDrafts con invoice_date_due:    ${withDue}`);
console.log(`Drafts SIN invoice_date_due:    ${withoutDue} (caerán al fallback viejo)`);
console.log(`Mes IGUAL viejo vs nuevo:       ${sameMes}`);
console.log(`Mes DISTINTO viejo vs nuevo:    ${diffMes}  ← acá está el bug arreglado`);
console.log(`Sin sub.next_invoice_date:      ${oldNoData}`);

if (diffs.length > 0) {
  console.log(`\nEjemplos de drafts donde el mes CAMBIA con el fix:`);
  for (const d of diffs) {
    console.log(`  inv=${d.id} due=${d.due} sub_next=${d.next} | viejo="${d.oldM}" → nuevo="${d.newM}" | $${d.total}`);
  }
}

// Histograma de meses con la fórmula nueva (cuántas drafts caerán en qué mes al postear)
console.log(`\n=== Histograma meses (nueva formula) ===`);
const hist = {};
for (const d of drafts) {
  if (!d.invoice_date_due) continue;
  const m = newCompute(d.invoice_date_due);
  hist[m] = (hist[m] || 0) + 1;
}
for (const [m, c] of Object.entries(hist).sort((a,b)=>b[1]-a[1])) console.log(`  ${m}: ${c}`);
