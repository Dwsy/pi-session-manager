import { useTranslation } from "react-i18next";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsRadioCardGroup from "@/components/settings/SettingsRadioCardGroup";
import type {
  BrowserDatasetCacheInfo,
  DatasetImportStatus,
  DatasetInfo,
  SessionSettingsProps,
} from "@/components/settings/types";
import { DEFAULT_STANDALONE_DATASET_ID } from "@/utils/datasetApi";
import { formatBytes, formatDateTime, StatTile } from "./sessionSettingsUtils";

interface SessionDatasetSettingsProps extends SessionSettingsProps {
  standaloneDatasetRuntime: boolean;
  selectedDataset?: DatasetInfo;
  datasets: DatasetInfo[];
  datasetSource: string;
  onDatasetSourceChange: (value: string) => void;
  importStatus: DatasetImportStatus | null;
  importError: string | null;
  loadingDatasets: boolean;
  cacheInfo: BrowserDatasetCacheInfo | null;
  allCacheItems: BrowserDatasetCacheInfo[];
  activeDatasetIds: string[];
  selectedDatasets: DatasetInfo[];
  onToggleActiveDataset: (datasetId: string, checked: boolean) => void;
  onApplyStandaloneDataset: (datasetId: string) => void;
  onImportDataset: () => void;
  onClearBrowserCache: () => void;
  onClearAllBrowserCaches: () => void;
  importPhaseLabel: string;
}

export default function SessionDatasetSettings({
  settings,
  onUpdate,
  standaloneDatasetRuntime,
  selectedDataset,
  datasets,
  datasetSource,
  onDatasetSourceChange,
  importStatus,
  importError,
  loadingDatasets,
  cacheInfo,
  allCacheItems,
  activeDatasetIds,
  selectedDatasets,
  onToggleActiveDataset,
  onApplyStandaloneDataset,
  onImportDataset,
  onClearBrowserCache,
  onClearAllBrowserCaches,
  importPhaseLabel,
}: SessionDatasetSettingsProps) {
  const { t } = useTranslation();

  return (
        <div className="space-y-6">
          {standaloneDatasetRuntime ? (
            <>
              <SettingsCard
                title={t(
                  "settings.session.standaloneDataset.manageAction",
                  "Manage datasets",
                )}
                description={t(
                  "settings.session.standaloneDataset.recentSessionsHelp",
                  "Newest sessions in the current dataset. Click to open.",
                )}
              >
                <div className="space-y-4">
                  {selectedDataset ? (
                    <div className="rounded-xl border border-info/30 bg-info/10 px-4 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-base font-semibold text-foreground">
                          {selectedDataset.displayName}
                        </div>
                        <span className="rounded-full bg-info/15 px-2 py-0.5 text-[11px] font-medium text-info">
                          {t(
                            "settings.session.standaloneDataset.currentBadge",
                            "Current",
                          )}
                        </span>
                        {selectedDataset.id === DEFAULT_STANDALONE_DATASET_ID && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                            {t(
                              "settings.session.standaloneDataset.builtinBadge",
                              "Built-in",
                            )}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground break-all">
                        {selectedDataset.id}
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <StatTile
                          label={t(
                            "settings.session.browserCacheSessions",
                            "Cached sessions",
                          )}
                          value={cacheInfo?.sessionCount ?? 0}
                        />
                        <StatTile
                          label={t(
                            "settings.session.browserCacheSize",
                            "Cache size",
                          )}
                          value={formatBytes(cacheInfo?.totalBytes ?? 0)}
                        />
                        <StatTile
                          label={t(
                            "settings.session.browserCacheUpdatedAt",
                            "Cached at",
                          )}
                          value={formatDateTime(cacheInfo?.cachedAt ?? null)}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                      {t(
                        "settings.session.noDatasetSelected",
                        "No dataset selected",
                      )}
                    </div>
                  )}

                  <div className="rounded-xl border border-border bg-background/40 p-2 space-y-2">
                    {datasets.length > 0 ? (
                      datasets.map((dataset) => {
                        const isCurrent =
                          settings.session.activeDatasetId === dataset.id;
                        const cacheItem = allCacheItems.find(
                          (item) => item.datasetId === dataset.id,
                        );
                        const isBuiltin =
                          dataset.id === DEFAULT_STANDALONE_DATASET_ID;

                        return (
                          <button
                            key={dataset.id}
                            onClick={() => onApplyStandaloneDataset(dataset.id)}
                            className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                              isCurrent
                                ? "border-info bg-info/10"
                                : "border-border bg-background/60 hover:border-border-hover"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="text-sm font-medium text-foreground truncate">
                                    {dataset.displayName}
                                  </div>
                                  {isCurrent && (
                                    <span className="rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-medium text-info">
                                      {t(
                                        "settings.session.standaloneDataset.currentBadge",
                                        "Current",
                                      )}
                                    </span>
                                  )}
                                  {isBuiltin && (
                                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                                      {t(
                                        "settings.session.standaloneDataset.builtinBadge",
                                        "Built-in",
                                      )}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground break-all">
                                  {dataset.id}
                                </div>
                                <div className="mt-2 text-[11px] text-muted-foreground">
                                  {cacheItem
                                    ? `${cacheItem.sessionCount} ${t("common.sessions", "Sessions")} · ${formatBytes(cacheItem.totalBytes)}`
                                    : t(
                                        "settings.session.standaloneDataset.notCachedYet",
                                        "Not cached yet",
                                      )}
                                </div>
                              </div>
                              <div
                                className={`mt-0.5 h-4 w-4 rounded-full border ${
                                  isCurrent
                                    ? "border-info bg-info"
                                    : "border-border"
                                }`}
                              />
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                        {t(
                          "settings.session.standaloneDataset.emptyDatasets",
                          "No datasets available.",
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      value={datasetSource}
                      onChange={(e) => onDatasetSourceChange(e.target.value)}
                      placeholder={t(
                        "settings.session.standaloneDataset.addPlaceholder",
                        "owner/name or https://huggingface.co/datasets/owner/name",
                      )}
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                    />
                    <button
                      onClick={onImportDataset}
                      disabled={
                        !datasetSource.trim() ||
                        (!!importStatus &&
                          !["completed", "failed"].includes(importStatus.phase))
                      }
                      className="rounded-lg border border-info bg-info/10 px-4 py-2 text-sm text-foreground motion-context disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {importStatus &&
                      !["completed", "failed"].includes(importStatus.phase)
                        ? t("settings.session.importingDataset", "Importing...")
                        : t(
                            "settings.session.standaloneDataset.addAndSwitch",
                            "Add and switch",
                          )}
                    </button>
                  </div>

                  {importError && (
                    <p className="text-xs text-destructive">{importError}</p>
                  )}

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border/60">
                    <button
                      onClick={onClearBrowserCache}
                      className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-red-400 motion-color hover:bg-red-500/20"
                    >
                      {t(
                        "settings.session.clearBrowserCache",
                        "Clear browser cache",
                      )}
                    </button>
                    <button
                      onClick={onClearAllBrowserCaches}
                      className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-red-700 dark:text-red-300 motion-color hover:bg-red-500/15"
                    >
                      {t(
                        "settings.session.clearAllBrowserCache",
                        "Clear all browser caches",
                      )}
                    </button>
                  </div>
                </div>
              </SettingsCard>
            </>
          ) : (
            <>
          <SettingsCard
            title={t("settings.session.sourceMode", "Session source")}
            description={t(
              "settings.session.sourceModeHelp",
              "Switch between local sessions and imported dataset snapshots",
            )}
          >
            <div className="space-y-4">
              <SettingsRadioCardGroup
                name="session-source-mode"
                options={["local", "dataset"] as const}
                value={settings.session.sourceMode}
                onChange={(mode) => onUpdate("session", "sourceMode", mode)}
                getLabel={(mode) => t(`settings.session.sourceModes.${mode}`)}
                getDescription={(mode) =>
                  t(`settings.session.sourceModes.${mode}Help`)
                }
                containerClassName="grid grid-cols-1 gap-3 sm:grid-cols-2"
              />

              <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                <div className="font-medium">
                  {t(
                    "settings.session.datasetRestartRequired",
                    "Restart required to fully apply",
                  )}
                </div>
                <div className="mt-1 text-muted-foreground">
                  {t(
                    "settings.session.datasetRestartRequiredHelp",
                    "Dataset source changes and watcher updates are applied cleanly after restarting the app.",
                  )}
                </div>
              </div>
            </div>
          </SettingsCard>

          <SettingsCard
            title={t("settings.session.activeDataset", "Selected datasets")}
            description={
              loadingDatasets
                ? t("settings.session.loadingDatasets", "Loading datasets...")
                : t(
                    "settings.session.activeDatasetHelp",
                    "Select one or more imported dataset snapshots to mount after restart.",
                  )
            }
          >
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-background/40 p-2 max-h-72 overflow-auto space-y-2">
                {datasets.length > 0 ? (
                  datasets.map((dataset) => {
                    const checked = activeDatasetIds.includes(dataset.id);
                    const isPrimary =
                      checked &&
                      settings.session.activeDatasetId === dataset.id;

                    return (
                      <label
                        key={dataset.id}
                        className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-3 motion-color ${
                          checked
                            ? "border-info bg-info/10"
                            : "border-border bg-background/50 hover:border-border-hover"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="text-sm font-medium text-foreground truncate">
                              {dataset.displayName}
                            </div>
                            {isPrimary && (
                              <span className="rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-medium text-info">
                                Primary
                              </span>
                            )}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {dataset.id}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {dataset.totalFiles}{" "}
                            {t("settings.session.datasetFiles", "files")} ·{" "}
                            {formatBytes(dataset.totalBytes)}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            onToggleActiveDataset(
                              dataset.id,
                              e.target.checked,
                            )
                          }
                          className="mt-1 h-4 w-4 accent-info"
                        />
                      </label>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    {t(
                      "settings.session.noDatasetSelected",
                      "No dataset selected",
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatTile
                  label={t(
                    "settings.session.activeDataset",
                    "Selected datasets",
                  )}
                  value={selectedDatasets.length}
                />
                <StatTile
                  label={t("settings.session.datasetFiles", "files")}
                  value={selectedDatasets.reduce(
                    (sum, item) => sum + item.totalFiles,
                    0,
                  )}
                />
                <StatTile
                  label={t("settings.session.datasetSize", "Dataset size")}
                  value={formatBytes(
                    selectedDatasets.reduce(
                      (sum, item) => sum + item.totalBytes,
                      0,
                    ),
                  )}
                />
              </div>

              {selectedDataset && (
                <div className="rounded-lg border border-border bg-background/50 px-3 py-3 text-xs text-muted-foreground space-y-1.5">
                  <div className="font-medium text-foreground">
                    {selectedDataset.displayName}
                  </div>
                  <div>
                    <span className="text-foreground">
                      {t("settings.session.datasetSourceLabel", "Source")}:
                    </span>{" "}
                    {selectedDataset.sourceUrl}
                  </div>
                  <div>
                    <span className="text-foreground">
                      {t("settings.session.datasetLocalPath", "Local path")}:
                    </span>{" "}
                    {selectedDataset.localPath}
                  </div>
                  <div>
                    <span className="text-foreground">
                      {t("settings.session.datasetDbPath", "DB path")}:
                    </span>{" "}
                    {selectedDataset.dbPath}
                  </div>
                </div>
              )}
            </div>
          </SettingsCard>

          <SettingsCard
            title={t(
              "settings.session.importDataset",
              "Import Hugging Face dataset",
            )}
            description={t(
              "settings.session.importDatasetHelp",
              "Download JSONL files first, then build a dedicated SQLite DB under ~/.pi/agent/sessions/datasets/<dataset>.",
            )}
          >
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  value={datasetSource}
                  onChange={(e) => onDatasetSourceChange(e.target.value)}
                  placeholder={t(
                    "settings.session.importDatasetPlaceholder",
                    "https://huggingface.co/datasets/badlogicgames/pi-mono",
                  )}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                />
                <button
                  onClick={onImportDataset}
                  disabled={
                    !datasetSource.trim() ||
                    (!!importStatus &&
                      !["completed", "failed"].includes(importStatus.phase))
                  }
                  className="rounded-lg border border-info bg-info/10 px-4 py-2 text-sm text-foreground motion-context disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importStatus &&
                  !["completed", "failed"].includes(importStatus.phase)
                    ? t("settings.session.importingDataset", "Importing...")
                    : t("settings.session.importDatasetAction", "Import")}
                </button>
              </div>

              {importError && (
                <p className="text-xs text-destructive">{importError}</p>
              )}

              {importStatus && (
                <div className="rounded-lg border border-border bg-background/50 px-3 py-3 text-xs text-muted-foreground space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-foreground">
                      {importStatus.displayName}
                    </span>
                    <span>{importPhaseLabel}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <StatTile
                      label={t(
                        "settings.session.datasetDownloaded",
                        "Downloaded",
                      )}
                      value={`${importStatus.downloadedFiles}/${importStatus.totalFiles}`}
                    />
                    <StatTile
                      label={t("settings.session.datasetIndexed", "Indexed")}
                      value={`${importStatus.indexedFiles}/${importStatus.totalFiles}`}
                    />
                    <StatTile
                      label={t(
                        "settings.session.datasetTransferred",
                        "Transferred",
                      )}
                      value={formatBytes(importStatus.downloadedBytes)}
                    />
                    <StatTile
                      label={t(
                        "settings.session.datasetTotalSize",
                        "Total size",
                      )}
                      value={formatBytes(importStatus.totalBytes)}
                    />
                  </div>
                  {importStatus.error && (
                    <div className="text-destructive">{importStatus.error}</div>
                  )}
                </div>
              )}
            </div>
          </SettingsCard>
            </>
          )}
        </div>
  );
}
