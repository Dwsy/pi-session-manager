import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useTranslation } from "react-i18next";
import { ask as askNative } from "@tauri-apps/plugin-dialog";
import type { AppSettings, SettingsArea, SettingsSection } from "./types";
import { defaultSettings } from "./types";
import { loadAppSettings, saveAppSettings } from "@/utils/settingsApi";
import { applyPiChatTheme, resolvePiThemeColorScheme } from "@/utils/piTheme";
import { useSettings as useAppSettingsContext } from "@/hooks/useSettings";
import {
  SETTINGS_NAVIGATE_EVENT,
  resolveSettingsSectionId,
} from "./navigation";
import {
  getAvailableSettingsGroups,
  getAvailableSettingsAreas,
  getAvailableSettingsSections,
  getSettingsSectionMeta,
} from "./settingsRegistry";
import { isStandaloneDatasetRuntime } from "@/browser-dataset";
import { psmPluginHost } from "@/plugins/runtime-host";
import {
  searchSettings,
  type SettingsSearchResult,
} from "./settingsSearchIndex";
import MobileSettings from "./MobileSettings";
import SettingsSidebar from "./SettingsSidebar";
import SettingsContent from "./SettingsContent";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { t, i18n } = useTranslation();
  const { reloadSettings } = useAppSettingsContext();
  const standaloneDatasetRuntime = isStandaloneDatasetRuntime();
  const [pluginRegistryVersion, setPluginRegistryVersion] = useState(0);
  const settingsAreas = useMemo(
    () => getAvailableSettingsAreas(),
    [standaloneDatasetRuntime, pluginRegistryVersion],
  );
  const menuItems = useMemo(
    () => getAvailableSettingsSections(),
    [standaloneDatasetRuntime, pluginRegistryVersion],
  );
  const [activeArea, setActiveArea] = useState<SettingsArea>("preferences");
  const menuGroups = useMemo(
    () => getAvailableSettingsGroups(activeArea),
    [activeArea, standaloneDatasetRuntime, pluginRegistryVersion],
  );
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("appearance");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SettingsSearchResult[]>(
    [],
  );
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [visible, setVisible] = useState(false);
  const isMobile = useIsMobile();
  const activeSectionMeta = getSettingsSectionMeta(activeSection);
  const activeSaveMode = activeSectionMeta?.saveMode ?? "app-settings";

  const areaLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const area of settingsAreas) {
      map[area.id] = t(area.labelKey, area.fallbackLabel);
    }
    return map;
  }, [settingsAreas, t]);

  useEffect(() => {
    if (standaloneDatasetRuntime) return;
    return psmPluginHost.subscribe(() => {
      setPluginRegistryVersion((version) => version + 1);
    });
  }, [standaloneDatasetRuntime]);

  // Build section labels map for search results
  const sectionLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of menuItems) {
      const sectionLabel = t(item.labelKey, item.fallbackLabel);
      map[item.id] = `${areaLabels[item.area] || item.area} / ${sectionLabel}`;
    }
    return map;
  }, [areaLabels, menuItems, t]);

  // Run search when query changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const availableSections = new Set(menuItems.map((item) => item.id));
    const results = searchSettings(searchQuery, t, sectionLabels).filter(
      (result) => availableSections.has(result.item.section),
    );
    setSearchResults(results);
  }, [searchQuery, t, sectionLabels, menuItems]);

  // Navigate to a search result and scroll to the element
  const navigateToResult = useCallback((result: SettingsSearchResult) => {
    const section = getSettingsSectionMeta(result.item.section);
    if (section) {
      setActiveArea(section.area);
    }
    setActiveSection(result.item.section);
    setSearchQuery("");
    setSearchResults([]);
    // Poll for the element with timeout (handles Suspense/async loading)
    const selector = `[data-settings-search="${result.item.id}"]`;
    let attempts = 0;
    const tryScroll = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: "center" });
        // Flash highlight via inline style (avoids Tailwind purge issues)
        const prev = {
          outline: el.style.outline,
          outlineOffset: el.style.outlineOffset,
          borderRadius: el.style.borderRadius,
        };
        el.style.outline = "2px solid var(--color-info, #569cd6)";
        el.style.outlineOffset = "2px";
        el.style.borderRadius = "8px";
        setTimeout(() => {
          el.style.outline = prev.outline;
          el.style.outlineOffset = prev.outlineOffset;
          el.style.borderRadius = prev.borderRadius;
        }, 2000);
        return;
      }
      if (++attempts < 20) setTimeout(tryScroll, 50); // 1s max
    };
    setTimeout(tryScroll, 100); // initial delay for section switch
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadSettingsInternal();
    }
  }, [isOpen]);

  useEffect(() => {
    if (settingsAreas.some((area) => area.id === activeArea)) {
      return;
    }
    setActiveArea(settingsAreas[0]?.id || "preferences");
  }, [activeArea, settingsAreas]);

  useEffect(() => {
    if (menuItems.some((item) => item.id === activeSection)) {
      const current = getSettingsSectionMeta(activeSection);
      if (current?.area === activeArea) {
        return;
      }
    }
    const next =
      menuItems.find((item) => item.area === activeArea) || menuItems[0];
    setActiveSection(next?.id || "appearance");
  }, [activeArea, activeSection, menuItems]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const handleNavigate = (event: Event) => {
      const detail = (
        event as CustomEvent<{ section?: SettingsSection | string }>
      ).detail;
      if (!detail?.section) return;
      const resolvedId = resolveSettingsSectionId(
        detail.section,
      ) as SettingsSection;
      const section = getSettingsSectionMeta(resolvedId);
      if (!section) return;
      setActiveArea(section.area);
      setActiveSection(resolvedId);
    };

    window.addEventListener(
      SETTINGS_NAVIGATE_EVENT,
      handleNavigate as EventListener,
    );
    return () =>
      window.removeEventListener(
        SETTINGS_NAVIGATE_EVENT,
        handleNavigate as EventListener,
      );
  }, [isOpen]);

  const settingsRef = useRef(settings);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const hasLoadedRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }

    if (isOpen) {
      setShouldRender(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return;
    }

    setVisible(false);
    closeTimerRef.current = setTimeout(() => {
      setShouldRender(false);
    }, 220);

    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, [isOpen]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Auto-save: native settings panes commit on change. Debounce so that
  // typing into text fields does not hit disk on every keystroke.
  useEffect(() => {
    if (!isOpen || loading || !hasLoadedRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void saveSettings();
    }, 400);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [settings, isOpen, loading]);

  // Flush a pending autosave on unmount so a quick close after an edit
  // never drops the change. saveSettings reads from settingsRef.current
  // so it always sees the latest state.
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        void saveSettings();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the panel is dismissed, flush any pending autosave immediately.
  const wasOpenRef = useRef(isOpen);
  useEffect(() => {
    if (wasOpenRef.current && !isOpen && autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = undefined;
      void saveSettings();
    }
    wasOpenRef.current = isOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const loadSettingsInternal = async () => {
    setLoading(true);
    hasLoadedRef.current = false;
    try {
      const next = await loadAppSettings();
      setSettings(next);
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
      // Allow a frame for state to settle before enabling autosave so the
      // initial load does not trigger a redundant save.
      requestAnimationFrame(() => {
        hasLoadedRef.current = true;
      });
    }
  };

  const saveSettings = async () => {
    const current = settingsRef.current;
    setSaving(true);
    try {
      await saveAppSettings(current);
      i18n.changeLanguage(current.language.locale);

      const root = document.documentElement;
      const {
        theme,
        customTheme,
        fontFamily,
        fontFamilyMono,
        sidebarWidth,
        fontSize,
        messageSpacing,
        codeBlockTheme,
      } = current.appearance;
      root.classList.remove("theme-dark", "theme-light");
      if (theme === "dark") {
        root.classList.add("theme-dark");
      } else if (theme === "light") {
        root.classList.add("theme-light");
      } else if (theme === "custom") {
        const resolvedScheme = await resolvePiThemeColorScheme(customTheme);
        if (resolvedScheme === "dark") {
          root.classList.add("theme-dark");
        } else if (resolvedScheme === "light") {
          root.classList.add("theme-light");
        }
      }
      if (sidebarWidth)
        root.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
      const fontMap: Record<string, string> = {
        small: "14px",
        medium: "16px",
        large: "18px",
      };
      root.style.setProperty("--font-size-base", fontMap[fontSize] || "16px");
      root.style.setProperty("--font-family", fontFamily);
      root.style.setProperty("--font-family-mono", fontFamilyMono);
      const spacingMap: Record<string, string> = {
        compact: "8px",
        comfortable: "16px",
        spacious: "24px",
      };
      root.style.setProperty(
        "--spacing-base",
        spacingMap[messageSpacing] || "16px",
      );
      if (codeBlockTheme) root.setAttribute("data-code-theme", codeBlockTheme);
      await applyPiChatTheme(theme === "custom" ? customTheme : "app-default");
      await reloadSettings();

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof AppSettings>(
    section: K,
    key: keyof AppSettings[K],
    value: any,
  ) => {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }));
  };

  const resetSettings = async () => {
    const message = t(
      "settings.confirmReset",
      "Are you sure you want to reset all settings?",
    );
    let confirmed = false;
    if (standaloneDatasetRuntime) {
      confirmed = window.confirm(message);
    } else {
      try {
        confirmed = await askNative(message, {
          title: t("settings.reset", "Reset Settings"),
          kind: "warning",
        });
      } catch {
        confirmed = window.confirm(message);
      }
    }
    if (!confirmed) {
      return;
    }
    try {
      if (!standaloneDatasetRuntime) {
        await invoke("reset_app_settings");
      }
      localStorage.removeItem("pi-session-manager-settings");
      localStorage.removeItem("app-language");
      setSettings(defaultSettings);
      await i18n.changeLanguage(defaultSettings.language.locale);
      await reloadSettings();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (error) {
      console.error("Failed to reset settings:", error);
    }
  };

  const openConfigFolder = async () => {
    if (standaloneDatasetRuntime) {
      return;
    }
    try {
      const path = await invoke<string>("get_psm_config_dir");
      await invoke("open_path_in_system", { path });
    } catch (error) {
      console.error("Failed to open config folder:", error);
    }
  };

  if (!shouldRender) return null;

  // On the native (Tauri) desktop runtime the panel IS the active window;
  // a heavy black/blur backdrop and outer shadow telegraph "web modal".
  // In the standalone web runtime the panel sits inside a normal browser
  // tab, so we keep the dimmed overlay to anchor it.
  const heavyOverlay = standaloneDatasetRuntime || isMobile;

  return (
    <div
      className={`settings-modal-no-press fixed inset-0 z-50 flex items-center justify-center ${
        heavyOverlay ? "bg-black/60" : "bg-background/60"
      } ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("settings.title", "Settings")}
        className={`${
          isMobile
            ? "w-full h-full rounded-none"
            : heavyOverlay
              ? "h-[95vh] w-[95vw] rounded-lg shadow-xl"
              : "w-[96vw] h-[94vh] rounded-[10px]"
        } border border-border bg-background flex ${
          isMobile ? "flex-col" : ""
        } overflow-hidden ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        {isMobile ? (
          <MobileSettings
            settingsAreas={settingsAreas}
            menuItems={menuItems}
            menuGroups={menuGroups}
            activeArea={activeArea}
            onAreaChange={setActiveArea}
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            settings={settings}
            loading={loading}
            onUpdate={updateSetting}
            onClose={onClose}
            onSave={saveSettings}
            onOpenConfigFolder={openConfigFolder}
            onReset={resetSettings}
            saving={saving}
            saved={saved}
            activeSaveMode={activeSaveMode}
            canOpenConfigFolder={!standaloneDatasetRuntime}
          />
        ) : (
          <>
            <SettingsSidebar
              settingsAreas={settingsAreas}
              menuItems={menuItems}
              menuGroups={menuGroups}
              activeArea={activeArea}
              onAreaChange={setActiveArea}
              activeSection={activeSection}
              onSectionChange={setActiveSection}
              onOpenConfigFolder={openConfigFolder}
              onReset={resetSettings}
              canOpenConfigFolder={!standaloneDatasetRuntime}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              searchResults={searchResults}
              onNavigateToResult={navigateToResult}
            />
            <SettingsContent
              menuItems={menuItems}
              activeSection={activeSection}
              settings={settings}
              loading={loading}
              onUpdate={updateSetting}
              onClose={onClose}
              onSave={saveSettings}
              saving={saving}
              saved={saved}
              saveMode={activeSaveMode}
            />
          </>
        )}
      </div>
    </div>
  );
}
