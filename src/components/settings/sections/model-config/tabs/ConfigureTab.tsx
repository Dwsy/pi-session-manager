import { useTranslation } from "react-i18next";
import {
  FileJson,
  Plus,
  Server,
  Trash2,
} from "lucide-react";
import SettingsCard from "@/components/settings/SettingsCard";
import SettingsField from "@/components/settings/SettingsField";
import SettingsInput from "@/components/settings/SettingsInput";
import SettingsSelect from "@/components/settings/SettingsSelect";
import SettingsTabs from "@/components/settings/SettingsTabs";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";
import type { ModelConfigShape, ProviderEntry, ModelEntry } from "../types";
import { API_TYPE_OPTIONS } from "../types";
import { modelSelectionValue, splitInputTypes } from "../utils";

interface ConfigureTabProps {
  providerNames: string[];
  config: ModelConfigShape;
  selectedProvider: string;
  setSelectedProvider: (name: string) => void;
  setConfigDetailTab: (tab: "provider" | "model") => void;
  requestDeleteProvider: (name: string) => void;
  setShowAddProviderModal: (show: boolean) => void;
  selectedProviderModels: ModelEntry[];
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  addModel: () => void;
  selectedProviderEntry?: ProviderEntry;
  providerNameDraft: string;
  setProviderNameDraft: (name: string) => void;
  commitProviderRename: () => void;
  updateSelectedProviderEntry: (updater: (p: ProviderEntry) => ProviderEntry) => void;
  selectedModelEntry?: ModelEntry;
  activeModelLabel: string;
  updateSelectedModelEntry: (updater: (m: ModelEntry) => ModelEntry) => void;
  selectedModelIndex: number;
  configDetailTab: "provider" | "model";
  requestDeleteModel: (index: number) => void;
}

export function ConfigureTab({
  providerNames,
  config,
  selectedProvider,
  setSelectedProvider,
  setConfigDetailTab,
  requestDeleteProvider,
  setShowAddProviderModal,
  selectedProviderModels,
  selectedModel,
  setSelectedModel,
  addModel,
  selectedProviderEntry,
  providerNameDraft,
  setProviderNameDraft,
  commitProviderRename,
  updateSelectedProviderEntry,
  selectedModelEntry,
  activeModelLabel,
  updateSelectedModelEntry,
  selectedModelIndex,
  configDetailTab,
  requestDeleteModel,
}: ConfigureTabProps) {
  const { t } = useTranslation();

  return (
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
