// ===========================================
// Zabbix JSON-RPC API Client
// ===========================================

import type {
  ZabbixHost,
  ZabbixProblem,
  ZabbixItem,
  ZabbixHistory,
  ZabbixEvent,
  ZabbixSeverity,
  InfraHost,
  InfraProblem,
  InfraOverview,
  InfraSiteSummary,
  HostLatency,
  InterfaceBandwidth,
  APClient,
  OutageEvent,
  EquipmentType,
  DetailedEquipmentType,
  SeverityLevel,
} from "@/types/zabbix";

// --- Config ---

const ZABBIX_URL = process.env.ZABBIX_URL;       // e.g. http://45.181.126.127:61424/zabbix/api_jsonrpc.php
const ZABBIX_AUTH_TOKEN = process.env.ZABBIX_AUTH_TOKEN;

// Self-signed SSL: Zabbix server uses a self-signed certificate.
// We scope the TLS override to only affect Zabbix API calls.
function withInsecureTLS<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  return fn().finally(() => {
    if (prev === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
    }
  });
}

export function isConfigured(): boolean {
  return !!(ZABBIX_URL && ZABBIX_AUTH_TOKEN);
}

// --- In-memory cache ---

const cache = new Map<string, { data: unknown; expiry: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown, ttlMs: number): void {
  cache.set(key, { data, expiry: Date.now() + ttlMs });
}

// --- JSON-RPC base call ---

let rpcId = 1;

async function zabbixCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!ZABBIX_URL || !ZABBIX_AUTH_TOKEN) {
    throw new Error("Zabbix no configurado");
  }

  const body = {
    jsonrpc: "2.0",
    method,
    params,
    id: rpcId++,
  };

  // Zabbix 7.0+ uses Bearer token in HTTP header (not "auth" in body)
  const response = await withInsecureTLS(() =>
    fetch(ZABBIX_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ZABBIX_AUTH_TOKEN}`,
      },
      body: JSON.stringify(body),
    })
  );

  if (!response.ok) {
    throw new Error(`Zabbix API HTTP ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(`Zabbix API: ${json.error.message} - ${json.error.data}`);
  }

  return json.result as T;
}

// --- Raw API methods (cached) ---

async function getHosts(): Promise<ZabbixHost[]> {
  const cacheKey = "hosts";
  const cached = getCached<ZabbixHost[]>(cacheKey);
  if (cached) return cached;

  const result = await zabbixCall<ZabbixHost[]>("host.get", {
    output: ["hostid", "host", "name", "status", "available", "error"],
    selectHostGroups: ["groupid", "name"],  // Zabbix 7.x: selectHostGroups (not selectGroups)
    selectTags: ["tag", "value"],
    selectInterfaces: ["interfaceid", "ip", "type"],
    filter: { status: "0" }, // only enabled hosts
  });

  setCache(cacheKey, result, 60_000);
  return result;
}

async function getProblems(): Promise<ZabbixProblem[]> {
  const cacheKey = "problems";
  const cached = getCached<ZabbixProblem[]>(cacheKey);
  if (cached) return cached;

  // Zabbix 7.x: problem.get doesn't support selectHosts; we resolve host names via trigger.get
  const result = await zabbixCall<ZabbixProblem[]>("problem.get", {
    output: ["eventid", "objectid", "name", "severity", "clock", "r_eventid", "acknowledged", "suppressed"],
    selectTags: ["tag", "value"],
    recent: true,
    sortfield: ["eventid"],
    sortorder: "DESC",
    limit: 200,
  });

  setCache(cacheKey, result, 60_000);
  return result;
}

async function getItems(hostids: string[], keys: string[]): Promise<ZabbixItem[]> {
  const cacheKey = `items:${hostids.join(",")}:${keys.join(",")}`;
  const cached = getCached<ZabbixItem[]>(cacheKey);
  if (cached) return cached;

  const params: Record<string, unknown> = {
    output: ["itemid", "hostid", "name", "key_", "lastvalue", "lastclock", "units", "state"],
    hostids,
    search: { key_: keys },
    searchByAny: true,
    sortfield: "name",
  };

  const result = await zabbixCall<ZabbixItem[]>("item.get", params);
  setCache(cacheKey, result, 60_000);
  return result;
}

async function getHistory(itemids: string[], timeFrom: number, timeTill: number): Promise<ZabbixHistory[]> {
  const cacheKey = `history:${itemids.join(",")}:${timeFrom}:${timeTill}`;
  const cached = getCached<ZabbixHistory[]>(cacheKey);
  if (cached) return cached;

  const result = await zabbixCall<ZabbixHistory[]>("history.get", {
    output: ["itemid", "clock", "value", "ns"],
    itemids,
    history: 0, // float
    time_from: timeFrom,
    time_till: timeTill,
    sortfield: "clock",
    sortorder: "ASC",
    limit: 1000,
  });

  setCache(cacheKey, result, 300_000);
  return result;
}

async function getEvents(timeFrom: number, timeTill: number): Promise<ZabbixEvent[]> {
  const cacheKey = `events:${timeFrom}:${timeTill}`;
  const cached = getCached<ZabbixEvent[]>(cacheKey);
  if (cached) return cached;

  // Zabbix 7.x: event.get doesn't support selectHosts; we resolve host names via hosts cache
  const result = await zabbixCall<ZabbixEvent[]>("event.get", {
    output: ["eventid", "clock", "name", "severity", "value", "r_clock", "acknowledged", "objectid"],
    selectTags: ["tag", "value"],
    time_from: timeFrom,
    time_till: timeTill,
    value: 1, // only PROBLEM events
    sortfield: ["clock"],
    sortorder: "DESC",
    limit: 500,
  });

  setCache(cacheKey, result, 300_000);
  return result;
}

// --- Helpers ---

export function classifyHost(host: ZabbixHost): EquipmentType {
  const name = host.name;
  const nameLower = name.toLowerCase();
  const groupNames = (host.hostgroups || []).map((g) => g.name.toLowerCase());

  // Wuipi naming convention (prefix-based): CCR_=router, SW_/Sw_=switch, PtP_=trunk,
  // Lbs_=sector, HBS_=sector, TG_=terragraph, Ap_=AP, St_/ST_=station, RtR_=router,
  // Ptmp_/PMPtmp_=PtMP, OLT_=OLT, UPS_=UPS, SRV_=server
  if (/^(CCR_|RtR_)/i.test(name)) return "router";
  if (/^(SW_|Sw_)/i.test(name)) return "switch";
  if (/^(Ap_|AP_)/i.test(name)) return "ap";
  if (/^(PtP_)/i.test(name)) return "trunk";
  if (/^(OLT_)/i.test(name)) return "olt";
  if (/^(UPS_)/i.test(name)) return "ups";
  if (/^(SRV_|Srv_)/i.test(name)) return "server";

  // Check groups (Zabbix 7.x: hostgroups field)
  for (const g of groupNames) {
    if (g.includes("core") || g.includes("backbone")) return "router";
    if (g.includes("switches distribu")) return "switch";
    if (g.includes("switches cliente")) return "switch";
    if (g.includes("access point")) return "ap";
    if (g.includes("ptp cliente")) return "trunk";
    if (g.includes("terragraph")) return "ap";
    if (g.includes("hbs") || g.includes("lbs")) return "ap";
  }

  // Fallback: generic name patterns
  if (/\b(router|ccr|mikrotik|core|rb\d)\b/i.test(nameLower)) return "router";
  if (/\b(switch|sw)\b/i.test(nameLower)) return "switch";
  if (/\b(ap|access.?point|ubnt|unifi|wireless|lbs|hbs|ptmp|pmp|terragraph|tg)\b/i.test(nameLower)) return "ap";
  if (/\b(srv|server|servidor)\b/i.test(nameLower)) return "server";
  if (/\b(ups|apc|battery)\b/i.test(nameLower)) return "ups";
  if (/\b(trunk|enlace|fibra|ptp|link)\b/i.test(nameLower)) return "trunk";
  if (/\b(olt)\b/i.test(nameLower)) return "olt";

  return "other";
}

export function classifyHostDetailed(name: string): { detailedType: DetailedEquipmentType; detailedTypeLabel: string } {
  // Core routers
  if (/^CCR_/i.test(name)) return { detailedType: "router_core", detailedTypeLabel: "Router Core" };
  // Regular routers
  if (/^RtR_/i.test(name)) return { detailedType: "router", detailedTypeLabel: "Router" };
  // Switches
  if (/^(SW_|Sw_)/i.test(name)) return { detailedType: "switch", detailedTypeLabel: "Switch" };
  // PtP links — Siklu
  if (/^PtP_.*Siklu/i.test(name) || /^PtP_.*SK/i.test(name)) return { detailedType: "enlace_siklu", detailedTypeLabel: "Enlace Siklu" };
  // PtP links — AF60
  if (/^PtP_.*AF60/i.test(name) || /^PtP_.*af60/i.test(name)) return { detailedType: "enlace_af60", detailedTypeLabel: "Enlace AF60" };
  // PtP links — Ubiquiti
  if (/^PtP_.*UB/i.test(name) || /^PtP_.*UBNT/i.test(name) || /^PtP_.*Ubiquiti/i.test(name)) return { detailedType: "enlace_ubiquiti", detailedTypeLabel: "Enlace Ubiquiti" };
  // PtP links — Mimosa
  if (/^PtP_.*Mimosa/i.test(name) || /^PtP_.*MM/i.test(name)) return { detailedType: "enlace_mimosa", detailedTypeLabel: "Enlace Mimosa" };
  // PtP links — Cambium
  if (/^PtP_.*Cambium/i.test(name) || /^PtP_.*CMB/i.test(name)) return { detailedType: "enlace_cambium", detailedTypeLabel: "Enlace Cambium" };
  // PtP links — generic MikroTik / remaining
  if (/^PtP_/i.test(name)) return { detailedType: "enlace_mikrotik", detailedTypeLabel: "Enlace MikroTik" };
  // Sectors LBS
  if (/^Lbs_/i.test(name) || /^LBS_/i.test(name)) return { detailedType: "sector_lbs", detailedTypeLabel: "Sector LBS" };
  // Sectors HBS
  if (/^HBS_/i.test(name) || /^Hbs_/i.test(name)) return { detailedType: "sector_hbs", detailedTypeLabel: "Sector HBS" };
  // Terragraph
  if (/^TG_/i.test(name)) return { detailedType: "terragraph", detailedTypeLabel: "Terragraph" };
  // PtMP
  if (/^(Ptmp_|PMPtmp_)/i.test(name)) return { detailedType: "ptmp", detailedTypeLabel: "PtMP" };
  // Stations
  if (/^(St_|ST_)/i.test(name)) return { detailedType: "station", detailedTypeLabel: "Station" };
  // Access Points
  if (/^(Ap_|AP_)/i.test(name)) return { detailedType: "access_point", detailedTypeLabel: "Access Point" };
  // HSU (subscriber units)
  if (/^HSU_/i.test(name)) return { detailedType: "hsu", detailedTypeLabel: "HSU" };

  return { detailedType: "other", detailedTypeLabel: "Otro" };
}

const KNOWN_SITES = [
  "AVI", "ALB", "ARN", "BVC", "CAT", "CEL", "COL", "GOL", "GTA",
  "LAT", "LOB", "NVB", "PEQ", "PLD", "REB", "TZE", "VCN", "VST",
  "ZEU", "ZIC", "SPE",
];

export function extractSite(hostName: string): string {
  // Normalize: replace dashes/dots with underscores, split into tokens
  const parts = hostName.replace(/[-./]/g, "_").split("_");
  for (const part of parts) {
    const upper = part.toUpperCase();
    if (KNOWN_SITES.includes(upper)) return upper;
  }
  // Case-insensitive substring match for 3-letter site codes embedded in longer tokens
  const nameUpper = hostName.toUpperCase();
  for (const site of KNOWN_SITES) {
    // Match site code surrounded by non-alpha boundaries (e.g. "Hbs_Reb_S01" → REB)
    const re = new RegExp(`(?:^|[^A-Z])${site}(?:$|[^A-Z])`);
    if (re.test(nameUpper)) return site;
  }
  return "OTROS";
}

export function mapSeverity(severity: ZabbixSeverity): SeverityLevel {
  const map: Record<ZabbixSeverity, SeverityLevel> = {
    "0": "not_classified",
    "1": "information",
    "2": "warning",
    "3": "average",
    "4": "high",
    "5": "disaster",
  };
  return map[severity] || "not_classified";
}

function periodToSeconds(period: string): number {
  if (period === "24h") return 86400;
  if (period === "7d") return 604800;
  if (period === "30d") return 2592000;
  return 86400;
}

// --- Normalized functions ---

export async function getInfraOverview(): Promise<InfraOverview> {
  if (!isConfigured()) throw new Error("Zabbix no configurado");

  const [hosts, problems] = await Promise.all([getHosts(), getProblems()]);
  const hostids = hosts.map((h) => h.hostid);

  // Fetch icmpping + icmppingsec for all hosts to determine real status
  const items = hostids.length > 0
    ? await getItems(hostids, ["icmpping", "icmppingsec"])
    : [];

  const pingByHost = new Map<string, string>();    // hostid → "1"/"0"
  const latencyByHost = new Map<string, number>();  // hostid → ms
  for (const item of items) {
    if (item.key_ === "icmpping") {
      pingByHost.set(item.hostid, item.lastvalue);
    } else if (item.key_.startsWith("icmppingsec")) {
      latencyByHost.set(item.hostid, parseFloat(item.lastvalue) * 1000);
    }
  }

  // Count status based on icmpping
  let hostsUp = 0, hostsDown = 0, hostsUnknown = 0;
  for (const h of hosts) {
    const ping = pingByHost.get(h.hostid);
    if (ping === "1") hostsUp++;
    else if (ping === "0") hostsDown++;
    else hostsUnknown++;
  }
  const totalHosts = hosts.length;

  // Health Score = % of hosts responding to ping
  const hostsWithPing = hostsUp + hostsDown;
  const healthScore = hostsWithPing > 0
    ? Math.round((hostsUp / hostsWithPing) * 100)
    : 0;

  const uptimePercent = totalHosts > 0
    ? Math.round(((hostsUp / totalHosts) * 100) * 100) / 100
    : 0;

  const problemsBySeverity: Record<SeverityLevel, number> = {
    not_classified: 0, information: 0, warning: 0, average: 0, high: 0, disaster: 0,
  };
  for (const p of problems) {
    problemsBySeverity[mapSeverity(p.severity)]++;
  }

  // Build site summaries with latency
  const siteMap = new Map<string, { up: number; down: number; unknown: number; total: number; latencies: number[] }>();
  for (const h of hosts) {
    const site = extractSite(h.name);
    const entry = siteMap.get(site) || { up: 0, down: 0, unknown: 0, total: 0, latencies: [] };
    entry.total++;
    const ping = pingByHost.get(h.hostid);
    if (ping === "1") entry.up++;
    else if (ping === "0") entry.down++;
    else entry.unknown++;
    const lat = latencyByHost.get(h.hostid);
    if (lat !== undefined && lat > 0) entry.latencies.push(lat);
    siteMap.set(site, entry);
  }
  const sites: InfraSiteSummary[] = Array.from(siteMap.entries())
    .map(([code, s]) => ({
      code,
      totalHosts: s.total,
      hostsUp: s.up,
      hostsDown: s.down,
      hostsWarning: s.unknown,
      avgLatency: s.latencies.length > 0
        ? Math.round((s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length) * 10) / 10
        : null,
    }))
    .sort((a, b) => {
      // Sites with down hosts first, then by total hosts desc
      if (a.hostsDown > 0 && b.hostsDown === 0) return -1;
      if (a.hostsDown === 0 && b.hostsDown > 0) return 1;
      return b.totalHosts - a.totalHosts;
    });

  return {
    totalHosts, hostsUp, hostsDown, hostsUnknown, uptimePercent,
    problemsBySeverity, healthScore, totalProblems: problems.length,
    sites, zabbixConnected: true,
    updatedAt: new Date().toISOString(),
  };
}

export async function getInfraHosts(): Promise<InfraHost[]> {
  if (!isConfigured()) throw new Error("Zabbix no configurado");

  const hosts = await getHosts();
  const hostids = hosts.map((h) => h.hostid);

  // Fetch icmpping (UP/DOWN), ICMP metrics, and uptime for all hosts
  const items = hostids.length > 0
    ? await getItems(hostids, ["icmpping", "icmppingsec", "icmppingloss", "system.hw.uptime"])
    : [];

  const itemsByHost = new Map<string, ZabbixItem[]>();
  for (const item of items) {
    const list = itemsByHost.get(item.hostid) || [];
    list.push(item);
    itemsByHost.set(item.hostid, list);
  }

  return hosts.map((host): InfraHost => {
    const hostItems = itemsByHost.get(host.hostid) || [];
    // icmpping: lastvalue "1" = UP, "0" = DOWN
    const pingItem = hostItems.find((i) => i.key_ === "icmpping");
    const latencyItem = hostItems.find((i) => i.key_.startsWith("icmppingsec"));
    const lossItem = hostItems.find((i) => i.key_.startsWith("icmppingloss"));
    const uptimeItem = hostItems.find((i) => i.key_.startsWith("system.hw.uptime"));
    const detailed = classifyHostDetailed(host.name);

    // Determine status from icmpping item, not from host.available
    let status: "online" | "offline" | "unknown" = "unknown";
    if (pingItem) {
      status = pingItem.lastvalue === "1" ? "online" : "offline";
    }

    return {
      id: host.hostid,
      name: host.name,
      type: classifyHost(host),
      detailedType: detailed.detailedType,
      detailedTypeLabel: detailed.detailedTypeLabel,
      status,
      ip: host.interfaces[0]?.ip || "",
      groups: (host.hostgroups || []).map((g) => g.name),
      site: extractSite(host.name),
      latency: latencyItem ? parseFloat(latencyItem.lastvalue) * 1000 : null, // sec→ms
      packetLoss: lossItem ? parseFloat(lossItem.lastvalue) : null,
      bandwidthIn: null,
      bandwidthOut: null,
      uptime: uptimeItem ? parseFloat(uptimeItem.lastvalue) : null,
      connectedClients: null,
      lastStateChange: null,
      error: host.error,
    };
  });
}

export async function getInfraProblems(): Promise<InfraProblem[]> {
  if (!isConfigured()) throw new Error("Zabbix no configurado");

  const [problems, hosts] = await Promise.all([getProblems(), getHosts()]);
  const now = Math.floor(Date.now() / 1000);

  // Build hostid→name map from cached hosts
  const hostMap = new Map(hosts.map((h) => [h.hostid, h.name]));

  // Resolve host names for problems via their trigger objectids
  const triggerIds = [...new Set(problems.map((p) => p.objectid).filter(Boolean))];
  let triggerHostMap = new Map<string, { hostid: string; name: string }>();

  if (triggerIds.length > 0) {
    try {
      const triggers = await zabbixCall<Array<{ triggerid: string; hosts: { hostid: string; name: string }[] }>>(
        "trigger.get",
        {
          output: ["triggerid"],
          triggerids: triggerIds,
          selectHosts: ["hostid", "name"],
        }
      );
      for (const t of triggers) {
        if (t.hosts?.[0]) {
          triggerHostMap.set(t.triggerid, t.hosts[0]);
        }
      }
    } catch {
      // If trigger.get also fails with selectHosts, fall back to empty map
    }
  }

  return problems.map((p): InfraProblem => {
    const triggerHost = triggerHostMap.get(p.objectid);
    const hostName = triggerHost?.name || "Desconocido";
    return {
      id: p.eventid,
      name: p.name,
      severity: mapSeverity(p.severity),
      hostId: triggerHost?.hostid || "",
      hostName,
      site: extractSite(hostName),
      startTime: new Date(parseInt(p.clock) * 1000).toISOString(),
      duration: now - parseInt(p.clock),
      acknowledged: p.acknowledged === "1",
    };
  });
}

export async function getHostLatencies(period = "24h"): Promise<HostLatency[]> {
  if (!isConfigured()) throw new Error("Zabbix no configurado");

  const hosts = await getHosts();
  const hostids = hosts.map((h) => h.hostid);
  if (hostids.length === 0) return [];

  const items = await getItems(hostids, ["icmppingsec", "icmppingloss"]);
  const latencyItems = items.filter((i) => i.key_.startsWith("icmppingsec"));
  const lossItems = items.filter((i) => i.key_.startsWith("icmppingloss"));

  const now = Math.floor(Date.now() / 1000);
  const from = now - periodToSeconds(period);

  // Fetch history for latency items
  const latencyItemIds = latencyItems.map((i) => i.itemid);
  const history = latencyItemIds.length > 0
    ? await getHistory(latencyItemIds, from, now)
    : [];

  const historyByItem = new Map<string, ZabbixHistory[]>();
  for (const h of history) {
    const list = historyByItem.get(h.itemid) || [];
    list.push(h);
    historyByItem.set(h.itemid, list);
  }

  const hostMap = new Map(hosts.map((h) => [h.hostid, h.name]));

  return latencyItems.map((item): HostLatency => {
    const itemHistory = historyByItem.get(item.itemid) || [];
    const values = itemHistory.map((h) => parseFloat(h.value) * 1000); // sec→ms
    const lossItem = lossItems.find((l) => l.hostid === item.hostid);

    return {
      hostId: item.hostid,
      hostName: hostMap.get(item.hostid) || item.name,
      current: parseFloat(item.lastvalue) * 1000,
      avg: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
      max: values.length > 0 ? Math.max(...values) : 0,
      packetLoss: lossItem ? parseFloat(lossItem.lastvalue) : 0,
      history: itemHistory.map((h) => ({
        time: new Date(parseInt(h.clock) * 1000).toISOString(),
        value: parseFloat(h.value) * 1000,
      })),
    };
  });
}

export async function getBandwidthData(period = "24h"): Promise<InterfaceBandwidth[]> {
  if (!isConfigured()) throw new Error("Zabbix no configurado");

  const hosts = await getHosts();
  const hostids = hosts.map((h) => h.hostid);
  if (hostids.length === 0) return [];

  const items = await getItems(hostids, ["net.if.in", "net.if.out"]);
  const inItems = items.filter((i) => i.key_.startsWith("net.if.in"));
  const outItems = items.filter((i) => i.key_.startsWith("net.if.out"));

  const now = Math.floor(Date.now() / 1000);
  const from = now - periodToSeconds(period);

  const allItemIds = [...inItems, ...outItems].map((i) => i.itemid);
  const history = allItemIds.length > 0
    ? await getHistory(allItemIds, from, now)
    : [];

  const historyByItem = new Map<string, ZabbixHistory[]>();
  for (const h of history) {
    const list = historyByItem.get(h.itemid) || [];
    list.push(h);
    historyByItem.set(h.itemid, list);
  }

  const hostMap = new Map(hosts.map((h) => [h.hostid, h.name]));

  return inItems.map((inItem): InterfaceBandwidth => {
    const outItem = outItems.find((o) => o.hostid === inItem.hostid);
    const inHistory = historyByItem.get(inItem.itemid) || [];
    const outHistory = outItem ? (historyByItem.get(outItem.itemid) || []) : [];

    // Merge histories by timestamp
    const timeMap = new Map<string, { inValue: number; outValue: number }>();
    for (const h of inHistory) {
      timeMap.set(h.clock, { inValue: parseFloat(h.value) / 1_000_000, outValue: 0 });
    }
    for (const h of outHistory) {
      const entry = timeMap.get(h.clock) || { inValue: 0, outValue: 0 };
      entry.outValue = parseFloat(h.value) / 1_000_000;
      timeMap.set(h.clock, entry);
    }

    const historyPoints = Array.from(timeMap.entries())
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([clock, vals]) => ({
        time: new Date(parseInt(clock) * 1000).toISOString(),
        inValue: Math.round(vals.inValue * 100) / 100,
        outValue: Math.round(vals.outValue * 100) / 100,
      }));

    return {
      hostId: inItem.hostid,
      hostName: hostMap.get(inItem.hostid) || inItem.name,
      interfaceName: inItem.name,
      inMbps: parseFloat(inItem.lastvalue) / 1_000_000,
      outMbps: outItem ? parseFloat(outItem.lastvalue) / 1_000_000 : 0,
      history: historyPoints,
    };
  });
}

export async function getAPClients(): Promise<APClient[]> {
  if (!isConfigured()) throw new Error("Zabbix no configurado");

  const hosts = await getHosts();
  const apHosts = hosts.filter((h) => classifyHost(h) === "ap");
  if (apHosts.length === 0) return [];

  const hostids = apHosts.map((h) => h.hostid);
  const items = await getItems(hostids, ["wireless", "client", "station"]);

  const hostMap = new Map(apHosts.map((h) => [h.hostid, h]));

  return items
    .filter((item) => /client|station|wireless/i.test(item.key_))
    .map((item): APClient => {
      const host = hostMap.get(item.hostid);
      return {
        hostId: item.hostid,
        hostName: host?.name || item.name,
        clients: parseInt(item.lastvalue) || 0,
        ip: host?.interfaces[0]?.ip || "",
      };
    })
    .sort((a, b) => b.clients - a.clients);
}

export async function getOutageHistory(period = "24h"): Promise<OutageEvent[]> {
  if (!isConfigured()) throw new Error("Zabbix no configurado");

  const now = Math.floor(Date.now() / 1000);
  const from = now - periodToSeconds(period);
  const events = await getEvents(from, now);

  // Resolve host names: events have objectid (triggerid), use trigger.get to get hosts
  const triggerIds = [...new Set(events.map((e) => e.objectid).filter(Boolean))];
  const triggerHostMap = new Map<string, string>();

  if (triggerIds.length > 0) {
    try {
      const triggers = await zabbixCall<Array<{ triggerid: string; hosts: { hostid: string; name: string }[] }>>(
        "trigger.get",
        {
          output: ["triggerid"],
          triggerids: triggerIds,
          selectHosts: ["hostid", "name"],
        }
      );
      for (const t of triggers) {
        if (t.hosts?.[0]) {
          triggerHostMap.set(t.triggerid, t.hosts[0].name);
        }
      }
    } catch {
      // Fallback: no host name resolution
    }
  }

  return events.map((e): OutageEvent => {
    const startSec = parseInt(e.clock);
    const endSec = e.r_clock && e.r_clock !== "0" ? parseInt(e.r_clock) : null;
    const objectid = e.objectid || "";

    return {
      id: e.eventid,
      hostName: triggerHostMap.get(objectid) || "Desconocido",
      eventName: e.name,
      severity: mapSeverity(e.severity),
      startTime: new Date(startSec * 1000).toISOString(),
      endTime: endSec ? new Date(endSec * 1000).toISOString() : null,
      duration: endSec ? endSec - startSec : now - startSec,
      active: !endSec,
    };
  });
}

