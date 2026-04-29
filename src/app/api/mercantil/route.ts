// POST /api/mercantil — alias del webhook que Mercantil esta enviando sin /webhook.
//
// Mercantil registro la URL como `/api/mercantil` (sin sufijo) y manda los
// payloads de notificacion ahi. La ruta canonica del handler es
// `/api/mercantil/webhook` — para no duplicar logica de descifrado +
// idempotencia + auditoria, este alias delega al mismo POST.
//
// Es publica en middleware (exact match, NO startsWith — para no exponer
// /api/mercantil/reconcile ni /api/mercantil/create-payment).

import type { NextRequest } from "next/server";
import { POST as webhookPOST } from "./webhook/route";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return webhookPOST(request);
}
