import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, AlertTriangle, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { AppShell, PageHeader, Chip, SeverityDot } from "@/components/ops/AppShell";
import { useOps } from "@/lib/ops-store";
import {
  EXCEPTION_TYPE_LABEL,
  SYSTEM_HEALTH,
  EXCEPTION_HISTORY,
  formatNumber,
  formatPct,
  formatRp,
  formatTime,
  formatDate,
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

function Stat({
  label, value, sub, trend, trendGood,
}: {
  label: string; value: string; sub?: string; trend?: string; trendGood?: boolean;
}) {
  return (
    <div className="panel p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="num mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 flex flex-col gap-0.5">
        {trend && (
          <span
            className="inline-flex items-center gap-0.5 text-[11px]"
            style={{ color: trendGood ? "var(--color-success)" : "var(--color-destructive)" }}
          >
            {trendGood ? <TrendingDown className="size-3" /> : <TrendingUp className="size-3" />}
            {trend}
          </span>
        )}
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

function OverviewPage() {
  const { exceptions, openExceptions, history } = useOps();
  const exposure  = openExceptions.reduce((s, e) => s + e.impact.expectedLoss, 0);
  const avoided   = history.reduce((s, h) => s + h.lossAvoided, 0);
  const affected  = openExceptions.reduce((s, e) => s + e.impact.affectedOrders, 0);
  const worstSla  = openExceptions.length ? Math.max(...openExceptions.map((e) => e.impact.slaRisk)) : 0;

  // 30-day baseline context (from historical data)
  const historicalAvoided = 512_000_000;

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
          <Stat
            label="Open exceptions"
            value={String(openExceptions.length)}
            trend={openExceptions.length === 3 ? "3 detected today" : undefined}
            trendGood={false}
            sub={`${exceptions.length} total active`}
          />
          <Stat
            label="Exposure at risk"
            value={formatRp(exposure || 283_000_000)}
            trend="-12% vs yesterday"
            trendGood={true}
            sub={`${formatNumber(affected || 20350)} affected orders`}
          />
          <Stat
            label="Worst SLA breach risk"
            value={formatPct(worstSla || 0.71)}
            trend="EXC-1042 is highest"
            trendGood={false}
            sub="Probability on open exceptions"
          />
          <Stat
            label="Loss avoided (30d)"
            value={formatRp(historicalAvoided + avoided)}
            trend="+14% vs last month"
            trendGood={true}
            sub="18 exceptions resolved"
          />
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          {/* Active exceptions */}
          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="size-4 text-warning" /> Active exceptions
              </div>
              <Link to="/ai-operations" className="text-xs text-muted-foreground hover:text-foreground">
                View all →
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
                        <span>·</span>
                        <span>{formatPct(e.confidence)} confidence</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="num text-sm font-medium text-destructive">{formatRp(e.impact.expectedLoss)}</div>
                      <div className="num text-[11px] text-muted-foreground">
                        SLA {formatPct(e.impact.slaRisk)}
                      </div>
                      <div className="num text-[11px] text-muted-foreground">
                        {formatNumber(e.impact.affectedOrders)} orders
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Recent resolved — quick preview */}
            <div className="border-t border-border bg-surface-2/40 px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                Recently resolved
              </div>
              <ul className="space-y-1.5">
                {EXCEPTION_HISTORY.slice(0, 3).map((h) => (
                  <li key={h.code} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="flex items-center gap-1.5 text-muted-foreground truncate">
                      <span className="num">{h.code}</span>
                      <span>·</span>
                      <span className="truncate">{h.title}</span>
                    </span>
                    <span className="num text-success shrink-0">+{formatRp(h.lossAvoided)}</span>
                  </li>
                ))}
              </ul>
              <Link to="/finance" className="mt-2 block text-[11px] text-muted-foreground hover:text-foreground">
                Full impact ledger →
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {/* System health */}
            <div className="panel overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium">
                <ShieldCheck className="size-4 text-success" /> System health
              </div>
              <ul className="divide-y divide-border">
                {SYSTEM_HEALTH.map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-3 px-4 py-2">
                    <div>
                      <div className="text-sm">{s.name}</div>
                      <div className="text-[11px] text-muted-foreground">{s.detail}</div>
                    </div>
                    <Chip tone={s.status === "healthy" ? "success" : "warning"}>{s.status}</Chip>
                  </li>
                ))}
              </ul>
            </div>

            {/* Recent AI decisions */}
            <div className="panel overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium">
                <TrendingDown className="size-4 text-primary" /> Recent AI actions
              </div>
              {history.length === 0 ? (
                <div className="px-4 py-4">
                  <p className="text-xs text-muted-foreground">
                    No decisions yet — open an exception to review the AI recommendation.
                  </p>
                  <div className="mt-3 space-y-1.5">
                    <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Prior session examples</div>
                    {EXCEPTION_HISTORY.slice(0, 2).map((h) => (
                      <div key={h.code} className="text-[11px] text-muted-foreground flex items-center justify-between">
                        <span className="num">{h.code}</span>
                        <span className="truncate mx-2">{h.option}</span>
                        <span className="num text-success shrink-0">+{formatRp(h.lossAvoided)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {history.slice(0, 4).map((h) => (
                    <li key={h.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="num text-xs text-muted-foreground">{h.exceptionCode}</span>
                        <Chip tone={h.decision === "approved" ? "success" : "neutral"}>{h.decision}</Chip>
                      </div>
                      <div className="mt-0.5 truncate text-sm">{h.optionLabel}</div>
                      <div className="num text-[11px] text-success">+{formatRp(h.lossAvoided)} avoided</div>
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
