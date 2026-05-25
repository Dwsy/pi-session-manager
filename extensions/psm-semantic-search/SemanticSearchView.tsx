import { hostReact } from './host-react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import type { PsmAppViewRenderProps, PsmPluginHostContext } from '@pi-session-manager/plugin-sdk'
import type { AppPluginSurfaceData } from '@/components/app/AppPluginSurfaceData'
import {
  runSemanticSearchAgent,
  type SemanticSearchAgentResponse,
  type SemanticSearchAgentSuccess,
  type SemanticSearchToolResult,
} from './agentSearch'

const SEMANTIC_SEARCH_VIEW_ID = 'builtin.semantic-search.view'

interface SemanticSearchViewProps extends PsmAppViewRenderProps<AppPluginSurfaceData> {
  ctx: PsmPluginHostContext
}

const SESSION_PATH_PATTERN = /(?:^|[\s(["'])(\/[^\s"'`<>)\]]+\.jsonl)/g

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function collectSessionPaths(value: unknown, paths: Set<string>, depth = 0) {
  if (depth > 5 || !value) return
  if (typeof value === 'string') {
    let match: RegExpExecArray | null
    SESSION_PATH_PATTERN.lastIndex = 0
    while ((match = SESSION_PATH_PATTERN.exec(value)) !== null) {
      paths.add(match[1])
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectSessionPaths(item, paths, depth + 1)
    return
  }
  if (!isRecord(value)) return

  for (const [key, nested] of Object.entries(value)) {
    if ((key === 'session_path' || key === 'sessionPath' || key === 'path') && optionalString(nested)?.endsWith('.jsonl')) {
      paths.add(String(nested))
      continue
    }
    collectSessionPaths(nested, paths, depth + 1)
  }
}

function sessionPathsFromResult(result: SemanticSearchAgentSuccess) {
  const paths = new Set<string>()
  collectSessionPaths(result.answer, paths)
  collectSessionPaths(result.toolResults, paths)
  return Array.from(paths).slice(0, 8)
}

function toolResultSummary(entry: SemanticSearchToolResult) {
  if (entry.error) return String(entry.error)
  if (entry.message) return String(entry.message)
  if (isRecord(entry.result)) {
    if (typeof entry.result.total_hits === 'number') return `${entry.result.total_hits} hits`
    if (Array.isArray(entry.result.hits)) return `${entry.result.hits.length} hits`
  }
  return entry.ok === false || entry.isError ? 'failed' : 'ok'
}

function modelLabel(model: unknown) {
  if (typeof model === 'string') return model
  if (isRecord(model)) {
    const provider = optionalString(model.provider)
    const id = optionalString(model.id)
    if (provider && id) return `${provider}/${id}`
    return provider ?? id ?? 'host model'
  }
  return 'host model'
}

export function SemanticSearchView({ data, ctx }: SemanticSearchViewProps) {
  const React = hostReact()
  const { useCallback, useEffect, useMemo, useRef, useState } = React

  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'project' | 'global'>(
    (ctx.settings.get('defaultScope', 'project') as string) === 'global' ? 'global' : 'project'
  )
  const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'assistant'>('all')
  const [timeRange, setTimeRange] = useState<'any' | '24h' | '7d' | '30d'>('any')
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [result, setResult] = useState<SemanticSearchAgentResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const maxResults = Number(ctx.settings.get('maxResults', 20))
  const currentProjectPath = data?.selectedSession?.cwd ?? null

  const t = useCallback((key: string, fallback: string) => {
    return ctx.i18n.t(`plugins.semanticSearch.${key}`, fallback)
  }, [ctx.i18n])

  const canSearch = query.trim().length > 0 && !searching
  const successfulResult = result?.success ? result : null
  const sessionPaths = useMemo(
    () => successfulResult ? sessionPathsFromResult(successfulResult) : [],
    [successfulResult],
  )

  const handleSearch = useCallback(async () => {
    const nextQuery = query.trim()
    if (!nextQuery) {
      setResult(null)
      setError(null)
      setHasSearched(false)
      return
    }

    setSearching(true)
    setHasSearched(true)
    setError(null)
    try {
      const response = await runSemanticSearchAgent(ctx, {
        query: nextQuery,
        scope,
        roleFilter,
        timeRange,
        maxResults,
        cwd: scope === 'project' ? currentProjectPath ?? undefined : undefined,
      })
      setResult(response)
      if (!response.success) setError(response.message)
    } catch (searchError) {
      setResult(null)
      setError(searchError instanceof Error ? searchError.message : String(searchError))
    } finally {
      setSearching(false)
    }
  }, [ctx, currentProjectPath, maxResults, query, roleFilter, scope, timeRange])

  const handleInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value)
  }, [])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void handleSearch()
      return
    }
    if (event.key === 'Escape') {
      setQuery('')
      setResult(null)
      setError(null)
      setHasSearched(false)
    }
  }, [handleSearch])

  const openSessionPath = useCallback((path: string) => {
    ctx.psm.sessions.open(path)
  }, [ctx])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return React.createElement('div', { className: 'flex h-full min-h-0 flex-col overflow-hidden bg-background' },
    React.createElement('div', { className: 'shrink-0 border-b border-border/60 bg-surface/20 px-4 py-3 select-none' },
      React.createElement('div', { className: 'mb-3 flex items-center justify-between gap-3' },
        React.createElement('div', { className: 'min-w-0' },
          React.createElement('div', { className: 'flex items-center gap-2 text-xs font-medium text-muted-foreground' },
            React.createElement('svg', { className: 'h-4 w-4', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
              React.createElement('circle', { cx: '11', cy: '11', r: '8' }),
              React.createElement('path', { d: 'm21 21-4.3-4.3' }),
            ),
            React.createElement('span', {}, t('title', 'Semantic Search')),
          ),
          React.createElement('div', { className: 'mt-1 truncate text-sm text-muted-foreground' },
            scope === 'project' && currentProjectPath ? currentProjectPath : t('scopeGlobal', 'All Projects'),
          ),
        ),
        successfulResult && React.createElement('div', { className: 'shrink-0 text-right text-[11px] text-muted-foreground' },
          React.createElement('div', { className: 'font-mono text-sm text-foreground' }, successfulResult.toolResults.length),
          React.createElement('div', {}, 'tools'),
        ),
      ),
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('div', { className: 'relative min-w-0 flex-1' },
          React.createElement('input', {
            ref: inputRef,
            type: 'text',
            value: query,
            onChange: handleInputChange,
            onKeyDown: handleKeyDown,
            placeholder: t('searchPlaceholder', 'Search sessions by meaning...'),
            spellCheck: false,
            className: 'h-9 w-full rounded-md border border-border/60 bg-background/80 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-info focus:ring-1 focus:ring-info/30',
          }),
          React.createElement('svg', { className: 'absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
            React.createElement('circle', { cx: '11', cy: '11', r: '8' }),
            React.createElement('path', { d: 'm21 21-4.3-4.3' }),
          ),
        ),
        React.createElement('button', {
          type: 'button',
          onClick: () => void handleSearch(),
          disabled: !canSearch,
          className: 'h-9 rounded-md border border-border/70 bg-surface px-3 text-sm font-medium text-foreground motion-press hover:bg-surface-hover disabled:opacity-50',
        }, searching ? t('searching', 'Searching...') : t('search', 'Search')),
      ),
      React.createElement('div', { className: 'mt-2 flex flex-wrap items-center gap-2 text-xs' },
        React.createElement('div', { className: 'inline-flex rounded-md border border-border/60 bg-background/50 p-0.5' },
          React.createElement('button', {
            type: 'button',
            onClick: () => setScope('project'),
            className: `rounded px-2 py-1 motion-press ${scope === 'project' ? 'bg-info/15 text-info' : 'text-muted-foreground hover:text-foreground'}`,
          }, t('scopeProject', 'This Project')),
          React.createElement('button', {
            type: 'button',
            onClick: () => setScope('global'),
            className: `rounded px-2 py-1 motion-press ${scope === 'global' ? 'bg-info/15 text-info' : 'text-muted-foreground hover:text-foreground'}`,
          }, t('scopeGlobal', 'All Projects')),
        ),
        React.createElement('select', {
          value: roleFilter,
          onChange: (event: ChangeEvent<HTMLSelectElement>) => setRoleFilter(event.target.value as typeof roleFilter),
          className: 'h-7 rounded-md border border-border/60 bg-background/50 px-2 text-xs text-foreground outline-none focus:border-info',
        },
          React.createElement('option', { value: 'all' }, t('roleAll', 'All Roles')),
          React.createElement('option', { value: 'user' }, t('roleUser', 'User')),
          React.createElement('option', { value: 'assistant' }, t('roleAssistant', 'Assistant')),
        ),
        React.createElement('select', {
          value: timeRange,
          onChange: (event: ChangeEvent<HTMLSelectElement>) => setTimeRange(event.target.value as typeof timeRange),
          className: 'h-7 rounded-md border border-border/60 bg-background/50 px-2 text-xs text-foreground outline-none focus:border-info',
        },
          React.createElement('option', { value: 'any' }, t('timeAny', 'Any Time')),
          React.createElement('option', { value: '24h' }, t('time24h', 'Last 24h')),
          React.createElement('option', { value: '7d' }, t('time7d', 'Last 7d')),
          React.createElement('option', { value: '30d' }, t('time30d', 'Last 30d')),
        ),
      ),
    ),
    React.createElement('div', { className: 'min-h-0 flex-1 overflow-auto px-4 py-3' },
      !hasSearched && React.createElement('div', { className: 'flex h-full flex-col items-center justify-center text-muted-foreground/70 select-none' },
        React.createElement('svg', { className: 'mb-3 h-12 w-12 opacity-30', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
          React.createElement('circle', { cx: '11', cy: '11', r: '8' }),
          React.createElement('path', { d: 'm21 21-4.3-4.3' }),
        ),
        React.createElement('p', { className: 'text-sm' }, t('searchPlaceholder', 'Search sessions by meaning...')),
      ),
      hasSearched && searching && React.createElement('div', { className: 'flex h-full items-center justify-center gap-2 text-sm text-muted-foreground select-none' },
        React.createElement('svg', { className: 'h-4 w-4 animate-spin', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', 'aria-hidden': true },
          React.createElement('path', { d: 'M21 12a9 9 0 1 1-6.219-8.56' }),
        ),
        React.createElement('span', {}, t('searching', 'Searching...')),
      ),
      hasSearched && !searching && error && React.createElement('div', { className: 'rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400' }, error),
      hasSearched && !searching && successfulResult && React.createElement('div', { className: 'space-y-3' },
        React.createElement('div', { className: 'rounded-lg border border-border/70 bg-surface/20 p-3' },
          React.createElement('div', { className: 'mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground select-none' },
            React.createElement('span', {}, modelLabel(successfulResult.model)),
            React.createElement('span', { className: 'font-mono' }, successfulResult.sessionId),
          ),
          React.createElement('div', { className: 'whitespace-pre-wrap text-sm leading-6 text-foreground' }, successfulResult.answer || t('noResults', 'No results found')),
        ),
        sessionPaths.length > 0 && React.createElement('div', { className: 'rounded-lg border border-border/70 bg-surface/20 p-3' },
          React.createElement('div', { className: 'mb-2 text-xs font-medium text-muted-foreground select-none' }, 'Sessions'),
          React.createElement('div', { className: 'flex flex-wrap gap-1.5' },
            sessionPaths.map((path) => React.createElement('button', {
              key: path,
              type: 'button',
              onClick: () => openSessionPath(path),
              className: 'max-w-full truncate rounded-md border border-border/70 bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground hover:bg-surface-hover motion-press',
              title: path,
            }, path)),
          ),
        ),
        successfulResult.toolResults.length > 0 && React.createElement('div', { className: 'rounded-lg border border-border/70 bg-surface/20 p-2.5' },
          React.createElement('div', { className: 'mb-2 text-xs font-medium text-muted-foreground select-none' }, 'Tool Trace'),
          React.createElement('div', { className: 'space-y-1' },
            successfulResult.toolResults.map((entry, index) => React.createElement('div', {
              key: `${entry.tool ?? 'tool'}-${index}`,
              className: 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-1.5 text-xs hover:bg-surface/60',
            },
              React.createElement('span', { className: 'truncate font-mono text-foreground' }, entry.tool ?? 'tool'),
              React.createElement('span', { className: entry.ok === false || entry.isError ? 'text-red-400' : 'text-muted-foreground' }, toolResultSummary(entry)),
            )),
          ),
        ),
      ),
    ),
  )
}

export { SEMANTIC_SEARCH_VIEW_ID }
