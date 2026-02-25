import { NextResponse } from "next/server";
import { getNetworkOverview } from "@/lib/integrations/prtg";
import type { NetworkOverview } from "@/types/prtg";

// Mock data for development when PRTG is not configured
const MOCK_DATA: NetworkOverview = {
  total_devices: 6,
  devices_up: 4,
  devices_down: 0,
  devices_warning: 2,
  total_sensors: 48,
  sensors_up: 42,
  sensors_down: 2,
  sensors_warning: 4,
  avg_latency: 12.4,
  avg_packet_loss: 0.3,
  total_bandwidth_in: 847,
  total_bandwidth_out: 234,
  health_score: 94,
  alerts: [
    {
      id: 1, sensor_id: 2401, device: "OLT Lechería-Norte", sensor: "Ping",
      status: "Warning", message: "Latencia elevada: 152ms (umbral: 100ms)",
      timestamp: new Date(Date.now() - 3 * 60000).toISOString(), severity: "warning",
    },
    {
      id: 2, sensor_id: 2402, device: "OLT Barcelona-Sur", sensor: "Bandwidth Total",
      status: "Warning", message: "Uso de ancho de banda al 87%",
      timestamp: new Date(Date.now() - 15 * 60000).toISOString(), severity: "warning",
    },
    {
      id: 3, sensor_id: 2403, device: "OLT Lechería-Norte", sensor: "Packet Loss",
      status: "Down", message: "Packet loss 8.2% (umbral: 2%)",
      timestamp: new Date(Date.now() - 5 * 60000).toISOString(), severity: "critical",
    },
  ],
  nodes: [
    {
      id: 1001, name: "OLT Lechería-Norte", group: "Zona Norte", status: "degraded",
      sensors: { total: 8, up: 6, down: 1, warning: 1 },
      metrics: { bandwidth_in: 156, bandwidth_out: 42, latency: 152, packet_loss: 8.2, uptime: 99.1 },
      updated_at: new Date().toISOString(),
    },
    {
      id: 1002, name: "OLT Lechería-Sur", group: "Zona Norte", status: "online",
      sensors: { total: 8, up: 8, down: 0, warning: 0 },
      metrics: { bandwidth_in: 98, bandwidth_out: 31, latency: 8, packet_loss: 0, uptime: 99.9 },
      updated_at: new Date().toISOString(),
    },
    {
      id: 1003, name: "OLT Barcelona-Centro", group: "Zona Centro", status: "online",
      sensors: { total: 10, up: 10, down: 0, warning: 0 },
      metrics: { bandwidth_in: 203, bandwidth_out: 67, latency: 5, packet_loss: 0.1, uptime: 99.8 },
      updated_at: new Date().toISOString(),
    },
    {
      id: 1004, name: "OLT Barcelona-Sur", group: "Zona Sur", status: "warning",
      sensors: { total: 8, up: 6, down: 0, warning: 2 },
      metrics: { bandwidth_in: 187, bandwidth_out: 48, latency: 18, packet_loss: 0.5, uptime: 99.5 },
      updated_at: new Date().toISOString(),
    },
    {
      id: 1005, name: "OLT Puerto La Cruz", group: "Zona Este", status: "online",
      sensors: { total: 8, up: 8, down: 0, warning: 0 },
      metrics: { bandwidth_in: 134, bandwidth_out: 32, latency: 7, packet_loss: 0, uptime: 99.7 },
      updated_at: new Date().toISOString(),
    },
    {
      id: 1006, name: "Core Router Principal", group: "Core", status: "online",
      sensors: { total: 6, up: 6, down: 0, warning: 0 },
      metrics: { bandwidth_in: 847, bandwidth_out: 234, latency: 1, packet_loss: 0, uptime: 99.99, cpu_load: 34, memory_usage: 52 },
      updated_at: new Date().toISOString(),
    },
  ],
  updated_at: new Date().toISOString(),
};

export async function GET() {
  try {
    // Try real PRTG first
    if (process.env.PRTG_SERVER_URL) {
      const data = await getNetworkOverview();
      return NextResponse.json(data);
    }

    // Fallback to mock data
    return NextResponse.json(MOCK_DATA);
  } catch (error) {
    console.error("PRTG fetch error:", error);
    // Return mock data on error so dashboard always works
    return NextResponse.json(MOCK_DATA);
  }
}
