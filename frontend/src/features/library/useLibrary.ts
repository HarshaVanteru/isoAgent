import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, isAbortError } from '../../api/client';
import { api } from '../../api/endpoints';
import type { LibraryReport } from '../../api/types';
import { countByStatus, listCategories, mergeFiles } from './files';

export const POLL_INTERVAL_MS = 30_000;

export type LibraryStatus = 'loading' | 'ready' | 'unavailable';

/** Loads the library report and refreshes it periodically unless paused. */
export function useLibrary({ paused }: { paused: boolean }) {
  const [report, setReport] = useState<LibraryReport | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const controller = new AbortController();
    let failing = false;
    const load = async () => {
      try {
        const data = await api.library(controller.signal);
        failing = false;
        setReport(data);
        setOnline(true);
        setError(null);
      } catch (caught) {
        // Report a failure once per outage; keep the last good snapshot on screen.
        if (isAbortError(caught) || failing) return;
        failing = true;
        setOnline(false);
        setError(errorMessage(caught));
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!pausedRef.current) void load();
    }, POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  const files = useMemo(() => mergeFiles(report), [report]);
  const categories = useMemo(() => listCategories(files), [files]);
  const indexedCount = useMemo(() => countByStatus(files).indexed, [files]);
  const dismissError = useCallback(() => setError(null), []);
  const status: LibraryStatus = report ? 'ready' : online === false ? 'unavailable' : 'loading';

  return {
    files,
    categories,
    indexedCount,
    chunkCount: report?.chunks ?? 0,
    indexedAt: report?.indexed_at ?? null,
    status,
    online,
    error,
    dismissError,
  };
}
