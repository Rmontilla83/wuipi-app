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
  HostLatency,
  InterfaceBandwidth,
  APClient,
  OutageEvent,
  EquipmentType,
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
  if (!isConfigured()) return mockOverview();

  try {
    const [hosts, problems] = await Promise.all([getHosts(), getProblems()]);

    const hostsUp = hosts.filter((h) => h.available === "1").length;
    const hostsDown = hosts.filter((h) => h.available === "2").length;
    const hostsUnknown = hosts.filter((h) => h.available === "0").length;
    const totalHosts = hosts.length;

    const uptimePercent = totalHosts > 0
      ? Math.round(((hostsUp / totalHosts) * 100) * 100) / 100
      : 0;

    const problemsBySeverity: Record<SeverityLevel, number> = {
      not_classified: 0, information: 0, warning: 0, average: 0, high: 0, disaster: 0,
    };
    for (const p of problems) {
      problemsBySeverity[mapSeverity(p.severity)]++;
    }

    const disasterWeight = problemsBySeverity.disaster * 15;
    const highWeight = problemsBySeverity.high * 8;
    const avgWeight = problemsBySeverity.average * 4;
    const warnWeight = problemsBySeverity.warning * 1;
    const downPenalty = totalHosts > 0 ? (hostsDown / totalHosts) * 40 : 0;
    const healthScore = Math.max(0, Math.min(100,
      Math.round(100 - disasterWeight - highWeight - avgWeight - warnWeight - downPenalty)
    ));

    return {
      totalHosts, hostsUp, hostsDown, hostsUnknown, uptimePercent,
      problemsBySeverity, healthScore, totalProblems: problems.length,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Zabbix getInfraOverview error:", error);
    return mockOverview();
  }
}

export async function getInfraHosts(): Promise<InfraHost[]> {
  if (!isConfigured()) return mockHosts();

  try {
    const hosts = await getHosts();
    const hostids = hosts.map((h) => h.hostid);

    // Fetch ICMP and bandwidth items for all hosts
    const items = hostids.length > 0
      ? await getItems(hostids, ["icmppingsec", "icmppingloss", "net.if.in", "net.if.out"])
      : [];

    const itemsByHost = new Map<string, ZabbixItem[]>();
    for (const item of items) {
      const list = itemsByHost.get(item.hostid) || [];
      list.push(item);
      itemsByHost.set(item.hostid, list);
    }

    return hosts.map((host): InfraHost => {
      const hostItems = itemsByHost.get(host.hostid) || [];
      const latencyItem = hostItems.find((i) => i.key_.startsWith("icmppingsec"));
      const lossItem = hostItems.find((i) => i.key_.startsWith("icmppingloss"));
      const bwInItem = hostItems.find((i) => i.key_.startsWith("net.if.in"));
      const bwOutItem = hostItems.find((i) => i.key_.startsWith("net.if.out"));

      return {
        id: host.hostid,
        name: host.name,
        type: classifyHost(host),
        status: host.available === "1" ? "online" : host.available === "2" ? "offline" : "unknown",
        ip: host.interfaces[0]?.ip || "",
        groups: (host.hostgroups || []).map((g) => g.name),
        latency: latencyItem ? parseFloat(latencyItem.lastvalue) * 1000 : null, // sec→ms
        packetLoss: lossItem ? parseFloat(lossItem.lastvalue) : null,
        bandwidthIn: bwInItem ? parseFloat(bwInItem.lastvalue) / 1_000_000 : null, // bps→Mbps
        bandwidthOut: bwOutItem ? parseFloat(bwOutItem.lastvalue) / 1_000_000 : null,
        connectedClients: null,
        lastStateChange: null,
        error: host.error,
      };
    });
  } catch (error) {
    console.error("Zabbix getInfraHosts error:", error);
    return mockHosts();
  }
}

export async function getInfraProblems(): Promise<InfraProblem[]> {
  if (!isConfigured()) return mockProblems();

  try {
    const [problems, hosts] = await Promise.all([getProblems(), getHosts()]);
    const now = Math.floor(Date.now() / 1000);

    // Build hostid→name map from cached hosts
    const hostMap = new Map(hosts.map((h) => [h.hostid, h.name]));

    // Resolve host names for problems via their trigger objectids
    // Fetch triggers for all problem objectids to get host associations
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
      return {
        id: p.eventid,
        name: p.name,
        severity: mapSeverity(p.severity),
        hostId: triggerHost?.hostid || "",
        hostName: triggerHost?.name || "Desconocido",
        startTime: new Date(parseInt(p.clock) * 1000).toISOString(),
        duration: now - parseInt(p.clock),
        acknowledged: p.acknowledged === "1",
      };
    });
  } catch (error) {
    console.error("Zabbix getInfraProblems error:", error);
    return mockProblems();
  }
}

export async function getHostLatencies(period = "24h"): Promise<HostLatency[]> {
  if (!isConfigured()) return mockLatencies();

  try {
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
  } catch (error) {
    console.error("Zabbix getHostLatencies error:", error);
    return mockLatencies();
  }
}

export async function getBandwidthData(period = "24h"): Promise<InterfaceBandwidth[]> {
  if (!isConfigured()) return mockBandwidth();

  try {
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
  } catch (error) {
    console.error("Zabbix getBandwidthData error:", error);
    return mockBandwidth();
  }
}

export async function getAPClients(): Promise<APClient[]> {
  if (!isConfigured()) return mockAPClients();

  try {
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
  } catch (error) {
    console.error("Zabbix getAPClients error:", error);
    return mockAPClients();
  }
}

export async function getOutageHistory(period = "24h"): Promise<OutageEvent[]> {
  if (!isConfigured()) return mockOutages();

  try {
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
  } catch (error) {
    console.error("Zabbix getOutageHistory error:", error);
    return mockOutages();
  }
}

// ===========================================
// Mock Data (ISP-realistic Venezuelan network)
// ===========================================

function mockOverview(): InfraOverview {
  return {
    totalHosts: 47,
    hostsUp: 43,
    hostsDown: 2,
    hostsUnknown: 2,
    uptimePercent: 91.49,
    problemsBySeverity: {
      not_classified: 0, information: 2, warning: 5, average: 3, high: 1, disaster: 0,
    },
    healthScore: 82,
    totalProblems: 11,
    updatedAt: new Date().toISOString(),
  };
}

function mockHosts(): InfraHost[] {
  const types: EquipmentType[] = ["router", "router", "olt", "olt", "olt", "switch", "switch", "ap", "ap", "ap", "ap", "ap", "server", "server", "ups", "trunk", "trunk"];
  const names = [
    "Core-Router-Principal", "Core-Router-Backup", "OLT-Lecheria-Norte", "OLT-Barcelona-Sur",
    "OLT-Puerto-La-Cruz", "SW-Distribución-01", "SW-Distribución-02", "AP-Lecheria-01",
    "AP-Lecheria-02", "AP-Barcelona-01", "AP-Barcelona-02", "AP-PLC-01",
    "SRV-Radius", "SRV-DNS", "UPS-Datacenter", "Trunk-Cantv-Principal", "Trunk-Inter-Backup",
  ];
  const statuses: InfraHost["status"][] = [
    "online", "online", "online", "online", "online", "online", "online",
    "online", "online", "online", "offline", "online", "online", "online",
    "online", "online", "offline",
  ];

  return names.map((name, i): InfraHost => ({
    id: String(1000 + i),
    name,
    type: types[i],
    status: statuses[i],
    ip: `10.0.${Math.floor(i / 5)}.${(i % 255) + 1}`,
    groups: [i < 2 ? "Core" : i < 5 ? "OLT" : i < 7 ? "Switches" : i < 12 ? "Access Points" : i < 14 ? "Servidores" : i < 15 ? "UPS" : "Troncales"],
    latency: statuses[i] === "online" ? Math.round((Math.random() * 25 + 1) * 100) / 100 : null,
    packetLoss: statuses[i] === "online" ? Math.round(Math.random() * 2 * 100) / 100 : null,
    bandwidthIn: types[i] === "trunk" ? Math.round(Math.random() * 500 + 200) : types[i] === "router" ? Math.round(Math.random() * 800 + 100) : null,
    bandwidthOut: types[i] === "trunk" ? Math.round(Math.random() * 200 + 50) : types[i] === "router" ? Math.round(Math.random() * 300 + 50) : null,
    connectedClients: types[i] === "ap" ? Math.floor(Math.random() * 30 + 5) : null,
    lastStateChange: new Date(Date.now() - Math.random() * 86400000).toISOString(),
    error: statuses[i] === "offline" ? "Host inalcanzable" : "",
  }));
}

function mockProblems(): InfraProblem[] {
  const now = Date.now();
  return [
    { id: "1", name: "AP-Barcelona-02 inalcanzable", severity: "high", hostId: "1010", hostName: "AP-Barcelona-02", startTime: new Date(now - 1800000).toISOString(), duration: 1800, acknowledged: false },
    { id: "2", name: "Trunk-Inter-Backup sin respuesta ICMP", severity: "high", hostId: "1016", hostName: "Trunk-Inter-Backup", startTime: new Date(now - 3600000).toISOString(), duration: 3600, acknowledged: true },
    { id: "3", name: "Latencia elevada en OLT-Barcelona-Sur (>50ms)", severity: "average", hostId: "1003", hostName: "OLT-Barcelona-Sur", startTime: new Date(now - 7200000).toISOString(), duration: 7200, acknowledged: false },
    { id: "4", name: "Uso de CPU alto en Core-Router-Principal (85%)", severity: "average", hostId: "1000", hostName: "Core-Router-Principal", startTime: new Date(now - 900000).toISOString(), duration: 900, acknowledged: false },
    { id: "5", name: "Pérdida de paquetes AP-Lecheria-01 (3.2%)", severity: "average", hostId: "1007", hostName: "AP-Lecheria-01", startTime: new Date(now - 5400000).toISOString(), duration: 5400, acknowledged: false },
    { id: "6", name: "UPS-Datacenter batería al 40%", severity: "warning", hostId: "1014", hostName: "UPS-Datacenter", startTime: new Date(now - 14400000).toISOString(), duration: 14400, acknowledged: true },
    { id: "7", name: "Espacio en disco bajo SRV-DNS (<15%)", severity: "warning", hostId: "1013", hostName: "SRV-DNS", startTime: new Date(now - 21600000).toISOString(), duration: 21600, acknowledged: false },
    { id: "8", name: "Interfaz eth3 de SW-Distribución-01 flapping", severity: "warning", hostId: "1005", hostName: "SW-Distribución-01", startTime: new Date(now - 10800000).toISOString(), duration: 10800, acknowledged: false },
    { id: "9", name: "Clientes conectados AP-PLC-01 por encima del umbral", severity: "warning", hostId: "1011", hostName: "AP-PLC-01", startTime: new Date(now - 43200000).toISOString(), duration: 43200, acknowledged: true },
    { id: "10", name: "Certificado SSL SRV-Radius expira en 15 días", severity: "information", hostId: "1012", hostName: "SRV-Radius", startTime: new Date(now - 86400000).toISOString(), duration: 86400, acknowledged: true },
    { id: "11", name: "Actualización de firmware disponible SW-Distribución-02", severity: "information", hostId: "1006", hostName: "SW-Distribución-02", startTime: new Date(now - 172800000).toISOString(), duration: 172800, acknowledged: false },
  ];
}

function mockLatencies(): HostLatency[] {
  const hosts = [
    { id: "1000", name: "Core-Router-Principal", base: 2 },
    { id: "1001", name: "Core-Router-Backup", base: 3 },
    { id: "1002", name: "OLT-Lecheria-Norte", base: 8 },
    { id: "1003", name: "OLT-Barcelona-Sur", base: 52 },
    { id: "1004", name: "OLT-Puerto-La-Cruz", base: 12 },
    { id: "1007", name: "AP-Lecheria-01", base: 15 },
    { id: "1008", name: "AP-Lecheria-02", base: 10 },
    { id: "1009", name: "AP-Barcelona-01", base: 18 },
    { id: "1011", name: "AP-PLC-01", base: 14 },
    { id: "1015", name: "Trunk-Cantv-Principal", base: 5 },
  ];

  const now = Date.now();
  return hosts.map((h) => {
    const points = Array.from({ length: 24 }, (_, i) => ({
      time: new Date(now - (23 - i) * 3600000).toISOString(),
      value: Math.round((h.base + Math.random() * h.base * 0.5) * 100) / 100,
    }));
    const values = points.map((p) => p.value);
    return {
      hostId: h.id,
      hostName: h.name,
      current: Math.round((h.base + Math.random() * 5) * 100) / 100,
      avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
      max: Math.round(Math.max(...values) * 100) / 100,
      packetLoss: Math.round(Math.random() * 3 * 100) / 100,
      history: points,
    };
  });
}

function mockBandwidth(): InterfaceBandwidth[] {
  const interfaces = [
    { id: "1000", name: "Core-Router-Principal", iface: "ether1 - Uplink", baseIn: 650, baseOut: 180 },
    { id: "1001", name: "Core-Router-Backup", iface: "ether1 - Uplink", baseIn: 120, baseOut: 35 },
    { id: "1015", name: "Trunk-Cantv-Principal", iface: "sfp1 - CANTV", baseIn: 520, baseOut: 145 },
    { id: "1016", name: "Trunk-Inter-Backup", iface: "sfp1 - Inter", baseIn: 0, baseOut: 0 },
    { id: "1002", name: "OLT-Lecheria-Norte", iface: "ge0/0/1", baseIn: 180, baseOut: 48 },
    { id: "1003", name: "OLT-Barcelona-Sur", iface: "ge0/0/1", baseIn: 210, baseOut: 62 },
    { id: "1004", name: "OLT-Puerto-La-Cruz", iface: "ge0/0/1", baseIn: 145, baseOut: 38 },
  ];

  const now = Date.now();
  return interfaces.map((iface) => {
    const points = Array.from({ length: 24 }, (_, i) => ({
      time: new Date(now - (23 - i) * 3600000).toISOString(),
      inValue: Math.round((iface.baseIn + (Math.random() - 0.5) * iface.baseIn * 0.3) * 100) / 100,
      outValue: Math.round((iface.baseOut + (Math.random() - 0.5) * iface.baseOut * 0.3) * 100) / 100,
    }));

    return {
      hostId: iface.id,
      hostName: iface.name,
      interfaceName: iface.iface,
      inMbps: Math.round((iface.baseIn + Math.random() * 50) * 100) / 100,
      outMbps: Math.round((iface.baseOut + Math.random() * 20) * 100) / 100,
      history: points,
    };
  });
}

function mockAPClients(): APClient[] {
  return [
    { hostId: "1007", hostName: "AP-Lecheria-01", clients: 28, ip: "10.0.1.2" },
    { hostId: "1008", hostName: "AP-Lecheria-02", clients: 22, ip: "10.0.1.3" },
    { hostId: "1009", hostName: "AP-Barcelona-01", clients: 35, ip: "10.0.2.0" },
    { hostId: "1010", hostName: "AP-Barcelona-02", clients: 0, ip: "10.0.2.1" },
    { hostId: "1011", hostName: "AP-PLC-01", clients: 18, ip: "10.0.2.2" },
  ];
}

function mockOutages(): OutageEvent[] {
  const now = Date.now();
  return [
    { id: "e1", hostName: "AP-Barcelona-02", eventName: "AP-Barcelona-02 inalcanzable", severity: "high", startTime: new Date(now - 1800000).toISOString(), endTime: null, duration: 1800, active: true },
    { id: "e2", hostName: "Trunk-Inter-Backup", eventName: "Trunk-Inter-Backup sin respuesta ICMP", severity: "high", startTime: new Date(now - 3600000).toISOString(), endTime: null, duration: 3600, active: true },
    { id: "e3", hostName: "OLT-Barcelona-Sur", eventName: "Latencia elevada (>50ms)", severity: "average", startTime: new Date(now - 7200000).toISOString(), endTime: null, duration: 7200, active: true },
    { id: "e4", hostName: "AP-Lecheria-01", eventName: "Pérdida de paquetes (3.2%)", severity: "average", startTime: new Date(now - 14400000).toISOString(), endTime: new Date(now - 10800000).toISOString(), duration: 3600, active: false },
    { id: "e5", hostName: "Core-Router-Principal", eventName: "CPU alta (92%)", severity: "average", startTime: new Date(now - 28800000).toISOString(), endTime: new Date(now - 25200000).toISOString(), duration: 3600, active: false },
    { id: "e6", hostName: "SW-Distribución-01", eventName: "Interfaz eth3 flapping", severity: "warning", startTime: new Date(now - 43200000).toISOString(), endTime: new Date(now - 39600000).toISOString(), duration: 3600, active: false },
    { id: "e7", hostName: "OLT-Lecheria-Norte", eventName: "Packet loss > 2%", severity: "warning", startTime: new Date(now - 64800000).toISOString(), endTime: new Date(now - 61200000).toISOString(), duration: 3600, active: false },
    { id: "e8", hostName: "SRV-Radius", eventName: "Servicio RADIUS reiniciado", severity: "information", startTime: new Date(now - 86400000).toISOString(), endTime: new Date(now - 86100000).toISOString(), duration: 300, active: false },
  ];
}
