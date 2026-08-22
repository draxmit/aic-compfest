import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader, Chip } from "@/components/ops/AppShell";
import { useOps } from "@/lib/ops-store";
import { formatRp, formatTime } from "@/lib/ops-data";

export const Route = createFileRoute("/ai-operations/history")({
  head: () => ({
    meta: [
      { title: "Action History — AI Operations" },
      {
        name: "description",
        content: "Auditable log of every exception, AI recommendation, human decision and simulated action outcome.",
      },
      { property: "og:title", content: "Action History — AI Operations" },
      { property: "og:description", content: "Auditable trail of AI recommendations and human approvals." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { history, reset } = useOps();
  const avoided = history.reduce((s, h) => s + h.lossAvoided, 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow="AI Operations"
        title="Action history"
        description={`${history.length} logged decision(s) · ${formatRp(avoided)} estimated loss avoided.`}
        actions={
          history.length ? (
            <button
              onClick={reset}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear log
            </button>
          ) : null
        }
      />

      <div className="px-6 py-6 md:px-8">
        {history.length === 0 ? (
          <div className="panel p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No actions logged yet. Approve or reject a recommendation in the{" "}
              <Link to="/ai-operations" className="text-primary hover:underline">
                exception queue
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="panel overflow-hidden">
            <ul className="divide-y divide-border">
              {history.map((h) => (
                <li key={h.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/ai-operations/exceptions/$exceptionId"
                      params={{ exceptionId: h.exceptionId }}
                      className="num text-xs text-primary hover:underline"
                    >
                      {h.exceptionCode}
                    </Link>
                    <Chip tone={h.decision === "approved" ? "success" : "neutral"}>{h.status}</Chip>
                    {h.optionId !== h.recommendedOptionId && h.decision === "approved" ? (
                      <Chip tone="warning">Overrode AI recommendation</Chip>
                    ) : null}
                    <span className="ml-auto text-[11px] text-muted-foreground">{formatTime(h.timestamp)}</span>
                  </div>
                  <div className="mt-2 text-sm font-medium">{h.exceptionTitle}</div>
                  <div className="mt-1 text-sm text-muted-foreground">Decision: {h.optionLabel}</div>
                  {h.note ? <div className="mt-1 text-xs text-muted-foreground">Note: {h.note}</div> : null}
                  <div className="num mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    <span>Expected impact: {formatRp(h.expectedLoss)}</span>
                    <span>Do-nothing baseline: {formatRp(h.baselineLoss)}</span>
                    <span className={h.lossAvoided > 0 ? "text-success" : undefined}>
                      Loss avoided: {formatRp(h.lossAvoided)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AppShell>
  );
}
