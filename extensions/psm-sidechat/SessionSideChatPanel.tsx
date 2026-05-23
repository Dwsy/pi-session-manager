import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ExternalLink,
  Loader2,
  MessageCircleQuestion,
  PanelsRightBottom,
  Send,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";

import {
  type PsmCapabilityClient,
  type PsmModelOption,
  type PsmPluginI18nClient,
  type PsmSessionReference,
  type PsmSideChatCitation,
} from "@pi-session-manager/plugin-sdk";
import { sideChatStyles } from "./styles";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
const SNIPPET_LIMIT_OPTIONS = [4, 6, 8, 10, 12] as const;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 640;
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

type SideChatOptionSchema =
  | {
      key: "model";
      label: string;
      type: "select";
      value: string;
      options: Array<{ value: string; label: string }>;
      loading?: boolean;
      onChange: (value: string) => void;
    }
  | {
      key: "thinkingLevel" | "limit";
      label: string;
      type: "select";
      value: string;
      options: Array<{ value: string; label: string }>;
      loading?: boolean;
      onChange: (value: string) => void;
    };

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
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<PsmSideChatCitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(settings.optionsExpanded);
  const [models, setModels] = useState<PsmModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [options, setOptions] = useState<SideChatOptionsState>({
    provider: settings.provider,
    model: settings.model,
    thinkingLevel: settings.thinkingLevel,
    limit: settings.snippetLimit,
  });
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null);

  const trimmedQuestion = question.trim();
  const selectedModelLabel = options.provider && options.model
    ? `${options.provider}/${options.model}`
    : t("session.sideChat.modelAuto", "Auto");
  const selectedThinkingLabel = t(`components.thinkingLevel.${options.thinkingLevel}`, options.thinkingLevel);
  const selectedLimitLabel = `${options.limit}`;

  useEffect(() => {
    if (!open || models.length > 0 || modelsLoading) return;

    let cancelled = false;
    setModelsLoading(true);
    client.models
      .listOptions()
      .then((items) => {
        if (cancelled) return;
        setModels(items);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[SessionSideChatPanel] Failed to load model options:", err);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client.models, models.length, modelsLoading, open]);

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

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeStartRef.current = { x: event.clientX, width };
    setIsResizing(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedQuestion || loading) return;

    setLoading(true);
    setError(null);
    try {
      const response = await client.sidechat.ask({
        sessionPath: session.path,
        question: trimmedQuestion,
        language,
        provider: options.provider || undefined,
        model: options.model || undefined,
        thinkingLevel: options.thinkingLevel || undefined,
        limit: options.limit,
      });
      setAnswer(response.answer);
      setCitations(response.citations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    t("session.sideChat.quickSummary", "Summarize current goal and progress"),
    t("session.sideChat.quickBlockers", "What blockers remain?"),
    t("session.sideChat.quickNextSteps", "What should happen next?"),
  ];

  const optionSchemas: SideChatOptionSchema[] = [
    {
      key: "model",
      label: t("session.sideChat.model", "Model"),
      type: "select",
      value: options.provider && options.model ? `${options.provider}::${options.model}` : "",
      options: [
        { value: "", label: t("session.sideChat.modelAuto", "Auto") },
        ...models.map((option) => ({
          value: `${option.provider}::${option.model}`,
          label: providerModelLabel(option),
        })),
      ],
      loading: modelsLoading,
      onChange: (value) => {
        if (!value) {
          setOptions((prev) => ({ ...prev, provider: "", model: "" }));
          return;
        }
        const [provider, model] = value.split("::");
        setOptions((prev) => ({ ...prev, provider, model }));
      },
    },
    {
      key: "thinkingLevel",
      label: t("session.sideChat.thinkingLevel", "Thinking level"),
      type: "select",
      value: options.thinkingLevel,
      options: THINKING_LEVELS.map((level) => ({
        value: level,
        label: t(`components.thinkingLevel.${level}`, level),
      })),
      onChange: (value) => setOptions((prev) => ({ ...prev, thinkingLevel: value })),
    },
    {
      key: "limit",
      label: t("session.sideChat.snippetLimit", "Snippet limit"),
      type: "select",
      value: String(options.limit),
      options: SNIPPET_LIMIT_OPTIONS.map((value) => ({ value: String(value), label: String(value) })),
      onChange: (value) => setOptions((prev) => ({ ...prev, limit: Number(value) })),
    },
  ];

  if (!open) return null;

  return (
    <aside
      className={sideChatStyles.panel}
      style={{ width }}
    >
      <div
        onPointerDown={handleResizeStart}
        className={sideChatStyles.resizeHandle(isResizing)}
        role="separator"
        aria-orientation="vertical"
        aria-label={t("session.sideChat.resize", "Resize side chat panel")}
      />

      <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-background/30 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-foreground/92">
            <PanelsRightBottom className="h-3.5 w-3.5 text-primary" />
            <span>{t("session.sideChat.title", "Side chat")}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{selectedModelLabel}</span>
            <span>·</span>
            <span>{selectedThinkingLabel}</span>
            <span>·</span>
            <span>{selectedLimitLabel} {t("session.sideChat.snippets", "snippets")}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={sideChatStyles.iconButton}
          aria-label={t("common.close", "Close")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="border-b border-border/70 bg-background/20 px-3 py-2">
        <button
          type="button"
          onClick={() => setOptionsOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-background/45 px-2.5 py-2 text-left"
        >
          <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground">
            <Settings2 className="h-3.5 w-3.5 text-primary" />
            <span>{t("session.sideChat.options", "Options")}</span>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${optionsOpen ? "rotate-180" : ""}`} />
        </button>
        {optionsOpen && (
          <div className="mt-2 grid gap-2">
            {optionSchemas.map((schema) => (
              <label key={schema.key} className="block space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {schema.label}
                </span>
                <select
                  value={schema.value}
                  onChange={(event) => schema.onChange(event.target.value)}
                  className="w-full rounded-md border border-border/70 bg-background/70 px-2.5 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                >
                  {schema.options.map((option) => (
                    <option key={`${schema.key}-${option.value || "auto"}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {schema.loading && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>{t("session.sideChat.loadingModels", "Loading models...")}</span>
                  </div>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="border-b border-border/70 px-3 py-3 space-y-2">
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t("session.sideChat.placeholder", "Ask about decisions, blockers, files, or next steps...")}
            className="min-h-[108px] w-full resize-none rounded-md border border-border/70 bg-background/70 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
          />
          {settings.showQuickPrompts && (
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setQuestion(prompt)}
                className="rounded-md border border-border/60 bg-background/45 px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Sparkles className="mr-1 inline h-3 w-3" />
                {prompt}
              </button>
            ))}
          </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {t("session.sideChat.hint", "Uses search and snippets, not full-context injection.")}
            </span>
            <button
              type="submit"
              disabled={!trimmedQuestion || loading}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/14 px-3 text-xs font-medium text-foreground hover:bg-primary/18 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              <span>{t("session.sideChat.ask", "Ask")}</span>
            </button>
          </div>
        </form>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {error && (
          <div className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {!answer && !error && !loading && (
          <div className="rounded-md border border-border/60 bg-background/45 px-3 py-3 text-sm text-muted-foreground">
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <MessageCircleQuestion className="h-4 w-4 text-primary" />
              <span className="font-medium">{t("session.sideChat.emptyTitle", "Ask this session")}</span>
            </div>
            <p>{t("session.sideChat.empty", "Ask a focused question. PSM will retrieve relevant parts of this session and cite them.")}</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-3 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t("session.sideChat.loading", "Searching session context...")}</span>
          </div>
        )}

        {answer && (
          <div className="space-y-3">
            <section className="rounded-md border border-border/60 bg-background/60 p-3">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("session.sideChat.answer", "Answer")}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{answer}</p>
            </section>

            <section className="rounded-md border border-border/60 bg-background/45 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("session.sideChat.citations", "Citations")}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t("session.sideChat.citationCount", "{{count}} snippets", { count: citations.length })}
                </div>
              </div>
              {citations.length > 0 ? (
                <div className="space-y-2">
                  {citations.map((citation, index) => {
                    const entryId = citationEntryId(citation);
                    const createdAt = citationCreatedAt(citation, language);
                    return (
                      <article key={`${entryId ?? "citation"}-${index}`} className="rounded-md border border-border/60 bg-background/55 p-2.5">
                        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="rounded border border-border/60 bg-secondary px-1.5 py-0.5">
                            {citation.role || t("session.sideChat.unknownRole", "context")}
                          </span>
                          {typeof citation.score === "number" && <span>{Math.round(citation.score * 100) / 100}</span>}
                          {entryId && (
                            <span className="inline-flex min-w-0 items-center gap-1 truncate" title={entryId}>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <span className="truncate">{entryId}</span>
                            </span>
                          )}
                          {createdAt && <span>{createdAt}</span>}
                        </div>
                        <p className="whitespace-pre-wrap text-xs leading-5 text-foreground/85">{citation.snippet}</p>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("session.sideChat.noCitations", "No citation snippets returned.")}
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </aside>
  );
}
