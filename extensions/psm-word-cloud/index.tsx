import { hostReact } from './host-react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type {
  PsmAppSidebarViewRenderProps,
  PsmAppViewRenderProps,
  PsmJsonConfigClient,
  PsmPluginCommandContext,
  PsmPluginHostContext,
  PsmPluginManifest,
} from '@pi-session-manager/plugin-sdk'

import type { AppPluginSurfaceData } from '@/components/app/AppPluginSurfaceData'
import type { SessionInfo } from '@/types'

const React = hostReact()
const { Component, createElement, createRef } = React

const WORD_CLOUD_VIEW_ID = 'builtin.word-cloud.view'
const WORD_CLOUD_SIDEBAR_ID = 'builtin.word-cloud.sidebar'
const HIDDEN_WORDS_CONFIG_KEY = 'hiddenWords'

type WordCloudScope = { type: 'global' } | { type: 'project'; projectPath: string }
type ScopeListener = () => void

let activeScope: WordCloudScope = { type: 'global' }
const scopeListeners = new Set<ScopeListener>()

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.word-cloud',
  name: 'User Message Word Cloud',
  version: '0.1.0',
  permissions: ['config:read', 'config:write'],
  configuration: {
    title: 'Word Cloud Settings',
    properties: [
      { key: 'minWordLength', title: 'Minimum word length', type: 'number', default: 3, min: 1, max: 12 },
      { key: 'maxWords', title: 'Maximum words', type: 'number', default: 50, min: 10, max: 200 },
    ],
  },
}

function scopesEqual(a: WordCloudScope, b: WordCloudScope) {
  return a.type === b.type && (a.type === 'global' || (b.type === 'project' && a.projectPath === b.projectPath))
}

function setActiveScope(scope: WordCloudScope) {
  if (scopesEqual(activeScope, scope)) return
  activeScope = scope
  for (const listener of scopeListeners) listener()
}

function subscribeScope(listener: ScopeListener) {
  scopeListeners.add(listener)
  return () => scopeListeners.delete(listener)
}

function openWordCloud(context?: PsmPluginCommandContext) {
  context?.navigate?.openAppView?.(WORD_CLOUD_VIEW_ID)
}

function getProjectFromContext(context?: PsmPluginCommandContext) {
  return context?.selectedProject ?? context?.selectedSession?.cwd ?? null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAppData(value: unknown): value is AppPluginSurfaceData {
  return isObject(value) && Array.isArray(value.sessions)
}

function getSessions(data: unknown): SessionInfo[] {
  return isAppData(data) ? data.sessions : []
}

function sessionMatchesScope(session: SessionInfo, scope: WordCloudScope) {
  if (scope.type === 'global') return true
  return session.cwd === scope.projectPath || session.path.startsWith(`${scope.projectPath}/`)
}

function userPreviewTextFromSession(session: SessionInfo) {
  const texts = [session.user_messages_text, session.first_message]
  if (session.last_message_role?.toLowerCase() === 'user' && session.last_message !== session.first_message) {
    texts.push(session.last_message)
  }
  return texts.filter(Boolean).join('\n')
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'have', 'will', 'can', 'are',
  'you', 'was', 'what', 'when', 'where', 'how', 'why', 'into', 'about', 'please', 'there',
  'just', 'make', 'need', 'use', 'using', 'fix', 'code', 'file', 'files', 'line', 'lines',
  '可以', '这个', '那个', '我们', '你们', '他们', '然后', '一个', '一下', '需要', '什么',
])

function CloudIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 18.5h9.2a4.3 4.3 0 0 0 .5-8.6 5.7 5.7 0 0 0-10.8 1.6A3.8 3.8 0 0 0 7.5 18.5Z" />
    </svg>
  )
}

function BarChartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 19.5h15" />
      <path d="M7.5 19.5V11" />
      <path d="M12 19.5V7.5" />
      <path d="M16.5 19.5v-5.5" />
    </svg>
  )
}

function normalizeWord(value: string) {
  return value.trim().toLowerCase()
}

function normalizeHiddenWords(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map(normalizeWord)
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b))
}

function tokenize(text: string, minWordLength: number, hiddenWords = new Set<string>()) {
  const words = text.toLowerCase().match(/[a-z][a-z0-9_-]+|[\u4e00-\u9fff]{2,}/g) ?? []
  return words.filter((word) => word.length >= minWordLength && !STOPWORDS.has(word) && !hiddenWords.has(word))
}

interface WordStat {
  word: string
  count: number
}

export interface WordCloudLayoutItem extends WordStat {
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  colorIndex: number
}

interface WordCloudStats {
  words: WordStat[]
  scopedSessions: number
}

type WordSortMode = 'count' | 'alpha'

type ProjectSortMode = 'recent' | 'sessions' | 'messages' | 'name'

function rectsOverlap(a: WordCloudLayoutItem, b: WordCloudLayoutItem) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function layoutWordCloudWords(
  words: WordStat[],
  width: number,
  height: number,
  measureText: (text: string, fontSize: number) => number,
): WordCloudLayoutItem[] {
  if (width <= 0 || height <= 0 || words.length === 0) return []

  const maxCount = words[0]?.count ?? 1
  const minCount = words[words.length - 1]?.count ?? maxCount
  const countRange = Math.max(1, maxCount - minCount)
  const minDimension = Math.min(width, height)
  const density = Math.max(0, Math.min(1, (words.length - 12) / 38))
  const sparseMaxFontSize = Math.max(96, Math.min(168, minDimension / 2.7))
  const denseMaxFontSize = Math.max(32, Math.min(48, minDimension / 10))
  const sparseMinFontSize = Math.max(15, Math.min(22, minDimension / 20))
  const denseMinFontSize = Math.max(9, Math.min(12, minDimension / 38))
  const maxFontSize = Math.round(sparseMaxFontSize * (1 - density) + denseMaxFontSize * density)
  const minFontSize = Math.round(sparseMinFontSize * (1 - density) + denseMinFontSize * density)
  const centerX = width / 2
  const centerY = height / 2
  const placed: WordCloudLayoutItem[] = []

  words.forEach((item, index) => {
    const frequencyWeight = Math.pow((item.count - minCount) / countRange, 0.38)
    const rankWeight = words.length > 1 ? Math.pow(1 - index / (words.length - 1), 1.15) : 1
    const weight = Math.max(0, Math.min(1, frequencyWeight * 0.64 + rankWeight * 0.36))
    const baseFontSize = Math.round(minFontSize + (maxFontSize - minFontSize) * weight)

    for (const scale of [1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44, 0.36]) {
      const fontSize = Math.max(10, Math.round(baseFontSize * scale))
      const textWidth = measureText(item.word, fontSize)
      const box: Omit<WordCloudLayoutItem, 'x' | 'y'> = {
        ...item,
        width: textWidth + Math.max(8, Math.round(fontSize * 0.32)),
        height: Math.ceil(fontSize * 1.12) + 6,
        fontSize,
        colorIndex: index,
      }

      let didPlace = false
      for (let step = 0; step < 7200; step += 1) {
        const angle = step * 0.36
        const radius = 5.8 * Math.sqrt(step)
        const x = centerX + Math.cos(angle) * radius - box.width / 2
        const y = centerY + Math.sin(angle) * radius * 0.76 - box.height / 2
        const candidate = { ...box, x, y }
        const inside = x >= 4 && y >= 4 && x + box.width <= width - 4 && y + box.height <= height - 4
        if (inside && placed.every((existing) => !rectsOverlap(candidate, existing))) {
          placed.push(candidate)
          didPlace = true
          break
        }
      }
      if (didPlace) break
    }
  })

  return placed
}

function computeWordStats(
  sessions: SessionInfo[],
  scope: WordCloudScope,
  minWordLength: number,
  maxWords: number,
  hiddenWords = new Set<string>(),
): WordCloudStats {
  const counts = new Map<string, number>()
  const scopedSessions = sessions.filter((session) => sessionMatchesScope(session, scope))

  for (const session of scopedSessions) {
    for (const word of tokenize(userPreviewTextFromSession(session), minWordLength, hiddenWords)) {
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }

  const words = Array.from(counts.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, maxWords)

  return {
    words,
    scopedSessions: scopedSessions.length,
  }
}

function cssRgb(styles: CSSStyleDeclaration, name: string, fallback: string) {
  const value = styles.getPropertyValue(name).trim()
  return value ? `rgb(${value})` : fallback
}

function fillRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
  context.fill()
}

interface WordCloudCanvasProps {
  words: WordStat[]
  onWordClick?(word: WordStat): void
}

type WordCloudDimension = { x: number; y: number; w: number; h: number }

interface WordCloudCanvasState {
  width: number
  height: number
  layout: WordCloudLayoutItem[]
  hoveredWord: string | null
  hoveredDimension: WordCloudDimension | null
}

class WordCloudCanvas extends Component<WordCloudCanvasProps, WordCloudCanvasState> {
  private containerRef = createRef<HTMLDivElement>()
  private baseCanvasRef = createRef<HTMLCanvasElement>()
  private overlayCanvasRef = createRef<HTMLCanvasElement>()
  private resizeObserver: ResizeObserver | null = null

  state: WordCloudCanvasState = {
    width: 0,
    height: 0,
    layout: [],
    hoveredWord: null,
    hoveredDimension: null,
  }

  componentDidMount() {
    this.updateSize()
    void this.drawWordCloud()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', this.updateSize)
      return
    }
    const container = this.containerRef.current
    if (!container) return
    this.resizeObserver = new ResizeObserver(this.updateSize)
    this.resizeObserver.observe(container)
  }

  componentDidUpdate(prevProps: WordCloudCanvasProps, prevState: WordCloudCanvasState) {
    if (prevState.width !== this.state.width || prevState.height !== this.state.height || prevProps.words !== this.props.words) {
      void this.drawWordCloud()
    }
    if (
      prevState.width !== this.state.width ||
      prevState.height !== this.state.height ||
      prevState.hoveredWord !== this.state.hoveredWord ||
      prevState.hoveredDimension !== this.state.hoveredDimension
    ) {
      this.drawOverlay()
    }
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.updateSize)
    this.resizeObserver?.disconnect()
  }

  private updateSize = () => {
    const container = this.containerRef.current
    if (!container) return
    const next = {
      width: Math.max(320, Math.round(container.clientWidth)),
      height: Math.max(320, Math.round(container.clientHeight)),
    }
    if (next.width !== this.state.width || next.height !== this.state.height) {
      this.setState(next)
    } else {
      void this.drawWordCloud()
      this.drawOverlay()
    }
  }

  private syncCanvasSize(canvas: HTMLCanvasElement, width: number, height: number) {
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.floor(width * ratio)
    canvas.height = Math.floor(height * ratio)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    let context: CanvasRenderingContext2D | null = null
    try {
      context = canvas.getContext('2d')
    } catch {
      return null
    }
    if (context) context.setTransform(ratio, 0, 0, ratio, 0, 0)
    return context
  }

  private canvasFont(fontSize: number) {
    const container = this.containerRef.current
    const styles = container ? getComputedStyle(container) : null
    const fontFamily = styles?.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
    return `600 ${fontSize}px ${fontFamily}`
  }

  private wordColor(styles: CSSStyleDeclaration, item: WordCloudLayoutItem) {
    if (item.colorIndex === 0) return cssRgb(styles, '--color-info', '#3b82f6')
    if (item.colorIndex < 5) return cssRgb(styles, '--color-foreground', '#111827')
    if (item.colorIndex < 14) return cssRgb(styles, '--color-purple', '#8b5cf6')
    return cssRgb(styles, '--color-muted-foreground', '#6b7280')
  }

  private drawWordCloud() {
    const canvas = this.baseCanvasRef.current
    const { width, height } = this.state
    if (!canvas || width <= 0 || height <= 0) return
    const context = this.syncCanvasSize(canvas, width, height)
    if (!context) return

    context.clearRect(0, 0, width, height)

    const layout = layoutWordCloudWords(this.props.words, width, height, (text, fontSize) => {
      context.font = this.canvasFont(fontSize)
      return context.measureText(text).width
    })
    const styles = getComputedStyle(canvas)

    for (const item of layout) {
      context.save()
      context.font = this.canvasFont(item.fontSize)
      context.textBaseline = 'top'
      context.fillStyle = this.wordColor(styles, item)
      context.globalAlpha = item.colorIndex === 0 ? 1 : Math.max(0.72, 1 - item.colorIndex * 0.006)
      context.fillText(item.word, item.x + 9, item.y + 5)
      context.restore()
    }

    this.setState({ layout }, () => this.drawOverlay())
  }

  private drawOverlay() {
    const canvas = this.overlayCanvasRef.current
    const { width, height, hoveredDimension, hoveredWord } = this.state
    if (!canvas || width <= 0 || height <= 0) return
    const context = this.syncCanvasSize(canvas, width, height)
    if (!context) return

    context.clearRect(0, 0, width, height)
    if (!hoveredDimension || !hoveredWord) return

    const x = hoveredDimension.x - 8
    const y = hoveredDimension.y - 6
    const w = hoveredDimension.w + 16
    const h = hoveredDimension.h + 12

    context.save()
    context.fillStyle = 'rgba(86, 156, 214, 0.10)'
    context.strokeStyle = 'rgba(86, 156, 214, 0.7)'
    context.lineWidth = 1.5
    fillRoundedRect(context, x, y, w, h, 12)
    context.stroke()
    context.fillStyle = 'rgba(86, 156, 214, 0.08)'
    context.fill()
    context.restore()
  }

  private getWordAt(event: ReactMouseEvent<HTMLCanvasElement>) {
    const canvas = this.baseCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    for (let index = this.state.layout.length - 1; index >= 0; index -= 1) {
      const item = this.state.layout[index]
      if (x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height) {
        return item
      }
    }
    return null
  }

  private handleMouseMove = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const item = this.getWordAt(event)
    if (!item) {
      if (this.state.hoveredWord) this.setState({ hoveredWord: null, hoveredDimension: null })
      return
    }
    if (item.word === this.state.hoveredWord) return
    this.setState({
      hoveredWord: item.word,
      hoveredDimension: { x: item.x, y: item.y, w: item.width, h: item.height },
    })
  }

  private handleMouseLeave = () => {
    this.setState({ hoveredWord: null, hoveredDimension: null })
  }

  private handleClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const item = this.getWordAt(event)
    if (item) this.props.onWordClick?.({ word: item.word, count: item.count })
  }

  render() {
    return (
      <div ref={this.containerRef} className="relative h-full min-h-[320px] select-none overflow-hidden rounded-lg border border-border/70 bg-surface/20">
        <canvas
          ref={this.baseCanvasRef}
          className="block h-full w-full"
          aria-label="Word cloud canvas"
          onMouseMove={this.handleMouseMove}
          onMouseLeave={this.handleMouseLeave}
          onClick={this.handleClick}
        />
        <canvas ref={this.overlayCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
      </div>
    )
  }
}

interface WordCloudViewExtraProps {
  minWordLength: number
  maxWords: number
  configClient: PsmJsonConfigClient
}

type WordCloudAppViewProps = PsmAppViewRenderProps<AppPluginSurfaceData> & WordCloudViewExtraProps

interface WordCloudAppViewState {
  scope: WordCloudScope
  hiddenWords: string[]
  selectedWord: WordStat | null
  savingHiddenWords: boolean
  configError: string | null
  wordSearch: string
  wordSort: WordSortMode
  stats: WordCloudStats | null
  refreshedAt: number
}

class WordCloudAppView extends Component<WordCloudAppViewProps, WordCloudAppViewState> {
  private unsubscribeScope: (() => void) | null = null
  private visibleWordsCache: { source: WordStat[]; search: string; sort: WordSortMode; words: WordStat[] } | null = null

  state: WordCloudAppViewState = {
    scope: activeScope,
    hiddenWords: [],
    selectedWord: null,
    savingHiddenWords: false,
    configError: null,
    wordSearch: '',
    wordSort: 'count',
    stats: null,
    refreshedAt: 0,
  }

  componentDidMount() {
    this.unsubscribeScope = subscribeScope(() => this.setState({ scope: activeScope }, () => this.refreshStats()))
    this.refreshStats()
    void this.loadHiddenWords()
  }

  componentDidUpdate(prevProps: WordCloudAppViewProps, prevState: WordCloudAppViewState) {
    const prevSessionCount = getSessions(prevProps.data).length
    const nextSessionCount = getSessions(this.props.data).length
    const shouldRefresh =
      prevProps.minWordLength !== this.props.minWordLength ||
      prevProps.maxWords !== this.props.maxWords ||
      !scopesEqual(prevState.scope, this.state.scope) ||
      prevState.hiddenWords !== this.state.hiddenWords ||
      (prevSessionCount === 0 && nextSessionCount > 0 && (prevState.stats?.scopedSessions ?? 0) === 0)

    if (shouldRefresh) this.refreshStats()
  }

  componentWillUnmount() {
    this.unsubscribeScope?.()
  }

  private refreshStats = () => {
    const { data, minWordLength, maxWords } = this.props
    const { scope, hiddenWords } = this.state
    const sessions = getSessions(data)
    const stats = computeWordStats(sessions, scope, minWordLength, maxWords, new Set(hiddenWords))
    this.visibleWordsCache = null
    this.setState({ stats, refreshedAt: Date.now() })
  }

  private getVisibleWords(words: WordStat[], search: string, sort: WordSortMode) {
    const normalizedSearch = search.trim().toLowerCase()
    const cached = this.visibleWordsCache
    if (cached && cached.source === words && cached.search === normalizedSearch && cached.sort === sort) return cached.words

    const visibleWords = (normalizedSearch
      ? words.filter((item) => item.word.includes(normalizedSearch))
      : words
    ).slice().sort((a, b) => {
      if (sort === 'alpha') return a.word.localeCompare(b.word) || b.count - a.count
      return b.count - a.count || a.word.localeCompare(b.word)
    })

    this.visibleWordsCache = { source: words, search: normalizedSearch, sort, words: visibleWords }
    return visibleWords
  }

  private async loadHiddenWords() {
    try {
      const value = await this.props.configClient.read(HIDDEN_WORDS_CONFIG_KEY, { defaultValue: [] })
      this.setState({ hiddenWords: normalizeHiddenWords(value), configError: null })
    } catch (error) {
      this.setState({ configError: error instanceof Error ? error.message : String(error) })
    }
  }

  private async saveHiddenWords(nextHiddenWords: string[]) {
    const normalized = normalizeHiddenWords(nextHiddenWords)
    this.setState({ hiddenWords: normalized, savingHiddenWords: true, configError: null })
    try {
      await this.props.configClient.write(HIDDEN_WORDS_CONFIG_KEY, normalized)
    } catch (error) {
      this.setState({ configError: error instanceof Error ? error.message : String(error) })
    } finally {
      this.setState({ savingHiddenWords: false })
    }
  }

  private openWordManager = (word: WordStat) => {
    this.setState({ selectedWord: word })
  }

  private closeWordManager = () => {
    this.setState({ selectedWord: null })
  }

  private hideSelectedWord = () => {
    const selected = this.state.selectedWord
    if (!selected) return
    void this.saveHiddenWords([...this.state.hiddenWords, selected.word])
    this.setState({ selectedWord: null })
  }

  private showHiddenWord = (word: string) => {
    void this.saveHiddenWords(this.state.hiddenWords.filter((item) => item !== word))
  }

  render() {
    const { scope, hiddenWords, selectedWord, savingHiddenWords, configError, wordSearch, wordSort, stats } = this.state
    const hiddenWordSet = new Set(hiddenWords)
    const words = stats?.words ?? []
    const visibleWords = this.getVisibleWords(words, wordSearch, wordSort)
    const maxCount = visibleWords[0]?.count ?? 1
    const title = scope.type === 'global' ? 'Global Word Cloud' : 'Project Word Cloud'
    const subtitle = scope.type === 'global' ? 'All projects' : scope.projectPath
    const sampledLabel = `${stats?.scopedSessions ?? 0} sessions`

    return (
      <div className="flex h-full min-h-0 flex-col bg-background px-4 py-3">
        <div className="mb-3 flex min-h-[52px] items-start justify-between gap-3 border-b border-border/70 pb-3 select-none">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <CloudIcon />
              <span>User Messages</span>
            </div>
            <h2 className="mt-1 truncate text-xl font-semibold text-foreground">{title}</h2>
            <div className="mt-1 truncate text-sm text-muted-foreground">{subtitle}</div>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-right text-[11px] text-muted-foreground">
            <button
              type="button"
              onClick={this.refreshStats}
              className="rounded-md border border-border/70 bg-surface/40 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface/70"
              title="Refresh word snapshot"
            >
              Refresh
            </button>
            <div>
              <div className="font-mono text-sm text-foreground">{sampledLabel}</div>
              <div>scope</div>
            </div>
            <div>
              <div className="font-mono text-sm text-foreground">{visibleWords.length}/{words.length}</div>
              <div>words</div>
            </div>
            <div>
              <div className="font-mono text-sm text-foreground">{hiddenWords.length}</div>
              <div>hidden</div>
            </div>
          </div>
        </div>

        {words.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border/70 text-sm text-muted-foreground">
            <BarChartIcon />
            <span>No user-message words found for this scope.</span>
          </div>
        )}

        {words.length > 0 && (
          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <WordCloudCanvas words={visibleWords} onWordClick={this.openWordManager} />
            <div className="flex min-h-0 flex-col rounded-lg border border-border/70 bg-surface/20 p-2.5">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground select-none">
                <BarChartIcon />
                Words
              </div>
              <div className="mb-2 grid grid-cols-[minmax(0,1fr)_112px] gap-2">
                <input
                  value={wordSearch}
                  onChange={(event) => this.setState({ wordSearch: event.currentTarget.value })}
                  placeholder="Search words"
                  className="h-8 min-w-0 rounded-md border border-border/70 bg-background/60 px-2 text-xs text-foreground outline-none focus:border-info/50"
                />
                <select
                  value={wordSort}
                  onChange={(event) => this.setState({ wordSort: event.currentTarget.value as WordSortMode })}
                  className="h-8 rounded-md border border-border/70 bg-background/60 px-2 text-xs text-foreground outline-none focus:border-info/50"
                >
                  <option value="count">Count</option>
                  <option value="alpha">A-Z</option>
                </select>
              </div>
              <div className="min-h-0 flex-1 overflow-auto space-y-1.5">
                {visibleWords.map((item) => (
                  <button
                    key={item.word}
                    type="button"
                    onClick={() => this.openWordManager(item)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_42px] items-center gap-3 rounded-md border border-transparent px-2 py-1.5 text-left text-sm hover:border-info/35 hover:bg-info/8 hover:text-foreground"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-foreground">{item.word}</div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-background">
                        <div
                          className="h-full rounded-full bg-info"
                          style={{ width: `${Math.max(8, Math.round((item.count / maxCount) * 100))}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-right font-mono text-xs text-muted-foreground">{item.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {selectedWord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm" role="dialog" aria-modal="true">
            <div className="w-full max-w-[520px] rounded-lg border border-border/70 bg-background/95 shadow-xl">
              <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase text-muted-foreground">Word</div>
                  <div className="truncate text-lg font-semibold text-foreground">{selectedWord.word}</div>
                </div>
                <button type="button" onClick={this.closeWordManager} className="rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-surface/80 hover:text-foreground">Close</button>
              </div>
              <div className="space-y-4 px-4 py-4">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-border/70 bg-surface/25 px-3 py-2">
                    <div className="font-mono text-sm text-foreground">{selectedWord.count}</div>
                    <div className="text-muted-foreground">count</div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-surface/25 px-3 py-2">
                    <div className="font-mono text-sm text-foreground">{hiddenWords.length}</div>
                    <div className="text-muted-foreground">hidden</div>
                  </div>
                </div>
                {configError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{configError}</div>}
                <button
                  type="button"
                  onClick={this.hideSelectedWord}
                  disabled={savingHiddenWords || hiddenWordSet.has(selectedWord.word)}
                  className="w-full rounded-lg border border-info/35 bg-info/12 px-3 py-2 text-sm font-medium text-foreground hover:bg-info/18 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {hiddenWordSet.has(selectedWord.word) ? 'Hidden globally' : savingHiddenWords ? 'Saving...' : 'Hide globally'}
                </button>
                {hiddenWords.length > 0 && (
                  <div className="max-h-[180px] overflow-auto rounded-lg border border-border/70 bg-surface/20 p-2">
                    {hiddenWords.map((word) => (
                      <div key={word} className="mb-1 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm last:mb-0 hover:bg-surface/70">
                        <span className="min-w-0 truncate text-foreground">{word}</span>
                        <button type="button" onClick={() => this.showHiddenWord(word)} className="text-xs text-info hover:text-foreground">Show</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }
}

interface ProjectSummary {
  dir: string
  name: string
  sessionCount: number
  messageCount: number
  lastModified: number
}

function projectName(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function compactPath(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 2) return path
  return `.../${parts.slice(-2).join('/')}`
}

function relativeTime(timestamp: number) {
  if (!Number.isFinite(timestamp)) return ''
  const diffMs = Date.now() - timestamp
  const minutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(diffMs / 3600000)
  const days = Math.floor(diffMs / 86400000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  if (hours < 24) return `${hours}h`
  if (days < 30) return `${days}d`
  return `${Math.floor(days / 30)}mo`
}

function projectSummaries(sessions: SessionInfo[], query: string, sortMode: ProjectSortMode) {
  const projects = new Map<string, ProjectSummary>()
  for (const session of sessions) {
    const dir = session.cwd || 'Unknown'
    const modified = new Date(session.modified).getTime()
    const existing = projects.get(dir)
    if (existing) {
      existing.sessionCount += 1
      existing.messageCount += session.message_count || 0
      existing.lastModified = Math.max(existing.lastModified, Number.isFinite(modified) ? modified : 0)
    } else {
      projects.set(dir, {
        dir,
        name: projectName(dir),
        sessionCount: 1,
        messageCount: session.message_count || 0,
        lastModified: Number.isFinite(modified) ? modified : 0,
      })
    }
  }

  const needle = query.trim().toLowerCase()
  const list = Array.from(projects.values()).filter((project) => {
    if (!needle) return true
    return `${project.name}\n${project.dir}`.toLowerCase().includes(needle)
  })

  list.sort((a, b) => {
    if (sortMode === 'sessions') return b.sessionCount - a.sessionCount || b.lastModified - a.lastModified
    if (sortMode === 'messages') return b.messageCount - a.messageCount || b.lastModified - a.lastModified
    if (sortMode === 'name') return a.name.localeCompare(b.name) || a.dir.localeCompare(b.dir)
    return b.lastModified - a.lastModified
  })

  return list
}

class WordCloudSidebar extends Component<PsmAppSidebarViewRenderProps<AppPluginSurfaceData>, { scope: WordCloudScope; projectSearch: string; projectSort: ProjectSortMode }> {
  private unsubscribeScope: (() => void) | null = null

  state = { scope: activeScope, projectSearch: '', projectSort: 'recent' as ProjectSortMode }

  componentDidMount() {
    this.unsubscribeScope = subscribeScope(() => this.setState({ scope: activeScope }))
  }

  componentWillUnmount() {
    this.unsubscribeScope?.()
  }

  render() {
    const { data } = this.props
    const { scope, projectSearch, projectSort } = this.state
    const sessions = getSessions(data)
    const projects = projectSummaries(sessions, projectSearch, projectSort)

    return (
      <div className="flex h-full min-h-0 flex-col gap-2 p-2.5 select-none">
        <div className="px-1 text-xs font-medium text-muted-foreground">Scope</div>
        <button
          type="button"
          onClick={() => setActiveScope({ type: 'global' })}
          className={`rounded-md border px-2.5 py-1.5 text-left text-sm ${scope.type === 'global' ? 'border-info/40 bg-info/8 text-foreground' : 'border-border/70 text-muted-foreground hover:bg-surface/50 hover:text-foreground'}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span>Global</span>
            <span className="font-mono text-xs text-muted-foreground">{sessions.length}</span>
          </div>
        </button>

        <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
          <input
            value={projectSearch}
            onChange={(event) => this.setState({ projectSearch: event.currentTarget.value })}
            placeholder="Search projects"
            className="h-8 min-w-0 rounded-md border border-border/70 bg-background/60 px-2 text-xs text-foreground outline-none focus:border-info/50"
          />
          <select
            value={projectSort}
            onChange={(event) => this.setState({ projectSort: event.currentTarget.value as ProjectSortMode })}
            className="h-8 rounded-md border border-border/70 bg-background/60 px-2 text-xs text-foreground outline-none focus:border-info/50"
          >
            <option value="recent">Recent</option>
            <option value="sessions">Sessions</option>
            <option value="messages">Messages</option>
            <option value="name">A-Z</option>
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border/70 bg-surface/20">
          {projects.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">No projects</div>
          ) : projects.map((project) => {
            const selected = scope.type === 'project' && scope.projectPath === project.dir
            return (
              <button
                key={project.dir}
                type="button"
                onClick={() => setActiveScope({ type: 'project', projectPath: project.dir })}
                className={`block w-full border-b border-border/10 px-3 py-2 text-left ${selected ? 'bg-info/10 text-foreground' : 'text-muted-foreground hover:bg-background hover:text-foreground'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{project.name}</div>
                    <div className="mt-1 truncate font-mono text-xs opacity-80">{compactPath(project.dir)}</div>
                  </div>
                  <div className="shrink-0 text-right font-mono text-[11px] opacity-70">{relativeTime(project.lastModified)}</div>
                </div>
                <div className="mt-2 flex gap-2 text-[11px] opacity-80">
                  <span className="rounded bg-muted/40 px-1.5 py-0.5">{project.sessionCount} sessions</span>
                  <span className="rounded bg-muted/40 px-1.5 py-0.5">{project.messageCount} messages</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }
}

export default function activate(ctx: PsmPluginHostContext) {
  const minWordLength = Number(ctx.settings.get('minWordLength', 3))
  const maxWords = Number(ctx.settings.get('maxWords', 50))

  ctx.ui.registerAppView({
    id: WORD_CLOUD_VIEW_ID,
    title: 'Word Cloud',
    route: '/word-cloud',
    icon: 'cloud',
    shortcut: 'Cmd+Shift+W',
    render: (props) => createElement(WordCloudAppView, {
      ...(props as PsmAppViewRenderProps<AppPluginSurfaceData>),
      minWordLength,
      maxWords,
      configClient: ctx.psm.config,
    }),
  })

  ctx.ui.registerAppSidebarView({
    id: WORD_CLOUD_SIDEBAR_ID,
    title: 'Word Cloud Filters',
    appViewId: WORD_CLOUD_VIEW_ID,
    route: '/word-cloud',
    render: (props) => createElement(WordCloudSidebar, props as PsmAppSidebarViewRenderProps<AppPluginSurfaceData>),
  })

  ctx.registerCommand({
    id: 'word-cloud.openGlobal',
    title: 'Word Cloud: Global',
    description: 'Frequent words across all user messages.',
    category: 'Analytics',
    icon: 'cloud',
    keywords: ['word cloud', 'messages', 'global', 'analytics'],
    scope: 'global',
    run: (_args, commandContext) => {
      setActiveScope({ type: 'global' })
      openWordCloud(commandContext)
    },
  })

  ctx.registerCommand({
    id: 'word-cloud.openProject',
    title: 'Word Cloud: Project',
    description: 'Frequent words in the current project user messages.',
    category: 'Analytics',
    icon: 'cloud',
    keywords: ['word cloud', 'messages', 'project', 'analytics'],
    scope: 'project',
    when: (commandContext) => Boolean(getProjectFromContext(commandContext)),
    run: (_args, commandContext) => {
      const projectPath = getProjectFromContext(commandContext)
      if (!projectPath) throw new Error('No active project is available for project word cloud')
      setActiveScope({ type: 'project', projectPath })
      openWordCloud(commandContext)
    },
  })
}
