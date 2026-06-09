import { useTranslation } from "react-i18next";
import {
  FileJson,
  FlaskConical,
  History,
  Loader2,
  RefreshCw,
  Save,
  Server,
  Upload,
} from "lucide-react";
import SettingsCard from "@/components/settings/SettingsCard";
import SettingsTabs from "@/components/settings/SettingsTabs";

import { MODEL_CONFIG_PATH } from "./types";
import { useModelConfig } from "./useModelConfig";
import { StatTile } from "./ui/StatTile";
import { StatusBanner } from "./ui/StatusBanner";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { AddProviderModal } from "./modals/AddProviderModal";
import { ImportModal } from "./modals/ImportModal";
import { HistoryTab } from "./tabs/HistoryTab";
import { ToolsTab } from "./tabs/ToolsTab";
import { TestTab } from "./tabs/TestTab";
import { ConfigureTab } from "./tabs/ConfigureTab";

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
                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "bg-green-500/10 text-green-700 dark:text-green-300"
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

            <div className="grid grid-cols-3 gap-3">
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
          <ConfigureTab
            providerNames={providerNames}
            config={config}
            selectedProvider={selectedProvider}
            setSelectedProvider={setSelectedProvider}
            setConfigDetailTab={setConfigDetailTab}
            requestDeleteProvider={requestDeleteProvider}
            setShowAddProviderModal={setShowAddProviderModal}
            selectedProviderModels={selectedProviderModels}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            addModel={addModel}
            selectedProviderEntry={selectedProviderEntry}
            providerNameDraft={providerNameDraft}
            setProviderNameDraft={setProviderNameDraft}
            commitProviderRename={commitProviderRename}
            updateSelectedProviderEntry={updateSelectedProviderEntry}
            selectedModelEntry={selectedModelEntry}
            activeModelLabel={activeModelLabel}
            updateSelectedModelEntry={updateSelectedModelEntry}
            selectedModelIndex={selectedModelIndex}
            configDetailTab={configDetailTab}
            requestDeleteModel={requestDeleteModel}
          />
        )}

        {mainTab !== "configure" && (
          <div className="grid grid-cols-1 gap-4">
            {(mainTab === "tools" || mainTab === "test") && (
              <div className="space-y-4">
                {mainTab === "tools" && (
                  <ToolsTab
                    importMode={importMode}
                    onImportModeChange={setImportMode}
                    onImportFromPath={importFromPath}
                    onOpenImportContentModal={openImportContentModal}
                    onCopyDraftJson={copyDraftJson}
                    onExportToPath={exportToPath}
                    busy={busy}
                  />
                )}

                {mainTab === "test" && (
                  <TestTab
                    selectedProvider={selectedProvider}
                    selectedProviderEntry={selectedProviderEntry}
                    selectedModelEntry={selectedModelEntry}
                    activeModelLabel={activeModelLabel}
                    testPrompt={testPrompt}
                    onTestPromptChange={setTestPrompt}
                    testResult={testResult}
                    onRunTest={runHttpTest}
                    onCopyCurlCommand={copyCurlCommand}
                    onBackToConfigure={() => setMainTab("configure")}
                    busy={busy}
                  />
                )}
              </div>
            )}

            {mainTab === "history" && (
              <HistoryTab
                backups={backups}
                versions={versions}
                historyTab={historyTab}
                onHistoryTabChange={setHistoryTab}
                onCreateBackup={createBackup}
                onRestoreBackup={requestRestoreBackup}
                onDeleteBackup={requestDeleteBackup}
                onRestoreVersion={requestRestoreVersion}
                busy={busy}
              />
            )}
          </div>
        )}
      </div>

      <AddProviderModal
        open={showAddProviderModal}
        newProviderName={newProviderName}
        onNewProviderNameChange={setNewProviderName}
        onClose={() => setShowAddProviderModal(false)}
        onConfirm={handleCreateProvider}
      />

      <ImportModal
        open={showImportModal}
        importMode={importMode}
        onImportModeChange={setImportMode}
        importContentDraft={importContentDraft}
        onImportContentDraftChange={setImportContentDraft}
        onPasteClipboard={() => void pasteClipboardToImport()}
        onImport={() => void importFromContent()}
        onClose={() => setShowImportModal(false)}
        isImporting={busy === "import-content"}
      />

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
