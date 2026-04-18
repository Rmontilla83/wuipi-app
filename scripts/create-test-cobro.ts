/**
 * Crea un item de cobro de prueba para testear transfer-search en producción.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/create-test-cobro.ts
 *
 * Crea (si no existe) una campaña "Test Transfer Search" y le agrega un item
 * para Rafael Eduardo Montilla Olivares (partner_id=27804) por $0.01 USD
 * (~Bs 1,xx según BCV del día).
 *
 * Output: URL del portal de pago lista para probar.
 */
import { createAdminSupabase } from "../src/lib/supabase/server";
import {
  createCampaign,
  createItems,
} from "../src/lib/dal/collection-campaigns";

const TEST_CAMPAIGN_NAME = "Test Transfer Search (auto-verification)";

// Rafael Eduardo Montilla Olivares — confirmed in Odoo (id=27804)
const CUSTOMER = {
  name: "Rafael Eduardo Montilla Olivares",
  cedula_rif: "V-16006905",
  email: "rafaelmontilla8@gmail.com",
  phone: "58 424-8672759",
};

const AMOUNT_USD = 0.01;  // ~Bs 1,xx al BCV del día
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://api.wuipi.net";

async function findOrCreateCampaign(): Promise<string> {
  const sb = createAdminSupabase();
  const { data } = await sb
    .from("collection_campaigns")
    .select("id, name")
    .eq("name", TEST_CAMPAIGN_NAME)
    .limit(1);

  if (data && data.length > 0) {
    console.log(`  → Reusando campaña existente: ${data[0].id}`);
    return data[0].id;
  }

  const campaign = await createCampaign({
    name: TEST_CAMPAIGN_NAME,
    description: "Campaña automatica para probar el flujo de verificacion de transferencias via Mercantil transfer-search",
  });
  console.log(`  → Campaña nueva creada: ${campaign.id}`);
  return campaign.id;
}

async function main() {
  console.log("\n🧪 Creando item de cobro de prueba\n");

  console.log("1. Campaña");
  const campaignId = await findOrCreateCampaign();

  console.log("\n2. Cliente");
  console.log(`  name=${CUSTOMER.name}`);
  console.log(`  cedula=${CUSTOMER.cedula_rif}  email=${CUSTOMER.email}`);

  console.log("\n3. Creando item...");
  const [item] = await createItems(campaignId, [{
    customer_name: CUSTOMER.name,
    customer_cedula_rif: CUSTOMER.cedula_rif,
    customer_email: CUSTOMER.email,
    customer_phone: CUSTOMER.phone,
    concept: "Prueba transfer-search producción",
    amount_usd: AMOUNT_USD,
  }]);

  console.log(`  id=${item.id}`);
  console.log(`  token=${item.payment_token}`);
  console.log(`  amount=$${AMOUNT_USD} USD`);

  const url = `${APP_URL}/pagar/${item.payment_token}`;
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Item listo. Abrí esta URL en el browser para probar:\n");
  console.log(`   ${url}\n`);
  console.log("Pasos del test:");
  console.log("  1. Seleccionar 'Transferencia bancaria'");
  console.log("  2. Hacer la transferencia real desde tu app bancaria");
  console.log("     - Cuenta: 01050745651745103031 (Wuipi / Mercantil)");
  console.log("     - Monto: el monto EXACTO en Bs que muestra la página");
  console.log("  3. Volver al portal:");
  console.log("     - Seleccionar TU BANCO origen del dropdown");
  console.log("     - Pegar la referencia bancaria");
  console.log("     - Click 'Confirmar transferencia'");
  console.log("  4. Resultado esperado:");
  console.log("     ✅ Match   → pantalla verde + 'Tu transferencia fue verificada'");
  console.log("     ⏳ No match → pantalla ámbar 'en proceso de verificación'");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch((e) => { console.error("\n❌ Error:", e); process.exit(1); });
