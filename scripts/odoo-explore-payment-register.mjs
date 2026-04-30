// Investigar el wizard account.payment.register que es como la UI registra pagos.
// SOLO LECTURA: lee el wizard con default_get para ver los valores que pondría
// la UI si abrieras "Registrar pago" desde la factura 43350.

import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local", "utf-8").split("\n").filter(l => l && !l.startsWith("#") && l.includes("=")).map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]; }));

async function rpc(s, m, a, kw = {}) {
  const r = await fetch(`${env.ODOO_URL}/jsonrpc`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({jsonrpc:"2.0",id:1,method:"call",params:{service:s,method:m,args:a, kwargs: kw}}) });
  const d = await r.json();
  if(d.error) { console.error("RPC error:", d.error.data?.debug?.split("\n").slice(-3).join("\n") || d.error.message); throw new Error(d.error.data?.message || d.error.message); }
  return d.result;
}

async function callKw(model, method, args, kwargs = {}, context = {}) {
  const uid = await rpc("common","authenticate",[env.ODOO_DB,env.ODOO_USER,env.ODOO_API_KEY,{}]);
  return rpc("object","execute_kw",[env.ODOO_DB,uid,env.ODOO_API_KEY,model,method,args,{...kwargs, context}]);
}

// 1. fields_get del wizard
console.log("=== Campos del wizard account.payment.register ===");
const fields = await callKw("account.payment.register", "fields_get", [], { attributes: ["string","type","help","required","default"] });
const relevantFields = ["payment_date","amount","journal_id","payment_method_line_id",
                        "currency_id","payment_type","partner_type","partner_id","communication",
                        "ref","group_payment","payment_difference","writeoff_account_id",
                        "writeoff_label","early_payment_discount_mode","line_ids"];
for (const fname of relevantFields) {
  if (fields[fname]) {
    const f = fields[fname];
    console.log(`  ${fname} (${f.type})${f.required ? " REQUIRED" : ""}: "${f.string}"`);
    if (f.help) console.log(`    help: ${f.help.slice(0, 100)}`);
  }
}

// 2. default_get desde la factura 43350 — esto simula "abrir el wizard desde la factura"
console.log("\n=== default_get del wizard con context de factura 43350 ===");
const defaults = await callKw(
  "account.payment.register",
  "default_get",
  [["payment_date","amount","journal_id","payment_method_line_id","currency_id",
    "payment_type","partner_type","partner_id","communication"]],
  {},
  { active_model: "account.move", active_ids: [43350], active_id: 43350 }
);
console.log(JSON.stringify(defaults, null, 2));

// 3. onchange en el wizard para ver cómo se pre-llena con el journal Bank (id=29)
console.log("\n=== Crear wizard preview (sin guardar) ===");
// Usamos onchange para simular la apertura del wizard
const onchangeRes = await callKw(
  "account.payment.register",
  "onchange",
  [[], { ...defaults }, [], { /* spec */ }],
  {},
  { active_model: "account.move", active_ids: [43350], active_id: 43350 }
);
console.log("onchange resultado:", JSON.stringify(onchangeRes, null, 2).slice(0, 2000));
