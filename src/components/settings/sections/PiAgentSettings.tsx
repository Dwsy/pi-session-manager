import { useTranslation } from "react-i18next";

import SettingsCard from "@/components/settings/SettingsCard";
import type { PiLiveSettingsProps } from "@/components/settings/types";
import PiConfigSettings from "./PiConfigSettings";
import PiLiveSettings from "./PiLiveSettings";

export default function PiAgentSettings({
  settings,
  onUpdate,
}: PiLiveSettingsProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <SettingsCard
        title={t("settings.piAgent.resourcesTitle", "Pi resources and runtime settings")}
        description={t(
          "settings.piAgent.resourcesDescription",
          "Manage Pi skills, prompts, extensions, themes and Pi settings.json.",
        )}
      >
        <PiConfigSettings />
      </SettingsCard>

      <PiLiveSettings settings={settings.piLive} onUpdate={onUpdate} />
    </div>
  );
}
