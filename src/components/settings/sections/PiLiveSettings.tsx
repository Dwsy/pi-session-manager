import { useTranslation } from "react-i18next";
import { Bot } from "lucide-react";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";
import type { PiLiveSettings } from "@/types/pi-live";

interface PiLiveSettingsProps {
  settings: PiLiveSettings;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdate: any;
}

export default function PiLiveSettings({
  settings,
  onUpdate,
}: PiLiveSettingsProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <SettingsCard
        title={t("settings.piLive.title", "Pi Live Sessions")}
        description={t(
          "settings.piLive.description",
          "Connect to running Pi agent sessions via WebSocket",
        )}
        icon={<Bot className="h-4 w-4" />}
        contentClassName="p-3"
      >
        <div className="space-y-1">
          <SettingsToggleRow
            title={t("settings.piLive.enable", "Enable Pi Live")}
            description={t(
              "settings.piLive.enableHelp",
              "Show live Pi sessions panel in sidebar",
            )}
            checked={settings.enabled}
            onChange={(checked) => onUpdate("piLive", "enabled", checked)}
            className="items-start py-2"
            descriptionClassName="text-xs text-muted-foreground mt-0.5"
          />

          {settings.enabled && (
            <>
              <SettingsToggleRow
                title={t("settings.piLive.showInSidebar", "Show in Sidebar")}
                description={t(
                  "settings.piLive.showInSidebarHelp",
                  "Display Pi Live button in the sidebar",
                )}
                checked={settings.showInSidebar}
                onChange={(checked) =>
                  onUpdate("piLive", "showInSidebar", checked)
                }
                className="items-start py-2 border-t border-border/60"
                descriptionClassName="text-xs text-muted-foreground mt-0.5"
              />

              <SettingsToggleRow
                title={t("settings.piLive.autoReconnect", "Auto Reconnect")}
                description={t(
                  "settings.piLive.autoReconnectHelp",
                  "Automatically reconnect when connection is lost",
                )}
                checked={settings.autoReconnect}
                onChange={(checked) =>
                  onUpdate("piLive", "autoReconnect", checked)
                }
                className="items-start py-2 border-t border-border/60"
                descriptionClassName="text-xs text-muted-foreground mt-0.5"
              />

              <SettingsToggleRow
                title={t("settings.piLive.showModelInfo", "Show Model Info")}
                description={t(
                  "settings.piLive.showModelInfoHelp",
                  "Display current model in session cards",
                )}
                checked={settings.showModelInfo}
                onChange={(checked) =>
                  onUpdate("piLive", "showModelInfo", checked)
                }
                className="items-start py-2 border-t border-border/60"
                descriptionClassName="text-xs text-muted-foreground mt-0.5"
              />

              <SettingsToggleRow
                title={t(
                  "settings.piLive.showThinkingLevel",
                  "Show Thinking Level",
                )}
                description={t(
                  "settings.piLive.showThinkingLevelHelp",
                  "Display thinking level in session cards",
                )}
                checked={settings.showThinkingLevel}
                onChange={(checked) =>
                  onUpdate("piLive", "showThinkingLevel", checked)
                }
                className="items-start py-2 border-t border-border/60"
                descriptionClassName="text-xs text-muted-foreground mt-0.5"
              />
            </>
          )}
        </div>
      </SettingsCard>
    </div>
  );
}
