import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ExternalLink,
  Loader2,
  MessageCircleQuestion,
  PanelsRightBottom,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import {
  type PsmCapabilityClient,
  type PsmModelOption,
  type PsmPluginI18nClient,
  type PsmSessionReference,
  type PsmSideChatCitation,
} from "@pi-session-manager/plugin-sdk";
import { askSideChatWithAgent } from "./agentSidechat";
import { sideChatStyles } from "./styles";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
const SNIPPET_LIMIT_OPTIONS = [4, 6, 8, 10, 12] as const;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 640;
const MODEL_OPTIONS_TIMEOUT_MS = 5000;
const SIDECHAT_RECORD_TYPE = "sidechat.thread";
const SIDECHAT_SCHEMA_VERSION = 1;
const MAX_HISTORY_MESSAGES = 40;

let cachedModelOptions: PsmModelOption[] | null = null;
let cachedModelOptionsPromise: Promise<PsmModelOption[]> | null = null;

interface SideChatPluginSettings {
  provider: string;
  model: string;
  thinkingLevel: string;
  snippetLimit: number;
  panelWidth: number;
  optionsExpanded: boolean;
  showQuickPrompts: boolean;
}

interface SessionSideChatPanelProps {
  client: PsmCapabilityClient;
  i18n: PsmPluginI18nClient;
  session: PsmSessionReference;
  open: boolean;
  onClose: () => void;
  settings: SideChatPluginSettings;
  width?: number;
  onWidthChange?: (width: number) => void;
}

interface SideChatOptionsState {
  provider: string;
  model: string;
  thinkingLevel: string;
  limit: number;
}

interface OptionFieldProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  status?: ReactNode;
}

type SideChatRole = "user" | "assistant";
type SideChatStatus = "ready" | "submitted" | "streaming" | "done" | "error";

interface SideChatMessage {
  id: string;
  role: SideChatRole;
  parts: Array<{ type: "text"; text: string }>;
  createdAt: string;
  status?: SideChatStatus;
  citations?: PsmSideChatCitation[];
  provider?: string;
  model?: string;
  error?: string;
}

interface SideChatThreadPayload {
  messages: SideChatMessage[];
  options?: Partial<SideChatOptionsState>;
}

function citationEntryId(citation: PsmSideChatCitation) {
  return citation.entryId ?? citation.entry_id;
}

function citationCreatedAt(citation: PsmSideChatCitation, language?: string) {
  const raw = citation.timestamp ?? citation.createdAt ?? citation.created_at;
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language || undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function providerModelLabel(option: PsmModelOption) {
  return `${option.provider}/${option.model}`;
}

function messageText(message: SideChatMessage) {
  return message.parts.map((part) => part.text).join("");
}

function createMessage(role: SideChatRole, text: string, status?: SideChatStatus): SideChatMessage {
  const id = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    role,
    createdAt: new Date().toISOString(),
    parts: [{ type: "text", text }],
    status,
  };
}

function boundedHistory(messages: SideChatMessage[]) {
  return messages.slice(-MAX_HISTORY_MESSAGES);
}

function storageKey(sessionPath: string) {
  return `psm.sidechat.thread.${encodeURIComponent(sessionPath)}`;
}

function isSideChatMessage(value: unknown): value is SideChatMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as SideChatMessage;
  return (
    (candidate.role === "user" || candidate.role === "assistant") &&
    Array.isArray(candidate.parts) &&
    candidate.parts.every((part) => part?.type === "text" && typeof part.text === "string")
  );
}

function normalizePersistedMessage(message: SideChatMessage): SideChatMessage {
  if (message.status === "submitted") {
    return {
      ...message,
      status: "error",
      error: message.error || "Interrupted",
      parts: messageText(message) ? message.parts : [{ type: "text", text: message.error || "Interrupted" }],
    };
  }

  if (message.status === "streaming") {
    return {
      ...message,
      status: "done",
    };
  }

  return message;
}

function parseThreadPayload(value: unknown): SideChatThreadPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as SideChatThreadPayload;
  if (!Array.isArray(payload.messages)) return null;
  return {
    messages: payload.messages.filter(isSideChatMessage).map(normalizePersistedMessage),
    options: payload.options,
  };
}

function loadLocalThread(sessionPath: string): SideChatThreadPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(sessionPath));
    return raw ? parseThreadPayload(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function saveLocalThread(sessionPath: string, payload: SideChatThreadPayload) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(sessionPath), JSON.stringify(payload));
  } catch {
    // Local history is a cache; plugin records remain the preferred durable store.
  }
}

function optionField({ label, value, options, onChange, status }: OptionFieldProps) {
  return (
    <label className="block rounded-lg border border-border/60 bg-background/55 p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase text-muted-foreground">
          {label}
        </span>
        {status}
      </div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border/70 bg-background/80 px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
      >
        {options.map((option) => (
          <option key={`${label}-${option.value || "auto"}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function loadModelOptions(client: PsmCapabilityClient) {
  if (cachedModelOptions) {
    return Promise.resolve(cachedModelOptions);
  }

  if (cachedModelOptionsPromise) {
    return cachedModelOptionsPromise;
  }

  const timeoutPromise = new Promise<PsmModelOption[]>((_, reject) => {
    window.setTimeout(() => reject(new Error("model options request timed out")), MODEL_OPTIONS_TIMEOUT_MS);
  });

  cachedModelOptionsPromise = Promise.race([client.models.listOptions(), timeoutPromise])
    .then((items) => {
      cachedModelOptions = items;
      return items;
    })
    .finally(() => {
      cachedModelOptionsPromise = null;
    });

  return cachedModelOptionsPromise;
}

export default function SessionSideChatPanel({
  client,
  i18n,
  session,
  open,
  onClose,
  settings,
  width = settings.panelWidth,
  onWidthChange,
}: SessionSideChatPanelProps) {
  const { t, language } = i18n;
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<SideChatMessage[]>([]);
  const [status, setStatus] = useState<SideChatStatus>("ready");
  const [error, setError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(settings.optionsExpanded);
  const [models, setModels] = useState<PsmModelOption[]>(cachedModelOptions ?? []);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelLoadFailed, setModelLoadFailed] = useState(false);
  const [requestedModels, setRequestedModels] = useState(Boolean(cachedModelOptions));
  const [isResizing, setIsResizing] = useState(false);
  const [options, setOptions] = useState<SideChatOptionsState>({
    provider: settings.provider,
    model: settings.model,
    thinkingLevel: settings.thinkingLevel,
    limit: settings.snippetLimit,
  });
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const requestSeqRef = useRef(0);

  const trimmedInput = input.trim();
  const isBusy = status === "submitted" || status === "streaming";
  const selectedModelLabel = options.provider && options.model
    ? `${options.provider}/${options.model}`
    : t("session.sideChat.modelAuto", "Auto");

  const scrollToBottom = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const delta = start.x - event.clientX;
      const nextWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, start.width + delta));
      onWidthChange?.(nextWidth);
    };

    const handlePointerUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizing, onWidthChange]);

  useEffect(() => {
    if (!open || models.length > 0 || modelsLoading || requestedModels) return;

    let cancelled = false;
    setRequestedModels(true);
    setModelsLoading(true);
    setModelLoadFailed(false);

    loadModelOptions(client)
      .then((items) => {
        if (cancelled) return;
        setModels(items);
      })
      .catch((err) => {
        if (cancelled) return;
        setModelLoadFailed(true);
        console.error("[SessionSideChatPanel] Failed to load model options:", err);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, models.length, modelsLoading, open, requestedModels]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setHistoryLoaded(false);
    setError(null);
    setStatus("ready");

    const localPayload = loadLocalThread(session.path);
    if (localPayload) {
      setMessages(boundedHistory(localPayload.messages));
      setOptions((prev) => ({ ...prev, ...localPayload.options }));
    } else {
      setMessages([]);
    }

    client.records
      .listForScope({
        scopeType: "session",
        scopeId: session.path,
        recordType: SIDECHAT_RECORD_TYPE,
        limit: 1,
      })
      .then((records) => {
        if (cancelled) return;
        const payload = parseThreadPayload(records[0]?.payload);
        if (!payload) return;
        setMessages(boundedHistory(payload.messages));
        setOptions((prev) => ({ ...prev, ...payload.options }));
        saveLocalThread(session.path, payload);
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("[SessionSideChatPanel] Failed to load sidechat history:", err);
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoaded(true);
      });

    return () => {
      cancelled = true;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [client, open, session.path]);

  useEffect(() => {
    if (!open || !historyLoaded) return;
    const payload: SideChatThreadPayload = {
      messages: boundedHistory(messages.filter((message) => message.status !== "submitted")),
      options,
    };
    saveLocalThread(session.path, payload);

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      client.records
        .upsert({
          pluginId: "builtin.sidechat",
          scopeType: "session",
          scopeId: session.path,
          recordType: SIDECHAT_RECORD_TYPE,
          schemaVersion: SIDECHAT_SCHEMA_VERSION,
          payload,
          searchableText: messages.map(messageText).join("\n\n").slice(0, 8000),
        })
        .catch((err) => console.warn("[SessionSideChatPanel] Failed to save sidechat history:", err));
    }, 500);
  }, [client, historyLoaded, messages, open, options, session.path]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom, status]);

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeStartRef.current = { x: event.clientX, width };
    setIsResizing(true);
  };

  const updateAssistantMessage = useCallback((messageId: string, updater: (message: SideChatMessage) => SideChatMessage) => {
    setMessages((prev) => prev.map((message) => (message.id === messageId ? updater(message) : message)));
  }, []);

  const startAssistantStream = useCallback((messageId: string) => {
    updateAssistantMessage(messageId, (message) => ({
      ...message,
      status: "streaming",
      parts: [{ type: "text", text: "" }],
    }));
    setStatus("streaming");
  }, [updateAssistantMessage]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedInput || isBusy) return;

    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    const question = trimmedInput;
    const userMessage = createMessage("user", question, "done");
    const assistantMessage = createMessage("assistant", "", "submitted");
    setMessages((prev) => boundedHistory([...prev, userMessage, assistantMessage]));
    setInput("");
    setError(null);
    setStatus("submitted");

    try {
      let streamedAnswer = "";
      const response = await askSideChatWithAgent(client, {
          sessionPath: session.path,
          question,
          language,
          provider: options.provider || undefined,
          model: options.model || undefined,
          thinkingLevel: options.thinkingLevel || undefined,
          limit: options.limit,
        }, {
          onDelta(delta) {
            if (requestSeqRef.current !== requestSeq) return;
            if (!streamedAnswer) {
              startAssistantStream(assistantMessage.id);
            }
            streamedAnswer += delta;
            updateAssistantMessage(assistantMessage.id, (message) => ({
              ...message,
              status: "streaming",
              parts: [{ type: "text", text: streamedAnswer }],
            }));
          },
        });

      if (requestSeqRef.current !== requestSeq) return;
      updateAssistantMessage(assistantMessage.id, (message) => ({
        ...message,
        status: "done",
        parts: [{ type: "text", text: response.answer }],
        citations: response.citations ?? [],
        provider: response.provider,
        model: response.model,
      }));
      setStatus("ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (requestSeqRef.current !== requestSeq) return;
      setError(message);
      setStatus("ready");
      updateAssistantMessage(assistantMessage.id, (existing) => ({
        ...existing,
        status: "error",
        error: message,
        parts: [{ type: "text", text: message }],
      }));
    }
  };

  const handleResetThread = () => {
    requestSeqRef.current += 1;
    setMessages([]);
    setError(null);
    setStatus("ready");
    saveLocalThread(session.path, { messages: [], options });
  };

  const quickPrompts = [
    t("session.sideChat.quickSummary", "Summarize current goal and progress"),
    t("session.sideChat.quickBlockers", "What blockers remain?"),
    t("session.sideChat.quickNextSteps", "What should happen next?"),
  ];

  const modelOptions = useMemo(
    () => [
      { value: "", label: t("session.sideChat.modelAuto", "Auto") },
      ...models.map((option) => ({
        value: `${option.provider}::${option.model}`,
        label: providerModelLabel(option),
      })),
    ],
    [models, t],
  );

  const modelStatus = modelsLoading ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      {t("session.sideChat.loadingModelsShort", "Loading")}
    </span>
  ) : modelLoadFailed ? (
    <button
      type="button"
      onClick={() => {
        setRequestedModels(false);
        setModelLoadFailed(false);
      }}
      className="text-[11px] text-warning hover:text-foreground"
    >
      {t("session.sideChat.retryLoadModels", "Retry")}
    </button>
  ) : null;

  if (!open) return null;

  return (
    <aside className={sideChatStyles.panel} style={{ width }}>
      <div
        onPointerDown={handleResizeStart}
        className={sideChatStyles.resizeHandle(isResizing)}
        role="separator"
        aria-orientation="vertical"
        aria-label={t("session.sideChat.resize", "Resize side chat panel")}
      />

      <div className="border-b border-border/70 bg-background/35 px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <PanelsRightBottom className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {t("session.sideChat.title", "Side chat")}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {status === "submitted"
                  ? t("session.sideChat.searching", "Searching context")
                  : status === "streaming"
                    ? t("session.sideChat.streaming", "Streaming")
                    : selectedModelLabel}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleResetThread}
              className={sideChatStyles.iconButton}
              aria-label={t("session.sideChat.clearHistory", "Clear history")}
              title={t("session.sideChat.clearHistory", "Clear history")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className={sideChatStyles.iconButton}
              aria-label={t("common.close", "Close")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{t("session.sideChat.model", "Model")}</span>
            <select
              value={options.provider && options.model ? `${options.provider}::${options.model}` : ""}
              onChange={(event) => {
                const value = event.target.value;
                if (!value) {
                  setOptions((prev) => ({ ...prev, provider: "", model: "" }));
                  return;
                }
                const [provider, model] = value.split("::");
                setOptions((prev) => ({ ...prev, provider, model }));
              }}
              className="h-8 w-full rounded-md border border-border/70 bg-background/75 px-2.5 text-xs text-foreground outline-none focus:border-primary/50"
            >
              {modelOptions.map((option) => (
                <option key={`header-model-${option.value || "auto"}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {modelStatus}
          <button
            type="button"
            onClick={() => setOptionsOpen((value) => !value)}
            className={sideChatStyles.iconButton}
            aria-label={t("session.sideChat.options", "Options")}
            title={t("session.sideChat.options", "Options")}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {optionsOpen && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {optionField({
              label: t("session.sideChat.thinkingLevel", "Thinking level"),
              value: options.thinkingLevel,
              options: THINKING_LEVELS.map((level) => ({
                value: level,
                label: t(`components.thinkingLevel.${level}`, level),
              })),
              onChange: (value) => setOptions((prev) => ({ ...prev, thinkingLevel: value })),
            })}
            {optionField({
              label: t("session.sideChat.snippetLimit", "Snippet limit"),
              value: String(options.limit),
              options: SNIPPET_LIMIT_OPTIONS.map((value) => ({ value: String(value), label: String(value) })),
              onChange: (value) => setOptions((prev) => ({ ...prev, limit: Number(value) })),
            })}
          </div>
        )}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-auto px-3.5 py-3">
        {error && (
          <div className="mb-3 rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {!historyLoaded && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("session.sideChat.loadingHistory", "Loading history...")}
          </div>
        ) : messages.length > 0 ? (
          <div className="space-y-3">
            {messages.map((message) => (
              <ChatMessageView
                key={message.id}
                message={message}
                language={language}
                t={t}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col justify-center">
            <div className="rounded-lg border border-border/60 bg-background/45 p-4 text-sm text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <MessageCircleQuestion className="h-4 w-4 text-primary" />
                <span className="font-medium">{t("session.sideChat.emptyTitle", "Ask this session")}</span>
              </div>
              <p className="leading-6">
                {t("session.sideChat.empty", "Ask a focused question. PSM will retrieve relevant parts of this session and cite them.")}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border/70 bg-background/40 px-3.5 py-3">
        {settings.showQuickPrompts && messages.length === 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setInput(prompt)}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/70 px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Sparkles className="h-3 w-3" />
                {prompt}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t("session.sideChat.placeholder", "Ask about decisions, blockers, files, or next steps...")}
            rows={2}
            className="max-h-32 min-h-[48px] flex-1 resize-none rounded-lg border border-border/70 bg-background/85 px-3 py-2 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            type="submit"
            disabled={!trimmedInput || isBusy}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/14 text-foreground hover:bg-primary/18 disabled:cursor-not-allowed disabled:opacity-55"
            aria-label={t("session.sideChat.ask", "Ask")}
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>{t("session.sideChat.hint", "Uses search and snippets, not full-context injection.")}</span>
          <span>{messages.length > 0 ? t("session.sideChat.historyCount", "{{count}} messages", { count: messages.length }) : ""}</span>
        </div>
      </div>
    </aside>
  );
}

function ChatMessageView({
  message,
  language,
  t,
}: {
  message: SideChatMessage;
  language: string;
  t: PsmPluginI18nClient["t"];
}) {
  const isAssistant = message.role === "assistant";
  const citations = message.citations ?? [];
  return (
    <article className={isAssistant ? "pr-2" : "pl-8"}>
      <div
        className={
          isAssistant
            ? "rounded-lg border border-border/60 bg-background/60 p-3"
            : "rounded-lg border border-primary/20 bg-primary/10 p-3"
        }
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium uppercase text-muted-foreground">
            {isAssistant ? t("session.sideChat.assistant", "Assistant") : t("session.sideChat.you", "You")}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {message.status === "submitted" && (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("session.sideChat.searching", "Searching context")}
              </span>
            )}
            {message.status === "streaming" && t("session.sideChat.streaming", "Streaming")}
            {message.status === "error" && t("session.sideChat.failed", "Failed")}
            {message.status !== "submitted" && message.status !== "streaming" && message.status !== "error" && formatMessageTime(message.createdAt, language)}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
          {messageText(message) || (message.status === "submitted" ? t("session.sideChat.loading", "Searching session context...") : "")}
          {message.status === "streaming" && <span className="ml-0.5 inline-block h-4 w-1 animate-pulse rounded-full bg-primary/60 align-[-2px]" />}
        </p>
        {message.provider && message.model && (
          <div className="mt-2 text-[11px] text-muted-foreground">
            {message.provider}/{message.model}
          </div>
        )}
      </div>

      {isAssistant && citations.length > 0 && (
        <details className="mt-1.5 rounded-lg border border-border/45 bg-background/35 px-2.5 py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{t("session.sideChat.citations", "Citations")}</span>
            <span className="inline-flex items-center gap-1">
              {t("session.sideChat.citationCount", "{{count}} snippets", { count: citations.length })}
              <ChevronDown className="h-3 w-3" />
            </span>
          </summary>
          <div className="mt-2 space-y-2">
            {citations.map((citation, index) => {
              const entryId = citationEntryId(citation);
              const createdAt = citationCreatedAt(citation, language);
              return (
                <div key={`${entryId ?? "citation"}-${index}`} className="rounded-md border border-border/45 bg-background/65 p-2">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="rounded border border-border/50 bg-secondary px-1.5 py-0.5">
                      {citation.role || t("session.sideChat.unknownRole", "context")}
                    </span>
                    {typeof citation.score === "number" && (
                      <span className="rounded border border-emerald-500/20 bg-emerald-500/8 px-1.5 py-0.5 text-emerald-300">
                        {citation.score.toFixed(2)}
                      </span>
                    )}
                    {createdAt && <span>{createdAt}</span>}
                    {entryId && (
                      <span className="inline-flex min-w-0 items-center gap-1 truncate" title={entryId}>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{entryId}</span>
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-xs leading-5 text-foreground/90">{citation.snippet}</p>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </article>
  );
}

function formatMessageTime(value: string, language?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language || undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
