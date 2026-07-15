import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppWindow, PanelTopClose } from "lucide-react";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";
import type { UpdateSettingsProps } from "@/components/settings/types";
import { invoke } from "@/transport";

export default function AppBehaviorSettings(_: UpdateSettingsProps) {
  const { t } = useTranslation();
  const [lightweightMode, setLightweightMode] = useState(false);

  useEffect(() => {
    invoke<boolean>("get_lightweight_mode")
      .then(setLightweightMode)
      .catch(console.error);
  }, []);

  const handleToggleLightweightMode = async (enabled: boolean) => {
    setLightweightMode(enabled);
    try {
      await invoke("set_lightweight_mode", { enabled });
    } catch (error) {
      console.error("Failed to set lightweight mode:", error);
      setLightweightMode(!enabled);
    }
  };

  return (
    <div className="space-y-4">
      <SettingsCard
        title={t("settings.appBehavior.title", "App behavior")}
        description={t(
          "settings.appBehavior.description",
          "Control window behavior and everyday app-level defaults.",
        )}
        icon={<AppWindow className="h-4 w-4" />}
        contentClassName="p-0"
      >
        <div className="flex gap-3 px-3 py-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/40 bg-secondary/35 text-muted-foreground">
            <PanelTopClose className="h-4 w-4" />
          </div>
          <SettingsToggleRow
            title={t("settings.advanced.lightweightMode", "Lightweight mode")}
            description={t(
              "settings.advanced.lightweightModeDesc",
              "When enabled, closing the window minimizes to system tray instead of quitting. Tray menu: Show / Open Web / Quit",
            )}
            checked={lightweightMode}
            onChange={handleToggleLightweightMode}
            className="min-w-0 flex-1 items-start"
            descriptionClassName="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground"
            searchKey="advanced-lightweightMode"
          />
        </div>
      </SettingsCard>
    </div>
  );
}
