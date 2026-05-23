import { useTranslation } from "react-i18next";
import { FolderOpen, Plus, Settings2, X } from "lucide-react";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsInput from "@/components/settings/SettingsInput";
import SettingsSliderField from "@/components/settings/SettingsSliderField";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";
import type { AdvancedSettingsProps } from "@/components/settings/types";

interface StorageSettingsTabProps extends AdvancedSettingsProps {
  inputAccentClass: string;
  onClearCache: () => void;
}

export default function StorageSettingsTab({
  settings,
  onUpdate,
  inputAccentClass,
  onClearCache,
}: StorageSettingsTabProps) {
  const { t } = useTranslation();

  return (
        <div className="space-y-6">
          <SettingsCard
            title={t("settings.advanced.sessionDir", "Session directories")}
            description={t(
              "settings.advanced.sessionDirHelp",
              "Storage location for Pi session files, default path is always included",
            )}
            icon={<FolderOpen className="h-4 w-4" />}
            searchKey="advanced-sessionDir"
          >
            <div className="space-y-3">
              <div className="flex gap-2 items-center">
                <SettingsInput
                  type="text"
                  value="~/.pi/agent/sessions"
                  disabled
                  className={`flex-1 w-auto ${inputAccentClass} opacity-80 cursor-not-allowed`}
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap px-2 py-1 bg-secondary/50 rounded">
                  {t("settings.advanced.defaultSessionDir", "Default")}
                </span>
              </div>
              {(settings.advanced.sessionDirs || [])
                .filter((d: string) => d !== "~/.pi/agent/sessions")
                .map((dir: string, index: number) => (
                  <div key={index} className="flex gap-2 items-center">
                    <SettingsInput
                      type="text"
                      value={dir}
                      onChange={(e) => {
                        const extraDirs = (
                          settings.advanced.sessionDirs || []
                        ).filter((d: string) => d !== "~/.pi/agent/sessions");
                        extraDirs[index] = e.target.value;
                        onUpdate("advanced", "sessionDirs", [
                          "~/.pi/agent/sessions",
                          ...extraDirs,
                        ]);
                      }}
                      className={`flex-1 w-auto ${inputAccentClass}`}
                      placeholder="/path/to/sessions"
                    />
                    <button
                      onClick={() => {
                        const extraDirs = (
                          settings.advanced.sessionDirs || []
                        ).filter((d: string) => d !== "~/.pi/agent/sessions");
                        extraDirs.splice(index, 1);
                        onUpdate("advanced", "sessionDirs", [
                          "~/.pi/agent/sessions",
                          ...extraDirs,
                        ]);
                      }}
                      className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg motion-color motion-press focus-ring"
                      title={t("settings.advanced.removeSessionDir", "Remove")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              <button
                onClick={() => {
                  const current = settings.advanced.sessionDirs || [
                    "~/.pi/agent/sessions",
                  ];
                  onUpdate("advanced", "sessionDirs", [...current, ""]);
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-info hover:bg-info/10 rounded-lg motion-color motion-press focus-ring"
              >
                <Plus className="h-4 w-4" />
                {t("settings.advanced.addSessionDir", "Add path")}
              </button>
            </div>
          </SettingsCard>

          <SettingsCard
            title={t("settings.advanced.generalTitle", "General options")}
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
                    label={t(
                      "settings.advanced.maxCacheSize",
                      "Max cache size",
                    )}
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
                onChange={(checked) =>
                  onUpdate("advanced", "debugMode", checked)
                }
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
                onChange={(checked) =>
                  onUpdate("advanced", "demoMode", checked)
                }
                className="items-start py-2 border-t border-border/60"
                descriptionClassName="text-xs text-muted-foreground mt-0.5"
              />
            </div>
          </SettingsCard>

          <SettingsCard>
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
                onClick={onClearCache}
                className="px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-medium motion-color motion-press focus-ring"
              >
                {t("settings.advanced.clearCache", "Clear cache")}
              </button>
            </div>
          </SettingsCard>
        </div>
  );
}
