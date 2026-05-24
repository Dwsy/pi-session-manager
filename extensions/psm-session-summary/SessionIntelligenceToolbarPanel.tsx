import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  CheckCircle2,
  ListChecks,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  X,
} from "lucide-react";

import {
  type PluginRecord,
  type PsmCapabilityClient,
  type PsmPluginI18nClient,
  type PsmSessionReference,
} from "@pi-session-manager/plugin-sdk";

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

interface SessionSummaryPluginSettings {
  provider: string;
  model: string;
  language: string;
  autoOpenAfterRefresh: boolean;
  showMetadata: boolean;
  showTopics: boolean;
  showNextSteps: boolean;
  showUnresolved: boolean;
}

interface SessionIntelligencePanelProps {
  client: PsmCapabilityClient;
  i18n: PsmPluginI18nClient;
  session: PsmSessionReference;
  open: boolean;
  onClose: () => void;
  settings: SessionSummaryPluginSettings;
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

function languageLabel(language: string, t: PsmPluginI18nClient["t"]) {
  if (language === "zh-CN") return "简体中文";
  if (language === "ja-JP") return "日本語";
  if (language === "en-US") return "English";
  return t("session.intelligence.languageAuto", "Auto");
}

export default function SessionIntelligenceToolbarPanel({
  client,
  i18n,
  session,
  open,
  onClose,
  settings,
}: SessionIntelligencePanelProps) {
  const { t, language } = i18n;
  const [record, setRecord] = useState<PluginRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payload = asPayload(record);
  const updatedAt = formatUpdatedAt(record, language);
  const topics = firstStringArray(payload?.topics);
  const nextSteps = firstStringArray(payload?.nextSteps);
  const unresolvedTasks = firstStringArray(payload?.unresolvedTasks, payload?.unresolved_tasks);
  const model = firstString(payload?.model, payload?.modelUsed, payload?.model_used);
  const provider = firstString(payload?.provider, payload?.providerUsed, payload?.provider_used);
  const messageCount = payload?.messageCount ?? payload?.message_count;
  const status = payload?.status || t("session.intelligence.noSummary", "No summary");

  useEffect(() => {
    if (!open) return;
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
  }, [client, open, session.path]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const refreshed = await client.records.refreshSessionIntelligence({
        path: session.path,
        language: settings.language === "auto" ? language : settings.language,
        provider: settings.provider || undefined,
        model: settings.model || undefined,
      });
      setRecord(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  };

  const defaultChips = useMemo(() => {
    const chips = [
      `${t("session.intelligence.language", "Language")}: ${languageLabel(settings.language, t)}`,
    ];
    if (settings.provider || settings.model) {
      chips.push(`${t("session.intelligence.model", "Model")}: ${[settings.provider, settings.model].filter(Boolean).join("/")}`);
    }
    return chips;
  }, [settings.language, settings.model, settings.provider, t]);

  if (!open) return null;

  const hasPayload = Boolean(payload);
  const actionLabel = hasPayload
    ? t("session.intelligence.refresh", "Refresh")
    : t("session.intelligence.generate", "Generate");

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-dark/75">
      <div className="border-b border-border/70 bg-background/30 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.12em] text-foreground/92">
              <Brain className="h-4 w-4 text-primary" />
              <span>{t("session.intelligence.title", "Session intelligence")}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
              {hasPayload && (
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-foreground">
                  {status}
                </span>
              )}
              {updatedAt && (
                <span className="rounded-full border border-border/60 bg-background/75 px-2 py-1">
                  {t("session.intelligence.updatedAt", "Updated {{time}}", { time: updatedAt })}
                </span>
              )}
              {defaultChips.map((chip) => (
                <span key={chip} className="rounded-full border border-border/60 bg-background/75 px-2 py-1">
                  {chip}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-primary/30 bg-primary/12 px-3 text-sm text-foreground hover:bg-primary/16 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span>{actionLabel}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground"
              aria-label={t("common.close", "Close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 text-sm">
        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/60 px-3 py-3 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t("session.intelligence.loading", "Loading intelligence...")}</span>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : payload ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-border/60 bg-background/65 p-4">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("session.intelligence.summary", "Summary")}
              </div>
              <p className="text-[15px] leading-7 text-foreground">
                {payload.summary || t("session.intelligence.noSummaryText", "No summary text.")}
              </p>
            </section>

            {settings.showMetadata && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-border/60 bg-background/45 p-3">
                  <div className="text-muted-foreground">{t("session.intelligence.status", "Status")}</div>
                  <div className="mt-1 truncate text-foreground">{payload.status || "unknown"}</div>
                </div>
                {typeof payload.confidence === "number" && (
                  <div className="rounded-xl border border-border/60 bg-background/45 p-3">
                    <div className="text-muted-foreground">{t("session.intelligence.confidence", "Confidence")}</div>
                    <div className="mt-1 text-foreground">{Math.round(payload.confidence * 100)}%</div>
                  </div>
                )}
                {messageCount !== undefined && (
                  <div className="rounded-xl border border-border/60 bg-background/45 p-3">
                    <div className="text-muted-foreground">{t("session.intelligence.messages", "Messages")}</div>
                    <div className="mt-1 text-foreground">{messageCount}</div>
                  </div>
                )}
                {(provider || model) && (
                  <div className="rounded-xl border border-border/60 bg-background/45 p-3">
                    <div className="text-muted-foreground">{t("session.intelligence.model", "Model")}</div>
                    <div className="mt-1 break-words text-foreground" title={[provider, model].filter(Boolean).join(" / ")}>
                      {[provider, model].filter(Boolean).join(" / ")}
                    </div>
                  </div>
                )}
              </div>
            )}

            {payload.objective && (
              <section className="rounded-2xl border border-border/60 bg-background/50 p-4">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  <Target className="h-3.5 w-3.5" />
                  {t("session.intelligence.objective", "Objective")}
                </div>
                <p className="text-sm leading-6 text-foreground/90">{payload.objective}</p>
              </section>
            )}

            {settings.showTopics && topics.length > 0 && (
              <section className="rounded-2xl border border-border/60 bg-background/50 p-4">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {t("session.intelligence.topics", "Topics")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {topics.map((topic) => (
                    <span key={topic} className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs text-foreground">
                      {topic}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {settings.showNextSteps && nextSteps.length > 0 && (
              <section className="rounded-2xl border border-border/60 bg-background/50 p-4">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  <ListChecks className="h-3.5 w-3.5" />
                  {t("session.intelligence.nextSteps", "Next steps")}
                </div>
                <ul className="space-y-2 text-sm leading-6 text-foreground/90">
                  {nextSteps.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-[8px] h-1.5 w-1.5 rounded-full bg-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {settings.showUnresolved && unresolvedTasks.length > 0 && (
              <section className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {t("session.intelligence.unresolved", "Unresolved")}
                </div>
                <ul className="space-y-2 text-sm leading-6 text-foreground/90">
                  {unresolvedTasks.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-[8px] h-1.5 w-1.5 rounded-full bg-warning" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-2xl border border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <Brain className="h-4 w-4 text-primary" />
                <span className="font-medium">{t("session.intelligence.emptyTitle", "No AI summary yet")}</span>
              </div>
              <p>{t("session.intelligence.empty", "No AI summary has been generated for this session yet.")}</p>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="mt-4 inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-primary/35 bg-primary/12 px-3 text-sm text-foreground hover:bg-primary/16 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {t("session.intelligence.generate", "Generate")}
              </button>
            </section>

            <section className="rounded-2xl border border-border/60 bg-background/50 p-4">
              <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t("session.intelligence.whatYouWillGet", "What you will get")}
              </div>
              <div className="grid gap-2 text-sm text-foreground/90">
                <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">{t("session.intelligence.summary", "Summary")}</div>
                <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">{t("session.intelligence.objective", "Objective")}</div>
                <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">{t("session.intelligence.topics", "Topics")}</div>
                <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">{t("session.intelligence.nextSteps", "Next steps")}</div>
                <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">{t("session.intelligence.unresolved", "Unresolved")}</div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
