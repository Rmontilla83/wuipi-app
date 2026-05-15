// POST /api/cobranzas/segments/[id]/execute
//
// Ejecuta un segmento: corre el preview contra Odoo, crea una collection_campaign
// vinculada al segmento (snapshot_filters = copia de filters al momento), y
// materializa N collection_items (uno por cliente que cumple los filtros).
//
// Cada item se crea con el metadata necesario para el sync multi-factura
// (odoo_invoice_ids + odoo_invoice_amounts_usd) que ya está deployado.
//
// Body opcional:
//   {
//     name?: string,         // override del nombre de la campaña (default: segment.name + fecha)
//     description?: string,
//     scheduled_for?: string // ISO timestamp para envío programado (futuro feature)
//   }

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getSegment, findRecentlyContactedPartners, updateSegmentPreviewCache } from "@/lib/dal/collection-segments";
import { previewSegment } from "@/lib/integrations/odoo-collection-segments";
import { generateCollectionToken } from "@/lib/dal/collection-campaigns";
import { normalizeOdooVatToCedula } from "@/lib/utils/cedula";
import { read } from "@/lib/integrations/odoo";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const caller = await requirePermission("cobranzas", "create");
    if (!caller) return apiError("Sin permisos", 403);

    const segment = await getSegment(params.id);
    if (!segment) return apiError("Segmento no encontrado", 404);
    if (segment.is_archived) return apiError("Segmento archivado — desarchive antes de ejecutar", 400);

    const body = await request.json().catch(() => ({}));
    const customName = body.name ? String(body.name).trim().slice(0, 200) : null;
    const customDescription = body.description ? String(body.description).slice(0, 1000) : null;
    const scheduledFor = body.scheduled_for && typeof body.scheduled_for === "string"
      ? new Date(body.scheduled_for).toISOString()
      : null;

    // 1. Anti-spam: traer partners contactados recientemente
    const excludeRecent = segment.exclude_recent_days > 0
      ? await findRecentlyContactedPartners(segment.exclude_recent_days)
      : [];

    // 2. Ejecutar preview con sample grande para tener TODOS los clientes
    //    (sample=0 sería ideal pero forzamos un máximo razonable)
    const result = await previewSegment({
      filters: segment.filters,
      excludePartnerIdsFromRecent: excludeRecent,
      sampleSize: 1,  // no necesitamos sample, usamos partner_ids para iterar
    });

    if (result.count === 0) {
      return apiError("0 clientes cumplen los filtros del segmento — ajusta o agrega anti-spam", 400);
    }

    // 3. Re-fetch los datos completos de cada cliente que cumple
    //    (el preview devuelve sample, necesitamos TODOS los partner_ids)
    //    Estrategia: para cada partner_id en result.partner_ids, traer:
    //    - partner data desde Odoo (name, email, phone, vat, is_company)
    //    - sus drafts pendientes con amounts (ya las agrupó el preview en sample)
    //
    //    Optimización: el preview YA tiene sample pero solo de los primeros 20.
    //    Para los demás, ejecutamos OTRA vez previewSegment con sampleSize alto
    //    para obtener todo en un solo barrido.
    const fullResult = await previewSegment({
      filters: segment.filters,
      excludePartnerIdsFromRecent: excludeRecent,
      sampleSize: result.count,  // queremos todos
    });

    // 4. Lookup de partners en Odoo para obtener is_company (necesario para
    //    normalizeOdooVatToCedula). Aprovechamos batch.
    const partnerMap = new Map<number, { is_company: boolean }>();
    if (fullResult.sample.length > 0) {
      const partnerIds = fullResult.sample.map((c) => c.odoo_partner_id);
      const partners = await read("res.partner", partnerIds, ["is_company"]);
      for (const p of partners) {
        partnerMap.set(p.id, { is_company: !!p.is_company });
      }
    }

    // 5. Crear la campaña
    const sb = createAdminSupabase();
    const campaignName = customName || `${segment.name} — ${new Date().toISOString().split("T")[0]}`;
    const { data: campaign, error: cErr } = await sb
      .from("collection_campaigns")
      .insert({
        name: campaignName,
        description: customDescription || `Generada desde segmento "${segment.name}" — ${fullResult.count} clientes`,
        segment_id: segment.id,
        snapshot_filters: segment.filters,
        executed_at: new Date().toISOString(),
        scheduled_for: scheduledFor,
        // Siempre "draft" al crear desde un segmento. La campaña pasa a
        // "sending" cuando /api/cobranzas/send empieza a procesar batches,
        // y a "active" cuando termina. Estaba quedando "active" sin haber
        // enviado nada, lo que hacía pensar al user que el envío ya ocurrió.
        status: "draft",
        created_by: caller.id,
      })
      .select()
      .single();
    if (cErr) throw cErr;

    // 6. Materializar items — uno por cliente
    const itemsToInsert = fullResult.sample.map((c) => {
      const isCompany = partnerMap.get(c.odoo_partner_id)?.is_company ?? false;
      const cedula = normalizeOdooVatToCedula(c.customer_cedula_rif, isCompany, c.odoo_partner_id);
      const invoiceIds = c.invoices.map((i) => i.id);
      const amountsMap: Record<number, number> = {};
      for (const inv of c.invoices) {
        amountsMap[inv.id] = inv.amount_total_usd;
      }
      return {
        campaign_id: campaign.id,
        payment_token: generateCollectionToken(),
        customer_name: c.customer_name,
        customer_cedula_rif: cedula,
        customer_email: c.customer_email || null,
        customer_phone: c.customer_phone || null,
        amount_usd: c.total_due_usd,
        status: "pending",
        metadata: {
          odoo_partner_id: c.odoo_partner_id,
          odoo_invoice_ids: invoiceIds,
          odoo_invoice_amounts_usd: amountsMap,
          odoo_invoices: c.invoices.map((inv) => ({
            number: inv.invoice_number,
            due_date: inv.due_date,
            total: inv.amount_total_usd,
            amount_due: inv.amount_total_usd,
            currency: "USD",
            // products: [] explícito para que la página de pago no crashee
            // con "Cannot read properties of undefined (reading 'length')"
            // al intentar inv.products.length. El flow de segmentos no trae
            // detalle de líneas (sería un Odoo round-trip por factura).
            products: [],
            billed_month: inv.billed_month,
            subscription_id: inv.subscription_id,
          })),
          draft_total_all: c.invoices.reduce((s, i) => s + i.amount_total_usd, 0),
          is_pay_all: true,
          source: "segment",
          segment_id: segment.id,
        },
      };
    });

    // Insert en batches de 100 para no exceder límites de payload
    const BATCH = 100;
    for (let i = 0; i < itemsToInsert.length; i += BATCH) {
      const chunk = itemsToInsert.slice(i, i + BATCH);
      const { error: iErr } = await sb.from("collection_items").insert(chunk);
      if (iErr) {
        // Rollback: borrar items + campaña creados
        await sb.from("collection_items").delete().eq("campaign_id", campaign.id);
        await sb.from("collection_campaigns").delete().eq("id", campaign.id);
        throw iErr;
      }
    }

    // 7. Actualizar totales de la campaña + cache del segmento
    const totalAmount = itemsToInsert.reduce((s, i) => s + i.amount_usd, 0);
    await sb.from("collection_campaigns")
      .update({
        total_items: itemsToInsert.length,
        total_amount_usd: Math.round(totalAmount * 100) / 100,
      })
      .eq("id", campaign.id);

    await updateSegmentPreviewCache(segment.id, fullResult.count, fullResult.total_usd)
      .catch((err) => console.error("[segments/execute] cache update fallo:", err));

    return apiSuccess({
      campaign_id: campaign.id,
      campaign_name: campaignName,
      items_created: itemsToInsert.length,
      total_usd: Math.round(totalAmount * 100) / 100,
      excluded_recent_count: result.excluded_recent_count,
    });
  } catch (error) {
    return apiServerError(error);
  }
}
