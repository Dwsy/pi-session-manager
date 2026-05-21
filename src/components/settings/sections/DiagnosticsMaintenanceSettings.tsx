import { useTranslation } from "react-i18next";
import { Database, Settings2 } from "lucide-react";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsSliderField from "@/components/settings/SettingsSliderField";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";
import type { AdvancedSettingsProps } from "@/components/settings/types";
import { invoke } from "@/transport";
import APITestSettings from "./APITestSettings";

interface ClearCacheResult {
  sessions_deleted: number;
  details_deleted: number;
}

export default function DiagnosticsMaintenanceSettings({
  settings,
  onUpdate,
}: AdvancedSettingsProps) {
  const { t } = useTranslation();

  const handleClearCache = async () => {
    if (
      !confirm(
        t(
          "settings.advanced.clearCacheConfirm",
          "Are you sure you want to clear all cache data? This will delete all session cache but keep favorites.",
        ),
      )
    ) {
      return;
    }
    try {
      const result = await invoke<ClearCacheResult>("clear_cache");
      alert(
        t(
          "settings.advanced.cacheClearedDetail",
          "Cache cleared: {{sessions}} sessions, {{details}} details cache",
          {
            sessions: result.sessions_deleted,
            details: result.details_deleted,
          },
        ),
      );
    } catch (error) {
      console.error("Failed to clear cache:", error);
      alert(t("settings.advanced.cacheClearFailed", "Failed to clear cache"));
    }
  };

  return (
    <div className="space-y-6">
      <SettingsCard
        title={t("settings.diagnostics.maintenanceTitle", "Maintenance")}
        description={t(
          "settings.diagnostics.maintenanceDescription",
          "Cache, debug and demo controls that affect local runtime behavior.",
        )}
        icon={<Settings2 className="h-4 w-4" />}
      >
        <div className="space-y-4">
          <SettingsToggleRow
            title={t("settings.advanced.cacheEnabled", "Enable cache")}
            description={t(
              "settings.advanced.cacheEnabledHelp",
              "Cache session data to improve performance",
            )}
            checked={settings.advanced.cacheEnabled}
            onChange={(checked) =>
              onUpdate("advanced", "cacheEnabled", checked)
            }
            className="items-start py-2"
            descriptionClassName="text-xs text-muted-foreground mt-0.5"
          />

          {settings.advanced.cacheEnabled && (
            <div className="pl-0 pt-2 border-t border-border/60">
              <SettingsSliderField
                label={t("settings.advanced.maxCacheSize", "Max cache size")}
                value={settings.advanced.maxCacheSize}
                min={10}
                max={1000}
                step={10}
                onChange={(value) =>
                  onUpdate("advanced", "maxCacheSize", value)
                }
                valueText={`${settings.advanced.maxCacheSize} MB`}
                sliderClassName="rounded-full"
                valueClassName="w-16 font-mono"
                fieldClassName="space-y-2"
              />
            </div>
          )}

          <SettingsToggleRow
            title={t("settings.advanced.debugMode", "Debug mode")}
            description={t(
              "settings.advanced.debugModeHelp",
              "Enable verbose logging",
            )}
            checked={settings.advanced.debugMode}
            onChange={(checked) => onUpdate("advanced", "debugMode", checked)}
            className="items-start py-2 border-t border-border/60"
            descriptionClassName="text-xs text-muted-foreground mt-0.5"
          />

          <SettingsToggleRow
            title={t("app.demoMode", "Demo mode")}
            description={t(
              "app.demoModeDescription",
              "View demo data to explore all features",
            )}
            checked={settings.advanced.demoMode}
            onChange={(checked) => onUpdate("advanced", "demoMode", checked)}
            className="items-start py-2 border-t border-border/60"
            descriptionClassName="text-xs text-muted-foreground mt-0.5"
          />
        </div>
      </SettingsCard>

      <SettingsCard
        title={t("settings.diagnostics.actionsTitle", "Maintenance actions")}
        icon={<Database className="h-4 w-4" />}
      >
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => {
              localStorage.removeItem("onboarding-completed");
              alert(
                t(
                  "settings.advanced.onboardingReset",
                  "Onboarding will be shown next time the app opens",
                ),
              );
            }}
            className="px-4 py-2 bg-info/10 text-info hover:bg-info/20 rounded-lg text-sm font-medium motion-color motion-press focus-ring"
          >
            {t("settings.advanced.showOnboarding", "Show onboarding again")}
          </button>
          <button
            onClick={handleClearCache}
            className="px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-medium motion-color motion-press focus-ring"
          >
            {t("settings.advanced.clearCache", "Clear cache")}
          </button>
        </div>
      </SettingsCard>

      <APITestSettings />
    </div>
  );
}
