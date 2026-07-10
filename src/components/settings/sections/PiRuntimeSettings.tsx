import { useState } from "react";
import { useTranslation } from "react-i18next";
import { History, Settings2 } from "lucide-react";

import SettingsTabs from "@/components/settings/SettingsTabs";
import SettingsTab from "./pi-config/SettingsTab";
import ConfigVersionsTab from "./pi-config/ConfigVersionsTab";

type PiRuntimeTab = "settings" | "versions";

export default function PiRuntimeSettings() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<PiRuntimeTab>("settings");

  return (
    <div className="space-y-3">
      <SettingsTabs
        items={[
          {
            id: "settings",
            icon: <Settings2 className="h-3.5 w-3.5" />,
            label: t("settings.piRuntime.tabs.settings", "Settings"),
          },
          {
            id: "versions",
            icon: <History className="h-3.5 w-3.5" />,
            label: t("settings.piRuntime.tabs.versions", "Versions"),
          },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />
      {activeTab === "settings" && <SettingsTab />}
      {activeTab === "versions" && <ConfigVersionsTab />}
    </div>
  );
}
