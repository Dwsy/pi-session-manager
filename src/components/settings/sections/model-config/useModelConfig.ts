import { useEffect, useMemo, useState } from "react";
import {
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { invoke } from "@/transport";
import { useClipboard } from "@/hooks/useClipboard";
import type {
  ModelConfigShape,
  ModelConfigBackupMeta,
  ConfigVersionMeta,
  ModelHttpTestResult,
  FeedbackState,
  ConfirmDialogState,
  ModelConfigMainTab,
  HistoryTab,
  ImportMode,
  ConfigDetailTab,
  ProviderEntry,
  ModelEntry,
  FeedbackTone,
  JsonValue,
} from "./types";
import { EMPTY_CONFIG } from "./types";
import {
  asModelConfigShape,
  asErrorMessage,
  serializeConfig,
  prettyConfig,
  createDefaultModel,
  createDefaultProvider,
  modelSelectionValue,
} from "./utils";
import {
  applyPriceMatches,
  buildModelEntryFromRemote,
  fetchModelsDevCatalog,
  findModelPrice,
  mergeCatalogModelsIntoProvider,
  mergeModelCost,
  type CatalogModelOption,
} from "./catalog";

export function useModelConfig() {
  const { t } = useTranslation();
  const { copyText, readText } = useClipboard();

  const [config, setConfig] = useState<ModelConfigShape>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [baselineSnapshot, setBaselineSnapshot] = useState(
    serializeConfig(EMPTY_CONFIG),
  );
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [providerNameDraft, setProviderNameDraft] = useState("");

  const [testPrompt, setTestPrompt] = useState("Please reply only with OK");
  const [testResult, setTestResult] = useState<ModelHttpTestResult | null>(
    null,
  );

  const [backups, setBackups] = useState<ModelConfigBackupMeta[]>([]);
  const [versions, setVersions] = useState<ConfigVersionMeta[]>([]);
  const [historyTab, setHistoryTab] = useState<HistoryTab>("backups");
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [mainTab, setMainTab] = useState<ModelConfigMainTab>("configure");
  const [configDetailTab, setConfigDetailTab] =
    useState<ConfigDetailTab>("model");

  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [providerModalMode, setProviderModalMode] = useState<"create" | "copy">(
    "create",
  );
  const [copySourceProvider, setCopySourceProvider] = useState("");
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showRemoteModelsModal, setShowRemoteModelsModal] = useState(false);
  const [newProviderName, setNewProviderName] = useState("");

  const [showImportModal, setShowImportModal] = useState(false);
  const [importContentDraft, setImportContentDraft] = useState("");

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(
    null,
  );
  const [confirmingDialog, setConfirmingDialog] = useState(false);

  const providerNames = useMemo(
    () => Object.keys(config.providers).sort((a, b) => a.localeCompare(b)),
    [config.providers],
  );

  const currentSnapshot = useMemo(() => serializeConfig(config), [config]);
  const isDirty = currentSnapshot !== baselineSnapshot;

  const totalModels = useMemo(() => {
    return Object.values(config.providers).reduce(
      (sum, provider) => sum + (provider.models?.length ?? 0),
      0,
    );
  }, [config.providers]);

  const selectedProviderEntry = selectedProvider
    ? config.providers[selectedProvider]
    : undefined;
  const selectedProviderModels = selectedProviderEntry?.models ?? [];
  const selectedModelIndex = Number.parseInt(selectedModel, 10);
  const selectedModelEntry = Number.isInteger(selectedModelIndex)
    ? selectedProviderModels[selectedModelIndex]
    : undefined;
  const activeModelLabel = selectedModelEntry
    ? selectedModelEntry.name?.trim() ||
      selectedModelEntry.id?.trim() ||
      t("settings.modelConfigCenter.status.unnamedModel", "Unnamed Model")
    : "";

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!selectedProvider || !config.providers[selectedProvider]) {
      const firstProvider = providerNames[0] ?? "";
      if (selectedProvider !== firstProvider) {
        setSelectedProvider(firstProvider);
      }
      if (!firstProvider && selectedModel !== "") {
        setSelectedModel("");
      }
      return;
    }

    if (selectedProviderModels.length === 0) {
      if (selectedModel !== "") {
        setSelectedModel("");
      }
      return;
    }

    if (
      !Number.isInteger(selectedModelIndex) ||
      selectedModelIndex < 0 ||
      selectedModelIndex >= selectedProviderModels.length
    ) {
      setSelectedModel("0");
    }
  }, [
    config.providers,
    providerNames,
    selectedModel,
    selectedModelIndex,
    selectedProvider,
    selectedProviderModels,
  ]);

  useEffect(() => {
    setProviderNameDraft(selectedProvider);
  }, [selectedProvider]);

  useEffect(() => {
    setTestResult(null);
  }, [selectedProvider, selectedModel]);

  useEffect(() => {
    if (
      !feedback ||
      (feedback.tone !== "success" && feedback.tone !== "info")
    ) {
      return undefined;
    }

    const timer = window.setTimeout(() => setFeedback(null), 3200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  async function loadAll(options: { showSpinner?: boolean } = {}) {
    const { showSpinner = true } = options;
    if (showSpinner) {
      setLoading(true);
    }

    try {
      const previousProvider = selectedProvider;
      const previousModel = selectedModel;
      const [cfg, backupItems, versionItems] = await Promise.all([
        invoke<JsonValue>("load_model_config"),
        invoke<ModelConfigBackupMeta[]>("list_model_config_backups"),
        invoke<ConfigVersionMeta[]>("list_model_config_versions"),
      ]);

      const parsed = asModelConfigShape(cfg);
      const nextProviderNames = Object.keys(parsed.providers).sort((a, b) =>
        a.localeCompare(b),
      );
      const nextProvider =
        previousProvider && parsed.providers[previousProvider]
          ? previousProvider
          : (nextProviderNames[0] ?? "");
      const nextModels = parsed.providers[nextProvider]?.models ?? [];
      const previousModelIndex = Number.parseInt(previousModel, 10);
      const nextModel =
        Number.isInteger(previousModelIndex) && nextModels[previousModelIndex]
          ? previousModel
          : nextModels.length > 0
            ? "0"
            : "";

      setConfig(parsed);
      setBackups(backupItems);
      setVersions(versionItems);
      setBaselineSnapshot(serializeConfig(parsed));
      setSelectedProvider(nextProvider);
      setSelectedModel(nextModel);
    } catch (error) {
      console.error("Failed to load model config center:", error);
      setFeedback({
        tone: "error",
        message: t(
          "settings.modelConfigCenter.feedback.loadFailed",
          "Failed to load model config: {{reason}}",
          {
            reason: asErrorMessage(error),
          },
        ),
      });
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  }

  function pushFeedback(tone: FeedbackTone, message: string) {
    setFeedback({ tone, message });
  }

  function openConfirm(dialog: ConfirmDialogState) {
    setConfirmDialog(dialog);
  }

  function guardUnsaved(
    description: string,
    onConfirm: () => void | Promise<void>,
  ) {
    if (!isDirty) {
      void onConfirm();
      return;
    }

    openConfirm({
      title: t(
        "settings.modelConfigCenter.dialogs.unsavedTitle",
        "Discard unsaved changes?",
      ),
      description,
      confirmLabel: t(
        "settings.modelConfigCenter.actions.continue",
        "Continue",
      ),
      tone: "warning",
      onConfirm,
    });
  }

  async function handleConfirmDialog() {
    if (!confirmDialog || confirmingDialog) return;
    const currentDialog = confirmDialog;
    setConfirmingDialog(true);
    setConfirmDialog(null);

    try {
      await currentDialog.onConfirm();
    } catch (error) {
      console.error("Confirm dialog action failed:", error);
      pushFeedback("error", asErrorMessage(error));
    } finally {
      setConfirmingDialog(false);
    }
  }

  function updateSelectedProviderEntry(
    updater: (provider: ProviderEntry) => ProviderEntry,
  ) {
    if (!selectedProvider) return;

    setConfig((prev) => {
      const currentProvider = prev.providers[selectedProvider];
      if (!currentProvider) return prev;

      return {
        ...prev,
        providers: {
          ...prev.providers,
          [selectedProvider]: updater(currentProvider),
        },
      };
    });
  }

  function updateSelectedModelEntry(
    updater: (model: ModelEntry) => ModelEntry,
  ) {
    if (
      !selectedProvider ||
      !Number.isInteger(selectedModelIndex) ||
      !selectedProviderModels[selectedModelIndex]
    ) {
      return;
    }

    setConfig((prev) => {
      const currentProvider = prev.providers[selectedProvider];
      if (!currentProvider) return prev;
      const nextModels = [...(currentProvider.models ?? [])];
      if (!nextModels[selectedModelIndex]) return prev;

      nextModels[selectedModelIndex] = updater(nextModels[selectedModelIndex]);

      return {
        ...prev,
        providers: {
          ...prev.providers,
          [selectedProvider]: {
            ...currentProvider,
            models: nextModels,
          },
        },
      };
    });
  }

  function commitProviderRename() {
    if (!selectedProvider) return;
    const nextName = providerNameDraft.trim();

    if (!nextName) {
      setProviderNameDraft(selectedProvider);
      pushFeedback(
        "warning",
        t(
          "settings.modelConfigCenter.feedback.providerNameRequired",
          "Provider name cannot be empty",
        ),
      );
      return;
    }

    if (nextName === selectedProvider) {
      return;
    }

    if (config.providers[nextName]) {
      setProviderNameDraft(selectedProvider);
      pushFeedback(
        "error",
        t(
          "settings.modelConfigCenter.feedback.providerNameExists",
          "Provider name already exists: {{name}}",
          {
            name: nextName,
          },
        ),
      );
      return;
    }

    setConfig((prev) => {
      const nextProviders: Record<string, ProviderEntry> = {};
      for (const key of Object.keys(prev.providers)) {
        nextProviders[key === selectedProvider ? nextName : key] =
          prev.providers[key];
      }
      return { ...prev, providers: nextProviders };
    });
    setSelectedProvider(nextName);
    pushFeedback(
      "success",
      t(
        "settings.modelConfigCenter.feedback.providerRenamed",
        "Provider renamed to {{name}}",
        {
          name: nextName,
        },
      ),
    );
  }

  function uniqueProviderName(base: string): string {
    let nextName = base;
    let suffix = 2;
    while (config.providers[nextName]) {
      nextName = `${base}-${suffix}`;
      suffix += 1;
    }
    return nextName;
  }

  function openAddProviderModal() {
    setProviderModalMode("create");
    setCopySourceProvider("");
    setNewProviderName("");
    setShowAddProviderModal(true);
  }

  function openCopyProviderModal(providerName: string) {
    if (!config.providers[providerName]) return;
    setProviderModalMode("copy");
    setCopySourceProvider(providerName);
    setNewProviderName(uniqueProviderName(`${providerName}-copy`));
    setShowAddProviderModal(true);
  }

  function handleCreateProvider() {
    const name = newProviderName.trim();
    if (!name) {
      pushFeedback(
        "warning",
        t(
          "settings.modelConfigCenter.feedback.providerNameRequired",
          "Provider name cannot be empty",
        ),
      );
      return;
    }

    if (config.providers[name]) {
      pushFeedback(
        "error",
        t(
          "settings.modelConfigCenter.feedback.providerNameExists",
          "Provider name already exists: {{name}}",
          {
            name,
          },
        ),
      );
      return;
    }

    const nextProvider = createDefaultProvider();
    setConfig((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [name]: nextProvider,
      },
    }));
    setSelectedProvider(name);
    setSelectedModel("0");
    setMainTab("configure");
    setConfigDetailTab("provider");
    setShowAddProviderModal(false);
    setNewProviderName("");
    setProviderModalMode("create");
    setCopySourceProvider("");
    pushFeedback(
      "success",
      t(
        "settings.modelConfigCenter.feedback.providerCreated",
        "Provider created: {{name}}",
        { name },
      ),
    );
  }

  function handleCopyProviderConfirm() {
    const sourceName = copySourceProvider;
    const source = config.providers[sourceName];
    if (!source) {
      setShowAddProviderModal(false);
      return;
    }

    const name = newProviderName.trim();
    if (!name) {
      pushFeedback(
        "warning",
        t(
          "settings.modelConfigCenter.feedback.providerNameRequired",
          "Provider name cannot be empty",
        ),
      );
      return;
    }

    if (config.providers[name]) {
      pushFeedback(
        "error",
        t(
          "settings.modelConfigCenter.feedback.providerNameExists",
          "Provider name already exists: {{name}}",
          { name },
        ),
      );
      return;
    }

    const cloned = JSON.parse(JSON.stringify(source)) as ProviderEntry;
    setConfig((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [name]: cloned,
      },
    }));
    setSelectedProvider(name);
    setSelectedModel("0");
    setMainTab("configure");
    setConfigDetailTab("provider");
    setShowAddProviderModal(false);
    setNewProviderName("");
    setProviderModalMode("create");
    setCopySourceProvider("");
    pushFeedback(
      "success",
      t(
        "settings.modelConfigCenter.feedback.providerCopied",
        "Provider copied: {{from}} → {{to}}",
        { from: sourceName, to: name },
      ),
    );
  }

  function handleProviderModalConfirm() {
    if (providerModalMode === "copy") handleCopyProviderConfirm();
    else handleCreateProvider();
  }

  function requestDeleteProvider(providerName: string) {
    openConfirm({
      title: t(
        "settings.modelConfigCenter.dialogs.deleteProviderTitle",
        "Delete Provider?",
      ),
      description: t(
        "settings.modelConfigCenter.dialogs.deleteProviderDesc",
        'This will remove Provider "{{name}}" and all its models from the current draft.',
        {
          name: providerName,
        },
      ),
      confirmLabel: t("settings.modelConfigCenter.actions.delete", "Delete"),
      tone: "danger",
      onConfirm: () => {
        setConfig((prev) => {
          const nextProviders = { ...prev.providers };
          delete nextProviders[providerName];
          return { ...prev, providers: nextProviders };
        });
        if (selectedProvider === providerName) {
          setSelectedProvider("");
          setSelectedModel("");
        }
        pushFeedback(
          "success",
          t(
            "settings.modelConfigCenter.feedback.providerDeleted",
            "Provider removed: {{name}}",
            {
              name: providerName,
            },
          ),
        );
      },
    });
  }

  function addModel() {
    if (!selectedProvider) return;
    const nextIndex = selectedProviderModels.length;
    updateSelectedProviderEntry((provider) => ({
      ...provider,
      models: [...(provider.models ?? []), createDefaultModel()],
    }));
    setSelectedModel(modelSelectionValue(nextIndex));
    setMainTab("configure");
    setConfigDetailTab("model");
    pushFeedback(
      "info",
      t(
        "settings.modelConfigCenter.feedback.modelCreated",
        "New model draft added",
      ),
    );
  }

  function openCatalogBrowser() {
    if (!selectedProvider) {
      pushFeedback(
        "warning",
        t(
          "settings.modelConfigCenter.feedback.selectProviderFirst",
          "Select a provider first",
        ),
      );
      return;
    }
    setShowCatalogModal(true);
  }

  function openRemoteModelsBrowser() {
    if (!selectedProvider) {
      pushFeedback(
        "warning",
        t(
          "settings.modelConfigCenter.feedback.selectProviderFirst",
          "Select a provider first",
        ),
      );
      return;
    }
    if (!selectedProviderEntry?.baseUrl?.trim()) {
      pushFeedback(
        "warning",
        t(
          "settings.modelConfigCenter.feedback.remoteModelsNeedBaseUrl",
          "Current provider needs a Base URL first",
        ),
      );
      setConfigDetailTab("provider");
      return;
    }
    setShowRemoteModelsModal(true);
  }

  async function addModelsFromRemote(
    selected: Array<{ id: string; name?: string | null }>,
  ) {
    if (!selectedProvider || selected.length === 0) {
      setShowRemoteModelsModal(false);
      return;
    }

    setBusy("remote-models-add");
    try {
      let catalog = null as Awaited<
        ReturnType<typeof fetchModelsDevCatalog>
      > | null;
      try {
        catalog = await fetchModelsDevCatalog();
      } catch (error) {
        console.warn("models.dev enrich skipped:", error);
      }

      const existingIds = new Set(
        selectedProviderModels
          .map((model) => model.id.trim().toLowerCase())
          .filter(Boolean),
      );

      const nextModels = [...selectedProviderModels];
      let added = 0;
      let skipped = 0;
      let enriched = 0;

      for (const item of selected) {
        const id = item.id?.trim() ?? "";
        if (!id) {
          skipped += 1;
          continue;
        }
        const key = id.toLowerCase();
        if (existingIds.has(key)) {
          skipped += 1;
          continue;
        }

        if (catalog) {
          const built = buildModelEntryFromRemote(
            item,
            catalog,
            selectedProvider,
          );
          nextModels.push(built.model);
          if (built.enriched) enriched += 1;
        } else {
          nextModels.push({
            ...createDefaultModel(),
            id,
            name: item.name?.trim() || id,
          });
        }
        existingIds.add(key);
        added += 1;
      }

      updateSelectedProviderEntry((provider) => ({
        ...provider,
        models: nextModels,
      }));

      if (added > 0) {
        const firstNewIndex = Math.max(0, nextModels.length - added);
        setSelectedModel(modelSelectionValue(firstNewIndex));
        setConfigDetailTab("model");
      }

      setShowRemoteModelsModal(false);
      pushFeedback(
        added > 0 ? "success" : "info",
        t(
          "settings.modelConfigCenter.feedback.remoteModelsAdded",
          "Added {{added}} model(s) from provider API (skipped {{skipped}}, enriched {{enriched}})",
          { added, skipped, enriched },
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  function addModelsFromCatalog(selected: CatalogModelOption[]) {
    if (!selectedProvider || selected.length === 0) {
      setShowCatalogModal(false);
      return;
    }

    const { models, added, skipped } = mergeCatalogModelsIntoProvider(
      selectedProviderModels,
      selected,
    );

    updateSelectedProviderEntry((provider) => ({
      ...provider,
      models,
    }));

    if (added > 0) {
      const firstNewIndex = Math.max(0, models.length - added);
      setSelectedModel(modelSelectionValue(firstNewIndex));
      setConfigDetailTab("model");
    }

    setShowCatalogModal(false);
    pushFeedback(
      added > 0 ? "success" : "info",
      t(
        "settings.modelConfigCenter.feedback.catalogModelsAdded",
        "Added {{added}} model(s) from models.dev (skipped {{skipped}})",
        { added, skipped },
      ),
    );
  }

  async function fillSelectedModelPricing() {
    if (!selectedProvider || !selectedModelEntry?.id?.trim()) {
      pushFeedback(
        "warning",
        t(
          "settings.modelConfigCenter.feedback.pricingNeedModelId",
          "Current model needs a valid ID before pricing can be filled",
        ),
      );
      return;
    }

    const modelId = selectedModelEntry.id;
    setBusy("pricing-model");
    try {
      const catalog = await fetchModelsDevCatalog();
      let match = findModelPrice(catalog, modelId, {
        preferredProviderId: selectedProvider,
        allowFuzzy: false,
      });

      if (!match) {
        const fuzzy = findModelPrice(catalog, modelId, {
          preferredProviderId: selectedProvider,
          allowFuzzy: true,
        });
        if (!fuzzy) {
          pushFeedback(
            "warning",
            t(
              "settings.modelConfigCenter.feedback.pricingNotFound",
              "No pricing match found for {{id}}",
              { id: modelId },
            ),
          );
          return;
        }

        openConfirm({
          title: t(
            "settings.modelConfigCenter.dialogs.pricingFuzzyTitle",
            "Use fuzzy pricing match?",
          ),
          description: t(
            "settings.modelConfigCenter.dialogs.pricingFuzzyDesc",
            'No exact match for "{{id}}". Apply fuzzy match "{{matched}}" ({{similarity}}% similar)?',
            {
              id: modelId,
              matched: fuzzy.matchedApiId,
              similarity: Math.round(fuzzy.similarity * 100),
            },
          ),
          confirmLabel: t(
            "settings.modelConfigCenter.actions.applyFuzzyPricing",
            "Apply fuzzy match",
          ),
          tone: "warning",
          onConfirm: () => {
            updateSelectedModelEntry((model) => ({
              ...model,
              cost: mergeModelCost(model.cost, fuzzy.cost),
            }));
            pushFeedback(
              "success",
              t(
                "settings.modelConfigCenter.feedback.pricingModelUpdated",
                "Filled pricing for {{id}} via {{matched}} ({{matchType}})",
                {
                  id: modelId,
                  matched: fuzzy.matchedApiId,
                  matchType: fuzzy.matchType,
                },
              ),
            );
          },
        });
        return;
      }

      updateSelectedModelEntry((model) => ({
        ...model,
        cost: mergeModelCost(model.cost, match.cost),
      }));
      pushFeedback(
        "success",
        t(
          "settings.modelConfigCenter.feedback.pricingModelUpdated",
          "Filled pricing for {{id}} via {{matched}} ({{matchType}})",
          {
            id: modelId,
            matched: match.matchedApiId,
            matchType: match.matchType,
          },
        ),
      );
    } catch (error) {
      console.error("Fill model pricing failed:", error);
      pushFeedback(
        "error",
        t(
          "settings.modelConfigCenter.feedback.pricingFailed",
          "Failed to fetch pricing: {{reason}}",
          { reason: asErrorMessage(error) },
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  async function fillProviderPricing() {
    if (!selectedProvider) {
      pushFeedback(
        "warning",
        t(
          "settings.modelConfigCenter.feedback.selectProviderFirst",
          "Select a provider first",
        ),
      );
      return;
    }

    if (selectedProviderModels.length === 0) {
      pushFeedback(
        "warning",
        t(
          "settings.modelConfigCenter.feedback.pricingNoModels",
          "Current provider has no models to update",
        ),
      );
      return;
    }

    setBusy("pricing-provider");
    try {
      const catalog = await fetchModelsDevCatalog();
      // Provider batch update stays exact/normalized only to avoid silent mispricing.
      const result = applyPriceMatches(
        selectedProviderModels,
        catalog,
        selectedProvider,
        { allowFuzzy: false },
      );

      updateSelectedProviderEntry((provider) => ({
        ...provider,
        models: result.models,
      }));

      pushFeedback(
        result.updated > 0 ? "success" : "warning",
        t(
          "settings.modelConfigCenter.feedback.pricingProviderUpdated",
          "Updated pricing for {{updated}}/{{total}} models (unmatched {{unmatched}}; exact/normalized only)",
          {
            updated: result.updated,
            total: selectedProviderModels.length,
            unmatched: result.unmatched.length,
          },
        ),
      );
    } catch (error) {
      console.error("Fill provider pricing failed:", error);
      pushFeedback(
        "error",
        t(
          "settings.modelConfigCenter.feedback.pricingFailed",
          "Failed to fetch pricing: {{reason}}",
          { reason: asErrorMessage(error) },
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  function requestDeleteModel(index: number) {
    if (!selectedProvider) return;
    const currentModel = selectedProviderModels[index];
    const modelLabel =
      currentModel?.name?.trim() ||
      currentModel?.id?.trim() ||
      t("settings.modelConfigCenter.status.unnamedModel", "Unnamed Model");

    openConfirm({
      title: t(
        "settings.modelConfigCenter.dialogs.deleteModelTitle",
        "Delete model?",
      ),
      description: t(
        "settings.modelConfigCenter.dialogs.deleteModelDesc",
        'This will remove model "{{name}}" from the current draft.',
        {
          name: modelLabel,
        },
      ),
      confirmLabel: t("settings.modelConfigCenter.actions.delete", "Delete"),
      tone: "danger",
      onConfirm: () => {
        updateSelectedProviderEntry((provider) => ({
          ...provider,
          models: (provider.models ?? []).filter(
            (_, modelIndex) => modelIndex !== index,
          ),
        }));
        pushFeedback(
          "success",
          t(
            "settings.modelConfigCenter.feedback.modelRemoved",
            'Model "{{name}}" removed',
            {
              name: modelLabel,
            },
          ),
        );
      },
    });
  }

  function requestDeleteModelById(modelId: string) {
    requestDeleteModelsByIds([modelId]);
  }

  function requestDeleteModelsByIds(modelIds: string[]) {
    if (!selectedProvider || modelIds.length === 0) return;

    const keySet = new Set(
      modelIds.map((id) => id.trim().toLowerCase()).filter(Boolean),
    );
    if (keySet.size === 0) return;

    const targets = selectedProviderModels.filter((model) =>
      keySet.has(model.id.trim().toLowerCase()),
    );
    if (targets.length === 0) return;

    const labels = targets.map(
      (model) =>
        model.name?.trim() ||
        model.id?.trim() ||
        t("settings.modelConfigCenter.status.unnamedModel", "Unnamed Model"),
    );
    const preview =
      labels.length <= 3
        ? labels.join(", ")
        : `${labels.slice(0, 3).join(", ")}… (+${labels.length - 3})`;

    openConfirm({
      title: t(
        "settings.modelConfigCenter.dialogs.deleteModelsTitle",
        "删除 {{count}} 个模型？",
        { count: targets.length },
      ),
      description: t(
        "settings.modelConfigCenter.dialogs.deleteModelsDesc",
        "这会从当前草稿中移除：{{names}}",
        { names: preview },
      ),
      confirmLabel: t("settings.modelConfigCenter.actions.delete", "Delete"),
      tone: "danger",
      onConfirm: () => {
        const removeKeys = new Set(
          targets.map((model) => model.id.trim().toLowerCase()),
        );
        updateSelectedProviderEntry((provider) => ({
          ...provider,
          models: (provider.models ?? []).filter(
            (model) => !removeKeys.has(model.id.trim().toLowerCase()),
          ),
        }));
        pushFeedback(
          "success",
          t(
            "settings.modelConfigCenter.feedback.modelsRemoved",
            "已移除 {{count}} 个模型",
            { count: targets.length },
          ),
        );
      },
    });
  }

  async function saveConfig() {
    setSaving(true);
    try {
      await invoke("save_model_config", {
        content: config,
        createBackup: true,
      });
      await loadAll({ showSpinner: false });
      pushFeedback(
        "success",
        t(
          "settings.modelConfigCenter.feedback.saveSuccess",
          "Model configuration saved",
        ),
      );
    } catch (error) {
      console.error("Save model config failed:", error);
      pushFeedback(
        "error",
        t(
          "settings.modelConfigCenter.feedback.saveFailed",
          "Save failed: {{reason}}",
          {
            reason: asErrorMessage(error),
          },
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  function refreshConfig() {
    guardUnsaved(
      t(
        "settings.modelConfigCenter.dialogs.unsavedDescRefresh",
        "Refreshing will discard current unsaved changes and reload disk content.",
      ),
      async () => {
        setBusy("refresh");
        try {
          await loadAll({ showSpinner: false });
        } finally {
          setBusy(null);
        }
      },
    );
  }

  async function createBackup() {
    setBusy("backup");
    try {
      await invoke("create_model_config_backup", {
        note: "manual backup from model config center",
      });
      await loadAll({ showSpinner: false });
      pushFeedback(
        "success",
        t(
          "settings.modelConfigCenter.feedback.backupCreated",
          "Configuration backup created",
        ),
      );
    } catch (error) {
      pushFeedback(
        "error",
        t(
          "settings.modelConfigCenter.feedback.backupCreateFailed",
          "Failed to create backup: {{reason}}",
          {
            reason: asErrorMessage(error),
          },
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  async function exportToPath() {
    try {
      const pathValue = await saveDialog({
        title: "Export models.json",
        defaultPath: "models.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!pathValue) return;
      await invoke("export_model_config_to_path", { path: pathValue });
      pushFeedback(
        "success",
        t(
          "settings.modelConfigCenter.feedback.exportSuccess",
          "Exported to {{path}}",
          { path: pathValue },
        ),
      );
    } catch (error) {
      pushFeedback(
        "error",
        t(
          "settings.modelConfigCenter.feedback.exportFailed",
          "Export failed: {{reason}}",
          {
            reason: asErrorMessage(error),
          },
        ),
      );
    }
  }

  async function copyDraftJson() {
    try {
      await copyText(prettyConfig(config));
      pushFeedback(
        "success",
        t(
          "settings.modelConfigCenter.feedback.copySuccess",
          "Current draft JSON copied",
        ),
      );
    } catch (error) {
      pushFeedback(
        "error",
        t(
          "settings.modelConfigCenter.feedback.copyFailed",
          "Copy failed: {{reason}}",
          {
            reason: asErrorMessage(error),
          },
        ),
      );
    }
  }

  function openImportContentModal() {
    guardUnsaved(
      t(
        "settings.modelConfigCenter.dialogs.unsavedDescImport",
        "Importing will overwrite current draft state, please save first or confirm to discard unsaved changes.",
      ),
      () => {
        setImportContentDraft("");
        setShowImportModal(true);
      },
    );
  }

  function importFromPath() {
    guardUnsaved(
      t(
        "settings.modelConfigCenter.dialogs.unsavedDescImport",
        "Importing will overwrite current draft state, please save first or confirm to discard unsaved changes.",
      ),
      async () => {
        const selected = await openDialog({
          title: "Import model config",
          multiple: false,
          filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (!selected || typeof selected !== "string") return;

        setBusy("import-file");
        try {
          await invoke("import_model_config_from_path", {
            path: selected,
            mode: importMode,
          });
          await loadAll({ showSpinner: false });
          pushFeedback(
            "success",
            t(
              "settings.modelConfigCenter.feedback.importSuccess",
              "Model configuration imported",
            ),
          );
        } catch (error) {
          pushFeedback(
            "error",
            t(
              "settings.modelConfigCenter.feedback.importFailed",
              "Import failed: {{reason}}",
              {
                reason: asErrorMessage(error),
              },
            ),
          );
        } finally {
          setBusy(null);
        }
      },
    );
  }

  async function pasteClipboardToImport() {
    try {
      const clipboardText = await readText();
      setImportContentDraft(clipboardText);
    } catch (error) {
      pushFeedback(
        "error",
        t(
          "settings.modelConfigCenter.feedback.clipboardFailed",
          "Failed to read clipboard: {{reason}}",
          {
            reason: asErrorMessage(error),
          },
        ),
      );
    }
  }

  async function importFromContent() {
    const content = importContentDraft.trim();
    if (!content) {
      pushFeedback(
        "warning",
        t(
          "settings.modelConfigCenter.feedback.importInvalidJson",
          "Please enter valid JSON content",
        ),
      );
      return;
    }

    try {
      JSON.parse(content);
    } catch {
      pushFeedback(
        "error",
        t(
          "settings.modelConfigCenter.feedback.importInvalidJson",
          "Please enter valid JSON content",
        ),
      );
      return;
    }

    setBusy("import-content");
    try {
      await invoke("import_model_config_content", {
        content,
        mode: importMode,
      });
      setShowImportModal(false);
      await loadAll({ showSpinner: false });
      pushFeedback(
        "success",
        t(
          "settings.modelConfigCenter.feedback.importSuccess",
          "Model configuration imported",
        ),
      );
    } catch (error) {
      pushFeedback(
        "error",
        t(
          "settings.modelConfigCenter.feedback.importFailed",
          "Import failed: {{reason}}",
          {
            reason: asErrorMessage(error),
          },
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  function requestRestoreBackup(backupId: string) {
    const confirmRestore = () => {
      openConfirm({
        title: t(
          "settings.modelConfigCenter.dialogs.restoreBackupTitle",
          "Restore this backup?",
        ),
        description: t(
          "settings.modelConfigCenter.dialogs.restoreBackupDesc",
          "A new backup will be automatically created for the current configuration after restoration.",
        ),
        confirmLabel: t("settings.modelConfigCenter.actions.restore", "Resume"),
        tone: "warning",
        onConfirm: async () => {
          setBusy(`restore-${backupId}`);
          try {
            await invoke("restore_model_config_backup", { id: backupId });
            await loadAll({ showSpinner: false });
            pushFeedback(
              "success",
              t(
                "settings.modelConfigCenter.feedback.backupRestored",
                "Backup restored",
              ),
            );
          } catch (error) {
            pushFeedback(
              "error",
              t(
                "settings.modelConfigCenter.feedback.backupRestoreFailed",
                "Failed to restore backup: {{reason}}",
                {
                  reason: asErrorMessage(error),
                },
              ),
            );
          } finally {
            setBusy(null);
          }
        },
      });
    };

    guardUnsaved(
      t(
        "settings.modelConfigCenter.dialogs.unsavedDescRestore",
        "Restoration will overwrite current draft content, please save first or confirm to discard unsaved changes.",
      ),
      confirmRestore,
    );
  }

  function requestDeleteBackup(backupId: string) {
    openConfirm({
      title: t(
        "settings.modelConfigCenter.dialogs.deleteBackupTitle",
        "Delete this backup?",
      ),
      description: t(
        "settings.modelConfigCenter.dialogs.deleteBackupDesc",
        "This backup file cannot be recovered after deletion.",
      ),
      confirmLabel: t("settings.modelConfigCenter.actions.delete", "Delete"),
      tone: "danger",
      onConfirm: async () => {
        setBusy(`delete-${backupId}`);
        try {
          await invoke("delete_model_config_backup", { id: backupId });
          await loadAll({ showSpinner: false });
          pushFeedback(
            "success",
            t(
              "settings.modelConfigCenter.feedback.backupDeleted",
              "Backup deleted",
            ),
          );
        } catch (error) {
          pushFeedback(
            "error",
            t(
              "settings.modelConfigCenter.feedback.backupDeleteFailed",
              "Failed to delete backup: {{reason}}",
              {
                reason: asErrorMessage(error),
              },
            ),
          );
        } finally {
          setBusy(null);
        }
      },
    });
  }

  function requestRestoreVersion(versionId: number) {
    const confirmRestore = () => {
      openConfirm({
        title: t(
          "settings.modelConfigCenter.dialogs.restoreVersionTitle",
          "Restore this version?",
        ),
        description: t(
          "settings.modelConfigCenter.dialogs.restoreVersionDesc",
          "This will revert the current configuration to the selected historical version.",
        ),
        confirmLabel: t("settings.modelConfigCenter.actions.restore", "Resume"),
        tone: "warning",
        onConfirm: async () => {
          setBusy(`version-${versionId}`);
          try {
            await invoke("restore_config_version", { id: versionId });
            await loadAll({ showSpinner: false });
            pushFeedback(
              "success",
              t(
                "settings.modelConfigCenter.feedback.versionRestored",
                "Restored to version #{{id}}",
                {
                  id: versionId,
                },
              ),
            );
          } catch (error) {
            pushFeedback(
              "error",
              t(
                "settings.modelConfigCenter.feedback.versionRestoreFailed",
                "Failed to restore version: {{reason}}",
                {
                  reason: asErrorMessage(error),
                },
              ),
            );
          } finally {
            setBusy(null);
          }
        },
      });
    };

    guardUnsaved(
      t(
        "settings.modelConfigCenter.dialogs.unsavedDescRestore",
        "Restoration will overwrite current draft content, please save first or confirm to discard unsaved changes.",
      ),
      confirmRestore,
    );
  }

  async function runHttpTest() {
    if (!selectedProvider || !selectedModelEntry?.id?.trim()) return;

    setBusy("http-test");
    setTestResult(null);
    try {
      const result = await invoke<ModelHttpTestResult>("test_model_http", {
        provider: selectedProvider,
        model: selectedModelEntry.id.trim(),
        prompt: testPrompt,
        timeoutMs: 20000,
      });
      setTestResult(result);
    } catch (error) {
      pushFeedback(
        "error",
        t(
          "settings.modelConfigCenter.feedback.httpTestFailed",
          "HTTP test failed: {{reason}}",
          {
            reason: asErrorMessage(error),
          },
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  async function copyCurlCommand() {
    if (!testResult) return;
    try {
      await copyText(testResult.curlCommand);
      pushFeedback(
        "success",
        t("settings.modelConfigCenter.feedback.curlCopied", "cURL copied"),
      );
    } catch (error) {
      pushFeedback(
        "error",
        t(
          "settings.modelConfigCenter.feedback.copyFailed",
          "Copy failed: {{reason}}",
          {
            reason: asErrorMessage(error),
          },
        ),
      );
    }
  }

  return {
    config,
    setConfig,
    loading,
    saving,
    busy,
    isDirty,
    feedback,
    setFeedback,
    pushFeedback,
    selectedProvider,
    setSelectedProvider,
    selectedModel,
    setSelectedModel,
    providerNameDraft,
    setProviderNameDraft,
    testPrompt,
    setTestPrompt,
    testResult,
    setTestResult,
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
    providerModalMode,
    copySourceProvider,
    openAddProviderModal,
    openCopyProviderModal,
    handleProviderModalConfirm,
    showCatalogModal,
    setShowCatalogModal,
    showRemoteModelsModal,
    setShowRemoteModelsModal,
    newProviderName,
    setNewProviderName,
    showImportModal,
    setShowImportModal,
    importContentDraft,
    setImportContentDraft,
    confirmDialog,
    setConfirmDialog,
    confirmingDialog,
    setConfirmingDialog,
    providerNames,
    totalModels,
    selectedProviderEntry,
    selectedProviderModels,
    selectedModelIndex,
    selectedModelEntry,
    activeModelLabel,
    loadAll,
    openConfirm,
    guardUnsaved,
    handleConfirmDialog,
    updateSelectedProviderEntry,
    updateSelectedModelEntry,
    commitProviderRename,
    handleCreateProvider,
    requestDeleteProvider,
    addModel,
    openCatalogBrowser,
    openRemoteModelsBrowser,
    addModelsFromCatalog,
    addModelsFromRemote,
    fillSelectedModelPricing,
    fillProviderPricing,
    requestDeleteModel,
    requestDeleteModelById,
    requestDeleteModelsByIds,
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
    t,
  };
}
