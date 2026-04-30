// Investigar cómo Wuipi marca facturas como pagadas (sin account.payment).
// Hipótesis: usan reconciliación bancaria directa contra el extracto.

import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local", "utf-8").split("\n").filter(l => l && !l.startsWith("#") && l.includes("=")).map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]; }));

async function rpc(s, m, a) {
  const r = await fetch(`${env.ODOO_URL}/jsonrpc`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({jsonrpc:"2.0",id:1,method:"call",params:{service:s,method:m,args:a}}) });
  const d = await r.json();
  if(d.error) { console.error("RPC error:", d.error.data?.debug?.split("\n").pop() || d.error.message); throw new Error(d.error.data?.message || d.error.message); }
  return d.result;
}
const uid = await rpc("common","authenticate",[env.ODOO_DB,env.ODOO_USER,env.ODOO_API_KEY,{}]);

// 1. Buscar todos los account.payment (sin filtro de state)
console.log("=== TODOS los account.payment ===");
const allPayments = await rpc("object","execute_kw",[env.ODOO_DB,uid,env.ODOO_API_KEY,
  "account.payment","search_count",[[]],
  {}
]);
console.log(`Total payments en Odoo: ${allPayments}`);

if (allPayments > 0) {
  const sample = await rpc("object","execute_kw",[env.ODOO_DB,uid,env.ODOO_API_KEY,
    "account.payment","search_read",[[]],
    { fields: ["id","name","state","amount","currency_id","journal_id","partner_id","date"], limit: 3, order: "create_date desc" }
  ]);
  console.log("Sample:", JSON.stringify(sample, null, 2));
}

// 2. Buscar facturas paid recientes para entender reconciliación
console.log("\n=== Facturas paid o in_payment recientes ===");
const paid = await rpc("object","execute_kw",[env.ODOO_DB,uid,env.ODOO_API_KEY,
  "account.move","search_read",[[
    ["move_type","=","out_invoice"],
    ["state","=","posted"],
    ["payment_state","in",["paid","in_payment"]],
  ]],
  {
    fields: ["id","name","partner_id","state","payment_state","amount_total","currency_id","invoice_date","invoice_origin"],
    limit: 5,
    order: "create_date desc"
  }
]);
console.log(`${paid.length} facturas paid:`);
for (const m of paid) {
  console.log(`  id=${m.id} name=${m.name} partner=${m.partner_id?.[1]} ` +
              `payment_state=${m.payment_state} total=${m.amount_total} ${m.currency_id?.[1]} ` +
              `inv_date=${m.invoice_date}`);
}

// 3. Inspeccionar la primera para ver cómo está reconciliada
if (paid[0]) {
  console.log(`\n=== Detalle factura ${paid[0].id} (${paid[0].name}) ===`);
  const detail = (await rpc("object","execute_kw",[env.ODOO_DB,uid,env.ODOO_API_KEY,
    "account.move","read",[[paid[0].id]],{}
  ]))[0];
  // Mostrar campos relacionados a payments/reconciliación
  const interesting = ["amount_residual","payment_state","matched_payment_ids","invoice_payment_term_id",
                        "line_ids","state","name","partner_id","amount_total"];
  for (const k of interesting) {
    if (detail[k] !== undefined && detail[k] !== false) {
      console.log(`  ${k}: ${JSON.stringify(detail[k])}`);
    }
  }

  // Ver matched_payments
  const movePayments = detail.matched_payment_ids || [];
  if (Array.isArray(movePayments) && movePayments.length > 0) {
    console.log(`\n  matched_payments: ${movePayments.length}`);
    const mps = await rpc("object","execute_kw",[env.ODOO_DB,uid,env.ODOO_API_KEY,
      "account.payment","read",[movePayments],{}
    ]);
    for (const mp of mps) {
      console.log(`    payment id=${mp.id} state=${mp.state} amount=${mp.amount} journal=${mp.journal_id?.[1]}`);
    }
  }

  // Ver las account.move.line (asientos contables) de la factura para ver con qué se reconcilió
  console.log(`\n  === Líneas account.move.line ===`);
  const lines = await rpc("object","execute_kw",[env.ODOO_DB,uid,env.ODOO_API_KEY,
    "account.move.line","search_read",[[["move_id","=",paid[0].id]]],
    { fields: ["id","name","account_id","debit","credit","reconciled","matched_debit_ids","matched_credit_ids","display_type"] }
  ]);
  for (const l of lines) {
    console.log(`    line id=${l.id} type=${l.display_type} account=${l.account_id?.[1]} debit=${l.debit} credit=${l.credit} reconciled=${l.reconciled}`);
    if (l.matched_debit_ids?.length || l.matched_credit_ids?.length) {
      console.log(`      matched_debit=${JSON.stringify(l.matched_debit_ids)} matched_credit=${JSON.stringify(l.matched_credit_ids)}`);
    }
  }
}

// 4. Ver bank statement lines (extracto bancario) para entender si esa es la fuente
console.log("\n=== account.bank.statement.line recientes ===");
const stmtCount = await rpc("object","execute_kw",[env.ODOO_DB,uid,env.ODOO_API_KEY,
  "account.bank.statement.line","search_count",[[]],
  {}
]);
console.log(`Total bank statement lines: ${stmtCount}`);
if (stmtCount > 0) {
  const stmts = await rpc("object","execute_kw",[env.ODOO_DB,uid,env.ODOO_API_KEY,
    "account.bank.statement.line","search_read",[[]],
    { fields: ["id","date","amount","journal_id","partner_id","payment_ref","narration","is_reconciled"], limit: 3, order: "create_date desc" }
  ]);
  console.log("Sample:", JSON.stringify(stmts, null, 2));
}
