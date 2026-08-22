import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/ops/AppShell";
import { useOps } from "@/lib/ops-store";
import { FINANCE, formatRp } from "@/lib/ops-data";

export const Route = createFileRoute("/finance")({
  head: () => ({
    meta: [
      { title: "Finance — Nusantara Seller Operations" },
      { name: "description", content: "Financial exposure from open exceptions and the loss avoided by approved AI actions." },
      { property: "og:title", content: "Finance — Nusantara Seller Operations" },
      { property: "og:description", content: "Exception exposure, recovery spend and net benefit of AI recovery decisions." },
    ],
  }),
  component: FinancePage,
});

function FinancePage() {
  const { openExceptions, history } = useOps();
  const live = [
    { label: "Exception exposure (open)", value: openExceptions.reduce((s, e) => s + e.impact.expectedLoss, 0) },
    { label: "Loss avoided (this session)", value: history.reduce((s, h) => s + h.lossAvoided, 0) },
    ...FINANCE.slice(2),
  ];

  return (
    <AppShell>
      <PageHeader eyebrow="Finance" title="Impact ledger" description="Every number below is derived from AI impact predictions and logged decisions." />
      <div className="px-6 py-6 md:px-8">
        <div className="grid gap-3 md:grid-cols-4">
          {live.map((f) => (
            <div key={f.label} className="panel p-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{f.label}</div>
              <div className="num mt-2 text-2xl font-semibold">{formatRp(f.value)}</div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
