import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import SettingsTabs from "@/components/settings/SettingsTabs";
import SessionBrowserCacheSettings from "./session-settings/SessionBrowserCacheSettings";
import SessionDatasetSettings from "./session-settings/SessionDatasetSettings";
import SessionGeneralSettings from "./session-settings/SessionGeneralSettings";
import type {
  BrowserDatasetCacheInfo,
  DatasetImportStatus,
  DatasetInfo,
  SessionSettingsProps,
} from "@/components/settings/types";
import {
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
type SessionSettingsMode = "viewer" | "data-sources";

interface SessionSettingsSectionProps extends SessionSettingsProps {
  mode?: SessionSettingsMode;
}

export default function SessionSettings({
  settings,
  onUpdate,
  mode = "viewer",
}: SessionSettingsSectionProps) {
  const { t } = useTranslation();
  const standaloneDatasetRuntime = isStandaloneDatasetRuntime();
  const tabItems = useMemo(() => {
    if (mode === "viewer") {
      return [{ id: "general" as const, label: "General" }];
    }
    if (standaloneDatasetRuntime) {
      return [{ id: "dataset" as const, label: "Dataset" }];
    }
    return [
      { id: "dataset" as const, label: "Dataset" },
      { id: "cache" as const, label: "Cache" },
    ];
  }, [mode, standaloneDatasetRuntime]);
  const [activeTab, setActiveTab] = useState<SessionInnerTab>(tabItems[0].id);
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
    if (!tabItems.some((item) => item.id === activeTab)) {
      setActiveTab(tabItems[0].id);
    }
  }, [activeTab, tabItems]);

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
      {tabItems.length > 1 && (
        <SettingsTabs
          items={tabItems}
          active={activeTab}
          onChange={setActiveTab}
        />
      )}

      {activeTab === "dataset" && (
        <SessionDatasetSettings
          settings={settings}
          onUpdate={onUpdate}
          standaloneDatasetRuntime={standaloneDatasetRuntime}
          selectedDataset={selectedDataset}
          datasets={datasets}
          datasetSource={datasetSource}
          onDatasetSourceChange={setDatasetSource}
          importStatus={importStatus}
          importError={importError}
          loadingDatasets={loadingDatasets}
          cacheInfo={cacheInfo}
          allCacheItems={allCacheItems}
          activeDatasetIds={activeDatasetIds}
          selectedDatasets={selectedDatasets}
          onToggleActiveDataset={handleToggleActiveDataset}
          onApplyStandaloneDataset={applyStandaloneDataset}
          onImportDataset={handleImportDataset}
          onClearBrowserCache={handleClearBrowserCache}
          onClearAllBrowserCaches={handleClearAllBrowserCaches}
          importPhaseLabel={importPhaseLabel}
        />
      )}

      {!standaloneDatasetRuntime && activeTab === "cache" && (
        <SessionBrowserCacheSettings
          loadingCacheInfo={loadingCacheInfo}
          cacheInfo={cacheInfo}
          allCacheItems={allCacheItems}
          onClearBrowserCache={handleClearBrowserCache}
          onClearAllBrowserCaches={handleClearAllBrowserCaches}
        />
      )}

      {activeTab === "general" && (
        <SessionGeneralSettings settings={settings} onUpdate={onUpdate} />
      )}
    </div>
  );
}
