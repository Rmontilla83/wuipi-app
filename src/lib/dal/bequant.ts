// ============================================
// DAL — Bequant Config + Sync tables
// ============================================

import { createAdminSupabase } from "@/lib/supabase/server";
import { encryptPassword } from "@/lib/utils/crypto";
import { searchRead } from "@/lib/integrations/odoo";
import type {
  BequantConfigRow, BequantConfigInput,
  BequantSubscriber, BequantSubscriberGroup, BequantRatePolicy,
  BequantSubscriberRow, BequantSubscriberGroupRow, BequantPolicyRow,
  BequantNodeSnapshotRow, BequantNodeSnapshot,
  BequantMonthlyDpiRow,
} from "@/types/bequant";

// ══════════════════════════════════════════════
// Config CRUD
// ══════════════════════════════════════════════

export async function getBequantConfigs(): Promise<BequantConfigRow[]> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("bequant_config")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Error al obtener configs: ${error.message}`);
  return (data || []) as BequantConfigRow[];
}

export async function getBequantConfig(id: string): Promise<BequantConfigRow | null> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("bequant_config").select("*").eq("id", id).single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Error al obtener config: ${error.message}`);
  }
  return data as BequantConfigRow;
}

export async function getActiveBequantConfig(): Promise<BequantConfigRow | null> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("bequant_config").select("*").eq("enabled", true).limit(1).single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Error al obtener config activa: ${error.message}`);
  }
  return data as BequantConfigRow;
}

export async function saveBequantConfig(
  input: BequantConfigInput,
  userId?: string,
  existingId?: string
): Promise<BequantConfigRow> {
  const supabase = createAdminSupabase();
  const row = {
    label: input.label,
    host: input.host,
    port: input.port ?? 7343,
    username: input.username,
    encrypted_password: encryptPassword(input.password),
    ssl_verify: input.ssl_verify ?? false,
    enabled: input.enabled ?? true,
    notes: input.notes || null,
    ...(userId ? { created_by: userId } : {}),
  };

  if (existingId) {
    const { data, error } = await supabase
      .from("bequant_config").update(row).eq("id", existingId).select().single();
    if (error) throw new Error(`Error al actualizar config: ${error.message}`);
    return data as BequantConfigRow;
  }

  const { data, error } = await supabase
    .from("bequant_config").insert(row).select().single();
  if (error) throw new Error(`Error al crear config: ${error.message}`);
  return data as BequantConfigRow;
}

export async function updateBequantConfigPartial(
  id: string,
  fields: Partial<Omit<BequantConfigInput, "password" | "notes">> & { password?: string; notes?: string | null }
): Promise<BequantConfigRow> {
  const supabase = createAdminSupabase();
  const row: Record<string, unknown> = {};
  if (fields.label !== undefined) row.label = fields.label;
  if (fields.host !== undefined) row.host = fields.host;
  if (fields.port !== undefined) row.port = fields.port;
  if (fields.username !== undefined) row.username = fields.username;
  if (fields.ssl_verify !== undefined) row.ssl_verify = fields.ssl_verify;
  if (fields.enabled !== undefined) row.enabled = fields.enabled;
  if (fields.notes !== undefined) row.notes = fields.notes || null;
  if (fields.password) row.encrypted_password = encryptPassword(fields.password);

  const { data, error } = await supabase
    .from("bequant_config").update(row).eq("id", id).select().single();
  if (error) throw new Error(`Error al actualizar config: ${error.message}`);
  return data as BequantConfigRow;
}

export async function deleteBequantConfig(id: string): Promise<void> {
  const supabase = createAdminSupabase();
  const { error } = await supabase.from("bequant_config").delete().eq("id", id);
  if (error) throw new Error(`Error al eliminar config: ${error.message}`);
}

export async function updateTestResult(
  id: string, status: "success" | "error", message: string
): Promise<void> {
  const supabase = createAdminSupabase();
  const { error } = await supabase.from("bequant_config").update({
    last_test_at: new Date().toISOString(),
    last_test_status: status,
    last_test_message: message,
  }).eq("id", id);
  if (error) throw new Error(`Error al actualizar test: ${error.message}`);
}

// ══════════════════════════════════════════════
// Sync tables — READ
// ══════════════════════════════════════════════

export interface ListSubscribersOptions {
  limit?: number;
  offset?: number;
  group?: string;
  policyRate?: string;
  odooMatch?: "yes" | "no" | "all";
  search?: string;
}

export async function listSyncedSubscribers(opts: ListSubscribersOptions = {}): Promise<{
  rows: BequantSubscriberRow[];
  total: number;
}> {
  const supabase = createAdminSupabase();
  let q = supabase.from("bequant_subscribers").select("*", { count: "exact" });

  if (opts.group) q = q.contains("subscriber_groups", [opts.group]);
  if (opts.policyRate) q = q.eq("policy_rate", opts.policyRate);
  if (opts.odooMatch === "yes") q = q.not("odoo_partner_id", "is", null);
  if (opts.odooMatch === "no") q = q.is("odoo_partner_id", null);
  if (opts.search) {
    q = q.or(`ip.ilike.%${opts.search}%,odoo_partner_name.ilike.%${opts.search}%`);
  }

  q = q.order("last_synced_at", { ascending: false })
       .range(opts.offset || 0, (opts.offset || 0) + (opts.limit || 50) - 1);

  const { data, count, error } = await q;
  if (error) throw new Error(`Error listando subs: ${error.message}`);
  return { rows: (data || []) as BequantSubscriberRow[], total: count || 0 };
}

export async function getSyncedSubscriber(ip: string): Promise<BequantSubscriberRow | null> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("bequant_subscribers").select("*").eq("ip", ip).single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Error obteniendo sub: ${error.message}`);
  }
  return data as BequantSubscriberRow;
}

export async function listSyncedGroups(): Promise<BequantSubscriberGroupRow[]> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("bequant_subscriber_groups").select("*").order("name");
  if (error) throw new Error(`Error listando grupos: ${error.message}`);
  return (data || []) as BequantSubscriberGroupRow[];
}

export async function listPolicies(): Promise<BequantPolicyRow[]> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("bequant_policies").select("*").order("name");
  if (error) throw new Error(`Error listando políticas: ${error.message}`);
  return (data || []) as BequantPolicyRow[];
}

export async function getLatestSnapshot(): Promise<BequantNodeSnapshotRow | null> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("bequant_node_snapshots")
    .select("*")
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Error snapshot: ${error.message}`);
  return data as BequantNodeSnapshotRow | null;
}

export async function getSnapshotsSince(since: Date): Promise<BequantNodeSnapshotRow[]> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("bequant_node_snapshots").select("*")
    .gte("taken_at", since.toISOString())
    .order("taken_at", { ascending: true });
  if (error) throw new Error(`Error snapshots: ${error.message}`);
  return (data || []) as BequantNodeSnapshotRow[];
}

// ══════════════════════════════════════════════
// Sync tables — WRITE (used by crons)
// ══════════════════════════════════════════════

interface OdooServiceMini {
  id: number;
  name: string;
  ip_cpe: string;
  ipv4: string | [number, string];
  partner_id: [number, string] | false;
  state: string;
  product_id: [number, string] | false;
  node_id: [number, string] | false;
}

/** Pull Odoo mikrotik.service and build IP → enrichment map. */
export async function fetchOdooEnrichmentMap(): Promise<Map<string, OdooServiceMini>> {
  const services = await searchRead(
    "mikrotik.service",
    [["state", "in", ["progress", "suspended", "draft"]]],
    {
      fields: ["id", "name", "ip_cpe", "ipv4", "partner_id", "state", "product_id", "node_id"],
      limit: 10000,
    }
  );

  const map = new Map<string, OdooServiceMini>();
  for (const s of services as OdooServiceMini[]) {
    if (s.ip_cpe) map.set(s.ip_cpe.trim(), s);
    const ipv4 = Array.isArray(s.ipv4) ? s.ipv4[1] : s.ipv4;
    if (typeof ipv4 === "string" && ipv4) {
      if (!map.has(ipv4.trim())) map.set(ipv4.trim(), s);
    }
  }
  return map;
}

/** Upsert synced subscribers in batches of 500. */
export async function upsertSyncedSubscribers(
  subs: BequantSubscriber[],
  odooMap: Map<string, OdooServiceMini>
): Promise<{ upserted: number; matched: number }> {
  const supabase = createAdminSupabase();
  const now = new Date().toISOString();
  let matched = 0;

  const rows = subs.map(s => {
    const enrich = odooMap.get(s.subscriberIp);
    if (enrich) matched++;
    const ipv4 = Array.isArray(enrich?.ipv4) ? enrich?.ipv4[1] : enrich?.ipv4;
    return {
      ip: s.subscriberIp,
      subscriber_id: s.subscriberId || null,
      policy_rate: s.policyRate || null,
      policy_assigned_by: s.policyAssignedBy || null,
      subscriber_groups: s.subscriberGroups || [],
      odoo_partner_id: enrich?.partner_id ? enrich.partner_id[0] : null,
      odoo_service_id: enrich?.id || null,
      odoo_partner_name: enrich?.partner_id ? enrich.partner_id[1] : null,
      odoo_service_state: enrich?.state || null,
      odoo_product_name: enrich?.product_id ? enrich.product_id[1] : null,
      odoo_node_name: enrich?.node_id ? enrich.node_id[1] : null,
      odoo_ip_cpe: enrich?.ip_cpe || null,
      odoo_ipv4: typeof ipv4 === "string" ? ipv4 : null,
      last_synced_at: now,
    };
  });

  let upserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("bequant_subscribers").upsert(chunk, { onConflict: "ip" });
    if (error) throw new Error(`Error upsert subs [${i}..${i + chunk.length}]: ${error.message}`);
    upserted += chunk.length;
  }
  return { upserted, matched };
}

export async function upsertSyncedGroups(groups: BequantSubscriberGroup[]): Promise<number> {
  const supabase = createAdminSupabase();
  const now = new Date().toISOString();
  const rows = groups.map(g => ({
    name: g.subscriberGroupName,
    group_type: g.subscriberGroupType,
    ranges: g.subscriberRanges || [],
    client_count: g.subscriberAll?.length || 0,
    last_synced_at: now,
  }));
  const { error } = await supabase
    .from("bequant_subscriber_groups").upsert(rows, { onConflict: "name" });
  if (error) throw new Error(`Error upsert groups: ${error.message}`);
  return rows.length;
}

export async function upsertSyncedPolicies(policies: BequantRatePolicy[]): Promise<number> {
  const supabase = createAdminSupabase();
  const now = new Date().toISOString();
  const rows = policies.map(p => ({
    name: p.policyName,
    policy_id: p.policyId,
    rate_dl: p.rateLimitDownlink.rate,
    rate_ul: p.rateLimitUplink.rate,
    burst_rate_dl: p.rateLimitDownlink.burstRate,
    burst_rate_ul: p.rateLimitUplink.burstRate,
    burst_threshold_dl: p.rateLimitDownlink.burstThreshold,
    burst_threshold_ul: p.rateLimitUplink.burstThreshold,
    congestion_mgmt: p.rateLimitDownlink.congestionMgmt ?? false,
    last_synced_at: now,
  }));
  const { error } = await supabase
    .from("bequant_policies").upsert(rows, { onConflict: "name" });
  if (error) throw new Error(`Error upsert policies: ${error.message}`);
  return rows.length;
}

export async function insertNodeSnapshot(snap: BequantNodeSnapshot): Promise<void> {
  const supabase = createAdminSupabase();
  const { error } = await supabase.from("bequant_node_snapshots").insert({
    taken_at: new Date(snap.takenAt).toISOString(),
    volume_dl: snap.volumeDl,
    volume_ul: snap.volumeUl,
    latency_dl: snap.latencyDl,
    latency_ul: snap.latencyUl,
    congestion: snap.congestion,
    retransmission_dl: snap.retransmissionDl,
    retransmission_ul: snap.retransmissionUl,
    flows_active: snap.flowsActive,
    flows_created: snap.flowsCreated,
    traffic_at_max_speed: snap.trafficAtMaxSpeed,
    dpi_downlink_top: snap.dpiDownlinkTop,
    dpi_uplink_top: snap.dpiUplinkTop,
  });
  if (error) throw new Error(`Error insertando snapshot: ${error.message}`);
}

// ══════════════════════════════════════════════
// Monthly DPI per subscriber (Option B — privacy-aware)
// ══════════════════════════════════════════════

type AppUsage = { name: string; bytes: number };

/** Merge two top-N lists: sum bytes per app, recalc top 10 by total. */
function mergeTopApps(existing: AppUsage[], incoming: AppUsage[], top = 10): AppUsage[] {
  const map = new Map<string, number>();
  for (const { name, bytes } of existing) map.set(name, (map.get(name) || 0) + bytes);
  for (const { name, bytes } of incoming) map.set(name, (map.get(name) || 0) + bytes);
  return Array.from(map.entries())
    .map(([name, bytes]) => ({ name, bytes }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, top);
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function upsertMonthlyDpiSample(params: {
  ip: string;
  dl: AppUsage[];   // daily DPI DL top apps
  ul: AppUsage[];   // daily DPI UL top apps
}): Promise<void> {
  const supabase = createAdminSupabase();
  const ym = currentYearMonth();

  // Read current row (if any) so we can merge
  const { data: existing } = await supabase
    .from("bequant_subscriber_dpi_monthly")
    .select("top_dl, top_ul, total_dl_bytes, total_ul_bytes, days_sampled")
    .eq("ip", params.ip)
    .eq("year_month", ym)
    .maybeSingle();

  const existingDl: AppUsage[] = (existing?.top_dl as AppUsage[]) || [];
  const existingUl: AppUsage[] = (existing?.top_ul as AppUsage[]) || [];
  const dailyDlTotal = params.dl.reduce((a, b) => a + b.bytes, 0);
  const dailyUlTotal = params.ul.reduce((a, b) => a + b.bytes, 0);

  const merged = {
    ip: params.ip,
    year_month: ym,
    top_dl: mergeTopApps(existingDl, params.dl, 10),
    top_ul: mergeTopApps(existingUl, params.ul, 10),
    total_dl_bytes: (existing?.total_dl_bytes || 0) + Math.round(dailyDlTotal),
    total_ul_bytes: (existing?.total_ul_bytes || 0) + Math.round(dailyUlTotal),
    days_sampled: (existing?.days_sampled || 0) + 1,
    last_updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("bequant_subscriber_dpi_monthly")
    .upsert(merged, { onConflict: "ip,year_month" });
  if (error) throw new Error(`Error upsert DPI monthly (${params.ip}): ${error.message}`);
}

/** Return last N months of DPI for a subscriber, most recent first. */
export async function listSubscriberMonthlyDpi(
  ip: string, months = 12
): Promise<BequantMonthlyDpiRow[]> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("bequant_subscriber_dpi_monthly")
    .select("*")
    .eq("ip", ip)
    .order("year_month", { ascending: false })
    .limit(months);
  if (error) throw new Error(`Error DPI monthly: ${error.message}`);
  return (data || []) as BequantMonthlyDpiRow[];
}

/** Partition: pick IPs whose hash falls on the given weekday slot (0..6). */
export async function getDpiRotationBatch(dayOfWeek: number): Promise<string[]> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.rpc("bequant_dpi_rotation_ips", { day_of_week: dayOfWeek });
  if (error) {
    // Fallback: manual partition via SQL if RPC missing
    const { data: all } = await supabase
      .from("bequant_subscribers")
      .select("ip")
      .not("odoo_partner_id", "is", null);
    const ips = (all || []).map(r => r.ip as string);
    return ips.filter((ip) => {
      // djb2 hash
      let h = 5381;
      for (let i = 0; i < ip.length; i++) h = ((h << 5) + h + ip.charCodeAt(i)) | 0;
      return Math.abs(h) % 7 === dayOfWeek;
    });
  }
  return ((data as Array<{ ip: string }>) || []).map(r => r.ip);
}

/** Delete rows older than N months. Returns count deleted. */
export async function purgeOldMonthlyDpi(keepMonths = 12): Promise<number> {
  const supabase = createAdminSupabase();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - keepMonths);
  const cutoffYm = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("bequant_subscriber_dpi_monthly")
    .delete()
    .lt("year_month", cutoffYm)
    .select("ip");
  if (error) throw new Error(`Error purge DPI: ${error.message}`);
  return (data || []).length;
}

// ══════════════════════════════════════════════
// Audit log
// ══════════════════════════════════════════════

export async function logBequantAccess(params: {
  userId?: string | null;
  userEmail?: string | null;
  action: "view_subscriber" | "view_list" | "test_connection" | "save_config" | "delete_config";
  targetIp?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createAdminSupabase();
    await supabase.from("bequant_access_log").insert({
      user_id: params.userId || null,
      user_email: params.userEmail || null,
      action: params.action,
      target_ip: params.targetIp || null,
      metadata: params.metadata || null,
    });
  } catch { /* non-critical */ }
}
