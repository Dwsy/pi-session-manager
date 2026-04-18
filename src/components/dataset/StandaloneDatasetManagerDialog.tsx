import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Database,
  DatabaseBackup,
  ExternalLink,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { BrowserDatasetCacheInfo, DatasetInfo } from "@/components/settings/types";
import {
  DEFAULT_STANDALONE_DATASET_ID,
  clearBrowserDatasetCache,
  listBrowserDatasetCaches,
  listDatasets,
  removeBrowserDatasetRecent,
  startDatasetImport,
} from "@/utils/datasetApi";
import { getCachedSettings, saveAppSettings } from "@/utils/settingsApi";

interface StandaloneDatasetManagerDialogProps {
  open: boolean;
  currentDatasetId: string;
  onClose: () => void;
  onDatasetChanged: (datasetId: string) => Promise<void> | void;
}

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

export default function StandaloneDatasetManagerDialog({
  open,
  currentDatasetId,
  onClose,
  onDatasetChanged,
}: StandaloneDatasetManagerDialogProps) {
  const { t } = useTranslation();
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [cacheItems, setCacheItems] = useState<BrowserDatasetCacheInfo[]>([]);
  const [datasetSource, setDatasetSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyDatasetId, setBusyDatasetId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheByDatasetId = useMemo(
    () => new Map(cacheItems.map((item) => [item.datasetId, item])),
    [cacheItems],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextDatasets, nextCacheItems] = await Promise.all([
        listDatasets(),
        listBrowserDatasetCaches(),
      ]);
      setDatasets(nextDatasets);
      setCacheItems(nextCacheItems);
    } catch (refreshError) {
      console.error("[DatasetManager] Failed to load datasets:", refreshError);
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Failed to load datasets",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    void refresh();
  }, [open, refresh]);

  const switchDataset = useCallback(
    async (datasetId: string) => {
      setBusyDatasetId(datasetId);
      setError(null);
      let switched = false;
      try {
        const settings = getCachedSettings();
        await saveAppSettings({
          ...settings,
          session: {
            ...settings.session,
            sourceMode: "dataset",
            activeDatasetId: datasetId,
            activeDatasetIds: [datasetId],
          },
        });
        await onDatasetChanged(datasetId);
        switched = true;
      } catch (switchError) {
        console.error("[DatasetManager] Failed to switch dataset:", switchError);
        setError(
          switchError instanceof Error
            ? switchError.message
            : "Failed to switch dataset",
        );
      } finally {
        setBusyDatasetId(null);
      }

      if (switched) {
        onClose();
      }
    },
    [onClose, onDatasetChanged],
  );

  const handleAddDataset = useCallback(async () => {
    const source = datasetSource.trim();
    if (!source) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await startDatasetImport(source);
      setDatasetSource("");
      await refresh();
      await switchDataset(result.datasetId);
    } catch (addError) {
      console.error("[DatasetManager] Failed to add dataset:", addError);
      setError(
        addError instanceof Error ? addError.message : "Failed to add dataset",
      );
    } finally {
      setSubmitting(false);
    }
  }, [datasetSource, refresh, switchDataset]);

  const handleClearCache = useCallback(
    async (datasetId: string) => {
      setBusyDatasetId(datasetId);
      setError(null);
      try {
        await clearBrowserDatasetCache(datasetId);
        await refresh();
      } catch (cacheError) {
        console.error("[DatasetManager] Failed to clear cache:", cacheError);
        setError(
          cacheError instanceof Error
            ? cacheError.message
            : "Failed to clear browser cache",
        );
      } finally {
        setBusyDatasetId(null);
      }
    },
    [refresh],
  );

  const handleRemoveDataset = useCallback(
    async (datasetId: string) => {
      setBusyDatasetId(datasetId);
      setError(null);
      try {
        removeBrowserDatasetRecent(datasetId);
        await clearBrowserDatasetCache(datasetId);
        await refresh();
      } catch (removeError) {
        console.error("[DatasetManager] Failed to remove dataset:", removeError);
        setError(
          removeError instanceof Error
            ? removeError.message
            : "Failed to remove dataset",
        );
      } finally {
        setBusyDatasetId(null);
      }
    },
    [refresh],
  );

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border/70 bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4 md:px-6">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/50 px-3 py-1 text-xs text-muted-foreground">
              <Database className="h-3.5 w-3.5" />
              {t(
                "settings.session.standaloneDataset.dialogModeBadge",
                "Standalone dataset mode",
              )}
            </div>
            <h2 className="mt-3 text-xl font-semibold text-foreground">
              {t(
                "settings.session.standaloneDataset.manageAction",
                "Manage datasets",
              )}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "settings.session.standaloneDataset.currentDatasetLabel",
                "Current dataset: {{datasetId}}",
                { datasetId: currentDatasetId },
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-border/70 bg-background p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6">
          <div className="rounded-2xl border border-border/60 bg-secondary/20 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <input
                value={datasetSource}
                onChange={(event) => setDatasetSource(event.target.value)}
                placeholder={t(
                  "settings.session.standaloneDataset.addPlaceholder",
                  "owner/name or https://huggingface.co/datasets/owner/name",
                )}
                className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-info"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void refresh()}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                  />
                  {t("common.refresh")}
                </button>
                <button
                  onClick={() => void handleAddDataset()}
                  disabled={!datasetSource.trim() || submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-info/40 bg-info/10 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-info/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  {t(
                    "settings.session.standaloneDataset.addAndSwitch",
                    "Add and switch",
                  )}
                </button>
              </div>
            </div>
            {error && (
              <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          <div className="mt-5 space-y-3">
            {datasets.map((dataset) => {
              const cacheInfo = cacheByDatasetId.get(dataset.id);
              const isCurrent = dataset.id === currentDatasetId;
              const isBuiltinDefault = dataset.id === DEFAULT_STANDALONE_DATASET_ID;
              const isBusy = busyDatasetId === dataset.id;

              return (
                <div
                  key={dataset.id}
                  className={`rounded-2xl border px-4 py-4 transition-colors ${
                    isCurrent
                      ? "border-info/50 bg-info/10"
                      : "border-border/60 bg-background/70"
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-foreground">
                          {dataset.displayName}
                        </div>
                        {isCurrent && (
                          <span className="rounded-full bg-info/15 px-2 py-0.5 text-[11px] font-medium text-info">
                            {t(
                              "settings.session.standaloneDataset.currentBadge",
                              "Current",
                            )}
                          </span>
                        )}
                        {isBuiltinDefault && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                            {t(
                              "settings.session.standaloneDataset.builtinBadge",
                              "Built-in",
                            )}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 break-all text-xs text-muted-foreground">
                        {dataset.id}
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                        <div>
                          {t(
                            "settings.session.standaloneDataset.sourceLabel",
                            "Source",
                          )}
                          :{" "}
                          <a
                            href={dataset.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-info hover:underline"
                          >
                            {dataset.sourceUrl}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <div>
                          {t(
                            "settings.session.standaloneDataset.addedLabel",
                            "Added",
                          )}
                          : {formatDateTime(dataset.importedAt)}
                        </div>
                        <div>
                          {t(
                            "settings.session.standaloneDataset.browserCacheLabel",
                            "Browser cache",
                          )}
                          :{" "}
                          {cacheInfo
                            ? t(
                                "settings.session.standaloneDataset.browserCacheValue",
                                "{{count}} sessions · {{size}}",
                                {
                                  count: cacheInfo.sessionCount,
                                  size: formatBytes(cacheInfo.totalBytes),
                                },
                              )
                            : t(
                                "settings.session.standaloneDataset.notCachedYet",
                                "Not cached yet",
                              )}
                        </div>
                        <div>
                          {t(
                            "settings.session.standaloneDataset.cachedAtLabel",
                            "Cached at",
                          )}
                          : {formatDateTime(cacheInfo?.cachedAt ?? null)}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!isCurrent && (
                        <button
                          onClick={() => void switchDataset(dataset.id)}
                          disabled={isBusy}
                          className="rounded-xl border border-info/40 bg-info/10 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-info/15 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {t(
                            "settings.session.standaloneDataset.switchAction",
                            "Switch to this dataset",
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => void handleClearCache(dataset.id)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <DatabaseBackup className="h-4 w-4" />
                        {t(
                          "settings.session.standaloneDataset.clearCacheAction",
                          "Clear cache",
                        )}
                      </button>
                      {!isBuiltinDefault && !isCurrent && (
                        <button
                          onClick={() => void handleRemoveDataset(dataset.id)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="h-4 w-4" />
                          {t(
                            "settings.session.standaloneDataset.removeAction",
                            "Remove",
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {datasets.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
                {t(
                  "settings.session.standaloneDataset.emptyDatasets",
                  "No datasets available.",
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
