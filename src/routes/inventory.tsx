import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, WifiOff, Loader2 } from "lucide-react";
import { AppShell, PageHeader, Chip } from "@/components/ops/AppShell";
import { INVENTORY, formatNumber } from "@/lib/ops-data";
import { api } from "@/lib/api";
import { useApiData } from "@/hooks/use-api-data";
import { EmptyState, SkeletonLoader } from "@/components/ops/EmptyState";
export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Nusantara Seller Operations" },
      { name: "description", content: "On-hand stock and days of cover per distribution center." },
    ],
  }),
  component: InventoryPage,
});

// ABC classification (A = high-velocity / high-value, B = medium, C = slow)
function abcClass(velocity: number): "A" | "B" | "C" {
  if (velocity >= 10000) return "A";
  if (velocity >= 2000)  return "B";
  return "C";
}

function coverTone(days: number): "danger" | "warning" | "success" {
  if (days < 2) return "danger";
  if (days < 5) return "warning";
  return "success";
}

function CoverBar({ days }: { days: number }) {
  const clamp = Math.min(days, 14);
  const pct = (clamp / 14) * 100;
  const color = days < 2 ? "var(--color-destructive)" : days < 5 ? "var(--color-warning)" : "var(--color-success)";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-border overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <Chip tone={coverTone(days)}>{days}d</Chip>
    </div>
  );
}

// DC utilization data
const DC_UTIL = [
  { dc: "DC-Jakarta",     capacity: 80000, used: 22500, critical: 2 },
  { dc: "DC-Bandung",     capacity: 40000, used: 16000, critical: 0 },
  { dc: "DC-Surabaya",    capacity: 50000, used: 10400, critical: 0 },
  { dc: "DC-Semarang",    capacity: 20000, used: 890,   critical: 1 },
  { dc: "DC-Bali",        capacity: 15000, used: 2600,  critical: 0 },
  { dc: "DC-Bekasi",      capacity: 60000, used: 8000,  critical: 1 },
  { dc: "Plant Karawang", capacity: 200000,used: 26000, critical: 1 },
];

function InventoryPage() {
  const { data: inventory, loading, isEmpty } = useApiData(INVENTORY, api.inventory);
  const critical    = inventory.filter((r) => r.coverDays < 2).length;
  const watch       = inventory.filter((r) => r.coverDays >= 2 && r.coverDays < 5).length;
  const healthy     = inventory.filter((r) => r.coverDays >= 5).length;
  const belowReorder= inventory.filter((r) => r.onHand < r.reorder).length;

  // Urgency queue — sorted by cover days, critical first
  const urgentItems = [...inventory]
    .filter((r) => r.coverDays < 5)
    .sort((a, b) => a.coverDays - b.coverDays);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Supply"
        title="Inventory"
        description="Cover days drive SLA risk predictions. Below-reorder positions trigger automatic exception candidates."
      />
      <div className="px-6 py-6 md:px-8 space-y-4">

        {loading ? (
          <SkeletonLoader />
        ) : isEmpty ? (
          <EmptyState />
        ) : (
          <>
            {/* Summary row */}
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: "Critical (< 2d)", value: critical,     tone: "danger"  as const },
                { label: "Watch (2–5d)",    value: watch,        tone: "warning" as const },
                { label: "Healthy (≥ 5d)", value: healthy,      tone: "success" as const },
                { label: "Below reorder",  value: belowReorder, tone: "neutral" as const },
              ].map((s) => (
                <div key={s.label} className="panel p-4">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <Chip tone={s.tone} className="px-2 py-0.5 text-sm">{s.value}</Chip>
                    <span className="text-xs text-muted-foreground">SKUs</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">

              {/* Reorder action queue */}
              <div className="panel overflow-hidden">
                <div className="border-b border-border px-4 py-3 flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="size-4 text-warning" />
                  Reorder action queue
                </div>
                {urgentItems.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-muted-foreground">All positions above 5d cover.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {urgentItems.map((r, i) => {
                      const daysLeft = Math.max(0, r.coverDays);
                      const urgency = r.coverDays < 2 ? "Order immediately" : r.coverDays < 3.5 ? "Order within 24h" : "Order this week";
                      return (
                        <li key={i} className="px-4 py-3 hover:bg-surface-2/60 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-medium text-sm">{r.sku}</div>
                              <div className="text-[11px] text-muted-foreground">{r.dc}</div>
                            </div>
                            <Chip tone={coverTone(r.coverDays)}>{daysLeft}d cover</Chip>
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-[11px]">
                            <ArrowRight className="size-3 text-muted-foreground" />
                            <span className={r.coverDays < 2 ? "text-destructive font-medium" : "text-warning font-medium"}>
                              {urgency}
                            </span>
                            <span className="text-muted-foreground ml-auto">
                              Reorder: {formatNumber(r.reorder - r.onHand)} units
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* DC utilization */}
              <div className="panel overflow-hidden">
                <div className="border-b border-border px-4 py-3 text-sm font-medium">Distribution center utilization</div>
                <ul className="divide-y divide-border">
                  {DC_UTIL.map((dc) => {
                    const pct = Math.round((dc.used / dc.capacity) * 100);
                    return (
                      <li key={dc.dc} className="px-4 py-3 hover:bg-surface-2/60 transition-colors">
                        <div className="flex items-center justify-between mb-1.5">
                          <div>
                            <span className="text-sm font-medium">{dc.dc}</span>
                            {dc.critical > 0 && (
                              <Chip tone="danger" className="ml-2">{dc.critical} critical SKU{dc.critical > 1 ? "s" : ""}</Chip>
                            )}
                          </div>
                          <span className="num text-sm">{pct}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-border overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: pct >= 80 ? "var(--color-warning)" : "var(--color-success)",
                            }}
                          />
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {formatNumber(dc.used)} / {formatNumber(dc.capacity)} units capacity
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            {/* Stock positions table */}
            <div className="panel overflow-hidden">
              <div className="border-b border-border px-4 py-3 text-sm font-medium">All stock positions</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5 text-left font-medium">SKU</th>
                      <th className="px-4 py-2.5 text-left font-medium">Location</th>
                      <th className="px-4 py-2.5 text-center font-medium">ABC</th>
                      <th className="px-4 py-2.5 text-right font-medium">On hand</th>
                      <th className="px-4 py-2.5 text-right font-medium">Daily vel.</th>
                      <th className="px-4 py-2.5 text-right font-medium">Cover</th>
                      <th className="px-4 py-2.5 text-right font-medium">Reorder pt.</th>
                      <th className="px-4 py-2.5 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {inventory.map((r, i) => {
                      const belowRop = r.onHand < r.reorder;
                      const abc = abcClass(r.velocity);
                      return (
                        <tr key={i} className="hover:bg-surface-2/60 transition-colors">
                          <td className="px-4 py-2.5 font-medium">{r.sku}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{r.dc}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${abc === "A" ? "bg-primary/10 text-primary" : abc === "B" ? "bg-warning/10 text-warning" : "bg-border text-muted-foreground"}`}>
                              {abc}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right num">{formatNumber(r.onHand)}</td>
                          <td className="px-4 py-2.5 text-right num text-muted-foreground">{formatNumber(r.velocity)}/d</td>
                          <td className="px-4 py-2.5 text-right"><CoverBar days={r.coverDays} /></td>
                          <td className="px-4 py-2.5 text-right num text-muted-foreground">{formatNumber(r.reorder)}</td>
                          <td className="px-4 py-2.5">
                            {belowRop && r.coverDays < 2 ? (
                              <Chip tone="danger">Urgent reorder</Chip>
                            ) : belowRop ? (
                              <Chip tone="danger">Below ROP</Chip>
                            ) : r.coverDays < 5 ? (
                              <Chip tone="warning">Monitor</Chip>
                            ) : (
                              <Chip tone="success">OK</Chip>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
