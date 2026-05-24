// GET /api/cobranzas/bcv?amount=X
// Devuelve la tasa BCV USD→VED y el monto convertido.
//
// Fuente de la tasa: res.currency.inverse_rate del USD en Odoo nuevo.
// El módulo wuipi_l10n_ve_bcv actualiza esa tasa automáticamente desde
// el BCV venezolano. Usar la misma tasa que Odoo garantiza consistencia:
// el monto en Bs que ve el cliente es exactamente el mismo que Odoo
// usa al postear la factura (sin discrepancia por servicios distintos).

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { read } from "@/lib/integrations/odoo-new/client";
import { CURRENCY_IDS } from "@/lib/integrations/odoo-new/config";

export const dynamic = "force-dynamic";

// Cache simple en memoria (proceso) para no consultar Odoo en cada
// page load. La tasa cambia ~1 vez al día (BCV publica mañana).
let cached: { usd_to_bs: number; fetched_at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

interface USDCurrencyRaw {
  id: number;
  name: string;
  inverse_rate: number;
  active: boolean;
}

async function fetchOdooBCVRate(): Promise<number> {
  const now = Date.now();
  if (cached && now - cached.fetched_at < CACHE_TTL_MS) {
    return cached.usd_to_bs;
  }
  const rows = await read<USDCurrencyRaw>(
    "res.currency",
    [CURRENCY_IDS.USD],
    ["id", "name", "inverse_rate", "active"],
  );
  const usd = rows[0];
  if (!usd || typeof usd.inverse_rate !== "number" || usd.inverse_rate <= 0) {
    throw new Error("No se pudo obtener la tasa USD→Bs de Odoo");
  }
  cached = { usd_to_bs: usd.inverse_rate, fetched_at: now };
  return usd.inverse_rate;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawAmount = searchParams.get("amount") || "0";
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      return apiError("Monto inválido", 400);
    }

    const usd_to_bs = await fetchOdooBCVRate();
    const amount_bss = Math.round(amount * usd_to_bs * 100) / 100;

    return apiSuccess({
      usd_to_bs,
      amount_bss,
      source: "odoo:res.currency.inverse_rate",
    });
  } catch (error) {
    return apiServerError(error);
  }
}
