import { useEffect, useMemo, useState } from "react";
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

interface SettingsNavItem {
  item: SettingsSections[number];
  children: SettingsSections[number][];
}

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
  const [collapsedSections, setCollapsedSections] = useState<
    Set<SettingsSection>
  >(new Set());

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

  const navGroups = useMemo(
    () =>
      filteredGroups.map((group) => {
        const items = group.sections
          .map((id) => menuItems.find((item) => item.id === id))
          .filter(Boolean) as SettingsSections;
        const byId = new Map(items.map((item) => [item.id, item]));
        const consumed = new Set<SettingsSection>();
        const navItems: SettingsNavItem[] = [];

        for (const item of items) {
          if (consumed.has(item.id) || item.id.startsWith("psm-plugin:")) {
            continue;
          }
          const children =
            item.id === "psm-plugins"
              ? items.filter((candidate) =>
                  candidate.id.startsWith("psm-plugin:"),
                )
              : [];
          children.forEach((child) => consumed.add(child.id));
          navItems.push({ item: byId.get(item.id) || item, children });
        }

        return { ...group, navItems };
      }),
    [filteredGroups, menuItems],
  );

  useEffect(() => {
    if (!activeSection.startsWith("psm-plugin:")) return;
    setCollapsedSections((prev) => {
      if (!prev.has("psm-plugins")) return prev;
      const next = new Set(prev);
      next.delete("psm-plugins");
      return next;
    });
  }, [activeSection]);

  const toggleCollapsed = (section: SettingsSection) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  return (
    <div className="w-64 bg-background/95 border-r border-border flex flex-col overflow-y-auto">
      <div className="px-5 py-4 border-b border-border/80 flex-shrink-0">
        <h2 className="text-base font-semibold text-foreground tracking-tight">
          {t("settings.title", "Settings")}
        </h2>
        <p className="text-[11px] text-muted-foreground mt-1">
          {t("settings.subtitle", "Customize your experience")}
        </p>
      </div>

      <div className="px-3 pt-2.5 pb-1 flex-shrink-0">
        <div
          className="mb-2 grid gap-1 rounded-lg bg-surface p-1"
          style={{
            gridTemplateColumns: `repeat(${Math.max(settingsAreas.length, 1)}, minmax(0, 1fr))`,
          }}
        >
          {settingsAreas.map((area) => (
            <button
              key={area.id}
              onClick={() => onAreaChange(area.id)}
              className={`min-h-[32px] truncate rounded-md px-2 text-xs font-medium motion-color motion-press focus-ring ${
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
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-surface/60 border border-border/60 rounded-lg text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-info/50 focus:ring-1 focus:ring-info/20 transition-colors"
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

      <nav className="flex-1 p-2 space-y-2.5 overflow-y-auto">
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
          navGroups.map((group) => (
            <section key={group.id} className="space-y-1">
              <div className="px-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t(group.labelKey, group.fallbackLabel)}
              </div>
              <div className="space-y-0.5">
                {group.navItems.map(({ item, children }) => {
                    const isExpanded = !collapsedSections.has(item.id);
                    const hasChildren = children.length > 0;
                    const isActive =
                      activeSection === item.id ||
                      children.some((child) => child.id === activeSection);
                    return (
                      <div key={item.id} className="space-y-0.5">
                        <button
                          onClick={() => onSectionChange(item.id)}
                          className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm motion-surface motion-color motion-press focus-ring ${
                            activeSection === item.id
                              ? "bg-info/15 text-foreground ring-1 ring-info/30"
                              : isActive
                                ? "text-foreground bg-surface/55"
                                : "text-muted-foreground hover:text-foreground hover:bg-surface/80"
                          }`}
                        >
                          <span
                            className={
                              activeSection === item.id || isActive
                                ? "text-info"
                                : ""
                            }
                          >
                            {item.icon}
                          </span>
                          <span className="flex-1 text-left">
                            {t(item.labelKey, item.fallbackLabel)}
                          </span>
                          {hasChildren && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleCollapsed(item.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  toggleCollapsed(item.id);
                                }
                              }}
                              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:bg-secondary hover:text-foreground"
                              aria-label={
                                isExpanded
                                  ? t("common.collapse", "Collapse")
                                  : t("common.expand", "Expand")
                              }
                            >
                              <ChevronRight
                                className={`h-3.5 w-3.5 motion-transform ${
                                  isExpanded ? "rotate-90" : ""
                                }`}
                              />
                            </span>
                          )}
                        </button>
                        {hasChildren && isExpanded && (
                          <div className="space-y-0.5 pl-6">
                            {children.map((child) => (
                              <button
                                key={child.id}
                                onClick={() => onSectionChange(child.id)}
                                className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs motion-surface motion-color motion-press focus-ring ${
                                  activeSection === child.id
                                    ? "bg-info/15 text-foreground ring-1 ring-info/30"
                                    : "text-muted-foreground hover:text-foreground hover:bg-surface/80"
                                }`}
                              >
                                <span
                                  className={
                                    activeSection === child.id ? "text-info" : ""
                                  }
                                >
                                  {child.icon}
                                </span>
                                <span className="flex-1 text-left">
                                  {t(child.labelKey, child.fallbackLabel)}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </section>
          ))}
      </nav>

      <div className="p-2.5 border-t border-border/80 flex-shrink-0 space-y-1.5">
        {canOpenConfigFolder && (
          <button
            onClick={onOpenConfigFolder}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-surface/80 rounded-lg motion-color motion-press focus-ring"
          >
            <FolderOpen className="h-4 w-4" />
            {t("settings.openConfigFolder", "Open Config Folder")}
          </button>
        )}
        <button
          onClick={onReset}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-surface/80 rounded-lg motion-color motion-press focus-ring"
        >
          <RefreshCw className="h-4 w-4" />
          {t("settings.reset", "Reset Settings")}
        </button>
      </div>
    </div>
  );
}
