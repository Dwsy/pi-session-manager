import { useTranslation } from "react-i18next";
import { Copy, Key, Plus, Trash2 } from "lucide-react";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsInput from "@/components/settings/SettingsInput";
import type { TokenInfo } from "./advancedSettingsTypes";

interface ApiKeysSettingsTabProps {
  apiKeys: TokenInfo[];
  newKeyValue: string | null;
  keyMode: "auto" | "manual";
  newKeyName: string;
  manualKey: string;
  manualValue: string;
  creating: boolean;
  inputAccentClass: string;
  onRevokeKey: (keyPreview: string) => void;
  onCopyToClipboard: (text: string) => void;
  onNewKeyValueChange: (value: string | null) => void;
  onKeyModeChange: (mode: "auto" | "manual") => void;
  onNewKeyNameChange: (value: string) => void;
  onManualKeyChange: (value: string) => void;
  onManualValueChange: (value: string) => void;
  onCreateKey: () => void;
}

export default function ApiKeysSettingsTab({
  apiKeys,
  newKeyValue,
  keyMode,
  newKeyName,
  manualKey,
  manualValue,
  creating,
  inputAccentClass,
  onRevokeKey,
  onCopyToClipboard,
  onNewKeyValueChange,
  onKeyModeChange,
  onNewKeyNameChange,
  onManualKeyChange,
  onManualValueChange,
  onCreateKey,
}: ApiKeysSettingsTabProps) {
  const { t } = useTranslation();

  return (
        <SettingsCard
          title={t("settings.advanced.apiKeys", "API Keys")}
          description={t(
            "settings.advanced.apiKeysHelp",
            "Used for remote connection authentication via Authorization: Bearer <key>",
          )}
          icon={<Key className="h-4 w-4" />}
          searchKey="advanced-apiKeys"
        >
          <div className="space-y-4">
            {apiKeys.length > 0 && (
              <div className="space-y-2">
                {apiKeys.map((k) => (
                  <div
                    key={k.key_preview}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 bg-background/50 border border-border rounded-lg hover:border-border-hover/50 motion-surface motion-color"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">
                          {k.name}
                        </span>
                        <code className="text-xs text-muted-foreground font-mono truncate">
                          {k.key_preview}
                        </code>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {t("settings.advanced.keyCreated", "Create")}:{" "}
                        {new Date(k.created_at).toLocaleDateString()}
                        {k.last_used && (
                          <>
                            {" "}
                            · {t(
                              "settings.advanced.keyLastUsed",
                              "Last used",
                            )}: {new Date(k.last_used).toLocaleDateString()}
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => onRevokeKey(k.key_preview)}
                      className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg motion-color focus-ring flex-shrink-0"
                      title={t("settings.advanced.revokeKey", "Revoke")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {newKeyValue && (
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg space-y-3">
                <p className="text-sm text-green-400">
                  {t(
                    "settings.advanced.newKeyCreated",
                    "Key created, please copy and save it now, the full key will not be shown again.",
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono text-foreground bg-surface px-3 py-2 rounded-lg break-all select-all border border-border">
                    {newKeyValue}
                  </code>
                  <button
                    onClick={() => {
                      onCopyToClipboard(newKeyValue);
                      onNewKeyValueChange(null);
                    }}
                    className="p-2 text-info hover:bg-info/10 rounded-lg motion-color focus-ring flex-shrink-0"
                    title={t("settings.advanced.copyKey", "Copy")}
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs text-muted-foreground">
                {t("settings.advanced.keyMode", "Creation Mode")}
              </label>
              <div className="inline-flex rounded-lg border border-border p-1 bg-surface/60">
                <button
                  type="button"
                  onClick={() => {
                    onKeyModeChange("auto");
                    onManualKeyChange("");
                    onManualValueChange("");
                  }}
                  className={`px-3 py-1.5 text-xs rounded-md motion-color focus-ring ${keyMode === "auto" ? "bg-info text-white" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t("settings.advanced.keyModeAuto", "Auto generate")}
                </button>
                <button
                  type="button"
                  onClick={() => onKeyModeChange("manual")}
                  className={`px-3 py-1.5 text-xs rounded-md motion-color focus-ring ${keyMode === "manual" ? "bg-info text-white" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t("settings.advanced.keyModeManual", "Manual Setup")}
                </button>
              </div>
            </div>

            <div
              className={`grid grid-cols-1 ${keyMode === "manual" ? "md:grid-cols-3" : "md:grid-cols-1"} gap-2`}
            >
              <SettingsInput
                type="text"
                value={newKeyName}
                onChange={(e) => onNewKeyNameChange(e.target.value)}
                placeholder={t(
                  "settings.advanced.keyNamePlaceholder",
                  "Key name (optional)",
                )}
                className={inputAccentClass}
              />
              {keyMode === "manual" && (
                <>
                  <SettingsInput
                    type="text"
                    value={manualKey}
                    onChange={(e) => onManualKeyChange(e.target.value)}
                    placeholder={t(
                      "settings.advanced.manualKeyPlaceholder",
                      "Manual Key (optional)",
                    )}
                    className={inputAccentClass}
                  />
                  <SettingsInput
                    type="text"
                    value={manualValue}
                    onChange={(e) => onManualValueChange(e.target.value)}
                    placeholder={t(
                      "settings.advanced.manualValuePlaceholder",
                      "Manual Value (optional)",
                    )}
                    className={inputAccentClass}
                    onKeyDown={(e) => e.key === "Enter" && onCreateKey()}
                  />
                </>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {keyMode === "manual"
                ? t(
                    "settings.advanced.manualKeyHint",
                    "Both Key and Value must be filled in manual mode.",
                  )
                : t(
                    "settings.advanced.autoKeyHint",
                    "Auto mode will randomly generate a secure key.",
                  )}
            </p>

            <div>
              <button
                onClick={onCreateKey}
                disabled={creating}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-info hover:bg-info/90 text-white rounded-lg motion-color focus-ring disabled:opacity-50 shadow-sm"
              >
                <Plus className="h-4 w-4" />
                {t("settings.advanced.createKey", "Create Key")}
              </button>
            </div>
          </div>
        </SettingsCard>
  );
}
