import { createFileRoute } from "@tanstack/react-router";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { AppShell, PageHeader, Chip } from "@/components/ops/AppShell";
import { PRODUCTION, INVENTORY, formatPct, formatNumber } from "@/lib/ops-data";

export const Route = createFileRoute("/production")({
  head: () => ({
    meta: [
      { title: "Production — Nusantara Seller Operations" },
      { name: "description", content: "Manufacturing orders, line load and reschedules triggered by AI recovery plans." },
    ],
  }),
  component: ProductionPage,
});

// Weekly capacity utilization trend (per line, last 7 days)
const LINE_TREND = [
  { day: "Mon", P01: 71, P02: 58, P03: 44 },
  { day: "Tue", P01: 78, P02: 64, P03: 38 },
  { day: "Wed", P01: 82, P02: 55, P03: 41 },
  { day: "Thu", P01: 75, P02: 80, P03: 62 },
  { day: "Fri", P01: 88, P02: 82, P03: 57 },
  { day: "Sat", P01: 65, P02: 70, P03: 43 },
  { day: "Sun", P01: 78, P02: 69, P03: 56 }, // today
];

// Material availability per MO (derived from inventory data)
const MATERIAL_STATUS = [
  { mo: "MO-5515", sku: "SKU-4421", status: "Available",  note: "DC-Surabaya 3,100 units — sufficient" },
  { mo: "MO-5518", sku: "SKU-5512", status: "Low stock",  note: "DC-Semarang only 890 units — reorder flagged" },
  { mo: "MO-5521", sku: "SKU-3391", status: "At risk",    note: "DC-Jakarta 0.6d cover — exception EXC-1043 active" },
  { mo: "MO-5522", sku: "SKU-2210", status: "Available",  note: "DC-Jakarta 15,900 units — sufficient" },
  { mo: "MO-5525", sku: "SKU-9913", status: "Available",  note: "DC-Bali 2,600 units — sufficient" },
  { mo: "MO-5530", sku: "SKU-7702", status: "Available",  note: "DC-Jakarta 18,400 units — sufficient" },
];

const LINE_DEFS = ["P-01", "P-02", "P-03"] as const;

function LoadBar({ load }: { load: number }) {
  const pct = Math.round(load * 100);
  const color = pct >= 90 ? "var(--color-destructive)" : pct >= 75 ? "var(--color-warning)" : "var(--color-success)";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-border overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="num text-sm">{formatPct(load)}</span>
    </div>
  );
}

function statusChip(status: string) {
  switch (status) {
    case "In Progress":  return <Chip tone="primary">{status}</Chip>;
    case "Rescheduling": return <Chip tone="warning">{status}</Chip>;
    case "Completed":    return <Chip tone="success">{status}</Chip>;
    default:             return <Chip>{status}</Chip>;
  }
}

function materialTone(status: string): "success" | "warning" | "danger" {
  if (status === "Available") return "success";
  if (status === "Low stock")  return "warning";
  return "danger";
}

function ProductionPage() {
  const activeLines = LINE_DEFS.map((line) => {
    const orders = PRODUCTION.filter((p) => p.line === line && p.status !== "Completed");
    const avgLoad = orders.length ? orders.reduce((s, p) => s + p.load, 0) / orders.length : 0;
    const inProgress = orders.find((p) => p.status === "In Progress");
    return { line, avgLoad, orderCount: orders.length, currentSku: inProgress?.sku ?? "—" };
  });

  const totalQty    = PRODUCTION.filter((p) => p.status !== "Completed").reduce((s, p) => s + p.qty, 0);
  const rescheduled = PRODUCTION.filter((p) => p.status === "Rescheduling").length;
  const inProgress  = PRODUCTION.filter((p) => p.status === "In Progress").length;
  const materialAtRisk = MATERIAL_STATUS.filter((m) => m.status !== "Available").length;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Manufacturing"
        title="Production"
        description="Capacity constraints feed the recovery optimizer. Rescheduled orders reflect approved AI recommendations."
      />
      <div className="px-6 py-6 md:px-8 space-y-4">

        {/* Line utilization cards */}
        <div className="grid gap-3 sm:grid-cols-3">
          {activeLines.map((l) => (
            <div key={l.line} className="panel p-4">
              <div className="flex items-center justify-between">
                <span className="num text-sm font-semibold">{l.line}</span>
                <Chip tone={l.avgLoad >= 0.9 ? "danger" : l.avgLoad >= 0.75 ? "warning" : "success"}>
                  {Math.round(l.avgLoad * 100)}% avg load
                </Chip>
              </div>
              <div className="mt-3 h-2 w-full rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round(l.avgLoad * 100)}%`,
                    background: l.avgLoad >= 0.9 ? "var(--color-destructive)" : l.avgLoad >= 0.75 ? "var(--color-warning)" : "var(--color-success)",
                  }}
                />
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                {l.orderCount} active MO{l.orderCount !== 1 ? "s" : ""} · Running: <span className="font-medium text-foreground">{l.currentSku}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Summary row */}
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Units planned</div>
            <div className="num mt-2 text-2xl font-semibold">{formatNumber(totalQty)}</div>
            <div className="mt-1 text-xs text-muted-foreground">Across active MOs</div>
          </div>
          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">In progress</div>
            <div className="num mt-2 text-2xl font-semibold">{inProgress}</div>
            <div className="mt-1"><Chip tone="primary">{inProgress} line{inProgress !== 1 ? "s" : ""} running</Chip></div>
          </div>
          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Rescheduled</div>
            <div className="num mt-2 text-2xl font-semibold">{rescheduled}</div>
            <div className="mt-1"><Chip tone={rescheduled > 0 ? "warning" : "success"}>{rescheduled > 0 ? "Exception impact" : "None"}</Chip></div>
          </div>
          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Material at risk</div>
            <div className="num mt-2 text-2xl font-semibold">{materialAtRisk}</div>
            <div className="mt-1"><Chip tone={materialAtRisk > 0 ? "danger" : "success"}>{materialAtRisk > 0 ? `${materialAtRisk} MO${materialAtRisk > 1 ? "s" : ""} affected` : "All clear"}</Chip></div>
          </div>
        </div>

        {/* Line load trend + Material status */}
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          {/* Weekly trend chart */}
          <div className="panel overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">
              Line load trend — this week (%)
            </div>
            <div className="p-4" style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={LINE_TREND}>
                  <defs>
                    <linearGradient id="gP01" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.42 0.175 15)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="oklch(0.42 0.175 15)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gP02" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.52 0.15 235)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="oklch(0.52 0.15 235)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gP03" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.52 0.16 158)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="oklch(0.52 0.16 158)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="oklch(0 0 0 / 6%)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 12 }} formatter={(v: number) => [`${v}%`]} />
                  <Area type="monotone" dataKey="P01" stroke="oklch(0.42 0.175 15)" strokeWidth={2} fill="url(#gP01)" dot={false} name="P-01" />
                  <Area type="monotone" dataKey="P02" stroke="oklch(0.52 0.15 235)" strokeWidth={2} fill="url(#gP02)" dot={false} name="P-02" />
                  <Area type="monotone" dataKey="P03" stroke="oklch(0.52 0.16 158)" strokeWidth={2} fill="url(#gP03)" dot={false} name="P-03" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="border-t border-border px-4 py-2 flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: "oklch(0.42 0.175 15)" }} /> P-01</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: "oklch(0.52 0.15 235)" }} /> P-02</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: "oklch(0.52 0.16 158)" }} /> P-03</span>
            </div>
            <div className="border-t border-border px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Capacity alerts
            </div>
            <ul className="divide-y divide-border">
              {[
                { line: "P-01", tone: "warning" as const, msg: "MO-5515 running at 91% — throttle if sustained >4h" },
                { line: "P-02", tone: "danger"  as const, msg: "MO-5521 rescheduled — material shortage EXC-1043" },
                { line: "P-03", tone: "warning" as const, msg: "MO-5518 material low stock — DC-Semarang 890 units" },
              ].map((a) => (
                <li key={a.line} className="px-4 py-2.5 flex items-start gap-3">
                  <Chip tone={a.tone} className="mt-0.5 shrink-0">{a.line}</Chip>
                  <span className="text-xs text-foreground leading-relaxed">{a.msg}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Material availability */}
          <div className="panel overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">Material availability per MO</div>
            <ul className="divide-y divide-border">
              {MATERIAL_STATUS.map((m) => (
                <li key={m.mo} className="px-4 py-2.5 hover:bg-surface-2/60 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <span className="num text-xs text-muted-foreground">{m.mo}</span>
                    <Chip tone={materialTone(m.status)}>{m.status}</Chip>
                  </div>
                  <div className="mt-0.5 text-sm font-medium">{m.sku}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{m.note}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Manufacturing orders table */}
        <div className="panel overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-medium">Manufacturing orders</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">MO</th>
                  <th className="px-4 py-2.5 text-left font-medium">Line</th>
                  <th className="px-4 py-2.5 text-left font-medium">SKU</th>
                  <th className="px-4 py-2.5 text-right font-medium">Planned qty</th>
                  <th className="px-4 py-2.5 text-left font-medium">Planned start</th>
                  <th className="px-4 py-2.5 text-left font-medium">Line load</th>
                  <th className="px-4 py-2.5 text-left font-medium">Material</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {PRODUCTION.map((r) => {
                  const mat = MATERIAL_STATUS.find((m) => m.mo === r.mo);
                  return (
                    <tr key={r.mo} className="hover:bg-surface-2/60 transition-colors">
                      <td className="px-4 py-2.5 num font-medium">{r.mo}</td>
                      <td className="px-4 py-2.5 num">{r.line}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.sku}</td>
                      <td className="px-4 py-2.5 text-right num">{formatNumber(r.qty)}</td>
                      <td className="px-4 py-2.5 num">{r.planned}</td>
                      <td className="px-4 py-2.5"><LoadBar load={r.load} /></td>
                      <td className="px-4 py-2.5">
                        {mat ? <Chip tone={materialTone(mat.status)}>{mat.status}</Chip> : <Chip>—</Chip>}
                      </td>
                      <td className="px-4 py-2.5">{statusChip(r.status)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
