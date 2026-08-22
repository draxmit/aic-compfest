const BASE = "http://localhost:8000";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

export const api = {
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
