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
    <div className="flex w-64 flex-col overflow-y-auto border-r border-border bg-background">
      <div className="px-5 py-4 flex-shrink-0">
        <h2 className="text-base font-semibold text-foreground tracking-tight">
          {t("settings.title", "Settings")}
        </h2>
      </div>

      <div className="px-3 pb-1 flex-shrink-0">
        <div
          className="mb-2 grid overflow-hidden rounded-md border border-border"
          style={{
            gridTemplateColumns: `repeat(${Math.max(settingsAreas.length, 1)}, minmax(0, 1fr))`,
          }}
        >
          {settingsAreas.map((area) => (
            <button
              key={area.id}
              onClick={() => onAreaChange(area.id)}
              aria-pressed={activeArea === area.id}
              className={`focus-ring min-h-[30px] truncate border-r border-border px-2 text-xs font-medium last:border-r-0 ${
                activeArea === area.id
                  ? "settings-accent-bg-soft settings-accent-ring settings-accent-fg font-semibold"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
            className="focus-ring w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground"
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
            <div className="settings-section-label px-2 pb-1">
              {t("settings.searchResults", "Settings")} ({searchResults.length})
            </div>
            {searchResults.map((result) => (
              <button
                key={result.item.id}
                onClick={() => onNavigateToResult(result)}
                className="group focus-ring flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left hover:bg-muted"
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
            <Search className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground/60">
              {t("settings.searchEmpty", "No matching settings")}
            </p>
          </div>
        )}

        {/* Regular section navigation (when no search query) */}
        {!trimmedQuery &&
          navGroups.map((group) => (
            <section key={group.id} className="space-y-1">
              <div className="settings-section-label px-2">
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
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => onSectionChange(item.id)}
                            className={`focus-ring flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${
                              activeSection === item.id
                                ? "settings-accent-bg-soft settings-accent-ring text-foreground font-medium"
                                : isActive
                                  ? "bg-muted/60 text-foreground"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                          >
                            <span className={activeSection === item.id || isActive ? "settings-accent-fg" : ""}>
                              {item.icon}
                            </span>
                            <span className="flex-1 truncate text-left">
                              {t(item.labelKey, item.fallbackLabel)}
                            </span>
                          </button>
                          {hasChildren && (
                            <button
                              type="button"
                              onClick={() => toggleCollapsed(item.id)}
                              className="focus-ring flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label={
                                isExpanded
                                  ? t("common.collapse", "Collapse")
                                  : t("common.expand", "Expand")
                              }
                              aria-expanded={isExpanded}
                            >
                              <ChevronRight
                                className={`h-3.5 w-3.5 motion-transform ${
                                  isExpanded ? "rotate-90" : ""
                                }`}
                              />
                            </button>
                          )}
                        </div>
                        {hasChildren && isExpanded && (
                          <div className="space-y-0.5 pl-6">
                            {children.map((child) => (
                              <button
                                key={child.id}
                                onClick={() => onSectionChange(child.id)}
                                className={`focus-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs ${
                                  activeSection === child.id
                                    ? "settings-accent-bg-soft settings-accent-ring text-foreground font-medium"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                }`}
                              >
                                <span
                                  className={
                                    activeSection === child.id ? "settings-accent-fg" : ""
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

      <div className="px-3 py-2 border-t border-border/60 flex-shrink-0 flex items-center justify-between gap-1">
        {canOpenConfigFolder ? (
          <button
            onClick={onOpenConfigFolder}
            aria-label={t("settings.openConfigFolder", "Open Config Folder")}
            title={t("settings.openConfigFolder", "Open Config Folder")}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded motion-color focus-ring"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span>{t("settings.openConfigFolder", "Open Config Folder")}</span>
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={onReset}
          aria-label={t("settings.reset", "Reset Settings")}
          title={t("settings.reset", "Reset Settings")}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded motion-color focus-ring"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
