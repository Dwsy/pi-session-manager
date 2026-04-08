import type { SessionChunk, SessionInfo } from "@/types";
import { loadDatasetCache } from "./core";

export async function getBrowserDatasetSessions(): Promise<SessionInfo[]> {
  const cache = await loadDatasetCache();
  return cache.sessions.map((session) => ({ ...session.info }));
}

export async function getBrowserDatasetSessionByPath(
  path: string,
): Promise<SessionInfo | null> {
  const cache = await loadDatasetCache();
  return cache.sessionByPath.get(path)?.info || null;
}

export async function readBrowserDatasetChunk(
  path: string,
  offset = 0,
  maxBytes = 384 * 1024,
): Promise<SessionChunk> {
  const cache = await loadDatasetCache();
  const session = cache.sessionByPath.get(path);
  if (!session) {
    throw new Error(`Dataset session not found: ${path}`);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const encoded = encoder.encode(session.content);

  if (offset >= encoded.length) {
    return {
      content: "",
      next_offset: encoded.length,
      file_size: encoded.length,
      has_more: false,
    };
  }

  const normalizedMaxBytes = Math.max(1, maxBytes);
  const nextOffset = Math.min(encoded.length, offset + normalizedMaxBytes);
  const sliced = encoded.slice(offset, nextOffset);

  return {
    content: decoder.decode(sliced),
    next_offset: nextOffset,
    file_size: encoded.length,
    has_more: nextOffset < encoded.length,
  };
}
