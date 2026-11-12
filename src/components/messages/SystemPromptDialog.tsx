import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  Bot,
  ChevronDown,
  ChevronRight,
  Copy,
  RefreshCw,
  Search,
  Terminal,
  Wrench,
  X,
} from 'lucide-react'
import { invoke } from '@/transport'
import MarkdownContent from '@/components/ui/MarkdownContent'
import { useClipboard } from '@/hooks/useClipboard'
import { formatBytes, formatDate } from '@/utils/format'
import {
  buildToolUsageRows,
  countToolCalls,
  filterToolUsageRows,
} from '@/utils/system-prompt'
import type { SessionEntry, SystemPromptSnapshot } from '@/types'

interface SystemPromptDialogProps {
  isOpen: boolean
  onClose: () => void
  entries?: SessionEntry[]
  sessionPath?: string
}

type TabType = 'prompt' | 'tools'
type LoadState = 'idle' | 'loading' | 'ready' | 'error'

const FULL_PROMPT = '__full_prompt__'
const BASE_CONTENT = '__base_content__'
const PROMPT_TAB_ID = 'system-prompt-tab'
const TOOLS_TAB_ID = 'system-tools-tab'

interface PromptBlock {
  key: string
  name: string
  text: string
  changed: boolean
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function newestFirst(snapshots: SystemPromptSnapshot[]): SystemPromptSnapshot[] {
  return snapshots.slice().sort((a, b) => b.version - a.version)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function SkillsContent({ text }: { text: string }) {
  const parsed = useMemo(() => {
    if (/<!DOCTYPE/i.test(text)) return null
    const doc = new DOMParser().parseFromString(text, 'application/xml')
    const root = doc.documentElement
    if (root.tagName !== 'skills' || doc.querySelector('parsererror') || root.attributes.length) return null

    const nodes = Array.from(root.childNodes)
    const lists = nodes.filter((node) => node.nodeType === Node.ELEMENT_NODE)
    if (lists.length !== 1 || (lists[0] as Element).tagName !== 'available_skills') return null
    if (nodes.some((node) => node.nodeType !== Node.TEXT_NODE && node !== lists[0])) return null
    const list = lists[0] as Element
    if (list.attributes.length || Array.from(list.childNodes).some((node) =>
      node.nodeType !== Node.ELEMENT_NODE && (node.nodeType !== Node.TEXT_NODE || node.textContent?.trim()),
    )) return null

    const skills = Array.from(list.children).map((skill) => {
      if (skill.tagName !== 'skill' || skill.attributes.length || Array.from(skill.childNodes).some((node) =>
        node.nodeType !== Node.ELEMENT_NODE && (node.nodeType !== Node.TEXT_NODE || node.textContent?.trim()),
      )) return null
      const fields = Array.from(skill.children)
      if (fields.length !== 3 || ['name', 'description', 'location'].some((name) => fields.filter((field) => field.tagName === name).length !== 1)) return null
      if (fields.some((field) => field.attributes.length || Array.from(field.childNodes).some((node) => node.nodeType !== Node.TEXT_NODE && node.nodeType !== Node.CDATA_SECTION_NODE))) return null
      return Object.fromEntries(fields.map((field) => [field.tagName, field.textContent ?? '']))
    })
    if (skills.some((skill) => skill === null)) return null
    return { nodes, list, skills: skills as Record<string, string>[] }
  }, [text])

  if (!parsed) return <pre className="whitespace-pre-wrap break-words font-mono text-sm">{text}</pre>

  return (
    <div className="space-y-3">
      {parsed.nodes.map((node, index) => node === parsed.list ? (
        <div key={index} className="grid gap-2">
          {parsed.skills.map((skill, skillIndex) => (
            <article key={skillIndex} className="min-w-0 rounded-md border border-border bg-card p-3 text-card-foreground">
              <h4 className="break-words font-mono text-sm font-medium">{skill.name}</h4>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{skill.description}</p>
              <div className="mt-2 whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">{skill.location}</div>
            </article>
          ))}
        </div>
      ) : node.textContent?.trim() ? (
        <div key={index} className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{node.textContent.trim()}</div>
      ) : null)}
    </div>
  )
}

function SystemPromptDialog({ isOpen, onClose, entries = [], sessionPath }: SystemPromptDialogProps) {
  const { t } = useTranslation()
  const { copyText } = useClipboard()
  const titleId = useId()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const loadTokenRef = useRef(0)

  const [activeTab, setActiveTab] = useState<TabType>('prompt')
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<SystemPromptSnapshot[]>([])
  const [fallbackPrompt, setFallbackPrompt] = useState('')
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [selectedBlockKey, setSelectedBlockKey] = useState(FULL_PROMPT)
  const [toolQuery, setToolQuery] = useState('')
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const [reloadKey, setReloadKey] = useState(0)

  const activeSnapshot = useMemo(() => {
    if (snapshots.length === 0) return null
    return snapshots.find((snapshot) => snapshot.version === selectedVersion) ?? snapshots[0]
  }, [snapshots, selectedVersion])

  const promptBlocks = useMemo<PromptBlock[]>(() => {
    if (!activeSnapshot) return []
    const blocks: PromptBlock[] = []
    if (activeSnapshot.content) {
      blocks.push({
        key: BASE_CONTENT,
        name: t('common.systemPrompt.baseContent', 'Base content'),
        text: activeSnapshot.content,
        changed: false,
      })
    }
    for (const section of activeSnapshot.sections) {
      blocks.push({
        key: `section:${section.name}`,
        name: section.name,
        text: section.text,
        changed: activeSnapshot.version > 1 && activeSnapshot.changedSections.includes(section.name),
      })
    }
    return blocks
  }, [activeSnapshot, t])

  const toolCallCounts = useMemo(
    () => (isOpen ? countToolCalls(entries) : new Map<string, number>()),
    [entries, isOpen],
  )

  const toolRows = useMemo(
    () => buildToolUsageRows(activeSnapshot?.tools ?? [], toolCallCounts),
    [activeSnapshot, toolCallCounts],
  )

  const visibleToolRows = useMemo(
    () => filterToolUsageRows(toolRows, toolQuery),
    [toolRows, toolQuery],
  )

  const toolSummary = useMemo(() => {
    const declared = toolRows.filter((row) => row.declared).length
    const used = toolRows.filter((row) => row.calls > 0).length
    const calls = toolRows.reduce((sum, row) => sum + row.calls, 0)
    return { declared, used, calls }
  }, [toolRows])

  useEffect(() => {
    if (!isOpen) return
    setActiveTab('prompt')
    setSelectedVersion(null)
    setSelectedBlockKey(FULL_PROMPT)
    setToolQuery('')
    setExpandedTools(new Set())
  }, [isOpen, sessionPath])

  useEffect(() => {
    if (!isOpen) return

    const token = ++loadTokenRef.current
    let cancelled = false
    const isStale = () => cancelled || token !== loadTokenRef.current

    const load = async () => {
      setLoadState('loading')
      setError(null)

      if (!sessionPath) {
        try {
          const prompt = await invoke<string>('get_system_prompt')
          if (isStale()) return
          setSnapshots([])
          setFallbackPrompt(prompt ?? '')
          setLoadState('ready')
        } catch (loadError) {
          if (isStale()) return
          setSnapshots([])
          setFallbackPrompt('')
          setLoadState('error')
          setError(errorMessage(loadError))
        }
        return
      }

      try {
        const list = await invoke<SystemPromptSnapshot[]>('get_session_system_prompt_snapshots', { path: sessionPath })
        if (isStale()) return
        if (list.length > 0) {
          const ordered = newestFirst(list)
          setSnapshots(ordered)
          setFallbackPrompt('')
          setSelectedVersion(ordered[0].version)
          setLoadState('ready')
          return
        }
      } catch {
        // Older backends and demo transports may not expose snapshot replay.
        // The generated-prompt fallback below still fills the prompt tab.
      }

      try {
        const prompt = await invoke<string>('get_session_system_prompt', { path: sessionPath })
        if (isStale()) return
        setSnapshots([])
        setSelectedVersion(null)
        setFallbackPrompt(prompt ?? '')
        setLoadState('ready')
      } catch (loadError) {
        if (isStale()) return
        setSnapshots([])
        setFallbackPrompt('')
        setLoadState('error')
        setError(errorMessage(loadError))
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [isOpen, sessionPath, reloadKey])

  useEffect(() => {
    if (!isOpen) return
    if (selectedBlockKey !== FULL_PROMPT && !promptBlocks.some((block) => block.key === selectedBlockKey)) {
      setSelectedBlockKey(FULL_PROMPT)
    }
  }, [isOpen, promptBlocks, selectedBlockKey])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('.mermaid-fullscreen')) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return
    closeButtonRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  const copy = useCallback(
    (text: string) => {
      void copyText(text)
    },
    [copyText],
  )

  const toggleTool = useCallback((name: string) => {
    setExpandedTools((previous) => {
      const next = new Set(previous)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }, [])

  if (!isOpen) return null

  const fullPrompt = activeSnapshot?.prompt ?? fallbackPrompt
  const removedSections = activeSnapshot?.removedSections ?? []
  const removedTools = activeSnapshot?.toolsRemoved ?? []
  const selectedBlock = promptBlocks.find((block) => block.key === selectedBlockKey) ?? null
  const showVersionBar = loadState === 'ready' && activeSnapshot !== null

  const renderBlock = (block: PromptBlock) => (
    <section key={block.key} className="mb-6 last:mb-0">
      <div className="mb-2 flex items-center gap-2 border-b border-border/60 pb-1.5">
        <h3 className="min-w-0 truncate font-mono text-xs font-medium text-foreground" title={block.name}>
          {block.name}
        </h3>
        {block.changed && (
          <span className="shrink-0 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-300">
            {t('common.systemPrompt.changed', 'Changed')}
          </span>
        )}
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
          {formatBytes(byteLength(block.text))}
        </span>
        {block.text && (
          <button
            type="button"
            onClick={() => copy(block.text)}
            className="focus-ring shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={t('common.systemPrompt.copy', 'Copy')}
            aria-label={`${t('common.systemPrompt.copy', 'Copy')} ${block.name}`}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      {block.text ? (
        block.name === 'skills' ? (
          <SkillsContent text={block.text} />
        ) : (
          <MarkdownContent content={block.text} className="text-sm" />
        )
      ) : (
        <div className="text-xs text-muted-foreground">{t('common.systemPrompt.emptySection', 'Empty section')}</div>
      )}
    </section>
  )

  const promptPane = (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border/70 p-2 md:flex">
        <button
          type="button"
          onClick={() => setSelectedBlockKey(FULL_PROMPT)}
          aria-pressed={selectedBlockKey === FULL_PROMPT}
          className={`mb-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs ${
            selectedBlockKey === FULL_PROMPT
              ? 'bg-primary/10 font-medium text-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Terminal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{t('common.systemPrompt.fullPrompt', 'Full prompt')}</span>
          <span className="shrink-0 font-mono text-[10px]">{formatBytes(byteLength(fullPrompt))}</span>
        </button>

        {promptBlocks.map((block, index) => (
          <button
            key={block.key}
            type="button"
            onClick={() => setSelectedBlockKey(block.key)}
            aria-pressed={selectedBlockKey === block.key}
            title={block.name}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs ${
              selectedBlockKey === block.key
                ? 'bg-primary/10 font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {block.changed ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
            ) : (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-border" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 truncate font-mono">{block.name || `${index + 1}`}</span>
            <span className="shrink-0 font-mono text-[10px]">{formatBytes(byteLength(block.text))}</span>
          </button>
        ))}

        {removedSections.length > 0 && (
          <div className="mt-2 border-t border-border/60 pt-2">
            <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('common.systemPrompt.removedInVersion', 'Removed in this version')}
            </div>
            {removedSections.map((name) => (
              <div key={name} className="truncate px-2 py-1 font-mono text-[11px] text-muted-foreground line-through" title={name}>
                {name}
              </div>
            ))}
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {promptBlocks.length > 0 && (
          <div className="border-b border-border/70 p-2 md:hidden">
            <select
              value={selectedBlockKey}
              aria-label={t('common.systemPrompt.sections', 'Sections')}
              onChange={(event) => setSelectedBlockKey(event.currentTarget.value)}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary/50"
            >
              <option value={FULL_PROMPT}>{t('common.systemPrompt.fullPrompt', 'Full prompt')}</option>
              {promptBlocks.map((block) => (
                <option key={block.key} value={block.key}>
                  {block.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {loadState === 'loading' ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              {t('common.loading', 'Loading...')}
            </div>
          ) : loadState === 'error' ? (
            <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <div>{t('common.systemPrompt.loadFailed', 'Failed to load system prompt')}</div>
                  {error && <div className="mt-1 break-words font-mono text-[10px] opacity-80">{error}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => setReloadKey((key) => key + 1)}
                  className="ml-auto inline-flex shrink-0 items-center gap-1 rounded border border-red-500/30 px-2 py-1 hover:bg-red-500/10"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  {t('common.systemPrompt.retry', 'Retry')}
                </button>
              </div>
            </div>
          ) : !fullPrompt ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('common.systemPrompt.noPrompt', 'No system prompt configured')}
            </div>
          ) : (
            <>
              {!activeSnapshot && (
                <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  {t(
                    'common.systemPrompt.generatedFallback',
                    'No recorded system message. Showing the prompt generated for this session.',
                  )}
                </div>
              )}
              {activeSnapshot ? (
                selectedBlock ? (
                  renderBlock(selectedBlock)
                ) : (
                  promptBlocks.map((block) => renderBlock(block))
                )
              ) : (
                <MarkdownContent content={fallbackPrompt} className="text-sm" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )

  const toolsPane = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 border-b border-border/70 bg-muted/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{t('common.systemPrompt.toolsUsed', 'Tools Used')}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            {t('common.systemPrompt.toolsSummary', {
              declared: toolSummary.declared,
              used: toolSummary.used,
              calls: toolSummary.calls,
              defaultValue: '{{declared}} declared · {{used}} used · {{calls}} calls',
            })}
          </div>
        </div>
        <div className="relative w-full sm:w-60 sm:shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            value={toolQuery}
            onChange={(event) => setToolQuery(event.currentTarget.value)}
            aria-label={t('common.systemPrompt.searchTools', 'Filter tools')}
            placeholder={t('common.systemPrompt.searchTools', 'Filter tools')}
            className="focus-ring h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:px-6">
        {removedTools.length > 0 && (
          <div className="mb-3 rounded-md border border-border/70 bg-background/60 p-2">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('common.systemPrompt.removedInVersion', 'Removed in this version')}
            </div>
            <div className="flex flex-wrap gap-1">
              {removedTools.map((name) => (
                <span key={name} className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground line-through">
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {visibleToolRows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {toolQuery
              ? t('common.systemPrompt.noMatchingTools', 'No tools match this filter')
              : t('common.systemPrompt.noToolsUsed', 'No tools used in this session')}
          </div>
        ) : (
          <div className="grid gap-2.5">
            {visibleToolRows.map((row) => {
              const expanded = expandedTools.has(row.name)
              const expandable = Boolean(row.description || row.parameters != null)
              const addedThisVersion = (activeSnapshot?.version ?? 0) > 1 && (activeSnapshot?.toolsAdded.includes(row.name) ?? false)

              return (
                <div key={row.name} className={`overflow-hidden rounded-lg border bg-background ${expanded ? 'border-primary/40' : 'border-border/70'}`}>
                  <button
                    type="button"
                    onClick={expandable ? () => toggleTool(row.name) : undefined}
                    disabled={!expandable}
                    aria-expanded={expandable ? expanded : undefined}
                    className={`focus-ring flex w-full items-start gap-3 px-3 py-3 text-left sm:px-4 ${expandable ? 'hover:bg-muted/40' : 'cursor-default'}`}
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden="true">
                      <Wrench className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="break-all font-mono text-xs font-semibold text-foreground">{row.name}</span>
                        {!row.declared && (
                          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                            {t('common.systemPrompt.notDeclared', 'Not declared')}
                          </span>
                        )}
                        {addedThisVersion && (
                          <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-700 dark:text-sky-300">
                            {t('common.systemPrompt.addedInVersion', 'Added in this version')}
                          </span>
                        )}
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {row.calls > 0
                            ? t('common.systemPrompt.callsCount', {
                                count: row.calls,
                                defaultValue: '{{count}} calls',
                              })
                            : t('common.systemPrompt.unused', 'Unused')}
                        </span>
                      </span>
                      {row.description && (
                        <span className={`mt-1 block text-xs text-muted-foreground ${expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                          {row.description}
                        </span>
                      )}
                      {!row.description && row.declared && (
                        <span className="mt-1 block text-xs italic text-muted-foreground">
                          {t('common.systemPrompt.noDescription', 'No description')}
                        </span>
                      )}
                    </span>
                    {expandable && (
                      <span className="mt-1 shrink-0 text-muted-foreground" aria-hidden="true">
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </span>
                    )}
                  </button>

                  {expanded && row.parameters != null && (
                    <div className="border-t border-border/70 bg-muted/20 px-3 py-3 sm:px-4">
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {t('common.systemPrompt.parameters', 'Parameters')}
                      </div>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-[10px] leading-4 text-foreground">
                        {JSON.stringify(row.parameters, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  const dialog = (
    <div
      className="motion-overlay-enter fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="motion-overlay-surface-enter flex h-[88vh] max-h-[880px] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Bot className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 id={titleId} className="truncate text-sm font-medium text-foreground">
              {t('common.systemPrompt.title', 'System prompt & tools')}
            </h2>
          </div>

          <div role="tablist" aria-label={t('common.systemPrompt.title', 'System prompt & tools')} className="ml-auto flex overflow-hidden rounded-md border border-border">
            <button
              type="button"
              role="tab"
              id={PROMPT_TAB_ID}
              aria-selected={activeTab === 'prompt'}
              aria-controls="system-prompt-panel"
              onClick={() => setActiveTab('prompt')}
              className={`focus-ring flex items-center gap-2 border-r border-border px-3 py-1.5 text-xs font-medium ${
                activeTab === 'prompt'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
              {t('common.systemPrompt.systemPrompt', 'System Prompt')}
            </button>
            <button
              type="button"
              role="tab"
              id={TOOLS_TAB_ID}
              aria-selected={activeTab === 'tools'}
              aria-controls="system-tools-panel"
              onClick={() => setActiveTab('tools')}
              className={`focus-ring flex items-center gap-2 px-3 py-1.5 text-xs font-medium ${
                activeTab === 'tools'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
              {t('common.systemPrompt.toolsUsed', 'Tools Used')}
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${activeTab === 'tools' ? 'bg-foreground/10' : 'bg-muted'}`}>
                {toolRows.length}
              </span>
            </button>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="focus-ring rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('common.close', 'Close')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {showVersionBar && activeSnapshot && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2 text-xs">
            <span className="text-muted-foreground">{t('common.systemPrompt.version', 'Version')}</span>
            {snapshots.length > 1 ? (
              <select
                value={activeSnapshot.version}
                aria-label={t('common.systemPrompt.version', 'Version')}
                onChange={(event) => {
                  setSelectedVersion(Number(event.currentTarget.value))
                  setSelectedBlockKey(FULL_PROMPT)
                }}
                className="h-7 rounded-md border border-border bg-background px-2 font-mono text-[11px] text-foreground outline-none focus:border-primary/50"
              >
                {snapshots.map((snapshot) => (
                  <option key={`${snapshot.id}-${snapshot.version}`} value={snapshot.version}>
                    v{snapshot.version} · {formatDate(snapshot.timestamp)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-mono text-[11px] text-muted-foreground">
                v{activeSnapshot.version} · {formatDate(activeSnapshot.timestamp)}
              </span>
            )}
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              {formatBytes(byteLength(activeSnapshot.prompt))} ·{' '}
              {t('common.systemPrompt.sectionCount', {
                count: promptBlocks.length,
                defaultValue: '{{count}} sections',
              })}
            </span>
            <button
              type="button"
              onClick={() => copy(activeSnapshot.prompt)}
              className="focus-ring rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title={t('common.systemPrompt.copy', 'Copy')}
              aria-label={`${t('common.systemPrompt.copy', 'Copy')} ${t('common.systemPrompt.fullPrompt', 'Full prompt')}`}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {activeTab === 'prompt' ? (
          <div role="tabpanel" id="system-prompt-panel" aria-labelledby={PROMPT_TAB_ID} className="flex min-h-0 flex-1 flex-col">
            {promptPane}
          </div>
        ) : (
          <div role="tabpanel" id="system-tools-panel" aria-labelledby={TOOLS_TAB_ID} className="flex min-h-0 flex-1 flex-col">
            {toolsPane}
          </div>
        )}
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(dialog, document.body)
}

export default SystemPromptDialog
