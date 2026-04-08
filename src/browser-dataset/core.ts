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
  return {
    datasetId,
    sessions,
    sessionByPath: new Map(sessions.map((session) => [session.path, session])),
  };
}

function serializeDatasetCache(
  cache: RemoteDatasetCache,
): PersistedDatasetCacheRecord {
  return {
    datasetId: cache.datasetId,
    cachedAt: Date.now(),
    revision: DATASET_REVISION,
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

async function fetchDatasetCacheFromNetwork(
  datasetId: string,
): Promise<RemoteDatasetCache> {
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
  const jsonlFiles = tree.filter(
    (item) => item.type === "file" && item.path.endsWith(".jsonl"),
  );

  const sessions = (
    await Promise.all(
      jsonlFiles.map(async (file) => {
        const resp = await fetch(datasetFileUrl(datasetId, file.path));
        if (!resp.ok) {
          throw new Error(`Failed to load ${file.path}: HTTP ${resp.status}`);
        }
        const content = await resp.text();
        return parseSessionContent(datasetId, file.path, content);
      }),
    )
  ).filter(Boolean) as RemoteDatasetSession[];

  sessions.sort(
    (left, right) =>
      right.info.modified.localeCompare(left.info.modified) ||
      left.info.path.localeCompare(right.info.path),
  );

  return buildDatasetCache(datasetId, sessions);
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
      all_messages_text: allMessages.join("\n"),
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
          isPersistedDatasetCacheFresh(persisted)
        ) {
          return deserializeDatasetCache(persisted);
        }

        if (persisted && persisted.revision === DATASET_REVISION) {
          const stale = deserializeDatasetCache(persisted);
          scheduleBackgroundRefresh(singleDatasetId, persisted);
          return stale;
        }

        try {
          const fresh = await fetchDatasetCacheFromNetwork(singleDatasetId);
          await writePersistedDatasetCache(serializeDatasetCache(fresh));
          return fresh;
        } catch (error) {
          if (persisted && persisted.revision === DATASET_REVISION) {
            console.warn(
              "[browser-dataset] Falling back to stale cached dataset after network failure:",
              error,
            );
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
      const fresh = await fetchDatasetCacheFromNetwork(datasetId);
      await writePersistedDatasetCache(serializeDatasetCache(fresh));
      if (datasetCacheKey === datasetId) {
        datasetCachePromise = Promise.resolve(fresh);
      }

      const changed =
        fresh.sessions.length !== persisted.sessions.length ||
        fresh.sessions.some((session, index) => {
          const previous = persisted.sessions[index];
          return (
            !previous ||
            previous.path !== session.path ||
            previous.fileSize !== session.fileSize ||
            previous.info.modified !== session.info.modified
          );
        });

      if (changed) {
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
