import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader, Chip } from "@/components/ops/AppShell";
import { INVENTORY, formatNumber } from "@/lib/ops-data";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Nusantara Seller Operations" },
      {
        name: "description",
        content: "On-hand stock and days of cover per distribution center, feeding the impact model.",
      },
      { property: "og:title", content: "Inventory — Nusantara Seller Operations" },
      {
        property: "og:description",
        content: "Stock cover per DC used by the AI impact prediction layer.",
      },
    ],
  }),
  component: InventoryPage,
});

function coverTone(days: number): "danger" | "warning" | "success" {
  if (days < 2) return "danger";
  if (days < 5) return "warning";
  return "success";
}

function CoverBar({ days }: { days: number }) {
  const clamp = Math.min(days, 14);
  const pct = (clamp / 14) * 100;
  const color =
    days < 2 ? "var(--color-destructive)" : days < 5 ? "var(--color-warning)" : "var(--color-success)";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-border overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <Chip tone={coverTone(days)}>{days}d</Chip>
    </div>
  );
}

function InventoryPage() {
  const critical = INVENTORY.filter((r) => r.coverDays < 2).length;
  const watch    = INVENTORY.filter((r) => r.coverDays >= 2 && r.coverDays < 5).length;
  const healthy  = INVENTORY.filter((r) => r.coverDays >= 5).length;
  const belowReorder = INVENTORY.filter((r) => r.onHand < r.reorder).length;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Supply"
        title="Inventory"
        description="Cover days are a key driver of predicted SLA risk. Below-reorder positions are flagged automatically."
      />
      <div className="px-6 py-6 md:px-8 space-y-4">

        {/* Summary row */}
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Critical (< 2d)", value: critical, tone: "danger" as const },
            { label: "Watch (2–5d)",    value: watch,    tone: "warning" as const },
            { label: "Healthy (≥ 5d)", value: healthy,  tone: "success" as const },
            { label: "Below reorder",  value: belowReorder, tone: "neutral" as const },
          ].map((s) => (
            <div key={s.label} className="panel p-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</div>
              <div className="mt-2 text-2xl font-semibold num">{s.value}</div>
              <div className="mt-1">
                <Chip tone={s.tone}>{s.value === 1 ? "1 location" : `${s.value} locations`}</Chip>
              </div>
            </div>
          ))}
        </div>

        {/* Inventory table */}
        <div className="panel overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-medium">Stock positions</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">SKU</th>
                  <th className="px-4 py-2.5 text-left font-medium">Location</th>
                  <th className="px-4 py-2.5 text-right font-medium">On hand</th>
                  <th className="px-4 py-2.5 text-right font-medium">Daily velocity</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cover</th>
                  <th className="px-4 py-2.5 text-right font-medium">Reorder point</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {INVENTORY.map((r, i) => {
                  const belowRop = r.onHand < r.reorder;
                  return (
                    <tr key={i} className="hover:bg-surface-2/60 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{r.sku}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.dc}</td>
                      <td className="px-4 py-2.5 text-right num">{formatNumber(r.onHand)}</td>
                      <td className="px-4 py-2.5 text-right num text-muted-foreground">{formatNumber(r.velocity)}/d</td>
                      <td className="px-4 py-2.5 text-right">
                        <CoverBar days={r.coverDays} />
                      </td>
                      <td className="px-4 py-2.5 text-right num text-muted-foreground">{formatNumber(r.reorder)}</td>
                      <td className="px-4 py-2.5">
                        {belowRop ? (
                          <Chip tone="danger">Below ROP</Chip>
                        ) : r.coverDays < 2 ? (
                          <Chip tone="danger">Urgent reorder</Chip>
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
      </div>
    </AppShell>
  );
}
