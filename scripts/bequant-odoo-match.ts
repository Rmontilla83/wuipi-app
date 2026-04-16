/**
 * Muestra IPs reales en BQN vs IPs en Odoo (mikrotik.service) para ver si matchean.
 * Uso: npx tsx scripts/bequant-odoo-match.ts
 */
import "dotenv/config";

const BQN_URL = "https://45.181.124.128:7343/api/v1";
const BQN_AUTH = "Basic " + Buffer.from("wuipi-readonly:Wu!p!-@p!r3@d0nly").toString("base64");

// Ignore self-signed cert
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

async function bqn(path: string) {
  const r = await fetch(`${BQN_URL}${path}`, { headers: { Authorization: BQN_AUTH } });
  return r.json();
}

// --- Odoo JSON-RPC ---
const ODOO_URL = process.env.ODOO_URL!;
const ODOO_DB = process.env.ODOO_DB!;
const ODOO_USER = process.env.ODOO_USER!;
const ODOO_KEY = process.env.ODOO_API_KEY!;

let uid: number | null = null;
async function odooAuth() {
  if (uid) return uid;
  const r = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", method: "call",
      params: { service: "common", method: "authenticate", args: [ODOO_DB, ODOO_USER, ODOO_KEY, {}] },
    }),
  });
  const { result } = await r.json();
  uid = result;
  return uid!;
}

async function odooSearchRead(model: string, domain: unknown[], fields: string[], limit = 5000) {
  const id = await odooAuth();
  const r = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", method: "call",
      params: {
        service: "object", method: "execute_kw",
        args: [ODOO_DB, id, ODOO_KEY, model, "search_read", [domain], { fields, limit }],
      },
    }),
  });
  const { result } = await r.json();
  return result as any[];
}

async function main() {
  console.log("=== Fetching BQN subscribers ===");
  const bqnData = await bqn("/subscribers");
  const bqnIps: string[] = bqnData.items.map((s: any) => s.subscriberIp);
  const bqnWithPolicy = bqnData.items.filter((s: any) => s.policyRate).length;
  console.log(`BQN total subscribers: ${bqnIps.length} (${bqnWithPolicy} con policyRate asignada)`);
  console.log(`Sample BQN IPs:`, bqnIps.slice(0, 10));

  console.log("\n=== Fetching Odoo mikrotik.service IPs ===");
  const services = await odooSearchRead(
    "mikrotik.service",
    [["state", "in", ["progress", "suspended"]]],
    ["name", "ip_cpe", "ipv4", "partner_id", "state"],
    10000
  );
  console.log(`Odoo services: ${services.length}`);

  const odooIpCpe = new Set<string>();
  const odooIpv4 = new Set<string>();
  let withCpe = 0, withIpv4 = 0;

  for (const s of services) {
    if (s.ip_cpe && typeof s.ip_cpe === "string") {
      odooIpCpe.add(s.ip_cpe.trim());
      withCpe++;
    }
    // ipv4 may be many2one [id, name] or string
    const ipv4 = Array.isArray(s.ipv4) ? s.ipv4[1] : s.ipv4;
    if (ipv4 && typeof ipv4 === "string") {
      odooIpv4.add(ipv4.trim());
      withIpv4++;
    }
  }

  console.log(`  con ip_cpe: ${withCpe}`);
  console.log(`  con ipv4:   ${withIpv4}`);
  console.log(`  Sample ip_cpe:`, Array.from(odooIpCpe).slice(0, 10));
  console.log(`  Sample ipv4:  `, Array.from(odooIpv4).slice(0, 10));

  // Intersección
  const bqnSet = new Set(bqnIps);
  const matchCpe = Array.from(odooIpCpe).filter(ip => bqnSet.has(ip));
  const matchIpv4 = Array.from(odooIpv4).filter(ip => bqnSet.has(ip));

  console.log(`\n=== MATCH RESULTS ===`);
  console.log(`BQN ∩ Odoo.ip_cpe: ${matchCpe.length} matches`);
  console.log(`BQN ∩ Odoo.ipv4:   ${matchIpv4.length} matches`);
  console.log(`Sample matches ip_cpe:`, matchCpe.slice(0, 5));
  console.log(`Sample matches ipv4:  `, matchIpv4.slice(0, 5));

  // IPs que están en BQN pero NO en Odoo
  const onlyBqn = bqnIps.filter(ip => !odooIpCpe.has(ip) && !odooIpv4.has(ip));
  console.log(`\nEn BQN pero no en Odoo: ${onlyBqn.length}`);
  console.log(`Sample:`, onlyBqn.slice(0, 10));
}

main().catch(e => { console.error(e); process.exit(1); });
