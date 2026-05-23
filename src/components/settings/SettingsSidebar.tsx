import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ChevronRight,
  FolderOpen,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import CompositionInput from "@/components/ui/CompositionInput";
import type { SettingsArea, SettingsSection } from "./types";
import type {
  SettingsAreas,
  SettingsGroups,
  SettingsSections,
} from "./SettingsPanelTypes";
import type { SettingsSearchResult } from "./settingsSearchIndex";

interface SettingsSidebarProps {
  settingsAreas: SettingsAreas;
  menuItems: SettingsSections;
  menuGroups: SettingsGroups;
  activeArea: SettingsArea;
  onAreaChange: (area: SettingsArea) => void;
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onOpenConfigFolder: () => void;
  onReset: () => void;
  canOpenConfigFolder: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchResults: SettingsSearchResult[];
  onNavigateToResult: (result: SettingsSearchResult) => void;
}

export default function SettingsSidebar({
  settingsAreas,
  menuItems,
  menuGroups,
  activeArea,
  onAreaChange,
  activeSection,
  onSectionChange,
  onOpenConfigFolder,
  onReset,
  canOpenConfigFolder,
  searchQuery,
  onSearchChange,
  searchResults,
  onNavigateToResult,
}: SettingsSidebarProps) {
  const { t } = useTranslation();
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const hasSearchResults = !!trimmedQuery && searchResults.length > 0;
  const hasNoResults = !!trimmedQuery && searchResults.length === 0;

  const filteredGroups = useMemo(() => {
    if (!trimmedQuery || hasSearchResults) return menuGroups;
    return menuGroups
      .map((group) => ({
        ...group,
        sections: group.sections.filter((id) => {
          const item = menuItems.find((m) => m.id === id);
          if (!item) return false;
          const label = t(item.labelKey, item.fallbackLabel).toLowerCase();
          const fallback = item.fallbackLabel.toLowerCase();
          return label.includes(trimmedQuery) || fallback.includes(trimmedQuery);
        }),
      }))
      .filter((group) => group.sections.length > 0);
  }, [menuGroups, menuItems, trimmedQuery, t, hasSearchResults]);

  return (
    <div className="w-64 bg-background/95 border-r border-border flex flex-col overflow-y-auto">
      <div className="p-5 border-b border-border/80 flex-shrink-0">
        <h2 className="text-lg font-semibold text-foreground tracking-tight">
          {t("settings.title", "Settings")}
        </h2>
        <p className="text-xs text-muted-foreground mt-1.5">
          {t("settings.subtitle", "Customize your experience")}
        </p>
      </div>

      <div className="px-3 pt-3 pb-1 flex-shrink-0">
        <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-surface p-1">
          {settingsAreas.map((area) => (
            <button
              key={area.id}
              onClick={() => onAreaChange(area.id)}
              className={`min-h-[36px] rounded-md px-3 text-xs font-medium motion-color motion-press focus-ring ${
                activeArea === area.id
                  ? "bg-info text-white shadow-sm"
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
            value={searchQuery}
            onChange={onSearchChange}
            placeholder={t("settings.searchPlaceholder", "Search settings...")}
            className="w-full pl-8 pr-3 py-2 text-sm bg-surface/60 border border-border/60 rounded-lg text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-info/50 focus:ring-1 focus:ring-info/20 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground/60 hover:text-foreground rounded transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 p-2 space-y-4 overflow-y-auto">
        {/* Search results from index */}
        {trimmedQuery && searchResults.length > 0 && (
          <div className="space-y-1">
            <div className="px-2 pb-1 text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-[0.14em]">
              {t("settings.searchResults", "Settings")} ({searchResults.length})
            </div>
            {searchResults.map((result) => (
              <button
                key={result.item.id}
                onClick={() => onNavigateToResult(result)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left motion-surface motion-color motion-press focus-ring hover:bg-surface/80 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-foreground truncate">
                    {result.settingLabel}
                  </div>
                  <div className="text-[11px] text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                    <span>{result.sectionLabel}</span>
                    <ArrowRight className="h-2.5 w-2.5 opacity-50" />
                  </div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-info flex-shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* No search results */}
        {hasNoResults && (
          <div className="px-3 py-8 text-center">
            <Search className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground/60">
              {t("settings.searchEmpty", "No matching settings")}
            </p>
          </div>
        )}

        {/* Regular section navigation (when no search query) */}
        {!trimmedQuery &&
          filteredGroups.map((group) => (
            <section key={group.id} className="space-y-1.5">
              <div className="px-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t(group.labelKey, group.fallbackLabel)}
              </div>
              <div className="space-y-0.5">
                {group.sections
                  .map((id) => menuItems.find((item) => item.id === id))
                  .filter(Boolean)
                  .map((item) => {
                    const isPluginChild = item!.id.startsWith("psm-plugin:");
                    return (
                    <button
                      key={item!.id}
                      onClick={() => onSectionChange(item!.id)}
                      className={`w-full flex items-center gap-3 rounded-lg motion-surface motion-color motion-press focus-ring ${
                        isPluginChild ? "ml-6 w-[calc(100%-1.5rem)] px-2.5 py-2 text-xs" : "px-3 py-2.5 text-sm"
                      } ${
                        activeSection === item!.id
                          ? "bg-info/15 text-foreground ring-1 ring-info/30"
                          : "text-muted-foreground hover:text-foreground hover:bg-surface/80"
                      }`}
                    >
                      <span className={activeSection === item!.id ? "text-info" : ""}>
                        {item!.icon}
                      </span>
                      <span className="flex-1 text-left">
                        {t(item!.labelKey, item!.fallbackLabel)}
                      </span>
                      {!isPluginChild && (
                        <ChevronRight
                          className={`h-4 w-4 motion-transform text-muted-foreground/50 ${
                            activeSection === item!.id ? "rotate-90 text-info/70" : ""
                          }`}
                        />
                      )}
                    </button>
                  )})}
              </div>
            </section>
          ))}
      </nav>

      <div className="p-3 border-t border-border/80 flex-shrink-0 space-y-2">
        {canOpenConfigFolder && (
          <button
            onClick={onOpenConfigFolder}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-surface/80 rounded-lg motion-color motion-press focus-ring"
          >
            <FolderOpen className="h-4 w-4" />
            {t("settings.openConfigFolder", "Open Config Folder")}
          </button>
        )}
        <button
          onClick={onReset}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-surface/80 rounded-lg motion-color motion-press focus-ring"
        >
          <RefreshCw className="h-4 w-4" />
          {t("settings.reset", "Reset Settings")}
        </button>
      </div>
    </div>
  );
}
