import type { SessionEntry, SessionInfo } from "@/types";

const DB_NAME = "pi-session-manager-browser-datasets";
const DB_VERSION = 1;
const STORE_NAME = "datasetCaches";
const CACHE_TTL_MS = 1000 * 60 * 60 * 12;

export interface SerializableDatasetSession {
  info: SessionInfo;
  content: string;
  path: string;
  relativePath: string;
  fileSize: number;
  entries: SessionEntry[];
}

export interface PersistedDatasetCacheRecord {
  datasetId: string;
  cachedAt: number;
  revision: string;
  sessions: SerializableDatasetSession[];
}

export interface PersistedDatasetCacheSummary {
  datasetId: string;
  cachedAt: number;
  revision: string;
  sessionCount: number;
  totalBytes: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb_unavailable"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "datasetId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("indexeddb_open_failed"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = await handler(store);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("indexeddb_tx_failed"));
      tx.onabort = () => reject(tx.error || new Error("indexeddb_tx_aborted"));
    });
    return result;
  } finally {
    db.close();
  }
}

export async function readPersistedDatasetCache(
  datasetId: string,
): Promise<PersistedDatasetCacheRecord | null> {
  try {
    return await withStore("readonly", async (store) => {
      return await new Promise<PersistedDatasetCacheRecord | null>(
        (resolve, reject) => {
          const request = store.get(datasetId);
          request.onsuccess = () => {
            resolve(
              (request.result as PersistedDatasetCacheRecord | undefined) ||
                null,
            );
          };
          request.onerror = () =>
            reject(request.error || new Error("indexeddb_read_failed"));
        },
      );
    });
  } catch {
    return null;
  }
}

export async function writePersistedDatasetCache(
  record: PersistedDatasetCacheRecord,
): Promise<void> {
  try {
    await withStore("readwrite", async (store) => {
      await new Promise<void>((resolve, reject) => {
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () =>
          reject(request.error || new Error("indexeddb_write_failed"));
      });
      return undefined;
    });
  } catch {
    // Ignore cache persistence failures.
  }
}

export async function deletePersistedDatasetCache(
  datasetId: string,
): Promise<void> {
  try {
    await withStore("readwrite", async (store) => {
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(datasetId);
        request.onsuccess = () => resolve();
        request.onerror = () =>
          reject(request.error || new Error("indexeddb_delete_failed"));
      });
      return undefined;
    });
  } catch {
    // Ignore cache cleanup failures.
  }
}

export async function listPersistedDatasetCaches(): Promise<
  PersistedDatasetCacheSummary[]
> {
  try {
    return await withStore("readonly", async (store) => {
      return await new Promise<PersistedDatasetCacheSummary[]>(
        (resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => {
            const records =
              (request.result as PersistedDatasetCacheRecord[] | undefined) ||
              [];
            resolve(
              records.map((record) => ({
                datasetId: record.datasetId,
                cachedAt: record.cachedAt,
                revision: record.revision,
                sessionCount: record.sessions.length,
                totalBytes: record.sessions.reduce(
                  (sum, session) => sum + session.fileSize,
                  0,
                ),
              })),
            );
          };
          request.onerror = () =>
            reject(request.error || new Error("indexeddb_list_failed"));
        },
      );
    });
  } catch {
    return [];
  }
}

export async function clearAllPersistedDatasetCaches(): Promise<void> {
  try {
    await withStore("readwrite", async (store) => {
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () =>
          reject(request.error || new Error("indexeddb_clear_failed"));
      });
      return undefined;
    });
  } catch {
    // Ignore cache cleanup failures.
  }
}

export function isPersistedDatasetCacheFresh(
  record: PersistedDatasetCacheRecord,
): boolean {
  return Date.now() - record.cachedAt <= CACHE_TTL_MS;
}
