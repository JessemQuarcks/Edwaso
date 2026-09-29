'use client';

import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from './api';
import { adminApi } from './admin-api';

interface QueryState<T> {
  data: T | undefined;
  error: string;
  /** True while a request is in flight, including refetches that keep the previous data. */
  loading: boolean;
}

/**
 * GETs an admin endpoint whenever `path` changes. The previous data stays in place while the next
 * request loads, so views can dim instead of flashing a skeleton. Pass null to skip.
 */
export function useAdminQuery<T>(path: string | null) {
  const [state, setState] = useState<QueryState<T>>({ data: undefined, error: '', loading: path !== null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let stale = false;
    setState((s) => ({ ...s, loading: true }));
    adminApi<T>(path)
      .then((data) => {
        if (!stale) setState({ data, error: '', loading: false });
      })
      .catch((err: unknown) => {
        if (!stale) setState((s) => ({ ...s, error: errorMessage(err), loading: false }));
      });
    return () => {
      stale = true;
    };
  }, [path, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((data: T) => setState((s) => ({ ...s, data })), []);
  return { ...state, refetch, setData };
}

/** `value`, updated only after it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
