import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Clock,
  Coins,
  MessageSquare,
  Wrench,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';

import { useSessionTrace } from '@/hooks/useSessionTrace';
import type { SessionInfo } from '@/types';

interface TraceViewProps {
  session: SessionInfo;
  onClose: () => void;
}

type TraceTab = 'details' | 'analytics' | 'timeline';

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function formatCost(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export default function TraceView({ session, onClose }: TraceViewProps) {
  const { t } = useTranslation();
  const { analytics, loading, error } = useSessionTrace(session.path);
  const [activeTab, setActiveTab] = useState<TraceTab>('details');

  const tabs: { key: TraceTab; label: string }[] = [
    { key: 'details', label: t('trace.tab.details', 'Details') },
    { key: 'analytics', label: t('trace.tab.analytics', 'Analytics') },
    { key: 'timeline', label: t('trace.tab.timeline', 'Timeline') },
  ];

  if (loading) {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <span className="text-sm font-medium text-foreground">
            {t('trace.loading', 'Loading trace...')}
          </span>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-muted-foreground text-sm">
            {t('trace.loading.msg', 'Parsing session JSONL...')}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <span className="text-sm font-medium text-foreground">
            {t('trace.error.title', 'Trace Error')}
          </span>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-destructive text-sm text-center">
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const a = analytics;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">
            {t('trace.title', 'Trace')}
          </span>
          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground truncate">
            {session.name || session.id}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-secondary shrink-0"
          title={t('trace.close', 'Close Trace')}
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Stats Strip */}
      {a && (
        <div className="grid grid-cols-5 gap-2 px-4 py-2 border-b border-border bg-muted/30 shrink-0">
          <StatItem icon={Clock} label="Duration" value={formatDuration(a.active_secs || a.duration_secs)} />
          <StatItem icon={Coins} label="Cost" value={formatCost(a.total_cost.total)} />
          <StatItem icon={MessageSquare} label="Messages" value={`${a.total_messages}`} />
          <StatItem icon={Wrench} label="Tool Calls" value={`${a.total_tool_calls}`} />
          <StatItem icon={AlertTriangle} label="Errors" value={`${a.total_errors}`} color={a.total_errors > 0 ? 'text-destructive' : undefined} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto min-h-0">
        {activeTab === 'details' && a && <DetailsTab analytics={a} />}
        {activeTab === 'analytics' && a && <AnalyticsTab analytics={a} />}
        {activeTab === 'timeline' && a && <TimelinePlaceholder analytics={a} />}
      </div>
    </div>
  );
}

// === Sub-components ===

function StatItem({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon className={`w-3.5 h-3.5 text-muted-foreground`} />
      <span className={`text-sm font-semibold ${color || 'text-foreground'}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function DetailsTab({ analytics: a }: { analytics: NonNullable<import('@/types/trace').SessionTraceAnalytics> }) {
  return (
    <div className="p-4 space-y-4">
      {/* Token Breakdown */}
      <Section title="Tokens">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <KV label="Input" value={formatTokens(a.total_tokens.input)} />
          <KV label="Output" value={formatTokens(a.total_tokens.output)} />
          <KV label="Cache Read" value={formatTokens(a.total_tokens.cache_read)} />
          <KV label="Cache Write" value={formatTokens(a.total_tokens.cache_write)} />
          <KV label="Total" value={formatTokens(a.total_tokens.total)} bold />
        </div>
      </Section>

      {/* Cost Breakdown */}
      <Section title="Cost">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <KV label="Input" value={formatCost(a.total_cost.input)} />
          <KV label="Output" value={formatCost(a.total_cost.output)} />
          <KV label="Cache Read" value={formatCost(a.total_cost.cache_read)} />
          <KV label="Cache Write" value={formatCost(a.total_cost.cache_write)} />
          <KV label="Total" value={formatCost(a.total_cost.total)} bold />
        </div>
      </Section>

      {/* Models */}
      <Section title="Models Used">
        <div className="space-y-1">
          {a.models_used.map(m => (
            <div key={m} className="text-sm text-foreground font-mono">{m}</div>
          ))}
          {a.models_used.length === 0 && (
            <div className="text-sm text-muted-foreground">No model data</div>
          )}
        </div>
      </Section>
    </div>
  );
}

function AnalyticsTab({ analytics: a }: { analytics: NonNullable<import('@/types/trace').SessionTraceAnalytics> }) {
  return (
    <div className="p-4 space-y-4">
      {/* Tool Calls */}
      <Section title="Tool Calls">
        <div className="space-y-1">
          {Object.entries(a.tool_call_counts)
            .sort(([, a], [, b]) => b - a)
            .map(([tool, count]) => (
              <div key={tool} className="flex items-center gap-2 text-sm">
                <span className="w-24 font-mono text-muted-foreground truncate">{tool}</span>
                <div className="flex-1 h-4 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{
                      width: `${a.total_tool_calls > 0 ? (count / a.total_tool_calls) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="w-8 text-right text-muted-foreground">{count}</span>
              </div>
            ))}
          {Object.keys(a.tool_call_counts).length === 0 && (
            <div className="text-sm text-muted-foreground">No tool calls</div>
          )}
        </div>
      </Section>

      {/* Files Read */}
      {a.files_read.length > 0 && (
        <Section title={`Files Read (${a.files_read.length})`}>
          <div className="space-y-0.5 max-h-40 overflow-auto">
            {a.files_read.map(f => (
              <div key={f} className="text-xs font-mono text-muted-foreground truncate" title={f}>
                {f}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Files Edited */}
      {a.files_edited.length > 0 && (
        <Section title={`Files Edited (${a.files_edited.length})`}>
          <div className="space-y-0.5 max-h-40 overflow-auto">
            {a.files_edited.map(f => (
              <div key={f} className="text-xs font-mono text-muted-foreground truncate" title={f}>
                {f}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Files Written */}
      {a.files_written.length > 0 && (
        <Section title={`Files Written (${a.files_written.length})`}>
          <div className="space-y-0.5 max-h-40 overflow-auto">
            {a.files_written.map(f => (
              <div key={f} className="text-xs font-mono text-muted-foreground truncate" title={f}>
                {f}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function TimelinePlaceholder({ analytics: a }: { analytics: NonNullable<import('@/types/trace').SessionTraceAnalytics> }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <p className="text-muted-foreground text-sm mb-2">
        Timeline visualization coming in Phase 3
      </p>
      <p className="text-muted-foreground/60 text-xs">
        {a.total_events} events ready for Gantt rendering
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function KV({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? 'font-bold' : 'font-mono'}>{value}</span>
    </div>
  );
}
