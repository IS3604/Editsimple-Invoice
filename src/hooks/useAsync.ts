import { useCallback, useEffect, useRef, useState } from 'react';
import { toAppError } from '@/lib/errors';
import { useAuth } from '@/features/auth/AuthProvider';

/**
 * Small data-fetching hook: tracks loading/error, ignores stale responses,
 * and signs the user out cleanly if the session has expired.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);
  const { handleExpired } = useAuth();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const reload = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await run();
      if (id === reqId.current) setData(result);
    } catch (e) {
      if (id !== reqId.current) return;
      const ae = toAppError(e);
      if (ae.sessionExpired) handleExpired();
      setError(ae.message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [run, handleExpired]);

  useEffect(() => { void reload(); }, [reload]);

  return { data, error, loading, reload, setData };
}

/** Debounce a changing value (for search inputs). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
