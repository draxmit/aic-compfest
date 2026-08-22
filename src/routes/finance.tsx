import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { AppShell, PageHeader, Chip } from "@/components/ops/AppShell";
import { useOps } from "@/lib/ops-store";
import {
  FINANCE, WEEKLY_FINANCE, EXCEPTION_HISTORY, EXCEPTION_TYPE_LABEL,
  formatRp, formatDate,
} from "@/lib/ops-data";

export const Route = createFileRoute("/finance")({
  head: () => ({
    meta: [
      { title: "Finance — Nusantara Seller Operations" },
      {
        name: "description",
        content: "Financial exposure from open exceptions and the loss avoided by approved AI actions.",
      },
      { property: "og:title", content: "Finance — Nusantara Seller Operations" },
      {
        property: "og:description",
        content: "Exception exposure, recovery spend and net benefit of AI recovery decisions.",
      },
    ],
  }),
  component: FinancePage,
});

const TYPE_BREAKDOWN = [
  { type: "Supplier Delay",       lossAvoided: 285_000_000, spend: 34_000_000, count: 8 },
  { type: "Demand Spike",         lossAvoided: 156_000_000, spend: 18_000_000, count: 6 },
  { type: "Shipment Delay",       lossAvoided:  71_000_000, spend: 42_000_000, count: 4 },
  { type: "Inventory Shortage",   lossAvoided:  94_000_000, spend: 11_000_000, count: 3 },
  { type: "Production Stoppage",  lossAvoided:  62_000_000, spend: 19_000_000, count: 2 },
  { type: "Forecast Error",       lossAvoided:  44_000_000, spend:  8_000_000, count: 1 },
];
const TYPE_TOTAL = {
  count: TYPE_BREAKDOWN.reduce((s, r) => s + r.count, 0),
  lossAvoided: TYPE_BREAKDOWN.reduce((s, r) => s + r.lossAvoided, 0),
  spend: TYPE_BREAKDOWN.reduce((s, r) => s + r.spend, 0),
};

function Delta({ pct, inverse = false }: { pct: number; inverse?: boolean }) {
  const up = pct >= 0;
  const good = inverse ? !up : up;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px]"
      style={{ color: good ? "var(--color-success)" : "var(--color-destructive)" }}
    >
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {up ? "+" : ""}{pct}% vs prev week
    </span>
  );
}

function FinancePage() {
  const { openExceptions, history } = useOps();

  const liveExposure = openExceptions.reduce((s, e) => s + e.impact.expectedLoss, 0);
  const liveAvoided = history.reduce((s, h) => s + h.lossAvoided, 0);

  const kpis = [
    {
      label: "Exception exposure (open)",
      value: formatRp(liveExposure || FINANCE[0].value),
      delta: -12,
      sub: `${openExceptions.length} open exception${openExceptions.length !== 1 ? "s" : ""}`,
      inverseGood: true,
    },
    {
      label: "Loss avoided (30d)",
      value: formatRp(FINANCE[1].value + liveAvoided),
      delta: +14,
      sub: "AI-recommended actions approved",
    },
    {
      label: "Recovery spend (30d)",
      value: formatRp(FINANCE[2].value),
      delta: +8,
      sub: "Backup suppliers, air freight, transfer orders",
      inverseGood: true,
    },
    {
      label: "Net benefit (30d)",
      value: formatRp(FINANCE[3].value + liveAvoided),
      delta: +16,
      sub: "Loss avoided minus recovery spend",
    },
  ];

  return (
    <AppShell>
      <PageHeader
        eyebrow="Finance"
        title="Impact ledger"
        description="Every number is derived from AI impact predictions and logged decisions. Values update as exceptions are resolved."
      />
      <div className="px-6 py-6 md:px-8 space-y-6">

        {/* KPI cards */}
        <div className="grid gap-3 md:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="panel p-4 space-y-1">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{k.label}</div>
              <div className="num text-2xl font-semibold">{k.value}</div>
              <div className="flex flex-col gap-0.5">
                <Delta pct={k.delta} inverse={k.inverseGood} />
                <span className="text-[11px] text-muted-foreground">{k.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Weekly trend chart */}
        <div className="panel overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-medium">
            Weekly trend — Loss avoided vs. Recovery spend (Rp M)
          </div>
          <div className="p-4" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={WEEKLY_FINANCE} barCategoryGap="30%" barGap={2}>
                <CartesianGrid vertical={false} stroke="oklch(0 0 0 / 6%)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}M`}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [`Rp${v}M`, name]}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="lossAvoided" name="Loss avoided" fill="oklch(0.52 0.16 158)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="recoveryCost" name="Recovery spend" fill="oklch(0.60 0.16 76)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
          {/* By exception type */}
          <div className="panel overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">Breakdown by exception type (30d)</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Type</th>
                  <th className="px-4 py-2.5 text-right font-medium">Count</th>
                  <th className="px-4 py-2.5 text-right font-medium">Loss avoided</th>
                  <th className="px-4 py-2.5 text-right font-medium">Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {TYPE_BREAKDOWN.map((r) => (
                  <tr key={r.type} className="hover:bg-surface-2/60 transition-colors">
                    <td className="px-4 py-2.5">{r.type}</td>
                    <td className="px-4 py-2.5 text-right num">{r.count}</td>
                    <td className="px-4 py-2.5 text-right num text-success">{formatRp(r.lossAvoided)}</td>
                    <td className="px-4 py-2.5 text-right num text-muted-foreground">{formatRp(r.spend)}</td>
                  </tr>
                ))}
                <tr className="bg-surface-2/40 text-[11px] font-semibold">
                  <td className="px-4 py-2.5 text-muted-foreground uppercase tracking-wider">Total</td>
                  <td className="px-4 py-2.5 text-right num">{TYPE_TOTAL.count}</td>
                  <td className="px-4 py-2.5 text-right num text-success">{formatRp(TYPE_TOTAL.lossAvoided)}</td>
                  <td className="px-4 py-2.5 text-right num text-muted-foreground">{formatRp(TYPE_TOTAL.spend)}</td>
                </tr>
              </tbody>
            </table>
            <div className="border-t border-border px-4 py-3 grid grid-cols-3 gap-2">
              {[
                { label: "Avg ROI per exception", value: `${Math.round(TYPE_TOTAL.lossAvoided / TYPE_TOTAL.spend)}×` },
                { label: "Best category", value: "Supplier Delay" },
                { label: "Avg spend / exception", value: formatRp(Math.round(TYPE_TOTAL.spend / TYPE_TOTAL.count)) },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className="num text-sm font-semibold">{s.value}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Resolved exception log */}
          <div className="panel overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">
              Recent resolved exceptions
            </div>
            <ul className="divide-y divide-border">
              {EXCEPTION_HISTORY.map((h) => (
                <li key={h.code} className="px-4 py-3 hover:bg-surface-2/60 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="num text-xs text-muted-foreground">{h.code}</span>
                        <Chip tone="neutral">{EXCEPTION_TYPE_LABEL[h.type]}</Chip>
                        {h.override && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-warning">
                            <AlertCircle className="size-3" /> AI override
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-sm">{h.title}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground truncate">↳ {h.option}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="num text-sm font-medium text-success">+{formatRp(h.lossAvoided)}</div>
                      {h.recoveryCost > 0 && (
                        <div className="num text-[11px] text-muted-foreground">{formatRp(h.recoveryCost)} spend</div>
                      )}
                      <div className="text-[11px] text-muted-foreground mt-0.5">{formatDate(h.resolvedAt)}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
