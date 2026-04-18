import { useCallback, useEffect, useRef, useState } from "react";

import { getPlatformDefaults } from "@/components/settings/types";
import { useFileWatcher } from "@/hooks/useFileWatcher";
import { registerBuiltinPlugins } from "@/plugins";
import { getRuntimeMode } from "@/runtime-data/runtimeMode";
import { invoke, isTauri } from "@/transport";
import type { SessionsDiff } from "@/types";
import { getCachedSettings } from "@/utils/settingsApi";
import { applyPiChatTheme } from "@/utils/piTheme";

export interface AppTerminalConfig {
  enabled: boolean;
  defaultShell: string;
  fontSize: number;
}

export interface UseAppBootstrapOptions {
  loadSessions: () => void | Promise<void>;
  loadSettings: () => void | Promise<void>;
  patchSessions: (diff: SessionsDiff) => void;
  onBuiltinTerminalDisabled?: () => void;
}

export interface UseAppBootstrapReturn {
  isInitialized: boolean;
  terminalConfig: AppTerminalConfig;
  reloadTerminalConfig: () => void;
}

const DEFAULT_TERMINAL_CONFIG: AppTerminalConfig = {
  enabled: true,
  defaultShell: getPlatformDefaults().defaultShell,
  fontSize: 13,
};

export function useAppBootstrap({
  loadSessions,
  loadSettings,
  patchSessions,
  onBuiltinTerminalDisabled,
}: UseAppBootstrapOptions): UseAppBootstrapReturn {
  const [isInitialized, setIsInitialized] = useState(false);
  const [terminalConfig, setTerminalConfig] = useState<AppTerminalConfig>(
    DEFAULT_TERMINAL_CONFIG,
  );
  const hasInitializedRef = useRef(false);
  const onBuiltinTerminalDisabledRef = useRef(onBuiltinTerminalDisabled);

  useEffect(() => {
    onBuiltinTerminalDisabledRef.current = onBuiltinTerminalDisabled;
  }, [onBuiltinTerminalDisabled]);

  const reloadTerminalConfig = useCallback(() => {
    try {
      const settings = getCachedSettings();
      const enabled = settings.terminal?.builtinTerminalEnabled !== false;
      setTerminalConfig({
        enabled,
        defaultShell:
          settings.terminal?.defaultShell || getPlatformDefaults().defaultShell,
        fontSize: settings.terminal?.terminalFontSize || 13,
      });
      if (!enabled) {
        onBuiltinTerminalDisabledRef.current?.();
      }
    } catch {}
  }, []);

  useEffect(() => {
    registerBuiltinPlugins();
    reloadTerminalConfig();

    const settings = getCachedSettings();
    const root = document.documentElement;
    if (settings.appearance) {
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
      }
      if (sidebarWidth) {
        root.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
      }
      const fontMap: Record<string, string> = {
        small: "14px",
        medium: "16px",
        large: "18px",
      };
      if (fontSize) {
        root.style.setProperty("--font-size-base", fontMap[fontSize] || "16px");
      }
      if (fontFamily) {
        root.style.setProperty("--font-family", fontFamily);
      }
      if (fontFamilyMono) {
        root.style.setProperty("--font-family-mono", fontFamilyMono);
      }
      const spacingMap: Record<string, string> = {
        compact: "8px",
        comfortable: "16px",
        spacious: "24px",
      };
      if (messageSpacing) {
        root.style.setProperty(
          "--spacing-base",
          spacingMap[messageSpacing] || "16px",
        );
      }
      if (codeBlockTheme) {
        root.setAttribute("data-code-theme", codeBlockTheme);
      }
      applyPiChatTheme(theme === "custom" ? customTheme : "app-default");
    }

    const initialize = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      setIsInitialized(true);
    };

    void initialize();
  }, [reloadTerminalConfig]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const handleKeyDown = async (event: KeyboardEvent) => {
      if (event.key !== "F12") {
        return;
      }

      event.preventDefault();
      try {
        await invoke("toggle_devtools");
      } catch (error) {
        console.warn("Failed to toggle devtools:", error);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isInitialized || hasInitializedRef.current) {
      return;
    }

    hasInitializedRef.current = true;
    void loadSessions();
    void loadSettings();
  }, [isInitialized, loadSessions, loadSettings]);

  useEffect(() => {
    const handleRefresh = (event: KeyboardEvent) => {
      const isCmdShiftR =
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "r";
      const isF5 = event.key === "F5";
      if (!isCmdShiftR && !isF5) {
        return;
      }

      event.preventDefault();
      window.location.reload();
    };

    window.addEventListener("keydown", handleRefresh);
    return () => window.removeEventListener("keydown", handleRefresh);
  }, []);

  useFileWatcher({
    enabled: getRuntimeMode() === "backend",
    debounceMs: 2000,
    onDiff: patchSessions,
  });

  return {
    isInitialized,
    terminalConfig,
    reloadTerminalConfig,
  };
}
