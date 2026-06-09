import { useTranslation } from "react-i18next";
import { Check, Loader2, X } from "lucide-react";

import type { AppSettings, SettingsSaveMode, SettingsSection } from "./types";
import type { SettingsSections, SettingsUpdateHandler } from "./SettingsPanelTypes";
import { renderSettingsSection } from "./settingsRegistry";

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
  saving,
  saved,
  saveMode,
}: SettingsContentProps) {
  const { t } = useTranslation();
  const activeItem = menuItems.find((item) => item.id === activeSection);

  const showStatus = saveMode === "app-settings" && (saving || saved);
  const statusLabel = saving
    ? t("settings.saving", "Saving…")
    : t("settings.savedJustNow", "Saved");

  return (
    <div className="flex-1 flex flex-col bg-surface-dark/20">
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border/60">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground tracking-tight">
            {t(activeItem?.labelKey || "", activeItem?.fallbackLabel || "")}
          </h3>
          {activeItem && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(activeItem.descriptionKey, activeItem.fallbackDescription)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {showStatus && (
            <span
              aria-live="polite"
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5 settings-accent-fg" />
              )}
              {statusLabel}
            </span>
          )}
          {saveMode === "inline" && (
            <span className="hidden sm:inline text-xs text-muted-foreground">
              {t(
                "settings.inlineSaveHint",
                "This page saves changes in its own controls.",
              )}
            </span>
          )}
          {saveMode === "read-only" && (
            <span className="hidden sm:inline text-xs text-muted-foreground">
              {t("settings.readOnlyHint", "This page is read-only.")}
            </span>
          )}
          <button
            onClick={onClose}
            aria-label={t("common.close", "Close")}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-surface rounded-md motion-color focus-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin settings-accent-fg" />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-7xl space-y-6">
            {renderSettingsSection(activeSection, settings, onUpdate)}
          </div>
        )}
      </div>
    </div>
  );
}
