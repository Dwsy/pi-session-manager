import { useEffect, useState } from "react";

import { invoke } from "@/transport";
import type { PiSettingsFull } from "@/types";

let cachedPiSettingsFull: PiSettingsFull | null = null;
let piSettingsRequest: Promise<PiSettingsFull> | null = null;

export function usePiSettingsFull(enabled = true) {
  const [settings, setSettings] = useState<PiSettingsFull | null>(
    cachedPiSettingsFull,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    if (cachedPiSettingsFull) {
      setSettings(cachedPiSettingsFull);
      setLoading(false);
      return;
    }

    setLoading(true);
    piSettingsRequest ??= invoke<PiSettingsFull>("load_pi_settings_full").finally(
      () => {
        piSettingsRequest = null;
      },
    );

    piSettingsRequest
      .then((next) => {
        if (cancelled) return;
        cachedPiSettingsFull = next;
        setSettings(next);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { settings, loading };
}
