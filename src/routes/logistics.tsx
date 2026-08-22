import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader, Chip } from "@/components/ops/AppShell";
import { DataTable } from "@/components/ops/DataTable";
import { SHIPMENTS } from "@/lib/ops-data";

export const Route = createFileRoute("/logistics")({
  head: () => ({
    meta: [
      { title: "Logistics — Nusantara Seller Operations" },
      { name: "description", content: "Lane monitoring with ETA drift and SLA classification per shipment." },
      { property: "og:title", content: "Logistics — Nusantara Seller Operations" },
      { property: "og:description", content: "Shipment lanes, ETA drift and SLA-critical loads." },
    ],
  }),
  component: LogisticsPage,
});

function LogisticsPage() {
  return (
    <AppShell>
      <PageHeader eyebrow="Logistics" title="Shipments" description="ETA drift signals feed the shipment delay detector." />
      <div className="px-6 py-6 md:px-8">
        <DataTable
          rows={SHIPMENTS}
          columns={[
            { key: "id", label: "Shipment", render: (r) => <span className="num">{r.id}</span> },
            { key: "lane", label: "Lane", render: (r) => r.lane },
            { key: "mode", label: "Mode", render: (r) => r.mode },
            {
              key: "eta",
              label: "ETA",
              render: (r) => (r.eta === "On time" ? <Chip tone="success">{r.eta}</Chip> : <Chip tone="warning">{r.eta}</Chip>),
            },
            {
              key: "sla",
              label: "SLA",
              render: (r) => (r.sla === "Critical" ? <Chip tone="danger">{r.sla}</Chip> : <Chip>{r.sla}</Chip>),
            },
          ]}
        />
      </div>
    </AppShell>
  );
}
