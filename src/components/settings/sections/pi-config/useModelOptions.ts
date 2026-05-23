import { useEffect, useMemo, useRef, useState } from "react";

import { invoke } from "@/transport";
import type { ModelOption } from "@/types";

/** Hook: progressive model loading (fast from config, then full from CLI) */
export function useModelOptions() {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const loadedFull = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // Phase 1: fast read from models.json
    invoke<ModelOption[]>("list_model_options_fast")
      .then((fast) => {
        if (!cancelled) setModels(fast);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Phase 2: full list from `pi --list-models` (background)
    invoke<ModelOption[]>("list_model_options_full")
      .then((full) => {
        if (!cancelled) {
          setModels(full);
          loadedFull.current = true;
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

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
