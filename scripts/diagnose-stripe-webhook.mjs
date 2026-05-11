// Diagnose Stripe webhook signature failures.
// Lists configured webhook endpoints, their URLs, status, recent attempts.
// Helps identify mismatched secrets, wrong URLs, or disabled endpoints.

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf-8")
    .split("\n")
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]; })
);

const SK = env.STRIPE_SECRET_KEY;
const WHS_LOCAL = env.STRIPE_WEBHOOK_SECRET;

if (!SK) {
  console.error("[X] STRIPE_SECRET_KEY no esta en .env.local");
  process.exit(1);
}
const isLive = SK.startsWith("sk_live_");
console.log(`Stripe mode: ${isLive ? "LIVE" : "TEST"}  (key tail: ${SK.slice(-6)})`);
console.log(`Local webhook secret tail: ...${WHS_LOCAL?.slice(-6) || "(none)"}\n`);

// 1. List webhook endpoints
console.log("=== Webhook endpoints configurados en Stripe ===\n");
const epRes = await fetch("https://api.stripe.com/v1/webhook_endpoints", {
  headers: { Authorization: `Bearer ${SK}` },
});
const epData = await epRes.json();
if (!epRes.ok) {
  console.error("[X] Error listando endpoints:", epData);
  process.exit(1);
}

if (!epData.data?.length) {
  console.log("⚠️  NO HAY WEBHOOK ENDPOINTS configurados en Stripe Dashboard.");
  console.log("    Eso explica por que no se procesan los pagos:");
  console.log("    Stripe nunca te avisa de pagos completados.");
  console.log("\n    Solucion:");
  console.log("    1. Ir a https://dashboard.stripe.com/webhooks");
  console.log("    2. + Add endpoint");
  console.log("    3. URL: https://api.wuipi.net/api/cobranzas/webhook/stripe");
  console.log("    4. Eventos: checkout.session.completed (al menos)");
  console.log("    5. Copiar el Signing secret (empieza con whsec_)");
  console.log("    6. Guardarlo en Vercel como STRIPE_WEBHOOK_SECRET y redeploy");
  process.exit(0);
}

for (const ep of epData.data) {
  console.log("─".repeat(60));
  console.log(`Endpoint: ${ep.id}`);
  console.log(`  URL:           ${ep.url}`);
  console.log(`  Status:        ${ep.status}`);
  console.log(`  API version:   ${ep.api_version || "(default)"}`);
  console.log(`  Created:       ${new Date(ep.created * 1000).toISOString()}`);
  console.log(`  Events:        ${(ep.enabled_events || []).join(", ").slice(0, 200)}`);
  console.log(`  Secret tail:   ${ep.secret ? "..." + ep.secret.slice(-6) : "(hidden — only shown at creation)"}`);
  if (ep.secret && WHS_LOCAL) {
    console.log(`  Matches local: ${ep.secret === WHS_LOCAL ? "✅ YES" : "❌ NO"}`);
  }
}

// 2. List recent attempts for the first wuipi endpoint (if any)
const wuipiEndpoint = epData.data.find(e => e.url.includes("wuipi") || e.url.includes("api.wuipi"));
if (wuipiEndpoint) {
  console.log(`\n=== Ultimos events enviados a ${wuipiEndpoint.url} ===\n`);
  const evRes = await fetch(
    `https://api.stripe.com/v1/events?limit=10&types[]=checkout.session.completed`,
    { headers: { Authorization: `Bearer ${SK}` } }
  );
  const evData = await evRes.json();
  if (evRes.ok && evData.data?.length) {
    for (const e of evData.data) {
      const dt = new Date(e.created * 1000).toISOString();
      const obj = e.data?.object;
      const amt = obj?.amount_total ? `$${(obj.amount_total/100).toFixed(2)} ${obj.currency?.toUpperCase()}` : "?";
      const status = obj?.payment_status || "?";
      const token = obj?.metadata?.collection_token?.slice(0, 16) || "(none)";
      console.log(`  ${dt}  ${e.type.padEnd(35)} ${amt.padEnd(12)} ${status.padEnd(8)} token=${token}`);
    }
  } else {
    console.log("  (sin eventos de checkout.session.completed recientes)");
  }
}

console.log("\n=== FIN ===\n");
