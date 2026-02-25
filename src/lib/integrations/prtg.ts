// ===========================================
// PRTG API Client
// ===========================================

import type {
  PRTGSensor,
  PRTGDevice,
  PRTGChannel,
  PRTGStatus,
  NetworkNode,
  NetworkAlert,
  NetworkOverview,
} from "@/types/prtg";

const PRTG_URL = process.env.PRTG_SERVER_URL; // e.g. https://prtg.wuipi.com
const PRTG_USERNAME = process.env.PRTG_USERNAME;
const PRTG_PASSHASH = process.env.PRTG_PASSHASH;

function buildUrl(endpoint: string, params: Record<string, string> = {}): string {
  if (!PRTG_URL || !PRTG_USERNAME || !PRTG_PASSHASH) {
    throw new Error("PRTG credentials not configured");
  }

  const url = new URL(`/api/${endpoint}`, PRTG_URL);
  url.searchParams.set("username", PRTG_USERNAME);
  url.searchParams.set("passhash", PRTG_PASSHASH);
  url.searchParams.set("output", "json");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

async function prtgFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = buildUrl(endpoint, params);

  const response = await fetch(url, {
    next: { revalidate: 30 }, // Cache 30 seconds
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`PRTG API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// --- Raw API calls ---

export async function getSensors(columns?: string): Promise<PRTGSensor[]> {
  const cols = columns || "objid,device,sensor,status,status_raw,message,lastvalue,lastup,lastdown,downtime,uptime,group,tags,parentid";

  const data = await prtgFetch<{ sensors: PRTGSensor[] }>("table.json", {
    content: "sensors",
    columns: cols,
    count: "2500",
  });

  return data.sensors || [];
}

export async function getDevices(): Promise<PRTGDevice[]> {
  const data = await prtgFetch<{ devices: PRTGDevice[] }>("table.json", {
    content: "devices",
    columns: "objid,device,group,status",
    count: "500",
  });

  return data.devices || [];
}

export async function getSensorDetails(sensorId: number): Promise<PRTGChannel[]> {
  const data = await prtgFetch<{ channels: PRTGChannel[] }>(
    "table.json",
    {
      content: "channels",
      columns: "name,lastvalue,lastvalue_raw",
      id: sensorId.toString(),
    }
  );

  return data.channels || [];
}

export async function getStatus(): Promise<{
  NewAlarms: number;
  Alarms: number;
  AckAlarms: number;
  NewToDos: number;
  Clock: string;
  ActivMonitoringLicenses: number;
  Version: string;
}> {
  return prtgFetch("getstatus.json");
}

// --- Normalized data for our app ---

function mapPrtgStatus(status: PRTGStatus): NetworkNode["status"] {
  switch (status) {
    case "Up":
      return "online";
    case "Down":
      return "critical";
    case "Down (Acknowledged)":
      return "offline";
    case "Warning":
      return "warning";
    case "Unusual":
      return "degraded";
    case "Paused":
      return "paused";
    default:
      return "warning";
  }
}

function mapAlertSeverity(status: PRTGStatus): NetworkAlert["severity"] {
  switch (status) {
    case "Down":
    case "Down (Acknowledged)":
      return "critical";
    case "Warning":
    case "Unusual":
      return "warning";
    default:
      return "info";
  }
}

function parseMetricValue(value: string): number {
  // PRTG returns values like "1.234 Mbps" or "5 ms" or "0.5 %"
  const num = parseFloat(value.replace(/[^0-9.-]/g, ""));
  return isNaN(num) ? 0 : num;
}

export async function getNetworkOverview(): Promise<NetworkOverview> {
  const [sensors, devices, status] = await Promise.all([
    getSensors(),
    getDevices(),
    getStatus(),
  ]);

  // Build nodes from devices
  const nodes: NetworkNode[] = devices.map((device) => {
    const deviceSensors = sensors.filter((s) => s.device === device.device);
    const sensorsUp = deviceSensors.filter((s) => s.status === "Up").length;
    const sensorsDown = deviceSensors.filter((s) => s.status === "Down").length;
    const sensorsWarning = deviceSensors.filter(
      (s) => s.status === "Warning" || s.status === "Unusual"
    ).length;

    // Extract metrics from sensor values
    const bandwidthSensor = deviceSensors.find(
      (s) => s.sensor.toLowerCase().includes("traffic") || s.tags?.includes("bandwidth")
    );
    const pingSensor = deviceSensors.find(
      (s) => s.sensor.toLowerCase().includes("ping")
    );

    return {
      id: device.objid,
      name: device.device,
      group: device.group,
      status: mapPrtgStatus(device.status),
      sensors: {
        total: deviceSensors.length,
        up: sensorsUp,
        down: sensorsDown,
        warning: sensorsWarning,
      },
      metrics: {
        latency: pingSensor ? parseMetricValue(pingSensor.lastvalue) : undefined,
        bandwidth_in: bandwidthSensor
          ? parseMetricValue(bandwidthSensor.lastvalue)
          : undefined,
      },
      last_up: deviceSensors[0]?.lastup,
      last_down: deviceSensors[0]?.lastdown,
      updated_at: new Date().toISOString(),
    };
  });

  // Build alerts from sensors in non-Up state
  const alerts: NetworkAlert[] = sensors
    .filter((s) => s.status !== "Up" && s.status !== "Paused")
    .map((s) => ({
      id: s.objid,
      sensor_id: s.objid,
      device: s.device,
      sensor: s.sensor,
      status: s.status,
      message: s.message || `${s.sensor} is ${s.status}`,
      timestamp: s.lastdown || new Date().toISOString(),
      severity: mapAlertSeverity(s.status),
    }))
    .sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

  // Calculate overview metrics
  const totalSensors = sensors.length;
  const sensorsUp = sensors.filter((s) => s.status === "Up").length;
  const sensorsDown = sensors.filter((s) => s.status === "Down").length;
  const sensorsWarning = sensors.filter(
    (s) => s.status === "Warning" || s.status === "Unusual"
  ).length;

  // Health score: 100 - (down_percentage * 2) - (warning_percentage * 0.5)
  const downPct = totalSensors > 0 ? (sensorsDown / totalSensors) * 100 : 0;
  const warnPct = totalSensors > 0 ? (sensorsWarning / totalSensors) * 100 : 0;
  const healthScore = Math.max(0, Math.min(100, Math.round(100 - downPct * 2 - warnPct * 0.5)));

  return {
    total_devices: devices.length,
    devices_up: devices.filter((d) => d.status === "Up").length,
    devices_down: devices.filter((d) => d.status === "Down").length,
    devices_warning: devices.filter(
      (d) => d.status === "Warning" || d.status === "Unusual"
    ).length,
    total_sensors: totalSensors,
    sensors_up: sensorsUp,
    sensors_down: sensorsDown,
    sensors_warning: sensorsWarning,
    avg_latency: 0,  // Will be calculated from ping sensors
    avg_packet_loss: 0,
    total_bandwidth_in: 0,
    total_bandwidth_out: 0,
    health_score: healthScore,
    alerts,
    nodes,
    updated_at: new Date().toISOString(),
  };
}
