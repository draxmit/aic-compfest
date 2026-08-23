import { useEffect, useState, useCallback } from "react";

export interface ApiDataState<T> {
  data: T;
  loading: boolean;
  isEmpty: boolean;
  reload: () => void;
}

export function useApiData<T>(fallback: T, load: () => Promise<T>): ApiDataState<T> {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .then((next) => {
        if (!active) return;
        const hasData = Array.isArray(next) ? next.length > 0 : next != null;
        if (hasData) {
          setData(next);
          setIsEmpty(false);
        } else {
          setIsEmpty(true);
        }
      })
      .catch(() => {
        if (active) setIsEmpty(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return { data, loading, isEmpty, reload };
}
