import { useTranslation } from "react-i18next";
import { FolderOpen, Plus, X } from "lucide-react";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsInput from "@/components/settings/SettingsInput";
import type { AppSettings } from "@/components/settings/types";
import ExternalSessionsSettings from "./ExternalSessionsSettings";
import SessionSettings from "./SessionSettings";

const DEFAULT_SESSION_DIR = "~/.pi/agent/sessions";

interface DataSourcesSettingsProps {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(
    section: K,
    key: keyof AppSettings[K],
    value: AppSettings[K][keyof AppSettings[K]],
  ) => void;
  mode?: "all" | "local-paths" | "datasets";
}

export default function DataSourcesSettings({
  settings,
  onUpdate,
  mode = "all",
}: DataSourcesSettingsProps) {
  const { t } = useTranslation();
  const extraDirs = (settings.advanced.sessionDirs || []).filter(
    (dir: string) => dir !== DEFAULT_SESSION_DIR,
  );
  const inputAccentClass =
    "placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-info/40";

  const setExtraDirs = (nextDirs: string[]) => {
    onUpdate("advanced", "sessionDirs", [DEFAULT_SESSION_DIR, ...nextDirs]);
  };

  return (
    <div className="space-y-6">
      {(mode === "all" || mode === "local-paths") && (
        <SettingsCard
          title={t("settings.dataSources.localTitle", "Local session directories")}
          description={t(
            "settings.advanced.sessionDirHelp",
            "Storage location for Pi session files, default path is always included",
          )}
          icon={<FolderOpen className="h-4 w-4" />}
          searchKey="advanced-sessionDir"
          contentClassName="p-4"
        >
          <div className="space-y-2">
            <div className="flex gap-2 items-center">
              <SettingsInput
                type="text"
                value={DEFAULT_SESSION_DIR}
                disabled
                className={`flex-1 w-auto ${inputAccentClass} opacity-80 cursor-not-allowed`}
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap px-2 py-1 bg-secondary/50 rounded">
                {t("settings.advanced.defaultSessionDir", "Default")}
              </span>
            </div>

            {extraDirs.map((dir: string, index: number) => (
              <div key={index} className="flex gap-2 items-center">
                <SettingsInput
                  type="text"
                  value={dir}
                  onChange={(event) => {
                    const nextDirs = [...extraDirs];
                    nextDirs[index] = event.target.value;
                    setExtraDirs(nextDirs);
                  }}
                  className={`flex-1 w-auto ${inputAccentClass}`}
                  placeholder="/path/to/sessions"
                />
                <button
                  onClick={() => {
                    const nextDirs = [...extraDirs];
                    nextDirs.splice(index, 1);
                    setExtraDirs(nextDirs);
                  }}
                  className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg motion-color motion-press focus-ring"
                  title={t("settings.advanced.removeSessionDir", "Remove")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}

            <button
              onClick={() => setExtraDirs([...extraDirs, ""])}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-info hover:bg-info/10 rounded-lg motion-color motion-press focus-ring"
            >
              <Plus className="h-4 w-4" />
              {t("settings.advanced.addSessionDir", "Add path")}
            </button>
          </div>
        </SettingsCard>
      )}

      {(mode === "all" || mode === "datasets") && (
        <SessionSettings settings={settings} onUpdate={onUpdate} mode="data-sources" />
      )}

      {mode === "all" && (
        <ExternalSessionsSettings settings={settings} onUpdate={onUpdate} />
      )}
    </div>
  );
}
