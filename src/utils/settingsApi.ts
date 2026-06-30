import { invoke, isTauri } from "@/transport";
import type { AppSettings } from "@/components/settings/types";
import { defaultSettings } from "@/components/settings/types";
import type { SessionConvertTarget } from "@/types";
import { isStandaloneDatasetRuntime } from "@/browser-dataset";
import { saveSessionSource } from "@/utils/datasetApi";
import { normalizeSubagentCompatibilitySettings } from "@/utils/subagentCompatibility";

const CACHE_KEY = "pi-session-manager-settings";
const BROWSER_DATASET_REFRESHED_EVENT = "browser-dataset:refreshed";

let memoryCache: AppSettings | null = null;
let lastPersistedSettingsSignature: string | null = null;
let lastBackendSyncSignature: string | null = null;

interface BackendSyncState {
  extraPaths: string[];
  includeDefaultPiSessionDir: boolean;
  sourceMode: "local" | "dataset";
  activeDatasetId: string;
  activeDatasetIds: string[];
  scanOtherAgentJsonl: boolean;
  externalSessionProviders: string[];
}

function toSignature(value: unknown): string {
  return JSON.stringify(value);
}

function buildBackendSyncState(settings: AppSettings): BackendSyncState {
  return {
    extraPaths: (settings.advanced.sessionDirs || []).filter(
      (d: string) => d !== "~/.pi/agent/sessions" && d.trim() !== "",
    ),
    includeDefaultPiSessionDir: settings.advanced.includeDefaultPiSessionDir !== false,
    sourceMode: settings.session.sourceMode,
    activeDatasetId: settings.session.activeDatasetId || "",
    activeDatasetIds: settings.session.activeDatasetIds || [],
    scanOtherAgentJsonl: settings.session.scanOtherAgentJsonl !== false,
    externalSessionProviders: settings.session.externalSessionProviders || [],
  };
}

function datasetSelectionSignature(settings: AppSettings): string {
  return toSignature({
    sourceMode: settings.session.sourceMode,
    activeDatasetId: settings.session.activeDatasetId || "",
    activeDatasetIds: settings.session.activeDatasetIds || [],
  });
}

function notifyBrowserDatasetSelectionChanged(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(BROWSER_DATASET_REFRESHED_EVENT, {
      detail: {
        reason: "selection-change",
        datasetId: settings.session.activeDatasetId || "",
        datasetIds: settings.session.activeDatasetIds || [],
        refreshedAt: Date.now(),
      },
    }),
  );
}

function markBackendStateLoaded(settings: AppSettings) {
  lastPersistedSettingsSignature = toSignature(settings);
  lastBackendSyncSignature = toSignature(buildBackendSyncState(settings));
}

function mergeDefaults(raw: Partial<AppSettings>): AppSettings {
  const advanced = {
    ...defaultSettings.advanced,
    ...raw.advanced,
    includeDefaultPiSessionDir:
      (raw.advanced as Record<string, unknown> | undefined)
        ?.includeDefaultPiSessionDir !== false,
  };
  const update = {
    ...defaultSettings.update,
    ...raw.update,
    autoCheck: true,
  };

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
    externalSessionsIncludeInStats:
      rawSession?.externalSessionsIncludeInStats === true,
    externalSessionsIncludeInSearch:
      rawSession?.externalSessionsIncludeInSearch === true,
    showAgentIconInSessionBadge:
      rawSession?.showAgentIconInSessionBadge !== false,
    showModelIconInSessionBadge:
      rawSession?.showModelIconInSessionBadge === true,
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
    update,
    subagents: normalizeSubagentCompatibilitySettings(raw.subagents),
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

function isNoBackendRuntime(): boolean {
  if (import.meta.env.MODE === "demo") {
    return true;
  }

  if (isStandaloneDatasetRuntime()) {
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
  if (isNoBackendRuntime()) {
    return getCachedSettings();
  }

  try {
    const raw = await invoke<Partial<AppSettings>>("load_app_settings");
    const settings = mergeDefaults(raw ?? {});
    writeCache(settings);
    markBackendStateLoaded(settings);
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
  if (isNoBackendRuntime()) {
    const previousSettings = getCachedSettings();
    const datasetSelectionChanged =
      datasetSelectionSignature(previousSettings) !==
      datasetSelectionSignature(settings);
    writeCache(settings);
    if (isStandaloneDatasetRuntime() && datasetSelectionChanged) {
      notifyBrowserDatasetSelectionChanged(settings);
    }
    return;
  }

  const nextSettingsSignature = toSignature(settings);
  const nextBackendSyncState = buildBackendSyncState(settings);
  const nextBackendSyncSignature = toSignature(nextBackendSyncState);
  const settingsAlreadySaved =
    lastPersistedSettingsSignature === nextSettingsSignature;
  const backendAlreadySynced =
    lastBackendSyncSignature === nextBackendSyncSignature;

  if (settingsAlreadySaved && backendAlreadySynced) {
    writeCache(settings);
    return;
  }

  if (!settingsAlreadySaved) {
    try {
      await invoke("save_app_settings", { settings });
    } catch (error) {
      if (!isTauri()) {
        console.warn(
          "Failed to save settings to backend, using browser cache only:",
          error,
        );
        writeCache(settings);
        lastPersistedSettingsSignature = nextSettingsSignature;
        lastBackendSyncSignature = nextBackendSyncSignature;
        return;
      }
      throw error;
    }

    lastPersistedSettingsSignature = nextSettingsSignature;
  }

  writeCache(settings);

  const previousBackendSyncState =
    lastBackendSyncSignature === null ? null : JSON.parse(lastBackendSyncSignature) as BackendSyncState;

  let syncSucceeded = true;

  if (
    !previousBackendSyncState ||
    toSignature(previousBackendSyncState.extraPaths) !==
      toSignature(nextBackendSyncState.extraPaths)
  ) {
    try {
      await invoke("save_session_paths", { paths: nextBackendSyncState.extraPaths });
    } catch (e) {
      console.warn("Failed to sync session paths:", e);
      syncSucceeded = false;
    }
  }

  if (
    !previousBackendSyncState ||
    previousBackendSyncState.includeDefaultPiSessionDir !==
      nextBackendSyncState.includeDefaultPiSessionDir
  ) {
    try {
      await invoke("save_default_pi_session_dir_enabled", {
        enabled: nextBackendSyncState.includeDefaultPiSessionDir,
      });
    } catch (e) {
      console.warn("Failed to sync default Pi session directory setting:", e);
      syncSucceeded = false;
    }
  }

  if (
    !previousBackendSyncState ||
    previousBackendSyncState.sourceMode !== nextBackendSyncState.sourceMode ||
    previousBackendSyncState.activeDatasetId !==
      nextBackendSyncState.activeDatasetId ||
    toSignature(previousBackendSyncState.activeDatasetIds) !==
      toSignature(nextBackendSyncState.activeDatasetIds)
  ) {
    try {
      await saveSessionSource(
        nextBackendSyncState.sourceMode,
        nextBackendSyncState.activeDatasetId,
        nextBackendSyncState.activeDatasetIds,
      );
    } catch (e) {
      console.warn("Failed to sync session source:", e);
      syncSucceeded = false;
    }
  }

  if (
    !previousBackendSyncState ||
    previousBackendSyncState.scanOtherAgentJsonl !==
      nextBackendSyncState.scanOtherAgentJsonl
  ) {
    try {
      await invoke("save_session_scan_other_agents", {
        enabled: nextBackendSyncState.scanOtherAgentJsonl,
      });
    } catch (e) {
      console.warn("Failed to sync other-agent session scan setting:", e);
      syncSucceeded = false;
    }
  }

  if (
    !previousBackendSyncState ||
    toSignature(previousBackendSyncState.externalSessionProviders) !==
      toSignature(nextBackendSyncState.externalSessionProviders)
  ) {
    try {
      await invoke("save_external_session_providers", {
        providerSlugs: nextBackendSyncState.externalSessionProviders,
      });
    } catch (e) {
      console.warn("Failed to sync external session providers:", e);
      syncSucceeded = false;
    }
  }

  if (syncSucceeded) {
    lastBackendSyncSignature = nextBackendSyncSignature;
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
