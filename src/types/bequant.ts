// ============================================
// Bequant QoE — Types
// ============================================

export interface BequantSubscriber {
  ip: string;
  policyName: string;
  groupName: string;
  metrics: BequantMetrics;
}

export interface BequantMetrics {
  bandwidth: { uplink: number; downlink: number }; // bps real
  latency: number; // ms
  retransmissions: number; // % TCP retransmissions
  congestion: number; // %
  trafficAtMaxSpeed: number; // % tiempo a velocidad máxima
  volume: { uplink: number; downlink: number }; // bytes
}

export interface BequantDPI {
  apps: Array<{ name: string; percentage: number; bytes: number }>;
}

export type QoELevel = "excellent" | "acceptable" | "degraded";

export interface QoEScore {
  score: number; // 0-100
  level: QoELevel;
  factors: {
    speedVsPlan: number; // % de velocidad real vs contratada
    latency: number;
    retransmissions: number;
    congestion: number;
  };
}

export interface BequantResponse {
  connected: boolean;
  message?: string;
  subscriber?: BequantSubscriber;
  metrics?: BequantMetrics;
  dpi?: BequantDPI;
  qoe?: QoEScore;
}
