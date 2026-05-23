import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Blocks, History, Settings2 } from "lucide-react";

import SettingsTabs from "@/components/settings/SettingsTabs";
import ResourcesTab from "./pi-config/ResourcesTab";
import SettingsTab from "./pi-config/SettingsTab";
import ConfigVersionsTab from "./pi-config/ConfigVersionsTab";

type PiConfigTab = "resources" | "settings" | "versions";

export default function PiConfigSettings() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<PiConfigTab>("resources");

  return (
    <div className="space-y-4">
      <SettingsTabs
        items={[
          {
            id: "resources",
            icon: <Blocks className="h-3.5 w-3.5" />,
            label: t("settings.piConfig.tabs.resources", "Resources"),
          },
          {
            id: "settings",
            icon: <Settings2 className="h-3.5 w-3.5" />,
            label: t("settings.piConfig.tabs.settings", "Settings"),
          },
          {
            id: "versions",
            icon: <History className="h-3.5 w-3.5" />,
            label: t("settings.piConfig.tabs.versions", "Versions"),
          },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />
      {activeTab === "resources" && <ResourcesTab />}
      {activeTab === "settings" && <SettingsTab />}
      {activeTab === "versions" && <ConfigVersionsTab />}
    </div>
  );
}
