// Sprint 1 — Fase 0: Explorar journals y account.payment existentes en Wuipi.
// Solo lectura.

import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local", "utf-8").split("\n").filter(l => l && !l.startsWith("#") && l.includes("=")).map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]; }));

async function rpc(s, m, a) {
  const r = await fetch(`${env.ODOO_URL}/jsonrpc`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({jsonrpc:"2.0",id:1,method:"call",params:{service:s,method:m,args:a}}) });
  const d = await r.json();
  if(d.error) { console.error("RPC error:", JSON.stringify(d.error.data?.debug || d.error, null, 2)); throw new Error(d.error.data?.message); }
  return d.result;
}
const uid = await rpc("common","authenticate",[env.ODOO_DB,env.ODOO_USER,env.ODOO_API_KEY,{}]);

// 1. Listar todos los journals
console.log("=== JOURNALS ===");
const journals = await rpc("object","execute_kw",[env.ODOO_DB,uid,env.ODOO_API_KEY,
  "account.journal","search_read",[[]],
  { fields: ["id","name","code","type","currency_id","default_account_id","bank_account_id","active"], limit: 50, order: "type,id" }
]);
console.log(`${journals.length} journals:`);
for (const j of journals) {
  console.log(`  id=${j.id} | code=${j.code} | type=${j.type} | name="${j.name}" | currency=${j.currency_id?.[1] || "company"} | account=${j.default_account_id?.[1] || "-"} | active=${j.active}`);
}

// 2. Filtrar solo journals tipo bank/cash (que usaremos para payments)
console.log("\n=== JOURNALS BANK/CASH (relevantes para pagos) ===");
const bankCash = journals.filter(j => j.type === "bank" || j.type === "cash");
for (const j of bankCash) {
  console.log(`  id=${j.id} | code="${j.code}" | "${j.name}" | currency=${j.currency_id?.[1] || "company default"}`);
}

// 3. Ver un payment existente de Rafael o de cualquier cliente reciente para entender estructura
console.log("\n=== Ejemplos de account.payment recientes (cualquier cliente) ===");
const payments = await rpc("object","execute_kw",[env.ODOO_DB,uid,env.ODOO_API_KEY,
  "account.payment","search_read",[[["state","=","posted"]]],
  {
    fields: ["id","name","state","payment_type","partner_type","partner_id","journal_id",
            "amount","currency_id","date","memo","reconciled_invoice_ids",
            "is_reconciled","is_matched","move_id","payment_method_line_id"],
    limit: 5,
    order: "create_date desc"
  }
]);
console.log(`${payments.length} payments recientes:`);
for (const p of payments) {
  console.log(`\n  id=${p.id} | name=${p.name} | state=${p.state}`);
  console.log(`    type=${p.payment_type}/${p.partner_type} | partner=${p.partner_id?.[1]}`);
  console.log(`    journal=${p.journal_id?.[1]} | amount=${p.amount} ${p.currency_id?.[1]}`);
  console.log(`    date=${p.date} | ref="${p.ref || '-'}" | memo="${p.memo || '-'}"`);
  console.log(`    payment_method_line=${p.payment_method_line_id?.[1] || '-'}`);
  console.log(`    is_reconciled=${p.is_reconciled} | is_matched=${p.is_matched}`);
  console.log(`    reconciled_invoices=${JSON.stringify(p.reconciled_invoice_ids)}`);
  console.log(`    move_id=${p.move_id?.[1]}`);
}

// 4. Investigar el payment_method_line — qué métodos hay disponibles
console.log("\n=== Métodos de pago disponibles (account.payment.method.line) ===");
const methodLines = await rpc("object","execute_kw",[env.ODOO_DB,uid,env.ODOO_API_KEY,
  "account.payment.method.line","search_read",[[["payment_type","=","inbound"]]],
  { fields: ["id","name","journal_id","payment_method_id","payment_type","payment_account_id"], limit: 30 }
]);
console.log(`${methodLines.length} métodos inbound:`);
for (const ml of methodLines) {
  console.log(`  id=${ml.id} | "${ml.name}" | journal=${ml.journal_id?.[1]} | method=${ml.payment_method_id?.[1]}`);
}
