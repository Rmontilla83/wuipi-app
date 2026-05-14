// GET /api/admin/odoo/journal-info?code=BNK8
//
// Devuelve la info de un journal Odoo por código (o ID), incluyendo las
// payment_method_lines inbound disponibles. Util para auditar/sincronizar
// los IDs del PAYMENT_METHOD_MAPPING contra Odoo prod.
//
// Permisos: cobranzas:read (super_admin/admin/finanzas/gerente).
//
// Query params (mutually exclusive):
//   ?code=BNK8        — buscar journal por código
//   ?id=41            — buscar journal por ID exacto
//   (sin params)      — lista todos los journals Bank/Cash

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { searchRead } from "@/lib/integrations/odoo";

export async function GET(request: NextRequest) {
  try {
    const caller = await requirePermission("cobranzas", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const idParam = searchParams.get("id");

    // 1. Buscar el/los journal(s)
    const journalDomain: Array<[string, string, string | number | string[]]> = [];
    if (code) {
      journalDomain.push(["code", "=", code]);
    } else if (idParam) {
      journalDomain.push(["id", "=", parseInt(idParam, 10)]);
    } else {
      journalDomain.push(["type", "in", ["bank", "cash"]]);
    }

    const journals = await searchRead("account.journal", journalDomain, {
      fields: [
        "id", "name", "code", "type", "currency_id", "default_account_id",
        "inbound_payment_method_line_ids", "outbound_payment_method_line_ids",
      ],
      limit: 50,
    });

    if (!journals.length) {
      return apiSuccess({
        found: false,
        message: code ? `No se encontró journal con code='${code}'`
                       : idParam ? `No se encontró journal con id=${idParam}`
                                 : "No hay journals bank/cash",
      });
    }

    // 2. Para cada journal, hacer un read completo de las payment_method_lines
    const journalsWithLines = await Promise.all(
      journals.map(async (j) => {
        const inboundLineIds: number[] = Array.isArray(j.inbound_payment_method_line_ids)
          ? j.inbound_payment_method_line_ids : [];
        const outboundLineIds: number[] = Array.isArray(j.outbound_payment_method_line_ids)
          ? j.outbound_payment_method_line_ids : [];
        const allIds = [...inboundLineIds, ...outboundLineIds];
        const lines = allIds.length > 0
          ? await searchRead(
              "account.payment.method.line",
              [["id", "in", allIds]],
              { fields: ["id", "name", "payment_method_id", "payment_account_id", "code", "sequence"] }
            )
          : [];
        return {
          id: j.id,
          name: j.name,
          code: j.code,
          type: j.type,
          currency: j.currency_id, // [id, name]
          default_account: j.default_account_id,
          inbound_lines: lines.filter(l => inboundLineIds.includes(l.id))
            .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)),
          outbound_lines: lines.filter(l => outboundLineIds.includes(l.id))
            .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)),
        };
      })
    );

    return apiSuccess({
      found: true,
      count: journalsWithLines.length,
      journals: journalsWithLines,
    });
  } catch (err) {
    return apiServerError(err);
  }
}
