import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader, Chip } from "@/components/ops/AppShell";
import { DataTable } from "@/components/ops/DataTable";
import { PRODUCTION, formatPct } from "@/lib/ops-data";

export const Route = createFileRoute("/production")({
  head: () => ({
    meta: [
      { title: "Production — Nusantara Seller Operations" },
      { name: "description", content: "Manufacturing orders, line load and reschedules triggered by AI recovery plans." },
      { property: "og:title", content: "Production — Nusantara Seller Operations" },
      { property: "og:description", content: "Line load and manufacturing order schedule state." },
    ],
  }),
  component: ProductionPage,
});

function ProductionPage() {
  return (
    <AppShell>
      <PageHeader eyebrow="Manufacturing" title="Production" description="Capacity constraints used by the recovery optimizer." />
      <div className="px-6 py-6 md:px-8">
        <DataTable
          rows={PRODUCTION}
          columns={[
            { key: "mo", label: "Manufacturing order", render: (r) => <span className="num">{r.mo}</span> },
            { key: "line", label: "Line", render: (r) => r.line },
            { key: "sku", label: "SKU", render: (r) => r.sku },
            { key: "planned", label: "Planned start", render: (r) => <span className="num">{r.planned}</span> },
            { key: "load", label: "Line load", align: "right", render: (r) => formatPct(r.load) },
            {
              key: "status",
              label: "Status",
              render: (r) =>
                r.status === "Rescheduling" ? <Chip tone="warning">{r.status}</Chip> : <Chip>{r.status}</Chip>,
            },
          ]}
        />
      </div>
    </AppShell>
  );
}
