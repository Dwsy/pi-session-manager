import { invoke, isTauri } from "@/transport";
import type {
  BrowserDatasetCacheInfo,
  DatasetImportStatus,
  DatasetInfo,
} from "@/components/settings/types";
import {
  clearAllPersistedDatasetCaches,
  invalidateBrowserDatasetCache,
  listPersistedDatasetCaches,
} from "@/browser-dataset";

const SETTINGS_CACHE_KEY = "pi-session-manager-settings";
const BROWSER_DATASET_RECENTS_KEY = "pi-session-manager-browser-datasets";

export { DEFAULT_STANDALONE_DATASET_ID } from "@/browser-dataset";

interface BrowserDatasetRecord {
  id: string;
  sourceUrl: string;
  displayName: string;
  slug: string;
  addedAt: string;
}

function slugifyRepoId(repoId: string): string {
  return repoId
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseDatasetSource(source: string): {
  repoId: string;
  sourceUrl: string;
  displayName: string;
  slug: string;
} {
  const trimmed = source.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("Dataset source cannot be empty");
  }

  let repoId = trimmed;
  if (trimmed.startsWith("https://huggingface.co/datasets/")) {
    const rest = trimmed.replace("https://huggingface.co/datasets/", "");
    const parts = rest.split("/").filter(Boolean);
    if (parts.length < 2) {
      throw new Error("Invalid Hugging Face dataset URL");
    }
    repoId = `${parts[0]}/${parts[1]}`;
  }

  if (repoId.split("/").length !== 2) {
    throw new Error("Dataset source must be a Hugging Face URL or owner/name");
  }

  return {
    repoId,
    sourceUrl: `https://huggingface.co/datasets/${repoId}`,
    displayName: repoId.split("/")[1],
    slug: slugifyRepoId(repoId),
  };
}

function readBrowserDatasetRecents(): BrowserDatasetRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BROWSER_DATASET_RECENTS_KEY);
    return raw ? (JSON.parse(raw) as BrowserDatasetRecord[]) : [];
  } catch {
    return [];
  }
}

function writeBrowserDatasetRecents(records: BrowserDatasetRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BROWSER_DATASET_RECENTS_KEY, JSON.stringify(records));
  } catch {}
}

function toBrowserDatasetRecord(source: string): BrowserDatasetRecord {
  const parsed = parseDatasetSource(source);
  return {
    id: parsed.repoId,
    sourceUrl: parsed.sourceUrl,
    displayName: parsed.displayName,
    slug: parsed.slug,
    addedAt: new Date().toISOString(),
  };
}

function getBrowserActiveDatasetIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as {
      session?: { activeDatasetIds?: string[]; activeDatasetId?: string };
    };
    const ids = Array.isArray(parsed.session?.activeDatasetIds)
      ? parsed.session?.activeDatasetIds.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
      : [];
    if (ids.length > 0) return ids;
    return parsed.session?.activeDatasetId
      ? [parsed.session.activeDatasetId]
      : [];
  } catch {
    return [];
  }
}

function toBrowserDatasetInfo(
  record: BrowserDatasetRecord,
  activeDatasetIds: string[],
): DatasetInfo {
  return {
    id: record.id,
    slug: record.slug,
    displayName: record.displayName,
    sourceUrl: record.sourceUrl,
    repoId: record.id,
    revision: "main",
    importedAt: record.addedAt,
    totalFiles: 0,
    totalBytes: 0,
    localPath: record.sourceUrl,
    sessionsPath: `${record.sourceUrl}/tree/main`,
    dbPath: "browser-memory",
    isActive: activeDatasetIds.includes(record.id),
  };
}

export async function listDatasets(): Promise<DatasetInfo[]> {
  if (!isTauri()) {
    const recents = readBrowserDatasetRecents();
    const activeDatasetIds = getBrowserActiveDatasetIds();
    const unique = new Map(recents.map((item) => [item.id, item]));
    for (const id of activeDatasetIds) {
      if (unique.has(id)) continue;
      const parsed = parseDatasetSource(id);
      unique.set(id, {
        id: parsed.repoId,
        sourceUrl: parsed.sourceUrl,
        displayName: parsed.displayName,
        slug: parsed.slug,
        addedAt: new Date().toISOString(),
      });
    }
    return Array.from(unique.values()).map((item) =>
      toBrowserDatasetInfo(item, activeDatasetIds),
    );
  }

  return invoke<DatasetInfo[]>("list_datasets");
}

export async function startDatasetImport(
  source: string,
): Promise<DatasetImportStatus> {
  if (!isTauri()) {
    const parsed = parseDatasetSource(source);
    const recents = readBrowserDatasetRecents().filter(
      (item) => item.id !== parsed.repoId,
    );
    const record = {
      id: parsed.repoId,
      sourceUrl: parsed.sourceUrl,
      displayName: parsed.displayName,
      slug: parsed.slug,
      addedAt: new Date().toISOString(),
    };
    recents.unshift(record);
    writeBrowserDatasetRecents(recents.slice(0, 10));
    return {
      taskId: `browser-dataset-${record.id}`,
      datasetId: record.id,
      displayName: record.displayName,
      sourceUrl: record.sourceUrl,
      phase: "completed",
      totalFiles: 0,
      downloadedFiles: 0,
      indexedFiles: 0,
      totalBytes: 0,
      downloadedBytes: 0,
      finishedAt: record.addedAt,
      error: null,
    };
  }

  return invoke<DatasetImportStatus>("start_dataset_import", { source });
}

export async function getDatasetImportStatus(
  taskId: string,
): Promise<DatasetImportStatus> {
  if (!isTauri()) {
    const repoId = taskId.replace(/^browser-dataset-/, "");
    const parsed = parseDatasetSource(repoId);
    return {
      taskId,
      datasetId: parsed.repoId,
      displayName: parsed.displayName,
      sourceUrl: parsed.sourceUrl,
      phase: "completed",
      totalFiles: 0,
      downloadedFiles: 0,
      indexedFiles: 0,
      totalBytes: 0,
      downloadedBytes: 0,
      finishedAt: new Date().toISOString(),
      error: null,
    };
  }

  return invoke<DatasetImportStatus>("get_dataset_import_status", {
    taskId,
  });
}

export async function saveSessionSource(
  mode: "local" | "dataset",
  activeDatasetId?: string,
  activeDatasetIds?: string[],
): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invoke("save_session_source", {
    mode,
    activeDatasetId:
      activeDatasetId && activeDatasetId.trim() ? activeDatasetId : null,
    activeDatasetIds:
      activeDatasetIds && activeDatasetIds.length > 0 ? activeDatasetIds : null,
  });
}

export async function getBrowserDatasetCacheInfo(
  datasetId?: string,
): Promise<BrowserDatasetCacheInfo | null> {
  if (isTauri()) {
    return null;
  }

  const items = await listPersistedDatasetCaches();
  if (!datasetId) {
    return items[0] || null;
  }
  return items.find((item) => item.datasetId === datasetId) || null;
}

export async function listBrowserDatasetCaches(): Promise<
  BrowserDatasetCacheInfo[]
> {
  if (isTauri()) {
    return [];
  }
  return listPersistedDatasetCaches();
}

export async function clearBrowserDatasetCache(
  datasetId?: string,
): Promise<void> {
  if (isTauri()) {
    return;
  }

  if (!datasetId) {
    await clearAllPersistedDatasetCaches();
    invalidateBrowserDatasetCache();
    return;
  }

  const { deletePersistedDatasetCache } =
    await import("@/browser-dataset/cache");
  await deletePersistedDatasetCache(datasetId);
  invalidateBrowserDatasetCache();
}

export async function clearAllBrowserDatasetCaches(): Promise<void> {
  if (isTauri()) {
    return;
  }
  await clearAllPersistedDatasetCaches();
  invalidateBrowserDatasetCache();
}

export function ensureBrowserDatasetRecent(source: string): DatasetInfo {
  const record = toBrowserDatasetRecord(source);
  const recents = readBrowserDatasetRecents().filter(
    (item) => item.id !== record.id,
  );
  recents.unshift(record);
  writeBrowserDatasetRecents(recents.slice(0, 10));
  return toBrowserDatasetInfo(record, getBrowserActiveDatasetIds());
}

export function removeBrowserDatasetRecent(datasetId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const next = readBrowserDatasetRecents().filter((item) => item.id !== datasetId);
  writeBrowserDatasetRecents(next);
}
