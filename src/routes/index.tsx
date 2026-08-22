import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, AlertTriangle, ShieldCheck, TrendingDown } from "lucide-react";
import { AppShell, PageHeader, Chip, SeverityDot } from "@/components/ops/AppShell";
import { useOps } from "@/lib/ops-store";
import {
  EXCEPTION_TYPE_LABEL,
  SYSTEM_HEALTH,
  formatNumber,
  formatPct,
  formatRp,
  formatTime,
} from "@/lib/ops-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Operations Overview — AI Exception Orchestrator" },
      {
        name: "description",
        content:
          "Seller operations overview with live exception exposure, SLA risk and AI-recommended recovery actions.",
      },
      { property: "og:title", content: "Operations Overview — AI Exception Orchestrator" },
      {
        property: "og:description",
        content: "Detect, predict, decide and approve operational exceptions in one AI-assisted workflow.",
      },
    ],
  }),
  component: OverviewPage,
});

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="panel p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="num mt-2 text-2xl font-semibold">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function OverviewPage() {
  const { exceptions, openExceptions, history } = useOps();
  const exposure = openExceptions.reduce((s, e) => s + e.impact.expectedLoss, 0);
  const avoided = history.reduce((s, h) => s + h.lossAvoided, 0);
  const affected = openExceptions.reduce((s, e) => s + e.impact.affectedOrders, 0);
  const worstSla = openExceptions.length ? Math.max(...openExceptions.map((e) => e.impact.slaRisk)) : 0;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Overview"
        title="Operations today"
        description="Existing dashboards tell you what went wrong. AI Exception Orchestrator tells you what to do next."
        actions={
          <Link
            to="/ai-operations"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Open AI Operations <ArrowUpRight className="size-4" />
          </Link>
        }
      />

      <div className="hero-glow px-6 py-6 md:px-8">
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Open exceptions" value={String(openExceptions.length)} sub={`${exceptions.length} detected today`} />
          <Stat label="Exposure at risk" value={formatRp(exposure)} sub={`${formatNumber(affected)} affected orders`} />
          <Stat label="Worst SLA breach risk" value={formatPct(worstSla)} sub="Probability on open exceptions" />
          <Stat label="Loss avoided" value={formatRp(avoided)} sub={`${history.length} AI actions logged`} />
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="size-4 text-warning" /> Active exceptions
              </div>
              <Link to="/ai-operations" className="text-xs text-muted-foreground hover:text-foreground">
                View all
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {exceptions.map((e) => (
                <li key={e.id}>
                  <Link
                    to="/ai-operations/exceptions/$exceptionId"
                    params={{ exceptionId: e.id }}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60"
                  >
                    <SeverityDot severity={e.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{e.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="num">{e.code}</span>
                        <span>·</span>
                        <span>{EXCEPTION_TYPE_LABEL[e.type]}</span>
                        <span>·</span>
                        <span>{formatTime(e.detectedAt)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num text-sm font-medium text-destructive">{formatRp(e.impact.expectedLoss)}</div>
                      <div className="num text-[11px] text-muted-foreground">
                        SLA risk {formatPct(e.impact.slaRisk)}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <div className="panel overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium">
                <ShieldCheck className="size-4 text-success" /> System health
              </div>
              <ul className="divide-y divide-border">
                {SYSTEM_HEALTH.map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div>
                      <div className="text-sm">{s.name}</div>
                      <div className="text-[11px] text-muted-foreground">{s.detail}</div>
                    </div>
                    <Chip tone={s.status === "healthy" ? "success" : "warning"}>{s.status}</Chip>
                  </li>
                ))}
              </ul>
            </div>

            <div className="panel overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium">
                <TrendingDown className="size-4 text-primary" /> Recent AI actions
              </div>
              {history.length === 0 ? (
                <p className="px-4 py-4 text-xs text-muted-foreground">
                  No decisions yet. Open an exception to review the AI recommendation.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {history.slice(0, 4).map((h) => (
                    <li key={h.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="num text-xs text-muted-foreground">{h.exceptionCode}</span>
                        <Chip tone={h.decision === "approved" ? "success" : "neutral"}>{h.decision}</Chip>
                      </div>
                      <div className="mt-1 truncate text-sm">{h.optionLabel}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
