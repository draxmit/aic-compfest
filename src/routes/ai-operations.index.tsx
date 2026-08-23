import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { AppShell, PageHeader, Chip, SeverityDot } from "@/components/ops/AppShell";
import { EmptyState, SkeletonLoader } from "@/components/ops/EmptyState";
import { useOps } from "@/lib/ops-store";
import {
  EXCEPTION_TYPE_LABEL,
  formatNumber,
  formatPct,
  formatRp,
  formatTime,
  type ExceptionType,
} from "@/lib/ops-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ai-operations/")({
  head: () => ({
    meta: [
      { title: "AI Operations — Exception Queue" },
      {
        name: "description",
        content:
          "Detect, predict impact and compare AI-generated recovery options for supplier delays, demand spikes and shipment delays.",
      },
      { property: "og:title", content: "AI Operations — Exception Queue" },
      {
        property: "og:description",
        content: "Every open operational exception with predicted financial impact and a recommended recovery action.",
      },
    ],
  }),
  component: AiOperationsPage,
});

const FILTERS: { id: "all" | ExceptionType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "supplier_delay", label: "Supplier Delay" },
  { id: "demand_spike", label: "Demand Spike" },
  { id: "shipment_delay", label: "Shipment Delay" },
];

function AiOperationsPage() {
  const { exceptions, decisionFor, openExceptions, isEmpty, loading } = useOps();
  const [filter, setFilter] = useState<"all" | ExceptionType>("all");
  const list = exceptions.filter((e) => filter === "all" || e.type === filter);
  const exposure = openExceptions.reduce((s, e) => s + e.impact.expectedLoss, 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow="AI Operations"
        title="Exception queue"
        description={`Detect → Predict → Decide → Approve. ${openExceptions.length} exception(s) awaiting a decision, ${formatRp(exposure)} exposure.`}
        actions={
          <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs transition-colors",
                  filter === f.id ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="px-6 py-6 md:px-8">
        {loading ? (
          <SkeletonLoader />
        ) : isEmpty ? (
          <EmptyState 
            title="No Exceptions Detected" 
            message="Upload operational data first. When delays or risks are detected, the AI will generate actionable exceptions here." 
          />
        ) : (
          <div className="panel overflow-hidden">
            <div className="grid grid-cols-12 gap-3 border-b border-border px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <div className="col-span-6">Exception</div>
            <div className="col-span-2 text-right">Affected orders</div>
            <div className="col-span-2 text-right">SLA risk</div>
            <div className="col-span-2 text-right">Expected loss</div>
          </div>
          <ul className="divide-y divide-border">
            {list.map((e) => {
              const decision = decisionFor(e.id);
              return (
                <li key={e.id}>
                  <Link
                    to="/ai-operations/exceptions/$exceptionId"
                    params={{ exceptionId: e.id }}
                    className="grid grid-cols-12 items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2/60"
                  >
                    <div className="col-span-12 flex items-start gap-3 md:col-span-6">
                      <SeverityDot severity={e.severity} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{e.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="num">{e.code}</span>
                          <span>·</span>
                          <span>{EXCEPTION_TYPE_LABEL[e.type]}</span>
                          <span>·</span>
                          <span>{formatTime(e.detectedAt)}</span>
                          <span>·</span>
                          <span className="num">confidence {formatPct(e.confidence)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="num col-span-4 text-sm text-muted-foreground md:col-span-2 md:text-right">
                      {formatNumber(e.impact.affectedOrders)}
                    </div>
                    <div className="num col-span-4 text-sm md:col-span-2 md:text-right">
                      {formatPct(e.impact.slaRisk)}
                    </div>
                    <div className="col-span-4 flex items-center justify-end gap-2 md:col-span-2">
                      <span className="num text-sm font-medium text-destructive">
                        {formatRp(e.impact.expectedLoss)}
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                    <div className="col-span-12 md:col-span-6 md:col-start-1">
                      {decision ? (
                        <Chip tone={decision.decision === "approved" ? "success" : "neutral"}>
                          {decision.decision === "approved" ? "Approved" : "Rejected"} · {decision.optionLabel}
                        </Chip>
                      ) : (
                        <Chip tone="primary">Awaiting decision</Chip>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        )}
      </div>
    </AppShell>
  );
}
