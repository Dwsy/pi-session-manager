import { useTranslation } from "react-i18next";

import SettingsCard from "@/components/settings/SettingsCard";
import type { AppSettings } from "@/components/settings/types";
import PiConfigSettings from "./PiConfigSettings";
import PiLiveSettings from "./PiLiveSettings";
import SubagentCompatibilitySettings from "./SubagentCompatibilitySettings";

interface PiAgentSettingsProps {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(
    section: K,
    key: keyof AppSettings[K],
    value: AppSettings[K][keyof AppSettings[K]],
  ) => void;
}

export default function PiAgentSettings({
  settings,
  onUpdate,
}: PiAgentSettingsProps) {
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

      <SubagentCompatibilitySettings settings={settings} onUpdate={onUpdate} />

      <PiLiveSettings settings={settings.piLive} onUpdate={onUpdate} />
    </div>
  );
}
