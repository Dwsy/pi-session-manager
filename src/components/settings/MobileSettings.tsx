import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import CompositionInput from "@/components/ui/CompositionInput";
import type {
  AppSettings,
  SettingsArea,
  SettingsSaveMode,
  SettingsSection,
} from "./types";
import type {
  SettingsAreas,
  SettingsGroups,
  SettingsSections,
  SettingsUpdateHandler,
} from "./SettingsPanelTypes";
import { getSettingsSectionMeta, renderSettingsSection } from "./settingsRegistry";
import { searchSettings, type SettingsSearchResult } from "./settingsSearchIndex";

interface MobileSettingsProps {
  settingsAreas: SettingsAreas;
  menuItems: SettingsSections;
  menuGroups: SettingsGroups;
  activeArea: SettingsArea;
  onAreaChange: (area: SettingsArea) => void;
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  settings: AppSettings;
  loading: boolean;
  onUpdate: SettingsUpdateHandler;
  onClose: () => void;
  onSave: () => void;
  onOpenConfigFolder: () => void;
  onReset: () => void;
  saving: boolean;
  saved: boolean;
  activeSaveMode: SettingsSaveMode;
  canOpenConfigFolder: boolean;
}

export default function MobileSettings({
  settingsAreas,
  menuItems,
  menuGroups,
  activeArea,
  onAreaChange,
  activeSection,
  onSectionChange,
  settings,
  loading,
  onUpdate,
  onClose,
  onSave,
  onOpenConfigFolder,
  onReset,
  saving,
  saved,
  activeSaveMode,
  canOpenConfigFolder,
}: MobileSettingsProps) {
  const { t } = useTranslation();
  const [showDetail, setShowDetail] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [mobileSearchQuery, setMobileSearchQuery] = useState("");
  const [mobileSearchResults, setMobileSearchResults] = useState<SettingsSearchResult[]>([]);
  const sectionMap = new Map(menuItems.map((item) => [item.id, item]));

  const mobileTrimmedQuery = mobileSearchQuery.trim().toLowerCase();

  const mobileAreaLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const area of settingsAreas) {
      map[area.id] = t(area.labelKey, area.fallbackLabel);
    }
    return map;
  }, [settingsAreas, t]);

  // Build section labels for mobile search
  const mobileSectionLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of menuItems) {
      const sectionLabel = t(item.labelKey, item.fallbackLabel);
      map[item.id] = `${mobileAreaLabels[item.area] || item.area} / ${sectionLabel}`;
    }
    return map;
  }, [menuItems, mobileAreaLabels, t]);

  // Run mobile search
  useEffect(() => {
    if (!mobileTrimmedQuery) {
      setMobileSearchResults([]);
      return;
    }
    const availableSections = new Set(menuItems.map((item) => item.id));
    setMobileSearchResults(
      searchSettings(mobileSearchQuery, t, mobileSectionLabels).filter(
        (result) => availableSections.has(result.item.section),
      ),
    );
  }, [mobileSearchQuery, t, mobileSectionLabels, menuItems]);

  const filteredMobileGroups = useMemo(() => {
    if (!mobileTrimmedQuery || mobileSearchResults.length > 0) return menuGroups;
    return menuGroups
      .map((group) => ({
        ...group,
        sections: group.sections.filter((id) => {
          const item = menuItems.find((m) => m.id === id);
          if (!item) return false;
          const label = t(item.labelKey, item.fallbackLabel).toLowerCase();
          const fallback = item.fallbackLabel.toLowerCase();
          return label.includes(mobileTrimmedQuery) || fallback.includes(mobileTrimmedQuery);
        }),
      }))
      .filter((group) => group.sections.length > 0);
  }, [menuGroups, menuItems, mobileTrimmedQuery, t, mobileSearchResults.length]);

  const handleMobileResultClick = (result: SettingsSearchResult) => {
    const section = getSettingsSectionMeta(result.item.section);
    if (section) {
      onAreaChange(section.area);
    }
    onSectionChange(result.item.section);
    setMobileSearchQuery("");
    setMobileSearchResults([]);
    setAnimating(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setShowDetail(true));
    });
  };

  const handleSectionClick = (id: SettingsSection) => {
    onSectionChange(id);
    setAnimating(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setShowDetail(true));
    });
  };

  const handleAreaClick = (area: SettingsArea) => {
    onAreaChange(area);
    setMobileSearchQuery("");
    setMobileSearchResults([]);
    setShowDetail(false);
  };

  const handleBack = () => {
    setShowDetail(false);
    setAnimating(true);
  };

  const handleTransitionEnd = () => {
    setAnimating(false);
  };

  const shouldRenderDetail = showDetail || animating;
  const shouldRenderList = !showDetail || animating;
  const listTransform = showDetail ? "translateX(-100%)" : "translateX(0)";
  const detailTransform = showDetail ? "translateX(0)" : "translateX(100%)";
  const transitionStyle = {
    transition:
      "transform var(--motion-duration-overlay) var(--motion-ease-standard), opacity var(--motion-duration-overlay) var(--motion-ease-standard)",
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      {shouldRenderList && (
        <div
          className="absolute inset-0 flex flex-col bg-surface-dark"
          style={{
            transform: listTransform,
            opacity: showDetail ? 0 : 1,
            ...transitionStyle,
          }}
          onTransitionEnd={!showDetail ? handleTransitionEnd : undefined}
        >
          <div className="flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm flex-shrink-0 safe-area-top">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {t("settings.title", "Settings")}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("settings.mobile.browseByGroup", "Browse by group")}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg motion-color motion-press focus-ring"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-4 pt-2 pb-1 flex-shrink-0">
            <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-surface p-1">
              {settingsAreas.map((area) => (
                <button
                  key={area.id}
                  onClick={() => handleAreaClick(area.id)}
                  className={`min-h-[36px] rounded-md px-3 text-xs font-medium motion-color motion-press focus-ring ${
                    activeArea === area.id
                      ? "bg-info text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(area.labelKey, area.fallbackLabel)}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
              <CompositionInput
                type="text"
                value={mobileSearchQuery}
                onChange={setMobileSearchQuery}
                placeholder={t("settings.searchPlaceholder", "Search settings...")}
                className="w-full pl-8 pr-3 py-2 text-sm bg-surface/60 border border-border/60 rounded-lg text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-info/50 focus:ring-1 focus:ring-info/20 transition-colors"
              />
              {mobileSearchQuery && (
                <button
                  onClick={() => setMobileSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground/60 hover:text-foreground rounded transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="space-y-4 px-3 py-3">
              {/* Mobile search results */}
              {mobileTrimmedQuery && mobileSearchResults.length > 0 && (
                <div className="space-y-1">
                  <div className="px-1 pb-1 text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-[0.14em]">
                    {t("settings.searchResults", "Settings")} ({mobileSearchResults.length})
                  </div>
                  {mobileSearchResults.map((result) => (
                    <button
                      key={result.item.id}
                      onClick={() => handleMobileResultClick(result)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left motion-color focus-ring hover:bg-surface/80"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground truncate">
                          {result.settingLabel}
                        </div>
                        <div className="text-[11px] text-muted-foreground/70">
                          {result.sectionLabel}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {/* No mobile search results */}
              {mobileTrimmedQuery && mobileSearchResults.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <Search className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground/60">
                    {t("settings.searchEmpty", "No matching settings")}
                  </p>
                </div>
              )}

              {/* Section groups (when no search or no results) */}
              {!mobileTrimmedQuery &&
                filteredMobileGroups.map((group) => {
                const items = group.sections
                  .map((id) => sectionMap.get(id))
                  .filter(Boolean);

                if (items.length === 0) return null;

                return (
                  <section key={group.id} className="space-y-2">
                    <div className="px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      {t(group.labelKey, group.fallbackLabel)}
                    </div>
                    <div className="overflow-hidden rounded-xl border border-border/70 bg-background/35">
                      {items.map((item, index) => {
                        if (!item) return null;
                        const isActive = activeSection === item.id;
                        const isPluginChild = item.id.startsWith("psm-plugin:");

                        return (
                          <button
                            key={item.id}
                            onClick={() => handleSectionClick(item.id)}
                            className={`w-full flex items-center gap-3 text-left motion-color focus-ring ${
                              isPluginChild ? "px-7 py-2.5 text-xs" : "px-4 py-3 text-sm"
                            } ${
                              index !== items.length - 1
                                ? "border-b border-border/60"
                                : ""
                            } ${
                              isActive
                                ? "bg-info/10 text-foreground"
                                : "text-foreground hover:bg-surface"
                            }`}
                          >
                            <span
                              className={
                                isActive ? "text-info" : "text-muted-foreground"
                              }
                            >
                              {item.icon}
                            </span>
                            <span className="flex-1 text-left">
                              {t(item.labelKey, item.fallbackLabel)}
                            </span>
                            {isActive && (
                              <span className="rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-medium text-info">
                                {t("common.current", "Current")}
                              </span>
                            )}
                            {!isPluginChild && <ChevronRight className="h-4 w-4 text-muted-foreground/50" />}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            <div className="border-t border-border bg-background/95 px-4 py-4 backdrop-blur-sm safe-area-bottom">
              <div
                className={`grid gap-3 ${canOpenConfigFolder ? "grid-cols-2" : "grid-cols-1"}`}
              >
                {canOpenConfigFolder && (
                  <button
                    onClick={onOpenConfigFolder}
                    className="flex items-center justify-center gap-2 min-h-[44px] px-4 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg border border-border motion-color motion-surface motion-press focus-ring"
                  >
                    <FolderOpen className="h-4 w-4" />
                    {t("settings.openConfigFolder", "Open Config Folder")}
                  </button>
                )}
                <button
                  onClick={onReset}
                  className="flex items-center justify-center gap-2 min-h-[44px] px-4 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg border border-border motion-color motion-surface motion-press focus-ring"
                >
                  <RefreshCw className="h-4 w-4" />
                  {t("settings.reset", "Reset Settings")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {shouldRenderDetail && (
        <div
          className="absolute inset-0 flex flex-col bg-surface-dark"
          style={{
            transform: detailTransform,
            ...transitionStyle,
          }}
          onTransitionEnd={showDetail ? handleTransitionEnd : undefined}
        >
          <div className="flex items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm flex-shrink-0 safe-area-top">
            <button
              onClick={handleBack}
              className="p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg motion-color motion-press focus-ring"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-medium text-foreground">
                {t(
                  menuItems.find((i) => i.id === activeSection)?.labelKey || "",
                  menuItems.find((i) => i.id === activeSection)
                    ?.fallbackLabel || "",
                )}
              </h3>
              <p className="truncate text-[11px] text-muted-foreground">
                {t(
                  "settings.mobile.sectionDetail",
                  "Tap back to switch section",
                )}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg motion-color motion-press focus-ring"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 overscroll-contain sm:px-4 sm:py-4">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-info" />
              </div>
            ) : (
              <div className="space-y-5">
                {renderSettingsSection(activeSection, settings, onUpdate)}
              </div>
            )}
          </div>

          {activeSaveMode === "app-settings" ? (
            <div className="grid grid-cols-2 gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm flex-shrink-0 safe-area-bottom">
              <button
                onClick={handleBack}
                className="min-h-[44px] px-4 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg motion-color motion-surface motion-press focus-ring flex items-center justify-center"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                onClick={onSave}
                disabled={saving}
                className="flex items-center justify-center gap-2 min-h-[44px] px-4 bg-info hover:bg-info/80 text-white text-sm font-medium rounded-lg motion-color motion-press focus-ring disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saved ? (
                  <Check className="h-4 w-4" />
                ) : null}
                {saved
                  ? t("settings.saved", "Saved")
                  : t("common.save", "Save")}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm flex-shrink-0 safe-area-bottom">
              <span className="min-w-0 text-xs text-muted-foreground">
                {activeSaveMode === "inline"
                  ? t(
                      "settings.inlineSaveHint",
                      "This page saves changes in its own controls.",
                    )
                  : t("settings.readOnlyHint", "This page is read-only.")}
              </span>
              <button
                onClick={handleBack}
                className="min-h-[44px] px-4 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg motion-color motion-surface motion-press focus-ring flex items-center justify-center"
              >
                {t("common.back", "Back")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
