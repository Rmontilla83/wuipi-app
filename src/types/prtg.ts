// ===========================================
// PRTG API Type Definitions
// ===========================================

export interface PRTGSensor {
  objid: number;
  device: string;
  sensor: string;
  status: PRTGStatus;
  status_raw: number;
  message: string;
  lastvalue: string;
  lastup: string;
  lastdown: string;
  downtime: string;
  uptime: string;
  group: string;
  tags: string;
  parentid: number;
}

export type PRTGStatus =
  | "Up"
  | "Down"
  | "Warning"
  | "Paused"
  | "Unknown"
  | "Unusual"
  | "Down (Acknowledged)";

export interface PRTGChannel {
  name: string;
  lastvalue: string;
  lastvalue_raw: number;
}

export interface PRTGSensorDetails {
  objid: number;
  name: string;
  status: PRTGStatus;
  channels: PRTGChannel[];
}

export interface PRTGDevice {
  objid: number;
  device: string;
  group: string;
  status: PRTGStatus;
  sensors_total: number;
  sensors_up: number;
  sensors_down: number;
  sensors_warning: number;
}

// Normalized types for our app
export interface NetworkNode {
  id: number;
  name: string;
  group: string;
  status: "online" | "degraded" | "warning" | "critical" | "offline" | "paused";
  sensors: {
    total: number;
    up: number;
    down: number;
    warning: number;
  };
  metrics: {
    bandwidth_in?: number;  // Mbps
    bandwidth_out?: number; // Mbps
    latency?: number;       // ms
    packet_loss?: number;   // %
    uptime?: number;        // %
    cpu_load?: number;      // %
    memory_usage?: number;  // %
  };
  last_up?: string;
  last_down?: string;
  updated_at: string;
}

export interface NetworkAlert {
  id: number;
  sensor_id: number;
  device: string;
  sensor: string;
  status: PRTGStatus;
  message: string;
  timestamp: string;
  severity: "critical" | "warning" | "info";
}

export interface NetworkOverview {
  total_devices: number;
  devices_up: number;
  devices_down: number;
  devices_warning: number;
  total_sensors: number;
  sensors_up: number;
  sensors_down: number;
  sensors_warning: number;
  avg_latency: number;
  avg_packet_loss: number;
  total_bandwidth_in: number;
  total_bandwidth_out: number;
  health_score: number;
  alerts: NetworkAlert[];
  nodes: NetworkNode[];
  updated_at: string;
}
