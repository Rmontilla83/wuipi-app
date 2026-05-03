// POST /api/cobranzas/wa-test
// Endpoint admin para disparar un template del riel de Cobranzas con params
// custom y telefono destino especifico. Permite probar cada template antes
// de exponerlo a clientes reales.
//
// Body:
//   {
//     template: WATemplateName,
//     params: Record<string, string>,
//     phone: string,
//     customerName?: string,
//     forceDryRun?: boolean    // default true (seguro). Solo super_admin puede pasar false
//   }
//
// Comportamiento:
//   - Si forceDryRun=true (default): siempre dry-run aunque la env diga live
//   - Si forceDryRun=false: respeta el env COBRANZAS_WA_DRY_RUN. Solo super_admin
//
// Devuelve el id del row creado en cobranzas_wa_outbox + status del envio.

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { sendCobranzasWA, getCobranzasWAMode } from "@/lib/cobranzas/wa-cobranzas";
import { WA_TEMPLATES_COBRANZAS, type WATemplateName } from "@/lib/cobranzas/wa-templates";

interface TestBody {
  template: string;
  params: Record<string, string>;
  phone: string;
  customerName?: string;
  forceDryRun?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // Permission cobranzas:update — admin/finanzas pueden testear
    const caller = await requirePermission("cobranzas", "update");
    if (!caller) return apiError("Sin permisos", 403);

    const body: TestBody = await request.json();

    // Validacion basica
    if (!body.template) return apiError("Falta `template`", 400);
    if (!body.phone || body.phone.replace(/\D/g, "").length < 10) {
      return apiError("Telefono invalido — usar formato venezolano (04XX o 58XX)", 400);
    }
    if (!body.params || typeof body.params !== "object") {
      return apiError("`params` requerido (objeto con keys 1, 2, 3, ...)", 400);
    }

    // Validar que el template exista
    if (!WA_TEMPLATES_COBRANZAS[body.template as WATemplateName]) {
      return apiError(
        `Template "${body.template}" no existe. Validos: ${Object.keys(WA_TEMPLATES_COBRANZAS).join(", ")}`,
        400
      );
    }

    // Politica de seguridad para forzar live:
    // - Default: forceDryRun=true (no envia a Meta aunque env diga live)
    // - forceDryRun=false: requiere super_admin (proteccion contra envios accidentales)
    const dryRun = body.forceDryRun !== false;
    if (!dryRun && caller.role !== "super_admin") {
      return apiError(
        "Solo super_admin puede enviar mensajes reales (forceDryRun=false). " +
        "Pide al admin que active COBRANZAS_WA_DRY_RUN=false en Vercel para uso global.",
        403
      );
    }

    const result = await sendCobranzasWA({
      phone: body.phone,
      customerName: body.customerName || "Test",
      template: body.template as WATemplateName,
      params: body.params,
      triggerEvent: "manual_test",
      forceDryRun: dryRun,
    });

    return apiSuccess({
      result,
      current_global_mode: getCobranzasWAMode(),
      effective_dry_run: dryRun,
    });
  } catch (err) {
    return apiServerError(err);
  }
}

// GET — devuelve el catalogo de templates para que la UI llene el dropdown
// + sample params + estado del modo global. No requiere super_admin.
export async function GET() {
  try {
    const caller = await requirePermission("cobranzas", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const templates = Object.entries(WA_TEMPLATES_COBRANZAS).map(([key, def]) => {
      // Detectar cuantas variables {{N}} tiene el body
      const matches = def.body.match(/\{\{(\d+)\}\}/g) || [];
      const varNumbers = Array.from(new Set(matches.map(m => m.replace(/[{}]/g, ""))))
        .sort((a, b) => Number(a) - Number(b));

      return {
        key,
        name: def.name,
        description: def.description,
        body: def.body,
        buttons: def.buttons || [],
        variable_keys: varNumbers,
        sample_params: getSampleParams(def.body),
      };
    });

    return apiSuccess({
      templates,
      mode: getCobranzasWAMode(),
    });
  } catch (err) {
    return apiServerError(err);
  }
}

// Genera params de ejemplo razonables para que la UI los muestre como
// placeholders. NO son los samples que Meta exige al aprobar.
function getSampleParams(body: string): Record<string, string> {
  const matches = body.match(/\{\{(\d+)\}\}/g) || [];
  const nums = Array.from(new Set(matches.map(m => m.replace(/[{}]/g, ""))));
  const samples: Record<string, string> = {};
  for (const n of nums) {
    samples[n] = sampleForPosition(n);
  }
  return samples;
}

function sampleForPosition(n: string): string {
  // Heuristica simple: pos 1 suele ser nombre, ultima suele ser link, etc.
  switch (n) {
    case "1": return "Rafael";
    case "2": return "(detalle del fallo)";
    case "3": return "https://api.wuipi.net/pagar/wpy_test123";
    case "4": return "$25.00 USD";
    default: return `valor_${n}`;
  }
}
