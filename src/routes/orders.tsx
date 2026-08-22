import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { AlertCircle, Clock, CheckCircle2, PackageX } from "lucide-react";
import { AppShell, PageHeader, Chip } from "@/components/ops/AppShell";
import { ORDERS, formatNumber, formatRp } from "@/lib/ops-data";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Orders — Nusantara Seller Operations" },
      { name: "description", content: "Order book with SLA promise dates and links to the exceptions putting them at risk." },
    ],
  }),
  component: OrdersPage,
});

// 7-day order volume (units) with at-risk split
const DAILY_VOLUME = [
  { day: "16 Aug", total: 18400, atRisk: 2100 },
  { day: "17 Aug", total: 21200, atRisk: 3400 },
  { day: "18 Aug", total: 19600, atRisk: 1800 },
  { day: "19 Aug", total: 23100, atRisk: 4200 },
  { day: "20 Aug", total: 20800, atRisk: 3900 },
  { day: "21 Aug", total: 24500, atRisk: 5600 },
  { day: "22 Aug", total: 22350, atRisk: 8720 }, // today — spike from exc-1043
];

const REGION_SUMMARY = [
  { region: "Jabodetabek", total: 4, atRisk: 2, units: 9500 },
  { region: "Surabaya",    total: 3, atRisk: 2, units: 4540 },
  { region: "Makassar",    total: 2, atRisk: 2, units: 1840 },
  { region: "Bandung",     total: 2, atRisk: 0, units: 4200 },
  { region: "Medan",       total: 2, atRisk: 0, units: 1370 },
  { region: "Other",       total: 2, atRisk: 1, units: 1440 },
];

// Promise date buckets
const PROMISE_BUCKETS = [
  { label: "Today (22 Aug)",   count: 2,  atRisk: 2, tone: "danger"  as const },
  { label: "Tomorrow (23 Aug)",count: 3,  atRisk: 1, tone: "warning" as const },
  { label: "Tue–Wed",          count: 5,  atRisk: 3, tone: "warning" as const },
  { label: "Thu+",             count: 5,  atRisk: 1, tone: "success" as const },
];

function OrdersPage() {
  const atRisk   = ORDERS.filter((o) => o.status === "At risk").length;
  const onTrack  = ORDERS.filter((o) => o.status === "On track").length;
  const total    = ORDERS.length;
  const atRiskPct = Math.round((atRisk / total) * 100);

  const totalUnits = ORDERS.reduce((s, o) => s + o.qty, 0);
  const atRiskUnits = ORDERS.filter((o) => o.status === "At risk").reduce((s, o) => s + o.qty, 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Commerce"
        title="Orders"
        description="Order book monitored by the exception detector. At-risk orders are linked to the exception driving the delay."
      />
      <div className="px-6 py-6 md:px-8 space-y-4">

        {/* KPI row */}
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="panel p-4 flex gap-3 items-start">
            <div className="mt-0.5 rounded-lg bg-surface-2 p-2"><PackageX className="size-4 text-muted-foreground" /></div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total orders</div>
              <div className="num mt-1 text-2xl font-semibold">{total}</div>
              <div className="text-xs text-muted-foreground">{formatNumber(totalUnits)} units</div>
            </div>
          </div>
          <div className="panel p-4 flex gap-3 items-start">
            <div className="mt-0.5 rounded-lg bg-destructive/10 p-2"><AlertCircle className="size-4 text-destructive" /></div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">At risk</div>
              <div className="num mt-1 text-2xl font-semibold text-destructive">{atRisk}</div>
              <div className="mt-0.5"><Chip tone="danger">{atRiskPct}% of orders · {formatNumber(atRiskUnits)} units</Chip></div>
            </div>
          </div>
          <div className="panel p-4 flex gap-3 items-start">
            <div className="mt-0.5 rounded-lg bg-success/10 p-2"><CheckCircle2 className="size-4 text-success" /></div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">On track</div>
              <div className="num mt-1 text-2xl font-semibold text-success">{onTrack}</div>
              <div className="mt-0.5"><Chip tone="success">{100 - atRiskPct}% of orders</Chip></div>
            </div>
          </div>
          <div className="panel p-4 flex gap-3 items-start">
            <div className="mt-0.5 rounded-lg bg-warning/10 p-2"><Clock className="size-4 text-warning" /></div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Due today</div>
              <div className="num mt-1 text-2xl font-semibold">2</div>
              <div className="mt-0.5"><Chip tone="danger">Both at risk</Chip></div>
            </div>
          </div>
        </div>

        {/* Daily volume chart + promise buckets */}
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="panel overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">
              Daily order volume (units) — last 7 days
            </div>
            <div className="p-4" style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={DAILY_VOLUME} barCategoryGap="25%">
                  <CartesianGrid vertical={false} stroke="oklch(0 0 0 / 6%)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: number, name: string) => [formatNumber(v), name === "atRisk" ? "At risk" : "On track"]}
                    contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 12 }}
                  />
                  <Bar dataKey="atRisk" name="atRisk" stackId="a" fill="oklch(0.52 0.22 22)" radius={0} />
                  <Bar dataKey="total" name="total" stackId="a" fill="oklch(0.52 0.16 158)" radius={[3, 3, 0, 0]}
                    data={DAILY_VOLUME.map((d) => ({ ...d, total: d.total - d.atRisk }))}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="border-t border-border px-4 py-2 flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3 rounded-sm bg-destructive/70" /> At risk</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3 rounded-sm bg-success/70" /> On track</span>
              <span className="ml-auto">Today: spike driven by EXC-1043 (demand +214%)</span>
            </div>
          </div>

          <div className="panel overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">Promise date breakdown</div>
            <ul className="divide-y divide-border">
              {PROMISE_BUCKETS.map((b) => (
                <li key={b.label} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{b.label}</span>
                    <span className="num text-sm font-medium">{b.count} orders</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(b.atRisk / b.count) * 100}%`,
                          background: b.atRisk === 0 ? "var(--color-success)" : b.atRisk === b.count ? "var(--color-destructive)" : "var(--color-warning)",
                        }}
                      />
                    </div>
                    {b.atRisk > 0 ? (
                      <Chip tone={b.tone}>{b.atRisk} at risk</Chip>
                    ) : (
                      <Chip tone="success">All on track</Chip>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          {/* Left column: regional + SKU breakdown */}
          <div className="flex flex-col gap-4">
            <div className="panel overflow-hidden">
              <div className="border-b border-border px-4 py-3 text-sm font-medium">By region</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">Region</th>
                    <th className="px-4 py-2.5 text-right font-medium">Orders</th>
                    <th className="px-4 py-2.5 text-right font-medium">Units</th>
                    <th className="px-4 py-2.5 text-right font-medium">At risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {REGION_SUMMARY.map((r) => (
                    <tr key={r.region} className="hover:bg-surface-2/60 transition-colors">
                      <td className="px-4 py-2.5">{r.region}</td>
                      <td className="px-4 py-2.5 text-right num">{r.total}</td>
                      <td className="px-4 py-2.5 text-right num text-muted-foreground">{formatNumber(r.units)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {r.atRisk > 0
                          ? <span className="num text-destructive font-medium">{r.atRisk}</span>
                          : <span className="num text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel overflow-hidden">
              <div className="border-b border-border px-4 py-3 text-sm font-medium">Top SKUs at risk</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">SKU</th>
                    <th className="px-4 py-2.5 text-right font-medium">At-risk orders</th>
                    <th className="px-4 py-2.5 text-right font-medium">Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    { sku: "RM-Steel-A1", atRisk: 2, units: 150_000 },
                    { sku: "SKU-3391",    atRisk: 2, units: 5_300   },
                    { sku: "SKU-1180",    atRisk: 2, units: 1_840   },
                    { sku: "SKU-4421",    atRisk: 1, units: 3_600   },
                    { sku: "SKU-9913",    atRisk: 0, units: 1_100   },
                  ].map((r) => (
                    <tr key={r.sku} className="hover:bg-surface-2/60 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{r.sku}</td>
                      <td className="px-4 py-2.5 text-right">
                        {r.atRisk > 0
                          ? <span className="num text-destructive font-medium">{r.atRisk}</span>
                          : <span className="num text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right num text-muted-foreground">{formatNumber(r.units)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Full order table */}
          <div className="panel overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">All orders</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">Order</th>
                    <th className="px-4 py-2.5 text-left font-medium">SKU</th>
                    <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-4 py-2.5 text-left font-medium">Region</th>
                    <th className="px-4 py-2.5 text-left font-medium">Promise</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ORDERS.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2/60 transition-colors">
                      <td className="px-4 py-2.5 num font-medium">{r.id}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.sku}</td>
                      <td className="px-4 py-2.5 text-right num">{formatNumber(r.qty)}</td>
                      <td className="px-4 py-2.5">{r.region}</td>
                      <td className="px-4 py-2.5 num">{r.promise}</td>
                      <td className="px-4 py-2.5">
                        {r.exception ? (
                          <Link to="/ai-operations/exceptions/$exceptionId" params={{ exceptionId: r.exception }}>
                            <Chip tone="danger">{r.status} →</Chip>
                          </Link>
                        ) : (
                          <Chip tone="success">{r.status}</Chip>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
