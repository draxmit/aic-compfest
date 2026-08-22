import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Check, X, FlaskConical, Sparkles, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell, Chip, SeverityDot } from "@/components/ops/AppShell";
import { useOps } from "@/lib/ops-store";
import {
  EXCEPTION_TYPE_LABEL,
  formatNumber,
  formatPct,
  formatRp,
  formatTime,
  type OpsException,
} from "@/lib/ops-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ai-operations/exceptions/$exceptionId")({
  head: () => ({
    meta: [
      { title: "Exception Detail — AI Operations" },
      {
        name: "description",
        content:
          "What happened, what will happen and what to do next: impact prediction, recovery options and human approval.",
      },
      { property: "og:title", content: "Exception Detail — AI Operations" },
      {
        property: "og:description",
        content: "Impact prediction, optimized recovery options and explainability for a single operational exception.",
      },
    ],
  }),
  component: ExceptionDetailPage,
  notFoundComponent: ExceptionNotFound,
});

function ExceptionNotFound() {
  return (
    <AppShell>
      <div className="px-6 py-16 text-center md:px-8">
        <h1 className="text-lg font-semibold">Exception not found</h1>
        <Link to="/ai-operations" className="mt-3 inline-block text-sm text-primary hover:underline">
          Back to exception queue
        </Link>
      </div>
    </AppShell>
  );
}

function Section({ step, title, subtitle, children }: { step: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border px-6 py-6 md:px-8">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="num text-xs text-muted-foreground">{step}</span>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ImpactCell({ label, value, tone }: { label: string; value: string; tone?: "danger" | "warning" }) {
  return (
    <div className="panel p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "num mt-2 text-xl font-semibold",
          tone === "danger" && "text-destructive",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ExceptionDetailPage() {
  const { exceptionId } = Route.useParams();
  const { exceptions, decide, decisionFor } = useOps();
  const exception = exceptions.find((e) => e.id === exceptionId);
  if (!exception) throw notFound();
  return <Detail exception={exception} decide={decide} record={decisionFor(exception.id)} />;
}

function Detail({
  exception,
  decide,
  record,
}: {
  exception: OpsException;
  decide: ReturnType<typeof useOps>["decide"];
  record: ReturnType<ReturnType<typeof useOps>["decisionFor"]>;
}) {
  const recommended = exception.options.find((o) => o.recommended) ?? exception.options[0]!;
  const [selected, setSelected] = useState(record?.optionId ?? recommended.id);
  const [note, setNote] = useState(record?.note ?? "");
  const [simulated, setSimulated] = useState<string | null>(null);

  const option = exception.options.find((o) => o.id === selected) ?? recommended;
  const baseline = useMemo(() => Math.max(...exception.options.map((o) => o.expectedLoss)), [exception]);
  const decided = Boolean(record);

  const submit = (decision: "approved" | "rejected") => {
    const r = decide({ exception, optionId: selected, decision, note: note || undefined });
    toast.success(
      decision === "approved"
        ? `Approved: ${r.optionLabel} · ${formatRp(r.lossAvoided)} estimated loss avoided`
        : `Rejected — exception logged with the do-nothing baseline of ${formatRp(r.baselineLoss)}`,
    );
  };

  return (
    <AppShell>
      <div className="hero-glow border-b border-border px-6 py-6 md:px-8">
        <Link to="/ai-operations" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Exception queue
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SeverityDot severity={exception.severity} />
          <span className="num text-xs text-muted-foreground">{exception.code}</span>
          <Chip tone="neutral">{EXCEPTION_TYPE_LABEL[exception.type]}</Chip>
          <Chip tone={exception.severity === "critical" ? "danger" : "warning"}>{exception.severity}</Chip>
          <Chip tone="neutral">detected {formatTime(exception.detectedAt)}</Chip>
          {record ? (
            <Chip tone={record.decision === "approved" ? "success" : "neutral"}>{record.status}</Chip>
          ) : null}
        </div>
        <h1 className="mt-3 max-w-3xl text-xl font-semibold md:text-2xl">{exception.title}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {exception.source} · detection confidence {formatPct(exception.confidence)}
        </p>
      </div>

      <Section step="01" title="What happened" subtitle="Exception detection">
        <div className="panel divide-y divide-border">
          {[
            ["Signal", exception.detection.signal],
            ["Baseline", exception.detection.baseline],
            ["Observed", exception.detection.observed],
            ["Trigger rule", exception.detection.rule],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-1 px-4 py-3 md:grid-cols-[160px_1fr] md:gap-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className="text-sm">{v}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section step="02" title="What will happen" subtitle="Impact prediction (LightGBM-style scoring on operational features)">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          <ImpactCell label="Affected orders" value={formatNumber(exception.impact.affectedOrders)} />
          <ImpactCell
            label="Production impact"
            value={exception.impact.productionDelayHours ? `${exception.impact.productionDelayHours}h delay` : "None"}
          />
          <ImpactCell label="Inventory cover" value={`${exception.impact.inventoryCoverDays} days`} tone="warning" />
          <ImpactCell label="SLA breach risk" value={formatPct(exception.impact.slaRisk)} tone="danger" />
          <ImpactCell label="Expected loss" value={formatRp(exception.impact.expectedLoss)} tone="danger" />
        </div>
        <div className="panel mt-3 p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Logistics impact</div>
          <p className="mt-1.5 text-sm">{exception.impact.logisticsNote}</p>
          <div className="mt-4 flex items-end gap-1.5">
            {exception.timeline.map((p) => {
              const max = Math.max(...exception.timeline.map((x) => Math.max(x.baseline, x.projected)));
              return (
                <div key={p.t} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-24 w-full items-end justify-center gap-0.5">
                    <div
                      className="w-2.5 rounded-t bg-muted"
                      style={{ height: `${(p.baseline / max) * 100}%` }}
                      title={`baseline ${p.baseline}`}
                    />
                    <div
                      className="w-2.5 rounded-t bg-primary"
                      style={{ height: `${(p.projected / max) * 100}%` }}
                      title={`projected ${p.projected}`}
                    />
                  </div>
                  <span className="num text-[10px] text-muted-foreground">{p.t}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-sm bg-muted" /> Baseline fulfilment
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-sm bg-primary" /> Projected with exception
            </span>
          </div>
        </div>
      </Section>

      <Section step="03" title="What should we do" subtitle="Recovery optimization — minimize expected total cost and risk">
        <div className="grid gap-3 md:grid-cols-3">
          {exception.options.map((o) => {
            const active = o.id === selected;
            return (
              <button
                key={o.id}
                onClick={() => setSelected(o.id)}
                disabled={decided}
                className={cn(
                  "panel text-left transition-colors disabled:cursor-not-allowed",
                  active ? "border-primary/60 bg-accent/40" : "hover:border-border-strong",
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <span className="text-sm font-medium">{o.label}</span>
                  {o.recommended ? (
                    <Chip tone="primary">
                      <Sparkles className="size-3" /> AI pick
                    </Chip>
                  ) : null}
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-muted-foreground">{o.summary}</p>
                  <dl className="num mt-3 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Expected loss</dt>
                      <dd className={cn("font-medium", o.expectedLoss === baseline ? "text-destructive" : "text-success")}>
                        {formatRp(o.expectedLoss)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">SLA risk</dt>
                      <dd>{formatPct(o.slaRisk)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Lead time</dt>
                      <dd>{o.leadTimeHours}h</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Extra cost</dt>
                      <dd>{formatRp(o.extraCost)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Feasibility</dt>
                      <dd>{formatPct(o.feasibility)}</dd>
                    </div>
                  </dl>
                </div>
              </button>
            );
          })}
        </div>

        <div className="panel mt-3 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Info className="size-4 text-primary" /> Why the AI recommends “{recommended.label}”
          </div>
          <ul className="mt-2.5 space-y-1.5">
            {exception.explanation.map((e) => (
              <li key={e} className="flex gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 inline-block size-1 shrink-0 rounded-full bg-primary" />
                {e}
              </li>
            ))}
          </ul>
          <p className="num mt-3 text-xs text-muted-foreground">
            Objective: minimize expected total cost = expected SLA penalty + recovery spend, subject to capacity and
            lead-time constraints.
          </p>
        </div>
      </Section>

      <Section step="04" title="Human approval" subtitle="Human-in-the-loop — no irreversible autonomous actions">
        <div className="panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm">
                Selected action: <span className="font-medium">{option.label}</span>
              </div>
              <div className="num mt-1 text-xs text-muted-foreground">
                Expected loss {formatRp(option.expectedLoss)} · vs. do-nothing {formatRp(baseline)} ·{" "}
                <span className="text-success">{formatRp(baseline - option.expectedLoss)} avoided</span>
              </div>
            </div>
            {decided ? (
              <Chip tone={record!.decision === "approved" ? "success" : "neutral"}>
                Decision logged {formatTime(record!.timestamp)}
              </Chip>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    setSimulated(
                      `Simulation: ${option.label} → expected loss ${formatRp(option.expectedLoss)}, SLA risk ${formatPct(option.slaRisk)}, lead time ${option.leadTimeHours}h, feasibility ${formatPct(option.feasibility)}.`,
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm transition-colors hover:bg-surface-2"
                >
                  <FlaskConical className="size-4" /> Simulate
                </button>
                <button
                  onClick={() => submit("rejected")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-4" /> Reject
                </button>
                <button
                  onClick={() => submit("approved")}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Check className="size-4" /> Approve
                </button>
              </div>
            )}
          </div>

          {!decided ? (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional decision note for the audit trail…"
              rows={2}
              className="mt-4 w-full resize-none rounded-md border border-input bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
            />
          ) : null}

          {simulated ? (
            <p className="num mt-3 rounded-md border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted-foreground">
              {simulated}
            </p>
          ) : null}
        </div>
      </Section>

      <Section step="05" title="Action plan" subtitle="Simulated system updates — no real ERP/MES/WMS writes in the MVP">
        <ol className="panel divide-y divide-border">
          {exception.actionPlan.map((a, i) => (
            <li key={a.id} className="flex items-start gap-3 px-4 py-3">
              <span
                className={cn(
                  "num mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px]",
                  decided && record!.decision === "approved"
                    ? "bg-success/15 text-success"
                    : "bg-surface-2 text-muted-foreground",
                )}
              >
                {decided && record!.decision === "approved" ? <Check className="size-3" /> : i + 1}
              </span>
              <div className="min-w-0">
                <div className="text-sm">{a.label}</div>
                <div className="text-[11px] text-muted-foreground">
                  {a.system} · owner {a.owner}
                </div>
              </div>
              <span className="ml-auto shrink-0">
                <Chip tone={decided && record!.decision === "approved" ? "success" : "neutral"}>
                  {decided ? (record!.decision === "approved" ? "Executed" : "Not executed") : "Pending approval"}
                </Chip>
              </span>
            </li>
          ))}
        </ol>
        <Link to="/ai-operations/history" className="mt-3 inline-block text-xs text-primary hover:underline">
          View action history →
        </Link>
      </Section>
    </AppShell>
  );
}
