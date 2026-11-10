import type {
  PsmPluginHostContext,
  PsmPluginManifest,
  PsmSessionReference,
  PsmSessionUiRenderProps,
  PsmSessionsClient,
  PsmSystemPromptSnapshot,
} from '@dwsy/plugin-sdk'
import { hostReact } from './host-react'

const React = hostReact()
const { Component, createElement } = React

const PANEL_ID = 'builtin.system-prompt-snapshot.panel'
const TOOLBAR_ID = 'builtin.system-prompt-snapshot.toolbar'

const CHANGE_TONES = {
  changed: {
    label: 'Changed sections',
    heading: 'text-emerald-400',
    chip: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  },
  removed: {
    label: 'Removed sections',
    heading: 'text-rose-400',
    chip: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  },
  toolsAdded: {
    label: 'Tools added',
    heading: 'text-sky-400',
    chip: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  },
  toolsRemoved: {
    label: 'Tools removed',
    heading: 'text-amber-400',
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  },
} as const

type ChangeTone = keyof typeof CHANGE_TONES

interface PanelProps {
  sessions: PsmSessionsClient
  session: PsmSessionReference
  open: boolean
  onClose: () => void
}

interface PanelState {
  loading: boolean
  error: string | null
  snapshots: PsmSystemPromptSnapshot[]
  selectedVersion: number | null
}

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.system-prompt-snapshot',
  name: 'System Prompt Snapshots',
  version: '0.1.0',
  runtime: {
    sdk: '^0.1.0',
    host: '>=0.6.3',
  },
  permissions: ['sessions:read'],
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function shortId(value: string): string {
  return value.slice(0, 10)
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function newestFirst(snapshots: PsmSystemPromptSnapshot[]): PsmSystemPromptSnapshot[] {
  return snapshots.slice().sort((a, b) => b.version - a.version)
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 12a8.5 8.5 0 1 0 2.4-5.9" />
      <path d="M3.5 4.5v4h4" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}

function ToolbarButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      title="System Prompt Snapshots"
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${open ? 'border-info/45 bg-info/10 text-foreground' : 'border-border/70 text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}`}
    >
      <HistoryIcon />
      <span>System Prompt</span>
    </button>
  )
}

function ChangeGroup({ tone, values }: { tone: ChangeTone; values: string[] }) {
  const toneClasses = CHANGE_TONES[tone]
  return (
    <div className="min-w-0 rounded-md border border-border/70 bg-background/60 p-2">
      <div className={`mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide ${toneClasses.heading}`}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
        <span className="truncate" title={toneClasses.label}>{toneClasses.label}</span>
        <span className="ml-auto font-mono text-muted-foreground">{values.length}</span>
      </div>
      {values.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">None</div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {values.map((value, index) => (
            <span
              key={`${tone}-${index}-${value}`}
              title={value}
              className={`max-w-full truncate rounded border px-1.5 py-0.5 font-mono text-[10px] ${toneClasses.chip}`}
            >
              {value}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

class PromptSnapshotPanel extends Component<PanelProps, PanelState> {
  private loadToken = 0

  state: PanelState = {
    loading: false,
    error: null,
    snapshots: [],
    selectedVersion: null,
  }

  componentDidMount() {
    if (this.props.open) void this.refresh()
  }

  componentDidUpdate(prevProps: PanelProps) {
    const changedSession = prevProps.session.id !== this.props.session.id
      || prevProps.session.path !== this.props.session.path
    if (changedSession) {
      this.loadToken += 1
      this.setState({ loading: false, error: null, snapshots: [], selectedVersion: null })
      if (this.props.open) void this.refresh()
      return
    }
    if (this.props.open && !prevProps.open) void this.refresh()
  }

  componentWillUnmount() {
    this.loadToken += 1
  }

  private isStale(token: number, sessionPath: string, sessionId: string) {
    return token !== this.loadToken
      || sessionPath !== this.props.session.path
      || sessionId !== (this.props.session.id ?? '')
  }

  private refresh = async () => {
    const token = ++this.loadToken
    const sessionPath = this.props.session.path
    const sessionId = this.props.session.id ?? ''
    if (!sessionPath) {
      this.setState({ loading: false, error: 'This session has no JSONL path.', snapshots: [], selectedVersion: null })
      return
    }

    this.setState({ loading: true, error: null })
    try {
      const snapshots = await this.props.sessions.readSystemPromptSnapshots(sessionPath)
      if (this.isStale(token, sessionPath, sessionId)) return
      const versions = newestFirst(snapshots)
      this.setState({
        loading: false,
        error: null,
        snapshots,
        selectedVersion: versions[0]?.version ?? null,
      })
    } catch (error) {
      if (this.isStale(token, sessionPath, sessionId)) return
      this.setState({
        loading: false,
        error: `Failed to load system prompt snapshots: ${message(error)}`,
        snapshots: [],
        selectedVersion: null,
      })
    }
  }

  render() {
    const { onClose, session } = this.props
    const { loading, error, snapshots, selectedVersion } = this.state
    const versions = newestFirst(snapshots)
    const selected = versions.find((snapshot) => snapshot.version === selectedVersion) ?? versions[0] ?? null

    return (
      <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <div className="flex items-start justify-between gap-3 border-b border-border/70 px-3 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <HistoryIcon />
              <span>System Prompt Snapshots</span>
            </div>
            <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground" title={session.path}>
              {session.path}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => void this.refresh()}
              disabled={loading}
              className="rounded-md border border-border/70 px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary/60 hover:text-foreground disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="m-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {!error && loading && snapshots.length === 0 && (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Loading system prompt snapshots…
          </div>
        )}

        {!error && !loading && snapshots.length === 0 && (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            No system prompt snapshots for this session.
          </div>
        )}

        {!error && snapshots.length > 0 && selected && (
          <>
            <div className="border-b border-border/70 px-3 py-2.5">
              <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span>{versions.length} snapshot{versions.length === 1 ? '' : 's'}</span>
                <span className="font-mono">{formatBytes(byteLength(selected.prompt))}</span>
              </div>
              <select
                value={selected.version}
                aria-label="System prompt version"
                onChange={(event) => this.setState({ selectedVersion: Number(event.currentTarget.value) })}
                className="h-8 w-full rounded-md border border-border/70 bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-info/50"
              >
                {versions.map((snapshot) => (
                  <option key={`${snapshot.id}-${snapshot.version}`} value={snapshot.version}>
                    v{snapshot.version} · {shortId(snapshot.id)} · {formatTime(snapshot.timestamp)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2 border-b border-border/70 px-3 py-2.5">
              <ChangeGroup tone="changed" values={selected.changedSections} />
              <ChangeGroup tone="removed" values={selected.removedSections} />
              <ChangeGroup tone="toolsAdded" values={selected.toolsAdded} />
              <ChangeGroup tone="toolsRemoved" values={selected.toolsRemoved} />
            </div>

            <div className="border-b border-border/70 px-3 py-2.5">
              <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span>Effective sections</span>
                <span className="font-mono">{selected.sections.length}</span>
              </div>
              <div className="max-h-32 space-y-1 overflow-auto">
                {selected.sections.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground">No effective sections.</div>
                ) : selected.sections.map((section, index) => (
                  <div
                    key={`${section.name}-${index}`}
                    className="flex items-center justify-between gap-2 rounded bg-secondary/30 px-2 py-1"
                  >
                    <span className="truncate font-mono text-[11px] text-foreground" title={section.name}>
                      {section.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {formatBytes(byteLength(section.text))}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 bg-surface/15">
              <pre className="h-full overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5 text-foreground selection:bg-info/20">
                {selected.prompt}
              </pre>
            </div>
          </>
        )}
      </div>
    )
  }
}

export default function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerSessionToolbarItem({
    id: TOOLBAR_ID,
    title: 'System Prompt Snapshots',
    panelId: PANEL_ID,
    hostSlot: 'system-prompt-tools',
    render: (props: PsmSessionUiRenderProps) => createElement(ToolbarButton, {
      open: Boolean(props.panelOpen),
      onToggle: props.togglePanel ?? (() => {}),
    }),
  })

  ctx.ui.registerSessionPanel({
    id: PANEL_ID,
    title: 'System Prompt Snapshots',
    side: 'right',
    render: (props: PsmSessionUiRenderProps) => createElement(PromptSnapshotPanel, {
      sessions: ctx.psm.sessions,
      session: props.session,
      open: Boolean(props.panelOpen),
      onClose: props.closePanel ?? (() => {}),
    }),
  })
}
