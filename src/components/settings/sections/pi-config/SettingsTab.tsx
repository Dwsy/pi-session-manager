import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { invoke } from "@/transport";
import type { PiSettingsFull } from "@/types";
import SettingRow from "./SettingRow";
import {
  SETTINGS,
  getNestedValue,
  type SettingDef,
} from "./settingsDefinitions";
import { useModelOptions } from "./useModelOptions";

export default function SettingsTab() {
  const { t } = useTranslation();
  const [piSettings, setPiSettings] = useState<PiSettingsFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const modelData = useModelOptions();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await invoke<PiSettingsFull>("load_pi_settings_full");
      setPiSettings(data);
    } catch (e) {
      console.error("Failed to load pi settings:", e);
    } finally {
      setLoading(false);
    }
  };

  const saveSetting = useCallback(async (key: string, value: unknown) => {
    setSavingKey(key);
    try {
      await invoke("save_pi_setting", { key, value });
      setPiSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
      setSavedKey(key);
      setTimeout(() => setSavedKey(null), 1200);
    } catch (e) {
      console.error(`Failed to save ${key}:`, e);
    } finally {
      setSavingKey(null);
    }
  }, []);

  if (loading || !piSettings) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin settings-accent-fg" />
      </div>
    );
  }

  // Group settings
  const groups = SETTINGS.reduce<Record<string, SettingDef[]>>((acc, s) => {
    (acc[s.group] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="max-h-[450px] overflow-y-auto space-y-4">
      {Object.entries(groups).map(([group, items]) => (
        <div key={group}>
          <div className="text-[11px] font-semibold text-foreground uppercase tracking-wider px-1 mb-1.5">
            {t(items[0].groupKey, group)}
          </div>
          <div className="space-y-px">
            {items.map((item) => (
              <SettingRow
                key={item.key}
                def={item}
                value={getNestedValue(
                  piSettings as unknown as Record<string, unknown>,
                  item.key,
                )}
                saving={savingKey === item.key}
                saved={savedKey === item.key}
                onSave={saveSetting}
                modelData={modelData}
                currentProvider={piSettings.defaultProvider}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="text-xs text-muted-foreground bg-surface p-3 rounded-lg">
        {t(
          "settings.piConfig.settingsHelp",
          "Changes are saved directly to ~/.pi/agent/settings.json.",
        )}
      </div>
    </div>
  );
}
