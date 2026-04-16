// ============================================
// Bequant BQN — Types (real API shapes)
// ============================================
// Reference: Integración Bequant BQN — WUIPI App (jefe de red)
// All list endpoints wrap results in { items: [...] }.
// Time-series endpoints return parallel arrays (timestamp + data).
// Data units: bandwidth/volume in kbps / kB, latency in ms,
// retransmission/congestion in %.
// ============================================

// --- Config (DB-persisted) ---

export interface BequantConfigRow {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  encrypted_password: string;
  ssl_verify: boolean;
  enabled: boolean;
  notes: string | null;
  last_test_at: string | null;
  last_test_status: "success" | "error" | null;
  last_test_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BequantConfigInput {
  label: string;
  host: string;
  port?: number;
  username: string;
  password: string;
  ssl_verify?: boolean;
  enabled?: boolean;
  notes?: string | null;
}

// --- BQN list wrapper ---

export interface BequantListResponse<T> {
  items: T[];
}

// --- Subscribers ---

export interface BequantSubscriber {
  subscriberIp: string;
  subscriberId?: string;
  subscriberGroups?: string[];
  policyRate?: string;
  policyAssignedBy?: "rules" | "api" | "default" | string;
}

// --- Subscriber groups ---

export interface BequantSubscriberGroup {
  subscriberGroupName: string;
  subscriberGroupType: "generic" | "all-subscribers" | string;
  subscriberRanges: string[];
  subscriberAll?: string[];
}

// --- Rate policies (real shape from BQN) ---

export interface BequantRateLimit {
  burstDuration: number;
  burstTransitionDuration: number;
  burstRate: number;
  burstThreshold: number;
  burstThresholdWindow: number;
  rate: number;
  congestionMgmt?: boolean;
}

export interface BequantRatePolicy {
  policyName: string;
  policyId: string;
  rateLimitDownlink: BequantRateLimit;
  rateLimitUplink: BequantRateLimit;
}

// --- Time-series ---

/** Time-series metric: parallel arrays (BQN returns -1 for missing samples). */
export interface BequantTimeSeries {
  subscriberIp?: string;
  timestamp: number[]; // unix epoch seconds
  dataDownlink?: number[];
  dataUplink?: number[];
}

/** DPI breakdown: time-series per category. */
export interface BequantDpiSeries {
  subscriberIp?: string;
  timestamp: number[];
  categories: Array<{
    name: string;
    usage: number[];
  }>;
}

// --- Aggregated (UI-friendly) metrics ---

/** Latest non-(-1) value from a time-series. */
export interface BequantMetricLatest {
  downlink: number | null;
  uplink: number | null;
  timestamp: number | null;
}

/** Node-wide snapshot for the dashboard. */
export interface BequantNodeSnapshot {
  takenAt: number;
  volumeDl: number | null;
  volumeUl: number | null;
  latencyDl: number | null;
  latencyUl: number | null;
  congestion: number | null;
  retransmissionDl: number | null;
  retransmissionUl: number | null;
  flowsActive: number | null;
  flowsCreated: number | null;
  trafficAtMaxSpeed: number | null;
  dpiDownlinkTop: Array<{ name: string; bytes: number }>;
  dpiUplinkTop: Array<{ name: string; bytes: number }>;
}

/** Subscriber detail composed of info + all time-series. */
export interface BequantSubscriberDetail {
  info: BequantSubscriber;
  bandwidth: BequantTimeSeries | null;
  latency: BequantTimeSeries | null;
  congestion: BequantTimeSeries | null;
  retransmission: BequantTimeSeries | null;
  flows: (BequantTimeSeries & { flowsCreated?: number[]; flowsActive?: number[] }) | null;
  volume: BequantTimeSeries | null;
  trafficAtMaxSpeed: BequantTimeSeries | null;
  dpiDownlink: BequantDpiSeries | null;
  dpiUplink: BequantDpiSeries | null;
  // Optional enrichment from Odoo mikrotik.service
  odoo?: {
    partnerId: number | null;
    partnerName: string | null;
    serviceName: string | null;
    serviceState: string | null;
    productName: string | null;
    nodeName: string | null;
    ipCpe: string | null;
    ipv4: string | null;
  };
}

// --- Supabase sync table rows ---

export interface BequantSubscriberRow {
  ip: string;
  subscriber_id: string | null;
  policy_rate: string | null;
  policy_assigned_by: string | null;
  subscriber_groups: string[];
  odoo_partner_id: number | null;
  odoo_service_id: number | null;
  odoo_partner_name: string | null;
  odoo_service_state: string | null;
  odoo_product_name: string | null;
  odoo_node_name: string | null;
  odoo_ip_cpe: string | null;
  odoo_ipv4: string | null;
  last_synced_at: string;
}

export interface BequantSubscriberGroupRow {
  name: string;
  group_type: string;
  ranges: string[];
  client_count: number;
  last_synced_at: string;
}

export interface BequantPolicyRow {
  name: string;
  policy_id: string;
  rate_dl: number;
  rate_ul: number;
  burst_rate_dl: number;
  burst_rate_ul: number;
  burst_threshold_dl: number;
  burst_threshold_ul: number;
  congestion_mgmt: boolean;
  last_synced_at: string;
}

export interface BequantMonthlyDpiRow {
  ip: string;
  year_month: string; // 'YYYY-MM'
  top_dl: Array<{ name: string; bytes: number }>;
  top_ul: Array<{ name: string; bytes: number }>;
  total_dl_bytes: number;
  total_ul_bytes: number;
  days_sampled: number;
  last_updated_at: string;
}

export interface BequantNodeSnapshotRow {
  id: string;
  taken_at: string;
  volume_dl: number | null;
  volume_ul: number | null;
  latency_dl: number | null;
  latency_ul: number | null;
  congestion: number | null;
  retransmission_dl: number | null;
  retransmission_ul: number | null;
  flows_active: number | null;
  flows_created: number | null;
  traffic_at_max_speed: number | null;
  dpi_downlink_top: Array<{ name: string; bytes: number }>;
  dpi_uplink_top: Array<{ name: string; bytes: number }>;
}

// --- Response types for API routes ---

export interface BequantTestResult {
  success: boolean;
  message: string;
  subscribers?: number;
  policies?: number;
}
