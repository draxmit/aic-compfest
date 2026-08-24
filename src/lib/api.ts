const BASE = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "http://localhost:8000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function upload<T>(path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${BASE}${path}`, { method: "POST", body });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export interface ExplainResult {
  bullets: string[];
  source: "gemini" | "template";
  model: string | null;
}

export interface AcmResult {
  churn_probability: number;
  customers_at_risk: number;
  high_clv_customers: number;
  voucher_label: string;
  voucher_amount_idr: number;
  total_intervention_cost_idr: number;
  churn_cost_without_action_idr: number;
  net_benefit_idr: number;
  dynamic_pricing_uplift_pct: number;
  recommended_action: string;
}

export interface AcmMessageResult {
  message: string;
  source: "gemini" | "template";
  model: string | null;
  language: string;
  voucher_idr: number;
}

export interface MarketSentimentResult {
  scope: "local" | "industry-wide";
  summary: string;
  source: "gemini" | "template";
  model: string | null;
}

export interface DetectResult {
  anomaly_score: number;
  z_score: number;
  is_anomaly: boolean;
  severity: "critical" | "high" | "medium";
  confidence: number;
  source: "model" | "demo_fallback";
}

export interface ImpactResult {
  sla_breach_prob: number;
  expected_loss_idr: number;
  affected_orders: number;
  source: "model" | "demo_fallback";
}

export interface OptimizeOption {
  id: string;
  label: string;
  summary: string;
  expected_loss_idr: number;
  sla_risk: number;
  lead_time_hours: number;
  extra_cost_idr: number;
  feasibility: number;
  recommended: boolean;
}

export interface OptimizeResult {
  options: OptimizeOption[];
  objective: string;
  solver: string;
}

export interface ApiActionRecord {
  id: string;
  exceptionId: string;
  exceptionCode: string;
  exceptionTitle: string;
  optionId: string;
  optionLabel: string;
  recommendedOptionId: string;
  decision: "approved" | "rejected";
  note?: string | undefined;
  expectedLoss: number;
  baselineLoss: number;
  lossAvoided: number;
  timestamp: string;
  status: "Executed (simulated)" | "Dismissed";
}

export interface UploadResult {
  dataset_type: string;
  rows_success: number;
  rows_failed: number;
  errors: { row: number; reason: string }[];
}

export interface OverviewResult {
  active_exceptions: number;
  open_exceptions: number;
  approved_exceptions: number;
  potential_loss_idr: number;
  loss_avoided_idr: number;
  worst_sla_risk: number;
  total_affected_orders: number;
  system_health: { name: string; status: string; detail: string }[];
  recent_actions: {
    id: string;
    exceptionCode: string;
    exceptionTitle: string;
    optionLabel: string;
    decision: string;
    lossAvoided: number;
    timestamp: string;
  }[];
  source: "live" | "demo";
}

export interface FinanceResult {
  exposure_idr: number;
  loss_avoided_idr: number;
  recovery_spend_idr: number;
  net_benefit_idr: number;
  weekly_trend: { label: string; lossAvoided: number; recoveryCost: number }[];
  action_breakdown: { type: string; count: number; lossAvoided: number; spend: number }[];
  open_exception_count: number;
  source: "live" | "demo";
}

export const api = {
  orders: () => get<typeof import("./ops-data").ORDERS>("/api/orders"),

  inventory: () => get<typeof import("./ops-data").INVENTORY>("/api/inventory"),

  production: () => get<typeof import("./ops-data").PRODUCTION>("/api/production"),

  shipments: () => get<typeof import("./ops-data").SHIPMENTS>("/api/shipments"),

  suppliers: () => get<{ supplier: string; material: string; leadTimeDays: number; reliabilityPct: number; costPerUnitIdr: number }[]>("/api/suppliers"),

  uploadDataset: (datasetType: "orders" | "inventory" | "production" | "shipments" | "suppliers", file: File) =>
    upload<UploadResult>(`/api/uploads/${datasetType}`, file),

  exceptions: () => get<import("./ops-data").OpsException[]>("/api/exceptions"),

  exception: (id: string) => get<import("./ops-data").OpsException>(`/api/exceptions/${id}`),

  detectExceptions: () =>
    post<{
      detected_count: number;
      exception_ids: string[];
      exceptions: import("./ops-data").OpsException[];
      source: string;
    }>("/api/exceptions/detect", {}),

  actions: () => get<ApiActionRecord[]>("/api/actions"),

  clearActions: () => del<{ cleared: boolean }>("/api/actions"),

  approveException: (id: string, body: { option_id: string; note?: string | undefined }) =>
    post<ApiActionRecord>(`/api/exceptions/${id}/approve`, body),

  rejectException: (id: string, body: { option_id: string; note?: string | undefined }) =>
    post<ApiActionRecord>(`/api/exceptions/${id}/reject`, body),

  overview: () => get<OverviewResult>("/api/overview"),

  finance: () => get<FinanceResult>("/api/finance"),

  detect: (body: {
    exception_type: "supplier_delay" | "demand_spike" | "shipment_delay";
    predicted_delay_hours?: number;
    historical_mean_days?: number;
    historical_std_days?: number;
    supplier_reliability?: number;
    order_count?: number;
    rolling_mean?: number;
    rolling_std?: number;
    carrier_delay_days?: number;
    item_count?: number;
    order_value?: number;
  }) => post<DetectResult>("/api/detect", body),

  impact: (body: {
    exception_type: "supplier_delay" | "demand_spike" | "shipment_delay";
    delay_days: number;
    carrier_delay_days: number;
    item_count: number;
    order_value: number;
    purchase_hour: number;
    purchase_dow: number;
    purchase_month: number;
    affected_orders: number;
    scale_factor: number;
  }) => post<ImpactResult>("/api/impact", body),

  optimize: (body: {
    exception_type: "supplier_delay" | "demand_spike" | "shipment_delay";
    required_units: number;
    baseline_loss: number;
    sla_penalty_per_unit: number;
    delay_hours: number;
    inventory_cover_days: number;
    affected_orders: number;
  }) => post<OptimizeResult>("/api/optimize", body),

  explain: (body: {
    exception_type: string;
    recommended_label: string;
    recommended_loss_idr: number;
    baseline_loss_idr: number;
    sla_risk: number;
    lead_time_hours: number;
    affected_orders: number;
    top_drivers: string[];
  }) => post<ExplainResult>("/api/explain", body),

  acm: (body: {
    sla_breach_prob: number;
    affected_customers: number;
    avg_clv_score: number;
    high_clv_count: number;
    exception_type: string;
    delay_hours: number;
  }) => post<AcmResult>("/api/acm", body),

  acmMessage: (body: {
    exception_type: string;
    delay_hours: number;
    voucher_amount_idr: number;
    customer_segment: string;
  }) => post<AcmMessageResult>("/api/acm/message", body),

  marketSentiment: (body: { exception_type: string; severity: string }) =>
    post<MarketSentimentResult>("/api/market-sentiment", body),
};
