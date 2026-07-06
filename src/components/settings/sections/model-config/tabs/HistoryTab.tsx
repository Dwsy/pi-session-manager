import {
  FileText,
  GitCommit,
  History,
  Loader2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import SettingsCard from "@/components/settings/SettingsCard";
import SettingsTabs from "@/components/settings/SettingsTabs";
import type {
  ModelConfigBackupMeta,
  ConfigVersionMeta,
  HistoryTab as HistoryTabType,
} from "../types";
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
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm backdrop-blur-sm">
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
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all duration-150 active:scale-95 focus-ring disabled:opacity-60"
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

        <div className="max-h-[640px] space-y-3 overflow-y-auto pr-1">
          {historyTab === "backups" ? (
            backups.length > 0 ? (
              backups.map((backup) => (
                <div
                  key={backup.id}
                  className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-border hover:bg-card/70 hover:shadow"
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-inner">
                      <History className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-sm font-bold text-foreground">
                        {backup.id}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded-md bg-surface px-2 py-0.5 border border-border/50">
                          {new Date(backup.createdAt).toLocaleString()}
                        </span>
                        <span className="rounded-md bg-surface px-2 py-0.5 border border-border/50 font-mono">
                          {formatBytes(backup.sizeBytes)}
                        </span>
                      </div>
                      {backup.note && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-foreground/80 bg-surface/80 px-2.5 py-1 rounded-lg border border-border/40 w-fit">
                          <FileText className="h-3.5 w-3.5 text-primary" />
                          <span>{backup.note}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => onRestoreBackup(backup.id)}
                      disabled={busy === `restore-${backup.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/60 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-150 active:scale-95 focus-ring disabled:opacity-60"
                      title={t(
                        "settings.modelConfigCenter.actions.restore",
                        "Resume",
                      )}
                    >
                      {busy === `restore-${backup.id}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {t(
                          "settings.modelConfigCenter.actions.restore",
                          "Resume",
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteBackup(backup.id)}
                      disabled={busy === `delete-${backup.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/30 transition-all duration-150 active:scale-95 focus-ring disabled:opacity-60"
                      title={t(
                        "settings.modelConfigCenter.actions.delete",
                        "Delete",
                      )}
                    >
                      {busy === `delete-${backup.id}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 p-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto mb-3 shadow-inner">
                  <History className="h-7 w-7" />
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {t(
                    "settings.modelConfigCenter.empty.noBackups",
                    "No backup records yet",
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">
                  Click "Backup Now" to create a manual snapshot of your configuration.
                </p>
              </div>
            )
          ) : versions.length > 0 ? (
            versions.map((version) => (
              <div
                key={version.id}
                className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-border hover:bg-card/70 hover:shadow"
              >
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent shadow-inner">
                    <GitCommit className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm font-bold text-foreground">
                      #{version.id}
                    </div>
                    <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {version.filePath}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-md bg-surface px-2 py-0.5 border border-border/50">
                        {new Date(version.createdAt).toLocaleString()}
                      </span>
                      <span className="rounded-md bg-surface px-2 py-0.5 border border-border/50 font-mono">
                        {formatBytes(version.sizeBytes)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => onRestoreVersion(version.id)}
                    disabled={busy === `version-${version.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/60 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-150 active:scale-95 focus-ring disabled:opacity-60"
                  >
                    {busy === `version-${version.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {t(
                        "settings.modelConfigCenter.actions.restore",
                        "Resume",
                      )}
                    </span>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-border/60 p-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent mx-auto mb-3 shadow-inner">
                <GitCommit className="h-7 w-7" />
              </div>
              <div className="text-sm font-semibold text-foreground">
                {t(
                  "settings.modelConfigCenter.empty.noVersions",
                  "No version snapshots yet",
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">
                Version snapshots are automatically recorded when configuration changes occur.
              </p>
            </div>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}
