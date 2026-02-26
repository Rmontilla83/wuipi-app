// ===========================================
// Zabbix API Type Definitions
// ===========================================

// --- Raw Zabbix API types ---

export interface ZabbixHost {
  hostid: string;
  host: string;
  name: string;
  status: "0" | "1"; // 0=enabled, 1=disabled
  available: "0" | "1" | "2"; // 0=unknown, 1=available, 2=unavailable
  error: string;
  hostgroups: ZabbixHostGroup[];  // Zabbix 7.x: returned by selectHostGroups
  tags: ZabbixTag[];
  interfaces: ZabbixInterface[];
}

export interface ZabbixHostGroup {
  groupid: string;
  name: string;
}

export interface ZabbixTag {
  tag: string;
  value: string;
}

export interface ZabbixInterface {
  interfaceid: string;
  ip: string;
  type: "1" | "2" | "3" | "4"; // 1=agent, 2=SNMP, 3=IPMI, 4=JMX
}

export interface ZabbixProblem {
  eventid: string;
  objectid: string;
  name: string;
  severity: ZabbixSeverity;
  clock: string;
  r_eventid: string;
  acknowledged: "0" | "1";
  suppressed: "0" | "1";
  tags: ZabbixTag[];
}

export type ZabbixSeverity = "0" | "1" | "2" | "3" | "4" | "5";

export interface ZabbixItem {
  itemid: string;
  hostid: string;
  name: string;
  key_: string;
  lastvalue: string;
  lastclock: string;
  units: string;
  state: "0" | "1"; // 0=normal, 1=not supported
}

export interface ZabbixHistory {
  itemid: string;
  clock: string;
  value: string;
  ns: string;
}

export interface ZabbixEvent {
  eventid: string;
  objectid: string;
  clock: string;
  name: string;
  severity: ZabbixSeverity;
  value: "0" | "1"; // 0=resolved, 1=problem
  r_clock: string;
  acknowledged: "0" | "1";
}

export interface ZabbixTrigger {
  triggerid: string;
  description: string;
  priority: ZabbixSeverity;
  value: "0" | "1"; // 0=OK, 1=PROBLEM
  lastchange: string;
  hosts: { hostid: string; name: string }[];
}

// --- Normalized app types ---

export type EquipmentType = "router" | "switch" | "ap" | "server" | "ups" | "trunk" | "olt" | "other";

export type DetailedEquipmentType =
  | "router_core" | "router" | "switch"
  | "enlace_siklu" | "enlace_mikrotik" | "enlace_ubiquiti" | "enlace_mimosa" | "enlace_cambium" | "enlace_af60"
  | "sector_lbs" | "sector_hbs" | "terragraph" | "ptmp" | "station" | "access_point" | "hsu" | "other";

export type SeverityLevel = "not_classified" | "information" | "warning" | "average" | "high" | "disaster";

export interface InfraSiteSummary {
  code: string;
  totalHosts: number;
  hostsUp: number;
  hostsDown: number;
  hostsWarning: number;
  avgLatency: number | null;  // ms
}

export interface InfraHost {
  id: string;
  name: string;
  type: EquipmentType;
  detailedType: DetailedEquipmentType;
  detailedTypeLabel: string;
  status: "online" | "offline" | "unknown";
  ip: string;
  groups: string[];
  site: string;
  latency: number | null;       // ms
  packetLoss: number | null;    // %
  bandwidthIn: number | null;   // Mbps
  bandwidthOut: number | null;  // Mbps
  uptime: number | null;        // seconds
  connectedClients: number | null;
  lastStateChange: string | null;
  error: string;
}

export interface InfraProblem {
  id: string;
  name: string;
  severity: SeverityLevel;
  hostId: string;
  hostName: string;
  site: string;
  startTime: string;
  duration: number; // seconds
  acknowledged: boolean;
}

export interface InfraOverview {
  totalHosts: number;
  hostsUp: number;
  hostsDown: number;
  hostsUnknown: number;
  uptimePercent: number;
  problemsBySeverity: Record<SeverityLevel, number>;
  healthScore: number;
  totalProblems: number;
  sites: InfraSiteSummary[];
  zabbixConnected: boolean;
  updatedAt: string;
}

export interface HostLatency {
  hostId: string;
  hostName: string;
  current: number;   // ms
  avg: number;        // ms
  max: number;        // ms
  packetLoss: number; // %
  history: { time: string; value: number }[];
}

export interface InterfaceBandwidth {
  hostId: string;
  hostName: string;
  interfaceName: string;
  inMbps: number;
  outMbps: number;
  history: { time: string; inValue: number; outValue: number }[];
}

export interface APClient {
  hostId: string;
  hostName: string;
  clients: number;
  ip: string;
}

export interface OutageEvent {
  id: string;
  hostName: string;
  eventName: string;
  severity: SeverityLevel;
  startTime: string;
  endTime: string | null;
  duration: number; // seconds
  active: boolean;
}
