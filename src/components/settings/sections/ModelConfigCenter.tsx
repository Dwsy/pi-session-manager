import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  FileJson,
  FlaskConical,
  FolderOpen,
  History,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Trash2,
  Upload,
} from "lucide-react";
import SettingsCard from "@/components/settings/SettingsCard";
import SettingsField from "@/components/settings/SettingsField";
import SettingsInput from "@/components/settings/SettingsInput";
import SettingsSelect from "@/components/settings/SettingsSelect";
import SettingsTabs from "@/components/settings/SettingsTabs";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";

import { MODEL_CONFIG_PATH, API_TYPE_OPTIONS } from "./model-config/types";
import { useModelConfig } from "./model-config/useModelConfig";
import { modelSelectionValue, splitInputTypes, formatBytes } from "./model-config/utils";
import { StatTile } from "./model-config/ui/StatTile";
import { StatusBanner } from "./model-config/ui/StatusBanner";
import { ModalShell } from "./model-config/ui/ModalShell";
import { ConfirmDialog } from "./model-config/ui/ConfirmDialog";

export default function ModelConfigCenter() {
  const vm = useModelConfig();
  const { t } = useTranslation();

  const {
    config,
    loading,
    saving,
    busy,
    isDirty,
    feedback,
    setFeedback,
    selectedProvider,
    setSelectedProvider,
    selectedModel,
    setSelectedModel,
    providerNameDraft,
    setProviderNameDraft,
    testPrompt,
    setTestPrompt,
    testResult,
    backups,
    versions,
    historyTab,
    setHistoryTab,
    importMode,
    setImportMode,
    mainTab,
    setMainTab,
    configDetailTab,
    setConfigDetailTab,
    showAddProviderModal,
    setShowAddProviderModal,
    newProviderName,
    setNewProviderName,
    showImportModal,
    setShowImportModal,
    importContentDraft,
    setImportContentDraft,
    confirmDialog,
    setConfirmDialog,
    confirmingDialog,
    providerNames,
    totalModels,
    selectedProviderEntry,
    selectedProviderModels,
    selectedModelIndex,
    selectedModelEntry,
    activeModelLabel,
    handleConfirmDialog,
    updateSelectedProviderEntry,
    updateSelectedModelEntry,
    commitProviderRename,
    handleCreateProvider,
    requestDeleteProvider,
    addModel,
    requestDeleteModel,
    saveConfig,
    refreshConfig,
    createBackup,
    exportToPath,
    copyDraftJson,
    openImportContentModal,
    importFromPath,
    pasteClipboardToImport,
    importFromContent,
    requestRestoreBackup,
    requestDeleteBackup,
    requestRestoreVersion,
    runHttpTest,
    copyCurlCommand,
  } = vm;


  if (loading) {
    return (
      <div className="flex h-[420px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-info" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <SettingsCard
          icon={<Server className="h-5 w-5" />}
          title={t("settings.modelConfigCenter.title", "Model Config Center")}
          description={t(
            "settings.modelConfigCenter.description",
            "Visually edit ~/.pi/agent/models.json, with backup/version/import-export and online HTTP testing support.",
          )}
        >
          <div className="space-y-4">
            {feedback && (
              <StatusBanner
                tone={feedback.tone}
                message={feedback.message}
                onClose={() => setFeedback(null)}
              />
            )}

            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                      isDirty
                        ? "bg-amber-500/10 text-amber-300"
                        : "bg-green-500/10 text-green-300"
                    }`}
                  >
                    {isDirty
                      ? t(
                          "settings.modelConfigCenter.status.dirty",
                          "Unsaved changes",
                        )
                      : t(
                          "settings.modelConfigCenter.status.saved",
                          "Synced with disk",
                        )}
                  </span>
                  {selectedProvider && (
                    <span className="inline-flex items-center rounded-full bg-surface px-2.5 py-1 text-xs text-foreground">
                      {t(
                        "settings.modelConfigCenter.status.activeProvider",
                        "Provider: {{name}}",
                        {
                          name: selectedProvider,
                        },
                      )}
                    </span>
                  )}
                  {selectedModelEntry && (
                    <span className="inline-flex items-center rounded-full bg-surface px-2.5 py-1 text-xs text-foreground">
                      {t(
                        "settings.modelConfigCenter.status.activeModel",
                        "Model: {{name}}",
                        {
                          name: activeModelLabel,
                        },
                      )}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("settings.modelConfigCenter.pathLabel", "Config file")}:{" "}
                  <span className="font-mono text-foreground/80">
                    {MODEL_CONFIG_PATH}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void saveConfig()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-info px-4 py-2 text-sm font-medium text-white hover:bg-info/90 motion-color motion-press focus-ring disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {t(
                    "settings.modelConfigCenter.actions.save",
                    "Save Configuration",
                  )}
                </button>
                <button
                  type="button"
                  onClick={refreshConfig}
                  disabled={busy === "refresh"}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring disabled:opacity-60"
                >
                  {busy === "refresh" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {t("settings.modelConfigCenter.actions.refresh", "Refresh")}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatTile
                label={t(
                  "settings.modelConfigCenter.summary.providers",
                  "Providers",
                )}
                value={providerNames.length}
              />
              <StatTile
                label={t("settings.modelConfigCenter.summary.models", "Models")}
                value={totalModels}
              />
              <StatTile
                label={t(
                  "settings.modelConfigCenter.summary.backups",
                  "Backups",
                )}
                value={backups.length}
              />
              <StatTile
                label={t(
                  "settings.modelConfigCenter.summary.versions",
                  "Versions",
                )}
                value={versions.length}
              />
            </div>
          </div>
        </SettingsCard>

        <SettingsTabs
          items={[
            {
              id: "configure",
              icon: <FileJson className="h-3.5 w-3.5" />,
              label: t(
                "settings.modelConfigCenter.tabs.configure",
                "Configure",
              ),
            },
            {
              id: "test",
              icon: <FlaskConical className="h-3.5 w-3.5" />,
              label: t("settings.modelConfigCenter.tabs.test", "Test"),
            },
            {
              id: "tools",
              icon: <Upload className="h-3.5 w-3.5" />,
              label: t(
                "settings.modelConfigCenter.tabs.tools",
                "Import/Export",
              ),
            },
            {
              id: "history",
              icon: <History className="h-3.5 w-3.5" />,
              label: t(
                "settings.modelConfigCenter.tabs.history",
                "History & Restore",
              ),
            },
          ]}
          active={mainTab}
          onChange={setMainTab}
        />

        {mainTab === "configure" && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <SettingsCard
              icon={<FileJson className="h-5 w-5" />}
              title={t(
                "settings.modelConfigCenter.sections.navigatorTitle",
                "Provider / Model Navigation",
              )}
              description={t(
                "settings.modelConfigCenter.sections.navigatorDesc",
                "Locate Provider first, then focus on current model details.",
              )}
            >
              <div className="max-h-[740px] space-y-5 overflow-y-auto pr-1">
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        {t(
                          "settings.modelConfigCenter.summary.providers",
                          "Providers",
                        )}
                      </div>
                      <div className="mt-1 text-sm font-medium text-foreground">
                        {providerNames.length}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddProviderModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface motion-color motion-press focus-ring"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t(
                        "settings.modelConfigCenter.actions.addProvider",
                        "Add Provider",
                      )}
                    </button>
                  </div>

                  {providerNames.length > 0 ? (
                    <div className="space-y-2">
                      {providerNames.map((providerName) => {
                        const provider = config.providers[providerName];
                        const isActive = providerName === selectedProvider;
                        return (
                          <div
                            key={providerName}
                            className={`group flex items-start gap-2 rounded-xl border px-3 py-3 motion-color motion-surface ${
                              isActive
                                ? "border-info/50 bg-info/10 shadow-sm"
                                : "border-border/70 bg-background/35 hover:border-border-hover hover:bg-background/45"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProvider(providerName);
                                setConfigDetailTab("provider");
                              }}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="truncate text-sm font-medium text-foreground">
                                {providerName}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>
                                  {provider.api ?? "openai-completions"}
                                </span>
                                <span>·</span>
                                <span>
                                  {(provider.models ?? []).length}{" "}
                                  {t(
                                    "settings.modelConfigCenter.summary.models",
                                    "Models",
                                  )}
                                </span>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                requestDeleteProvider(providerName);
                              }}
                              className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-300 motion-color motion-press focus-ring"
                              title={t(
                                "settings.modelConfigCenter.actions.delete",
                                "Delete",
                              )}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
                      <div className="text-sm font-medium text-foreground">
                        {t(
                          "settings.modelConfigCenter.empty.noProvidersTitle",
                          "No providers yet",
                        )}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t(
                          "settings.modelConfigCenter.empty.noProvidersDesc",
                          "Create a Provider first, then the corresponding connection and model configuration will appear on the right.",
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowAddProviderModal(true)}
                        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-info px-3 py-2 text-sm text-white hover:bg-info/90 motion-color motion-press focus-ring"
                      >
                        <Plus className="h-4 w-4" />
                        {t(
                          "settings.modelConfigCenter.actions.createProvider",
                          "Create Provider",
                        )}
                      </button>
                    </div>
                  )}
                </section>

                <section className="space-y-3 border-t border-border/60 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        {t(
                          "settings.modelConfigCenter.summary.models",
                          "Models",
                        )}
                      </div>
                      <div className="mt-1 text-sm font-medium text-foreground">
                        {selectedProvider
                          ? `${selectedProviderModels.length} / ${selectedProvider}`
                          : t(
                              "settings.modelConfigCenter.sections.testSelection",
                              "Select a provider to continue",
                            )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={addModel}
                      disabled={!selectedProvider}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface motion-color motion-press focus-ring disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t(
                        "settings.modelConfigCenter.actions.addModel",
                        "Add Model",
                      )}
                    </button>
                  </div>

                  {selectedProvider ? (
                    selectedProviderModels.length > 0 ? (
                      <div className="space-y-2">
                        {selectedProviderModels.map((model, index) => {
                          const isActive =
                            selectedModel === modelSelectionValue(index);
                          const label =
                            model.name?.trim() ||
                            model.id?.trim() ||
                            t(
                              "settings.modelConfigCenter.status.unnamedModel",
                              "Unnamed Model",
                            );
                          return (
                            <button
                              key={`${selectedProvider}-${index}`}
                              type="button"
                              onClick={() => {
                                setSelectedModel(modelSelectionValue(index));
                                setConfigDetailTab("model");
                              }}
                              className={`w-full rounded-xl border px-3 py-3 text-left motion-color motion-surface focus-ring ${
                                isActive
                                  ? "border-info/50 bg-info/10 shadow-sm"
                                  : "border-border/70 bg-background/35 hover:border-border-hover hover:bg-background/45"
                              }`}
                            >
                              <div className="truncate text-sm font-medium text-foreground">
                                {label}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>
                                  {model.id?.trim() ||
                                    t(
                                      "settings.modelConfigCenter.status.unnamedModel",
                                      "Unnamed Model",
                                    )}
                                </span>
                                {model.reasoning && (
                                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-300">
                                    {t(
                                      "settings.modelConfigCenter.fields.reasoning",
                                      "Inference",
                                    )}
                                  </span>
                                )}
                                <span>{model.contextWindow ?? 128000}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
                        <div className="text-sm font-medium text-foreground">
                          {t(
                            "settings.modelConfigCenter.empty.noModelsTitle",
                            "Current provider has no models yet",
                          )}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {t(
                            "settings.modelConfigCenter.empty.noModelsDesc",
                            "Create a model first, then fill in ID, capabilities and cost info on the right.",
                          )}
                        </p>
                        <button
                          type="button"
                          onClick={addModel}
                          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-info px-3 py-2 text-sm text-white hover:bg-info/90 motion-color motion-press focus-ring"
                        >
                          <Plus className="h-4 w-4" />
                          {t(
                            "settings.modelConfigCenter.actions.addModel",
                            "Add Model",
                          )}
                        </button>
                      </div>
                    )
                  ) : (
                    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                      {t(
                        "settings.modelConfigCenter.sections.testSelection",
                        "Select a provider to continue",
                      )}
                    </div>
                  )}
                </section>
              </div>
            </SettingsCard>

            <div className="space-y-4">
              <SettingsTabs
                items={[
                  {
                    id: "provider",
                    label: t(
                      "settings.modelConfigCenter.tabs.provider",
                      "Provider Details",
                    ),
                  },
                  {
                    id: "model",
                    label: t(
                      "settings.modelConfigCenter.tabs.model",
                      "Model Details",
                    ),
                  },
                ]}
                active={configDetailTab}
                onChange={setConfigDetailTab}
                className="inline-flex w-auto max-w-full"
                buttonClassName="flex-none"
              />

              {configDetailTab === "provider" && (
                <SettingsCard
                  icon={<Server className="h-5 w-5" />}
                  title={t(
                    "settings.modelConfigCenter.sections.providerDetailsTitle",
                    "Provider Details",
                  )}
                  description={t(
                    "settings.modelConfigCenter.sections.providerDetailsDesc",
                    "Current Provider connection, authentication and default API configuration.",
                  )}
                >
                  {selectedProviderEntry ? (
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <SettingsField
                          label={t(
                            "settings.modelConfigCenter.fields.providerKey",
                            "Provider Key",
                          )}
                          description={t(
                            "settings.modelConfigCenter.help.providerKey",
                            "The key name under providers will be updated after modification.",
                          )}
                        >
                          <SettingsInput
                            value={providerNameDraft}
                            onChange={(event) =>
                              setProviderNameDraft(event.target.value)
                            }
                            onBlur={commitProviderRename}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitProviderRename();
                              }
                              if (event.key === "Escape") {
                                setProviderNameDraft(selectedProvider);
                                event.currentTarget.blur();
                              }
                            }}
                            placeholder={t(
                              "settings.modelConfigCenter.placeholders.providerName",
                              "e.g., local-openai",
                            )}
                          />
                        </SettingsField>

                        <SettingsField
                          label={t(
                            "settings.modelConfigCenter.fields.apiType",
                            "API Type",
                          )}
                        >
                          <SettingsSelect
                            value={
                              selectedProviderEntry.api ?? "openai-completions"
                            }
                            onChange={(event) =>
                              updateSelectedProviderEntry((provider) => ({
                                ...provider,
                                api: event.target.value,
                              }))
                            }
                          >
                            {API_TYPE_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </SettingsSelect>
                        </SettingsField>
                      </div>

                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <SettingsField
                          label={t(
                            "settings.modelConfigCenter.fields.baseUrl",
                            "Base URL",
                          )}
                        >
                          <SettingsInput
                            value={selectedProviderEntry.baseUrl ?? ""}
                            onChange={(event) =>
                              updateSelectedProviderEntry((provider) => ({
                                ...provider,
                                baseUrl: event.target.value,
                              }))
                            }
                            placeholder={t(
                              "settings.modelConfigCenter.placeholders.providerBaseUrl",
                              "https://api.example.com/v1",
                            )}
                          />
                        </SettingsField>

                        <SettingsField
                          label={t(
                            "settings.modelConfigCenter.fields.apiKey",
                            "API Key",
                          )}
                          description={t(
                            "settings.modelConfigCenter.help.apiKey",
                            "Supports direct key, environment variable name, or `!command` form.",
                          )}
                        >
                          <SettingsInput
                            value={selectedProviderEntry.apiKey ?? ""}
                            onChange={(event) =>
                              updateSelectedProviderEntry((provider) => ({
                                ...provider,
                                apiKey: event.target.value,
                              }))
                            }
                            placeholder={t(
                              "settings.modelConfigCenter.placeholders.apiKey",
                              "MY_API_KEY or !security ...",
                            )}
                          />
                        </SettingsField>
                      </div>

                      <div className="rounded-xl border border-border/70 bg-background/35 px-4 py-3">
                        <SettingsToggleRow
                          title={t(
                            "settings.modelConfigCenter.fields.authHeader",
                            "Use Bearer auth header",
                          )}
                          description={t(
                            "settings.modelConfigCenter.help.authHeader",
                            "Applies uniformly to all models under current Provider.",
                          )}
                          checked={selectedProviderEntry.authHeader === true}
                          onChange={(checked) =>
                            updateSelectedProviderEntry((provider) => ({
                              ...provider,
                              authHeader: checked,
                            }))
                          }
                          className="items-start"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
                        <button
                          type="button"
                          onClick={() =>
                            requestDeleteProvider(selectedProvider)
                          }
                          className="inline-flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 motion-color motion-press focus-ring"
                        >
                          <Trash2 className="h-4 w-4" />
                          {t(
                            "settings.modelConfigCenter.actions.delete",
                            "Delete",
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
                      <div className="text-sm font-medium text-foreground">
                        {t(
                          "settings.modelConfigCenter.empty.noProvidersTitle",
                          "No providers yet",
                        )}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t(
                          "settings.modelConfigCenter.empty.noProvidersDesc",
                          "Create a Provider first, then the corresponding connection and model configuration will appear on the right.",
                        )}
                      </p>
                    </div>
                  )}
                </SettingsCard>
              )}

              {configDetailTab === "model" && (
                <SettingsCard
                  icon={<FileJson className="h-5 w-5" />}
                  title={t(
                    "settings.modelConfigCenter.sections.modelDetailsTitle",
                    "Model Details",
                  )}
                  description={t(
                    "settings.modelConfigCenter.sections.modelDetailsDesc",
                    "Shows high-frequency fields by default, expands capabilities and cost in layers.",
                  )}
                >
                  {selectedProviderEntry ? (
                    selectedModelEntry ? (
                      <div className="space-y-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-foreground">
                              {activeModelLabel}
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              {selectedProvider}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              requestDeleteModel(selectedModelIndex)
                            }
                            className="inline-flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 motion-color motion-press focus-ring"
                          >
                            <Trash2 className="h-4 w-4" />
                            {t(
                              "settings.modelConfigCenter.actions.delete",
                              "Delete",
                            )}
                          </button>
                        </div>

                        <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                          <div className="mb-4">
                            <div className="text-sm font-medium text-foreground">
                              {t(
                                "settings.modelConfigCenter.sections.basicSection",
                                "Basic Info",
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                            <SettingsField
                              label={t(
                                "settings.modelConfigCenter.fields.modelId",
                                "Model ID",
                              )}
                            >
                              <SettingsInput
                                value={selectedModelEntry.id}
                                onChange={(event) =>
                                  updateSelectedModelEntry((model) => ({
                                    ...model,
                                    id: event.target.value,
                                  }))
                                }
                                placeholder="kimi-k2.5"
                              />
                            </SettingsField>

                            <SettingsField
                              label={t(
                                "settings.modelConfigCenter.fields.modelName",
                                "Display Name",
                              )}
                            >
                              <SettingsInput
                                value={selectedModelEntry.name ?? ""}
                                onChange={(event) =>
                                  updateSelectedModelEntry((model) => ({
                                    ...model,
                                    name: event.target.value,
                                  }))
                                }
                                placeholder={t(
                                  "settings.modelConfigCenter.placeholders.modelName",
                                  "More user-friendly display name",
                                )}
                              />
                            </SettingsField>

                            <SettingsField
                              label={t(
                                "settings.modelConfigCenter.fields.inputTypes",
                                "Input types",
                              )}
                              description={t(
                                "settings.modelConfigCenter.help.inputTypes",
                                "Comma separated, e.g., text,image.",
                              )}
                            >
                              <SettingsInput
                                value={(
                                  selectedModelEntry.input ?? ["text"]
                                ).join(", ")}
                                onChange={(event) => {
                                  const inputs = splitInputTypes(
                                    event.target.value,
                                  );
                                  updateSelectedModelEntry((model) => ({
                                    ...model,
                                    input:
                                      inputs.length > 0 ? inputs : ["text"],
                                  }));
                                }}
                                placeholder={t(
                                  "settings.modelConfigCenter.placeholders.inputTypes",
                                  "text,image",
                                )}
                              />
                            </SettingsField>

                            <div className="rounded-lg border border-border/70 bg-background/35 px-4 py-3">
                              <SettingsToggleRow
                                title={t(
                                  "settings.modelConfigCenter.fields.reasoning",
                                  "Reasoning model",
                                )}
                                description={t(
                                  "settings.modelConfigCenter.help.reasoning",
                                  "Used to distinguish if deeper thinking capability is supported",
                                )}
                                checked={selectedModelEntry.reasoning === true}
                                onChange={(checked) =>
                                  updateSelectedModelEntry((model) => ({
                                    ...model,
                                    reasoning: checked,
                                  }))
                                }
                                className="items-start"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                          <div className="mb-4">
                            <div className="text-sm font-medium text-foreground">
                              {t(
                                "settings.modelConfigCenter.sections.capabilitySection",
                                "Capabilities",
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                            <SettingsField
                              label={t(
                                "settings.modelConfigCenter.fields.contextWindow",
                                "Context window",
                              )}
                            >
                              <SettingsInput
                                type="number"
                                value={
                                  selectedModelEntry.contextWindow ?? 128000
                                }
                                onChange={(event) =>
                                  updateSelectedModelEntry((model) => ({
                                    ...model,
                                    contextWindow:
                                      Number(event.target.value) || 0,
                                  }))
                                }
                              />
                            </SettingsField>

                            <SettingsField
                              label={t(
                                "settings.modelConfigCenter.fields.maxTokens",
                                "Max output tokens",
                              )}
                            >
                              <SettingsInput
                                type="number"
                                value={selectedModelEntry.maxTokens ?? 16384}
                                onChange={(event) =>
                                  updateSelectedModelEntry((model) => ({
                                    ...model,
                                    maxTokens: Number(event.target.value) || 0,
                                  }))
                                }
                              />
                            </SettingsField>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                          <div className="mb-4">
                            <div className="text-sm font-medium text-foreground">
                              {t(
                                "settings.modelConfigCenter.sections.advancedSection",
                                "Advanced / Cost",
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            {(
                              [
                                "input",
                                "output",
                                "cacheRead",
                                "cacheWrite",
                              ] as const
                            ).map((costKey) => (
                              <SettingsField
                                key={costKey}
                                label={t(
                                  `settings.modelConfigCenter.cost.${costKey}`,
                                  `Cost.${costKey}`,
                                )}
                              >
                                <SettingsInput
                                  type="number"
                                  step="0.0001"
                                  value={
                                    selectedModelEntry.cost?.[costKey] ?? 0
                                  }
                                  onChange={(event) =>
                                    updateSelectedModelEntry((model) => ({
                                      ...model,
                                      cost: {
                                        input: model.cost?.input ?? 0,
                                        output: model.cost?.output ?? 0,
                                        cacheRead: model.cost?.cacheRead ?? 0,
                                        cacheWrite: model.cost?.cacheWrite ?? 0,
                                        [costKey]:
                                          Number(event.target.value) || 0,
                                      },
                                    }))
                                  }
                                />
                              </SettingsField>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
                        <div className="text-sm font-medium text-foreground">
                          {t(
                            "settings.modelConfigCenter.empty.noModelsTitle",
                            "Current provider has no models yet",
                          )}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {t(
                            "settings.modelConfigCenter.empty.noModelsDesc",
                            "Create a model first, then fill in ID, capabilities and cost info on the right.",
                          )}
                        </p>
                      </div>
                    )
                  ) : (
                    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
                      <div className="text-sm font-medium text-foreground">
                        {t(
                          "settings.modelConfigCenter.empty.noProvidersTitle",
                          "No providers yet",
                        )}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t(
                          "settings.modelConfigCenter.empty.noProvidersDesc",
                          "Create a Provider first, then the corresponding connection and model configuration will appear on the right.",
                        )}
                      </p>
                    </div>
                  )}
                </SettingsCard>
              )}
            </div>
          </div>
        )}

        {mainTab !== "configure" && (
          <div className="grid grid-cols-1 gap-4">
            {(mainTab === "tools" || mainTab === "test") && (
              <div className="space-y-4">
                {mainTab === "tools" && (
                  <SettingsCard
                    icon={<Upload className="h-5 w-5" />}
                    title={t(
                      "settings.modelConfigCenter.sections.toolsTitle",
                      "Import & Export",
                    )}
                    description={t(
                      "settings.modelConfigCenter.sections.toolsDesc",
                      "Separates tool operations from main editor to avoid interfering with main configuration flow.",
                    )}
                  >
                    <div className="space-y-4">
                      <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                        <div className="text-sm font-medium text-foreground">
                          {t(
                            "settings.modelConfigCenter.sections.importMode",
                            "Import Mode",
                          )}
                        </div>
                        <SettingsTabs
                          items={[
                            {
                              id: "merge",
                              label: t(
                                "settings.modelConfigCenter.tabs.merge",
                                "Merge",
                              ),
                            },
                            {
                              id: "replace",
                              label: t(
                                "settings.modelConfigCenter.tabs.replace",
                                "Replace",
                              ),
                            },
                          ]}
                          active={importMode}
                          onChange={setImportMode}
                          className="mt-3 inline-flex w-auto max-w-full"
                          buttonClassName="flex-none"
                        />
                        <p className="mt-3 text-xs text-muted-foreground">
                          {t(
                            "settings.modelConfigCenter.help.importMode",
                            "Merge keeps existing providers, replace will directly use imported content.",
                          )}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={importFromPath}
                          disabled={busy === "import-file"}
                          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring disabled:opacity-60"
                        >
                          {busy === "import-file" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FolderOpen className="h-4 w-4" />
                          )}
                          {t(
                            "settings.modelConfigCenter.actions.importFile",
                            "Import file",
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={openImportContentModal}
                          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring"
                        >
                          <Upload className="h-4 w-4" />
                          {t(
                            "settings.modelConfigCenter.actions.importContent",
                            "Import JSON content",
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyDraftJson()}
                          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring"
                        >
                          <Copy className="h-4 w-4" />
                          {t(
                            "settings.modelConfigCenter.actions.copyDraft",
                            "Copy current draft",
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void exportToPath()}
                          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring"
                        >
                          <Download className="h-4 w-4" />
                          {t(
                            "settings.modelConfigCenter.actions.exportSaved",
                            "Export saved file",
                          )}
                        </button>
                      </div>

                      <div className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
                        <div>
                          {t(
                            "settings.modelConfigCenter.help.copyDraft",
                            '"Copy current draft" includes your unsaved changes.',
                          )}
                        </div>
                        <div>
                          {t(
                            "settings.modelConfigCenter.help.exportSaved",
                            '"Export saved file" reads models.json from disk, suitable for archiving.',
                          )}
                        </div>
                      </div>
                    </div>
                  </SettingsCard>
                )}

                {mainTab === "test" && (
                  <SettingsCard
                    icon={<FlaskConical className="h-5 w-5" />}
                    title={t(
                      "settings.modelConfigCenter.httpTestTitle",
                      "Online HTTP / cURL Test",
                    )}
                    description={t(
                      "settings.modelConfigCenter.httpTestDesc",
                      "Makes real request with currently selected Provider + Model to verify configuration.",
                    )}
                  >
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-border/70 bg-background/35 px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                            {t(
                              "settings.modelConfigCenter.fields.selectedProvider",
                              "Current Provider",
                            )}
                          </div>
                          <div className="mt-2 truncate text-sm font-medium text-foreground">
                            {selectedProvider || "-"}
                          </div>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-background/35 px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                            {t(
                              "settings.modelConfigCenter.fields.selectedModel",
                              "Current Model",
                            )}
                          </div>
                          <div className="mt-2 truncate text-sm font-medium text-foreground">
                            {selectedModelEntry?.id?.trim() ||
                              activeModelLabel ||
                              "-"}
                          </div>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-background/35 px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                            API
                          </div>
                          <div className="mt-2 truncate text-sm font-medium text-foreground">
                            {selectedProviderEntry?.api ?? "-"}
                          </div>
                        </div>
                      </div>

                      {!selectedProviderEntry && (
                        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                          {t(
                            "settings.modelConfigCenter.empty.testEmpty",
                            "Go to config page to select Provider and model first, then come back to run test.",
                          )}
                        </div>
                      )}

                      {!selectedModelEntry?.id?.trim() &&
                        selectedProviderEntry && (
                          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                            {t(
                              "settings.modelConfigCenter.help.noModelId",
                              "Current model has no ID filled, cannot make HTTP test.",
                            )}
                          </div>
                        )}

                      <SettingsField
                        label={t(
                          "settings.modelConfigCenter.fields.prompt",
                          "Test Prompt",
                        )}
                      >
                        <SettingsInput
                          value={testPrompt}
                          onChange={(event) =>
                            setTestPrompt(event.target.value)
                          }
                          placeholder={t(
                            "settings.modelConfigCenter.placeholders.testPrompt",
                            "Please reply only with OK",
                          )}
                        />
                      </SettingsField>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void runHttpTest()}
                          disabled={
                            !selectedProvider ||
                            !selectedModelEntry?.id?.trim() ||
                            busy === "http-test"
                          }
                          className="inline-flex items-center gap-2 rounded-lg bg-info px-4 py-2 text-sm font-medium text-white hover:bg-info/90 motion-color motion-press focus-ring disabled:opacity-60"
                        >
                          {busy === "http-test" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          {t(
                            "settings.modelConfigCenter.actions.runTest",
                            "Run Test",
                          )}
                        </button>
                        {testResult && (
                          <button
                            type="button"
                            onClick={() => void copyCurlCommand()}
                            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring"
                          >
                            <Copy className="h-4 w-4" />
                            {t(
                              "settings.modelConfigCenter.actions.copyCurl",
                              "Copy cURL",
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setMainTab("configure")}
                          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring"
                        >
                          <FileJson className="h-4 w-4" />
                          {t(
                            "settings.modelConfigCenter.actions.backToConfigure",
                            "Back to Config",
                          )}
                        </button>
                      </div>

                      {testResult && (
                        <div className="rounded-xl border border-border/70 bg-background/30 p-4 text-sm">
                          <div className="flex flex-wrap items-center gap-3">
                            <span
                              className={`inline-flex items-center gap-1.5 font-medium ${testResult.ok ? "text-green-300" : "text-red-300"}`}
                            >
                              {testResult.ok ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <AlertCircle className="h-4 w-4" />
                              )}
                              {testResult.ok ? "OK" : "FAILED"}
                            </span>
                            <span className="text-muted-foreground">
                              {testResult.method} {testResult.url}
                            </span>
                            <span className="text-muted-foreground">
                              status: {testResult.statusCode ?? "-"}
                            </span>
                            <span className="text-muted-foreground">
                              latency: {testResult.latencyMs} ms
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3 text-xs">
                            <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
                              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                                API
                              </div>
                              <div className="mt-1 font-medium text-foreground">
                                {testResult.api}
                              </div>
                            </div>
                            <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
                              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                                Request Style
                              </div>
                              <div className="mt-1 font-medium text-foreground">
                                {testResult.requestStyle}
                              </div>
                            </div>
                            <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
                              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                                Attempts
                              </div>
                              <div className="mt-1 font-medium text-foreground">
                                {testResult.attemptCount}
                                {testResult.usedFallback
                                  ? " (fallback used)"
                                  : ""}
                              </div>
                            </div>
                          </div>
                          {testResult.responsePreview && (
                            <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                              {testResult.responsePreview}
                            </div>
                          )}
                          {testResult.error && (
                            <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                              {testResult.error}
                            </div>
                          )}
                          <div className="mt-4 space-y-3 text-xs">
                            <details>
                              <summary className="cursor-pointer font-medium text-foreground">
                                cURL
                              </summary>
                              <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg border border-border/70 bg-background/40 p-3 text-muted-foreground">
                                {testResult.curlCommand}
                              </pre>
                            </details>
                            <details>
                              <summary className="cursor-pointer font-medium text-foreground">
                                Request Body
                              </summary>
                              <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg border border-border/70 bg-background/40 p-3 text-muted-foreground">
                                {testResult.requestBody}
                              </pre>
                            </details>
                            <details open>
                              <summary className="cursor-pointer font-medium text-foreground">
                                Response Body
                              </summary>
                              <pre className="mt-2 max-h-[280px] overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-border/70 bg-background/40 p-3 text-muted-foreground">
                                {testResult.responseBody || "(empty)"}
                              </pre>
                            </details>
                          </div>
                        </div>
                      )}
                    </div>
                  </SettingsCard>
                )}
              </div>
            )}

            {mainTab === "history" && (
              <SettingsCard
                icon={<History className="h-5 w-5" />}
                title={t(
                  "settings.modelConfigCenter.sections.historyTitle",
                  "History & Restore",
                )}
                description={t(
                  "settings.modelConfigCenter.sections.historyDesc",
                  "Backups and version snapshots in one place to reduce navigation.",
                )}
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <SettingsTabs
                      items={[
                        {
                          id: "backups",
                          label: t(
                            "settings.modelConfigCenter.tabs.backups",
                            "Backup",
                          ),
                        },
                        {
                          id: "versions",
                          label: t(
                            "settings.modelConfigCenter.tabs.versions",
                            "Version",
                          ),
                        },
                      ]}
                      active={historyTab}
                      onChange={setHistoryTab}
                      className="inline-flex w-auto max-w-full"
                      buttonClassName="flex-none"
                    />
                    <button
                      type="button"
                      onClick={() => void createBackup()}
                      disabled={busy === "backup"}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring disabled:opacity-60"
                    >
                      {busy === "backup" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <History className="h-4 w-4" />
                      )}
                      {t(
                        "settings.modelConfigCenter.actions.createBackup",
                        "Backup Now",
                      )}
                    </button>
                  </div>

                  <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">
                    {historyTab === "backups" ? (
                      backups.length > 0 ? (
                        backups.map((backup) => (
                          <div
                            key={backup.id}
                            className="rounded-xl border border-border/70 bg-background/30 p-3 text-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-mono text-foreground">
                                  {backup.id}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {new Date(backup.createdAt).toLocaleString()}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {formatBytes(backup.sizeBytes)}
                                </div>
                                {backup.note && (
                                  <div className="mt-2 text-xs text-muted-foreground">
                                    {backup.note}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => requestRestoreBackup(backup.id)}
                                disabled={busy === `restore-${backup.id}`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface motion-color motion-press focus-ring disabled:opacity-60"
                              >
                                {busy === `restore-${backup.id}` ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-3.5 w-3.5" />
                                )}
                                {t(
                                  "settings.modelConfigCenter.actions.restore",
                                  "Resume",
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => requestDeleteBackup(backup.id)}
                                disabled={busy === `delete-${backup.id}`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface motion-color motion-press focus-ring disabled:opacity-60"
                              >
                                {busy === `delete-${backup.id}` ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                                {t(
                                  "settings.modelConfigCenter.actions.delete",
                                  "Delete",
                                )}
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                          {t(
                            "settings.modelConfigCenter.empty.noBackups",
                            "No backup records yet",
                          )}
                        </div>
                      )
                    ) : versions.length > 0 ? (
                      versions.map((version) => (
                        <div
                          key={version.id}
                          className="rounded-xl border border-border/70 bg-background/30 p-3 text-sm"
                        >
                          <div className="font-mono text-foreground">
                            #{version.id}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {version.filePath}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {new Date(version.createdAt).toLocaleString()}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatBytes(version.sizeBytes)}
                          </div>
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => requestRestoreVersion(version.id)}
                              disabled={busy === `version-${version.id}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface motion-color motion-press focus-ring disabled:opacity-60"
                            >
                              {busy === `version-${version.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                              {t(
                                "settings.modelConfigCenter.actions.restore",
                                "Resume",
                              )}
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                        {t(
                          "settings.modelConfigCenter.empty.noVersions",
                          "No version snapshots yet",
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </SettingsCard>
            )}
          </div>
        )}
      </div>

      {showAddProviderModal && (
        <ModalShell
          title={t(
            "settings.modelConfigCenter.dialogs.addProviderTitle",
            "Add Provider",
          )}
          description={t(
            "settings.modelConfigCenter.dialogs.addProviderDesc",
            "Give Provider a stable name first, then continue to fill in connection info on the right after creation.",
          )}
          onClose={() => setShowAddProviderModal(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setShowAddProviderModal(false)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground motion-color motion-press focus-ring"
              >
                {t("settings.modelConfigCenter.actions.cancel", "Cancel")}
              </button>
              <button
                type="button"
                onClick={handleCreateProvider}
                className="inline-flex items-center gap-2 rounded-lg bg-info px-4 py-2 text-sm text-white hover:bg-info/90 motion-color motion-press focus-ring"
              >
                <Plus className="h-4 w-4" />
                {t(
                  "settings.modelConfigCenter.actions.createProvider",
                  "Create Provider",
                )}
              </button>
            </>
          }
        >
          <SettingsField
            label={t(
              "settings.modelConfigCenter.fields.providerKey",
              "Provider Key",
            )}
          >
            <SettingsInput
              autoFocus
              value={newProviderName}
              onChange={(event) => setNewProviderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleCreateProvider();
                }
              }}
              placeholder={t(
                "settings.modelConfigCenter.placeholders.providerName",
                "e.g., local-openai",
              )}
            />
          </SettingsField>
        </ModalShell>
      )}

      {showImportModal && (
        <ModalShell
          title={t(
            "settings.modelConfigCenter.dialogs.importContentTitle",
            "Import JSON content",
          )}
          description={t(
            "settings.modelConfigCenter.dialogs.importContentDesc",
            "Paste complete models.json content here and apply according to current import mode.",
          )}
          onClose={() => {
            if (busy !== "import-content") {
              setShowImportModal(false);
            }
          }}
          widthClass="max-w-2xl"
          footer={
            <>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                disabled={busy === "import-content"}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground motion-color motion-press focus-ring disabled:opacity-60"
              >
                {t("settings.modelConfigCenter.actions.cancel", "Cancel")}
              </button>
              <button
                type="button"
                onClick={() => void importFromContent()}
                disabled={busy === "import-content"}
                className="inline-flex items-center gap-2 rounded-lg bg-info px-4 py-2 text-sm text-white hover:bg-info/90 motion-color motion-press focus-ring disabled:opacity-60"
              >
                {busy === "import-content" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {t(
                  "settings.modelConfigCenter.actions.importNow",
                  "Import Now",
                )}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/30 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-foreground">
                  {t(
                    "settings.modelConfigCenter.sections.importMode",
                    "Import Mode",
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t(
                    "settings.modelConfigCenter.help.importMode",
                    "Merge keeps existing providers, replace will directly use imported content.",
                  )}
                </div>
              </div>
              <SettingsTabs
                items={[
                  {
                    id: "merge",
                    label: t("settings.modelConfigCenter.tabs.merge", "Merge"),
                  },
                  {
                    id: "replace",
                    label: t(
                      "settings.modelConfigCenter.tabs.replace",
                      "Replace",
                    ),
                  },
                ]}
                active={importMode}
                onChange={setImportMode}
                className="inline-flex w-auto max-w-full"
                buttonClassName="flex-none"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void pasteClipboardToImport()}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring"
              >
                <Copy className="h-4 w-4" />
                {t(
                  "settings.modelConfigCenter.actions.pasteClipboard",
                  "Paste from clipboard",
                )}
              </button>
            </div>

            <textarea
              value={importContentDraft}
              onChange={(event) => setImportContentDraft(event.target.value)}
              placeholder={t(
                "settings.modelConfigCenter.placeholders.importContent",
                "Paste complete models.json content",
              )}
              className="min-h-[320px] w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-info focus:outline-none motion-color motion-surface"
            />
          </div>
        </ModalShell>
      )}

      {confirmDialog && (
        <ConfirmDialog
          dialog={confirmDialog}
          confirming={confirmingDialog}
          cancelLabel={t("settings.modelConfigCenter.actions.cancel", "Cancel")}
          onCancel={() => {
            if (!confirmingDialog) {
              setConfirmDialog(null);
            }
          }}
          onConfirm={() => void handleConfirmDialog()}
        />
      )}
    </>
  );
}
