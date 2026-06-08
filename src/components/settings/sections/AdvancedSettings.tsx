/**
 * Advanced settings component
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Key,
  Server,
  FolderOpen,
  Wifi,
} from "lucide-react";
import { invoke, isTauri } from "@/transport";
import SettingsTabs from "@/components/settings/SettingsTabs";
import ApiKeysSettingsTab from "./advanced-settings/ApiKeysSettingsTab";
import ServerAccessSettingsTab from "./advanced-settings/ServerAccessSettingsTab";
import RemoteConnectionTab from "./advanced-settings/RemoteConnectionTab";
import StorageSettingsTab from "./advanced-settings/StorageSettingsTab";
import type { AdvancedSettingsMode, AdvancedTab, ServerSettings, TokenInfo } from "./advanced-settings/advancedSettingsTypes";
import type { AdvancedSettingsProps } from "@/components/settings/types";
import { useClipboard } from "@/hooks/useClipboard";

interface ClearCacheResult {
  sessions_deleted: number;
  details_deleted: number;
}

interface AdvancedSettingsSectionProps extends AdvancedSettingsProps {
  mode?: AdvancedSettingsMode;
}

export default function AdvancedSettings({
  settings,
  onUpdate,
  mode = "all",
}: AdvancedSettingsSectionProps) {
  const { t } = useTranslation();
  const tabItems: Array<{
    id: AdvancedTab;
    label: string;
    icon: React.ReactNode;
  }> =
    mode === "server-access"
      ? [
          {
            id: "server",
            label: t("settings.advanced.tabs.server", "Server"),
            icon: <Server className="h-3.5 w-3.5" />,
          },
          {
            id: "auth",
            label: t("settings.advanced.tabs.auth", "Auth"),
            icon: <Key className="h-3.5 w-3.5" />,
          },
          ...(isTauri()
            ? [
                {
                  id: "remote" as const,
                  label: t("settings.advanced.tabs.remote", "Remote"),
                  icon: <Wifi className="h-3.5 w-3.5" />,
                },
              ]
            : []),
        ]
      : [
          {
            id: "server",
            label: t("settings.advanced.tabs.server", "Server"),
            icon: <Server className="h-3.5 w-3.5" />,
          },
          {
            id: "auth",
            label: t("settings.advanced.tabs.auth", "Auth"),
            icon: <Key className="h-3.5 w-3.5" />,
          },
          ...(isTauri()
            ? [
                {
                  id: "remote" as const,
                  label: t("settings.advanced.tabs.remote", "Remote"),
                  icon: <Wifi className="h-3.5 w-3.5" />,
                },
              ]
            : []),
          {
            id: "storage",
            label: t("settings.advanced.tabs.storage", "Storage"),
            icon: <FolderOpen className="h-3.5 w-3.5" />,
          },
        ];
  const [activeTab, setActiveTab] = useState<AdvancedTab>("server");
  const [serverSettings, setServerSettings] = useState<ServerSettings | null>(
    null,
  );
  const [serverDirty, setServerDirty] = useState(false);
  const [apiKeys, setApiKeys] = useState<TokenInfo[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [keyMode, setKeyMode] = useState<"auto" | "manual">("auto");
  const [manualKey, setManualKey] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { copyText } = useClipboard();

  useEffect(() => {
    invoke<ServerSettings>("load_server_settings")
      .then(setServerSettings)
      .catch(console.error);
  }, []);

  const loadApiKeys = useCallback(async () => {
    try {
      const keys = await invoke<TokenInfo[]>("list_api_keys");
      setApiKeys(keys);
    } catch (e) {
      console.error("Failed to load API keys:", e);
    }
  }, []);

  useEffect(() => {
    loadApiKeys();
  }, [loadApiKeys]);

  useEffect(() => {
    if (!tabItems.some((item) => item.id === activeTab)) {
      setActiveTab(tabItems[0].id);
    }
  }, [activeTab, tabItems]);

  // Lightweight mode (minimize-to-tray on close)
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
    } catch (e) {
      console.error("Failed to set lightweight mode:", e);
      setLightweightMode(!enabled);
    }
  };

  const updateServer = <K extends keyof ServerSettings>(
    key: K,
    value: ServerSettings[K],
  ) => {
    setServerSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setServerDirty(true);
  };

  const saveServerSettings = async () => {
    if (!serverSettings) return;
    try {
      await invoke("save_server_settings", { settings: serverSettings });
      setServerDirty(false);
    } catch (error) {
      console.error("Failed to save server settings:", error);
    }
  };

  const handleCreateKey = async () => {
    const name = newKeyName.trim() || undefined;
    const key = manualKey.trim();
    const value = manualValue.trim();
    const isManual = keyMode === "manual";

    if (isManual && (!key || !value)) {
      alert(
        t(
          "settings.advanced.manualKeyValidation",
          "When creating manually, both Key and Value must be filled",
        ),
      );
      return;
    }

    setCreating(true);
    try {
      const created = await invoke<string>("create_api_key", {
        name,
        key: isManual ? key : undefined,
        value: isManual ? value : undefined,
      });
      setNewKeyValue(created);
      setNewKeyName("");
      setManualKey("");
      setManualValue("");
      await loadApiKeys();
    } catch (e) {
      console.error("Failed to create API key:", e);
      alert(t("settings.advanced.createKeyFailed", "Failed to create key"));
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async (keyPreview: string) => {
    if (
      !confirm(
        t(
          "settings.advanced.revokeKeyConfirm",
          "Are you sure you want to revoke this key? This action cannot be undone.",
        ),
      )
    )
      return;
    try {
      await invoke("revoke_api_key", { keyPreview });
      await loadApiKeys();
    } catch (e) {
      console.error("Failed to revoke key:", e);
    }
  };

  const copyToClipboard = (text: string) => {
    copyText(text).catch(console.error);
  };

  const handleClearCache = async () => {
    if (
      !confirm(
        t(
          "settings.advanced.clearCacheConfirm",
          "Are you sure you want to clear all cache data? This will delete all session cache but keep favorites.",
        ),
      )
    ) {
      return;
    }
    try {
      const result = await invoke<ClearCacheResult>("clear_cache");
      alert(
        t(
          "settings.advanced.cacheClearedDetail",
          "Cache cleared: {{sessions}} sessions, {{details}} details cache",
          {
            sessions: result.sessions_deleted,
            details: result.details_deleted,
          },
        ),
      );
    } catch (error) {
      console.error("Failed to clear cache:", error);
      alert(t("settings.advanced.cacheClearFailed", "Failed to clear cache"));
    }
  };

  const isRemoteBind = serverSettings?.bind_addr === "0.0.0.0";

  const inputAccentClass =
    "placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-info/40";
  const selectAccentClass = "focus:ring-2 focus:ring-info/40";

  return (
    <div className="space-y-6">
      <SettingsTabs items={tabItems} active={activeTab} onChange={setActiveTab} />

      {activeTab === "server" && serverSettings && (
        <ServerAccessSettingsTab
          serverSettings={serverSettings}
          mode={mode}
          lightweightMode={lightweightMode}
          serverDirty={serverDirty}
          inputAccentClass={inputAccentClass}
          selectAccentClass={selectAccentClass}
          isRemoteBind={isRemoteBind}
          onUpdateServer={updateServer}
          onToggleLightweightMode={handleToggleLightweightMode}
          onSaveServerSettings={saveServerSettings}
        />
      )}

      {activeTab === "auth" && (
        <ApiKeysSettingsTab
          apiKeys={apiKeys}
          newKeyValue={newKeyValue}
          keyMode={keyMode}
          newKeyName={newKeyName}
          manualKey={manualKey}
          manualValue={manualValue}
          creating={creating}
          inputAccentClass={inputAccentClass}
          onRevokeKey={handleRevokeKey}
          onCopyToClipboard={copyToClipboard}
          onNewKeyValueChange={setNewKeyValue}
          onKeyModeChange={setKeyMode}
          onNewKeyNameChange={setNewKeyName}
          onManualKeyChange={setManualKey}
          onManualValueChange={setManualValue}
          onCreateKey={handleCreateKey}
        />
      )}

      {activeTab === "remote" && (
        <RemoteConnectionTab />
      )}

      {activeTab === "storage" && (
        <StorageSettingsTab
          settings={settings}
          onUpdate={onUpdate}
          inputAccentClass={inputAccentClass}
          onClearCache={handleClearCache}
        />
      )}
    </div>
  );
}
