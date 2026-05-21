import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings2 } from "lucide-react";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";
import type { UpdateSettingsProps } from "@/components/settings/types";
import { invoke } from "@/transport";
import UpdateSettings from "./UpdateSettings";

export default function AppBehaviorSettings({
  settings,
  onUpdate,
}: UpdateSettingsProps) {
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
    <div className="space-y-6">
      <SettingsCard
        title={t("settings.appBehavior.title", "App behavior")}
        description={t(
          "settings.appBehavior.description",
          "Control window behavior and everyday app-level defaults.",
        )}
        icon={<Settings2 className="h-4 w-4" />}
      >
        <SettingsToggleRow
          title={t("settings.advanced.lightweightMode", "Lightweight mode")}
          description={t(
            "settings.advanced.lightweightModeDesc",
            "When enabled, closing the window minimizes to system tray instead of quitting. Tray menu: Show / Open Web / Quit",
          )}
          checked={lightweightMode}
          onChange={handleToggleLightweightMode}
          className="items-start py-1"
          descriptionClassName="text-xs text-muted-foreground mt-0.5"
          searchKey="advanced-lightweightMode"
        />
      </SettingsCard>

      <UpdateSettings settings={settings} onUpdate={onUpdate} />
    </div>
  );
}
