import { History, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import SettingsCard from "@/components/settings/SettingsCard";
import SettingsTabs from "@/components/settings/SettingsTabs";
import type { ModelConfigBackupMeta, ConfigVersionMeta, HistoryTab as HistoryTabType } from "../types";
import { formatBytes } from "../utils";

interface HistoryTabProps {
  backups: ModelConfigBackupMeta[];
  versions: ConfigVersionMeta[];
  historyTab: HistoryTabType;
  onHistoryTabChange: (tab: HistoryTabType) => void;
  onCreateBackup: () => void;
  onRestoreBackup: (id: string) => void;
  onDeleteBackup: (id: string) => void;
  onRestoreVersion: (id: number) => void;
  busy: string | null;
}

export function HistoryTab({
  backups,
  versions,
  historyTab,
  onHistoryTabChange,
  onCreateBackup,
  onRestoreBackup,
  onDeleteBackup,
  onRestoreVersion,
  busy,
}: HistoryTabProps) {
  const { t } = useTranslation();

  return (
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
            onChange={onHistoryTabChange}
            className="inline-flex w-auto max-w-full"
            buttonClassName="flex-none"
          />
          <button
            type="button"
            onClick={() => void onCreateBackup()}
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
                      onClick={() => onRestoreBackup(backup.id)}
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
                      onClick={() => onDeleteBackup(backup.id)}
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
                    onClick={() => onRestoreVersion(version.id)}
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
  );
}
