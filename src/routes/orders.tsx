import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader, Chip } from "@/components/ops/AppShell";
import { DataTable } from "@/components/ops/DataTable";
import { ORDERS, formatNumber } from "@/lib/ops-data";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Orders — Nusantara Seller Operations" },
      { name: "description", content: "Order book with SLA promise dates and links to the exceptions putting them at risk." },
      { property: "og:title", content: "Orders — Nusantara Seller Operations" },
      { property: "og:description", content: "Track order promises and the operational exceptions threatening them." },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  return (
    <AppShell>
      <PageHeader eyebrow="Commerce" title="Orders" description="Order book monitored by the exception detector." />
      <div className="px-6 py-6 md:px-8">
        <DataTable
          rows={ORDERS}
          columns={[
            { key: "id", label: "Order", render: (r) => <span className="num">{r.id}</span> },
            { key: "sku", label: "SKU", render: (r) => r.sku },
            { key: "qty", label: "Qty", align: "right", render: (r) => formatNumber(r.qty) },
            { key: "region", label: "Region", render: (r) => r.region },
            { key: "promise", label: "Promise", render: (r) => <span className="num">{r.promise}</span> },
            {
              key: "status",
              label: "Status",
              render: (r) =>
                r.exception ? (
                  <Link to="/ai-operations/exceptions/$exceptionId" params={{ exceptionId: r.exception }}>
                    <Chip tone="danger">{r.status} →</Chip>
                  </Link>
                ) : (
                  <Chip tone="success">{r.status}</Chip>
                ),
            },
          ]}
        />
      </div>
    </AppShell>
  );
}
