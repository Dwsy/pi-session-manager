import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Clock,
  Coins,
  MessageSquare,
  Wrench,
  AlertTriangle,
} from 'lucide-react';
import { MultiFileDiff, type FileContents } from '@pierre/diffs/react';

import { useSessionTrace } from '@/hooks/useSessionTrace';
import { useTheme } from '@/hooks/useAppearance';
import { parseMarkdown, renderCodeHtml } from '@/utils/markdown';
import { LoopStrip } from './LoopStrip';
import type {
  SessionTraceAnalytics,
  TraceEvent,
  TraceEventType,
  TraceToolCall,
} from '@/types/trace';
import type { SessionInfo } from '@/types';

interface TraceViewProps {
  session: SessionInfo;
  onClose: () => void;
}

type TraceTab = 'details' | 'analytics' | 'timeline';
type InspectorTab = 'content' | 'result' | 'usage' | 'raw';

const EVENT_COLORS: Record<TraceEventType, string> = {
  user_prompt: '#f97316',
  assistant_response: '#14b8a6',
  tool_call: '#eab308',
  tool_result: '#60a5fa',
  model_change: '#94a3b8',
  thinking_level_change: '#a78bfa',
  compaction: '#22c55e',
  custom_message: '#64748b',
  system_event: '#94a3b8',
};

const EVENT_LABELS: Record<TraceEventType, string> = {
  user_prompt: 'User prompt',
  assistant_response: 'Assistant',
  tool_call: 'Tool',
  tool_result: 'Result',
  model_change: 'MODEL CHANGE',
  thinking_level_change: 'THINKING LEVEL',
  compaction: 'Compaction',
  custom_message: 'Custom',
  system_event: 'System',
};

const TOKEN_BAR_COLORS = ['#4f8cff', '#24c37d', '#9b7bff', '#f59e0b'];
const TOOL_COLORS = ['#eab308', '#3b82f6', '#a855f7', '#22c55e', '#f97316', '#ef4444', '#14b8a6', '#6366f1'];
const ROW_H = 32;

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function formatCost(n: number): string {
  if (n < 0.01 && n > 0) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function formatOffset(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(totalSeconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function parseEditArgs(raw?: string | null) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.oldText === 'string' && typeof parsed?.newText === 'string') {
      return {
        path: typeof parsed?.path === 'string' ? parsed.path : 'edit.txt',
        oldText: parsed.oldText,
        newText: parsed.newText,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function toDiffFiles(toolCall: TraceToolCall) {
  const parsed = parseEditArgs(toolCall.arguments_raw);
  if (!parsed) return null;
  const fileName = parsed.path.split('/').pop() || parsed.path;
  const oldFile: FileContents = { name: fileName, contents: parsed.oldText };
  const newFile: FileContents = { name: fileName, contents: parsed.newText };
  return { oldFile, newFile, path: parsed.path };
}

function summarizeEvent(evt: TraceEvent) {
  if (evt.tool_calls.length > 0) {
    const names = evt.tool_calls.map(t => t.name).join(', ');
    return names;
  }
  if (evt.content_preview) return evt.content_preview;
  if (evt.error_message) return evt.error_message;
  if (evt.thinking) return evt.thinking;
  return EVENT_LABELS[evt.event_type] || evt.event_type;
}

function useEventGroups(events: TraceEvent[]) {
  return useMemo(() => {
    const groups: Array<{ id: string; label: string; type: TraceEventType; events: TraceEvent[] }> = [];
    for (const evt of events) {
      const key = evt.event_type;
      const last = groups[groups.length - 1];
      if (last && last.type === key) {
        last.events.push(evt);
      } else {
        groups.push({
          id: `${key}-${groups.length}`,
          label: EVENT_LABELS[key] || key,
          type: key,
          events: [evt],
        });
      }
    }
    return groups;
  }, [events]);
}

export default function TraceView({ session, onClose }: TraceViewProps) {
  const { t } = useTranslation();
  useTheme();
  const { analytics, loading, error } = useSessionTrace(session.path);
  const [activeTab, setActiveTab] = useState<TraceTab>('details');
  const [selectedEvent, setSelectedEvent] = useState<TraceEvent | null>(null);

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const tabs: { key: TraceTab; label: string }[] = [
    { key: 'details', label: t('trace.tab.details', 'Details') },
    { key: 'analytics', label: t('trace.tab.analytics', 'Analytics') },
    { key: 'timeline', label: t('trace.tab.timeline', 'Timeline') },
  ];

  if (loading) {
    return (
      <div className="h-full flex flex-col bg-background">
        <TraceHeader title={t('trace.loading', 'Loading trace...')} onClose={onClose} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-muted-foreground text-sm">{t('trace.loading.msg', 'Parsing session JSONL...')}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col bg-background">
        <TraceHeader title={t('trace.error.title', 'Trace Error')} onClose={onClose} />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-destructive text-sm text-center"><p>{error}</p></div>
        </div>
      </div>
    );
  }

  if (!analytics) return null;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <TraceHeader title={t('trace.title', 'Trace')} onClose={onClose} />

      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/20 shrink-0 overflow-x-auto">
        <StatPill icon={Clock} value={formatDuration(analytics.active_secs || analytics.duration_secs)} />
        <StatPill icon={Coins} value={formatCost(analytics.total_cost.total)} />
        <StatPill icon={MessageSquare} value={`${analytics.total_messages} msgs`} />
        <StatPill icon={Wrench} value={`${analytics.total_tool_calls} tools`} />
        <StatPill icon={AlertTriangle} value={`${analytics.total_errors} errors`} color={analytics.total_errors > 0 ? 'text-destructive' : undefined} bg={analytics.total_errors > 0 ? 'bg-destructive/10' : undefined} />
        <span className="ml-auto text-[11px] font-mono text-muted-foreground shrink-0">{analytics.primary_model}</span>
      </div>

      <div className="flex border-b border-border shrink-0 px-3">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSelectedEvent(null); }}
            className={cx(
              'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.key
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab === 'details' && <DetailsTab analytics={analytics} />}
        {activeTab === 'analytics' && <AnalyticsTab analytics={analytics} />}
        {activeTab === 'timeline' && (
          <TimelineView analytics={analytics} selectedEvent={selectedEvent} onSelectEvent={setSelectedEvent} />
        )}
      </div>
    </div>
  );
}

function TraceHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0 bg-background/95 backdrop-blur-sm">
      <span className="text-sm font-medium text-foreground">{title}</span>
      <button onClick={onClose} className="p-1 rounded hover:bg-secondary transition-colors" title="Close">
        <X className="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  );
}

function StatPill({ icon: Icon, value, color, bg }: { icon: React.ComponentType<{ className?: string }>; value: string; color?: string; bg?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-mono border border-border/60 bg-background text-foreground shrink-0', bg, color)}>
      <Icon className="w-3 h-3 text-muted-foreground" />
      {value}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/80 shadow-sm p-4">
      <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.16em] mb-3">{title}</h3>
      {children}
    </div>
  );
}

function KV({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cx('font-mono text-foreground', bold && 'font-bold')}>{value}</span>
    </div>
  );
}

function MetricRow({
  label,
  value,
  barValue,
  color,
  valueText,
}: {
  label: string;
  value: string;
  barValue: number;
  color: string;
  valueText?: string;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr_100px] items-center gap-4 py-2">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="h-2 rounded-full bg-secondary/60 overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${Math.max(0, Math.min(100, barValue))}%`, backgroundColor: color }} />
      </div>
      <div className="text-right text-sm font-mono text-foreground">{valueText || value}</div>
    </div>
  );
}

function DetailsTab({ analytics: a }: { analytics: SessionTraceAnalytics }) {
  const tokenMax = Math.max(a.total_tokens.input, a.total_tokens.output, a.total_tokens.cache_read, a.total_tokens.cache_write, 1);
  const costMax = Math.max(a.total_cost.input, a.total_cost.output, a.total_cost.cache_read, a.total_cost.cache_write, 0.0001);

  return (
    <div className="h-full overflow-auto p-4 space-y-4 bg-gradient-to-b from-background to-muted/10">
      <div className="grid grid-cols-4 gap-3">
        {[
          ['Duration', formatDuration(a.active_secs || a.duration_secs)],
          ['Messages', `${a.total_messages}`],
          ['Tools', `${a.total_tool_calls}`],
          ['Errors', `${a.total_errors}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border/70 bg-background/90 px-3 py-3 shadow-sm">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">{label}</div>
            <div className="text-lg font-semibold text-foreground font-mono">{value}</div>
          </div>
        ))}
      </div>

      <Section title="Tokens">
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm mb-4">
          <KV label="Input" value={formatTokens(a.total_tokens.input)} />
          <KV label="Output" value={formatTokens(a.total_tokens.output)} />
          <KV label="Cache Read" value={formatTokens(a.total_tokens.cache_read)} />
          <KV label="Cache Write" value={formatTokens(a.total_tokens.cache_write)} />
          <KV label="Total" value={formatTokens(a.total_tokens.total)} bold />
        </div>
        <div className="space-y-1">
          <MetricRow label="Input" value={formatTokens(a.total_tokens.input)} barValue={(a.total_tokens.input / tokenMax) * 100} color={TOKEN_BAR_COLORS[0]} />
          <MetricRow label="Output" value={formatTokens(a.total_tokens.output)} barValue={(a.total_tokens.output / tokenMax) * 100} color={TOKEN_BAR_COLORS[1]} />
          <MetricRow label="Cache Read" value={formatTokens(a.total_tokens.cache_read)} barValue={(a.total_tokens.cache_read / tokenMax) * 100} color={TOKEN_BAR_COLORS[2]} />
          <MetricRow label="Cache Write" value={formatTokens(a.total_tokens.cache_write)} barValue={(a.total_tokens.cache_write / tokenMax) * 100} color={TOKEN_BAR_COLORS[3]} />
        </div>
      </Section>

      <Section title="Cost">
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm mb-4">
          <KV label="Input" value={formatCost(a.total_cost.input)} />
          <KV label="Output" value={formatCost(a.total_cost.output)} />
          <KV label="Cache Read" value={formatCost(a.total_cost.cache_read)} />
          <KV label="Cache Write" value={formatCost(a.total_cost.cache_write)} />
          <KV label="Total" value={formatCost(a.total_cost.total)} bold />
        </div>
        <div className="space-y-1">
          <MetricRow label="Input" value={formatCost(a.total_cost.input)} barValue={(a.total_cost.input / costMax) * 100} color={TOKEN_BAR_COLORS[0]} />
          <MetricRow label="Output" value={formatCost(a.total_cost.output)} barValue={(a.total_cost.output / costMax) * 100} color={TOKEN_BAR_COLORS[1]} />
          <MetricRow label="Cache Read" value={formatCost(a.total_cost.cache_read)} barValue={(a.total_cost.cache_read / costMax) * 100} color={TOKEN_BAR_COLORS[2]} />
          <MetricRow label="Cache Write" value={formatCost(a.total_cost.cache_write)} barValue={(a.total_cost.cache_write / costMax) * 100} color={TOKEN_BAR_COLORS[3]} />
        </div>
      </Section>

      <Section title={`Models Used (${a.models_used.length})`}>
        <div className="space-y-2">
          {a.models_used.map(m => {
            const mt = a.tokens_by_model[m];
            const mc = a.cost_by_model[m];
            return (
              <div key={m} className="flex items-center justify-between text-sm rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <span className="font-mono text-foreground truncate pr-3">{m}</span>
                <div className="flex gap-3 text-xs text-muted-foreground shrink-0">
                  {mt && <span>{formatTokens(mt.total)} tok</span>}
                  {mc && <span>{formatCost(mc.total)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function AnalyticsTab({ analytics: a }: { analytics: SessionTraceAnalytics }) {
  const toolEntries = useMemo(() => Object.entries(a.tool_call_counts).sort(([, aa], [, bb]) => bb - aa).map(([tool, count]) => ({ tool, count })), [a.tool_call_counts]);
  const toolMax = Math.max(...toolEntries.map(item => item.count), 1);

  return (
    <div className="h-full overflow-auto p-4 space-y-4 bg-gradient-to-b from-background to-muted/10">
      <Section title="Tool Calls">
        {toolEntries.length > 0 ? (
          <div className="space-y-1">
            {toolEntries.map((item, idx) => (
              <MetricRow
                key={item.tool}
                label={item.tool}
                value={`${item.count}`}
                barValue={(item.count / toolMax) * 100}
                color={TOOL_COLORS[idx % TOOL_COLORS.length]}
                valueText={`${item.count} calls`}
              />
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No tool calls</div>
        )}
      </Section>

      {a.files_read.length > 0 && <PathListSection title={`Files Read (${a.files_read.length} unique, ${a.files_read_count} total)`} paths={a.files_read} />}
      {a.files_edited.length > 0 && <PathListSection title={`Files Edited (${a.files_edited.length} unique, ${a.files_edited_count} total)`} paths={a.files_edited} />}
      {a.files_written.length > 0 && <PathListSection title={`Files Written (${a.files_written.length} unique, ${a.files_written_count} total)`} paths={a.files_written} />}

      {a.bash_commands.length > 0 && (
        <Section title={`Bash Commands (${a.bash_commands.length} unique)`}>
          <div className="space-y-1 max-h-56 overflow-auto">
            {a.bash_commands.sort((aa, bb) => bb.count - aa.count).slice(0, 24).map((bc, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-xs rounded-md px-2 py-1 hover:bg-secondary/30 transition-colors">
                <span className="flex-1 font-mono text-muted-foreground truncate" title={bc.command_prefix}>{bc.command_prefix}</span>
                <span className="text-foreground font-semibold shrink-0">{bc.count}×</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function PathListSection({ title, paths }: { title: string; paths: string[] }) {
  return (
    <Section title={title}>
      <div className="space-y-0.5 max-h-44 overflow-auto text-xs font-mono text-muted-foreground">
        {paths.map(f => (
          <div key={f} className="truncate px-2 py-1 rounded-md hover:bg-secondary/30 transition-colors" title={f}>{f}</div>
        ))}
      </div>
    </Section>
  );
}

function TimelineView({ analytics: a, selectedEvent, onSelectEvent }: { analytics: SessionTraceAnalytics; selectedEvent: TraceEvent | null; onSelectEvent: (e: TraceEvent | null) => void }) {
  const totalDuration = a.events.length > 0 ? a.events[a.events.length - 1].offset_ms + a.events[a.events.length - 1].duration_ms : 0;
  const [viewportStartMs, setViewportStartMs] = useState(0);
  const [viewportEndMs, setViewportEndMs] = useState(totalDuration || 1);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const treeScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef(false);
  const viewportRange = Math.max(1, viewportEndMs - viewportStartMs);
  const zoomRatio = totalDuration > 0 ? viewportRange / totalDuration : 1;

  const visibleEvents = useMemo(() => a.events.filter(evt => evt.offset_ms + evt.duration_ms >= viewportStartMs && evt.offset_ms <= viewportEndMs), [a.events, viewportStartMs, viewportEndMs]);
  const groups = useEventGroups(visibleEvents);

  const treeRows = useMemo(() => {
    const rows: Array<{
      kind: 'group' | 'event';
      id: string;
      label: string;
      type: TraceEventType;
      event?: TraceEvent;
      depth: number;
      count?: number;
      collapsible?: boolean;
    }> = [];

    for (const group of groups) {
      const first = group.events[0];
      const last = group.events[group.events.length - 1];
      const aggregateDuration = Math.max(
        150,
        (last.offset_ms + Math.max(last.duration_ms, 150)) - first.offset_ms,
      );
      const aggregateEvent: TraceEvent = {
        ...first,
        id: `${group.id}__aggregate`,
        offset_ms: first.offset_ms,
        duration_ms: aggregateDuration,
        content_preview: group.label,
        tool_calls: [],
        thinking: null,
        is_error: group.events.some(evt => evt.is_error),
        error_message: group.events.find(evt => evt.error_message)?.error_message ?? null,
      };

      if (group.events.length === 1) {
        const evt = group.events[0];
        const singleLabel = (() => {
          if (evt.event_type === 'thinking_level_change') {
            return evt.thinking ? `${group.label} · ${evt.thinking}` : group.label;
          }
          if (evt.event_type === 'model_change') {
            return evt.model ? `${group.label} · ${evt.model}` : group.label;
          }
          return summarizeEvent(evt) || group.label;
        })();

        rows.push({
          kind: 'event',
          id: evt.id,
          label: singleLabel,
          type: evt.event_type,
          event: evt,
          depth: 0,
          collapsible: false,
        });
        continue;
      }

      rows.push({
        kind: 'group',
        id: group.id,
        label: group.label,
        type: group.type,
        event: aggregateEvent,
        depth: 0,
        count: group.events.length,
        collapsible: true,
      });

      if (!collapsedGroups.has(group.id)) {
        for (const evt of group.events) {
          rows.push({
            kind: 'event',
            id: evt.id,
            label: summarizeEvent(evt),
            type: evt.event_type,
            event: evt,
            depth: 1,
            collapsible: false,
          });
        }
      }
    }
    return rows;
  }, [groups, collapsedGroups]);

  const timeMarkers = useMemo(() => {
    const steps = 6;
    const step = viewportRange / steps;
    return Array.from({ length: steps + 1 }, (_, i) => ({
      ms: viewportStartMs + step * i,
      label: formatOffset(viewportStartMs + step * i),
      pct: (i / steps) * 100,
    }));
  }, [viewportStartMs, viewportRange]);

  const syncVerticalScroll = (source: 'tree' | 'timeline', top: number) => {
    if (syncingScrollRef.current) return;
    syncingScrollRef.current = true;
    const target = source === 'tree' ? timelineScrollRef.current : treeScrollRef.current;
    if (target) target.scrollTop = top;
    requestAnimationFrame(() => {
      syncingScrollRef.current = false;
    });
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 text-xs">
        <span className="px-2 py-1 rounded-full border border-border/60 bg-background text-foreground font-mono">{a.total_events} events</span>
        <span className="px-2 py-1 rounded-full border border-border/60 bg-background text-foreground font-mono">{a.total_tool_calls} tools</span>
        <span className={cx('px-2 py-1 rounded-full border font-mono', a.total_errors > 0 ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-border/60 bg-background text-foreground')}>{a.total_errors} errors</span>
        <span className="text-muted-foreground font-mono">{a.primary_model}</span>
        <div className="ml-auto flex items-center gap-2 text-muted-foreground font-mono">
          <span>{zoomRatio < 0.98 ? `Viewing ${formatOffset(viewportStartMs)} – ${formatOffset(viewportEndMs)}` : 'Full range'}</span>
          {zoomRatio < 0.98 && (
            <button className="underline hover:text-foreground transition-colors" onClick={() => { setViewportStartMs(0); setViewportEndMs(totalDuration || 1); }}>
              reset
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          ref={treeScrollRef}
          className="w-[280px] shrink-0 h-full overflow-auto border-r border-border bg-muted/15"
          onScroll={(e) => syncVerticalScroll('tree', e.currentTarget.scrollTop)}
        >
          <div className="sticky top-0 z-10 h-8 px-3 flex items-center text-[11px] uppercase tracking-[0.16em] text-muted-foreground border-b border-border bg-background/95 backdrop-blur-sm">Service & Operation</div>
          {treeRows.map((row, idx) => {
            const isSelected = row.event && selectedEvent?.id === row.event.id;
            return (
              <div
                key={row.id}
                className={cx('flex items-center gap-2 px-3 border-b border-border/40 cursor-pointer transition-colors', hoveredRow === idx && 'bg-foreground/[0.03]', isSelected && 'bg-secondary/60')}
                style={{ height: ROW_H }}
                onMouseEnter={() => setHoveredRow(idx)}
                onMouseLeave={() => setHoveredRow(null)}
                onClick={() => {
                  if (row.kind === 'group' && row.collapsible) {
                    setCollapsedGroups(prev => {
                      const next = new Set(prev);
                      if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                      return next;
                    });
                    if (row.event) {
                      onSelectEvent(selectedEvent?.id === row.event.id ? null : row.event);
                    }
                  } else if (row.event) {
                    onSelectEvent(selectedEvent?.id === row.event.id ? null : row.event);
                  }
                }}
              >
                {row.kind === 'group' && row.collapsible ? (
                  <span className="text-muted-foreground text-[10px]">{collapsedGroups.has(row.id) ? '▸' : '▾'}</span>
                ) : row.depth > 0 ? (
                  <span className="text-muted-foreground text-[10px] ml-4">▸</span>
                ) : (
                  <span className="w-[10px] shrink-0" />
                )}
                <span className="h-2 w-2 rounded-sm shrink-0" style={{ backgroundColor: EVENT_COLORS[row.type] }} />
                <span className={cx('flex-1 truncate text-sm', row.kind === 'group' ? 'font-mono text-foreground' : 'text-muted-foreground')} title={row.label}>{row.label}</span>
                {row.kind === 'group' ? (
                  <span className="text-[10px] font-mono text-muted-foreground">{row.count}</span>
                ) : row.event ? (
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">({row.event.duration_ms >= 1000 ? formatOffset(row.event.duration_ms) : `${row.event.duration_ms}ms`})</span>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
          <div className="relative h-8 border-b border-border shrink-0 bg-background/95 backdrop-blur-sm sticky top-0 z-10 pl-8 pr-10">
            {timeMarkers.map((m, i) => {
              const isFirst = i === 0;
              const isLast = i === timeMarkers.length - 1;
              return (
                <div
                  key={i}
                  className="absolute text-[10px] text-muted-foreground top-2 whitespace-nowrap"
                  style={
                    isFirst
                      ? { left: 8 }
                      : isLast
                        ? { right: 10 }
                        : { left: `${m.pct}%`, transform: 'translateX(-50%)' }
                  }
                >
                  {m.label}
                </div>
              );
            })}
          </div>
          <div ref={timelineScrollRef} className="flex-1 overflow-auto relative" onScroll={(e) => syncVerticalScroll('timeline', e.currentTarget.scrollTop)}>
            {hoveredRow !== null && (
              <div className="absolute left-0 right-0 pointer-events-none bg-foreground/[0.025] border-y border-foreground/10 z-0" style={{ top: hoveredRow * ROW_H, height: ROW_H }} />
            )}
            {treeRows.map((row, idx) => {
              const evt = row.event;
              const isSelected = !!evt && selectedEvent?.id === evt.id;
              return (
                <div
                  key={row.id}
                  className={cx('relative border-b border-border/40', hoveredRow === idx && 'bg-foreground/[0.02]')}
                  style={{ height: ROW_H }}
                  onMouseEnter={() => setHoveredRow(idx)}
                  onMouseLeave={() => setHoveredRow(null)}
                  onClick={() => evt && onSelectEvent(isSelected ? null : evt)}
                >
                  {evt ? (
                    <TimelineBar evt={evt} viewportStartMs={viewportStartMs} viewportEndMs={viewportEndMs} selected={isSelected} />
                  ) : null}
                </div>
              );
            })}
          </div>
          <LoopStrip
            totalDuration={totalDuration}
            events={a.events}
            viewportStartMs={viewportStartMs}
            viewportEndMs={viewportEndMs}
            onChange={(start, end) => {
              setViewportStartMs(start);
              setViewportEndMs(end);
            }}
          />
        </div>

        {selectedEvent && (
          <div className="h-full w-[420px] shrink-0 overflow-hidden border-l border-border bg-background">
            <EventInspector event={selectedEvent} onClose={() => onSelectEvent(null)} />
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineBar({ evt, viewportStartMs, viewportEndMs, selected }: { evt: TraceEvent; viewportStartMs: number; viewportEndMs: number; selected: boolean }) {
  const viewportRange = Math.max(1, viewportEndMs - viewportStartMs);
  const eventStart = evt.offset_ms;
  const eventEnd = evt.offset_ms + Math.max(evt.duration_ms, 150);
  const clippedStart = Math.max(eventStart, viewportStartMs);
  const clippedEnd = Math.min(eventEnd, viewportEndMs);

  if (clippedEnd <= clippedStart) {
    return null;
  }

  const leftPct = ((clippedStart - viewportStartMs) / viewportRange) * 100;
  const widthPct = Math.max(((clippedEnd - clippedStart) / viewportRange) * 100, 0.18);
  const color = EVENT_COLORS[evt.event_type] || '#64748b';
  const label = evt.duration_ms >= 1000 ? formatOffset(evt.duration_ms) : `${evt.duration_ms}ms`;

  return (
    <>
      <div
        className="absolute top-1/2 -translate-y-1/2 rounded-sm transition-all duration-150"
        style={{
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          minWidth: 3,
          height: 12,
          backgroundColor: color,
          opacity: selected ? 1 : 0.82,
          boxShadow: selected ? `0 0 0 1px rgba(255,255,255,0.85), 0 0 10px ${color}55` : 'none',
        }}
        title={summarizeEvent(evt)}
      />
      {evt.is_error && (
        <div className="absolute top-1 bottom-1 w-0.5 bg-destructive" style={{ left: `${leftPct}%` }} />
      )}
      <span
        className="absolute top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground whitespace-nowrap"
        style={{ left: `calc(${leftPct}% + ${Math.max(widthPct, 0.35)}% + 4px)` }}
      >
        {label}
      </span>
    </>
  );
}

function MiniTimelineScrubber({
  totalDuration,
  events,
  viewportStartMs,
  viewportEndMs,
  onChange,
}: {
  totalDuration: number;
  events: TraceEvent[];
  viewportStartMs: number;
  viewportEndMs: number;
  onChange: (start: number, end: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ mode: 'window' | 'left' | 'right' | null; startX: number; startStart: number; startEnd: number } | null>(null);
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const [localViewport, setLocalViewport] = useState({ start: viewportStartMs, end: viewportEndMs });
  const localViewportRef = useRef(localViewport);

  useEffect(() => {
    localViewportRef.current = localViewport;
  }, [localViewport]);

  useEffect(() => {
    if (dragStateRef.current === null) {
      setLocalViewport({ start: viewportStartMs, end: viewportEndMs });
    }
  }, [viewportStartMs, viewportEndMs]);

  const emitChange = (start: number, end: number, immediate = false) => {
    setLocalViewport({ start, end });
    if (immediate) {
      onChange(start, end);
    }
  };

  const handlePointerDown = (mode: 'window' | 'left' | 'right') => (e: React.PointerEvent) => {
    if (totalDuration <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragStateRef.current = {
      mode,
      startX: e.clientX,
      startStart: localViewportRef.current.start,
      startEnd: localViewportRef.current.end,
    };
  };

  const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!trackRef.current || totalDuration <= 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHoverMs(pct * totalDuration);

    const state = dragStateRef.current;
    if (!state) return;
    const deltaPct = (e.clientX - state.startX) / rect.width;
    const deltaMs = deltaPct * totalDuration;
    const minRange = Math.max(totalDuration * 0.01, 1000);

    if (state.mode === 'window') {
      let nextStart = state.startStart + deltaMs;
      let nextEnd = state.startEnd + deltaMs;
      if (nextStart < 0) {
        nextEnd -= nextStart;
        nextStart = 0;
      }
      if (nextEnd > totalDuration) {
        nextStart -= nextEnd - totalDuration;
        nextEnd = totalDuration;
      }
      emitChange(Math.max(0, nextStart), Math.min(totalDuration, nextEnd));
      return;
    }

    if (state.mode === 'left') {
      const nextStart = Math.max(0, Math.min(state.startStart + deltaMs, state.startEnd - minRange));
      emitChange(nextStart, state.startEnd);
      return;
    }

    const nextEnd = Math.min(totalDuration, Math.max(state.startEnd + deltaMs, state.startStart + minRange));
    emitChange(state.startStart, nextEnd);
  };

  const handlePointerUp: React.PointerEventHandler<HTMLDivElement> = () => {
    const pending = localViewportRef.current;
    dragStateRef.current = null;
    onChange(pending.start, pending.end);
  };

  const startPct = totalDuration > 0 ? (localViewport.start / totalDuration) * 100 : 0;
  const widthPct = totalDuration > 0 ? ((localViewport.end - localViewport.start) / totalDuration) * 100 : 100;
  const hoverPct = hoverMs !== null && totalDuration > 0 ? (hoverMs / totalDuration) * 100 : null;

  const miniBars = useMemo(() => {
    if (totalDuration <= 0) return [] as Array<{ left: number; width: number; color: string; evt: TraceEvent }>;
    return events.map(evt => ({
      evt,
      left: (evt.offset_ms / totalDuration) * 100,
      width: Math.max((Math.max(evt.duration_ms, 150) / totalDuration) * 100, 0.16),
      color: EVENT_COLORS[evt.event_type] || '#64748b',
    }));
  }, [events, totalDuration]);

  const hoverEvent = useMemo(() => {
    if (hoverMs === null) return null;
    return events.find(evt => evt.offset_ms <= hoverMs && hoverMs <= evt.offset_ms + Math.max(evt.duration_ms, 150))
      ?? events.reduce<TraceEvent | null>((closest, evt) => {
        const center = evt.offset_ms + Math.max(evt.duration_ms, 150) / 2;
        if (!closest) return evt;
        const closestCenter = closest.offset_ms + Math.max(closest.duration_ms, 150) / 2;
        return Math.abs(center - hoverMs) < Math.abs(closestCenter - hoverMs) ? evt : closest;
      }, null);
  }, [events, hoverMs]);

  return (
    <div className="h-20 border-t border-border bg-background/95 shrink-0 px-3 py-3">
      <div className="relative">
        <div
          ref={trackRef}
          className="relative h-12 rounded-md border border-border/70 bg-background overflow-hidden cursor-pointer select-none"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => {
            handlePointerUp({} as React.PointerEvent<HTMLDivElement>);
            setHoverMs(null);
          }}
        >
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--muted-fg-rgb),0.02)_0%,transparent_20%,transparent_80%,rgba(var(--muted-fg-rgb),0.02)_100%)]" />
          <div className="absolute inset-y-0 left-0 right-0">
            {miniBars.map((bar, idx) => (
              <div
                key={idx}
                className="absolute top-1/2 -translate-y-1/2 rounded-sm opacity-95"
                style={{
                  left: `${bar.left}%`,
                  width: `${bar.width}%`,
                  minWidth: 2,
                  height: 10,
                  backgroundColor: bar.color,
                  boxShadow: `0 0 0 1px ${bar.color}22`,
                }}
                title={summarizeEvent(bar.evt)}
              />
            ))}
          </div>

          {hoverPct !== null && (
            <div className="absolute top-0 bottom-0 w-px pointer-events-none" style={{ left: `${hoverPct}%`, backgroundColor: 'var(--accent)' }} />
          )}

          <div
            className="absolute inset-y-1 rounded-md cursor-grab active:cursor-grabbing"
            style={{ left: `${startPct}%`, width: `${widthPct}%`, backgroundColor: 'var(--bg-inset)', boxShadow: '0 0 0 1px rgba(var(--accent-rgb),0.15),0 0 12px rgba(var(--accent-rgb),0.1)' }}
            onPointerDown={handlePointerDown('window')}
          >
            <div className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize border-r border-[var(--border)] hover:bg-[var(--bg-inset-hover)]" onPointerDown={handlePointerDown('left')} />
            <div className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize border-l border-[var(--border)] hover:bg-[var(--bg-inset-hover)]" onPointerDown={handlePointerDown('right')} />
          </div>
        </div>

        {hoverEvent && hoverPct !== null && (
          <div
            className="absolute -top-20 z-10 w-96 rounded-md border border-border/70 bg-background px-3 py-2 text-[11px] shadow-xl pointer-events-none"
            style={{ left: `min(calc(${hoverPct}% + 8px), calc(100% - 24rem))` }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: EVENT_COLORS[hoverEvent.event_type] || '#64748b' }} />
              <span className="font-mono text-foreground">{EVENT_LABELS[hoverEvent.event_type] || hoverEvent.event_type}</span>
              <span className="ml-auto text-muted-foreground font-mono">{formatOffset(hoverEvent.offset_ms)}</span>
            </div>
            <div className="text-muted-foreground leading-relaxed whitespace-pre-wrap break-words max-h-16 overflow-hidden" title={summarizeEvent(hoverEvent)}>
              {summarizeEvent(hoverEvent)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EventInspector({ event, onClose }: { event: TraceEvent; onClose: () => void }) {
  const [tab, setTab] = useState<InspectorTab>('content');
  const tabs: { key: InspectorTab; label: string }[] = [
    { key: 'content', label: 'CONTENT' },
    { key: 'result', label: 'RESULT' },
    { key: 'usage', label: 'USAGE' },
    { key: 'raw', label: 'RAW JSON' },
  ];

  return (
    <div className="h-full border-l border-border bg-background flex flex-col overflow-hidden shadow-[-16px_0_48px_rgba(0,0,0,0.08)]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0 bg-background/95 backdrop-blur-sm">
        <span className="text-xs font-semibold text-foreground">Inspector</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-secondary transition-colors"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
      </div>

      <div className="px-3 py-2 text-[11px] space-y-1 border-b border-border shrink-0">
        <KV label="Type" value={event.event_type} />
        <KV label="Offset" value={formatOffset(event.offset_ms)} />
        <KV label="Duration" value={event.duration_ms >= 1000 ? formatOffset(event.duration_ms) : `${event.duration_ms}ms`} />
        <KV label="Entry ID" value={event.id.slice(0, 8)} />
        {event.model && <KV label="Model" value={event.model} />}
      </div>

      <div className="flex border-b border-border shrink-0 px-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cx('flex-1 px-2 py-2 text-[10px] font-semibold border-b-2 transition-colors', tab === t.key ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-3 text-xs">
        <div key={tab}>
          {tab === 'content' && <InspectorContent event={event} />}
          {tab === 'result' && <InspectorResult event={event} />}
          {tab === 'usage' && <InspectorUsage event={event} />}
          {tab === 'raw' && (
            <div className="rounded-lg border border-border/60 bg-secondary/40 p-2 overflow-auto">
              <pre className="text-[10px] whitespace-pre-wrap break-all font-mono leading-relaxed hljs" dangerouslySetInnerHTML={{ __html: renderCodeHtml(JSON.stringify(event, null, 2), 'json') }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InspectorContent({ event }: { event: TraceEvent }) {
  return (
    <div className="space-y-3">
      {event.content_preview && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">Content</div>
          <div className="rounded-lg border border-border/60 bg-secondary/40 p-2.5 overflow-auto">
            <div
              className="text-sm text-foreground break-words [&_p]:my-2 [&_pre]:my-2 [&_code]:font-mono [&_pre]:overflow-auto [&_ul]:pl-5 [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3"
              dangerouslySetInnerHTML={{ __html: parseMarkdown(event.content_preview) }}
            />
          </div>
        </div>
      )}

      {event.tool_calls.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">Tool Calls</div>
          <div className="space-y-2">
            {event.tool_calls.map(tc => {
              const diffFiles = tc.name === 'edit' ? toDiffFiles(tc) : null;
              return (
                <div key={tc.id} className="bg-secondary/40 rounded-lg border border-border/60 p-2.5 overflow-hidden">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="font-semibold text-foreground">tool: {tc.name}</div>
                    <div className={cx('text-[10px] font-mono px-1.5 py-0.5 rounded-full border', tc.status === 'error' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-border/60 text-muted-foreground')}>{tc.status}</div>
                  </div>
                  {diffFiles ? (
                    <div className="rounded-lg overflow-hidden border border-border/60 bg-background/70">
                      <div className="px-2 py-1 text-[10px] font-mono text-muted-foreground border-b border-border/60">{diffFiles.path}</div>
                      <MultiFileDiff
                        oldFile={diffFiles.oldFile}
                        newFile={diffFiles.newFile}
                        options={{
                          theme: { dark: 'pierre-dark', light: 'pierre-light' },
                          diffStyle: 'split',
                          overflow: 'wrap',
                        }}
                      />
                    </div>
                  ) : tc.arguments_raw ? (
                    <div className="rounded-lg border border-border/60 bg-background/70 overflow-auto max-h-[420px]">
                      <pre
                        className="text-[11px] leading-relaxed font-mono p-3 hljs"
                        dangerouslySetInnerHTML={{ __html: renderCodeHtml(tc.arguments_raw, 'json') }}
                      />
                    </div>
                  ) : tc.arguments_preview ? (
                    <div className="rounded-lg border border-border/60 bg-background/70 overflow-auto max-h-[420px]">
                      <pre
                        className="text-[11px] leading-relaxed font-mono p-3 hljs"
                        dangerouslySetInnerHTML={{ __html: renderCodeHtml(tc.arguments_preview, 'json') }}
                      />
                    </div>
                  ) : null}
                  {tc.result_preview && <div className="text-[10px] text-success mt-2">{tc.result_preview}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {event.thinking && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">Thinking</div>
          <pre className="whitespace-pre-wrap break-words text-muted-foreground bg-secondary/50 rounded-lg p-2.5 font-mono text-[11px] leading-relaxed">{event.thinking}</pre>
        </div>
      )}

      {!event.content_preview && event.tool_calls.length === 0 && !event.thinking && (
        <div className="text-muted-foreground text-center py-6">No content</div>
      )}
    </div>
  );
}

function InspectorResult({ event }: { event: TraceEvent }) {
  if (event.is_error) {
    return (
      <div className="text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
        <div className="font-semibold mb-1">Error</div>
        <div className="text-[11px] leading-relaxed">{event.error_message || 'Unknown error'}</div>
      </div>
    );
  }
  const resultPreview = event.tool_calls.find(tc => tc.result_preview)?.result_preview;
  return (
    <div className="space-y-2">
      {resultPreview ? (
        <pre className="whitespace-pre-wrap break-words text-muted-foreground bg-secondary/50 rounded-lg p-2.5 font-mono text-[11px] leading-relaxed">{resultPreview}</pre>
      ) : (
        <div className="text-muted-foreground text-center py-6">No result data</div>
      )}
    </div>
  );
}

function InspectorUsage({ event }: { event: TraceEvent }) {
  return (
    <div className="space-y-4">
      {event.tokens ? (
        <div className="space-y-1.5">
          <KV label="Input" value={formatTokens(event.tokens.input)} />
          <KV label="Output" value={formatTokens(event.tokens.output)} />
          <KV label="Cache Read" value={formatTokens(event.tokens.cache_read)} />
          <KV label="Cache Write" value={formatTokens(event.tokens.cache_write)} />
          <KV label="Total" value={formatTokens(event.tokens.total)} bold />
        </div>
      ) : (
        <div className="text-muted-foreground text-center py-4">No token data</div>
      )}

      {event.cost && event.cost.total > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-2">Cost</div>
          <div className="space-y-1.5">
            <KV label="Input" value={formatCost(event.cost.input)} />
            <KV label="Output" value={formatCost(event.cost.output)} />
            <KV label="Cache Read" value={formatCost(event.cost.cache_read)} />
            <KV label="Cache Write" value={formatCost(event.cost.cache_write)} />
            <KV label="Total" value={formatCost(event.cost.total)} bold />
          </div>
        </div>
      )}
    </div>
  );
}
