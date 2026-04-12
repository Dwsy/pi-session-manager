import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@/transport';
import type { SessionTraceAnalytics } from '@/types/trace';

const TRACE_CACHE = new Map<string, SessionTraceAnalytics>();
const MAX_TRACE_CACHE = 5;

function cacheTrace(path: string, data: SessionTraceAnalytics) {
  if (TRACE_CACHE.size >= MAX_TRACE_CACHE) {
    const firstKey = TRACE_CACHE.keys().next().value;
    if (firstKey) TRACE_CACHE.delete(firstKey);
  }
  TRACE_CACHE.set(path, data);
}

export function useSessionTrace(sessionPath: string) {
  const [analytics, setAnalytics] = useState<SessionTraceAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionPath) return;

    const cached = TRACE_CACHE.get(sessionPath);
    if (cached) {
      setAnalytics(cached);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<SessionTraceAnalytics>('get_session_trace_analytics', {
      sessionPath,
    })
      .then((data) => {
        if (!cancelled) {
          cacheTrace(sessionPath, data);
          setAnalytics(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[useSessionTrace] Failed to load trace analytics:', err);
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionPath]);

  const refresh = useCallback(() => {
    if (!sessionPath) return;
    TRACE_CACHE.delete(sessionPath);
    setAnalytics(null);
    setLoading(true);
    setError(null);

    invoke<SessionTraceAnalytics>('get_session_trace_analytics', {
      sessionPath,
    })
      .then((data) => {
        cacheTrace(sessionPath, data);
        setAnalytics(data);
      })
      .catch((err) => {
        console.error('[useSessionTrace] Failed to refresh:', err);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [sessionPath]);

  return {
    analytics,
    loading,
    error,
    refresh,
    // Convenience getters
    totalEvents: analytics?.total_events ?? 0,
    totalToolCalls: analytics?.total_tool_calls ?? 0,
    totalErrors: analytics?.total_errors ?? 0,
    primaryModel: analytics?.primary_model ?? '—',
  };
}
