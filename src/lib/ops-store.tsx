import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { EXCEPTIONS, type OpsException } from "./ops-data";

export type Decision = "approved" | "rejected";

export interface ActionRecord {
  id: string;
  exceptionId: string;
  exceptionCode: string;
  exceptionTitle: string;
  optionId: string;
  optionLabel: string;
  recommendedOptionId: string;
  decision: Decision;
  note?: string | undefined;
  expectedLoss: number;
  baselineLoss: number;
  lossAvoided: number;
  timestamp: string;
  status: "Executed (simulated)" | "Dismissed";
}

interface OpsState {
  exceptions: OpsException[];
  history: ActionRecord[];
  decisionFor: (exceptionId: string) => ActionRecord | undefined;
  openExceptions: OpsException[];
  decide: (args: {
    exception: OpsException;
    optionId: string;
    decision: Decision;
    note?: string | undefined;
  }) => ActionRecord;
  reset: () => void;
}

const STORAGE_KEY = "aeo.history.v1";
const OpsContext = createContext<OpsState | null>(null);

export function OpsProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<ActionRecord[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setHistory(JSON.parse(raw) as ActionRecord[]);
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  const persist = useCallback((next: ActionRecord[]) => {
    setHistory(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const decide = useCallback<OpsState["decide"]>(
    ({ exception, optionId, decision, note }) => {
      const option = exception.options.find((o) => o.id === optionId) ?? exception.options[0]!;
      const baseline = Math.max(...exception.options.map((o) => o.expectedLoss));
      const record: ActionRecord = {
        id: `${exception.code}-${Date.now()}`,
        exceptionId: exception.id,
        exceptionCode: exception.code,
        exceptionTitle: exception.title,
        optionId: option.id,
        optionLabel: option.label,
        recommendedOptionId: exception.options.find((o) => o.recommended)?.id ?? option.id,
        decision,
        note,
        expectedLoss: decision === "approved" ? option.expectedLoss : baseline,
        baselineLoss: baseline,
        lossAvoided: decision === "approved" ? baseline - option.expectedLoss : 0,
        timestamp: new Date().toISOString(),
        status: decision === "approved" ? "Executed (simulated)" : "Dismissed",
      };
      persist([record, ...history.filter((h) => h.exceptionId !== exception.id)]);
      return record;
    },
    [history, persist],
  );

  const value = useMemo<OpsState>(() => {
    const decisionFor = (exceptionId: string) => history.find((h) => h.exceptionId === exceptionId);
    return {
      exceptions: EXCEPTIONS,
      history,
      decisionFor,
      openExceptions: EXCEPTIONS.filter((e) => !decisionFor(e.id)),
      decide,
      reset: () => persist([]),
    };
  }, [history, decide, persist]);

  return <OpsContext.Provider value={value}>{children}</OpsContext.Provider>;
}

export function useOps() {
  const ctx = useContext(OpsContext);
  if (!ctx) throw new Error("useOps must be used inside OpsProvider");
  return ctx;
}
