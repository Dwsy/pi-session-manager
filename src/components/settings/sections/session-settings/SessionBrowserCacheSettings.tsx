import { useTranslation } from "react-i18next";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsField from "@/components/settings/SettingsField";
import type { BrowserDatasetCacheInfo } from "@/components/settings/types";
import { formatBytes, formatDateTime, StatTile } from "./sessionSettingsUtils";

interface SessionBrowserCacheSettingsProps {
  loadingCacheInfo: boolean;
  cacheInfo: BrowserDatasetCacheInfo | null;
  allCacheItems: BrowserDatasetCacheInfo[];
  onClearBrowserCache: () => void;
  onClearAllBrowserCaches: () => void;
}

export default function SessionBrowserCacheSettings({
  loadingCacheInfo,
  cacheInfo,
  allCacheItems,
  onClearBrowserCache,
  onClearAllBrowserCaches,
}: SessionBrowserCacheSettingsProps) {
  const { t } = useTranslation();

  return (
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
                onClick={onClearBrowserCache}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-red-400 transition-colors hover:bg-red-500/20"
              >
                {t("settings.session.clearBrowserCache", "Clear browser cache")}
              </button>
              <button
                onClick={onClearAllBrowserCaches}
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
  );
}
