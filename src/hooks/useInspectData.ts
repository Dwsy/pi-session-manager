import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@/transport';
import {
  getBrowserDatasetInspectData,
  isBrowserDatasetModeEnabled,
} from '@/browser-dataset';
import type { InspectData } from '@/types/trace';

const INSPECT_CACHE = new Map<string, InspectData>();
const MAX_INSPECT_CACHE = 5;

function cacheInspect(path: string, data: InspectData) {
  if (INSPECT_CACHE.size >= MAX_INSPECT_CACHE) {
    const firstKey = INSPECT_CACHE.keys().next().value;
    if (firstKey) INSPECT_CACHE.delete(firstKey);
  }
  INSPECT_CACHE.set(path, data);
}

export function useInspectData(sessionPath: string) {
  const [data, setData] = useState<InspectData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionPath) return;

    const cached = INSPECT_CACHE.get(sessionPath);
    if (cached) {
      setData(cached);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = isBrowserDatasetModeEnabled()
      ? getBrowserDatasetInspectData(sessionPath)
      : invoke<InspectData>('get_session_inspect_data', {
          sessionPath,
        });

    load
      .then((result) => {
        if (!cancelled) {
          cacheInspect(sessionPath, result);
          setData(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[useInspectData] Failed to load inspect data:', err);
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
    INSPECT_CACHE.delete(sessionPath);
    setData(null);
    setLoading(true);
    setError(null);

    const load = isBrowserDatasetModeEnabled()
      ? getBrowserDatasetInspectData(sessionPath)
      : invoke<InspectData>('get_session_inspect_data', {
          sessionPath,
        });

    load
      .then((result) => {
        cacheInspect(sessionPath, result);
        setData(result);
      })
      .catch((err) => {
        console.error('[useInspectData] Failed to refresh:', err);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [sessionPath]);

  return { data, loading, error, refresh };
}
