import { Copy, Loader2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import SettingsTabs from "@/components/settings/SettingsTabs";
import { ModalShell } from "../ui/ModalShell";
import type { ImportMode } from "../types";

interface ImportModalProps {
  open: boolean;
  importMode: ImportMode;
  onImportModeChange: (mode: ImportMode) => void;
  importContentDraft: string;
  onImportContentDraftChange: (value: string) => void;
  onPasteClipboard: () => void;
  onImport: () => void;
  onClose: () => void;
  isImporting: boolean;
}

export function ImportModal({
  open,
  importMode,
  onImportModeChange,
  importContentDraft,
  onImportContentDraftChange,
  onPasteClipboard,
  onImport,
  onClose,
  isImporting,
}: ImportModalProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <ModalShell
      title={t(
        "settings.modelConfigCenter.dialogs.importContentTitle",
        "Import JSON content",
      )}
      description={t(
        "settings.modelConfigCenter.dialogs.importContentDesc",
        "Paste complete models.json content here and apply according to current import mode.",
      )}
      onClose={() => {
        if (!isImporting) {
          onClose();
        }
      }}
      widthClass="max-w-2xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground motion-color motion-press focus-ring disabled:opacity-60"
          >
            {t("settings.modelConfigCenter.actions.cancel", "Cancel")}
          </button>
          <button
            type="button"
            onClick={onImport}
            disabled={isImporting}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all motion-press focus-ring disabled:opacity-60"
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {t(
              "settings.modelConfigCenter.actions.importNow",
              "Import Now",
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/30 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-foreground">
              {t(
                "settings.modelConfigCenter.sections.importMode",
                "Import Mode",
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t(
                "settings.modelConfigCenter.help.importMode",
                "Merge keeps existing providers, replace will directly use imported content.",
              )}
            </div>
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

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onPasteClipboard}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring"
          >
            <Copy className="h-4 w-4" />
            {t(
              "settings.modelConfigCenter.actions.pasteClipboard",
              "Paste from clipboard",
            )}
          </button>
        </div>

        <textarea
          value={importContentDraft}
          onChange={(event) => onImportContentDraftChange(event.target.value)}
          placeholder={t(
            "settings.modelConfigCenter.placeholders.importContent",
            "Paste complete models.json content",
          )}
          className="min-h-[320px] w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none transition-all"
        />
      </div>
    </ModalShell>
  );
}
