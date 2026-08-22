import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader, Chip } from "@/components/ops/AppShell";
import { DataTable } from "@/components/ops/DataTable";
import { INVENTORY, formatNumber } from "@/lib/ops-data";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Nusantara Seller Operations" },
      { name: "description", content: "On-hand stock and days of cover per distribution center, feeding the impact model." },
      { property: "og:title", content: "Inventory — Nusantara Seller Operations" },
      { property: "og:description", content: "Stock cover per DC used by the AI impact prediction layer." },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  return (
    <AppShell>
      <PageHeader eyebrow="Supply" title="Inventory" description="Cover days are a key driver of predicted SLA risk." />
      <div className="px-6 py-6 md:px-8">
        <DataTable
          rows={INVENTORY}
          columns={[
            { key: "sku", label: "SKU", render: (r) => r.sku },
            { key: "dc", label: "Location", render: (r) => r.dc },
            { key: "onHand", label: "On hand", align: "right", render: (r) => formatNumber(r.onHand) },
            {
              key: "cover",
              label: "Cover",
              align: "right",
              render: (r) =>
                r.coverDays < 2 ? <Chip tone="danger">{r.coverDays}d</Chip> : <Chip tone="success">{r.coverDays}d</Chip>,
            },
            { key: "reorder", label: "Reorder point", align: "right", render: (r) => formatNumber(r.reorder) },
          ]}
        />
      </div>
    </AppShell>
  );
}
