/**
 * Busca un cliente en Odoo por nombre/email/cedula para preparar tests.
 * Uso: npx tsx --env-file=.env.local scripts/find-test-customer.ts "rafael eduardo montilla"
 */
import { searchRead } from "../src/lib/integrations/odoo";

interface Partner {
  id: number;
  name: string;
  email?: string | false;
  mobile?: string | false;
  phone?: string | false;
  vat?: string | false;
  city?: string | false;
  customer_rank?: number;
  total_due?: number;
  credit?: number;
}

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error("Uso: npx tsx ... find-test-customer.ts \"nombre o cedula o email\"");
    process.exit(1);
  }

  console.log(`\nBuscando en Odoo: "${query}"\n`);

  const results = await searchRead("res.partner", [
    "|", "|",
    ["name", "ilike", query],
    ["email", "ilike", query],
    ["vat", "ilike", query.replace(/\s/g, "")],
  ], {
    fields: ["id", "name", "email", "mobile", "phone", "vat", "city", "customer_rank", "total_due", "credit"],
    limit: 20,
  }) as Partner[];

  if (results.length === 0) {
    console.log("❌ Sin matches");
    return;
  }

  console.log(`✅ ${results.length} match(es):\n`);
  for (const p of results) {
    console.log(`  id=${p.id}  rank=${p.customer_rank || 0}`);
    console.log(`  name=${p.name}`);
    console.log(`  vat=${p.vat || "-"}`);
    console.log(`  mobile=${p.mobile || "-"}  email=${p.email || "-"}`);
    console.log(`  city=${p.city || "-"}  total_due=$${p.total_due || 0}`);
    console.log("");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
