import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useTranslation } from "react-i18next";
import {
  X,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Check,
  RefreshCw,
  FolderOpen,
} from "lucide-react";

import type { AppSettings, SettingsSection } from "./types";
import { defaultSettings } from "./types";
import { loadAppSettings, saveAppSettings } from "@/utils/settingsApi";
import { applyPiChatTheme, resolvePiThemeColorScheme } from "@/utils/piTheme";
import { useSettings as useAppSettingsContext } from "@/hooks/useSettings";
import {
  SETTINGS_GROUPS,
  SETTINGS_SECTIONS,
  renderSettingsSection,
} from "./settingsRegistry";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { t, i18n } = useTranslation();
  const { reloadSettings } = useAppSettingsContext();
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("terminal");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [visible, setVisible] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isOpen) {
      void loadSettingsInternal();
    }
  }, [isOpen]);

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

  const settingsRef = useRef(settings);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>();

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

  useEffect(() => {
    if (!isOpen) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(async () => {
      try {
        await saveAppSettings(settingsRef.current);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } catch (error) {
        console.error("Auto-save failed:", error);
      }
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [settings, isOpen]);

  const loadSettingsInternal = async () => {
    setLoading(true);
    try {
      const next = await loadAppSettings();
      setSettings(next);
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await saveAppSettings(settings);
      i18n.changeLanguage(settings.language.locale);

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
      } = settings.appearance;
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

  const resetSettings = () => {
    if (
      confirm(
        t(
          "settings.confirmReset",
          "Are you sure you want to reset all settings?",
        ),
      )
    ) {
      setSettings(defaultSettings);
    }
  };

  const openConfigFolder = async () => {
    try {
      const path = await invoke<string>("get_psm_config_dir");
      await invoke("open_path_in_system", { path });
    } catch (error) {
      console.error("Failed to open config folder:", error);
    }
  };

  if (!shouldRender) return null;

  return (
    <div
      className={`settings-modal-no-press fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity duration-200 ease-out ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className={`${
          isMobile
            ? "w-full h-full rounded-none"
            : "w-[1320px] h-[780px] max-w-[96vw] max-h-[92vh] rounded-xl"
        } bg-surface-dark border border-border shadow-2xl flex ${
          isMobile ? "flex-col" : ""
        } overflow-hidden transition-all duration-200 ease-out ${
          visible
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-2 scale-[0.985] opacity-0"
        }`}
      >
        {isMobile ? (
          <MobileSettings
            menuItems={SETTINGS_SECTIONS}
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
          />
        ) : (
          <>
            <SettingsSidebar
              menuItems={SETTINGS_SECTIONS}
              activeSection={activeSection}
              onSectionChange={setActiveSection}
              onOpenConfigFolder={openConfigFolder}
              onReset={resetSettings}
            />
            <SettingsContent
              menuItems={SETTINGS_SECTIONS}
              activeSection={activeSection}
              settings={settings}
              loading={loading}
              onUpdate={updateSetting}
              onClose={onClose}
              onSave={saveSettings}
              saving={saving}
              saved={saved}
            />
          </>
        )}
      </div>
    </div>
  );
}

interface MobileSettingsProps {
  menuItems: typeof SETTINGS_SECTIONS;
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  settings: AppSettings;
  loading: boolean;
  onUpdate: <K extends keyof AppSettings>(
    section: K,
    key: keyof AppSettings[K],
    value: any,
  ) => void;
  onClose: () => void;
  onSave: () => void;
  onOpenConfigFolder: () => void;
  onReset: () => void;
  saving: boolean;
  saved: boolean;
}

function MobileSettings({
  menuItems,
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
}: MobileSettingsProps) {
  const { t } = useTranslation();
  const [showDetail, setShowDetail] = useState(false);
  const [animating, setAnimating] = useState(false);
  const sectionMap = new Map(menuItems.map((item) => [item.id, item]));

  const handleSectionClick = (id: SettingsSection) => {
    onSectionChange(id);
    setAnimating(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setShowDetail(true));
    });
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

          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="space-y-4 px-3 py-3">
              {SETTINGS_GROUPS.map((group) => {
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

                        return (
                          <button
                            key={item.id}
                            onClick={() => handleSectionClick(item.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm motion-color focus-ring ${
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
                            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            <div className="border-t border-border bg-background/95 px-4 py-4 backdrop-blur-sm safe-area-bottom">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={onOpenConfigFolder}
                  className="flex items-center justify-center gap-2 min-h-[44px] px-4 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg border border-border motion-color motion-surface motion-press focus-ring"
                >
                  <FolderOpen className="h-4 w-4" />
                  {t("settings.openConfigFolder", "Open Config Folder")}
                </button>
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
              {saved ? t("settings.saved", "Saved") : t("common.save", "Save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface SettingsSidebarProps {
  menuItems: typeof SETTINGS_SECTIONS;
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onOpenConfigFolder: () => void;
  onReset: () => void;
}

function SettingsSidebar({
  menuItems,
  activeSection,
  onSectionChange,
  onOpenConfigFolder,
  onReset,
}: SettingsSidebarProps) {
  const { t } = useTranslation();

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

      <nav className="flex-1 p-2 space-y-0.5">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm motion-surface motion-color motion-press focus-ring ${
              activeSection === item.id
                ? "bg-info/15 text-foreground ring-1 ring-info/30"
                : "text-muted-foreground hover:text-foreground hover:bg-surface/80"
            }`}
          >
            <span className={activeSection === item.id ? "text-info" : ""}>
              {item.icon}
            </span>
            <span className="flex-1 text-left">
              {t(item.labelKey, item.fallbackLabel)}
            </span>
            <ChevronRight
              className={`h-4 w-4 motion-transform text-muted-foreground/50 ${
                activeSection === item.id ? "rotate-90 text-info/70" : ""
              }`}
            />
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-border/80 flex-shrink-0 space-y-2">
        <button
          onClick={onOpenConfigFolder}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-surface/80 rounded-lg motion-color motion-press focus-ring"
        >
          <FolderOpen className="h-4 w-4" />
          {t("settings.openConfigFolder", "Open Config Folder")}
        </button>
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

interface SettingsContentProps {
  menuItems: typeof SETTINGS_SECTIONS;
  activeSection: SettingsSection;
  settings: AppSettings;
  loading: boolean;
  onUpdate: <K extends keyof AppSettings>(
    section: K,
    key: keyof AppSettings[K],
    value: any,
  ) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}

function SettingsContent({
  menuItems,
  activeSection,
  settings,
  loading,
  onUpdate,
  onClose,
  onSave,
  saving,
  saved,
}: SettingsContentProps) {
  const { t } = useTranslation();

  return (
    <div className="flex-1 flex flex-col bg-surface-dark/30">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/80 bg-background/50">
        <h3 className="text-base font-semibold text-foreground tracking-tight">
          {t(
            menuItems.find((i) => i.id === activeSection)?.labelKey || "",
            menuItems.find((i) => i.id === activeSection)?.fallbackLabel || "",
          )}
        </h3>
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
    </div>
  );
}
