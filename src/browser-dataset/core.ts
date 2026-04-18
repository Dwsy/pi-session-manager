import type { SessionEntry, SessionInfo } from "@/types";
import { isTauri } from "@/transport";
import { getCachedSettings } from "@/utils/settingsApi";
import {
  deletePersistedDatasetCache,
  isPersistedDatasetCacheFresh,
  readPersistedDatasetCache,
  writePersistedDatasetCache,
  type PersistedDatasetCacheRecord,
  type SerializableDatasetSession,
} from "./cache";

export interface RemoteDatasetSession {
  info: SessionInfo;
  content: string;
  path: string;
  relativePath: string;
  fileSize: number;
  entries: SessionEntry[];
}

export interface RemoteDatasetCache {
  datasetId: string;
  sessions: RemoteDatasetSession[];
  sessionByPath: Map<string, RemoteDatasetSession>;
}

let datasetCachePromise: Promise<RemoteDatasetCache> | null = null;
let datasetCacheKey = "";
let backgroundRefreshPromise: Promise<void> | null = null;
let backgroundRefreshKey = "";
const DATASET_REVISION = "main";
const INITIAL_DATASET_FILE_BATCH = 24;
const BACKGROUND_DATASET_FILE_BATCH = 24;
export const BROWSER_DATASET_REFRESHED_EVENT = "browser-dataset:refreshed";

export function getActiveDatasetId(): string {
  return getActiveDatasetIds()[0] || "";
}

export function getActiveDatasetIds(): string[] {
  try {
    const settings = getCachedSettings();
    const ids = settings.session?.activeDatasetIds || [];
    if (Array.isArray(ids) && ids.length > 0) {
      return ids.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      );
    }
    return settings.session?.activeDatasetId
      ? [settings.session.activeDatasetId]
      : [];
  } catch {
    return [];
  }
}

export function isBrowserDatasetModeEnabled(): boolean {
  if (isTauri()) return false;
  try {
    const settings = getCachedSettings();
    return (
      settings.session?.sourceMode === "dataset" &&
      getActiveDatasetIds().length > 0
    );
  } catch {
    return false;
  }
}

function datasetTreeUrl(datasetId: string): string {
  return `https://huggingface.co/api/datasets/${datasetId}/tree/main?recursive=true&expand=true`;
}

function datasetFileUrl(datasetId: string, relativePath: string): string {
  return `https://huggingface.co/datasets/${datasetId}/resolve/main/${relativePath}?download=true`;
}

export function virtualPath(datasetId: string, relativePath: string): string {
  return `/datasets/${datasetId}/${relativePath}`;
}

export function extractTextFromMessageContent(content: any[] | undefined): {
  text: string;
  thinking: string;
} {
  const textParts: string[] = [];
  const thinkingParts: string[] = [];

  for (const item of content || []) {
    if (item?.type === "text" && typeof item.text === "string") {
      textParts.push(item.text);
      continue;
    }
    if (item?.type === "thinking" && typeof item.thinking === "string") {
      thinkingParts.push(item.thinking);
      continue;
    }
    if (item?.type === "toolCall") {
      const argsText = item.arguments ? JSON.stringify(item.arguments) : "";
      textParts.push(`${item.name || "tool"} ${argsText}`.trim());
    }
  }

  return {
    text: textParts.join("\n").trim(),
    thinking: thinkingParts.join("\n").trim(),
  };
}

function buildDatasetCache(
  datasetId: string,
  sessions: RemoteDatasetSession[],
): RemoteDatasetCache {
  const sortedSessions = [...sessions].sort(
    (left, right) =>
      right.info.modified.localeCompare(left.info.modified) ||
      left.info.path.localeCompare(right.info.path),
  );
  return {
    datasetId,
    sessions: sortedSessions,
    sessionByPath: new Map(
      sortedSessions.map((session) => [session.path, session]),
    ),
  };
}

function serializeDatasetCache(
  cache: RemoteDatasetCache,
  isComplete = true,
): PersistedDatasetCacheRecord {
  return {
    datasetId: cache.datasetId,
    cachedAt: Date.now(),
    revision: DATASET_REVISION,
    isComplete,
    sessions: cache.sessions.map((session) => ({
      info: session.info,
      content: session.content,
      path: session.path,
      relativePath: session.relativePath,
      fileSize: session.fileSize,
      entries: session.entries,
    })),
  };
}

function deserializeDatasetCache(
  record: PersistedDatasetCacheRecord,
): RemoteDatasetCache {
  const sessions: RemoteDatasetSession[] = record.sessions.map(
    (session: SerializableDatasetSession) => ({
      info: session.info,
      content: session.content,
      path: session.path,
      relativePath: session.relativePath,
      fileSize: session.fileSize,
      entries: session.entries,
    }),
  );
  return buildDatasetCache(record.datasetId, sessions);
}

function sortDatasetFilesNewestFirst(
  files: Array<{ path: string; type: string; size?: number }>,
): Array<{ path: string; type: string; size?: number }> {
  return [...files].sort((left, right) => right.path.localeCompare(left.path));
}

function mergeDatasetSessions(
  current: RemoteDatasetSession[],
  incoming: RemoteDatasetSession[],
): RemoteDatasetSession[] {
  if (incoming.length === 0) {
    return current;
  }

  const byPath = new Map(current.map((session) => [session.path, session]));
  for (const session of incoming) {
    byPath.set(session.path, session);
  }

  return [...byPath.values()];
}

function datasetKeyContains(datasetId: string): boolean {
  return datasetCacheKey.split("|").includes(datasetId);
}

async function fetchDatasetTree(
  datasetId: string,
): Promise<Array<{ path: string; type: string; size?: number }>> {
  const parseNextLink = (linkHeader: string | null): string | null => {
    if (!linkHeader) return null;
    for (const part of linkHeader.split(",")) {
      const trimmed = part.trim();
      if (!trimmed.includes('rel="next"')) continue;
      const match = trimmed.match(/<([^>]+)>/);
      if (match?.[1]) return match[1];
    }
    return null;
  };

  let url: string | null = datasetTreeUrl(datasetId);
  const tree: Array<{ path: string; type: string; size?: number }> = [];

  while (url) {
    const treeResp = await fetch(url);
    if (!treeResp.ok) {
      throw new Error(`Failed to load dataset tree: HTTP ${treeResp.status}`);
    }

    const page = (await treeResp.json()) as Array<{
      path: string;
      type: string;
      size?: number;
    }>;
    tree.push(...page);
    url = parseNextLink(treeResp.headers.get("link"));
  }

  return sortDatasetFilesNewestFirst(
    tree.filter(
      (item) => item.type === "file" && item.path.endsWith(".jsonl"),
    ),
  );
}

async function fetchDatasetSessionsForFiles(
  datasetId: string,
  files: Array<{ path: string; type: string; size?: number }>,
): Promise<RemoteDatasetSession[]> {
  const sessions = (
    await Promise.all(
      files.map(async (file) => {
        const resp = await fetch(datasetFileUrl(datasetId, file.path));
        if (!resp.ok) {
          throw new Error(`Failed to load ${file.path}: HTTP ${resp.status}`);
        }
        const content = await resp.text();
        return parseSessionContent(datasetId, file.path, content);
      }),
    )
  ).filter(Boolean) as RemoteDatasetSession[];

  return buildDatasetCache(datasetId, sessions).sessions;
}

async function fetchInitialDatasetCacheFromNetwork(
  datasetId: string,
): Promise<{ cache: RemoteDatasetCache; isComplete: boolean }> {
  const jsonlFiles = await fetchDatasetTree(datasetId);
  const initialFiles = jsonlFiles.slice(0, INITIAL_DATASET_FILE_BATCH);
  const sessions = await fetchDatasetSessionsForFiles(datasetId, initialFiles);

  return {
    cache: buildDatasetCache(datasetId, sessions),
    isComplete: initialFiles.length >= jsonlFiles.length,
  };
}

function parseSessionContent(
  datasetId: string,
  relativePath: string,
  content: string,
): RemoteDatasetSession | null {
  const lines = content.split("\n").filter((line) => line.trim());
  if (lines.length === 0) return null;

  let header: any;
  try {
    header = JSON.parse(lines[0]);
  } catch {
    return null;
  }

  const entries: SessionEntry[] = [];
  let name: string | undefined;
  let messageCount = 0;
  let firstMessage = "";
  let lastMessage = "";
  let lastMessageRole = "assistant";
  const allMessages: string[] = [];
  const userMessages: string[] = [];
  const assistantMessages: string[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as SessionEntry;
      entries.push(entry);

      const anyEntry = entry as any;
      if (entry.type === "session_info" && typeof anyEntry.name === "string") {
        name = anyEntry.name.trim() || name;
      }

      if (entry.type !== "message" || !entry.message) continue;
      const role = entry.message.role;
      if (role !== "user" && role !== "assistant") continue;

      const extracted = extractTextFromMessageContent(entry.message.content);
      const mergedText = [extracted.text, extracted.thinking]
        .filter(Boolean)
        .join("\n")
        .trim();
      if (!mergedText) continue;

      messageCount += 1;
      allMessages.push(mergedText);
      if (role === "user") {
        userMessages.push(mergedText);
        if (!firstMessage) {
          firstMessage = mergedText.slice(0, 100);
        }
      } else {
        assistantMessages.push(mergedText);
      }
      lastMessage = mergedText.slice(0, 150);
      lastMessageRole = role;
    } catch {
      // ignore malformed line
    }
  }

  const created = header?.timestamp || new Date().toISOString();
  const modified = created;
  const path = virtualPath(datasetId, relativePath);

  return {
    path,
    relativePath,
    content,
    fileSize: new TextEncoder().encode(content).length,
    entries,
    info: {
      path,
      id:
        header?.id ||
        relativePath
          .replace(/\.jsonl$/i, "")
          .split("/")
          .pop() ||
        relativePath,
      cwd: header?.cwd || `/${datasetId}`,
      name,
      created,
      modified,
      message_count: messageCount,
      first_message: firstMessage,
      user_messages_text: userMessages.join("\n"),
      assistant_messages_text: assistantMessages.join("\n"),
      last_message: lastMessage,
      last_message_role: lastMessageRole,
      parent_session_path: header?.parentSession,
    },
  };
}

export async function loadDatasetCache(): Promise<RemoteDatasetCache> {
  const datasetIds = getActiveDatasetIds();
  if (datasetIds.length === 0) {
    throw new Error("No active dataset selected");
  }

  const datasetId = datasetIds.join("|");

  if (datasetCachePromise && datasetCacheKey === datasetId) {
    return datasetCachePromise;
  }

  datasetCacheKey = datasetId;
  datasetCachePromise = (async () => {
    const singleCaches = await Promise.all(
      datasetIds.map(async (singleDatasetId) => {
        const persisted = await readPersistedDatasetCache(singleDatasetId);
        if (
          persisted &&
          persisted.revision === DATASET_REVISION &&
          isPersistedDatasetCacheFresh(persisted) &&
          persisted.isComplete !== false
        ) {
          return deserializeDatasetCache(persisted);
        }

        if (persisted && persisted.revision === DATASET_REVISION) {
          const cached = deserializeDatasetCache(persisted);
          scheduleBackgroundRefresh(singleDatasetId, persisted);
          return cached;
        }

        try {
          const initial = await fetchInitialDatasetCacheFromNetwork(singleDatasetId);
          await writePersistedDatasetCache(
            serializeDatasetCache(initial.cache, initial.isComplete),
          );
          if (!initial.isComplete) {
            scheduleBackgroundRefresh(
              singleDatasetId,
              serializeDatasetCache(initial.cache, false),
            );
          }
          return initial.cache;
        } catch (error) {
          if (persisted && persisted.revision === DATASET_REVISION) {
            console.warn(
              "[browser-dataset] Falling back to stale cached dataset after network failure:",
              error,
            );
            if (persisted.isComplete === false) {
              scheduleBackgroundRefresh(singleDatasetId, persisted);
            }
            return deserializeDatasetCache(persisted);
          }
          throw error;
        }
      }),
    );

    const combinedSessions = singleCaches
      .flatMap((cache) => cache.sessions)
      .sort(
        (left, right) =>
          right.info.modified.localeCompare(left.info.modified) ||
          left.info.path.localeCompare(right.info.path),
      );

    return {
      datasetId,
      sessions: combinedSessions,
      sessionByPath: new Map(
        combinedSessions.map((session) => [session.path, session]),
      ),
    };
  })();

  return datasetCachePromise;
}

export function invalidateBrowserDatasetCache(): void {
  const previousKey = datasetCacheKey;
  datasetCacheKey = "";
  datasetCachePromise = null;
  if (previousKey) {
    void deletePersistedDatasetCache(previousKey);
  }
}

function dispatchDatasetRefreshed(datasetId: string): void {
  if (typeof window === "undefined") return;
  if (datasetKeyContains(datasetId)) {
    datasetCachePromise = null;
  }
  window.dispatchEvent(
    new CustomEvent(BROWSER_DATASET_REFRESHED_EVENT, {
      detail: {
        datasetId,
        refreshedAt: Date.now(),
      },
    }),
  );
}

function scheduleBackgroundRefresh(
  datasetId: string,
  persisted: PersistedDatasetCacheRecord,
): void {
  if (backgroundRefreshPromise && backgroundRefreshKey === datasetId) {
    return;
  }

  backgroundRefreshKey = datasetId;
  backgroundRefreshPromise = (async () => {
    try {
      const jsonlFiles = await fetchDatasetTree(datasetId);
      let workingCache = deserializeDatasetCache(persisted);
      const loadedPaths = new Set(workingCache.sessions.map((session) => session.path));
      const remainingFiles = jsonlFiles.filter(
        (file) => !loadedPaths.has(virtualPath(datasetId, file.path)),
      );

      if (remainingFiles.length === 0) {
        if (persisted.isComplete === false) {
          await writePersistedDatasetCache(
            serializeDatasetCache(workingCache, true),
          );
          dispatchDatasetRefreshed(datasetId);
        }
        return;
      }

      for (
        let index = 0;
        index < remainingFiles.length;
        index += BACKGROUND_DATASET_FILE_BATCH
      ) {
        const batch = remainingFiles.slice(
          index,
          index + BACKGROUND_DATASET_FILE_BATCH,
        );
        const fetchedSessions = await fetchDatasetSessionsForFiles(
          datasetId,
          batch,
        );
        if (fetchedSessions.length === 0) {
          continue;
        }

        workingCache = buildDatasetCache(
          datasetId,
          mergeDatasetSessions(workingCache.sessions, fetchedSessions),
        );
        const isComplete =
          index + BACKGROUND_DATASET_FILE_BATCH >= remainingFiles.length;
        await writePersistedDatasetCache(
          serializeDatasetCache(workingCache, isComplete),
        );
        dispatchDatasetRefreshed(datasetId);
      }
    } catch (error) {
      console.warn(
        "[browser-dataset] Background refresh failed, keeping cached dataset:",
        error,
      );
    } finally {
      backgroundRefreshPromise = null;
      backgroundRefreshKey = "";
    }
  })();
}
