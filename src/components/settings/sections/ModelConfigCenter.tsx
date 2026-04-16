import { useEffect, useMemo, useState } from "react";
import {
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
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
import { invoke } from "@/transport";
import { useClipboard } from "@/hooks/useClipboard";
import SettingsCard from "@/components/settings/SettingsCard";
import SettingsField from "@/components/settings/SettingsField";
import SettingsInput from "@/components/settings/SettingsInput";
import SettingsSelect from "@/components/settings/SettingsSelect";
import SettingsTabs from "@/components/settings/SettingsTabs";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";

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
} from "./model-config/types";
import { EMPTY_CONFIG, MODEL_CONFIG_PATH, API_TYPE_OPTIONS } from "./model-config/types";

import {
  asModelConfigShape,
  asErrorMessage,
  formatBytes,
  serializeConfig,
  prettyConfig,
  splitInputTypes,
  createDefaultModel,
  createDefaultProvider,
  modelSelectionValue,
} from "./model-config/utils";
import { StatTile } from "./model-config/ui/StatTile";
import { StatusBanner } from "./model-config/ui/StatusBanner";
import { ModalShell } from "./model-config/ui/ModalShell";
import { ConfirmDialog } from "./model-config/ui/ConfirmDialog";

export default function ModelConfigCenter() {
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
  // Use index instead of ID for selected model, allowing users to create an empty model first and fill in the ID later.
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
      // Compare drafts using stable serialization results to avoid misjudgment caused by object references.
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
    pushFeedback(
      "success",
      t(
        "settings.modelConfigCenter.feedback.providerCreated",
        "Provider created: {{name}}",
        { name },
      ),
    );
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
