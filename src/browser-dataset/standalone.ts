const SETTINGS_CACHE_KEY = "pi-session-manager-settings";
const LANGUAGE_KEY = "app-language";
const ONBOARDING_COMPLETED_KEY = "onboarding-completed";
const BROWSER_DATASET_RECENTS_KEY = "pi-session-manager-browser-datasets";

export const DEFAULT_STANDALONE_DATASET_ID = "badlogicgames/pi-mono";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseCachedSettings(raw: string | null): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return {};
  }
}

function parseDatasetRecords(raw: string | null): Array<Record<string, unknown>> {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item),
        )
      : [];
  } catch {
    return [];
  }
}

function toDatasetRecord(datasetId: string) {
  const [owner = "", name = datasetId] = datasetId.split("/", 2);
  const sourceUrl = `https://huggingface.co/datasets/${datasetId}`;
  return {
    id: datasetId,
    sourceUrl,
    displayName: name || owner || datasetId,
    slug: datasetId.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_"),
    addedAt: new Date().toISOString(),
  };
}

export function isStandaloneDatasetRuntime(): boolean {
  if (import.meta.env.MODE === "dataset") {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  const pathname = window.location.pathname;
  return (
    pathname.endsWith("/dataset.html") ||
    pathname.endsWith("/dataset") ||
    pathname.endsWith("/dataset/") ||
    pathname.endsWith("/dataset/index.html")
  );
}

export function bootstrapStandaloneDatasetSettings(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const existing = parseCachedSettings(localStorage.getItem(SETTINGS_CACHE_KEY));
    const existingSession = asRecord(existing.session);
    const activeDatasetIds = Array.isArray(existingSession.activeDatasetIds)
      ? existingSession.activeDatasetIds.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
      : [];
    const legacyDatasetId =
      typeof existingSession.activeDatasetId === "string"
        ? existingSession.activeDatasetId.trim()
        : "";
    const activeDatasetId =
      activeDatasetIds[0] || legacyDatasetId || DEFAULT_STANDALONE_DATASET_ID;

    const next = {
      ...existing,
      session: {
        ...existingSession,
        sourceMode: "dataset",
        defaultViewMode: "list",
        activeDatasetId,
        activeDatasetIds: [activeDatasetId],
        scanOtherAgentJsonl: false,
        externalSessionProviders: [],
        externalSessionsIncludeInStats: false,
        externalSessionsIncludeInSearch: false,
      },
    };

    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(next));

    const records = parseDatasetRecords(
      localStorage.getItem(BROWSER_DATASET_RECENTS_KEY),
    );
    if (!records.some((record) => record.id === activeDatasetId)) {
      records.unshift(toDatasetRecord(activeDatasetId));
      localStorage.setItem(
        BROWSER_DATASET_RECENTS_KEY,
        JSON.stringify(records.slice(0, 10)),
      );
    }

    if (!localStorage.getItem(LANGUAGE_KEY)) {
      localStorage.setItem(LANGUAGE_KEY, "en-US");
    }
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");
  } catch {
    // Ignore storage failures and continue with runtime defaults.
  }
}
