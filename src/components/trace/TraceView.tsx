import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Clock,
  Coins,
  MessageSquare,
  Wrench,
  AlertTriangle,
  Search,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from 'recharts';
import { AnimatePresence, motion } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { MultiFileDiff, type FileContents } from '@pierre/diffs/react';

import { useSessionTrace } from '@/hooks/useSessionTrace';
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

const TOKEN_BAR_COLORS = ['#3b82f6', '#22c55e', '#a78bfa', '#f59e0b'];
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
  const { analytics, loading, error } = useSessionTrace(session.path);
  const [activeTab, setActiveTab] = useState<TraceTab>('details');
  const [selectedEvent, setSelectedEvent] = useState<TraceEvent | null>(null);

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

function DetailsTab({ analytics: a }: { analytics: SessionTraceAnalytics }) {
  const tokenData = [
    { name: 'Input', value: a.total_tokens.input },
    { name: 'Output', value: a.total_tokens.output },
    { name: 'Cache R', value: a.total_tokens.cache_read },
    { name: 'Cache W', value: a.total_tokens.cache_write },
  ];
  const costData = [
    { name: 'Input', value: a.total_cost.input },
    { name: 'Output', value: a.total_cost.output },
    { name: 'Cache R', value: a.total_cost.cache_read },
    { name: 'Cache W', value: a.total_cost.cache_write },
  ];

  return (
    <div className="h-full overflow-auto p-4 space-y-4 bg-gradient-to-b from-background to-muted/10">
      <Section title="Tokens">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-4">
          <KV label="Input" value={formatTokens(a.total_tokens.input)} />
          <KV label="Output" value={formatTokens(a.total_tokens.output)} />
          <KV label="Cache Read" value={formatTokens(a.total_tokens.cache_read)} />
          <KV label="Cache Write" value={formatTokens(a.total_tokens.cache_write)} />
          <KV label="Total" value={formatTokens(a.total_tokens.total)} bold />
        </div>
        {a.total_tokens.total > 0 && (
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tokenData} barSize={36}>
                <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} stroke="#6a6f85" />
                <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="#6a6f85" tickFormatter={(v: number) => formatTokens(v)} />
                <Tooltip formatter={(v: unknown) => formatTokens(Number(v))} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {tokenData.map((_, i) => <Cell key={i} fill={TOKEN_BAR_COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      <Section title="Cost">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-4">
          <KV label="Input" value={formatCost(a.total_cost.input)} />
          <KV label="Output" value={formatCost(a.total_cost.output)} />
          <KV label="Cache Read" value={formatCost(a.total_cost.cache_read)} />
          <KV label="Cache Write" value={formatCost(a.total_cost.cache_write)} />
          <KV label="Total" value={formatCost(a.total_cost.total)} bold />
        </div>
        {a.total_cost.total > 0 && (
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costData} barSize={36}>
                <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} stroke="#6a6f85" />
                <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="#6a6f85" tickFormatter={(v: number) => formatCost(v)} />
                <Tooltip formatter={(v: unknown) => formatCost(Number(v))} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {costData.map((_, i) => <Cell key={i} fill={TOKEN_BAR_COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
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

  return (
    <div className="h-full overflow-auto p-4 space-y-4 bg-gradient-to-b from-background to-muted/10">
      <Section title="Tool Calls">
        {toolEntries.length > 0 ? (
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={toolEntries} barSize={24} layout="vertical" margin={{ left: 16 }}>
                <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} stroke="#6a6f85" />
                <YAxis type="category" dataKey="tool" fontSize={10} tickLine={false} axisLine={false} stroke="#6a6f85" width={92} tick={({ x, y, payload }) => (
                  <text x={x} y={Number(y) + 4} textAnchor="end" fill="#6a6f85" fontSize={10} fontFamily="monospace">{String(payload.value)}</text>
                )} />
                <Tooltip formatter={(v: unknown) => [`${v} calls`] as [string]} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {toolEntries.map((_, i) => <Cell key={i} fill={TOOL_COLORS[i % TOOL_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRange = Math.max(1, viewportEndMs - viewportStartMs);
  const zoomRatio = totalDuration > 0 ? viewportRange / totalDuration : 1;

  const visibleEvents = useMemo(() => a.events.filter(evt => evt.offset_ms + evt.duration_ms >= viewportStartMs && evt.offset_ms <= viewportEndMs), [a.events, viewportStartMs, viewportEndMs]);
  const groups = useEventGroups(visibleEvents);

  const treeRows = useMemo(() => {
    const rows: Array<{ kind: 'group' | 'event'; id: string; label: string; type: TraceEventType; event?: TraceEvent; depth: number; count?: number }> = [];
    for (const group of groups) {
      rows.push({ kind: 'group', id: group.id, label: group.label, type: group.type, depth: 0, count: group.events.length });
      if (!collapsedGroups.has(group.id)) {
        for (const evt of group.events) {
          rows.push({ kind: 'event', id: evt.id, label: summarizeEvent(evt), type: evt.event_type, event: evt, depth: 1 });
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

  const dragBind = useDrag(({ first, movement: [mx], memo }) => {
    if (!containerRef.current) return memo;
    const width = containerRef.current.clientWidth || 1;
    const range = viewportEndMs - viewportStartMs;
    if (first) memo = { start: viewportStartMs, end: viewportEndMs, width, range };
    const shift = -(mx / memo.width) * memo.range;
    let nextStart = memo.start + shift;
    let nextEnd = memo.end + shift;
    if (nextStart < 0) {
      nextEnd -= nextStart;
      nextStart = 0;
    }
    if (nextEnd > totalDuration) {
      const overshoot = nextEnd - totalDuration;
      nextStart = Math.max(0, nextStart - overshoot);
      nextEnd = totalDuration;
    }
    setViewportStartMs(nextStart);
    setViewportEndMs(nextEnd);
    return memo;
  });

  const onWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    if (!containerRef.current || totalDuration <= 0) return;
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const mousePct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const range = viewportEndMs - viewportStartMs;
    const zoomFactor = e.deltaY > 0 ? 1.15 : 0.87;
    const pivot = viewportStartMs + range * mousePct;
    let nextStart = pivot - (pivot - viewportStartMs) * zoomFactor;
    let nextEnd = pivot + (viewportEndMs - pivot) * zoomFactor;
    const minRange = Math.max(totalDuration * 0.005, 500);
    if (nextEnd - nextStart < minRange) {
      const center = (nextStart + nextEnd) / 2;
      nextStart = center - minRange / 2;
      nextEnd = center + minRange / 2;
    }
    if (nextStart < 0) {
      nextEnd -= nextStart;
      nextStart = 0;
    }
    if (nextEnd > totalDuration) {
      const overshoot = nextEnd - totalDuration;
      nextStart = Math.max(0, nextStart - overshoot);
      nextEnd = totalDuration;
    }
    setViewportStartMs(nextStart);
    setViewportEndMs(nextEnd);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 text-xs">
        <span className="px-2 py-1 rounded-full border border-border/60 bg-background text-foreground font-mono">{a.total_events} events</span>
        <span className="px-2 py-1 rounded-full border border-border/60 bg-background text-foreground font-mono">{a.total_tool_calls} tools</span>
        <span className={cx('px-2 py-1 rounded-full border font-mono', a.total_errors > 0 ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-border/60 bg-background text-foreground')}>{a.total_errors} errors</span>
        <span className="text-muted-foreground font-mono">{a.primary_model}</span>
        <button className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors" onClick={() => { setViewportStartMs(0); setViewportEndMs(totalDuration || 1); }}>
          <Search className="w-3 h-3" />
          {zoomRatio < 0.98 ? `Viewing ${formatOffset(viewportStartMs)} – ${formatOffset(viewportEndMs)}` : 'Full range'}
          {zoomRatio < 0.98 && <span className="underline">reset</span>}
        </button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-[280px] shrink-0 h-full overflow-auto border-r border-border bg-muted/15">
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
                  if (row.kind === 'group') {
                    setCollapsedGroups(prev => {
                      const next = new Set(prev);
                      if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                      return next;
                    });
                  } else if (row.event) {
                    onSelectEvent(selectedEvent?.id === row.event.id ? null : row.event);
                  }
                }}
              >
                {row.kind === 'group' ? (
                  <span className="text-muted-foreground text-[10px]">{collapsedGroups.has(row.id) ? '▸' : '▾'}</span>
                ) : (
                  <span className="text-muted-foreground text-[10px] ml-4">▸</span>
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
          <div className="relative h-8 border-b border-border shrink-0 bg-background/95 backdrop-blur-sm sticky top-0 z-10 pl-3 pr-4">
            {timeMarkers.map((m, i) => (
              <div key={i} className="absolute text-[10px] text-muted-foreground -translate-x-1/2 top-2" style={{ left: `${m.pct}%` }}>{m.label}</div>
            ))}
          </div>
          <div ref={containerRef} className="flex-1 overflow-auto relative" onWheel={onWheel} {...dragBind()}>
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
        </div>

        <AnimatePresence initial={false}>
          {selectedEvent && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 420, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="h-full shrink-0 overflow-hidden border-l border-border"
            >
              <EventInspector event={selectedEvent} onClose={() => onSelectEvent(null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TimelineBar({ evt, viewportStartMs, viewportEndMs, selected }: { evt: TraceEvent; viewportStartMs: number; viewportEndMs: number; selected: boolean }) {
  const viewportRange = Math.max(1, viewportEndMs - viewportStartMs);
  const leftPct = Math.max(((evt.offset_ms - viewportStartMs) / viewportRange) * 100, 0);
  const widthPct = Math.max((Math.max(evt.duration_ms, 150) / viewportRange) * 100, 0.18);
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
      {widthPct > 2.5 && (
        <span className="absolute top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground" style={{ left: `calc(${leftPct}% + ${Math.max(widthPct, 0.4)}%)` }}>
          {label}
        </span>
      )}
    </>
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
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}>
            {tab === 'content' && <InspectorContent event={event} />}
            {tab === 'result' && <InspectorResult event={event} />}
            {tab === 'usage' && <InspectorUsage event={event} />}
            {tab === 'raw' && (
              <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all font-mono leading-relaxed">{JSON.stringify(event, null, 2)}</pre>
            )}
          </motion.div>
        </AnimatePresence>
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
          <pre className="whitespace-pre-wrap break-words text-muted-foreground bg-secondary/50 rounded-lg p-2.5 font-mono text-[11px] leading-relaxed">{event.content_preview}</pre>
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
                  ) : tc.arguments_preview ? (
                    <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words font-mono bg-background/60 rounded p-2">{tc.arguments_preview}</pre>
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
