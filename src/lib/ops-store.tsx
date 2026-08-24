import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { type OpsException } from "./ops-data";
import { api } from "./api";

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
  isEmpty: boolean;
  loading: boolean;
  decisionFor: (exceptionId: string) => ActionRecord | undefined;
  openExceptions: OpsException[];
  decide: (args: {
    exception: OpsException;
    optionId: string;
    decision: Decision;
    note?: string | undefined;
  }) => Promise<ActionRecord>;
  reset: () => Promise<void>;
}

const STORAGE_KEY = "aeo.history.v1";
const OpsContext = createContext<OpsState | null>(null);

export function OpsProvider({ children }: { children: ReactNode }) {
  const [exceptions, setExceptions] = useState<OpsException[]>([]);
  const [history, setHistory] = useState<ActionRecord[]>([]);
  const [isEmpty, setIsEmpty] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setLoading(true);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setHistory(JSON.parse(raw) as ActionRecord[]);
    } catch {
      /* ignore corrupt storage */
    }

    Promise.all([api.exceptions(), api.actions()])
      .then(([nextExceptions, nextHistory]) => {
        setExceptions(nextExceptions);
        setHistory(nextHistory);
        setIsEmpty(nextExceptions.length === 0);
        setLoading(false);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory));
      })
      .catch(() => {
        setIsEmpty(true);
        setLoading(false);
      });
  }, []);

  const persist = useCallback((next: ActionRecord[]) => {
    setHistory(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const buildLocalRecord = useCallback(
    ({ exception, optionId, decision, note }: {
      exception: OpsException;
      optionId: string;
      decision: Decision;
      note?: string | undefined;
    }): ActionRecord => {
      const option = exception.options.find((o) => o.id === optionId) ?? exception.options[0]!;
      const baseline = Math.max(...exception.options.map((o) => o.expectedLoss));
      return {
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
    },
    [],
  );

  const decide = useCallback<OpsState["decide"]>(
    async ({ exception, optionId, decision, note }) => {
      let record: ActionRecord;
      try {
        record =
          decision === "approved"
            ? await api.approveException(exception.id, { option_id: optionId, note })
            : await api.rejectException(exception.id, { option_id: optionId, note });
      } catch {
        record = buildLocalRecord({ exception, optionId, decision, note });
      }
      persist([record, ...history.filter((h) => h.exceptionId !== exception.id)]);
      return record;
    },
    [buildLocalRecord, history, persist],
  );

  const reset = useCallback(async () => {
    persist([]);
    try {
      await api.clearActions();
    } catch {
      /* backend unavailable */
    }
  }, [persist]);

  const value = useMemo<OpsState>(() => {
    const decisionFor = (exceptionId: string) => history.find((h) => h.exceptionId === exceptionId);
    return {
      exceptions,
      history,
      isEmpty,
      loading,
      decisionFor,
      openExceptions: exceptions.filter((e) => !decisionFor(e.id)),
      decide,
      reset,
    };
  }, [exceptions, history, isEmpty, loading, decide, reset]);

  return <OpsContext.Provider value={value}>{children}</OpsContext.Provider>;
}

export function useOps() {
  const ctx = useContext(OpsContext);
  if (!ctx) throw new Error("useOps must be used inside OpsProvider");
  return ctx;
}
