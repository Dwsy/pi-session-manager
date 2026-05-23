import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BotMessageSquare,
  ChevronDown,
  ExternalLink,
  GripVertical,
  Loader2,
  MessageCircleQuestion,
  Search,
  Send,
  Settings2,
  X,
} from "lucide-react";

import {
  appPsmTransport,
  createPluginCapabilityClient,
  type PsmModelOption,
  type PsmSideChatCitation,
} from "@/plugins/runtime-sdk";
import type { SessionInfo } from "@/types";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
const DEFAULT_SNIPPET_LIMIT = 8;
const SNIPPET_LIMIT_OPTIONS = [4, 6, 8, 10, 12] as const;

interface SessionSideChatPanelProps {
  session: SessionInfo;
  open: boolean;
  onClose: () => void;
  width?: number;
}

interface SideChatOptionsState {
  provider: string;
  model: string;
  thinkingLevel: string;
  limit: number;
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

export default function SessionSideChatPanel({
  session,
  open,
  onClose,
  width = 380,
}: SessionSideChatPanelProps) {
  const { t, i18n } = useTranslation();
  const client = useMemo(
    () => createPluginCapabilityClient({ transport: appPsmTransport }),
    [],
  );
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<PsmSideChatCitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [models, setModels] = useState<PsmModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [options, setOptions] = useState<SideChatOptionsState>({
    provider: "",
    model: "",
    thinkingLevel: "medium",
    limit: DEFAULT_SNIPPET_LIMIT,
  });

  const trimmedQuestion = question.trim();
  const selectedModelLabel = options.provider && options.model
    ? `${options.provider}/${options.model}`
    : t("session.sideChat.modelAuto", "Auto")
  const selectedThinkingLabel = t(`components.thinkingLevel.${options.thinkingLevel}`, options.thinkingLevel)
  const selectedLimitLabel = `${options.limit}`

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedQuestion || loading) return;

    setLoading(true);
    setError(null);
    try {
      const response = await client.sidechat.ask({
        sessionPath: session.path,
        question: trimmedQuestion,
        language: i18n.language,
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

  if (!open) return null;

  return (
    <aside
      className="hidden h-full min-h-0 shrink-0 border-l border-border/70 bg-surface-dark/70 xl:flex xl:flex-col"
      style={{ width }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-background/35 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <BotMessageSquare className="h-4 w-4 text-primary" />
            <span>{t("session.sideChat.title", "Side chat")}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Search className="h-3 w-3" />
            <span>{t("session.sideChat.mode", "Retrieval answers from this session, without injecting the full transcript.")}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-background/40 text-muted-foreground">
            <GripVertical className="h-3.5 w-3.5" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground"
            aria-label={t("common.close", "Close")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border/70 p-3 space-y-2.5">
          <div className="rounded-lg border border-border/60 bg-background/45">
            <button
              type="button"
              onClick={() => setOptionsOpen((value) => !value)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <Settings2 className="h-3.5 w-3.5 text-primary" />
                  <span>{t("session.sideChat.options", "Options")}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                  <span>{selectedModelLabel}</span>
                  <span>·</span>
                  <span>{selectedThinkingLabel}</span>
                  <span>·</span>
                  <span>{selectedLimitLabel} {t("session.sideChat.snippets", "snippets")}</span>
                </div>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${optionsOpen ? "rotate-180" : ""}`} />
            </button>
            {optionsOpen && (
              <div className="border-t border-border/60 px-3 py-3 space-y-3">
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("session.sideChat.model", "Model")}
                  </span>
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
                    className="w-full rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                  >
                    <option value="">{t("session.sideChat.modelAuto", "Auto")}</option>
                    {models.map((option) => (
                      <option key={`${option.provider}::${option.model}`} value={`${option.provider}::${option.model}`}>
                        {providerModelLabel(option)}
                      </option>
                    ))}
                  </select>
                  {modelsLoading && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>{t("session.sideChat.loadingModels", "Loading models...")}</span>
                    </div>
                  )}
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("session.sideChat.thinkingLevel", "Thinking level")}
                  </span>
                  <select
                    value={options.thinkingLevel}
                    onChange={(event) => setOptions((prev) => ({ ...prev, thinkingLevel: event.target.value }))}
                    className="w-full rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                  >
                    {THINKING_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {t(`components.thinkingLevel.${level}`, level)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("session.sideChat.snippetLimit", "Snippet limit")}
                  </span>
                  <select
                    value={String(options.limit)}
                    onChange={(event) => setOptions((prev) => ({ ...prev, limit: Number(event.target.value) }))}
                    className="w-full rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                  >
                    {SNIPPET_LIMIT_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-2">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={t("session.sideChat.placeholder", "Ask about decisions, blockers, files, or next steps...")}
              className="min-h-[96px] w-full resize-none rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                {t("session.sideChat.hint", "Uses search and snippets, not full-context injection.")}
              </span>
              <button
                type="submit"
                disabled={!trimmedQuestion || loading}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/14 px-3 text-xs font-medium text-foreground hover:bg-primary/18 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span>{t("session.sideChat.ask", "Ask")}</span>
              </button>
            </div>
          </form>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {error && (
            <div className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {!answer && !error && !loading && (
            <div className="rounded-lg border border-border/60 bg-background/45 px-3 py-3 text-sm text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <MessageCircleQuestion className="h-4 w-4 text-primary" />
                <span className="font-medium">{t("session.sideChat.emptyTitle", "Ask this session")}</span>
              </div>
              <p>{t("session.sideChat.empty", "Ask a focused question. PSM will retrieve relevant parts of this session and cite them.")}</p>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-3 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t("session.sideChat.loading", "Searching session context...")}</span>
            </div>
          )}

          {answer && (
            <div className="space-y-3">
              <section className="rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("session.sideChat.answer", "Answer")}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{answer}</p>
              </section>

              <section className="rounded-lg border border-border/60 bg-background/45 p-3">
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
                      const createdAt = citationCreatedAt(citation, i18n.language);
                      return (
                        <article key={`${entryId ?? "citation"}-${index}`} className="rounded-lg border border-border/60 bg-background/55 p-2.5">
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
      </div>
    </aside>
  );
}
