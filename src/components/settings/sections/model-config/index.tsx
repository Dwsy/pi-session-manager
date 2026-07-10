import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  FileJson,
  FlaskConical,
  History,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Upload,
} from "lucide-react";
import { MODEL_CONFIG_PATH } from "./types";
import type { ModelConfigMainTab } from "./types";
import { useModelConfig } from "./useModelConfig";
import { ModelConfigFeedbackToast } from "./ui/ModelConfigFeedbackToast";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { AddProviderModal } from "./modals/AddProviderModal";
import { CatalogBrowserModal } from "./modals/CatalogBrowserModal";
import { ProviderRemoteModelsModal } from "./modals/ProviderRemoteModelsModal";
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
    openCatalogBrowser,
    openRemoteModelsBrowser,
    addModelsFromCatalog,
    addModelsFromRemote,
    fillSelectedModelPricing,
    fillProviderPricing,
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

  const tabItems: Array<{
    id: ModelConfigMainTab;
    icon: ReactNode;
    label: string;
  }> = [
    {
      id: "configure",
      icon: <FileJson className="h-3 w-3" />,
      label: t("settings.modelConfigCenter.tabs.configure", "Configure"),
    },
    {
      id: "test",
      icon: <FlaskConical className="h-3 w-3" />,
      label: t("settings.modelConfigCenter.tabs.test", "Test"),
    },
    {
      id: "tools",
      icon: <Upload className="h-3 w-3" />,
      label: t("settings.modelConfigCenter.tabs.tools", "Import & Export"),
    },
    {
      id: "history",
      icon: <History className="h-3 w-3" />,
      label: t("settings.modelConfigCenter.tabs.history", "History"),
    },
  ];

  if (loading) {
    return (
      <div className="flex h-[360px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="relative flex h-full min-h-0 flex-col space-y-2.5">
        {feedback && (
          <ModelConfigFeedbackToast
            tone={feedback.tone}
            message={feedback.message}
            onClose={() => setFeedback(null)}
          />
        )}

        <div
          className={`flex-none rounded-lg border px-2.5 py-1.5 shadow-2xs transition-colors ${
            isDirty
              ? "border-amber-500/45 bg-amber-500/10"
              : "border-border/50 bg-card/30"
          }`}
        >
          <div className="flex min-h-8 flex-wrap items-center gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 shrink-0 settings-accent-fg" />
              <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">
                {t("settings.modelConfigCenter.title", "模型配置中心")}
              </h2>
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                  isDirty
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    : "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isDirty ? "bg-amber-500 animate-pulse" : "bg-green-500"
                  }`}
                />
                {isDirty
                  ? t("settings.modelConfigCenter.status.dirty", "未保存")
                  : t("settings.modelConfigCenter.status.saved", "已同步")}
              </span>
            </div>

            <div className="flex h-8 items-center gap-0.5 rounded-md bg-surface/70 p-0.5">
              {tabItems.map((item) => {
                const active = mainTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setMainTab(item.id)}
                    className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-[11px] font-medium transition-colors focus-ring ${
                      active
                        ? "settings-accent-bg-strong text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="ml-auto flex min-w-0 items-center gap-1.5">
              <span className="hidden items-center gap-1 rounded border border-border/40 bg-surface/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground lg:inline-flex">
                <span className="text-foreground">{providerNames.length}</span>P
                <span className="text-foreground">{totalModels}</span>M
                <span className="text-foreground">{versions.length}</span>V
              </span>
              {selectedProvider && (
                <span className="hidden max-w-[220px] truncate rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary xl:inline-block">
                  {selectedProvider}
                  {selectedModelEntry && ` / ${activeModelLabel}`}
                </span>
              )}
              <span className="hidden max-w-[240px] truncate rounded border border-border/30 bg-surface/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground 2xl:inline-block">
                {MODEL_CONFIG_PATH}
              </span>
              <button
                type="button"
                onClick={refreshConfig}
                disabled={busy === "refresh"}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 text-[11px] font-medium text-foreground hover:border-border hover:bg-surface transition-colors active:scale-95 focus-ring disabled:opacity-60"
              >
                {busy === "refresh" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                {t("settings.modelConfigCenter.actions.refresh", "刷新")}
              </button>
              <button
                type="button"
                onClick={() => void saveConfig()}
                disabled={saving}
                className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold text-primary-foreground shadow-xs transition-colors active:scale-95 focus-ring disabled:opacity-60 ${
                  isDirty
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-primary hover:bg-primary/90"
                }`}
              >
                {saving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                {isDirty
                  ? t(
                      "settings.modelConfigCenter.actions.saveUnsaved",
                      "Save changes",
                    )
                  : t("settings.modelConfigCenter.actions.save", "Save")}
              </button>
            </div>
          </div>
        </div>

        {/* Main Workspace Area */}
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
            openCatalogBrowser={openCatalogBrowser}
            openRemoteModelsBrowser={openRemoteModelsBrowser}
            fillSelectedModelPricing={fillSelectedModelPricing}
            fillProviderPricing={fillProviderPricing}
            busy={busy}
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
          <div className="min-h-0 flex-1 overflow-y-auto grid grid-cols-1 gap-4">
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

      <CatalogBrowserModal
        open={showCatalogModal}
        targetProvider={selectedProvider}
        existingModelIds={selectedProviderModels.map((model) => model.id)}
        onClose={() => setShowCatalogModal(false)}
        onConfirm={addModelsFromCatalog}
      />

      <ProviderRemoteModelsModal
        open={showRemoteModelsModal}
        providerName={selectedProvider}
        providerEntry={selectedProviderEntry}
        existingModelIds={selectedProviderModels.map((model) => model.id)}
        onClose={() => setShowRemoteModelsModal(false)}
        onConfirm={addModelsFromRemote}
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
          cancelLabel={t("settings.modelConfigCenter.actions.cancel", "取消")}
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
