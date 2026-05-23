import { FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BotMessageSquare, ExternalLink, Loader2, MessageCircleQuestion, Search, Send, X } from "lucide-react";

import { appPsmTransport, createPluginCapabilityClient, type PsmSideChatCitation } from "@/plugins/runtime-sdk";
import type { SessionInfo } from "@/types";

interface SessionSideChatToolbarPanelProps {
  session: SessionInfo;
}

function citationEntryId(citation: PsmSideChatCitation) {
  return citation.entryId ?? citation.entry_id;
}

function citationCreatedAt(citation: PsmSideChatCitation, language?: string) {
  const raw = citation.createdAt ?? citation.created_at;
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

export default function SessionSideChatToolbarPanel({ session }: SessionSideChatToolbarPanelProps) {
  const { t, i18n } = useTranslation();
  const client = useMemo(
    () => createPluginCapabilityClient({ transport: appPsmTransport }),
    [],
  );
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<PsmSideChatCitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedQuestion = question.trim();

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
        limit: 8,
      });
      setAnswer(response.answer);
      setCitations(response.citations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative" data-no-window-drag>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs transition-colors ${
          open
            ? "border-primary/35 bg-primary/12 text-foreground hover:bg-primary/16"
            : "border-border/70 bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground"
        }`}
        title={t("session.sideChat.title", "Side chat")}
        aria-label={t("session.sideChat.title", "Side chat")}
        aria-expanded={open}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircleQuestion className="h-3.5 w-3.5" />}
        <span className="hidden xl:inline">{t("session.sideChat.shortLabel", "Ask")}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(460px,calc(100vw-1.25rem))] overflow-hidden rounded-xl border border-border/70 bg-surface-dark/95 shadow-[0_18px_48px_rgba(0,0,0,0.34)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3 border-b border-border/70 bg-background/40 px-3 py-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-primary/25 bg-primary/12">
                  <BotMessageSquare className="h-3.5 w-3.5 text-primary" />
                </span>
                <span>{t("session.sideChat.title", "Side chat")}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Search className="h-3 w-3" />
                <span>{t("session.sideChat.mode", "Retrieval answers from this session, without injecting the full transcript.")}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/70 bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground"
              aria-label={t("common.close", "Close")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-[480px] overflow-auto p-3 text-sm">
            <form onSubmit={handleSubmit} className="space-y-2">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={t("session.sideChat.placeholder", "Ask about decisions, blockers, files, or next steps...")}
                className="min-h-[88px] w-full resize-none rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
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

            {error && (
              <div className="mt-3 rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {!answer && !error && !loading && (
              <div className="mt-3 rounded-lg border border-border/60 bg-background/45 px-3 py-3 text-sm text-muted-foreground">
                {t("session.sideChat.empty", "Ask a focused question. PSM will retrieve relevant parts of this session and cite them.")}
              </div>
            )}

            {loading && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-3 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t("session.sideChat.loading", "Searching session context...")}</span>
              </div>
            )}

            {answer && (
              <div className="mt-3 space-y-3">
                <section className="rounded-lg border border-border/60 bg-background/60 p-3">
                  <div className="mb-1.5 text-[11px] font-medium uppercase text-muted-foreground">
                    {t("session.sideChat.answer", "Answer")}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{answer}</p>
                </section>

                <section className="rounded-lg border border-border/60 bg-background/45 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[11px] font-medium uppercase text-muted-foreground">
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
                            <p className="line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-foreground/85">{citation.snippet}</p>
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
      )}
    </div>
  );
}
