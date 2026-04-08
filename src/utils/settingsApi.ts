import { invoke, isTauri } from "@/transport";
import type { AppSettings } from "@/components/settings/types";
import { defaultSettings } from "@/components/settings/types";
import type { SessionConvertTarget } from "@/types";
import { saveSessionSource } from "@/utils/datasetApi";

const CACHE_KEY = "pi-session-manager-settings";

let memoryCache: AppSettings | null = null;

function mergeDefaults(raw: Partial<AppSettings>): AppSettings {
  const advanced = { ...defaultSettings.advanced, ...raw.advanced };

  // Migrate legacy sessionDir (string) → sessionDirs (string[])
  const rawAdv = raw.advanced as Record<string, unknown> | undefined;
  if (rawAdv && typeof rawAdv.sessionDir === "string" && !rawAdv.sessionDirs) {
    const legacyDir = rawAdv.sessionDir as string;
    advanced.sessionDirs =
      legacyDir === "~/.pi/agent/sessions"
        ? ["~/.pi/agent/sessions"]
        : ["~/.pi/agent/sessions", legacyDir];
  }

  // Migrate legacy appearance keys
  const rawAppearance = raw.appearance as Record<string, unknown> | undefined;
  const legacyChatTheme =
    typeof rawAppearance?.chatTheme === "string"
      ? rawAppearance.chatTheme
      : undefined;
  const legacyUiFontFamily =
    typeof rawAppearance?.uiFontFamily === "string"
      ? rawAppearance.uiFontFamily
      : undefined;
  const legacyMonoFontFamily =
    typeof rawAppearance?.monoFontFamily === "string"
      ? rawAppearance.monoFontFamily
      : undefined;

  const rawTheme =
    typeof rawAppearance?.theme === "string" ? rawAppearance.theme : undefined;
  const migratedTheme: AppSettings["appearance"]["theme"] =
    rawTheme === "dark" ||
    rawTheme === "light" ||
    rawTheme === "system" ||
    rawTheme === "custom"
      ? rawTheme
      : legacyChatTheme
        ? "custom"
        : defaultSettings.appearance.theme;

  const appearance = {
    ...defaultSettings.appearance,
    ...raw.appearance,
    theme: migratedTheme,
    customTheme:
      raw.appearance?.customTheme ??
      legacyChatTheme ??
      defaultSettings.appearance.customTheme,
    fontFamily:
      raw.appearance?.fontFamily ??
      legacyUiFontFamily ??
      defaultSettings.appearance.fontFamily,
    fontFamilyMono:
      raw.appearance?.fontFamilyMono ??
      legacyMonoFontFamily ??
      defaultSettings.appearance.fontFamilyMono,
  };

  const rawSession = raw.session as Record<string, unknown> | undefined;
  const activeDatasetIds = Array.isArray(rawSession?.activeDatasetIds)
    ? rawSession?.activeDatasetIds.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
    : typeof rawSession?.activeDatasetId === "string" &&
        rawSession.activeDatasetId
      ? [rawSession.activeDatasetId]
      : [];
  const externalSessionProviders = Array.isArray(rawSession?.externalSessionProviders)
    ? rawSession.externalSessionProviders.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
    : [];
  const session = {
    ...defaultSettings.session,
    ...raw.session,
    sourceMode: (rawSession?.sourceMode === "dataset" ? "dataset" : "local") as
      | "local"
      | "dataset",
    activeDatasetId: activeDatasetIds[0] || "",
    activeDatasetIds,
    externalSessionProviders,
    showAgentIconInSessionBadge:
      rawSession?.showAgentIconInSessionBadge !== false,
    externalResumePromptEnabled:
      rawSession?.externalResumePromptEnabled !== false,
    defaultExternalResumeTarget: (
      rawSession?.defaultExternalResumeTarget === "claude-code" ||
      rawSession?.defaultExternalResumeTarget === "codex" ||
      rawSession?.defaultExternalResumeTarget === "opencode" ||
      rawSession?.defaultExternalResumeTarget === "gemini" ||
      rawSession?.defaultExternalResumeTarget === "factory" ||
      rawSession?.defaultExternalResumeTarget === "clawdbot"
        ? rawSession.defaultExternalResumeTarget
        : "pi"
    ) as SessionConvertTarget,
    scanOtherAgentJsonl:
      externalSessionProviders.length > 0
        ? true
        : (rawSession?.scanOtherAgentJsonl === true),
  };

  return {
    piLive: { ...defaultSettings.piLive, ...raw.piLive },
    terminal: { ...defaultSettings.terminal, ...raw.terminal },
    appearance,
    language: { ...defaultSettings.language, ...raw.language },
    session,
    search: { ...defaultSettings.search, ...raw.search },
    export: { ...defaultSettings.export, ...raw.export },
    update: { ...defaultSettings.update, ...raw.update },
    advanced,
  };
}

function writeCache(settings: AppSettings) {
  memoryCache = settings;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
    if (settings.language?.locale) {
      localStorage.setItem("app-language", settings.language.locale);
    }
  } catch {}
}

function isDemoRuntime(): boolean {
  if (import.meta.env.MODE === "demo") {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  const pathname = window.location.pathname;
  return (
    pathname.endsWith("/demo.html") ||
    pathname.endsWith("/demo") ||
    pathname.endsWith("/demo/") ||
    pathname.endsWith("/demo/index.html")
  );
}

export async function loadAppSettings(): Promise<AppSettings> {
  if (isDemoRuntime()) {
    return getCachedSettings();
  }

  try {
    const raw = await invoke<Partial<AppSettings>>("load_app_settings");
    const settings = mergeDefaults(raw ?? {});
    writeCache(settings);
    return settings;
  } catch (e) {
    console.warn(
      "Failed to load settings from backend, using cache/defaults:",
      e,
    );
    return getCachedSettings();
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  if (isDemoRuntime()) {
    writeCache(settings);
    return;
  }

  try {
    await invoke("save_app_settings", { settings });
  } catch (error) {
    if (!isTauri()) {
      console.warn(
        "Failed to save settings to backend, using browser cache only:",
        error,
      );
      writeCache(settings);
      return;
    }
    throw error;
  }

  writeCache(settings);

  // Sync session paths to backend config (TOML) so scanner picks them up
  const extraPaths = (settings.advanced.sessionDirs || []).filter(
    (d: string) => d !== "~/.pi/agent/sessions" && d.trim() !== "",
  );
  try {
    await invoke("save_session_paths", { paths: extraPaths });
  } catch (e) {
    console.warn("Failed to sync session paths:", e);
  }

  try {
    await saveSessionSource(
      settings.session.sourceMode,
      settings.session.activeDatasetId,
      settings.session.activeDatasetIds,
    );
  } catch (e) {
    console.warn("Failed to sync session source:", e);
  }

  try {
    await invoke("save_session_scan_other_agents", {
      enabled: settings.session.scanOtherAgentJsonl !== false,
    });
  } catch (e) {
    console.warn("Failed to sync other-agent session scan setting:", e);
  }

  try {
    await invoke("save_external_session_providers", {
      providerSlugs: settings.session.externalSessionProviders || [],
    });
  } catch (e) {
    console.warn("Failed to sync external session providers:", e);
  }
}

export function getCachedSettings(): AppSettings {
  if (memoryCache) return memoryCache;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      const settings = mergeDefaults(parsed);
      memoryCache = settings;
      return settings;
    }
  } catch {}
  return defaultSettings;
}
