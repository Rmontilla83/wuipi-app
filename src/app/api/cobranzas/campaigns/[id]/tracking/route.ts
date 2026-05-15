// GET /api/cobranzas/campaigns/[id]/tracking
//
// Devuelve el seguimiento agregado de una campaña: counts de notificaciones
// (WhatsApp + Email) por status. Útil para mostrar tiles en la vista detalle
// de la campaña sin tener que recorrer collection_notifications manualmente
// desde el frontend.
//
// Acceso: requiere permiso cobranzas:read (admin staff). No es endpoint
// público — un cliente no debería ver el tracking de una campaña entera.

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { createAdminSupabase } from "@/lib/supabase/server";

interface ChannelCounts {
  sent: number;
  failed: number;
  pending: number;
  total: number;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const caller = await requirePermission("cobranzas", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const campaignId = params.id;
    if (!campaignId) return apiError("campaign_id requerido", 400);

    const sb = createAdminSupabase();

    // Items por status — para tiles del breakdown
    const { data: items, error: itemsErr } = await sb
      .from("collection_items")
      .select("id, status")
      .eq("campaign_id", campaignId);
    if (itemsErr) throw itemsErr;

    const itemBreakdown = {
      pending: 0,
      sent: 0,
      viewed: 0,
      paid: 0,
      failed: 0,
      expired: 0,
      conciliating: 0,
    };
    const itemIds: string[] = [];
    for (const it of items || []) {
      const s = (it.status as keyof typeof itemBreakdown) || "pending";
      if (s in itemBreakdown) itemBreakdown[s]++;
      itemIds.push(it.id);
    }

    // Notificaciones de la campaña — agregadas por canal y status.
    // Una campaña con 100 items puede tener 100+ rows de WA y 100+ de email
    // (más reintentos), así que vale la pena agregarlas server-side.
    const channels: { whatsapp: ChannelCounts; email: ChannelCounts } = {
      whatsapp: { sent: 0, failed: 0, pending: 0, total: 0 },
      email:    { sent: 0, failed: 0, pending: 0, total: 0 },
    };
    if (itemIds.length > 0) {
      // Iterar en chunks porque .in() puede tener límite en URL si la lista es muy grande
      const CHUNK = 200;
      for (let i = 0; i < itemIds.length; i += CHUNK) {
        const chunk = itemIds.slice(i, i + CHUNK);
        const { data: notifs, error: nErr } = await sb
          .from("collection_notifications")
          .select("channel, status")
          .in("item_id", chunk);
        if (nErr) throw nErr;
        for (const n of notifs || []) {
          const ch = n.channel === "whatsapp" ? channels.whatsapp
                  : n.channel === "email" ? channels.email
                  : null;
          if (!ch) continue;
          ch.total++;
          if (n.status === "sent") ch.sent++;
          else if (n.status === "failed") ch.failed++;
          else ch.pending++;
        }
      }
    }

    return apiSuccess({
      campaign_id: campaignId,
      items_breakdown: itemBreakdown,
      total_items: items?.length || 0,
      notifications: channels,
    });
  } catch (error) {
    return apiServerError(error);
  }
}
