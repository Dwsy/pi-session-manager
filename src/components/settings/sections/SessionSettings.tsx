import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsField from "@/components/settings/SettingsField";
import SettingsRadioCardGroup from "@/components/settings/SettingsRadioCardGroup";
import SettingsTabs from "@/components/settings/SettingsTabs";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";
import type {
  BrowserDatasetCacheInfo,
  DatasetImportStatus,
  DatasetInfo,
  SessionSettingsProps,
} from "@/components/settings/types";
import {
  DEFAULT_STANDALONE_DATASET_ID,
  clearAllBrowserDatasetCaches,
  clearBrowserDatasetCache,
  getBrowserDatasetCacheInfo,
  getDatasetImportStatus,
  listBrowserDatasetCaches,
  listDatasets,
  startDatasetImport,
} from "@/utils/datasetApi";
import { isStandaloneDatasetRuntime } from "@/browser-dataset";

type SessionInnerTab = "dataset" | "cache" | "general";

function formatBytes(value: number): string {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
}

function formatDateTime(value: number | string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

export default function SessionSettings({
  settings,
  onUpdate,
}: SessionSettingsProps) {
  const { t } = useTranslation();
  const standaloneDatasetRuntime = isStandaloneDatasetRuntime();
  const scrollMarkersEnabled =
    settings.session.scrollMarkersEnabled !== false &&
    settings.session.timelineNavEnabled === false;
  const timelineNavEnabled = settings.session.timelineNavEnabled === true;
  const [activeTab, setActiveTab] = useState<SessionInnerTab>(
    standaloneDatasetRuntime ? "dataset" : "general",
  );
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [datasetSource, setDatasetSource] = useState("");
  const [importStatus, setImportStatus] = useState<DatasetImportStatus | null>(
    null,
  );
  const [importError, setImportError] = useState<string | null>(null);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<BrowserDatasetCacheInfo | null>(
    null,
  );
  const [allCacheItems, setAllCacheItems] = useState<BrowserDatasetCacheInfo[]>(
    [],
  );
  const [loadingCacheInfo, setLoadingCacheInfo] = useState(false);
  const activeDatasetIds = settings.session.activeDatasetIds ?? [];
  const selectedDataset = useMemo(
    () => datasets.find((item) => item.id === settings.session.activeDatasetId),
    [datasets, settings.session.activeDatasetId],
  );
  const selectedDatasets = useMemo(
    () => datasets.filter((item) => activeDatasetIds.includes(item.id)),
    [activeDatasetIds, datasets],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingDatasets(true);
    listDatasets()
      .then((items) => {
        if (!cancelled) setDatasets(items);
      })
      .catch((error) => {
        console.error("Failed to load datasets:", error);
      })
      .finally(() => {
        if (!cancelled) setLoadingDatasets(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!importStatus || ["completed", "failed"].includes(importStatus.phase)) {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const latest = await getDatasetImportStatus(importStatus.taskId);
        setImportStatus(latest);
        if (latest.phase === "completed") {
          const items = await listDatasets();
          setDatasets(items);
          const imported = items.find((item) => item.id === latest.datasetId);
          if (imported) {
            const nextIds = Array.from(
              new Set([
                ...(settings.session.activeDatasetIds ?? []),
                imported.id,
              ]),
            );
            onUpdate("session", "activeDatasetIds", nextIds);
            onUpdate("session", "activeDatasetId", nextIds[0] || imported.id);
            onUpdate("session", "sourceMode", "dataset");
          }
        }
      } catch (error) {
        console.error("Failed to query dataset import status:", error);
      }
    }, 1200);

    return () => window.clearInterval(timer);
  }, [importStatus, onUpdate, settings.session.activeDatasetIds]);

  useEffect(() => {
    let cancelled = false;
    setLoadingCacheInfo(true);
    Promise.all([
      getBrowserDatasetCacheInfo(settings.session.activeDatasetId || undefined),
      listBrowserDatasetCaches(),
    ])
      .then(([info, items]) => {
        if (!cancelled) {
          setCacheInfo(info);
          setAllCacheItems(items);
        }
      })
      .catch((error) => {
        console.error("Failed to load browser dataset cache info:", error);
      })
      .finally(() => {
        if (!cancelled) setLoadingCacheInfo(false);
      });

    return () => {
      cancelled = true;
    };
  }, [settings.session.activeDatasetId, importStatus?.phase]);

  const handleToggleActiveDataset = (datasetId: string, checked: boolean) => {
    const nextIds = checked
      ? Array.from(new Set([...activeDatasetIds, datasetId]))
      : activeDatasetIds.filter((id) => id !== datasetId);
    onUpdate("session", "activeDatasetIds", nextIds);
    onUpdate("session", "activeDatasetId", nextIds[0] || "");
  };

  const applyStandaloneDataset = (datasetId: string) => {
    onUpdate("session", "sourceMode", "dataset");
    onUpdate("session", "activeDatasetIds", [datasetId]);
    onUpdate("session", "activeDatasetId", datasetId);
  };

  const handleImportDataset = async () => {
    const source = datasetSource.trim();
    if (!source) return;
    setImportError(null);

    try {
      const task = await startDatasetImport(source);
      setImportStatus(task);
      setDatasetSource("");
      if (task.phase === "completed") {
        const items = await listDatasets();
        setDatasets(items);
        if (standaloneDatasetRuntime && task.datasetId) {
          applyStandaloneDataset(task.datasetId);
        }
      }
    } catch (error) {
      console.error("Failed to start dataset import:", error);
      setImportError(
        error instanceof Error
          ? error.message
          : t(
              "settings.session.datasetImportFailed",
              "Failed to import dataset",
            ),
      );
    }
  };

  const handleClearBrowserCache = async () => {
    if (
      !confirm(
        t(
          "settings.session.clearBrowserCacheConfirm",
          "Clear cached browser dataset files for the selected dataset?",
        ),
      )
    ) {
      return;
    }

    try {
      await clearBrowserDatasetCache(
        settings.session.activeDatasetId || undefined,
      );
      setCacheInfo(null);
      setAllCacheItems((prev) =>
        prev.filter(
          (item) => item.datasetId !== (settings.session.activeDatasetId || ""),
        ),
      );
      alert(
        t(
          "settings.session.clearBrowserCacheSuccess",
          "Browser dataset cache cleared.",
        ),
      );
    } catch (error) {
      console.error("Failed to clear browser dataset cache:", error);
      alert(
        t(
          "settings.session.clearBrowserCacheFailed",
          "Failed to clear browser dataset cache.",
        ),
      );
    }
  };

  const handleClearAllBrowserCaches = async () => {
    if (
      !confirm(
        t(
          "settings.session.clearAllBrowserCacheConfirm",
          "Clear all browser dataset caches?",
        ),
      )
    ) {
      return;
    }

    try {
      await clearAllBrowserDatasetCaches();
      setCacheInfo(null);
      setAllCacheItems([]);
      alert(
        t(
          "settings.session.clearAllBrowserCacheSuccess",
          "All browser dataset caches cleared.",
        ),
      );
    } catch (error) {
      console.error("Failed to clear all browser dataset caches:", error);
      alert(
        t(
          "settings.session.clearBrowserCacheFailed",
          "Failed to clear browser dataset cache.",
        ),
      );
    }
  };

  const importPhaseLabel = importStatus
    ? t(
        `settings.session.importPhases.${importStatus.phase}`,
        importStatus.phase,
      )
    : "";

  return (
    <div className="space-y-6">
      <SettingsTabs
        items={
          standaloneDatasetRuntime
            ? [
                { id: "dataset", label: "Dataset" },
                { id: "general", label: "General" },
              ]
            : [
                { id: "general", label: "General" },
                { id: "dataset", label: "Dataset" },
                { id: "cache", label: "Cache" },
              ]
        }
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "dataset" && (
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
                            onClick={() => applyStandaloneDataset(dataset.id)}
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
                      onChange={(e) => setDatasetSource(e.target.value)}
                      placeholder={t(
                        "settings.session.standaloneDataset.addPlaceholder",
                        "owner/name or https://huggingface.co/datasets/owner/name",
                      )}
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                    />
                    <button
                      onClick={handleImportDataset}
                      disabled={
                        !datasetSource.trim() ||
                        (!!importStatus &&
                          !["completed", "failed"].includes(importStatus.phase))
                      }
                      className="rounded-lg border border-info bg-info/10 px-4 py-2 text-sm text-foreground transition-all disabled:cursor-not-allowed disabled:opacity-60"
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
                      onClick={handleClearBrowserCache}
                      className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-red-400 transition-colors hover:bg-red-500/20"
                    >
                      {t(
                        "settings.session.clearBrowserCache",
                        "Clear browser cache",
                      )}
                    </button>
                    <button
                      onClick={handleClearAllBrowserCaches}
                      className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-red-700 dark:text-red-300 transition-colors hover:bg-red-500/15"
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
                        className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-3 transition-colors ${
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
                            handleToggleActiveDataset(
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
                  onChange={(e) => setDatasetSource(e.target.value)}
                  placeholder={t(
                    "settings.session.importDatasetPlaceholder",
                    "https://huggingface.co/datasets/badlogicgames/pi-mono",
                  )}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                />
                <button
                  onClick={handleImportDataset}
                  disabled={
                    !datasetSource.trim() ||
                    (!!importStatus &&
                      !["completed", "failed"].includes(importStatus.phase))
                  }
                  className="rounded-lg border border-info bg-info/10 px-4 py-2 text-sm text-foreground transition-all disabled:cursor-not-allowed disabled:opacity-60"
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
      )}

      {!standaloneDatasetRuntime && activeTab === "cache" && (
        <SettingsCard
          title={t("settings.session.browserCacheTitle", "Browser cache")}
          description="Inspect cached datasets and clear browser storage when needed."
        >
          <div className="space-y-4">
            {loadingCacheInfo ? (
              <div className="text-xs text-muted-foreground">
                {t(
                  "settings.session.loadingBrowserCache",
                  "Loading cache info...",
                )}
              </div>
            ) : cacheInfo ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatTile
                  label={t(
                    "settings.session.browserCacheSessions",
                    "Cached sessions",
                  )}
                  value={cacheInfo.sessionCount}
                />
                <StatTile
                  label={t("settings.session.browserCacheSize", "Cache size")}
                  value={formatBytes(cacheInfo.totalBytes)}
                />
                <StatTile
                  label={t(
                    "settings.session.browserCacheUpdatedAt",
                    "Cached at",
                  )}
                  value={formatDateTime(cacheInfo.cachedAt)}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                {t(
                  "settings.session.browserCacheEmpty",
                  "No browser cache stored for the selected dataset yet.",
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleClearBrowserCache}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-red-400 transition-colors hover:bg-red-500/20"
              >
                {t("settings.session.clearBrowserCache", "Clear browser cache")}
              </button>
              <button
                onClick={handleClearAllBrowserCaches}
                className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-red-700 dark:text-red-300 transition-colors hover:bg-red-500/15"
              >
                {t(
                  "settings.session.clearAllBrowserCache",
                  "Clear all browser caches",
                )}
              </button>
            </div>

            <SettingsField
              label={t("settings.session.browserCacheList", "Cached datasets")}
              className="space-y-2"
              labelClassName="text-xs font-medium text-muted-foreground uppercase tracking-wide"
            >
              <div className="rounded-lg border border-border bg-background/40 divide-y divide-border/50">
                {allCacheItems.length > 0 ? (
                  allCacheItems.map((item) => (
                    <div
                      key={item.datasetId}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-foreground">
                          {item.datasetId}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatDateTime(item.cachedAt)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-muted-foreground">
                        <div>{item.sessionCount}</div>
                        <div>{formatBytes(item.totalBytes)}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-3 text-xs text-muted-foreground">
                    {t(
                      "settings.session.browserCacheListEmpty",
                      "No browser dataset caches stored.",
                    )}
                  </div>
                )}
              </div>
            </SettingsField>
          </div>
        </SettingsCard>
      )}

      {activeTab === "general" && (
        <SettingsCard title={t("settings.sections.session", "Session")}>
          <div className="space-y-4">
            <SettingsToggleRow
              title={t("settings.session.autoRefresh", "Auto refresh")}
              description={t(
                "settings.session.autoRefreshHelp",
                "Auto detect new sessions",
              )}
              checked={settings.session.autoRefresh}
              onChange={(checked) =>
                onUpdate("session", "autoRefresh", checked)
              }
            />

            {settings.session.autoRefresh && (
              <SettingsField
                label={t(
                  "settings.session.refreshInterval",
                  "Refresh interval",
                )}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="5"
                    max="300"
                    step="5"
                    value={settings.session.refreshInterval}
                    onChange={(e) =>
                      onUpdate(
                        "session",
                        "refreshInterval",
                        parseInt(e.target.value),
                      )
                    }
                    className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-info"
                  />
                  <span className="w-16 text-right text-sm text-muted-foreground">
                    {settings.session.refreshInterval}s
                  </span>
                </div>
              </SettingsField>
            )}

            <SettingsField
              label={t("settings.session.defaultViewMode", "Default view mode")}
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(["list", "directory", "project"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onUpdate("session", "defaultViewMode", mode)}
                    className={`rounded-lg border py-2 text-sm transition-all ${
                      settings.session.defaultViewMode === mode
                        ? "border-info bg-info/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-border-hover"
                    }`}
                  >
                    {t(`settings.session.viewModes.${mode}`)}
                  </button>
                ))}
              </div>
            </SettingsField>

            <SettingsToggleRow
              title={t(
                "settings.session.showMessagePreview",
                "Show message preview",
              )}
              description={t(
                "settings.session.showMessagePreviewHelp",
                "Show last message in session list",
              )}
              checked={settings.session.showMessagePreview}
              onChange={(checked) =>
                onUpdate("session", "showMessagePreview", checked)
              }
              className="items-start pt-4 border-t border-border/60"
            />

            {settings.session.showMessagePreview && (
              <SettingsField
                label={t("settings.session.previewLines", "Preview lines")}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={settings.session.previewLines}
                    onChange={(e) =>
                      onUpdate(
                        "session",
                        "previewLines",
                        parseInt(e.target.value),
                      )
                    }
                    className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-info"
                  />
                  <span className="w-8 text-right text-sm text-muted-foreground">
                    {settings.session.previewLines}
                  </span>
                </div>
              </SettingsField>
            )}

            <SettingsToggleRow
              title={t(
                "settings.session.colorizeToolCalls",
                "Tool call coloring",
              )}
              description={t(
                "settings.session.colorizeToolCallsHelp",
                "Show different colors for different tool calls in session tree",
              )}
              checked={settings.session.colorizeToolCalls !== false}
              onChange={(checked) =>
                onUpdate("session", "colorizeToolCalls", checked)
              }
              className="items-start pt-4 border-t border-border/60"
            />

            <SettingsToggleRow
              title={t(
                "settings.session.scrollMarkersEnabled",
                "Scroll markers",
              )}
              description={t(
                "settings.session.scrollMarkersEnabledHelp",
                "Show navigation dots on the side for quick jumping between messages",
              )}
              checked={scrollMarkersEnabled}
              onChange={(checked) => {
                onUpdate("session", "scrollMarkersEnabled", checked);
                if (checked) {
                  onUpdate("session", "timelineNavEnabled", false);
                }
              }}
              className="items-start pt-4 border-t border-border/60"
              searchKey="session-scrollMarkersEnabled"
            />

            <SettingsToggleRow
              title={t(
                "settings.session.scrollMarkersGuideSeen",
                "Show feature guide",
              )}
              description={t(
                "settings.session.scrollMarkersGuideSeenHelp",
                "Show introductory tips when opening a session for the first time",
              )}
              checked={!settings.session.scrollMarkersGuideSeen}
              onChange={(checked) =>
                onUpdate("session", "scrollMarkersGuideSeen", !checked)
              }
              className="items-start pt-4 border-t border-border/60"
            />

            <SettingsToggleRow
              title={t(
                "settings.session.timelineNavEnabled",
                "Timeline navigation",
              )}
              description={t(
                "settings.session.timelineNavEnabledHelp",
                "Show a dot timeline on the right side for quick message jumping with hover preview",
              )}
              checked={timelineNavEnabled}
              onChange={(checked) => {
                onUpdate("session", "timelineNavEnabled", checked);
                if (checked) {
                  onUpdate("session", "scrollMarkersEnabled", false);
                }
              }}
              className="items-start pt-4 border-t border-border/60"
              searchKey="session-timelineNavEnabled"
            />

            <SettingsToggleRow
              title={t(
                "settings.session.conversationModeEnabled",
                "Conversation mode",
              )}
              description={t(
                "settings.session.conversationModeEnabledHelp",
                "Group each user request with its final assistant response and fold intermediate thinking/tool steps in the main session view",
              )}
              checked={settings.session.conversationModeEnabled !== false}
              onChange={(checked) =>
                onUpdate("session", "conversationModeEnabled", checked)
              }
              className="items-start pt-4 border-t border-border/60"
              searchKey="session-conversationModeEnabled"
            />

            <SettingsToggleRow
              title={t(
                "settings.session.collapseToolCalls",
                "Collapse tool calls",
              )}
              description={t(
                "settings.session.collapseToolCallsHelp",
                "Show aggregated tool call summary instead of expanded list",
              )}
              checked={settings.session.collapseToolCalls}
              onChange={(checked) =>
                onUpdate("session", "collapseToolCalls", checked)
              }
              className="items-start pt-4 border-t border-border/60"
              searchKey="session-collapseToolCalls"
            />

            <SettingsField
              label={t(
                "settings.session.openPosition",
                "Task positioning open position",
              )}
              searchKey="session-openPosition"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(["top", "bottom"] as const).map((position) => (
                  <button
                    key={position}
                    onClick={() =>
                      onUpdate("session", "openPosition", position)
                    }
                    className={`rounded-lg border py-2 text-sm transition-all ${
                      settings.session.openPosition === position
                        ? "border-info bg-info/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-border-hover"
                    }`}
                  >
                    {t(`settings.session.openPositions.${position}`)}
                  </button>
                ))}
              </div>
            </SettingsField>

            <SettingsField
              label={t("settings.session.cmdFBehavior", "Cmd+F behavior")}
              description={t(
                "settings.session.cmdFBehaviorHelp",
                "Choose Cmd+F shortcut function",
              )}
              searchKey="session-cmdFBehavior"
            >
              <SettingsRadioCardGroup
                name="session-cmdf-behavior"
                options={["inSessionSearch", "toggleSidebar"] as const}
                value={settings.session.cmdFBehavior}
                onChange={(value) => onUpdate("session", "cmdFBehavior", value)}
                getLabel={(value) =>
                  value === "inSessionSearch"
                    ? t(
                        "settings.session.cmdFBehaviorOptions.inSessionSearch",
                        "In-session search",
                      )
                    : t(
                        "settings.session.cmdFBehaviorOptions.toggleSidebar",
                        "Toggle session tree",
                      )
                }
                getDescription={(value) =>
                  value === "inSessionSearch"
                    ? t(
                        "settings.session.cmdFBehaviorHint.search",
                        "Cmd+Shift+F toggles session tree",
                      )
                    : t(
                        "settings.session.cmdFBehaviorHint.sidebar",
                        "Cmd+Shift+F opens in-session search",
                      )
                }
              />
            </SettingsField>
          </div>
        </SettingsCard>
      )}
    </div>
  );
}
