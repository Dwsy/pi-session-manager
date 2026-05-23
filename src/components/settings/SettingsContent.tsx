import { useTranslation } from "react-i18next";
import { Check, Loader2, X } from "lucide-react";

import type { AppSettings, SettingsSaveMode, SettingsSection } from "./types";
import type { SettingsSections, SettingsUpdateHandler } from "./SettingsPanelTypes";
import { getSettingsAreaMeta, renderSettingsSection } from "./settingsRegistry";

interface SettingsContentProps {
  menuItems: SettingsSections;
  activeSection: SettingsSection;
  settings: AppSettings;
  loading: boolean;
  onUpdate: SettingsUpdateHandler;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  saveMode: SettingsSaveMode;
}

export default function SettingsContent({
  menuItems,
  activeSection,
  settings,
  loading,
  onUpdate,
  onClose,
  onSave,
  saving,
  saved,
  saveMode,
}: SettingsContentProps) {
  const { t } = useTranslation();
  const activeItem = menuItems.find((item) => item.id === activeSection);
  const area = activeItem ? getSettingsAreaMeta(activeItem.area) : null;

  return (
    <div className="flex-1 flex flex-col bg-surface-dark/30">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/80 bg-background/50">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {area && <span>{t(area.labelKey, area.fallbackLabel)}</span>}
          </div>
          <h3 className="mt-1 text-base font-semibold text-foreground tracking-tight">
            {t(activeItem?.labelKey || "", activeItem?.fallbackLabel || "")}
          </h3>
          {activeItem && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(activeItem.descriptionKey, activeItem.fallbackDescription)}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-surface rounded-lg motion-color motion-press focus-ring"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-info" />
          </div>
        ) : (
          <div className="space-y-6">
            {renderSettingsSection(activeSection, settings, onUpdate)}
          </div>
        )}
      </div>

      {saveMode === "app-settings" ? (
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/80 bg-background/80">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-surface rounded-lg motion-color motion-press focus-ring"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-info hover:bg-info/90 text-white text-sm font-medium rounded-lg motion-color motion-press focus-ring disabled:opacity-50 shadow-sm"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : null}
            {saved
              ? t("settings.saved", "Saved")
              : t("common.save", "Save Settings")}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border/80 bg-background/80">
          <p className="min-w-0 text-xs text-muted-foreground">
            {saveMode === "inline"
              ? t(
                  "settings.inlineSaveHint",
                  "This page saves changes in its own controls.",
                )
              : t("settings.readOnlyHint", "This page is read-only.")}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-surface rounded-lg motion-color motion-press focus-ring"
          >
            {t("common.close", "Close")}
          </button>
        </div>
      )}
    </div>
  );
}
