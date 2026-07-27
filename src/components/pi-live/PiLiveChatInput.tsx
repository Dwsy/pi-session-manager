import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { ArrowUp, Loader2, Slash, Square } from "lucide-react";
import { usePiLive } from "@/hooks/usePiLive";
import type { PiLiveSlashCommand } from "@/types/pi-live";
import { useTranslation } from "react-i18next";

interface PiLiveChatInputProps {
  sessionId: string;
  isLive?: boolean;
  onSent?: () => void;
}

const MAX_HISTORY = 20;

function normalizeSessionMatch(candidate: string, target: string): boolean {
  return (
    candidate === target ||
    candidate.includes(target) ||
    target.includes(candidate)
  );
}

function renderHighlightedCommandName(name: string, query: string | null) {
  if (!query) return name;
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return name;

  const lower = name.toLowerCase();
  const index = lower.indexOf(normalizedQuery);
  if (index === -1) return name;

  const before = name.slice(0, index);
  const matched = name.slice(index, index + normalizedQuery.length);
  const after = name.slice(index + normalizedQuery.length);

  return (
    <>
      {before}
      <span className="text-primary">{matched}</span>
      {after}
    </>
  );
}

function historyStorageKey(sessionId: string): string {
  return `pi-session-manager:live-input-history:${sessionId}`;
}

function findNextSupportedCommandIndex(
  commands: PiLiveSlashCommand[],
  startIndex: number,
  direction: 1 | -1,
): number {
  if (commands.length === 0) return 0

  for (let index = startIndex + direction; index >= 0 && index < commands.length; index += direction) {
    if (commands[index]?.supported !== false) return index
  }

  return startIndex
}

export default function PiLiveChatInput({
  sessionId,
  isLive: isLiveProp,
  onSent,
}: PiLiveChatInputProps) {
  const { t } = useTranslation();
  const { sessions, prompt, steer, followUp, abort, getCommands, isEnabled } =
    usePiLive();
  const isActive = isEnabled && (isLiveProp ?? true);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [commands, setCommands] = useState<PiLiveSlashCommand[]>([]);
  const [commandsLoading, setCommandsLoading] = useState(false);
  const [commandIndex, setCommandIndex] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyCursor, setHistoryCursor] = useState(-1);
  const historyIndexRef = useRef(-1);
  const [historyDraft, setHistoryDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const liveSession = sessions.find((session) =>
    normalizeSessionMatch(session.sessionId, sessionId),
  );
  const isStreaming = liveSession?.isStreaming ?? false;
  const steeringQueue = liveSession?.steeringQueue || [];
  const followUpQueue = liveSession?.followUpQueue || [];
  const pendingQueueCount =
    liveSession?.pendingMessageCount ??
    steeringQueue.length + followUpQueue.length;
  const latestSteer = steeringQueue[0] || "";
  const latestFollowUp = followUpQueue[0] || "";

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(historyStorageKey(sessionId));
      const parsed = raw ? JSON.parse(raw) : [];
      setHistory(
        Array.isArray(parsed)
          ? parsed.filter((value) => typeof value === "string")
          : [],
      );
    } catch {
      setHistory([]);
    }
  }, [sessionId]);

  const persistHistory = useCallback(
    (items: string[]) => {
      setHistory(items);
      if (typeof window === "undefined") return;
      try {
        localStorage.setItem(
          historyStorageKey(sessionId),
          JSON.stringify(items),
        );
      } catch {
        // ignore
      }
    },
    [sessionId],
  );

  const appendHistory = useCallback(
    (message: string) => {
      const normalized = message.trim();
      if (!normalized) return;
      const next = [
        normalized,
        ...history.filter((item) => item !== normalized),
      ].slice(0, MAX_HISTORY);
      persistHistory(next);
      historyIndexRef.current = -1;
      setHistoryCursor(-1);
      setHistoryDraft("");
    },
    [history, persistHistory],
  );

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "0px";
    const nextHeight = Math.min(Math.max(element.scrollHeight, 40), 180);
    element.style.height = `${nextHeight}px`;
  }, [input]);

  useEffect(() => {
    if (!isLiveProp) {
      setCommands([]);
      return;
    }
    let cancelled = false;
    setCommandsLoading(true);
    getCommands(sessionId)
      .then((list) => {
        if (!cancelled) {
          setCommands(list);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCommands([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCommandsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getCommands, sessionId, isLiveProp]);

  const slashQuery = useMemo(() => {
    const trimmedStart = input.trimStart();
    if (!trimmedStart.startsWith("/")) return null;
    const body = trimmedStart.slice(1);
    if (body.includes(" ")) return null;
    return body;
  }, [input]);

  const slashMatches = useMemo(() => {
    if (slashQuery === null) return [];
    const q = slashQuery.toLowerCase();
    return commands
      .filter((command) => command.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [commands, slashQuery]);

  const hasBareSlashCommandInput = useMemo(() => {
    if (slashQuery === null) return false;
    return (
      input.trimStart().startsWith("/") && !input.trimStart().includes(" ")
    );
  }, [input, slashQuery]);

  useEffect(() => {
    setCommandIndex(0);
  }, [slashQuery]);

  const applySlashCommand = useCallback((command: PiLiveSlashCommand) => {
    if (command.supported === false) {
      return
    }
    setInput(`/${command.name} `);
    setCommandIndex(0);
    requestAnimationFrame(() => {
      const element = textareaRef.current;
      if (!element) return;
      const end = element.value.length;
      element.focus();
      element.setSelectionRange(end, end);
    });
  }, []);

  const sendMessage = useCallback(
    async (override?: "prompt" | "steer" | "follow_up") => {
      const text = input.trim();
      if (!text || sending) return;

      const slashLike = text.startsWith("/");

      try {
        setSending(true);

        if (override === "follow_up") {
          await followUp(sessionId, text);
        } else if (slashLike) {
          await prompt(sessionId, text);
        } else if (!isStreaming || override === "prompt") {
          await prompt(sessionId, text);
        } else {
          await steer(sessionId, text);
        }

        appendHistory(text);
        setInput("");
        onSent?.();
      } catch (error) {
        console.error("[PiLiveChatInput] send failed:", error);
      } finally {
        setSending(false);
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    },
    [
      appendHistory,
      followUp,
      input,
      isStreaming,
      onSent,
      prompt,
      sending,
      sessionId,
      steer,
    ],
  );

  const stopStreaming = useCallback(async () => {
    try {
      await abort(sessionId);
    } catch (error) {
      console.error("[PiLiveChatInput] abort failed:", error);
    }
  }, [abort, sessionId]);

  const navigateHistory = useCallback(
    (direction: "up" | "down") => {
      if (!history.length) return;

      if (direction === "up") {
        const prev = historyIndexRef.current;
        const nextIndex = prev < history.length - 1 ? prev + 1 : prev;
        if (prev === -1) {
          setHistoryDraft(input);
        }
        historyIndexRef.current = nextIndex;
        setHistoryCursor(nextIndex);
        setInput(history[nextIndex] || input);
        return;
      }

      const prev = historyIndexRef.current;
      if (prev <= 0) {
        historyIndexRef.current = -1;
        setHistoryCursor(-1);
        setInput(historyDraft);
        return;
      }

      const nextIndex = prev - 1;
      historyIndexRef.current = nextIndex;
      setHistoryCursor(nextIndex);
      setInput(history[nextIndex] || "");
    },
    [history, historyDraft, input],
  );

  const isCaretOnFirstVisualLine = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return false;
    const caret = element.selectionStart ?? 0;
    return !element.value.slice(0, caret).includes("\n");
  }, []);

  const isCaretOnLastVisualLine = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return false;
    const caret = element.selectionEnd ?? element.value.length;
    return !element.value.slice(caret).includes("\n");
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      if (slashMatches.length > 0) {
        event.preventDefault();
        setInput((prev) => prev.replace(/^\/\S*\s?/, ""));
        return;
      }

      if (isStreaming) {
        event.preventDefault();
        void stopStreaming();
      }
      return;
    }

    if (
      slashMatches.length > 0 &&
      (event.key === "ArrowDown" || event.key === "ArrowUp")
    ) {
      event.preventDefault();
      setCommandIndex((prev) => {
        if (event.key === "ArrowDown") {
          return findNextSupportedCommandIndex(slashMatches, prev, 1);
        }
        return findNextSupportedCommandIndex(slashMatches, prev, -1);
      });
      return;
    }

    if (slashMatches.length > 0 && event.key === "Tab") {
      event.preventDefault();
      const command = slashMatches[commandIndex] || slashMatches[0];
      if (command && command.supported !== false) {
        applySlashCommand(command);
      }
      return;
    }

    if (
      event.key === "ArrowUp" &&
      !slashMatches.length &&
      (input.trim().length === 0 || historyIndexRef.current >= 0) &&
      isCaretOnFirstVisualLine()
    ) {
      event.preventDefault();
      navigateHistory("up");
      return;
    }

    if (
      event.key === "ArrowDown" &&
      !slashMatches.length &&
      historyIndexRef.current >= 0 &&
      isCaretOnLastVisualLine()
    ) {
      event.preventDefault();
      navigateHistory("down");
      return;
    }

    if (event.key === "Enter" && event.altKey) {
      if (isStreaming) {
        event.preventDefault();
        void sendMessage("follow_up");
      }
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      if (hasBareSlashCommandInput && slashMatches.length > 0) {
        event.preventDefault();
        const command = slashMatches[commandIndex] || slashMatches[0]
        if (command?.supported !== false) {
          applySlashCommand(command);
        }
        return;
      }
      event.preventDefault();
      void sendMessage();
    }
  };

  if (!isActive) return null;

  return (
    <div className="border-t border-border/50 bg-surface/60 px-4 py-3">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Slash className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/70" />
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>
              {isStreaming
                ? t("session.liveInput.live", "Live input")
                : t("session.liveInput.prompt", "Prompt input")}
            </span>
            {pendingQueueCount > 0 && (
              <span className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] text-foreground">
                {t("session.liveInput.queue", "Queue {{count}}", {
                  count: pendingQueueCount,
                })}
              </span>
            )}
          </div>
        </div>

        {isStreaming && (
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-border/50 bg-background/35 px-2.5 py-1 text-[11px] text-muted-foreground">
              {t(
                "session.liveInput.queueShortcut",
                "Enter = steer · Alt+Enter = follow-up",
              )}
            </div>
            <button
              type="button"
              onClick={() => void stopStreaming()}
              className="inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] text-destructive transition-colors hover:bg-destructive/15"
            >
              <Square className="h-3 w-3 fill-current" />
              {t("session.liveInput.stop", "Stop")}
            </button>
          </div>
        )}

        {(steeringQueue.length > 0 || followUpQueue.length > 0) && (
          <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-[11px] text-muted-foreground">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {steeringQueue.length > 0 && (
                  <div className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border/50 bg-secondary/40 px-2 py-1">
                    <span className="font-medium text-foreground">
                      {t("session.liveInput.steerQueue", "Steer queue")}
                    </span>
                    <span className="rounded bg-background px-1.5 py-0.5 text-[10px] text-foreground">
                      {steeringQueue.length}
                    </span>
                    <span className="max-w-[220px] truncate">
                      {latestSteer}
                    </span>
                  </div>
                )}
                {followUpQueue.length > 0 && (
                  <div className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border/50 bg-secondary/40 px-2 py-1">
                    <span className="font-medium text-foreground">
                      {t("session.liveInput.followUpQueue", "Follow-up queue")}
                    </span>
                    <span className="rounded bg-background px-1.5 py-0.5 text-[10px] text-foreground">
                      {followUpQueue.length}
                    </span>
                    <span className="max-w-[220px] truncate">
                      {latestFollowUp}
                    </span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setQueueExpanded((prev) => !prev)}
                className="rounded-md px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              >
                {queueExpanded
                  ? t("session.liveInput.queueCollapse", "Collapse")
                  : t("session.liveInput.queueExpand", "Expand")}
              </button>
            </div>

            {queueExpanded && (
              <div className="mt-2 space-y-2 border-t border-border/40 pt-2">
                {steeringQueue.length > 0 && (
                  <div>
                    <div className="mb-1 font-medium text-foreground">
                      {t("session.liveInput.steerQueue", "Steer queue")}
                    </div>
                    <div className="space-y-1">
                      {steeringQueue.map((item, index) => (
                        <div
                          key={`steer-${index}`}
                          className="truncate rounded-md bg-secondary/30 px-2 py-1"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {followUpQueue.length > 0 && (
                  <div>
                    <div className="mb-1 font-medium text-foreground">
                      {t("session.liveInput.followUpQueue", "Follow-up queue")}
                    </div>
                    <div className="space-y-1">
                      {followUpQueue.map((item, index) => (
                        <div
                          key={`follow-${index}`}
                          className="truncate rounded-md bg-secondary/30 px-2 py-1"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {slashQuery !== null && (
          <div className="rounded-lg border border-border/50 bg-background/40 px-2 py-2">
            <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
              <Slash className="h-3 w-3" />
              <span>
                {commandsLoading
                  ? t("session.liveInput.loadingCommands", "Loading commands…")
                  : t("session.liveInput.slashCommands", "Slash commands")}
              </span>
            </div>
            <div className="space-y-0.5">
              {slashMatches.length === 0 ? (
                <div className="px-2 py-1 text-[11px] text-muted-foreground">
                  {t("session.liveInput.noMatchingCommands", "No matching commands")}
                </div>
              ) : (
                slashMatches.map((command, index) => (
                  <button
                    key={command.name}
                    type="button"
                    onClick={() => {
                      if (command.supported !== false) {
                        applySlashCommand(command)
                      }
                    }}
                    disabled={command.supported === false}
                    className={`flex w-full items-start justify-between gap-3 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors ${
                      index === commandIndex
                        ? "bg-primary/10 text-foreground"
                        : command.supported === false
                          ? "cursor-not-allowed text-muted-foreground/50"
                          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">
                        /
                        {renderHighlightedCommandName(command.name, slashQuery)}
                      </div>
                      {command.description && (
                        <div className="truncate text-[10px] text-muted-foreground/80">
                          {command.description}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {command.source}
                      </span>
                      {command.supported === false && (
                        <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive/80">
                          {t("session.liveInput.unsupportedCommand", "Unsupported")}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <div className="relative">
          {historyCursor >= 0 && history[historyCursor] && (
            <div className="mb-2 rounded-lg border border-border/30 bg-background/25 px-3 py-2 text-[11px] text-muted-foreground">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {t("session.liveInput.recentMessage", "Recent message {{current}}/{{total}}", {
                    current: historyCursor + 1,
                    total: history.length,
                  })}
                </span>
                <span>{t("session.liveInput.recentHint", "↑↓ browse · type to exit history")}</span>
              </div>
              <div className="line-clamp-3 whitespace-pre-wrap break-words">
                {history[historyCursor]}
              </div>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              historyIndexRef.current = -1;
              setHistoryCursor(-1);
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={
              isStreaming
                ? t("session.liveInput.placeholderSteer", "Type a steer message…")
                : t("session.liveInput.placeholderPrompt", "Type a prompt…")
            }
            className="w-full resize-none overflow-y-auto rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5 pr-24 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
            {sending && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={!input.trim() || sending}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/80">
          <span>{t("session.liveInput.hintEnterSend", "Enter send")}</span>
          <span>{t("session.liveInput.hintShiftEnter", "Shift+Enter newline")}</span>
          <span>{t("session.liveInput.hintAltEnter", "Alt+Enter follow-up")}</span>
          <span>{t("session.liveInput.hintRecent", "↑ recent messages when empty")}</span>
          <span>{t("session.liveInput.hintAutocomplete", "Tab autocomplete slash command")}</span>
          <span>{t("session.liveInput.hintStop", "Esc stop")}</span>
        </div>
      </div>
    </div>
  );
}
