// ============================================
// Briefing Cache — Supabase-backed
// ============================================
// Avoids regenerating the dual-engine briefing on every request.
// TTL: 1 hour (configurable). Cache is refreshed by the daily cron
// or by explicit ?force=true from the UI.
// ============================================

import { createAdminSupabase } from "@/lib/supabase/server";

const BRIEFING_CACHE_TTL_MINUTES = 60;

interface CachedBriefing {
  briefing: any;
  raw_data: any;
  generated_at: string;
  engine_info: any;
}

export async function getCachedBriefing(): Promise<CachedBriefing | null> {
  const supabase = createAdminSupabase();

  const { data, error } = await supabase
    .from("supervisor_briefing_cache")
    .select("briefing, raw_data, generated_at, engine_info")
    .eq("id", "latest")
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !data) return null;

  return {
    briefing: data.briefing,
    raw_data: data.raw_data,
    generated_at: data.generated_at,
    engine_info: data.engine_info,
  };
}

export async function saveBriefingToCache(
  briefing: any,
  rawData: any,
  engineInfo: any,
): Promise<void> {
  const supabase = createAdminSupabase();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + BRIEFING_CACHE_TTL_MINUTES * 60 * 1000);

  await supabase.from("supervisor_briefing_cache").upsert({
    id: "latest",
    briefing,
    raw_data: rawData,
    generated_at: now.toISOString(),
    engine_info: engineInfo,
    expires_at: expiresAt.toISOString(),
  });
}

export async function invalidateCache(): Promise<void> {
  const supabase = createAdminSupabase();

  await supabase
    .from("supervisor_briefing_cache")
    .update({ expires_at: new Date().toISOString() })
    .eq("id", "latest");
}

export async function isCacheRecent(minutes: number): Promise<CachedBriefing | null> {
  const supabase = createAdminSupabase();
  const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("supervisor_briefing_cache")
    .select("briefing, raw_data, generated_at, engine_info")
    .eq("id", "latest")
    .gt("generated_at", cutoff)
    .single();

  if (error || !data) return null;

  return {
    briefing: data.briefing,
    raw_data: data.raw_data,
    generated_at: data.generated_at,
    engine_info: data.engine_info,
  };
}
