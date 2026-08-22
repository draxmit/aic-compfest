import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader, Chip } from "@/components/ops/AppShell";
import { ORDERS, formatNumber } from "@/lib/ops-data";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Orders — Nusantara Seller Operations" },
      {
        name: "description",
        content: "Order book with SLA promise dates and links to the exceptions putting them at risk.",
      },
      { property: "og:title", content: "Orders — Nusantara Seller Operations" },
      {
        property: "og:description",
        content: "Track order promises and the operational exceptions threatening them.",
      },
    ],
  }),
  component: OrdersPage,
});

const REGION_SUMMARY = [
  { region: "Jabodetabek", total: 4, atRisk: 2 },
  { region: "Surabaya",    total: 3, atRisk: 2 },
  { region: "Makassar",    total: 2, atRisk: 2 },
  { region: "Bandung",     total: 2, atRisk: 0 },
  { region: "Medan",       total: 2, atRisk: 0 },
  { region: "Other",       total: 2, atRisk: 1 },
];

function OrdersPage() {
  const atRisk  = ORDERS.filter((o) => o.status === "At risk").length;
  const onTrack = ORDERS.filter((o) => o.status === "On track").length;
  const total   = ORDERS.length;
  const atRiskPct = Math.round((atRisk / total) * 100);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Commerce"
        title="Orders"
        description="Order book monitored by the exception detector. At-risk orders are linked to the exception driving the delay."
      />
      <div className="px-6 py-6 md:px-8 space-y-4">

        {/* Summary row */}
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total orders</div>
            <div className="num mt-2 text-2xl font-semibold">{total}</div>
            <div className="mt-1 text-xs text-muted-foreground">Active in system</div>
          </div>
          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">At risk</div>
            <div className="num mt-2 text-2xl font-semibold text-destructive">{atRisk}</div>
            <div className="mt-1"><Chip tone="danger">{atRiskPct}% of orders</Chip></div>
          </div>
          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">On track</div>
            <div className="num mt-2 text-2xl font-semibold text-success">{onTrack}</div>
            <div className="mt-1"><Chip tone="success">{100 - atRiskPct}% of orders</Chip></div>
          </div>
          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Affected regions</div>
            <div className="num mt-2 text-2xl font-semibold">3</div>
            <div className="mt-1 text-xs text-muted-foreground">Jabodetabek · Surabaya · Makassar</div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          {/* Regional breakdown */}
          <div className="panel overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">By region</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Region</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 text-right font-medium">At risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {REGION_SUMMARY.map((r) => (
                  <tr key={r.region} className="hover:bg-surface-2/60 transition-colors">
                    <td className="px-4 py-2.5">{r.region}</td>
                    <td className="px-4 py-2.5 text-right num">{r.total}</td>
                    <td className="px-4 py-2.5 text-right">
                      {r.atRisk > 0 ? (
                        <span className="num text-destructive font-medium">{r.atRisk}</span>
                      ) : (
                        <span className="num text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
