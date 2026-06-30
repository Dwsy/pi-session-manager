import { useTranslation } from "react-i18next";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsField from "@/components/settings/SettingsField";
import SettingsRadioCardGroup from "@/components/settings/SettingsRadioCardGroup";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";
import type { SessionSettingsProps } from "@/components/settings/types";
import { formatShortcutText } from "@/utils/platformShortcuts";

export default function SessionGeneralSettings({ settings, onUpdate }: SessionSettingsProps) {
  const { t } = useTranslation();
  const scrollMarkersEnabled =
    settings.session.scrollMarkersEnabled !== false &&
    settings.session.timelineNavEnabled === false;
  const timelineNavEnabled = settings.session.timelineNavEnabled === true;

  return (
        <SettingsCard title={t("settings.sections.sessionViewer", "Session Viewer")}>
          <div className="space-y-4">
            <SettingsToggleRow
              title={t("settings.session.autoRefresh", "Auto refresh")}
              description={t(
                "settings.session.autoRefreshHelp",
                "Auto detect new sessions",
              )}
              checked={settings.session.autoRefresh}
              onChange={(checked) =>
                onUpdate("session", "autoRefresh", checked)
              }
            />

            {settings.session.autoRefresh && (
              <SettingsField
                label={t(
                  "settings.session.refreshInterval",
                  "Refresh interval",
                )}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="5"
                    max="300"
                    step="5"
                    value={settings.session.refreshInterval}
                    onChange={(e) =>
                      onUpdate(
                        "session",
                        "refreshInterval",
                        parseInt(e.target.value),
                      )
                    }
                    className="flex-1 h-2 bg-secondary rounded-lg appearance-none accent-info"
                  />
                  <span className="w-16 text-right text-sm text-muted-foreground">
                    {settings.session.refreshInterval}s
                  </span>
                </div>
              </SettingsField>
            )}

            <SettingsField
              label={t("settings.session.defaultViewMode", "Default view mode")}
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(["list", "directory", "project"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onUpdate("session", "defaultViewMode", mode)}
                    className={`rounded-lg border py-2 text-sm motion-context ${
                      settings.session.defaultViewMode === mode
                        ? "border-info bg-info/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-border-hover"
                    }`}
                  >
                    {t(`settings.session.viewModes.${mode}`)}
                  </button>
                ))}
              </div>
            </SettingsField>

            <SettingsToggleRow
              title={t(
                "settings.session.showMessagePreview",
                "Show message preview",
              )}
              description={t(
                "settings.session.showMessagePreviewHelp",
                "Show last message in session list",
              )}
              checked={settings.session.showMessagePreview}
              onChange={(checked) =>
                onUpdate("session", "showMessagePreview", checked)
              }
              className="items-start pt-4 border-t border-border/60"
            />

            {settings.session.showMessagePreview && (
              <SettingsField
                label={t("settings.session.previewLines", "Preview lines")}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={settings.session.previewLines}
                    onChange={(e) =>
                      onUpdate(
                        "session",
                        "previewLines",
                        parseInt(e.target.value),
                      )
                    }
                    className="flex-1 h-2 bg-secondary rounded-lg appearance-none accent-info"
                  />
                  <span className="w-8 text-right text-sm text-muted-foreground">
                    {settings.session.previewLines}
                  </span>
                </div>
              </SettingsField>
            )}

            <SettingsToggleRow
              title={t(
                "settings.session.colorizeToolCalls",
                "Tool call coloring",
              )}
              description={t(
                "settings.session.colorizeToolCallsHelp",
                "Show different colors for different tool calls in session tree",
              )}
              checked={settings.session.colorizeToolCalls !== false}
              onChange={(checked) =>
                onUpdate("session", "colorizeToolCalls", checked)
              }
              className="items-start pt-4 border-t border-border/60"
            />

            <SettingsToggleRow
              title={t(
                "settings.session.scrollMarkersEnabled",
                "Scroll markers",
              )}
              description={t(
                "settings.session.scrollMarkersEnabledHelp",
                "Show navigation dots on the side for quick jumping between messages",
              )}
              checked={scrollMarkersEnabled}
              onChange={(checked) => {
                onUpdate("session", "scrollMarkersEnabled", checked);
                if (checked) {
                  onUpdate("session", "timelineNavEnabled", false);
                }
              }}
              className="items-start pt-4 border-t border-border/60"
              searchKey="session-scrollMarkersEnabled"
            />

            <SettingsToggleRow
              title={t(
                "settings.session.scrollMarkersGuideSeen",
                "Show feature guide",
              )}
              description={t(
                "settings.session.scrollMarkersGuideSeenHelp",
                "Show introductory tips when opening a session for the first time",
              )}
              checked={!settings.session.scrollMarkersGuideSeen}
              onChange={(checked) =>
                onUpdate("session", "scrollMarkersGuideSeen", !checked)
              }
              className="items-start pt-4 border-t border-border/60"
            />

            <SettingsToggleRow
              title={t(
                "settings.session.timelineNavEnabled",
                "Timeline navigation",
              )}
              description={t(
                "settings.session.timelineNavEnabledHelp",
                "Show a dot timeline on the right side for quick message jumping with hover preview",
              )}
              checked={timelineNavEnabled}
              onChange={(checked) => {
                onUpdate("session", "timelineNavEnabled", checked);
                if (checked) {
                  onUpdate("session", "scrollMarkersEnabled", false);
                }
              }}
              className="items-start pt-4 border-t border-border/60"
              searchKey="session-timelineNavEnabled"
            />

            <SettingsToggleRow
              title={t(
                "settings.session.conversationModeEnabled",
                "Conversation mode",
              )}
              description={t(
                "settings.session.conversationModeEnabledHelp",
                "Group each user request with its final assistant response and fold intermediate thinking/tool steps in the main session view",
              )}
              checked={settings.session.conversationModeEnabled !== false}
              onChange={(checked) =>
                onUpdate("session", "conversationModeEnabled", checked)
              }
              className="items-start pt-4 border-t border-border/60"
              searchKey="session-conversationModeEnabled"
            />


            <SettingsField
              label={t(
                "settings.session.openPosition",
                "Task positioning open position",
              )}
              searchKey="session-openPosition"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(["top", "bottom"] as const).map((position) => (
                  <button
                    key={position}
                    onClick={() =>
                      onUpdate("session", "openPosition", position)
                    }
                    className={`rounded-lg border py-2 text-sm motion-context ${
                      settings.session.openPosition === position
                        ? "border-info bg-info/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-border-hover"
                    }`}
                  >
                    {t(`settings.session.openPositions.${position}`)}
                  </button>
                ))}
              </div>
            </SettingsField>

            <SettingsField
              label={formatShortcutText(
                t("settings.session.cmdFBehavior", "Cmd+F behavior"),
              )}
              description={formatShortcutText(
                t(
                  "settings.session.cmdFBehaviorHelp",
                  "Choose Cmd+F shortcut function",
                ),
              )}
              searchKey="session-cmdFBehavior"
            >
              <SettingsRadioCardGroup
                name="session-cmdf-behavior"
                options={["inSessionSearch", "toggleSidebar"] as const}
                value={settings.session.cmdFBehavior}
                onChange={(value) => onUpdate("session", "cmdFBehavior", value)}
                getLabel={(value) =>
                  value === "inSessionSearch"
                    ? t(
                        "settings.session.cmdFBehaviorOptions.inSessionSearch",
                        "In-session search",
                      )
                    : t(
                        "settings.session.cmdFBehaviorOptions.toggleSidebar",
                        "Toggle session tree",
                      )
                }
                getDescription={(value) =>
                  value === "inSessionSearch"
                    ? formatShortcutText(
                        t(
                          "settings.session.cmdFBehaviorHint.search",
                          "Cmd+F opens in-session search. Use Cmd+Option+B to toggle session tree.",
                        ),
                      )
                    : formatShortcutText(
                        t(
                          "settings.session.cmdFBehaviorHint.sidebar",
                          "Cmd+F toggles session tree. In-session search can be opened via the toolbar.",
                        ),
                      )
                }
              />
            </SettingsField>
          </div>
        </SettingsCard>
  );
}
