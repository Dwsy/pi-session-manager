import { useEffect, useMemo, useState } from "react";
import { Brain, Loader2, RefreshCw, Sparkles, X } from "lucide-react";

import { appPsmTransport, createPluginCapabilityClient, type PluginRecord } from "@/plugins/runtime-sdk";
import type { SessionInfo } from "@/types";

const SESSION_INTELLIGENCE_RECORD = "session.intelligence";

interface SessionIntelligencePayload {
  summary?: string;
  objective?: string;
  status?: string;
  topics?: string[];
  unresolvedTasks?: string[];
  nextSteps?: string[];
  confidence?: number;
  provider?: string;
  model?: string;
  messageCount?: number;
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

function formatUpdatedAt(record: PluginRecord | null) {
  if (!record?.updated_at) return null;
  const date = new Date(record.updated_at);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function SessionIntelligenceToolbarPanel({ session }: SessionIntelligenceToolbarPanelProps) {
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
  const updatedAt = formatUpdatedAt(record);

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
      });
      setRecord(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  };

  const statusLabel = payload?.status || "No summary";
  const buttonActive = Boolean(payload);

  return (
    <div className="relative" data-no-window-drag>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`p-1.5 text-xs rounded border transition-colors inline-flex items-center gap-1.5 ${
          buttonActive
            ? "border-primary/40 bg-primary/14 text-foreground hover:bg-primary/18"
            : "border-border/70 bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground"
        }`}
        title="AI session summary"
        aria-label="AI session summary"
        aria-expanded={open}
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden xl:inline">AI</span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(420px,calc(100vw-2rem))] rounded-xl border border-border/70 bg-popover/95 shadow-[0_18px_48px_rgba(0,0,0,0.28)] backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Brain className="h-4 w-4 text-primary" />
                <span>Session intelligence</span>
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {updatedAt ? `Updated ${updatedAt}` : statusLabel}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex h-7 items-center gap-1 rounded border border-border/70 bg-secondary px-2 text-xs text-foreground hover:bg-secondary-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span>{record ? "Refresh" : "Generate"}</span>
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded border border-border/70 bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground"
                aria-label="Close session intelligence"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-auto px-3 py-3 text-sm">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading intelligence...</span>
              </div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : payload ? (
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Summary</div>
                  <p className="leading-6 text-foreground">{payload.summary || "No summary text."}</p>
                </div>

                {payload.objective && (
                  <div>
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Objective</div>
                    <p className="leading-6 text-foreground/90">{payload.objective}</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded border border-border/70 bg-background px-2 py-1 text-muted-foreground">
                    status: <span className="text-foreground">{payload.status || "unknown"}</span>
                  </span>
                  {typeof payload.confidence === "number" && (
                    <span className="rounded border border-border/70 bg-background px-2 py-1 text-muted-foreground">
                      confidence: <span className="text-foreground">{Math.round(payload.confidence * 100)}%</span>
                    </span>
                  )}
                  {payload.model && (
                    <span className="rounded border border-border/70 bg-background px-2 py-1 text-muted-foreground">
                      model: <span className="text-foreground">{payload.model}</span>
                    </span>
                  )}
                </div>

                {payload.topics && payload.topics.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">Topics</div>
                    <div className="flex flex-wrap gap-1.5">
                      {payload.topics.map((topic) => (
                        <span key={topic} className="rounded border border-primary/25 bg-primary/10 px-2 py-1 text-xs text-foreground">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {payload.nextSteps && payload.nextSteps.length > 0 && (
                  <div>
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Next steps</div>
                    <ul className="list-disc space-y-1 pl-5 text-foreground/90">
                      {payload.nextSteps.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {payload.unresolvedTasks && payload.unresolvedTasks.length > 0 && (
                  <div>
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Unresolved</div>
                    <ul className="list-disc space-y-1 pl-5 text-foreground/90">
                      {payload.unresolvedTasks.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
                <p>No AI summary has been generated for this session yet.</p>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="mt-3 inline-flex items-center gap-1.5 rounded border border-primary/35 bg-primary/14 px-2.5 py-1.5 text-xs text-foreground hover:bg-primary/18 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Generate summary
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
