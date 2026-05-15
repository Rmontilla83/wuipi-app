// ============================================================
// DAL — Collection Segments (smart lists para campañas dirigidas)
// ============================================================
//
// Un segmento es un conjunto de filtros JSON guardados que pueden ejecutarse
// repetidamente para generar campañas. La ejecución (preview o snapshot) se
// resuelve contra Odoo en vivo via odoo-collection-segments.ts.

import { createAdminSupabase } from "@/lib/supabase/server";
import type { SegmentFilters } from "@/lib/integrations/odoo-collection-segments";

export interface CollectionSegment {
  id: string;
  name: string;
  description: string | null;
  filters: SegmentFilters;
  exclude_recent_days: number;
  preview_count: number | null;
  preview_total_usd: number | null;
  preview_updated_at: string | null;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function listSegments(opts?: { includeArchived?: boolean }): Promise<CollectionSegment[]> {
  const sb = createAdminSupabase();
  let q = sb.from("collection_segments").select("*").order("created_at", { ascending: false });
  if (!opts?.includeArchived) q = q.eq("is_archived", false);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as CollectionSegment[];
}

export async function getSegment(id: string): Promise<CollectionSegment | null> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("collection_segments")
    .select("*")
    .eq("id", id)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as CollectionSegment) || null;
}

export async function createSegment(input: {
  name: string;
  description?: string | null;
  filters: SegmentFilters;
  exclude_recent_days?: number;
  created_by?: string | null;
}): Promise<CollectionSegment> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("collection_segments")
    .insert({
      name: input.name,
      description: input.description ?? null,
      filters: input.filters || {},
      exclude_recent_days: input.exclude_recent_days ?? 0,
      created_by: input.created_by ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CollectionSegment;
}

export async function updateSegment(
  id: string,
  updates: Partial<Pick<CollectionSegment, "name" | "description" | "filters" | "exclude_recent_days" | "is_archived">>
): Promise<CollectionSegment> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("collection_segments")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as CollectionSegment;
}

export async function archiveSegment(id: string): Promise<void> {
  await updateSegment(id, { is_archived: true });
}

export async function deleteSegment(id: string): Promise<void> {
  const sb = createAdminSupabase();
  // Hard delete — segment.id en collection_campaigns tiene ON DELETE SET NULL,
  // así que las campañas previas mantienen su snapshot_filters como audit.
  const { error } = await sb.from("collection_segments").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Actualiza el cache de preview. Se llama después de ejecutar el preview
 * exitosamente para que la lista de segmentos muestre el count actualizado
 * sin pegarle a Odoo en cada render.
 */
export async function updateSegmentPreviewCache(
  id: string,
  count: number,
  totalUsd: number,
): Promise<void> {
  const sb = createAdminSupabase();
  const { error } = await sb
    .from("collection_segments")
    .update({
      preview_count: count,
      preview_total_usd: totalUsd,
      preview_updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Resuelve qué partners fueron contactados vía collection_items en los
 * últimos N días. Usado para anti-spam (`exclude_recent_days` del segmento).
 *
 * Devuelve los `metadata.odoo_partner_id` de items creados después del cutoff,
 * sin importar el status (incluso pending/sent/viewed cuentan como "contactados").
 */
export async function findRecentlyContactedPartners(daysAgo: number): Promise<number[]> {
  if (daysAgo <= 0) return [];
  const sb = createAdminSupabase();
  const cutoff = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("collection_items")
    .select("metadata")
    .gte("created_at", cutoff)
    .not("metadata->odoo_partner_id", "is", null);
  if (error) throw error;
  const partnerIds = new Set<number>();
  for (const row of data || []) {
    const meta = row.metadata as Record<string, unknown> | null;
    const pid = meta?.odoo_partner_id;
    if (typeof pid === "number" && Number.isInteger(pid) && pid > 0) {
      partnerIds.add(pid);
    } else if (typeof pid === "string") {
      const n = Number(pid);
      if (Number.isInteger(n) && n > 0) partnerIds.add(n);
    }
  }
  return Array.from(partnerIds);
}
