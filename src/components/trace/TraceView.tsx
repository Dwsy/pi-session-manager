import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Clock,
  Coins,
  MessageSquare,
  Wrench,
  AlertTriangle,
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

import { useSessionTrace } from '@/hooks/useSessionTrace';
import type {
  SessionTraceAnalytics,
  TraceEvent,
  TraceEventType,
} from '@/types/trace';
import type { SessionInfo } from '@/types';

interface TraceViewProps {
  session: SessionInfo;
  onClose: () => void;
}

type TraceTab = 'details' | 'analytics' | 'timeline';

const EVENT_COLORS: Record<TraceEventType, string> = {
  user_prompt: '#f97316',
  assistant_response: '#22c55e',
  tool_call: '#eab308',
  tool_result: '#3b82f6',
  model_change: '#6b7280',
  thinking_level_change: '#a78bfa',
  compaction: '#14b8a6',
  custom_message: '#64748b',
  system_event: '#94a3b8',
};

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
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(0);
  return `${m}m ${rem}s`;
}

// ============================================================
// Main TraceView
// ============================================================

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
        <TraceHeader title={t('trace.error.title', 'Trace Error')} onClose={onClose} />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-destructive text-sm text-center">
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const a = analytics;
  if (!a) return null;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <TraceHeader title={t('trace.title', 'Trace')} onClose={onClose} />

      {/* Stats Strip */}
      <div className="grid grid-cols-5 gap-2 px-4 py-2 border-b border-border bg-muted/30 shrink-0">
        <StatItem icon={Clock} label="Duration" value={formatDuration(a.active_secs || a.duration_secs)} />
        <StatItem icon={Coins} label="Cost" value={formatCost(a.total_cost.total)} />
        <StatItem icon={MessageSquare} label="Messages" value={`${a.total_messages}`} />
        <StatItem icon={Wrench} label="Tool Calls" value={`${a.total_tool_calls}`} />
        <StatItem
          icon={AlertTriangle}
          label="Errors"
          value={`${a.total_errors}`}
          color={a.total_errors > 0 ? 'text-destructive' : undefined}
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSelectedEvent(null); }}
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
        {activeTab === 'details' && <DetailsTab analytics={a} />}
        {activeTab === 'analytics' && <AnalyticsTab analytics={a} />}
        {activeTab === 'timeline' && (
          <TimelineView
            analytics={a}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Shared sub-components
// ============================================================

function TraceHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
      <span className="text-sm font-medium text-foreground">{title}</span>
      <button onClick={onClose} className="p-1 rounded hover:bg-secondary" title="Close">
        <X className="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  );
}

function StatItem({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <span className={`text-sm font-semibold ${color || 'text-foreground'}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
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
      <span className={bold ? 'font-bold' : 'font-mono text-foreground'}>{value}</span>
    </div>
  );
}

// ============================================================
// Details Tab
// ============================================================

const TOKEN_BAR_COLORS = ['#3b82f6', '#22c55e', '#a78bfa', '#f59e0b'];

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
    <div className="p-4 space-y-5">
      {/* Token Breakdown */}
      <Section title="Tokens">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-3">
          <KV label="Input" value={formatTokens(a.total_tokens.input)} />
          <KV label="Output" value={formatTokens(a.total_tokens.output)} />
          <KV label="Cache Read" value={formatTokens(a.total_tokens.cache_read)} />
          <KV label="Cache Write" value={formatTokens(a.total_tokens.cache_write)} />
          <KV label="Total" value={formatTokens(a.total_tokens.total)} bold />
        </div>
        {a.total_tokens.total > 0 && (
          <div className="h-28 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tokenData} barSize={32}>
                <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} stroke="#6a6f85" />
                <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="#6a6f85" tickFormatter={formatTokens} />
                <Tooltip
                  formatter={(v: unknown) => formatTokens(Number(v))}
                  contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {tokenData.map((_, i) => (
                    <Cell key={i} fill={TOKEN_BAR_COLORS[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* Cost Breakdown */}
      <Section title="Cost">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-3">
          <KV label="Input" value={formatCost(a.total_cost.input)} />
          <KV label="Output" value={formatCost(a.total_cost.output)} />
          <KV label="Cache Read" value={formatCost(a.total_cost.cache_read)} />
          <KV label="Cache Write" value={formatCost(a.total_cost.cache_write)} />
          <KV label="Total" value={formatCost(a.total_cost.total)} bold />
        </div>
        {a.total_cost.total > 0 && (
          <div className="h-28 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costData} barSize={32}>
                <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} stroke="#6a6f85" />
                <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="#6a6f85" tickFormatter={formatCost} />
                <Tooltip
                  formatter={(v: unknown) => formatCost(Number(v))}
                  contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {costData.map((_, i) => (
                    <Cell key={i} fill={TOKEN_BAR_COLORS[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* Models Used */}
      <Section title={`Models Used (${a.models_used.length})`}>
        <div className="space-y-1.5">
          {a.models_used.map(m => {
            const mt = a.tokens_by_model[m];
            const mc = a.cost_by_model[m];
            return (
              <div key={m} className="flex items-center justify-between text-sm bg-secondary/50 rounded px-2 py-1.5">
                <span className="font-mono text-foreground">{m}</span>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  {mt && <span>{formatTokens(mt.total)} tok</span>}
                  {mc && <span>{formatCost(mc.total)}</span>}
                </div>
              </div>
            );
          })}
          {a.models_used.length === 0 && (
            <div className="text-sm text-muted-foreground">No model data</div>
          )}
        </div>
      </Section>
    </div>
  );
}

// ============================================================
// Analytics Tab
// ============================================================

const TOOL_COLORS = [
  '#eab308', '#3b82f6', '#a855f7', '#22c55e',
  '#f97316', '#ef4444', '#14b8a6', '#6366f1',
];

function AnalyticsTab({ analytics: a }: { analytics: SessionTraceAnalytics }) {
  const toolEntries = useMemo(() =>
    Object.entries(a.tool_call_counts)
      .sort(([, a], [, b]) => b - a)
      .map(([tool, count]) => ({ tool, count })),
    [a.tool_call_counts],
  );

  return (
    <div className="p-4 space-y-5">
      {/* Tool Calls Chart */}
      <Section title="Tool Calls">
        {toolEntries.length > 0 ? (
          <>
            <div className="h-36 w-full mb-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={toolEntries} barSize={28} layout="vertical">
                  <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} stroke="#6a6f85" />
                  <YAxis
                    type="category"
                    dataKey="tool"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    stroke="#6a6f85"
                    width={70}
                    tick={({ x, y, payload }) => (
                      <text x={x} y={Number(y) + 4} textAnchor="end" fill="#6a6f85" fontSize={10} fontFamily="monospace">
                        {String(payload.value)}
                      </text>
                    )}
                  />
                  <Tooltip
                    formatter={(v: unknown) => [`${v} calls`] as [string]}
                    contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {toolEntries.map((_, i) => (
                      <Cell key={i} fill={TOOL_COLORS[i % TOOL_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">No tool calls</div>
        )}
      </Section>

      {/* Files Read */}
      {a.files_read.length > 0 && (
        <Section title={`Files Read (${a.files_read.length} unique, ${a.files_read_count} total)`}>
          <div className="space-y-0.5 max-h-36 overflow-auto text-xs font-mono text-muted-foreground">
            {a.files_read.map(f => (
              <div key={f} className="truncate px-1 py-0.5 hover:bg-secondary rounded" title={f}>
                {f}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Files Edited */}
      {a.files_edited.length > 0 && (
        <Section title={`Files Edited (${a.files_edited.length} unique, ${a.files_edited_count} total)`}>
          <div className="space-y-0.5 max-h-36 overflow-auto text-xs font-mono text-muted-foreground">
            {a.files_edited.map(f => (
              <div key={f} className="truncate px-1 py-0.5 hover:bg-secondary rounded" title={f}>
                {f}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Files Written */}
      {a.files_written.length > 0 && (
        <Section title={`Files Written (${a.files_written.length} unique, ${a.files_written_count} total)`}>
          <div className="space-y-0.5 max-h-36 overflow-auto text-xs font-mono text-muted-foreground">
            {a.files_written.map(f => (
              <div key={f} className="truncate px-1 py-0.5 hover:bg-secondary rounded" title={f}>
                {f}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Bash Commands */}
      {a.bash_commands.length > 0 && (
        <Section title={`Bash Commands (${a.bash_commands.length} unique)`}>
          <div className="space-y-1 max-h-40 overflow-auto">
            {a.bash_commands
              .sort((a, b) => b.count - a.count)
              .slice(0, 20)
              .map((bc, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-28 font-mono text-muted-foreground truncate" title={bc.command_prefix}>
                    {bc.command_prefix}
                  </span>
                  <span className="text-foreground font-semibold">{bc.count}×</span>
                </div>
              ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ============================================================
// Timeline Tab
// ============================================================

const EVENT_LABELS: Record<TraceEventType, string> = {
  user_prompt: 'User',
  assistant_response: 'Assistant',
  tool_call: 'Tool',
  tool_result: 'Result',
  model_change: 'Model',
  thinking_level_change: 'Thinking',
  compaction: 'Compact',
  custom_message: 'Custom',
  system_event: 'System',
};

function TimelineView({
  analytics: a,
  selectedEvent,
  onSelectEvent,
}: {
  analytics: SessionTraceAnalytics;
  selectedEvent: TraceEvent | null;
  onSelectEvent: (e: TraceEvent | null) => void;
}) {
  const totalDuration = a.events.length > 0
    ? a.events[a.events.length - 1].offset_ms + a.events[a.events.length - 1].duration_ms
    : 0;

  const timeMarkers = useMemo(() => {
    if (totalDuration === 0) return [];
    const steps = 8;
    const step = totalDuration / steps;
    return Array.from({ length: steps + 1 }, (_, i) => ({
      ms: Math.round(step * i),
      label: formatOffset(step * i),
      pct: (i / steps) * 100,
    }));
  }, [totalDuration]);

  // Filter out high-frequency noise for display (limit to ~500 bars)
  const displayEvents = a.events.length > 500
    ? a.events.filter((_, i) => i % Math.ceil(a.events.length / 500) === 0)
    : a.events;

  return (
    <div className="flex flex-col h-full">
      {/* Event stats bar */}
      <div className="flex items-center gap-4 px-4 py-1.5 text-xs text-muted-foreground border-b border-border shrink-0">
        <span>{a.total_events} events</span>
        <span>{a.total_tool_calls} tools</span>
        <span className={a.total_errors > 0 ? 'text-destructive' : ''}>{a.total_errors} errors</span>
        <span className="font-mono">{a.primary_model}</span>
        <span className="ml-auto">{formatDuration(a.active_secs || a.duration_secs)}</span>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Gantt chart area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-auto">
          {/* Time axis */}
          <div className="relative h-5 border-b border-border shrink-0 ml-16">
            {timeMarkers.map((m, i) => (
              <div
                key={i}
                className="absolute text-[9px] text-muted-foreground -translate-x-1/2"
                style={{ left: `${m.pct}%` }}
              >
                {m.label}
              </div>
            ))}
          </div>

          {/* Event bars */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {displayEvents.map((evt) => {
              const leftPct = totalDuration > 0 ? (evt.offset_ms / totalDuration) * 100 : 0;
              const widthPct = totalDuration > 0 ? Math.max((evt.duration_ms / totalDuration) * 100, 0.15) : 0.15;
              const color = EVENT_COLORS[evt.event_type] || '#64748b';
              const isSelected = selectedEvent?.id === evt.id;

              return (
                <div
                  key={evt.id}
                  className="flex items-center h-5 hover:bg-secondary/30 cursor-pointer"
                  onClick={() => onSelectEvent(isSelected ? null : evt)}
                >
                  {/* Label */}
                  <div className="w-16 shrink-0 text-[9px] text-muted-foreground text-right pr-1 truncate font-mono">
                    {EVENT_LABELS[evt.event_type] || evt.event_type}
                  </div>

                  {/* Bar */}
                  <div className="flex-1 relative h-full">
                    <div
                      className="absolute top-0.5 bottom-0.5 rounded-sm transition-all hover:brightness-125"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        backgroundColor: color,
                        opacity: isSelected ? 1 : 0.75,
                        outline: isSelected ? '2px solid white' : 'none',
                      }}
                      title={`${evt.event_type} ${evt.tool_calls.length > 0 ? evt.tool_calls.map(t => t.name).join(', ') : ''}`}
                    />
                    {/* Error marker */}
                    {evt.is_error && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-destructive"
                        style={{ left: `${leftPct}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Inspector drawer */}
        {selectedEvent && (
          <EventInspector event={selectedEvent} onClose={() => onSelectEvent(null)} />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Event Inspector
// ============================================================

type InspectorTab = 'content' | 'result' | 'usage' | 'raw';

function EventInspector({ event, onClose }: { event: TraceEvent; onClose: () => void }) {
  const [tab, setTab] = useState<InspectorTab>('content');
  const tabs: { key: InspectorTab; label: string }[] = [
    { key: 'content', label: 'Content' },
    { key: 'result', label: 'Result' },
    { key: 'usage', label: 'Usage' },
    { key: 'raw', label: 'Raw' },
  ];

  return (
    <div className="w-80 shrink-0 border-l border-border bg-background flex flex-col overflow-hidden">
      {/* Inspector header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-foreground">Inspector</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-secondary">
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Event meta */}
      <div className="px-3 py-2 text-[11px] space-y-0.5 border-b border-border shrink-0">
        <KV label="Type" value={event.event_type} />
        <KV label="Offset" value={formatOffset(event.offset_ms)} />
        <KV label="Duration" value={formatOffset(event.duration_ms)} />
        <KV label="ID" value={event.id.slice(0, 8)} />
        {event.model && <KV label="Model" value={event.model} />}
      </div>

      {/* Inspector tabs */}
      <div className="flex border-b border-border shrink-0">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-2 py-1.5 text-[11px] font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-3 text-xs">
        {tab === 'content' && (
          <div className="space-y-2">
            {event.content_preview && (
              <pre className="whitespace-pre-wrap break-words text-muted-foreground bg-secondary/50 rounded p-2 font-mono text-[11px]">
                {event.content_preview}
              </pre>
            )}
            {event.tool_calls.length > 0 && (
              <div>
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Tool Calls</div>
                {event.tool_calls.map(tc => (
                  <div key={tc.id} className="bg-secondary/50 rounded p-2 mb-1">
                    <div className="font-semibold text-foreground">{tc.name}</div>
                    {tc.arguments_preview && (
                      <pre className="text-[10px] text-muted-foreground mt-1 whitespace-pre-wrap break-words font-mono">
                        {tc.arguments_preview}
                      </pre>
                    )}
                    {tc.result_preview && (
                      <div className="text-[10px] text-success mt-1">{tc.result_preview}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {event.thinking && (
              <div>
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Thinking</div>
                <pre className="whitespace-pre-wrap break-words text-muted-foreground bg-secondary/50 rounded p-2 font-mono text-[11px]">
                  {event.thinking}
                </pre>
              </div>
            )}
            {!event.content_preview && event.tool_calls.length === 0 && !event.thinking && (
              <div className="text-muted-foreground text-center py-4">No content</div>
            )}
          </div>
        )}

        {tab === 'result' && (
          <div>
            {event.is_error ? (
              <div className="text-destructive bg-destructive/10 rounded p-2">
                <div className="font-semibold mb-1">⚠ Error</div>
                <div className="text-[11px]">{event.error_message || 'Unknown error'}</div>
              </div>
            ) : (
              <div className="text-muted-foreground text-center py-4">
                {event.event_type === 'tool_result' ? 'Success' : 'No result data'}
              </div>
            )}
          </div>
        )}

        {tab === 'usage' && (
          <div>
            {event.tokens ? (
              <div className="space-y-1">
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
              <>
                <div className="text-[10px] uppercase text-muted-foreground mt-3 mb-1">Cost</div>
                <div className="space-y-1">
                  <KV label="Input" value={formatCost(event.cost.input)} />
                  <KV label="Output" value={formatCost(event.cost.output)} />
                  <KV label="Total" value={formatCost(event.cost.total)} bold />
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'raw' && (
          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all font-mono">
            {JSON.stringify(event, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
