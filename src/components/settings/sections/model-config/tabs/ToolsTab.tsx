import { Copy, Download, FolderOpen, Loader2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import SettingsCard from "@/components/settings/SettingsCard";
import SettingsTabs from "@/components/settings/SettingsTabs";
import type { ImportMode } from "../types";

interface ToolsTabProps {
  importMode: ImportMode;
  onImportModeChange: (mode: ImportMode) => void;
  onImportFromPath: () => void;
  onOpenImportContentModal: () => void;
  onCopyDraftJson: () => void;
  onExportToPath: () => void;
  busy: string | null;
}

export function ToolsTab({
  importMode,
  onImportModeChange,
  onImportFromPath,
  onOpenImportContentModal,
  onCopyDraftJson,
  onExportToPath,
  busy,
}: ToolsTabProps) {
  const { t } = useTranslation();

  return (
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
            onChange={onImportModeChange}
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
            onClick={onImportFromPath}
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
            onClick={onOpenImportContentModal}
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
            onClick={() => void onCopyDraftJson()}
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
            onClick={() => void onExportToPath()}
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
  );
}
