export type ExceptionType = "supplier_delay" | "demand_spike" | "shipment_delay";
export type Severity = "critical" | "high" | "medium";

export interface RecoveryOption {
  id: string;
  label: string;
  summary: string;
  expectedLoss: number;
  slaRisk: number;
  leadTimeHours: number;
  extraCost: number;
  feasibility: number;
  recommended?: boolean;
}

export interface ActionStep {
  id: string;
  label: string;
  system: string;
  owner: string;
}

export interface OpsException {
  id: string;
  code: string;
  type: ExceptionType;
  severity: Severity;
  title: string;
  detectedAt: string;
  source: string;
  confidence: number;
  detection: { signal: string; baseline: string; observed: string; rule: string };
  impact: {
    affectedOrders: number;
    productionDelayHours: number;
    inventoryCoverDays: number;
    logisticsNote: string;
    slaRisk: number;
    expectedLoss: number;
  };
  options: RecoveryOption[];
  explanation: string[];
  actionPlan: ActionStep[];
  timeline: { t: string; baseline: number; projected: number }[];
  acmMeta: {
    affectedCustomers: number;
    avgClvScore: number;
    highClvCount: number;
    delayHours: number;
  };
}

export const EXCEPTION_TYPE_LABEL: Record<ExceptionType, string> = {
  supplier_delay: "Supplier Delay",
  demand_spike: "Demand Spike",
  shipment_delay: "Shipment Delay",
};

const mkTimeline = (base: number, drift: number[]) =>
  drift.map((d, i) => ({
    t: `D+${i}`,
    baseline: base,
    projected: Math.round(base * d),
  }));

export const EXCEPTIONS: OpsException[] = [
  {
    id: "exc-1042",
    code: "EXC-1042",
    type: "supplier_delay",
    severity: "critical",
    title: "Supplier PT Mitra Baja late 36h on RM-Steel-A1",
    detectedAt: "2026-08-22T02:10:00Z",
    source: "Manufacturing · Inbound Material",
    confidence: 0.94,
    detection: {
      signal: "Inbound material arrival for PO-88421 (100,000 units order)",
      baseline: "Monday 08:00 — historical on-time rate 91%",
      observed: "Predicted arrival Wednesday 20:00",
      rule: "Arrival forecast deviates +36h vs. contracted lead time (>3σ of supplier history)",
    },
    impact: {
      affectedOrders: 12400,
      productionDelayHours: 36,
      inventoryCoverDays: 1.4,
      logisticsNote: "3 outbound truck slots (JKT-01, JKT-04, SBY-02) at risk of missing cutoff",
      slaRisk: 0.71,
      expectedLoss: 180_000_000,
    },
    options: [
      {
        id: "opt-wait",
        label: "Wait for current supplier",
        summary: "No intervention. Absorb the 36h delay and reschedule downstream production.",
        expectedLoss: 180_000_000,
        slaRisk: 0.71,
        leadTimeHours: 36,
        extraCost: 0,
        feasibility: 1,
      },
      {
        id: "opt-backup",
        label: "Use Supplier B (100%)",
        summary: "Move 100% of RM-Steel-A1 volume to Supplier B for faster recovery with higher recovery spend.",
        expectedLoss: 42_000_000,
        slaRisk: 0.08,
        leadTimeHours: 12,
        extraCost: 30_000_000,
        feasibility: 0.88,
      },
      {
        id: "opt-split",
        label: "Split Supplier A + B (40% to B)",
        summary: "Keep 60% with Supplier A and source 40% from Supplier B to balance recovery cost and SLA risk.",
        expectedLoss: 60_000_000,
        slaRisk: 0.19,
        leadTimeHours: 20,
        extraCost: 18_000_000,
        feasibility: 0.95,
        recommended: true,
      },
    ],
    explanation: [
      "Split Supplier A + B is recommended because it avoids most of the Rp180M do-nothing loss while keeping recovery spend lower than a full backup switch.",
      "SLA breach probability drops from 71% to 19% while additional recovery cost stays at Rp18M.",
      "Top drivers: supplier lead-time deviation (+36h), order concentration (12,400 orders on one SKU), remaining inventory cover (1.4 days).",
      "Constraint check passed: Supplier B covers 40% of the material gap while Supplier A remains active for the remaining volume.",
    ],
    actionPlan: [
      { id: "a1", label: "Allocate 40% of RM-Steel-A1 volume to Supplier B", system: "Procurement (simulated)", owner: "Supply Chain Mgr" },
      { id: "a2", label: "Keep 60% of RM-Steel-A1 volume with Supplier A and monitor revised arrival", system: "Procurement (simulated)", owner: "Supply Chain Mgr" },
      { id: "a3", label: "Reschedule Product A production with a +6h buffer", system: "Production (simulated)", owner: "Plant Planner" },
      { id: "a4", label: "Prioritize 12,400 affected orders in the fulfillment queue", system: "Orders (simulated)", owner: "Ops Analyst" },
      { id: "a5", label: "Raise shipment priority for JKT-01, JKT-04, SBY-02", system: "Logistics (simulated)", owner: "Logistics Lead" },
    ],
    timeline: mkTimeline(2600, [1, 0.62, 0.38, 0.7, 0.95, 1.02, 1]),
    acmMeta: { affectedCustomers: 12400, avgClvScore: 0.61, highClvCount: 3100, delayHours: 36 },
  },
  {
    id: "exc-1043",
    code: "EXC-1043",
    type: "demand_spike",
    severity: "high",
    title: "Demand spike +214% on SKU-3391 (Jabodetabek)",
    detectedAt: "2026-08-22T05:40:00Z",
    source: "Commerce · Order Stream",
    confidence: 0.89,
    detection: {
      signal: "Rolling 6h order velocity for SKU-3391",
      baseline: "412 orders / 6h (28-day median)",
      observed: "1,294 orders / 6h",
      rule: "Velocity z-score 4.7 sustained over 3 consecutive windows",
    },
    impact: {
      affectedOrders: 5800,
      productionDelayHours: 0,
      inventoryCoverDays: 0.6,
      logisticsNote: "DC-Jakarta picking capacity saturated at 118% of shift plan",
      slaRisk: 0.54,
      expectedLoss: 74_000_000,
    },
    options: [
      {
        id: "opt-nothing",
        label: "Do nothing",
        summary: "Serve on a first-come basis until stock-out; backorder the remainder.",
        expectedLoss: 74_000_000,
        slaRisk: 0.54,
        leadTimeHours: 0,
        extraCost: 0,
        feasibility: 1,
      },
      {
        id: "opt-rebalance",
        label: "Rebalance stock from DC-Bandung + DC-Surabaya",
        summary: "Transfer 9,000 units, add one evening picking shift at DC-Jakarta.",
        expectedLoss: 21_000_000,
        slaRisk: 0.16,
        leadTimeHours: 10,
        extraCost: 9_500_000,
        feasibility: 0.92,
        recommended: true,
      },
      {
        id: "opt-cap",
        label: "Cap listing quantity",
        summary: "Throttle purchasable quantity to 2 units/order to protect SLA.",
        expectedLoss: 38_000_000,
        slaRisk: 0.22,
        leadTimeHours: 1,
        extraCost: 0,
        feasibility: 0.99,
      },
    ],
    explanation: [
      "Stock rebalancing has the lowest expected loss (Rp21M) while keeping revenue intact; capping quantity protects SLA but forfeits ~Rp17M of demand.",
      "Inventory cover is only 0.6 days at current velocity — the constraint is warehouse throughput, not production.",
      "Top drivers: order velocity z-score 4.7, DC-Jakarta utilization 118%, transfer lane Bandung→Jakarta at 10h.",
    ],
    actionPlan: [
      { id: "b1", label: "Create transfer order 6,000 units DC-Bandung → DC-Jakarta", system: "Inventory (simulated)", owner: "Inventory Planner" },
      { id: "b2", label: "Create transfer order 3,000 units DC-Surabaya → DC-Jakarta", system: "Inventory (simulated)", owner: "Inventory Planner" },
      { id: "b3", label: "Open extra evening picking shift at DC-Jakarta", system: "Warehouse (simulated)", owner: "DC Supervisor" },
    ],
    timeline: mkTimeline(1200, [1, 2.1, 3.14, 2.6, 1.8, 1.3, 1.05]),
    acmMeta: { affectedCustomers: 5800, avgClvScore: 0.55, highClvCount: 1450, delayHours: 0 },
  },
  {
    id: "exc-1044",
    code: "EXC-1044",
    type: "shipment_delay",
    severity: "medium",
    title: "Shipment delay on lane Semarang → Makassar (weather)",
    detectedAt: "2026-08-22T06:25:00Z",
    source: "Logistics · Lane Monitor",
    confidence: 0.81,
    detection: {
      signal: "ETA drift for 6 shipments on lane SRG→UPG (sea freight leg)",
      baseline: "Transit 52h, on-time rate 88%",
      observed: "Projected transit 74h; port weather advisory active",
      rule: "ETA drift +22h with weather severity index ≥ 3",
    },
    impact: {
      affectedOrders: 2150,
      productionDelayHours: 0,
      inventoryCoverDays: 3.2,
      logisticsNote: "6 shipments, 2 of them SLA-critical (next-day promise)",
      slaRisk: 0.44,
      expectedLoss: 29_000_000,
    },
    options: [
      {
        id: "opt-hold",
        label: "Hold and wait for the weather window",
        summary: "Keep current sea route, notify customers of a 1-day slip.",
        expectedLoss: 29_000_000,
        slaRisk: 0.44,
        leadTimeHours: 74,
        extraCost: 0,
        feasibility: 1,
      },
      {
        id: "opt-air",
        label: "Air-freight the SLA-critical subset",
        summary: "Move 480 SLA-critical units to air, keep the rest on sea freight.",
        expectedLoss: 11_500_000,
        slaRisk: 0.12,
        leadTimeHours: 20,
        extraCost: 7_800_000,
        feasibility: 0.9,
        recommended: true,
      },
      {
        id: "opt-reroute",
        label: "Reroute via Surabaya hub",
        summary: "Consolidate into the SBY hub and use an alternate carrier.",
        expectedLoss: 18_000_000,
        slaRisk: 0.25,
        leadTimeHours: 58,
        extraCost: 4_200_000,
        feasibility: 0.7,
      },
    ],
    explanation: [
      "Partial air freight resolves only the SLA-critical subset, minimizing expected total cost (Rp11.5M) instead of upgrading all 6 shipments.",
      "Rerouting via Surabaya is cheaper per unit but has 70% feasibility — the alternate carrier has limited capacity this week.",
      "Top drivers: ETA drift +22h, 2 next-day-promise shipments, weather advisory duration 18h.",
    ],
    actionPlan: [
      { id: "c1", label: "Split shipment SH-7712 and book air freight for 480 units", system: "Logistics (simulated)", owner: "Logistics Lead" },
      { id: "c2", label: "Update shipment priority and customer ETA notifications", system: "Orders (simulated)", owner: "Ops Analyst" },
    ],
    timeline: mkTimeline(900, [1, 1.05, 1.4, 1.65, 1.3, 1.08, 1]),
    acmMeta: { affectedCustomers: 2150, avgClvScore: 0.58, highClvCount: 480, delayHours: 22 },
  },
];

export const SYSTEM_HEALTH = [
  { name: "Commerce feed", status: "healthy", detail: "Order stream lag 42s" },
  { name: "Manufacturing feed", status: "healthy", detail: "MES snapshot 3m ago" },
  { name: "Logistics feed", status: "degraded", detail: "Weather API retry 1/3" },
  { name: "Impact model", status: "healthy", detail: "LightGBM v0.4 · MAE 6.1%" },
  { name: "Optimizer", status: "healthy", detail: "OR-Tools CP-SAT · 240ms" },
  { name: "ACM pipeline", status: "healthy", detail: "Gemini Flash · p95 1.8s" },
  { name: "Anomaly detector", status: "healthy", detail: "Isolation Forest · last scan 8m" },
] as const;

// ── Orders ──────────────────────────────────────────────────────────────────

export const ORDERS = [
  { id: "ORD-90412", sku: "SKU-3391",    qty: 3200,  region: "Jabodetabek", promise: "2026-08-24", status: "At risk",  exception: "exc-1043" },
  { id: "ORD-90418", sku: "RM-Steel-A1", qty: 100000,region: "Karawang",    promise: "2026-08-26", status: "At risk",  exception: "exc-1042" },
  { id: "ORD-90431", sku: "SKU-1180",    qty: 640,   region: "Makassar",    promise: "2026-08-23", status: "At risk",  exception: "exc-1044" },
  { id: "ORD-90440", sku: "SKU-2210",    qty: 1800,  region: "Bandung",     promise: "2026-08-25", status: "On track", exception: null },
  { id: "ORD-90455", sku: "SKU-7702",    qty: 950,   region: "Medan",       promise: "2026-08-27", status: "On track", exception: null },
  { id: "ORD-90460", sku: "SKU-3391",    qty: 800,   region: "Surabaya",    promise: "2026-08-24", status: "At risk",  exception: "exc-1043" },
  { id: "ORD-90471", sku: "SKU-1180",    qty: 1200,  region: "Makassar",    promise: "2026-08-23", status: "At risk",  exception: "exc-1044" },
  { id: "ORD-90482", sku: "SKU-4421",    qty: 3600,  region: "Jabodetabek", promise: "2026-08-25", status: "On track", exception: null },
  { id: "ORD-90493", sku: "SKU-7702",    qty: 420,   region: "Medan",       promise: "2026-08-28", status: "On track", exception: null },
  { id: "ORD-90504", sku: "SKU-3391",    qty: 2100,  region: "Surabaya",    promise: "2026-08-24", status: "At risk",  exception: "exc-1043" },
  { id: "ORD-90517", sku: "RM-Steel-A1", qty: 50000, region: "Bekasi",      promise: "2026-08-26", status: "At risk",  exception: "exc-1042" },
  { id: "ORD-90528", sku: "SKU-5512",    qty: 680,   region: "Semarang",    promise: "2026-08-27", status: "On track", exception: null },
  { id: "ORD-90539", sku: "SKU-2210",    qty: 2400,  region: "Bandung",     promise: "2026-08-25", status: "On track", exception: null },
  { id: "ORD-90550", sku: "SKU-9913",    qty: 1100,  region: "Bali",        promise: "2026-08-28", status: "On track", exception: null },
  { id: "ORD-90561", sku: "SKU-4421",    qty: 760,   region: "Palembang",   promise: "2026-08-27", status: "On track", exception: null },
  { id: "ORD-90574", sku: "SKU-6610",    qty: 2200,  region: "Jabodetabek", promise: "2026-08-25", status: "On track", exception: null },
  { id: "ORD-90588", sku: "SKU-8820",    qty: 4500,  region: "Surabaya",    promise: "2026-08-26", status: "On track", exception: null },
  { id: "ORD-90601", sku: "SKU-1180",    qty: 880,   region: "Balikpapan",  promise: "2026-08-29", status: "On track", exception: null },
  { id: "ORD-90615", sku: "SKU-3391",    qty: 1400,  region: "Yogyakarta",  promise: "2026-08-25", status: "At risk",  exception: "exc-1043" },
  { id: "ORD-90628", sku: "RM-Steel-A1", qty: 30000, region: "Karawang",    promise: "2026-08-27", status: "At risk",  exception: "exc-1042" },
  { id: "ORD-90641", sku: "SKU-5512",    qty: 1200,  region: "Pekanbaru",   promise: "2026-08-29", status: "On track", exception: null },
  { id: "ORD-90654", sku: "SKU-9913",    qty: 860,   region: "Bali",        promise: "2026-08-29", status: "On track", exception: null },
  { id: "ORD-90667", sku: "SKU-7702",    qty: 1640,  region: "Jabodetabek", promise: "2026-08-26", status: "On track", exception: null },
  { id: "ORD-90680", sku: "SKU-2210",    qty: 3100,  region: "Medan",       promise: "2026-08-28", status: "On track", exception: null },
  { id: "ORD-90693", sku: "SKU-6610",    qty: 980,   region: "Makassar",    promise: "2026-08-25", status: "At risk",  exception: "exc-1044" },
  { id: "ORD-90706", sku: "SKU-4421",    qty: 2800,  region: "Bandung",     promise: "2026-08-27", status: "On track", exception: null },
  { id: "ORD-90719", sku: "SKU-8820",    qty: 1900,  region: "Semarang",    promise: "2026-08-28", status: "On track", exception: null },
  { id: "ORD-90732", sku: "SKU-1180",    qty: 540,   region: "Pontianak",   promise: "2026-08-30", status: "On track", exception: null },
  { id: "ORD-90745", sku: "SKU-3391",    qty: 1700,  region: "Surabaya",    promise: "2026-08-26", status: "At risk",  exception: "exc-1043" },
  { id: "ORD-90758", sku: "RM-Steel-A1", qty: 20000, region: "Bekasi",      promise: "2026-08-28", status: "At risk",  exception: "exc-1042" },
  { id: "ORD-90771", sku: "SKU-7702",    qty: 720,   region: "Manado",      promise: "2026-08-31", status: "On track", exception: null },
  { id: "ORD-90784", sku: "SKU-5512",    qty: 440,   region: "Kupang",      promise: "2026-08-30", status: "On track", exception: null },
  { id: "ORD-90797", sku: "SKU-6610",    qty: 3300,  region: "Jabodetabek", promise: "2026-08-27", status: "On track", exception: null },
  { id: "ORD-90810", sku: "SKU-9913",    qty: 620,   region: "Lombok",      promise: "2026-08-30", status: "On track", exception: null },
  { id: "ORD-90823", sku: "SKU-8820",    qty: 2600,  region: "Surabaya",    promise: "2026-08-29", status: "On track", exception: null },
];

// ── Inventory ────────────────────────────────────────────────────────────────

export const INVENTORY = [
  { sku: "SKU-3391",    dc: "DC-Jakarta",     onHand: 4200,  coverDays: 0.6,  reorder: 8000,  velocity: 7100  },
  { sku: "SKU-3391",    dc: "DC-Bandung",     onHand: 11800, coverDays: 9.4,  reorder: 5000,  velocity: 1250  },
  { sku: "RM-Steel-A1", dc: "Plant Karawang", onHand: 26000, coverDays: 1.4,  reorder: 40000, velocity: 18500 },
  { sku: "SKU-1180",    dc: "DC-Surabaya",    onHand: 7300,  coverDays: 5.1,  reorder: 3000,  velocity: 1430  },
  { sku: "SKU-2210",    dc: "DC-Jakarta",     onHand: 15900, coverDays: 12.2, reorder: 6000,  velocity: 1300  },
  { sku: "SKU-4421",    dc: "DC-Surabaya",    onHand: 3100,  coverDays: 2.3,  reorder: 4000,  velocity: 1350  },
  { sku: "SKU-5512",    dc: "DC-Semarang",    onHand: 890,   coverDays: 0.8,  reorder: 2500,  velocity: 1100  },
  { sku: "SKU-7702",    dc: "DC-Jakarta",     onHand: 18400, coverDays: 8.7,  reorder: 5000,  velocity: 2100  },
  { sku: "SKU-9913",    dc: "DC-Bali",        onHand: 2600,  coverDays: 4.1,  reorder: 3000,  velocity: 630   },
  { sku: "SKU-4421",    dc: "DC-Jakarta",     onHand: 2400,  coverDays: 1.8,  reorder: 4000,  velocity: 1350  },
  { sku: "RM-Steel-A1", dc: "DC-Bekasi",      onHand: 8000,  coverDays: 0.5,  reorder: 40000, velocity: 16000 },
  { sku: "SKU-5512",    dc: "DC-Bandung",     onHand: 4200,  coverDays: 3.9,  reorder: 2500,  velocity: 1080  },
  { sku: "SKU-6610",    dc: "DC-Jakarta",     onHand: 9400,  coverDays: 6.8,  reorder: 4000,  velocity: 1380  },
  { sku: "SKU-6610",    dc: "DC-Surabaya",    onHand: 3800,  coverDays: 2.7,  reorder: 3500,  velocity: 1410  },
  { sku: "SKU-8820",    dc: "DC-Jakarta",     onHand: 22000, coverDays: 11.0, reorder: 8000,  velocity: 2000  },
  { sku: "SKU-8820",    dc: "DC-Surabaya",    onHand: 6400,  coverDays: 3.2,  reorder: 5000,  velocity: 2000  },
  { sku: "SKU-1180",    dc: "DC-Jakarta",     onHand: 1200,  coverDays: 1.1,  reorder: 4000,  velocity: 1090  },
  { sku: "SKU-9913",    dc: "DC-Bandung",     onHand: 1800,  coverDays: 3.0,  reorder: 2000,  velocity: 600   },
  { sku: "SKU-7702",    dc: "DC-Bandung",     onHand: 5100,  coverDays: 7.3,  reorder: 3000,  velocity: 700   },
  { sku: "SKU-2210",    dc: "DC-Surabaya",    onHand: 3700,  coverDays: 4.9,  reorder: 3500,  velocity: 760   },
  { sku: "SKU-6610",    dc: "DC-Semarang",    onHand: 610,   coverDays: 0.9,  reorder: 2000,  velocity: 680   },
  { sku: "SKU-8820",    dc: "DC-Semarang",    onHand: 1400,  coverDays: 1.6,  reorder: 3000,  velocity: 875   },
  { sku: "RM-Steel-A1", dc: "DC-Surabaya",    onHand: 4200,  coverDays: 0.7,  reorder: 15000, velocity: 6000  },
  { sku: "SKU-4421",    dc: "DC-Bandung",     onHand: 8200,  coverDays: 14.0, reorder: 2500,  velocity: 586   },
  { sku: "SKU-5512",    dc: "DC-Bali",        onHand: 720,   coverDays: 1.2,  reorder: 1500,  velocity: 600   },
];

// ── Production ───────────────────────────────────────────────────────────────

export const PRODUCTION = [
  { mo: "MO-5504", line: "P-02", sku: "SKU-8820",   planned: "2026-08-20 06:00", status: "Completed",    load: 0.78, qty: 15000 },
  { mo: "MO-5507", line: "P-03", sku: "SKU-6610",   planned: "2026-08-20 14:00", status: "Completed",    load: 0.62, qty: 10000 },
  { mo: "MO-5510", line: "P-02", sku: "SKU-2210",   planned: "2026-08-21 06:00", status: "Completed",    load: 0.74, qty: 11000 },
  { mo: "MO-5511", line: "P-01", sku: "SKU-1180",   planned: "2026-08-21 14:00", status: "Completed",    load: 0.88, qty: 8000  },
  { mo: "MO-5513", line: "P-03", sku: "SKU-4421",   planned: "2026-08-21 22:00", status: "Completed",    load: 0.67, qty: 9000  },
  { mo: "MO-5515", line: "P-01", sku: "SKU-4421",   planned: "2026-08-22 14:00", status: "In Progress",  load: 0.91, qty: 12000 },
  { mo: "MO-5518", line: "P-03", sku: "SKU-5512",   planned: "2026-08-23 06:00", status: "Scheduled",    load: 0.72, qty: 6000  },
  { mo: "MO-5521", line: "P-02", sku: "SKU-3391",   planned: "2026-08-24 06:00", status: "Rescheduling", load: 0.82, qty: 20000 },
  { mo: "MO-5522", line: "P-01", sku: "SKU-2210",   planned: "2026-08-23 14:00", status: "Scheduled",    load: 0.64, qty: 9000  },
  { mo: "MO-5525", line: "P-02", sku: "SKU-9913",   planned: "2026-08-26 06:00", status: "Scheduled",    load: 0.55, qty: 7000  },
  { mo: "MO-5530", line: "P-03", sku: "SKU-7702",   planned: "2026-08-25 06:00", status: "Scheduled",    load: 0.41, qty: 5000  },
  { mo: "MO-5533", line: "P-01", sku: "SKU-6610",   planned: "2026-08-25 14:00", status: "Scheduled",    load: 0.59, qty: 8000  },
  { mo: "MO-5536", line: "P-02", sku: "SKU-8820",   planned: "2026-08-26 14:00", status: "Scheduled",    load: 0.68, qty: 13000 },
  { mo: "MO-5539", line: "P-03", sku: "SKU-1180",   planned: "2026-08-27 06:00", status: "Scheduled",    load: 0.47, qty: 5500  },
  { mo: "MO-5542", line: "P-01", sku: "SKU-5512",   planned: "2026-08-27 14:00", status: "Scheduled",    load: 0.53, qty: 7500  },
  { mo: "MO-5545", line: "P-02", sku: "SKU-3391",   planned: "2026-08-28 06:00", status: "Scheduled",    load: 0.71, qty: 18000 },
  { mo: "MO-5548", line: "P-03", sku: "SKU-2210",   planned: "2026-08-28 14:00", status: "Scheduled",    load: 0.60, qty: 10000 },
  { mo: "MO-5551", line: "P-01", sku: "SKU-7702",   planned: "2026-08-29 06:00", status: "Scheduled",    load: 0.44, qty: 6000  },
];

// ── Shipments ────────────────────────────────────────────────────────────────

export const SHIPMENTS = [
  { id: "SH-7712", lane: "Semarang → Makassar",      mode: "Sea",  eta: "+22h drift", sla: "Critical",  carrier: "Pelni Cargo",     units: 480  },
  { id: "SH-7718", lane: "Jakarta → Denpasar",       mode: "Road", eta: "On time",    sla: "Standard",  carrier: "Wahana Express",  units: 1800 },
  { id: "SH-7723", lane: "Surabaya → Banjarmasin",   mode: "Sea",  eta: "+4h drift",  sla: "Standard",  carrier: "Pelni Cargo",     units: 940  },
  { id: "SH-7731", lane: "Jakarta → Medan",          mode: "Air",  eta: "On time",    sla: "Express",   carrier: "Lion Parcel",     units: 320  },
  { id: "SH-7740", lane: "Surabaya → Makassar",      mode: "Sea",  eta: "On time",    sla: "Standard",  carrier: "Pelni Cargo",     units: 1200 },
  { id: "SH-7748", lane: "Bandung → Semarang",       mode: "Road", eta: "+2h drift",  sla: "Standard",  carrier: "JNE Trucking",    units: 560  },
  { id: "SH-7755", lane: "Jakarta → Surabaya",       mode: "Road", eta: "On time",    sla: "Standard",  carrier: "JNE Trucking",    units: 2100 },
  { id: "SH-7762", lane: "Makassar → Manado",        mode: "Sea",  eta: "+8h drift",  sla: "Standard",  carrier: "Pelni Cargo",     units: 380  },
  { id: "SH-7769", lane: "Jakarta → Balikpapan",     mode: "Air",  eta: "On time",    sla: "Express",   carrier: "Garuda Cargo",    units: 210  },
  { id: "SH-7775", lane: "Surabaya → Lombok",        mode: "Sea",  eta: "+3h drift",  sla: "Standard",  carrier: "Pelni Cargo",     units: 650  },
  { id: "SH-7781", lane: "Jakarta → Pontianak",      mode: "Air",  eta: "On time",    sla: "Express",   carrier: "Lion Parcel",     units: 180  },
  { id: "SH-7787", lane: "Semarang → Surabaya",      mode: "Road", eta: "On time",    sla: "Standard",  carrier: "TIKI Express",    units: 1400 },
  { id: "SH-7793", lane: "Bandung → Jakarta",        mode: "Road", eta: "+1h drift",  sla: "Standard",  carrier: "SiCepat",         units: 3200 },
  { id: "SH-7799", lane: "Jakarta → Kupang",         mode: "Air",  eta: "On time",    sla: "Express",   carrier: "Garuda Cargo",    units: 140  },
  { id: "SH-7805", lane: "Surabaya → Kupang",        mode: "Sea",  eta: "+6h drift",  sla: "Standard",  carrier: "Pelni Cargo",     units: 520  },
  { id: "SH-7811", lane: "Medan → Pekanbaru",        mode: "Road", eta: "On time",    sla: "Standard",  carrier: "JNE Trucking",    units: 870  },
  { id: "SH-7817", lane: "Jakarta → Yogyakarta",     mode: "Road", eta: "On time",    sla: "Standard",  carrier: "Wahana Express",  units: 2400 },
  { id: "SH-7823", lane: "Makassar → Balikpapan",    mode: "Sea",  eta: "+5h drift",  sla: "Standard",  carrier: "Pelni Cargo",     units: 760  },
];

// ── Finance KPIs ─────────────────────────────────────────────────────────────

export const FINANCE = [
  { label: "Exception exposure (open)", value: 283_000_000 },
  { label: "Loss avoided (30d)",        value: 512_000_000 },
  { label: "Recovery spend (30d)",      value:  94_000_000 },
  { label: "Net benefit (30d)",         value: 418_000_000 },
];

// Weekly trend — 16 weeks ending 22 Aug 2026 (W23–W38)
export const WEEKLY_FINANCE = [
  { week: "W23", label: "02 Jun", lossAvoided: 210, recoveryCost: 38, exceptions: 2 },
  { week: "W24", label: "09 Jun", lossAvoided: 285, recoveryCost: 52, exceptions: 3 },
  { week: "W25", label: "16 Jun", lossAvoided: 194, recoveryCost: 41, exceptions: 2 },
  { week: "W26", label: "23 Jun", lossAvoided: 342, recoveryCost: 63, exceptions: 4 },
  { week: "W27", label: "30 Jun", lossAvoided: 418, recoveryCost: 74, exceptions: 4 },
  { week: "W28", label: "07 Jul", lossAvoided: 271, recoveryCost: 49, exceptions: 3 },
  { week: "W29", label: "14 Jul", lossAvoided: 356, recoveryCost: 66, exceptions: 3 },
  { week: "W30", label: "21 Jul", lossAvoided: 429, recoveryCost: 78, exceptions: 5 },
  { week: "W31", label: "28 Jul", lossAvoided: 380, recoveryCost: 68, exceptions: 4 },
  { week: "W32", label: "04 Aug", lossAvoided: 451, recoveryCost: 82, exceptions: 5 },
  { week: "W33", label: "11 Aug", lossAvoided: 312, recoveryCost: 54, exceptions: 3 },
  { week: "W34", label: "18 Aug", lossAvoided: 527, recoveryCost: 96, exceptions: 6 },
  { week: "W35", label: "25 Aug", lossAvoided: 489, recoveryCost: 88, exceptions: 5 },
  { week: "W36", label: "01 Sep", lossAvoided: 398, recoveryCost: 71, exceptions: 4 },
  { week: "W37", label: "08 Sep", lossAvoided: 512, recoveryCost: 94, exceptions: 5 },
  { week: "W38", label: "15 Sep", lossAvoided: 118, recoveryCost: 34, exceptions: 3 }, // current, partial
];

// Resolved exception history (last 90 days, most recent first)
export const EXCEPTION_HISTORY = [
  {
    code: "EXC-1041", type: "supplier_delay" as ExceptionType,
    resolvedAt: "2026-08-21T16:30:00Z",
    title: "PT Baja Nusantara delayed 28h on RM-Alloy-B2",
    option: "Split supply (60/40)",
    lossAvoided: 142_000_000, recoveryCost: 23_000_000,
    decision: "approved", override: false,
  },
  {
    code: "EXC-1040", type: "demand_spike" as ExceptionType,
    resolvedAt: "2026-08-21T09:15:00Z",
    title: "Demand spike +178% on SKU-4421 (Surabaya)",
    option: "Rebalance stock from DC-Semarang",
    lossAvoided: 68_000_000, recoveryCost: 9_000_000,
    decision: "approved", override: false,
  },
  {
    code: "EXC-1037", type: "shipment_delay" as ExceptionType,
    resolvedAt: "2026-08-19T11:45:00Z",
    title: "Shipment delay Jakarta → Balikpapan (congestion)",
    option: "Air-freight SLA-critical subset",
    lossAvoided: 31_000_000, recoveryCost: 8_200_000,
    decision: "approved", override: false,
  },
  {
    code: "EXC-1034", type: "supplier_delay" as ExceptionType,
    resolvedAt: "2026-08-17T14:00:00Z",
    title: "PT Mitra Baja partial shortage on RM-Copper-C1",
    option: "Wait for current supplier",
    lossAvoided: 0, recoveryCost: 0,
    decision: "approved", override: true,
  },
  {
    code: "EXC-1031", type: "demand_spike" as ExceptionType,
    resolvedAt: "2026-08-14T08:20:00Z",
    title: "Demand spike +133% on SKU-9913 (Bali)",
    option: "Cap listing quantity (2 units/order)",
    lossAvoided: 44_000_000, recoveryCost: 0,
    decision: "approved", override: false,
  },
  {
    code: "EXC-1028", type: "shipment_delay" as ExceptionType,
    resolvedAt: "2026-08-11T17:10:00Z",
    title: "Shipment delay Surabaya → Kupang (vessel capacity)",
    option: "Reroute via Makassar hub",
    lossAvoided: 38_000_000, recoveryCost: 6_400_000,
    decision: "approved", override: false,
  },
  {
    code: "EXC-1025", type: "supplier_delay" as ExceptionType,
    resolvedAt: "2026-08-08T10:00:00Z",
    title: "PT Surya Logam late 48h on RM-Steel-A1 (Shift 2 batch)",
    option: "Emergency spot-buy from PT Cakra Logam",
    lossAvoided: 96_000_000, recoveryCost: 18_500_000,
    decision: "approved", override: false,
  },
  {
    code: "EXC-1022", type: "demand_spike" as ExceptionType,
    resolvedAt: "2026-08-05T14:30:00Z",
    title: "Demand spike +201% on SKU-6610 (Jabodetabek) — flash sale",
    option: "Activate safety stock buffer + add picking shift",
    lossAvoided: 74_000_000, recoveryCost: 11_000_000,
    decision: "approved", override: false,
  },
  {
    code: "EXC-1019", type: "shipment_delay" as ExceptionType,
    resolvedAt: "2026-08-02T09:15:00Z",
    title: "Vessel breakdown Makassar → Manado (KM Tidar)",
    option: "Split to alternative vessel + partial air upgrade",
    lossAvoided: 52_000_000, recoveryCost: 14_200_000,
    decision: "approved", override: false,
  },
  {
    code: "EXC-1016", type: "supplier_delay" as ExceptionType,
    resolvedAt: "2026-07-29T16:00:00Z",
    title: "Packaging material SKU-8820 shortage — DC-Semarang",
    option: "Emergency transfer from DC-Jakarta (1,500 units)",
    lossAvoided: 28_000_000, recoveryCost: 4_800_000,
    decision: "approved", override: false,
  },
  {
    code: "EXC-1013", type: "demand_spike" as ExceptionType,
    resolvedAt: "2026-07-25T11:45:00Z",
    title: "Demand spike +156% on SKU-8820 (Surabaya) — Harbolnas",
    option: "Rebalance from DC-Bandung + DC-Jakarta",
    lossAvoided: 61_000_000, recoveryCost: 8_100_000,
    decision: "approved", override: false,
  },
  {
    code: "EXC-1010", type: "shipment_delay" as ExceptionType,
    resolvedAt: "2026-07-21T08:30:00Z",
    title: "Flood disruption on Tol Trans-Jawa KM 142 (Semarang)",
    option: "Detour via Pantura — Demak bypass route",
    lossAvoided: 33_000_000, recoveryCost: 5_600_000,
    decision: "approved", override: false,
  },
  {
    code: "EXC-1007", type: "supplier_delay" as ExceptionType,
    resolvedAt: "2026-07-17T15:20:00Z",
    title: "PT Mitra Baja quality-hold on RM-Steel-A1 (batch QC fail)",
    option: "Reject batch + expedite next PO delivery",
    lossAvoided: 88_000_000, recoveryCost: 21_000_000,
    decision: "approved", override: true,
  },
  {
    code: "EXC-1004", type: "demand_spike" as ExceptionType,
    resolvedAt: "2026-07-11T09:00:00Z",
    title: "Demand spike +94% on SKU-1180 (Makassar) — regional promo",
    option: "Cap orders at 5 units/customer for 48h",
    lossAvoided: 19_000_000, recoveryCost: 0,
    decision: "approved", override: false,
  },
  {
    code: "EXC-1001", type: "shipment_delay" as ExceptionType,
    resolvedAt: "2026-07-05T12:00:00Z",
    title: "Port congestion Tanjung Priok — 14 outbound containers delayed",
    option: "Expedite priority containers via Tanjung Perak (Surabaya)",
    lossAvoided: 47_000_000, recoveryCost: 9_800_000,
    decision: "approved", override: false,
  },
];

// Carrier performance (rolling 30d)
export const CARRIER_PERF = [
  { carrier: "Wahana Express", mode: "Road", onTimeRate: 0.91, avgDelayH: 1.8, shipments30d: 41 },
  { carrier: "JNE Trucking",   mode: "Road", onTimeRate: 0.88, avgDelayH: 2.3, shipments30d: 35 },
  { carrier: "Lion Parcel",    mode: "Air",  onTimeRate: 0.96, avgDelayH: 0.6, shipments30d: 12 },
  { carrier: "Pelni Cargo",    mode: "Sea",  onTimeRate: 0.78, avgDelayH: 5.4, shipments30d: 28 },
  { carrier: "Garuda Cargo",   mode: "Air",  onTimeRate: 0.98, avgDelayH: 0.4, shipments30d:  8 },
  { carrier: "TIKI Express",   mode: "Road", onTimeRate: 0.85, avgDelayH: 3.1, shipments30d: 22 },
  { carrier: "SiCepat",        mode: "Road", onTimeRate: 0.83, avgDelayH: 2.8, shipments30d: 19 },
];

// ── Formatters ────────────────────────────────────────────────────────────────

export const formatRp = (n: number) => {
  if (Math.abs(n) >= 1_000_000_000) return `Rp${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `Rp${Math.round(n / 1_000_000)}M`;
  if (Math.abs(n) >= 1_000) return `Rp${Math.round(n / 1_000)}K`;
  return `Rp${n}`;
};

export const formatPct = (n: number) => `${Math.round(n * 100)}%`;

export const formatNumber = (n: number) => n.toLocaleString("en-US");

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
