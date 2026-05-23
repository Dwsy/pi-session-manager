import { FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
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

interface OptionFieldProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  status?: ReactNode;
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

function optionField({ label, value, options, onChange, status }: OptionFieldProps) {
  return (
    <label className="block rounded-xl border border-border/70 bg-background/55 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        {status}
      </div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border/70 bg-background/80 px-2.5 py-2 text-sm text-foreground outline-none focus:border-primary/50"
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
  const [modelLoadFailed, setModelLoadFailed] = useState(false);
  const [requestedModels, setRequestedModels] = useState(false);
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
  const selectedLimitLabel = `${options.limit} ${t("session.sideChat.snippets", "snippets")}`;

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
    if (!open || !optionsOpen || models.length > 0 || modelsLoading || requestedModels) return;

    let cancelled = false;
    setRequestedModels(true);
    setModelsLoading(true);
    setModelLoadFailed(false);

    const timeoutMs = 5000;
    const timeoutPromise = new Promise<PsmModelOption[]>((_, reject) => {
      window.setTimeout(() => reject(new Error("model options request timed out")), timeoutMs);
    });

    Promise.race([client.models.listOptions(), timeoutPromise])
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
  }, [client.models, models.length, modelsLoading, open, optionsOpen, requestedModels]);

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
  ) : models.length > 0 ? (
    <span className="text-[11px] text-muted-foreground">
      {t("session.sideChat.loadedModels", "{{count}} models", { count: models.length })}
    </span>
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

      <div className="border-b border-border/70 bg-background/30 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.12em] text-foreground/92">
              <PanelsRightBottom className="h-3.5 w-3.5 text-primary" />
              <span>{t("session.sideChat.title", "Side chat")}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full border border-border/70 bg-background/75 px-2 py-1 text-[11px] text-foreground">
                {selectedModelLabel}
              </span>
              <span className="rounded-full border border-border/70 bg-background/75 px-2 py-1 text-[11px] text-foreground">
                {selectedThinkingLabel}
              </span>
              <span className="rounded-full border border-border/70 bg-background/75 px-2 py-1 text-[11px] text-foreground">
                {selectedLimitLabel}
              </span>
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
      </div>

      <div className="border-b border-border/70 bg-background/20 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOptionsOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/50 px-3 py-2.5 text-left"
          aria-label={t("session.sideChat.options", "Options")}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Settings2 className="h-3.5 w-3.5 text-primary" />
              <span>{t("session.sideChat.options", "Options")}</span>
            </div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground">
              {selectedModelLabel} · {selectedThinkingLabel} · {selectedLimitLabel}
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${optionsOpen ? "rotate-180" : ""}`} />
        </button>

        {optionsOpen && (
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {optionField({
              label: t("session.sideChat.model", "Model"),
              value: options.provider && options.model ? `${options.provider}::${options.model}` : "",
              options: modelOptions,
              status: modelStatus,
              onChange: (value) => {
                if (!value) {
                  setOptions((prev) => ({ ...prev, provider: "", model: "" }));
                  return;
                }
                const [provider, model] = value.split("::");
                setOptions((prev) => ({ ...prev, provider, model }));
              },
            })}
            {optionField({
              label: t("session.sideChat.thinkingLevel", "Thinking level"),
              value: options.thinkingLevel,
              options: THINKING_LEVELS.map((level) => ({
                value: level,
                label: t(`components.thinkingLevel.${level}`, level),
              })),
              onChange: (value) => setOptions((prev) => ({ ...prev, thinkingLevel: value })),
            })}
            <div className="md:col-span-2">
              {optionField({
                label: t("session.sideChat.snippetLimit", "Snippet limit"),
                value: String(options.limit),
                options: SNIPPET_LIMIT_OPTIONS.map((value) => ({ value: String(value), label: String(value) })),
                onChange: (value) => setOptions((prev) => ({ ...prev, limit: Number(value) })),
              })}
            </div>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error && (
          <div className="mb-3 rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t("session.sideChat.loading", "Searching session context...")}</span>
            </div>
          </div>
        ) : answer ? (
          <div className="space-y-3">
            <section className="rounded-xl border border-border/60 bg-background/65 p-4">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t("session.sideChat.answer", "Answer")}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{answer}</p>
            </section>

            <section className="rounded-xl border border-border/60 bg-background/50 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
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
                      <article key={`${entryId ?? "citation"}-${index}`} className="rounded-xl border border-border/60 bg-background/75 p-3">
                        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="rounded-full border border-border/60 bg-secondary px-1.5 py-0.5">
                            {citation.role || t("session.sideChat.unknownRole", "context")}
                          </span>
                          {typeof citation.score === "number" && (
                            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/8 px-1.5 py-0.5 text-emerald-300">
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
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-background/50 p-4 text-sm text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <MessageCircleQuestion className="h-4 w-4 text-primary" />
                <span className="font-medium">{t("session.sideChat.emptyTitle", "Ask this session")}</span>
              </div>
              <p>{t("session.sideChat.empty", "Ask a focused question. PSM will retrieve relevant parts of this session and cite them.")}</p>
            </div>
            {settings.showQuickPrompts && (
              <div className="rounded-xl border border-border/60 bg-background/50 p-4">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {t("session.sideChat.quickPrompts", "Quick prompts")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setQuestion(prompt)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <Sparkles className="h-3 w-3" />
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border/70 bg-background/25 px-4 py-3">
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t("session.sideChat.placeholder", "Ask about decisions, blockers, files, or next steps...")}
            className="min-h-[116px] w-full resize-none rounded-2xl border border-border/70 bg-background/80 px-3.5 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
          />
          <div className="flex items-end justify-between gap-3">
            <span className="max-w-[70%] text-[11px] leading-5 text-muted-foreground">
              {t("session.sideChat.hint", "Uses search and snippets, not full-context injection.")}
            </span>
            <button
              type="submit"
              disabled={!trimmedQuestion || loading}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-primary/30 bg-primary/14 px-4 text-sm font-medium text-foreground hover:bg-primary/18 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span>{t("session.sideChat.ask", "Ask")}</span>
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}
