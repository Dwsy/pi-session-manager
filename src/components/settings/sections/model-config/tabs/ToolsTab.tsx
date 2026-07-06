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
      <div className="space-y-6">
        {/* Import Mode Selector Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/40 p-5 shadow-sm backdrop-blur-sm">
          <div>
            <div className="text-sm font-bold text-foreground">
              {t(
                "settings.modelConfigCenter.sections.importMode",
                "Import Mode",
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-md">
              {t(
                "settings.modelConfigCenter.help.importMode",
                "Merge keeps existing providers, replace will directly use imported content.",
              )}
            </p>
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
            className="inline-flex w-auto max-w-full"
            buttonClassName="flex-none"
          />
        </div>

        {/* Sleek Interactive Action Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Card 1: Import File */}
          <div
            onClick={() => !busy && onImportFromPath()}
            className={`group relative flex items-start gap-4 rounded-xl border border-border/60 bg-card/40 p-5 cursor-pointer transition-all duration-200 hover:border-border hover:bg-card/70 hover:shadow-md ${
              busy === "import-file" ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary transition-transform duration-200 group-hover:scale-105 shadow-inner">
              {busy === "import-file" ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <FolderOpen className="h-6 w-6" />
              )}
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                {t(
                  "settings.modelConfigCenter.actions.importFile",
                  "Import file",
                )}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {t(
                  "settings.modelConfigCenter.help.importFileDesc",
                  "Select a local models.json or backup file from disk to import into current configuration.",
                )}
              </p>
            </div>
          </div>

          {/* Card 2: Import JSON Content */}
          <div
            onClick={() => !busy && onOpenImportContentModal()}
            className="group relative flex items-start gap-4 rounded-xl border border-border/60 bg-card/40 p-5 cursor-pointer transition-all duration-200 hover:border-border hover:bg-card/70 hover:shadow-md"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-500 transition-transform duration-200 group-hover:scale-105 shadow-inner">
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground group-hover:text-blue-500 transition-colors">
                {t(
                  "settings.modelConfigCenter.actions.importContent",
                  "Import JSON content",
                )}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {t(
                  "settings.modelConfigCenter.help.importContentDesc",
                  "Directly paste raw JSON text into an interactive editor to preview and apply.",
                )}
              </p>
            </div>
          </div>

          {/* Card 3: Copy Current Draft */}
          <div
            onClick={() => !busy && void onCopyDraftJson()}
            className="group relative flex items-start gap-4 rounded-xl border border-border/60 bg-card/40 p-5 cursor-pointer transition-all duration-200 hover:border-border hover:bg-card/70 hover:shadow-md"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500 transition-transform duration-200 group-hover:scale-105 shadow-inner">
              <Copy className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground group-hover:text-amber-500 transition-colors">
                {t(
                  "settings.modelConfigCenter.actions.copyDraft",
                  "Copy current draft",
                )}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {t(
                  "settings.modelConfigCenter.help.copyDraft",
                  '"Copy current draft" includes your unsaved changes.',
                )}
              </p>
            </div>
          </div>

          {/* Card 4: Export Saved File */}
          <div
            onClick={() => !busy && void onExportToPath()}
            className="group relative flex items-start gap-4 rounded-xl border border-border/60 bg-card/40 p-5 cursor-pointer transition-all duration-200 hover:border-border hover:bg-card/70 hover:shadow-md"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500 transition-transform duration-200 group-hover:scale-105 shadow-inner">
              <Download className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground group-hover:text-emerald-500 transition-colors">
                {t(
                  "settings.modelConfigCenter.actions.exportSaved",
                  "Export saved file",
                )}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {t(
                  "settings.modelConfigCenter.help.exportSaved",
                  '"Export saved file" reads models.json from disk, suitable for archiving.',
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
