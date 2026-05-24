import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { invoke, listen } from "@/transport";
import { psmRuntimeEventBus } from "@/plugins/runtime-host/eventBus";
import type { SessionEntry, SessionsDiff } from "@/types";
import type {
  PiLiveChatEventPayload,
  PiLiveSessionDisconnectedPayload,
  PiLiveSessionRegisteredPayload,
} from "@/types/pi-live";
import { trimMarkdownCacheOnSessionSwitch } from "@/utils/markdown";
import { getCachedSettings } from "@/utils/settingsApi";
import { parseSessionEntriesWithLineCount } from "@/utils/session";
import {
  BROWSER_DATASET_REFRESHED_EVENT,
  isBrowserDatasetModeEnabled,
} from "@/browser-dataset";
import {
  readRuntimeSessionChunk,
  getPreviewEntriesFromDB,
  shouldListenRuntimeSessionEvents,
} from "@/runtime-data/sessionSource";

function extractSessionId(sessionPath: string): string {
  const base = sessionPath.replace(/\.jsonl$/, "");
  return base.substring(base.lastIndexOf("/") + 1);
}

function appendDeltaToMessageContent(
  existingContent: any[] | undefined,
  assistantMessageEvent: any,
): any[] {
  const content = Array.isArray(existingContent) ? [...existingContent] : [];
  const contentIndex =
    typeof assistantMessageEvent?.contentIndex === "number"
      ? assistantMessageEvent.contentIndex
      : 0;
  const deltaType = assistantMessageEvent?.type;

  const ensureBlock = (type: "text" | "thinking") => {
    while (content.length <= contentIndex)
      content.push({ type: "text", text: "" });
    if (!content[contentIndex] || content[contentIndex].type !== type) {
      content[contentIndex] =
        type === "thinking"
          ? { type: "thinking", thinking: "" }
          : { type: "text", text: "" };
    }
    return content[contentIndex];
  };

  if (deltaType === "text_start") {
    const block = ensureBlock("text");
    block.text = assistantMessageEvent?.partial?.text || block.text || "";
  } else if (deltaType === "text_delta") {
    const block = ensureBlock("text");
    block.text = `${block.text || ""}${assistantMessageEvent?.delta || ""}`;
  } else if (deltaType === "text_end") {
    const block = ensureBlock("text");
    block.text = assistantMessageEvent?.content || block.text || "";
  } else if (deltaType === "thinking_start") {
    const block = ensureBlock("thinking");
    block.thinking =
      assistantMessageEvent?.partial?.thinking || block.thinking || "";
  } else if (deltaType === "thinking_delta") {
    const block = ensureBlock("thinking");
    block.thinking = `${block.thinking || ""}${assistantMessageEvent?.delta || ""}`;
  } else if (deltaType === "thinking_end") {
    const block = ensureBlock("thinking");
    block.thinking = assistantMessageEvent?.content || block.thinking || "";
  }

  return content;
}

interface SessionCacheItem {
  entries: SessionEntry[];
  lineCount: number;
  nextOffset: number;
  fileSize: number;
  hasMore: boolean;
}

const SESSION_CONTENT_CACHE = new Map<string, SessionCacheItem>();
const MAX_CACHE_SIZE = 5;

function hasMessageEntries(entries: SessionEntry[]): boolean {
  return entries.some((entry) => entry.type === "message");
}

function cacheSessionContent(path: string, cacheItem: SessionCacheItem): void {
  if (SESSION_CONTENT_CACHE.size >= MAX_CACHE_SIZE) {
    const firstKey = SESSION_CONTENT_CACHE.keys().next().value;
    if (firstKey) {
      SESSION_CONTENT_CACHE.delete(firstKey);
    }
  }
  SESSION_CONTENT_CACHE.set(path, cacheItem);
}

function getDefaultActiveEntryId(entries: SessionEntry[]): string | null {
  const lastMessage = entries.filter((entry) => entry.type === "message").pop();
  if (lastMessage) {
    return lastMessage.id;
  }
  return entries.length > 0 ? entries[0].id : null;
}

function normalizeEntryId(rawId: string): string {
  const duplicateMarker = "__dup_";
  const markerIndex = rawId.indexOf(duplicateMarker);
  if (markerIndex === -1) {
    return rawId;
  }
  return rawId.slice(0, markerIndex);
}

function mergeEntriesWithUniqueIds(
  prevEntries: SessionEntry[],
  incomingEntries: SessionEntry[],
): SessionEntry[] {
  if (incomingEntries.length === 0) {
    return prevEntries;
  }

  const idCounts = new Map<string, number>();

  for (const entry of prevEntries) {
    const baseId = normalizeEntryId(entry.id);
    idCounts.set(baseId, (idCounts.get(baseId) ?? 0) + 1);
  }

  const adjustedIncoming = incomingEntries.map((entry) => {
    const baseId = normalizeEntryId(entry.id);
    const count = idCounts.get(baseId) ?? 0;
    idCounts.set(baseId, count + 1);

    if (count === 0) {
      return entry;
    }

    return {
      ...entry,
      id: `${baseId}__dup_${count}`,
    };
  });

  return [...prevEntries, ...adjustedIncoming];
}

export interface UseSessionViewerDataOptions {
  sessionPath: string;
  initialEntryId?: string;
  loadErrorMessage: string;
  isAtBottomRef: MutableRefObject<boolean>;
  isLive?: boolean;
  /** Preview mode: read from SQLite DB instead of JSONL files */
  previewMode?: boolean;
}

export interface UseSessionViewerDataResult {
  entries: SessionEntry[];
  loading: boolean;
  showLoading: boolean;
  error: string | null;
  activeEntryId: string | null;
  setActiveEntryId: Dispatch<SetStateAction<string | null>>;
  scrollTargetId: string | null;
  setScrollTargetId: Dispatch<SetStateAction<string | null>>;
  hasNewMessages: boolean;
  setHasNewMessages: Dispatch<SetStateAction<boolean>>;
  streamingId: string | null;
  pendingScrollToBottomRef: MutableRefObject<boolean>;
  hasMoreHistory: boolean;
  loadMoreHistory: () => Promise<void>;
}

export function useSessionViewerData({
  sessionPath,
  initialEntryId,
  loadErrorMessage,
  isAtBottomRef,
  isLive,
  previewMode = false,
}: UseSessionViewerDataOptions): UseSessionViewerDataResult {
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLoading, setShowLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lineCount, setLineCount] = useState(0);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [datasetRefreshVersion, setDatasetRefreshVersion] = useState(0);

  const pendingScrollToBottomRef = useRef(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lineCountRef = useRef(0);
  const loadErrorMessageRef = useRef(loadErrorMessage);
  const nextOffsetRef = useRef(0);
  const fileSizeRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const hasMoreHistoryRef = useRef(false);
  const isLiveRef = useRef(isLive ?? false);
  const lastResponseIdRef = useRef<string | null>(null);

  lineCountRef.current = lineCount;

  // Sync isLive prop to ref so the effect always has the latest status
  useEffect(() => {
    isLiveRef.current = isLive ?? isLiveRef.current;
  }, [isLive]);

  useEffect(() => {
    if (!sessionPath) {
      return;
    }
    trimMarkdownCacheOnSessionSwitch();
  }, [sessionPath]);

  useEffect(() => {
    loadErrorMessageRef.current = loadErrorMessage;
  }, [loadErrorMessage]);

  const updateHasMoreHistory = useCallback((next: boolean) => {
    hasMoreHistoryRef.current = next;
    setHasMoreHistory(next);
  }, []);

  const loadMoreHistory = useCallback(
    async (options?: {
      asRealtime?: boolean;
      maxBytes?: number;
      force?: boolean;
    }) => {
      const asRealtime = Boolean(options?.asRealtime);
      const force = Boolean(options?.force);
      const maxBytes = options?.maxBytes ?? 384 * 1024;

      if (!sessionPath || loadingMoreRef.current) {
        return;
      }

      if (!force && !asRealtime && !hasMoreHistoryRef.current) {
        return;
      }

      try {
        loadingMoreRef.current = true;

        const chunk = await readRuntimeSessionChunk(
          sessionPath,
          nextOffsetRef.current,
          maxBytes,
        );

        nextOffsetRef.current = chunk.next_offset;
        fileSizeRef.current = chunk.file_size;
        updateHasMoreHistory(chunk.has_more);

        if (!chunk.content.trim()) {
          return;
        }

        const { entries: newEntries, lineCount: addedLines } =
          parseSessionEntriesWithLineCount(chunk.content);

        if (newEntries.length === 0) {
          return;
        }

        const nextLineCount = lineCountRef.current + addedLines;
        lineCountRef.current = nextLineCount;
        setLineCount(nextLineCount);

        setEntries((prev) => {
          const merged = mergeEntriesWithUniqueIds(prev, newEntries);
          cacheSessionContent(sessionPath, {
            entries: merged,
            lineCount: nextLineCount,
            nextOffset: chunk.next_offset,
            fileSize: chunk.file_size,
            hasMore: chunk.has_more,
          });
          return merged;
        });

        if (asRealtime) {
          // In Live mode, we prefer WebSocket events for real-time updates to avoid duplicates and ID drifting.
          // File-watcher (asRealtime: true) should only load historical chunks, not the tip of the stream.
          if (isLiveRef.current) {
            return;
          }

          const nextActiveEntryId = getDefaultActiveEntryId(newEntries);
          if (nextActiveEntryId) {
            setActiveEntryId(nextActiveEntryId);
          }

          if (isAtBottomRef.current) {
            pendingScrollToBottomRef.current = true;
          } else {
            setHasNewMessages(true);
          }
        }
      } catch (loadMoreError) {
        console.error(
          "[useSessionViewerData] Failed to load session chunk:",
          loadMoreError,
        );
      } finally {
        loadingMoreRef.current = false;
      }
    },
    [isAtBottomRef, sessionPath],
  );

  useEffect(() => {
    let cancelled = false;

    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }

    setLineCount(0);
    setEntries([]);
    setActiveEntryId(null);
    setScrollTargetId(null);
    setHasNewMessages(false);
    updateHasMoreHistory(false);
    pendingScrollToBottomRef.current = false;
    nextOffsetRef.current = 0;
    fileSizeRef.current = 0;
    loadingMoreRef.current = false;

    if (!sessionPath) {
      setLoading(false);
      setShowLoading(false);
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    const doLoad = async () => {
      try {
        setLoading(true);
        setShowLoading(false);
        setError(null);

        // Preview mode: read directly from SQLite DB.
        // Skips JSONL parsing, file chunking, caching, and pagination.
        if (previewMode) {
          let dbEntries: SessionEntry[] | null = null;
          try {
            dbEntries = await getPreviewEntriesFromDB(sessionPath);
            if (cancelled) return;

            if (hasMessageEntries(dbEntries)) {
              setEntries(dbEntries);
              setLineCount(dbEntries.length);
              updateHasMoreHistory(false);
              setActiveEntryId(getDefaultActiveEntryId(dbEntries));
              pendingScrollToBottomRef.current = false;
            } else {
              dbEntries = null;
            }
          } catch (dbError) {
            // Fallback to JSONL if DB read fails (e.g. message_entries not populated yet)
            console.warn("[useSessionViewerData] DB preview read failed, falling back to JSONL:", dbError);
          }
          if (dbEntries) {
            setLoading(false);
            setShowLoading(false);
            return;
          }
          // DB read failed — fall through to JSONL path
        }

        const openPosition = getCachedSettings().session?.openPosition ?? "top";

        const cached = SESSION_CONTENT_CACHE.get(sessionPath);
        if (cached) {
          if (openPosition === "top" && cached.hasMore) {
            // Top mode expects full history available immediately for stable tree anchors.
            // Force a fresh full hydration to avoid partial-cache entry mismatch.
            SESSION_CONTENT_CACHE.delete(sessionPath);
          } else {
            setEntries(cached.entries);
            setLineCount(cached.lineCount);
            updateHasMoreHistory(cached.hasMore);
            nextOffsetRef.current = cached.nextOffset;
            fileSizeRef.current = cached.fileSize;
            lineCountRef.current = cached.lineCount;
            setActiveEntryId(getDefaultActiveEntryId(cached.entries));

            pendingScrollToBottomRef.current =
              !initialEntryId && openPosition === "bottom";
            return;
          }
        }

        loadingTimerRef.current = setTimeout(() => {
          if (!cancelled) {
            setShowLoading(true);
          }
        }, 300);

        if (isLiveRef.current) {
          try {
            const liveEntries = await invoke<any[]>("get_pi_agent_entries", {
              sessionId:
                sessionPath.split("/").pop()?.replace(".jsonl", "") ||
                sessionPath,
            });
            if (liveEntries && liveEntries.length > 0) {
              setEntries(liveEntries);
              setLineCount(liveEntries.length);
              setLoading(false);
              setShowLoading(false);
              return;
            }
          } catch (e) {
            console.warn(
              "[useSessionViewerData] Failed to fetch live entries, falling back to disk:",
              e,
            );
          }
        }

        let chunk = await readRuntimeSessionChunk(sessionPath, 0, 384 * 1024);

        let { entries: allEntries, lineCount: totalLineCount } =
          parseSessionEntriesWithLineCount(chunk.content);
        let nextOffset = chunk.next_offset;
        const fileSize = chunk.file_size;
        let hasMore = chunk.has_more;

        if (openPosition === "top") {
          while (hasMore) {
            const nextChunk = await readRuntimeSessionChunk(
              sessionPath,
              nextOffset,
              384 * 1024,
            );

            const { entries: chunkEntries, lineCount: chunkLineCount } =
              parseSessionEntriesWithLineCount(nextChunk.content);

            allEntries = mergeEntriesWithUniqueIds(allEntries, chunkEntries);
            totalLineCount += chunkLineCount;
            nextOffset = nextChunk.next_offset;
            hasMore = nextChunk.has_more;
            chunk = nextChunk;

            if (cancelled) {
              return;
            }
          }
        }

        cacheSessionContent(sessionPath, {
          entries: allEntries,
          lineCount: totalLineCount,
          nextOffset,
          fileSize,
          hasMore,
        });

        if (cancelled) {
          return;
        }

        nextOffsetRef.current = nextOffset;
        fileSizeRef.current = fileSize;
        lineCountRef.current = totalLineCount;

        setEntries(allEntries);
        setLineCount(totalLineCount);
        updateHasMoreHistory(hasMore);
        setActiveEntryId(getDefaultActiveEntryId(allEntries));

        pendingScrollToBottomRef.current =
          !initialEntryId && openPosition === "bottom";
      } catch (loadError) {
        if (!cancelled) {
          console.error(
            "[useSessionViewerData] Failed to load session:",
            loadError,
          );
          setError(
            loadError instanceof Error
              ? loadError.message
              : loadErrorMessageRef.current,
          );
        }
      } finally {
        if (!cancelled) {
          if (loadingTimerRef.current) {
            clearTimeout(loadingTimerRef.current);
            loadingTimerRef.current = null;
          }
          setLoading(false);
          setShowLoading(false);
        }
      }
    };

    void doLoad();

    return () => {
      cancelled = true;
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
    };
  }, [
    datasetRefreshVersion,
    initialEntryId,
    sessionPath,
    updateHasMoreHistory,
  ]);

  useEffect(() => {
    if (initialEntryId) {
      setScrollTargetId(initialEntryId);
    }
  }, [initialEntryId]);

  useEffect(() => {
    if (!isBrowserDatasetModeEnabled() || typeof window === "undefined") {
      return;
    }

    const handleRefresh = () => {
      SESSION_CONTENT_CACHE.delete(sessionPath);
      setDatasetRefreshVersion((value) => value + 1);
    };

    window.addEventListener(BROWSER_DATASET_REFRESHED_EVENT, handleRefresh);
    return () => {
      window.removeEventListener(
        BROWSER_DATASET_REFRESHED_EVENT,
        handleRefresh,
      );
    };
  }, [sessionPath]);

  useEffect(() => {
    if (!sessionPath || loading) return;
    if (!shouldListenRuntimeSessionEvents()) return;

    let unlistenSessionsChanged: (() => void) | null = null;
    let unlistenLiveEvents: (() => void) | null = null;

    const setup = async () => {
      const sessionId = extractSessionId(sessionPath);

      // Track live session registration — when live, skip file-watcher disk reads
      const listenReg = psmRuntimeEventBus.subscribe<
        "pi-live:session_registered",
        PiLiveSessionRegisteredPayload
      >("pi-live:session_registered", (event) => {
        const payload = event.payload;
        if (
          payload.sessionId.includes(sessionPath) ||
          sessionPath.includes(payload.sessionId)
        ) {
          isLiveRef.current = true;
          // When bridge connects/reconnects, it sends the full entries list. Sync it!
          if (Array.isArray(payload.entries) && payload.entries.length > 0) {
            setEntries(payload.entries as SessionEntry[]);
          }
        }
      });
      const listenDisc = psmRuntimeEventBus.subscribe<
        "pi-live:session_disconnected",
        PiLiveSessionDisconnectedPayload
      >("pi-live:session_disconnected", ({ payload }) => {
        if (payload.sessionId === sessionId) isLiveRef.current = false;
      });
      unlistenLiveEvents = () => {
        listenReg();
        listenDisc();
      };

      // Only listen to file-watcher when NOT live (avoid conflict with real-time WS streaming)
      unlistenSessionsChanged = await listen<SessionsDiff>(
        "sessions-changed",
        (event) => {
          if (isLiveRef.current) return;
          const diff = event.payload;
          if (!diff?.updated?.length) return;

          const hit = diff.updated.some(
            (session) => session.path === sessionPath,
          );
          if (hit) {
            void loadMoreHistory({ asRealtime: true });
          }
        },
      );

      const handleLiveEvent = (
        eventType: string,
        payload: {
          sessionId: string;
          sessionPath?: string;
          [key: string]: any;
        },
      ) => {
        // Robust sessionId matching: could be full ID or just the UUID
        const matches =
          payload.sessionId === sessionId ||
          (payload.sessionId && sessionId.includes(payload.sessionId)) ||
          (sessionId && payload.sessionId.includes(sessionId));
        if (!matches) return;

        const raw = payload as Record<string, any>;
        if (payload.sessionPath && payload.sessionPath !== sessionPath) return;

        if (eventType.startsWith("message_")) {
          const rawMessage = raw.message || raw;
          const isUser = rawMessage?.role === "user";
          const messageIdFromRaw =
            rawMessage?.id || rawMessage?.responseId || rawMessage?.response_id;

          // Case A: message_start -> Register a new ID or use raw one
          if (eventType === "message_start") {
            if (messageIdFromRaw) {
              lastResponseIdRef.current = messageIdFromRaw;
            } else if (!isUser) {
              // Generate a stable ID for this turn if backend didn't provide one
              lastResponseIdRef.current = `assistant-msg-${Date.now()}`;
            }
          }

          // Case B: message_update -> Use the tracked active ID
          let messageId =
            messageIdFromRaw || (isUser ? null : lastResponseIdRef.current);

          setEntries((prev) => {
            // Deduplication for user messages (content fingerprinting)
            if (isUser && !messageId) {
              const rawText = Array.isArray(rawMessage.content)
                ? rawMessage.content.find((c: any) => c.text)?.text
                : typeof rawMessage.content === "string"
                  ? rawMessage.content
                  : "";

              const duplicate = prev
                .slice(-5)
                .find(
                  (e) =>
                    e.type === "message" &&
                    e.message?.role === "user" &&
                    (Array.isArray(e.message.content)
                      ? e.message.content.some((c: any) => c.text === rawText)
                      : e.message.content === rawText),
                );
              if (duplicate) {
                messageId = duplicate.id;
              } else {
                messageId = `user-msg-${rawText.substring(0, 10)}-${Date.now()}`;
              }
            }

            if (!messageId) return prev;

            const existingIndex = prev.findIndex((e) => e.id === messageId);
            let nextContent = Array.isArray(rawMessage?.content)
              ? [...rawMessage.content]
              : [];

            // Delta merging if applicable
            if (raw.assistantMessageEvent && existingIndex !== -1) {
              const existingContent =
                prev[existingIndex].message?.content || [];
              if (
                nextContent.length === 0 ||
                (nextContent.length === 1 && nextContent[0].text === "")
              ) {
                nextContent = appendDeltaToMessageContent(
                  existingContent as any[],
                  raw.assistantMessageEvent,
                );
              }
            }

            let parentId = raw.parentId;
            if (!parentId && existingIndex === -1 && prev.length > 0) {
              parentId = prev[prev.length - 1].id;
            }

            const liveEntry: SessionEntry = {
              type: "message",
              id: messageId,
              parentId:
                parentId ||
                (existingIndex !== -1
                  ? prev[existingIndex].parentId
                  : undefined),
              timestamp:
                raw.timestamp ||
                (existingIndex !== -1
                  ? prev[existingIndex].timestamp
                  : new Date().toISOString()),
              message: {
                ...rawMessage,
                role:
                  rawMessage?.role ||
                  (existingIndex !== -1
                    ? prev[existingIndex].message?.role
                    : "assistant"),
                content:
                  nextContent.length > 0
                    ? nextContent
                    : existingIndex !== -1
                      ? prev[existingIndex].message?.content
                      : [],
              },
            };

            let next = [...prev];
            if (existingIndex === -1) {
              next.push(liveEntry);
            } else {
              // Merge carefully
              next[existingIndex] = {
                ...next[existingIndex],
                ...liveEntry,
                message: {
                  role:
                    liveEntry.message?.role ??
                    next[existingIndex].message?.role ??
                    "unknown",
                  ...next[existingIndex].message,
                  ...liveEntry.message,
                  // Keep existing content if new content is empty (prevent wipeouts)
                  content: liveEntry.message?.content?.length
                    ? liveEntry.message.content
                    : (next[existingIndex].message?.content ?? []),
                },
              };
            }

            // Sort stably
            next.sort((a, b) => {
              const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
              const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
              if (ta !== tb) return ta - tb;
              return 0; // Keep stable for same-ms events
            });

            return next;
          });

          if (messageId) {
            setActiveEntryId(messageId);
            if (
              eventType === "message_start" ||
              eventType === "message_update"
            ) {
              setStreamingId(messageId);
            }
          }
          if (eventType === "message_end") {
            setStreamingId(null);
          }

          if (isAtBottomRef.current) {
            pendingScrollToBottomRef.current = true;
          } else {
            setHasNewMessages(true);
          }
          return;
        }

        if (eventType === "turn_end" && raw.message) {
          const m = raw.message;
          const mid = m.id || m.responseId || m.response_id;
          if (mid) {
            setEntries((prev) => {
              const existingIdx = prev.findIndex((e) => e.id === mid);
              if (existingIdx === -1) {
                return [
                  ...prev,
                  {
                    type: "message",
                    id: mid,
                    timestamp: m.timestamp || new Date().toISOString(),
                    message: { ...m },
                  },
                ];
              }
              const next = [...prev];
              // Merge carefully: don't overwrite with empty content if we already have it
              next[existingIdx] = {
                ...next[existingIdx],
                message: {
                  ...next[existingIdx].message,
                  ...m,
                  content:
                    m.content?.length > 0
                      ? m.content
                      : next[existingIdx].message?.content,
                },
              };
              return next;
            });
          }
        }

        if (eventType.startsWith("tool_execution_")) {
          const toolCallId = raw.toolCallId;
          if (!toolCallId) return;

          if (eventType === "tool_execution_update") {
            setEntries((prev) => {
              // Find message that has this toolCall
              const msgIdx = prev.findIndex(
                (e) =>
                  e.type === "message" &&
                  e.message?.role === "assistant" &&
                  e.message.content?.some(
                    (c: any) =>
                      c.type === "toolCall" && (c.id === toolCallId || c.toolCallId === toolCallId),
                  ),
              );

              if (msgIdx === -1) return prev;

              const next = [...prev];
              const msg = { ...next[msgIdx] };
              const content = [...(msg.message?.content || [])];
              const toolIdx = content.findIndex(
                (c: any) =>
                  c.type === "toolCall" && (c.id === toolCallId || c.toolCallId === toolCallId),
              );

              if (toolIdx !== -1) {
                content[toolIdx] = {
                  ...content[toolIdx],
                  // Merge update: name, status, arguments etc.
                  ...raw,
                  // !!! CRITICAL: Ensure we don't overwrite "toolCall" type with "tool_execution_update"
                  // Otherwise it gets filtered out from toolCalls list in AssistantMessage
                  type: "toolCall",
                  id: toolCallId,
                  // Ensure args are stringified into arguments if they arrive as object
                  arguments: raw.args
                    ? JSON.stringify(raw.args)
                    : raw.arguments || content[toolIdx].arguments,
                };
                msg.message = { ...msg.message!, content };
                next[msgIdx] = msg;
              }

              // Additionally, if there is partialResult, create/update a toolResult entry
              // so tool renderers can render the intermediate output.
              if (raw.partialResult || raw.result) {
                const resultData = raw.partialResult || raw.result;
                const toolResultEntry: SessionEntry = {
                  type: "message",
                  id: `tool-result-${toolCallId}`,
                  timestamp: raw.timestamp || new Date().toISOString(),
                  message: {
                    role: "toolResult",
                    toolCallId,
                    isError: !!raw.isError,
                    content: resultData.content || [],
                  },
                };
                const resIdx = next.findIndex(
                  (e) => e.id === toolResultEntry.id,
                );
                if (resIdx === -1) {
                  next.push(toolResultEntry);
                } else {
                  next[resIdx] = toolResultEntry;
                }
              }

              return next;
            });
          }

          if (eventType === "tool_execution_end") {
            const resultText =
              raw.result?.content?.find?.((c: any) => c.type === "text")
                ?.text || "";
            const toolResultEntry: SessionEntry = {
              type: "message",
              id: `tool-result-${toolCallId}`,
              timestamp: raw.timestamp || new Date().toISOString(),
              message: {
                role: "toolResult",
                toolCallId,
                isError: !!raw.isError,
                content: raw.result?.content || [
                  { type: "text", text: resultText },
                ],
              },
            };

            setEntries((prev) => {
              const existingIndex = prev.findIndex(
                (e) => e.id === toolResultEntry.id,
              );
              if (existingIndex === -1) return [...prev, toolResultEntry];
              const next = [...prev];
              next[existingIndex] = toolResultEntry;
              return next;
            });
          }
        }
      };

      const liveEventNames = [
        "message_start",
        "message_update",
        "message_end",
        "tool_execution_start",
        "tool_execution_update",
        "tool_execution_end",
        "turn_start",
        "turn_end",
      ] as const;
      const liveEventUnsubs = liveEventNames.map((eventName) =>
        psmRuntimeEventBus.subscribe<string, PiLiveChatEventPayload>(eventName, ({ payload }) => {
          handleLiveEvent(eventName, payload);
        }),
      );
      const prevLiveEvents = unlistenLiveEvents;
      unlistenLiveEvents = () => {
        prevLiveEvents?.();
        liveEventUnsubs.forEach((dispose) => dispose());
      };
    };

    void setup();

    return () => {
      isLiveRef.current = false;
      unlistenSessionsChanged?.();
      unlistenLiveEvents?.();
    };
  }, [loadMoreHistory, loading, sessionPath, isAtBottomRef]);

  return {
    entries,
    loading,
    showLoading,
    error,
    activeEntryId,
    setActiveEntryId,
    scrollTargetId,
    setScrollTargetId,
    hasNewMessages,
    setHasNewMessages,
    streamingId,
    pendingScrollToBottomRef,
    hasMoreHistory,
    loadMoreHistory: async () => {
      await loadMoreHistory();
    },
  };
}
