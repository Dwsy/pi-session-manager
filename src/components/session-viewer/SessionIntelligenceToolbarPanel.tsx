import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Brain, CheckCircle2, Loader2, RefreshCw, Sparkles, X } from "lucide-react";

import { appPsmTransport, createPluginCapabilityClient, type PluginRecord } from "@/plugins/runtime-sdk";
import type { SessionInfo } from "@/types";

const SESSION_INTELLIGENCE_RECORD = "session.intelligence";

interface SessionIntelligencePayload {
  summary?: string;
  objective?: string;
  status?: string;
  topics?: string[];
  unresolvedTasks?: string[];
  unresolved_tasks?: string[];
  nextSteps?: string[];
  confidence?: number;
  provider?: string;
  providerUsed?: string;
  provider_used?: string;
  model?: string;
  modelUsed?: string;
  model_used?: string;
  messageCount?: number;
  message_count?: number;
  generatedAt?: string;
  generated_at?: string;
}

interface SessionIntelligenceToolbarPanelProps {
  session: SessionInfo;
}

function asPayload(record: PluginRecord | null): SessionIntelligencePayload | null {
  if (!record || typeof record.payload !== "object" || record.payload === null) {
    return null;
  }
  return record.payload as SessionIntelligencePayload;
}

function firstString(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0);
}

function firstStringArray(...values: Array<string[] | undefined>) {
  return values.find((value) => Array.isArray(value) && value.length > 0) ?? [];
}

function formatUpdatedAt(record: PluginRecord | null, language?: string) {
  if (!record?.updated_at) return null;
  const date = new Date(record.updated_at);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language || undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function SessionIntelligenceToolbarPanel({ session }: SessionIntelligenceToolbarPanelProps) {
  const { t, i18n } = useTranslation();
  const client = useMemo(
    () => createPluginCapabilityClient({ transport: appPsmTransport }),
    [],
  );
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<PluginRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payload = asPayload(record);
  const updatedAt = formatUpdatedAt(record, i18n.language);
  const topics = firstStringArray(payload?.topics);
  const nextSteps = firstStringArray(payload?.nextSteps);
  const unresolvedTasks = firstStringArray(payload?.unresolvedTasks, payload?.unresolved_tasks);
  const model = firstString(payload?.model, payload?.modelUsed, payload?.model_used);
  const provider = firstString(payload?.provider, payload?.providerUsed, payload?.provider_used);
  const messageCount = payload?.messageCount ?? payload?.message_count;
  const status = payload?.status || t("session.intelligence.noSummary", "No summary");

  useEffect(() => {
    let cancelled = false;

    async function loadExisting() {
      setLoading(true);
      setError(null);
      try {
        const records = await client.records.listForScope({
          scopeType: "session",
          scopeId: session.path,
          recordType: SESSION_INTELLIGENCE_RECORD,
          limit: 1,
        });
        if (!cancelled) setRecord(records[0] ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadExisting();

    return () => {
      cancelled = true;
    };
  }, [client, session.path]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    setOpen(true);
    try {
      const refreshed = await client.records.refreshSessionIntelligence({
        path: session.path,
        language: i18n.language,
      });
      setRecord(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  };

  const hasPayload = Boolean(payload);
  const actionLabel = hasPayload
    ? t("session.intelligence.refresh", "Refresh")
    : t("session.intelligence.generate", "Generate");

  return (
    <div className="relative" data-no-window-drag>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs transition-colors ${
          hasPayload
            ? "border-primary/35 bg-primary/12 text-foreground hover:bg-primary/16"
            : "border-border/70 bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground"
        }`}
        title={t("session.intelligence.title", "Session intelligence")}
        aria-label={t("session.intelligence.title", "Session intelligence")}
        aria-expanded={open}
      >
        {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        <span className="hidden xl:inline">{t("session.intelligence.shortLabel", "AI")}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(440px,calc(100vw-1.25rem))] overflow-hidden rounded-xl border border-border/70 bg-surface-dark/95 shadow-[0_18px_48px_rgba(0,0,0,0.34)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3 border-b border-border/70 bg-background/40 px-3 py-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-primary/25 bg-primary/12">
                  <Brain className="h-3.5 w-3.5 text-primary" />
                </span>
                <span>{t("session.intelligence.title", "Session intelligence")}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                {hasPayload && <span className="rounded border border-border/60 bg-background/70 px-1.5 py-0.5">{status}</span>}
                {updatedAt && <span>{t("session.intelligence.updatedAt", "Updated {{time}}", { time: updatedAt })}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-primary/30 bg-primary/12 px-2 text-xs text-foreground hover:bg-primary/16 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                <span>{actionLabel}</span>
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/70 bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground"
                aria-label={t("common.close", "Close")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-[430px] overflow-auto p-3 text-sm">
            {loading ? (
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-3 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t("session.intelligence.loading", "Loading intelligence...")}</span>
              </div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : payload ? (
              <div className="space-y-3">
                <section className="rounded-lg border border-border/60 bg-background/60 p-3">
                  <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium uppercase text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t("session.intelligence.summary", "Summary")}
                  </div>
                  <p className="text-sm leading-6 text-foreground">
                    {payload.summary || t("session.intelligence.noSummaryText", "No summary text.")}
                  </p>
                </section>

                {payload.objective && (
                  <section className="rounded-lg border border-border/60 bg-background/45 p-3">
                    <div className="mb-1 text-[11px] font-medium uppercase text-muted-foreground">
                      {t("session.intelligence.objective", "Objective")}
                    </div>
                    <p className="text-sm leading-6 text-foreground/90">{payload.objective}</p>
                  </section>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded-lg border border-border/60 bg-background/45 p-2">
                    <div className="text-muted-foreground">{t("session.intelligence.status", "Status")}</div>
                    <div className="mt-1 truncate text-foreground">{payload.status || "unknown"}</div>
                  </div>
                  {typeof payload.confidence === "number" && (
                    <div className="rounded-lg border border-border/60 bg-background/45 p-2">
                      <div className="text-muted-foreground">{t("session.intelligence.confidence", "Confidence")}</div>
                      <div className="mt-1 text-foreground">{Math.round(payload.confidence * 100)}%</div>
                    </div>
                  )}
                  {messageCount !== undefined && (
                    <div className="rounded-lg border border-border/60 bg-background/45 p-2">
                      <div className="text-muted-foreground">{t("session.intelligence.messages", "Messages")}</div>
                      <div className="mt-1 text-foreground">{messageCount}</div>
                    </div>
                  )}
                  {(provider || model) && (
                    <div className="rounded-lg border border-border/60 bg-background/45 p-2">
                      <div className="text-muted-foreground">{t("session.intelligence.model", "Model")}</div>
                      <div className="mt-1 truncate text-foreground" title={[provider, model].filter(Boolean).join(" / ")}>{model || provider}</div>
                    </div>
                  )}
                </div>

                {topics.length > 0 && (
                  <section>
                    <div className="mb-1.5 text-[11px] font-medium uppercase text-muted-foreground">
                      {t("session.intelligence.topics", "Topics")}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {topics.map((topic) => (
                        <span key={topic} className="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-xs text-foreground">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {nextSteps.length > 0 && (
                  <section className="rounded-lg border border-border/60 bg-background/45 p-3">
                    <div className="mb-1.5 text-[11px] font-medium uppercase text-muted-foreground">
                      {t("session.intelligence.nextSteps", "Next steps")}
                    </div>
                    <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-foreground/90">
                      {nextSteps.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </section>
                )}

                {unresolvedTasks.length > 0 && (
                  <section className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                    <div className="mb-1.5 text-[11px] font-medium uppercase text-muted-foreground">
                      {t("session.intelligence.unresolved", "Unresolved")}
                    </div>
                    <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-foreground/90">
                      {unresolvedTasks.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </section>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-border/70 bg-background/60 px-3 py-4 text-sm text-muted-foreground">
                <p>{t("session.intelligence.empty", "No AI summary has been generated for this session yet.")}</p>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/35 bg-primary/12 px-2.5 text-xs text-foreground hover:bg-primary/16 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {t("session.intelligence.generate", "Generate")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
