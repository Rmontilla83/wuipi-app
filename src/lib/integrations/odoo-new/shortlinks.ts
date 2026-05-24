// ============================================================
// wuipi.campaign.shortlink — resolver de shortlinks de campaña
// generados por el módulo wuipi_campaigns en Odoo.
// ============================================================

import { searchRead, write } from "./client";
import { m2oId, m2oName } from "./mappers";

export interface OdooShortlink {
  id: number;
  code: string;
  jwtToken: string;
  partnerId: number;
  partnerName: string;
  expiresAt: string | null;
  accessedAt: string | null;
  accessCount: number;
}

interface ShortlinkRaw {
  id: number;
  code: string;
  jwt_token: string | false;
  partner_id: [number, string] | false;
  expires_at: string | false;
  accessed_at: string | false;
  access_count: number;
}

const SHORTLINK_FIELDS = [
  "id",
  "code",
  "jwt_token",
  "partner_id",
  "expires_at",
  "accessed_at",
  "access_count",
] as const;

function toDomain(raw: ShortlinkRaw): OdooShortlink | null {
  if (!raw.jwt_token || typeof raw.jwt_token !== "string") return null;
  return {
    id: raw.id,
    code: raw.code,
    jwtToken: raw.jwt_token,
    partnerId: m2oId(raw.partner_id) ?? 0,
    partnerName: m2oName(raw.partner_id) ?? "",
    expiresAt: typeof raw.expires_at === "string" ? raw.expires_at : null,
    accessedAt: typeof raw.accessed_at === "string" ? raw.accessed_at : null,
    accessCount: raw.access_count ?? 0,
  };
}

/**
 * Busca un shortlink por su code (8 chars alfanumérico).
 * Retorna null si no existe, no tiene JWT, o ya expiró.
 *
 * Nota: la expiración real la valida el verifyShortlinkJWT (lee el `exp`
 * del JWT firmado). Pero acá filtramos por `expires_at` del modelo Odoo
 * como pre-filtro de defensa en profundidad.
 */
export async function resolveShortlinkByCode(code: string): Promise<OdooShortlink | null> {
  if (!code || typeof code !== "string") return null;

  const rows = await searchRead<ShortlinkRaw>(
    "wuipi.campaign.shortlink",
    [["code", "=", code]],
    { fields: [...SHORTLINK_FIELDS], limit: 1 },
  );
  if (rows.length === 0) return null;
  return toDomain(rows[0]);
}

/**
 * Marca un shortlink como accedido. Best-effort: si el user de
 * integraciones no tiene permiso `write` en wuipi.campaign.shortlink,
 * loggea el error y sigue (no bloquea el flujo de pago).
 *
 * Para que esto funcione hay que otorgar al grupo "Integraciones API"
 * permiso de escritura en wuipi.campaign.shortlink. Sin ese permiso,
 * Odoo no va a registrar accessed_at/access_count desde este lado —
 * el flujo de pago igual funciona.
 */
export async function markShortlinkAccessed(id: number): Promise<void> {
  try {
    await write("wuipi.campaign.shortlink", [id], {
      accessed_at: new Date().toISOString().replace("T", " ").slice(0, 19),
      // No incrementamos access_count desde el cliente — Odoo lo
      // recomputa internamente o lo dejamos en 0 hasta que tengan
      // un compute. Si querés tracking exacto del lado app, ver
      // logs en payment_gateway_logs (Supabase).
    });
  } catch (err) {
    // Esperado si no hay permiso write — no logueamos como error
    // crítico para no llenar Vercel logs con ruido.
    console.warn("[shortlinks] markShortlinkAccessed skipped:", err instanceof Error ? err.message : String(err));
  }
}
