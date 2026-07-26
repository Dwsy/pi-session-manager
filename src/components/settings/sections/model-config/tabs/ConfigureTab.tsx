import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Coins,
  Cpu,
  FileText,
  CloudDownload,
  Image as ImageIcon,
  Library,
  Loader2,
  Plus,
  Search,
  Server,
  Shield,
  Sparkles,
  Copy,
  Trash2,
  Type,
} from "lucide-react";
import SettingsField from "@/components/settings/SettingsField";
import SettingsInput from "@/components/settings/SettingsInput";
import { ModelIcon } from "@/components/session-viewer/ModelIcon";
import {
  MODEL_INPUT_TYPE_OPTIONS,
  MODEL_THINKING_LEVEL_OPTIONS,
} from "../types";
import { clampCostValue } from "../utils";
import type {
  ModelConfigShape,
  ProviderEntry,
  ModelEntry,
  ConfigDetailTab,
  ModelInputType,
  ThinkingLevelMap,
} from "../types";

const CONTEXT_WINDOW_PRESETS = [
  { label: "200k", value: 200000 },
  { label: "256k", value: 262144 },
  { label: "272k", value: 272000 },
  { label: "1m", value: 1048576 },
] as const;

const MAX_OUTPUT_PRESETS = [
  { label: "128k", value: 128000 },
  { label: "64k", value: 65536 },
  { label: "32k", value: 32768 },
] as const;

interface ConfigureTabProps {
  providerNames: string[];
  config: ModelConfigShape;
  selectedProvider: string;
  setSelectedProvider: (provider: string) => void;
  setConfigDetailTab: (tab: ConfigDetailTab) => void;
  requestDeleteProvider: (provider: string) => void;
  openCopyProviderModal: (provider: string) => void;
  openAddProviderModal: () => void;
  selectedProviderModels: ModelEntry[];
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  addModel: () => void;
  openCatalogBrowser: () => void;
  openRemoteModelsBrowser: () => void;
  fillSelectedModelPricing: () => void;
  fillProviderPricing: () => void;
  busy: string | null;
  selectedProviderEntry?: ProviderEntry;
  providerNameDraft: string;
  setProviderNameDraft: (name: string) => void;
  commitProviderRename: () => void;
  updateSelectedProviderEntry: (
    updater: (provider: ProviderEntry) => ProviderEntry,
  ) => void;
  selectedModelEntry?: ModelEntry;
  activeModelLabel: string;
  updateSelectedModelEntry: (
    updater: (model: ModelEntry) => ModelEntry,
  ) => void;
  selectedModelIndex: number;
  configDetailTab: ConfigDetailTab;
  requestDeleteModel: (index: number) => void;
}

export function ConfigureTab({
  providerNames,
  config,
  selectedProvider,
  setSelectedProvider,
  setConfigDetailTab,
  requestDeleteProvider,
  openCopyProviderModal,
  openAddProviderModal,
  selectedProviderModels,
  selectedModel,
  setSelectedModel,
  addModel,
  openCatalogBrowser,
  openRemoteModelsBrowser,
  fillSelectedModelPricing,
  fillProviderPricing,
  busy,
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
  const [providerFilter, setProviderFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");

  const filteredProviderNames = useMemo(() => {
    const query = providerFilter.trim().toLowerCase();
    if (!query) return providerNames;
    return providerNames.filter((provider) => {
      const entry = config.providers[provider];
      return `${provider} ${entry?.api ?? ""}`.toLowerCase().includes(query);
    });
  }, [config.providers, providerFilter, providerNames]);

  const filteredModels = useMemo(() => {
    const query = modelFilter.trim().toLowerCase();
    const models = selectedProviderModels.map((entry, index) => ({
      entry,
      index,
    }));
    if (!query) return models;
    return models.filter(({ entry, index }) =>
      `${entry.id ?? ""} ${entry.name ?? ""} model-${index + 1}`
        .toLowerCase()
        .includes(query),
    );
  }, [modelFilter, selectedProviderModels]);

  const compactFieldProps = {
    className: "space-y-1.5",
    descriptionClassName: "text-[10px] leading-snug text-muted-foreground",
    labelClassName: "text-[11px] font-semibold text-foreground",
  };

  const updateCostField = (
    field: "input" | "output" | "cacheRead" | "cacheWrite",
    rawValue: string,
  ) => {
    const val = clampCostValue(rawValue, 0);
    updateSelectedModelEntry((prev) => ({
      ...prev,
      cost: {
        ...prev.cost,
        input: clampCostValue(prev.cost?.input),
        output: clampCostValue(prev.cost?.output),
        cacheRead: clampCostValue(prev.cost?.cacheRead),
        cacheWrite: clampCostValue(prev.cost?.cacheWrite),
        [field]: val,
      },
    }));
  };

  const thinkingLevelEntries = useMemo(() => {
    const map = selectedModelEntry?.thinkingLevelMap ?? {};
    return Object.entries(map).map(([level, value]) => ({ level, value }));
  }, [selectedModelEntry?.thinkingLevelMap]);

  const setThinkingLevelMap = (nextMap: ThinkingLevelMap) => {
    updateSelectedModelEntry((prev) => ({
      ...prev,
      thinkingLevelMap: Object.keys(nextMap).length > 0 ? nextMap : undefined,
    }));
  };

  const updateThinkingLevelValue = (
    level: string,
    value: string | null | undefined,
  ) => {
    const nextMap: ThinkingLevelMap = {
      ...(selectedModelEntry?.thinkingLevelMap ?? {}),
    };
    if (value === undefined) {
      delete nextMap[level];
    } else {
      nextMap[level] = value;
    }
    setThinkingLevelMap(nextMap);
  };

  const renameThinkingLevel = (fromLevel: string, toLevelRaw: string) => {
    const toLevel = toLevelRaw.trim();
    if (!toLevel || toLevel === fromLevel) return;

    const current = selectedModelEntry?.thinkingLevelMap ?? {};
    if (Object.prototype.hasOwnProperty.call(current, toLevel)) {
      return;
    }

    const nextMap: ThinkingLevelMap = {};
    for (const [level, value] of Object.entries(current)) {
      nextMap[level === fromLevel ? toLevel : level] = value;
    }
    setThinkingLevelMap(nextMap);
  };

  const removeThinkingLevel = (level: string) => {
    const nextMap: ThinkingLevelMap = {
      ...(selectedModelEntry?.thinkingLevelMap ?? {}),
    };
    delete nextMap[level];
    setThinkingLevelMap(nextMap);
  };

  const addThinkingLevel = (preferred?: string) => {
    const current = selectedModelEntry?.thinkingLevelMap ?? {};
    const existing = new Set(Object.keys(current));

    let level =
      preferred?.trim() ||
      MODEL_THINKING_LEVEL_OPTIONS.find((item) => !existing.has(item)) ||
      "";

    if (!level) {
      let index = 1;
      level = `custom-${index}`;
      while (existing.has(level)) {
        index += 1;
        level = `custom-${index}`;
      }
    }

    if (existing.has(level)) return;

    setThinkingLevelMap({
      ...current,
      [level]: level,
    });
  };

  const addPresetThinkingLevels = () => {
    const current = { ...(selectedModelEntry?.thinkingLevelMap ?? {}) };
    let changed = false;
    for (const level of MODEL_THINKING_LEVEL_OPTIONS) {
      if (Object.prototype.hasOwnProperty.call(current, level)) continue;
      current[level] = level === "off" ? null : level;
      changed = true;
    }
    if (changed) setThinkingLevelMap(current);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/50 bg-card/15 shadow-2xs lg:flex-row">
      {/* Pane 1: Providers List (High-Density Linear/Cursor Style) */}
      <div className="flex min-h-0 w-full flex-none flex-col border-b border-border/40 bg-card/40 lg:w-[196px] lg:border-b-0 lg:border-r xl:w-[210px]">
        <div className="flex min-w-0 items-center justify-between gap-1 border-b border-border/40 bg-card/60 px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => setConfigDetailTab("provider")}
            className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-accent focus-ring"
          >
            <Server className="h-3 w-3" />
            <span>
              {t("settings.modelConfigCenter.sections.providers", "Providers")}
            </span>
            <span className="rounded-full border border-border/40 bg-background/50 px-1.5 py-px font-mono text-[10px] text-foreground">
              {providerNames.length}
            </span>
          </button>
          <button
            type="button"
            onClick={openAddProviderModal}
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md settings-accent-bg-soft px-2 text-[11px] font-semibold settings-accent-fg transition-all duration-150 hover:settings-accent-bg-strong hover:text-primary-foreground active:scale-95 focus-ring"
            title={t("settings.modelConfigCenter.actions.addProvider", "新增")}
          >
            <Plus className="h-3 w-3" />
            <span>
              {t("settings.modelConfigCenter.actions.addProviderShort", "新增")}
            </span>
          </button>
        </div>

        <div className="border-b border-border/30 p-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
            <input
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value)}
              placeholder={t(
                "settings.modelConfigCenter.placeholders.providerSearch",
                "Search providers",
              )}
              className="h-7 w-full rounded-md border border-border/50 bg-background/45 pl-6 pr-2 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/55 outline-none transition-colors focus:border-transparent focus:settings-accent-ring"
            />
          </div>
        </div>

        <div className="p-1 space-y-0.5 overflow-y-auto max-h-[200px] lg:max-h-none flex-1">
          {filteredProviderNames.map((provider) => {
            const isSelected = provider === selectedProvider;
            const modelsCount = config.providers[provider]?.models?.length || 0;
            const apiType = config.providers[provider]?.api || "openai";

            return (
              <div
                key={provider}
                onClick={() => {
                  setSelectedProvider(provider);
                  setConfigDetailTab("provider");
                }}
                className={`group flex items-center justify-between rounded-md px-2 py-1.5 text-left transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? "settings-accent-bg-soft settings-accent-ring border border-transparent text-foreground"
                    : "border border-transparent text-foreground/80 hover:bg-accent/10 hover:text-foreground"
                }`}
              >
                <div className="min-w-0 flex-1 pr-1">
                  <div className="truncate text-xs">{provider}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                    <span className="truncate">{apiType}</span>
                  </div>
                </div>
                <span
                  className={`flex-none rounded-md px-1.5 py-px font-mono text-[10px] ${
                    isSelected
                      ? "settings-accent-bg-strong text-primary-foreground"
                      : "bg-surface text-muted-foreground group-hover:bg-background"
                  }`}
                >
                  {modelsCount}
                </span>
              </div>
            );
          })}

          {filteredProviderNames.length === 0 && (
            <div className="py-12 text-center text-xs text-muted-foreground">
              {providerNames.length === 0
                ? t(
                    "settings.modelConfigCenter.empty.noProviders",
                    "No providers yet",
                  )
                : t(
                    "settings.modelConfigCenter.empty.noProviderMatches",
                    "No matching providers",
                  )}
            </div>
          )}
        </div>
      </div>

      {/* Pane 2: Models List (High-Density Linear/Cursor Style) */}
      <div className="flex min-h-0 w-full flex-none flex-col border-b border-border/40 bg-card/20 lg:w-[214px] lg:border-b-0 lg:border-r xl:w-[230px]">
        <div className="flex min-w-0 items-center justify-between gap-1 border-b border-border/40 bg-card/60 px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => setConfigDetailTab("model")}
            className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-accent focus-ring"
          >
            <Cpu className="h-3 w-3" />
            <span>
              {t("settings.modelConfigCenter.sections.models", "Models")}
            </span>
            <span className="rounded-full border border-border/40 bg-background/50 px-1.5 py-px font-mono text-[10px] text-foreground">
              {selectedProviderModels.length}
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={openRemoteModelsBrowser}
              disabled={!selectedProvider}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-border/50 bg-background/50 px-1.5 text-[11px] font-semibold text-muted-foreground hover:border-accent/40 hover:text-accent transition-all duration-150 active:scale-95 focus-ring disabled:opacity-50"
              title={t(
                "settings.modelConfigCenter.actions.addFromProviderApi",
                "从供应商接口添加",
              )}
            >
              <CloudDownload className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={openCatalogBrowser}
              disabled={!selectedProvider}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-border/50 bg-background/50 px-1.5 text-[11px] font-semibold text-muted-foreground hover:border-accent/40 hover:text-accent transition-all duration-150 active:scale-95 focus-ring disabled:opacity-50"
              title={t(
                "settings.modelConfigCenter.actions.addFromCatalog",
                "从 models.dev 添加",
              )}
            >
              <Library className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={addModel}
              disabled={!selectedProvider}
              className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md settings-accent-bg-soft px-2 text-[11px] font-semibold settings-accent-fg transition-all duration-150 hover:settings-accent-bg-strong hover:text-primary-foreground active:scale-95 focus-ring disabled:opacity-50"
              title={t("settings.modelConfigCenter.actions.addModel", "新增")}
            >
              <Plus className="h-3 w-3" />
              <span>
                {t("settings.modelConfigCenter.actions.addModelShort", "新增")}
              </span>
            </button>
          </div>
        </div>

        <div className="border-b border-border/30 p-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
            <input
              value={modelFilter}
              onChange={(event) => setModelFilter(event.target.value)}
              placeholder={t(
                "settings.modelConfigCenter.placeholders.modelSearch",
                "Search models",
              )}
              className="h-7 w-full rounded-md border border-border/50 bg-background/45 pl-6 pr-2 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/55 outline-none transition-colors focus:border-transparent focus:settings-accent-ring disabled:opacity-50"
              disabled={!selectedProvider}
            />
          </div>
        </div>

        <div className="p-1 space-y-0.5 overflow-y-auto max-h-[220px] lg:max-h-none flex-1">
          {filteredModels.map(({ entry, index }) => {
            const id = String(index);
            const isSelected =
              selectedModel === id && selectedModelIndex === index;
            const modelId = entry.id?.trim() || `model-${index + 1}`;
            const contextLimit = entry.contextWindow
              ? `${Math.round(entry.contextWindow / 1024)}k`
              : null;

            return (
              <div
                key={`${modelId}-${index}`}
                onClick={() => {
                  setSelectedModel(id);
                  setConfigDetailTab("model");
                }}
                className={`group flex items-center justify-between rounded-md px-2 py-1.5 text-left transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? "settings-accent-bg-soft settings-accent-ring border border-transparent text-foreground"
                    : "border border-transparent text-foreground/80 hover:bg-accent/10 hover:text-foreground"
                }`}
              >
                <div className="min-w-0 flex-1 pr-1">
                  <div className="flex items-center gap-1.5">
                    <ModelIcon model={modelId} size={12} className="shrink-0" />
                    <span className="truncate text-xs">{modelId}</span>
                    {entry.reasoning && (
                      <Sparkles
                        className="h-3 w-3 shrink-0 text-amber-500/90"
                        aria-hidden
                      />
                    )}
                  </div>
                  {contextLimit && (
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {contextLimit} ctx
                    </div>
                  )}
                </div>
                <div
                  className="flex shrink-0 items-center gap-1 text-muted-foreground"
                  title={t(
                    "settings.modelConfigCenter.help.inputTypesShort",
                    "text 固定；image 表示支持视觉输入",
                  )}
                >
                  <Type
                    className="h-3 w-3 shrink-0 settings-accent-fg opacity-90"
                    aria-label="text"
                  />
                  <ImageIcon
                    className={`h-3 w-3 shrink-0 ${
                      entry.input?.includes("image")
                        ? "settings-accent-fg opacity-90"
                        : "opacity-25"
                    }`}
                    aria-label="image"
                  />
                </div>
              </div>
            );
          })}

          {filteredModels.length === 0 && (
            <div className="py-12 text-center text-xs text-muted-foreground">
              {selectedProvider
                ? selectedProviderModels.length === 0
                  ? t(
                      "settings.modelConfigCenter.empty.noModels",
                      "This provider has no models yet",
                    )
                  : t(
                      "settings.modelConfigCenter.empty.noModelMatches",
                      "No matching models",
                    )
                : t(
                    "settings.modelConfigCenter.empty.selectProviderFirst",
                    "Select a provider first",
                  )}
            </div>
          )}
        </div>
      </div>

      {/* Pane 3: Detail Editor Pane (High-Density, Form-Aligned) */}
      <div className="flex min-h-0 flex-1 min-w-0 flex-col bg-background/40">
        {/* Detail Top Header Bar */}
        <div className="px-3 py-1.5 border-b border-border/40 bg-card/30 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 truncate text-xs">
            <span className="font-semibold text-muted-foreground">
              {selectedProvider || "-"}
            </span>
            <span className="text-muted-foreground/50">/</span>
            <span className="font-bold text-foreground">
              {activeModelLabel || "-"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md bg-surface/80 p-0.5 border border-border/50">
              <button
                type="button"
                onClick={() => setConfigDetailTab("model")}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-all ${
                  configDetailTab === "model"
                    ? "bg-card text-foreground shadow-2xs border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("settings.modelConfigCenter.tabs.modelDetail", "模型详情")}
              </button>
              <button
                type="button"
                onClick={() => setConfigDetailTab("provider")}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-all ${
                  configDetailTab === "provider"
                    ? "bg-card text-foreground shadow-2xs border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(
                  "settings.modelConfigCenter.tabs.providerDetail",
                  "Provider 详情",
                )}
              </button>
            </div>

            {configDetailTab === "model" && selectedModelEntry && (
              <button
                type="button"
                onClick={() => requestDeleteModel(selectedModelIndex)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-background/50 text-muted-foreground hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/30 transition-all active:scale-95"
                title={t(
                  "settings.modelConfigCenter.actions.deleteModel",
                  "删除模型",
                )}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}

            {configDetailTab === "provider" && selectedProviderEntry && (
              <>
                <button
                  type="button"
                  onClick={() => openCopyProviderModal(selectedProvider)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-background/50 text-muted-foreground hover:bg-accent/15 hover:text-foreground hover:border-border transition-all active:scale-95"
                  title={t(
                    "settings.modelConfigCenter.actions.copyProvider",
                    "复制 Provider",
                  )}
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => requestDeleteProvider(selectedProvider)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-background/50 text-muted-foreground hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/30 transition-all active:scale-95"
                  title={t(
                    "settings.modelConfigCenter.actions.deleteProvider",
                    "删除 Provider",
                  )}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Form Body (Compact Spacing & Clean Grids) */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3 [&_input:not([type=checkbox])]:h-8 [&_select]:h-8 [&_select]:px-2 [&_select]:text-xs">
          {/* Provider Detail Form */}
          {configDetailTab === "provider" && selectedProviderEntry && (
            <div className="space-y-3 animate-in fade-in duration-150">
              {/* Basic Provider Info */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/30">
                  <Server className="h-3 w-3 settings-accent-fg" />
                  <span>
                    {t(
                      "settings.modelConfigCenter.sections.providerBasic",
                      "Provider 基础配置",
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <SettingsField
                    {...compactFieldProps}
                    label={t(
                      "settings.modelConfigCenter.fields.providerName",
                      "Provider 名称",
                    )}
                  >
                    <div className="flex gap-2">
                      <SettingsInput
                        value={providerNameDraft}
                        onChange={(e) => setProviderNameDraft(e.target.value)}
                        placeholder="e.g. openai, anthropic, 3838"
                      />
                      <button
                        type="button"
                        onClick={commitProviderRename}
                        disabled={
                          !providerNameDraft.trim() ||
                          providerNameDraft.trim() === selectedProvider
                        }
                        className="inline-flex items-center justify-center rounded-lg settings-accent-bg-strong px-2 text-xs font-semibold text-primary-foreground transition-all active:scale-95 disabled:opacity-50 flex-none"
                      >
                        {t(
                          "settings.modelConfigCenter.actions.rename",
                          "重命名",
                        )}
                      </button>
                    </div>
                  </SettingsField>

                  <SettingsField
                    {...compactFieldProps}
                    label={t(
                      "settings.modelConfigCenter.fields.api",
                      "API 协议",
                    )}
                  >
                    <select
                      value={selectedProviderEntry.api ?? "openai"}
                      onChange={(e) =>
                        updateSelectedProviderEntry((prev) => ({
                          ...prev,
                          api: e.target.value,
                        }))
                      }
                      className="h-8 w-full rounded-md border border-border bg-surface px-2 text-xs font-medium text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none transition-all"
                    >
                      <option value="openai">
                        openai (Standard / Compatible)
                      </option>
                      <option value="anthropic-messages">
                        anthropic-messages (Claude)
                      </option>
                      <option value="openai-responses">
                        openai-responses (Response Format)
                      </option>
                      <option value="openai-completions">
                        openai-completions (Legacy)
                      </option>
                      <option value="google-generative-ai">
                        google-generative-ai (Gemini)
                      </option>
                    </select>
                  </SettingsField>

                  <div className="md:col-span-2">
                    <SettingsField
                      {...compactFieldProps}
                      label={t(
                        "settings.modelConfigCenter.fields.baseUrl",
                        "Base URL (服务地址)",
                      )}
                      description={t(
                        "settings.modelConfigCenter.help.baseUrl",
                        "默认留空将使用官方标准 API 后端地址",
                      )}
                    >
                      <SettingsInput
                        value={selectedProviderEntry.baseUrl ?? ""}
                        onChange={(e) =>
                          updateSelectedProviderEntry((prev) => ({
                            ...prev,
                            baseUrl: e.target.value,
                          }))
                        }
                        placeholder="e.g. https://api.openai.com/v1"
                        className="font-mono text-xs"
                      />
                    </SettingsField>
                  </div>

                  <div className="md:col-span-2">
                    <SettingsField
                      {...compactFieldProps}
                      label={t(
                        "settings.modelConfigCenter.fields.apiKey",
                        "API Key (密钥)",
                      )}
                      description={t(
                        "settings.modelConfigCenter.help.apiKey",
                        "优先级高于环境变量，以密文形式存储",
                      )}
                    >
                      <SettingsInput
                        type="password"
                        value={selectedProviderEntry.apiKey ?? ""}
                        onChange={(e) =>
                          updateSelectedProviderEntry((prev) => ({
                            ...prev,
                            apiKey: e.target.value,
                          }))
                        }
                        placeholder="sk-..."
                        className="font-mono text-xs"
                      />
                    </SettingsField>
                  </div>
                </div>
              </div>

              {/* Advanced Provider Headers & Auth */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/30">
                  <Shield className="h-3 w-3 settings-accent-fg" />
                  <span>
                    {t(
                      "settings.modelConfigCenter.sections.providerAdvanced",
                      "高级授权与请求头",
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <SettingsField
                    {...compactFieldProps}
                    label={t(
                      "settings.modelConfigCenter.fields.authHeader",
                      "启用 Auth Header",
                    )}
                    description={t(
                      "settings.modelConfigCenter.help.authHeader",
                      "Automatically include the standard Authorization header.",
                    )}
                  >
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium h-9 px-3 rounded-lg border border-border/60 bg-surface/50">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedProviderEntry.authHeader)}
                        onChange={(e) =>
                          updateSelectedProviderEntry((prev) => ({
                            ...prev,
                            authHeader: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                      />
                      <span>
                        {t(
                          "settings.modelConfigCenter.help.enableAuthHeader",
                          "Enable standard Authorization header",
                        )}
                      </span>
                    </label>
                  </SettingsField>

                  <SettingsField
                    {...compactFieldProps}
                    label={t(
                      "settings.modelConfigCenter.fields.headers",
                      "自定义 HTTP Headers",
                    )}
                    description={t(
                      "settings.modelConfigCenter.help.headers",
                      "Pass extra headers as a JSON key-value object.",
                    )}
                  >
                    <SettingsInput
                      value={
                        selectedProviderEntry.headers
                          ? JSON.stringify(selectedProviderEntry.headers)
                          : ""
                      }
                      onChange={(e) => {
                        try {
                          const val = e.target.value.trim();
                          const parsed = val ? JSON.parse(val) : undefined;
                          updateSelectedProviderEntry((prev) => ({
                            ...prev,
                            headers: parsed,
                          }));
                        } catch {
                          // Keep typing while invalid JSON
                        }
                      }}
                      placeholder='{"X-Custom-Header": "value"}'
                      className="font-mono text-xs"
                    />
                  </SettingsField>
                </div>
              </div>
            </div>
          )}

          {/* Model Detail Form */}
          {configDetailTab === "model" && selectedModelEntry && (
            <div className="space-y-3 animate-in fade-in duration-150">
              {/* Basic Model Info */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/30">
                  <FileText className="h-3 w-3 settings-accent-fg" />
                  <span>
                    {t(
                      "settings.modelConfigCenter.sections.modelBasic",
                      "模型基础信息",
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <SettingsField
                    {...compactFieldProps}
                    label={t(
                      "settings.modelConfigCenter.fields.modelId",
                      "模型 ID",
                    )}
                  >
                    <SettingsInput
                      value={selectedModelEntry.id ?? ""}
                      onChange={(e) =>
                        updateSelectedModelEntry((prev) => ({
                          ...prev,
                          id: e.target.value,
                        }))
                      }
                      placeholder="e.g. gpt-4o, claude-3-5-sonnet"
                      className="font-mono text-xs font-bold text-foreground"
                    />
                  </SettingsField>

                  <SettingsField
                    {...compactFieldProps}
                    label={t(
                      "settings.modelConfigCenter.fields.displayName",
                      "显示名称",
                    )}
                  >
                    <SettingsInput
                      value={selectedModelEntry.name ?? ""}
                      onChange={(e) =>
                        updateSelectedModelEntry((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      placeholder="e.g. GPT-4o, Claude 3.5 Sonnet"
                      className="text-xs font-medium"
                    />
                  </SettingsField>

                  <SettingsField
                    {...compactFieldProps}
                    label={t(
                      "settings.modelConfigCenter.fields.inputTypes",
                      "输入类型",
                    )}
                    description={t(
                      "settings.modelConfigCenter.help.inputTypes",
                      "Pi currently requires text; image is optional for vision-capable models.",
                    )}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      {MODEL_INPUT_TYPE_OPTIONS.map((type) => {
                        const enabled =
                          type === "text" ||
                          Boolean(selectedModelEntry.input?.includes(type));
                        return (
                          <label
                            key={type}
                            className={`flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition-colors ${
                              enabled
                                ? "settings-accent-bg-soft settings-accent-ring border-transparent text-foreground"
                                : "border-border/60 bg-background/45 text-muted-foreground hover:border-accent/40 hover:bg-surface/70 hover:text-foreground"
                            } ${type === "text" ? "cursor-default opacity-80" : "cursor-pointer"}`}
                          >
                            <input
                              type="checkbox"
                              checked={enabled}
                              disabled={type === "text"}
                              onChange={(event) => {
                                const nextInput: ModelInputType[] = event.target
                                  .checked
                                  ? ["text", "image"]
                                  : ["text"];
                                updateSelectedModelEntry((prev) => ({
                                  ...prev,
                                  input: nextInput,
                                }));
                              }}
                              className="sr-only"
                            />
                            <span
                              className={`flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px] leading-none ${
                                enabled
                                  ? "settings-accent-bg-strong border-transparent text-primary-foreground"
                                  : "border-border/70 bg-background/70"
                              }`}
                            >
                              {enabled ? "✓" : ""}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              {type === "text" ? (
                                <Type className="h-3 w-3 shrink-0 opacity-80" />
                              ) : (
                                <ImageIcon className="h-3 w-3 shrink-0 opacity-80" />
                              )}
                              <span className="font-mono">{type}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </SettingsField>

                  <div className="flex flex-col justify-end">
                    <label
                      className={`flex h-[46px] cursor-pointer items-center justify-between rounded-md border px-2.5 py-1.5 transition-colors ${
                        selectedModelEntry.reasoning
                          ? "settings-accent-bg-soft settings-accent-ring border-transparent"
                          : "border-border/60 bg-background/45 hover:border-accent/40 hover:bg-surface/70"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Sparkles className="h-3 w-3 settings-accent-fg" />
                          <span>
                            {t(
                              "settings.modelConfigCenter.fields.reasoningModel",
                              "Reasoning model",
                            )}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {t(
                            "settings.modelConfigCenter.help.reasoning",
                            "Marks whether this model supports deeper reasoning.",
                          )}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedModelEntry.reasoning)}
                        onChange={(e) =>
                          updateSelectedModelEntry((prev) => ({
                            ...prev,
                            reasoning: e.target.checked,
                            thinkingLevelMap: e.target.checked
                              ? prev.thinkingLevelMap
                              : undefined,
                          }))
                        }
                        className="sr-only"
                      />
                      <span
                        className={`relative h-4 w-7 rounded-full transition-colors ${
                          selectedModelEntry.reasoning
                            ? "settings-accent-bg-strong"
                            : "bg-muted"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-3 w-3 rounded-full bg-background shadow-sm transition-transform ${
                            selectedModelEntry.reasoning
                              ? "translate-x-3.5"
                              : "translate-x-0.5"
                          }`}
                        />
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {selectedModelEntry.reasoning && (
                <div className="space-y-2 pt-0.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-border/30">
                    <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <Sparkles className="h-3 w-3 settings-accent-fg" />
                      <span>
                        {t(
                          "settings.modelConfigCenter.sections.thinkingLevelMap",
                          "推理级别映射",
                        )}
                      </span>
                      <span className="font-normal normal-case tracking-normal text-muted-foreground/80">
                        {t(
                          "settings.modelConfigCenter.help.thinkingLevelMap",
                          "可自由增删级别；provider 值可自定义，null 表示不支持",
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={addPresetThinkingLevels}
                        className="inline-flex h-6 items-center gap-1 rounded-md border border-border/50 bg-surface/50 px-2 text-[10px] font-medium text-foreground transition-colors hover:border-accent/40 hover:bg-surface/70 hover:text-foreground focus-ring"
                      >
                        {t(
                          "settings.modelConfigCenter.actions.addThinkingPresets",
                          "填充常用级别",
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => addThinkingLevel()}
                        className="inline-flex h-6 items-center gap-1 rounded-md settings-accent-bg-soft px-2 text-[10px] font-semibold settings-accent-fg transition-colors hover:settings-accent-bg-strong hover:text-primary-foreground focus-ring"
                      >
                        <Plus className="h-3 w-3" />
                        {t(
                          "settings.modelConfigCenter.actions.addThinkingLevel",
                          "添加级别",
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {MODEL_THINKING_LEVEL_OPTIONS.map((preset) => {
                      const exists = Object.prototype.hasOwnProperty.call(
                        selectedModelEntry.thinkingLevelMap ?? {},
                        preset,
                      );
                      return (
                        <button
                          key={preset}
                          type="button"
                          disabled={exists}
                          onClick={() => addThinkingLevel(preset)}
                          className="rounded border border-border/50 bg-surface/45 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-accent/40 hover:bg-surface/70 hover:text-foreground disabled:opacity-40"
                          title={t(
                            "settings.modelConfigCenter.actions.addThinkingLevelPreset",
                            "添加级别 {{level}}",
                            { level: preset },
                          )}
                        >
                          +{preset}
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-1.5">
                    {thinkingLevelEntries.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border/50 px-3 py-4 text-center text-[11px] text-muted-foreground">
                        {t(
                          "settings.modelConfigCenter.empty.noThinkingLevels",
                          "还没有推理级别映射。可添加 max / ultra 等自定义级别。",
                        )}
                      </div>
                    ) : (
                      thinkingLevelEntries.map(({ level, value }) => {
                        const mode = value === null ? "unsupported" : "custom";
                        return (
                          <div
                            key={level}
                            className="grid grid-cols-1 items-center gap-2 rounded-md border border-border/50 bg-surface/35 px-2 py-1.5 sm:grid-cols-[140px_120px_minmax(0,1fr)_28px]"
                          >
                            <SettingsInput
                              defaultValue={level}
                              key={`thinking-level-key-${level}`}
                              onBlur={(event) => {
                                const next = event.target.value.trim();
                                if (!next) {
                                  event.target.value = level;
                                  return;
                                }
                                if (next === level) return;
                                const exists =
                                  Object.prototype.hasOwnProperty.call(
                                    selectedModelEntry.thinkingLevelMap ?? {},
                                    next,
                                  );
                                if (exists) {
                                  event.target.value = level;
                                  return;
                                }
                                renameThinkingLevel(level, next);
                              }}
                              placeholder={t(
                                "settings.modelConfigCenter.placeholders.thinkingLevelKey",
                                "level key, e.g. max",
                              )}
                              className="h-7 px-2 py-1 font-mono text-[11px]"
                            />
                            <select
                              value={mode}
                              onChange={(event) => {
                                if (event.target.value === "unsupported") {
                                  updateThinkingLevelValue(level, null);
                                } else {
                                  updateThinkingLevelValue(
                                    level,
                                    typeof value === "string" ? value : level,
                                  );
                                }
                              }}
                              className="h-7 rounded-md border border-border bg-background/70 px-2 text-[11px] text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                            >
                              <option value="custom">
                                {t(
                                  "settings.modelConfigCenter.thinkingLevelModes.custom",
                                  "Custom",
                                )}
                              </option>
                              <option value="unsupported">
                                {t(
                                  "settings.modelConfigCenter.thinkingLevelModes.unsupported",
                                  "Unsupported",
                                )}
                              </option>
                            </select>
                            <SettingsInput
                              value={typeof value === "string" ? value : ""}
                              onChange={(event) =>
                                updateThinkingLevelValue(
                                  level,
                                  event.target.value,
                                )
                              }
                              disabled={mode !== "custom"}
                              placeholder={level}
                              className="h-7 px-2 py-1 font-mono text-[11px] disabled:opacity-45"
                            />
                            <button
                              type="button"
                              onClick={() => removeThinkingLevel(level)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-background/50 text-muted-foreground hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/30 transition-all"
                              title={t(
                                "settings.modelConfigCenter.actions.removeThinkingLevel",
                                "删除级别",
                              )}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Model Limits */}
              <div className="space-y-2 pt-0.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/30">
                  <Cpu className="h-3 w-3 settings-accent-fg" />
                  <span>
                    {t(
                      "settings.modelConfigCenter.sections.modelLimits",
                      "能力边界 (Limits)",
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <SettingsField
                    {...compactFieldProps}
                    label={t(
                      "settings.modelConfigCenter.fields.contextWindow",
                      "上下文窗口 (Context)",
                    )}
                  >
                    <SettingsInput
                      type="number"
                      value={selectedModelEntry.contextWindow ?? ""}
                      onChange={(e) => {
                        const val = e.target.value
                          ? Number(e.target.value)
                          : undefined;
                        updateSelectedModelEntry((prev) => ({
                          ...prev,
                          contextWindow: val,
                        }));
                      }}
                      placeholder="e.g. 128000, 1048576"
                      className="font-mono text-xs"
                    />
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {CONTEXT_WINDOW_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() =>
                            updateSelectedModelEntry((prev) => ({
                              ...prev,
                              contextWindow: preset.value,
                            }))
                          }
                          className="rounded border border-border/50 bg-surface/45 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-accent"
                          title={String(preset.value)}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </SettingsField>

                  <SettingsField
                    {...compactFieldProps}
                    label={t(
                      "settings.modelConfigCenter.fields.maxOutput",
                      "最大输出 (Max Output)",
                    )}
                  >
                    <SettingsInput
                      type="number"
                      value={selectedModelEntry.maxTokens ?? ""}
                      onChange={(e) => {
                        const val = e.target.value
                          ? Number(e.target.value)
                          : undefined;
                        updateSelectedModelEntry((prev) => ({
                          ...prev,
                          maxTokens: val,
                        }));
                      }}
                      placeholder="e.g. 32768, 128000"
                      className="font-mono text-xs"
                    />
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {MAX_OUTPUT_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() =>
                            updateSelectedModelEntry((prev) => ({
                              ...prev,
                              maxTokens: preset.value,
                            }))
                          }
                          className="rounded border border-border/50 bg-surface/45 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-accent"
                          title={String(preset.value)}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </SettingsField>
                </div>
              </div>

              {/* Cost & Pricing */}
              <div className="space-y-2 pt-0.5">
                <div className="flex items-center justify-between gap-2 pb-1 border-b border-border/30">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <Coins className="h-3 w-3 settings-accent-fg" />
                    <span>
                      {t(
                        "settings.modelConfigCenter.sections.modelCost",
                        "成本定价 (每 1M Token 费用)",
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void fillSelectedModelPricing()}
                      disabled={
                        busy === "pricing-model" ||
                        !selectedModelEntry?.id?.trim()
                      }
                      className="inline-flex h-6 items-center gap-1 rounded-md border border-border/50 bg-background/50 px-2 text-[10px] font-medium text-foreground hover:border-accent/40 hover:text-accent transition-colors focus-ring disabled:opacity-50"
                    >
                      {busy === "pricing-model" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Coins className="h-3 w-3" />
                      )}
                      {t(
                        "settings.modelConfigCenter.actions.fillModelPricing",
                        "填充当前定价",
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void fillProviderPricing()}
                      disabled={
                        busy === "pricing-provider" || !selectedProvider
                      }
                      className="inline-flex h-6 items-center gap-1 rounded-md border border-border/50 bg-background/50 px-2 text-[10px] font-medium text-foreground hover:border-accent/40 hover:text-accent transition-colors focus-ring disabled:opacity-50"
                    >
                      {busy === "pricing-provider" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Library className="h-3 w-3" />
                      )}
                      {t(
                        "settings.modelConfigCenter.actions.fillProviderPricing",
                        "更新 Provider 定价",
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
                  <SettingsField
                    {...compactFieldProps}
                    label={t(
                      "settings.modelConfigCenter.fields.costInput",
                      "输入价格 ($)",
                    )}
                  >
                    <SettingsInput
                      type="number"
                      min={0}
                      step="0.0001"
                      value={clampCostValue(selectedModelEntry.cost?.input)}
                      onChange={(e) => updateCostField("input", e.target.value)}
                      placeholder="0"
                      className="font-mono text-xs"
                    />
                  </SettingsField>

                  <SettingsField
                    {...compactFieldProps}
                    label={t(
                      "settings.modelConfigCenter.fields.costOutput",
                      "输出价格 ($)",
                    )}
                  >
                    <SettingsInput
                      type="number"
                      min={0}
                      step="0.0001"
                      value={clampCostValue(selectedModelEntry.cost?.output)}
                      onChange={(e) =>
                        updateCostField("output", e.target.value)
                      }
                      placeholder="0"
                      className="font-mono text-xs"
                    />
                  </SettingsField>

                  <SettingsField
                    {...compactFieldProps}
                    label={t(
                      "settings.modelConfigCenter.fields.costCacheRead",
                      "缓存读取 ($)",
                    )}
                  >
                    <SettingsInput
                      type="number"
                      min={0}
                      step="0.0001"
                      value={clampCostValue(selectedModelEntry.cost?.cacheRead)}
                      onChange={(e) =>
                        updateCostField("cacheRead", e.target.value)
                      }
                      placeholder="0"
                      className="font-mono text-xs"
                    />
                  </SettingsField>

                  <SettingsField
                    {...compactFieldProps}
                    label={t(
                      "settings.modelConfigCenter.fields.costCacheWrite",
                      "缓存写入 ($)",
                    )}
                  >
                    <SettingsInput
                      type="number"
                      min={0}
                      step="0.0001"
                      value={clampCostValue(
                        selectedModelEntry.cost?.cacheWrite,
                      )}
                      onChange={(e) =>
                        updateCostField("cacheWrite", e.target.value)
                      }
                      placeholder="0"
                      className="font-mono text-xs"
                    />
                  </SettingsField>
                </div>
              </div>
            </div>
          )}

          {!selectedProvider && (
            <div className="py-16 text-center text-xs text-muted-foreground">
              {t(
                "settings.modelConfigCenter.empty.selectProviderToEdit",
                "请在左侧选择 Provider 以开始编辑",
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
