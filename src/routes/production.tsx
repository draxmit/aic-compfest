import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader, Chip } from "@/components/ops/AppShell";
import { PRODUCTION, formatPct, formatNumber } from "@/lib/ops-data";

export const Route = createFileRoute("/production")({
  head: () => ({
    meta: [
      { title: "Production — Nusantara Seller Operations" },
      {
        name: "description",
        content: "Manufacturing orders, line load and reschedules triggered by AI recovery plans.",
      },
      { property: "og:title", content: "Production — Nusantara Seller Operations" },
      {
        property: "og:description",
        content: "Line load and manufacturing order schedule state.",
      },
    ],
  }),
  component: ProductionPage,
});

const LINE_DEFS = ["P-01", "P-02", "P-03"] as const;

function LoadBar({ load }: { load: number }) {
  const pct = Math.round(load * 100);
  const color =
    pct >= 90 ? "var(--color-destructive)"
    : pct >= 75 ? "var(--color-warning)"
    : "var(--color-success)";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-border overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
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

function ProductionPage() {
  const activeLines = LINE_DEFS.map((line) => {
    const orders = PRODUCTION.filter((p) => p.line === line && p.status !== "Completed");
    const avgLoad = orders.length
      ? orders.reduce((s, p) => s + p.load, 0) / orders.length
      : 0;
    const inProgress = orders.find((p) => p.status === "In Progress");
    return { line, avgLoad, orderCount: orders.length, currentSku: inProgress?.sku ?? "—" };
  });

  const totalQty    = PRODUCTION.filter((p) => p.status !== "Completed").reduce((s, p) => s + p.qty, 0);
  const rescheduled = PRODUCTION.filter((p) => p.status === "Rescheduling").length;
  const inProgress  = PRODUCTION.filter((p) => p.status === "In Progress").length;

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
                  {Math.round(l.avgLoad * 100)}% load
                </Chip>
              </div>
              <div className="mt-3">
                <div className="h-2 w-full rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round(l.avgLoad * 100)}%`,
                      background: l.avgLoad >= 0.9 ? "var(--color-destructive)" : l.avgLoad >= 0.75 ? "var(--color-warning)" : "var(--color-success)",
                    }}
                  />
                </div>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                {l.orderCount} active order{l.orderCount !== 1 ? "s" : ""} · Running: {l.currentSku}
              </div>
            </div>
          ))}
        </div>

        {/* Summary row */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Units planned (active)</div>
            <div className="num mt-2 text-2xl font-semibold">{formatNumber(totalQty)}</div>
            <div className="mt-1 text-xs text-muted-foreground">Across {PRODUCTION.filter(p => p.status !== "Completed").length} active orders</div>
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
        </div>

        {/* Manufacturing order table */}
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
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {PRODUCTION.map((r) => (
                  <tr key={r.mo} className="hover:bg-surface-2/60 transition-colors">
                    <td className="px-4 py-2.5 num font-medium">{r.mo}</td>
                    <td className="px-4 py-2.5 num">{r.line}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.sku}</td>
                    <td className="px-4 py-2.5 text-right num">{formatNumber(r.qty)}</td>
                    <td className="px-4 py-2.5 num">{r.planned}</td>
                    <td className="px-4 py-2.5">
                      <LoadBar load={r.load} />
                    </td>
                    <td className="px-4 py-2.5">{statusChip(r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
