import { useEffect, useMemo, useRef, useState } from "react";

import { invoke } from "@/transport";
import type { ModelOption } from "@/types";

let cachedModelOptions: ModelOption[] | null = null;
let cachedFullLoaded = false;
let fullModelOptionsRequest: Promise<ModelOption[]> | null = null;

/** Hook: progressive model loading (fast from config, then full from CLI) */
export function useModelOptions(enabled = true) {
  const [models, setModels] = useState<ModelOption[]>(cachedModelOptions ?? []);
  const [loading, setLoading] = useState(false);
  const loadedFull = useRef(cachedFullLoaded);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let shouldKeepLoading = !cachedFullLoaded && (cachedModelOptions?.length ?? 0) === 0;
    setLoading(shouldKeepLoading);
    let fastHadModels = false;
    let fullResolved = false;

    // Phase 1: fast read from models.json
    if (!cachedFullLoaded) {
      invoke<ModelOption[]>("list_model_options_fast")
        .then((fast) => {
          if (cancelled) return;
          if (fullResolved) return;
          fastHadModels = fast.length > 0;
          cachedModelOptions = fast;
          setModels(fast);
          if (fastHadModels) {
            shouldKeepLoading = false;
            setLoading(false);
          }
        })
        .catch(() => {});
    }

    if (cachedFullLoaded) {
      return () => {
        cancelled = true;
      };
    }

    // Phase 2: full list from `pi --list-models` (background, shared per app session)
    fullModelOptionsRequest ??= invoke<ModelOption[]>("list_model_options_full")
      .finally(() => {
        fullModelOptionsRequest = null;
      });

    fullModelOptionsRequest
      .then((full) => {
        if (!cancelled) {
          fullResolved = true;
          cachedModelOptions = full;
          cachedFullLoaded = true;
          setModels(full);
          loadedFull.current = true;
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled && (shouldKeepLoading || !fastHadModels)) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const providers = useMemo(
    () => [...new Set(models.map((m) => m.provider))].sort(),
    [models],
  );

  const modelsByProvider = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of models) {
      if (!map.has(m.provider)) map.set(m.provider, []);
      map.get(m.provider)!.push(m.model);
    }
    return map;
  }, [models]);

  return {
    providers,
    modelsByProvider,
    loading,
    loadedFull: loadedFull.current,
  };
}

export type ModelOptionsData = ReturnType<typeof useModelOptions>;
