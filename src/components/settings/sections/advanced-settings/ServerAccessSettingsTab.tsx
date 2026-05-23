import { useTranslation } from "react-i18next";
import { AlertTriangle, Server, Shield } from "lucide-react";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsField from "@/components/settings/SettingsField";
import SettingsInput from "@/components/settings/SettingsInput";
import SettingsSelect from "@/components/settings/SettingsSelect";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";
import type { AdvancedSettingsMode, ServerSettings } from "./advancedSettingsTypes";

interface ServerAccessSettingsTabProps {
  serverSettings: ServerSettings;
  mode: AdvancedSettingsMode;
  lightweightMode: boolean;
  serverDirty: boolean;
  inputAccentClass: string;
  selectAccentClass: string;
  isRemoteBind: boolean;
  onUpdateServer: <K extends keyof ServerSettings>(key: K, value: ServerSettings[K]) => void;
  onToggleLightweightMode: (enabled: boolean) => void;
  onSaveServerSettings: () => void;
}

export default function ServerAccessSettingsTab({
  serverSettings,
  mode,
  lightweightMode,
  serverDirty,
  inputAccentClass,
  selectAccentClass,
  isRemoteBind,
  onUpdateServer,
  onToggleLightweightMode,
  onSaveServerSettings,
}: ServerAccessSettingsTabProps) {
  const { t } = useTranslation();

  return (
        <SettingsCard
          title={t("settings.advanced.serverSection", "Server Settings")}
          description={t(
            "settings.advanced.serverSectionDesc",
            "WebSocket, HTTP API and authentication configuration",
          )}
          icon={<Server className="h-4 w-4" />}
        >
          <div className="space-y-5">
            <SettingsField
              label={t("settings.advanced.bindAddr", "Bind Address")}
              description={t(
                "settings.advanced.bindAddrHelp",
                "127.0.0.1 for local access only, 0.0.0.0 allows remote connections",
              )}
              className="space-y-2"
              searchKey="advanced-bindAddr"
            >
              <div className="flex flex-wrap items-center gap-2">
                <SettingsSelect
                  value={serverSettings.bind_addr}
                  onChange={(e) => onUpdateServer("bind_addr", e.target.value)}
                  className={`w-auto ${selectAccentClass}`}
                >
                  <option value="127.0.0.1">
                    {t("settings.advanced.bindAddrLocal")}
                  </option>
                  <option value="0.0.0.0">
                    {t("settings.advanced.bindAddrAll")}
                  </option>
                </SettingsSelect>
                {isRemoteBind && (
                  <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                    <Shield className="h-3.5 w-3.5 flex-shrink-0" />
                    {t(
                      "settings.advanced.remoteWarning",
                      "Remote access is enabled, please ensure authentication is enabled",
                    )}
                  </span>
                )}
              </div>
            </SettingsField>

            <SettingsToggleRow
              title="WebSocket"
              description={`ws://${serverSettings.bind_addr}:${serverSettings.ws_port}`}
              checked={serverSettings.ws_enabled}
              onChange={(checked) => onUpdateServer("ws_enabled", checked)}
              className="items-start pt-4 border-t border-border/60"
              descriptionClassName="text-xs text-muted-foreground mt-0.5 font-mono"
              searchKey="advanced-wsPort"
            />
            {serverSettings.ws_enabled && (
              <SettingsField
                label={t("settings.advanced.wsPort", "WebSocket Port")}
                className="space-y-1 pl-0"
                labelClassName="text-xs text-muted-foreground"
              >
                <SettingsInput
                  type="number"
                  min="1024"
                  max="65535"
                  value={serverSettings.ws_port}
                  onChange={(e) =>
                    onUpdateServer("ws_port", parseInt(e.target.value) || 52131)
                  }
                  className={`w-28 ${inputAccentClass}`}
                />
              </SettingsField>
            )}

            <SettingsToggleRow
              title="HTTP API"
              description={`http://${serverSettings.bind_addr}:${serverSettings.http_port}/api`}
              checked={serverSettings.http_enabled}
              onChange={(checked) => onUpdateServer("http_enabled", checked)}
              className="items-start py-2 border-t border-border/60"
              descriptionClassName="text-xs text-muted-foreground mt-0.5 font-mono"
              searchKey="advanced-httpPort"
            />
            {serverSettings.http_enabled && (
              <SettingsField
                label={t("settings.advanced.httpPort", "HTTP Port")}
                className="space-y-1"
                labelClassName="text-xs text-muted-foreground"
              >
                <SettingsInput
                  type="number"
                  min="1024"
                  max="65535"
                  value={serverSettings.http_port}
                  onChange={(e) =>
                    onUpdateServer("http_port", parseInt(e.target.value) || 52131)
                  }
                  className={`w-28 ${inputAccentClass}`}
                />
              </SettingsField>
            )}

            <SettingsToggleRow
              title={t("settings.advanced.auth", "Authentication")}
              description={t(
                "settings.advanced.authHelp",
                "Non-local connections require token authentication",
              )}
              checked={serverSettings.auth_enabled}
              onChange={(checked) => onUpdateServer("auth_enabled", checked)}
              className="items-start py-2 border-t border-border/60"
              descriptionClassName="text-xs text-muted-foreground mt-0.5"
              searchKey="advanced-auth"
            />

            {mode === "all" && (
              <SettingsToggleRow
                title={t("settings.advanced.lightweightMode", "Lightweight mode")}
                description={t(
                  "settings.advanced.lightweightModeDesc",
                  "When enabled, closing the window minimizes to system tray instead of quitting. Tray menu: Show / Open Web / Quit",
                )}
                checked={lightweightMode}
                onChange={onToggleLightweightMode}
                className="items-start py-2 border-t border-border/60"
                descriptionClassName="text-xs text-muted-foreground mt-0.5"
                searchKey="advanced-lightweightMode"
              />
            )}

            {serverDirty && (
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={onSaveServerSettings}
                  className="px-4 py-2 bg-info hover:bg-info/90 text-white text-sm font-medium rounded-lg motion-color motion-press focus-ring shadow-sm"
                >
                  {t("settings.advanced.saveServer", "Save server settings")}
                </button>
                <span className="flex items-center gap-1.5 text-xs text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  {t(
                    "settings.advanced.restartRequired",
                    "Requires app restart to take effect",
                  )}
                </span>
              </div>
            )}
          </div>
        </SettingsCard>
  );
}
