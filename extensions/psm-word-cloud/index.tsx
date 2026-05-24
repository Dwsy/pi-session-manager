import { hostReact } from './host-react'
import type { WordCloudOptions } from 'wordcloud'
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
      { key: 'maxWords', title: 'Maximum words', type: 'number', default: 80, min: 10, max: 200 },
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
  const texts = [session.first_message]
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
  sampledSessions: number
}

const MAX_SAMPLED_SESSIONS = 120

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
  const maxFontSize = Math.max(96, Math.min(168, minDimension / 2.7))
  const minFontSize = Math.max(15, Math.min(22, minDimension / 20))
  const centerX = width / 2
  const centerY = height / 2
  const placed: WordCloudLayoutItem[] = []

  words.forEach((item, index) => {
    const frequencyWeight = Math.pow((item.count - minCount) / countRange, 0.38)
    const rankWeight = words.length > 1 ? Math.pow(1 - index / (words.length - 1), 1.15) : 1
    const weight = Math.max(0, Math.min(1, frequencyWeight * 0.64 + rankWeight * 0.36))
    const baseFontSize = Math.round(minFontSize + (maxFontSize - minFontSize) * weight)

    for (const scale of [1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52]) {
      const fontSize = Math.round(baseFontSize * scale)
      const textWidth = measureText(item.word, fontSize)
      const box: Omit<WordCloudLayoutItem, 'x' | 'y'> = {
        ...item,
        width: textWidth + 18,
        height: Math.ceil(fontSize * 1.22) + 10,
        fontSize,
        colorIndex: index,
      }

      let didPlace = false
      for (let step = 0; step < 5200; step += 1) {
        const angle = step * 0.36
        const radius = 7.4 * Math.sqrt(step)
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
  const scopedSessions = sessions.filter((session) => sessionMatchesScope(session, scope)).slice(0, MAX_SAMPLED_SESSIONS)

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
    sampledSessions: scopedSessions.length,
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

class WordCloudCanvas extends Component<WordCloudCanvasProps, { width: number; height: number; hoveredWord: string | null; hoveredDimension: WordCloudDimension | null }> {
  private containerRef = createRef<HTMLDivElement>()
  private baseCanvasRef = createRef<HTMLCanvasElement>()
  private overlayCanvasRef = createRef<HTMLCanvasElement>()
  private resizeObserver: ResizeObserver | null = null

  state = { width: 0, height: 0, hoveredWord: null as string | null, hoveredDimension: null as WordCloudDimension | null }

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

  componentDidUpdate(prevProps: WordCloudCanvasProps, prevState: { width: number; height: number; hoveredWord: string | null; hoveredDimension: WordCloudDimension | null }) {
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
      height: Math.max(280, Math.round(container.clientHeight)),
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
    const context = canvas.getContext('2d')
    if (context) context.setTransform(ratio, 0, 0, ratio, 0, 0)
    return context
  }

  private async drawWordCloud() {
    const canvas = this.baseCanvasRef.current
    const { width, height } = this.state
    if (!canvas || width <= 0 || height <= 0) return
    this.syncCanvasSize(canvas, width, height)

    const { default: wordCloud } = (await import('wordcloud')) as { default: (canvas: HTMLCanvasElement, options: WordCloudOptions) => void }
    const maxCount = this.props.words[0]?.count ?? 1
    const minCount = this.props.words[this.props.words.length - 1]?.count ?? maxCount
    const list = this.props.words.map((item, index) => {
      const frequency = maxCount === minCount ? 0.5 : (item.count - minCount) / Math.max(1, maxCount - minCount)
      const rank = this.props.words.length > 1 ? 1 - index / (this.props.words.length - 1) : 1
      return [item.word, Math.round(20 + frequency * 120 + rank * 60)] as [string, number]
    })

    wordCloud(canvas, {
      list,
      weightFactor: (weight) => weight,
      fontFamily: 'var(--font-family, system-ui)',
      backgroundColor: 'transparent',
      clearCanvas: true,
      drawOutOfBound: false,
      ellipticity: 0.74,
      gridSize: Math.max(8, Math.round(Math.min(width, height) / 24)),
      minSize: 14,
      rotateRatio: 0,
      shuffle: false,
      color: (_word, weight) => {
        if (weight >= 150) return 'rgb(var(--color-info))'
        if (weight >= 110) return 'rgb(var(--color-foreground))'
        if (weight >= 70) return 'rgb(var(--color-purple))'
        return 'rgb(var(--color-muted-foreground))'
      },
      hover: (item, dimension) => {
        if (!item || !dimension) {
          this.setState({ hoveredWord: null, hoveredDimension: null })
          return
        }
        this.setState({ hoveredWord: item[0], hoveredDimension: dimension })
      },
      click: (item) => {
        if (!item) return
        const clicked = this.props.words.find((entry) => entry.word === item[0])
        if (clicked) this.props.onWordClick?.(clicked)
      },
    })
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

  render() {
    return (
      <div ref={this.containerRef} className="relative h-full min-h-[280px] overflow-hidden rounded-xl border border-border/70 bg-surface/20">
        <canvas ref={this.baseCanvasRef} className="block h-full w-full" aria-label="Word cloud canvas" />
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
}

class WordCloudAppView extends Component<WordCloudAppViewProps, WordCloudAppViewState> {
  private unsubscribeScope: (() => void) | null = null

  state: WordCloudAppViewState = {
    scope: activeScope,
    hiddenWords: [],
    selectedWord: null,
    savingHiddenWords: false,
    configError: null,
  }

  componentDidMount() {
    this.unsubscribeScope = subscribeScope(() => this.setState({ scope: activeScope }))
    void this.loadHiddenWords()
  }

  componentWillUnmount() {
    this.unsubscribeScope?.()
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
    const { data, minWordLength, maxWords } = this.props
    const { scope, hiddenWords, selectedWord, savingHiddenWords, configError } = this.state
    const sessions = getSessions(data)
    const scopedSessionCount = sessions.filter((session) => sessionMatchesScope(session, scope)).length
    const hiddenWordSet = new Set(hiddenWords)
    const stats = computeWordStats(sessions, scope, minWordLength, maxWords, hiddenWordSet)
    const words = stats.words
    const maxCount = words[0]?.count ?? 1
    const title = scope.type === 'global' ? 'Global Word Cloud' : 'Project Word Cloud'
    const subtitle = scope.type === 'global' ? 'All projects' : scope.projectPath
    const sampledLabel = scopedSessionCount > MAX_SAMPLED_SESSIONS
      ? `${stats.sampledSessions}/${scopedSessionCount} sampled`
      : `${scopedSessionCount} sessions`

    return (
      <div className="flex h-full min-h-0 flex-col bg-background p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <CloudIcon />
              <span>User Messages</span>
            </div>
            <h2 className="mt-1 truncate text-xl font-semibold text-foreground">{title}</h2>
            <div className="mt-1 truncate text-sm text-muted-foreground">{subtitle}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right text-xs">
            <div className="rounded-xl border border-border/70 bg-surface/30 px-3 py-2">
              <div className="font-mono text-sm text-foreground">{sampledLabel}</div>
              <div className="text-muted-foreground">scope</div>
            </div>
            <div className="rounded-xl border border-border/70 bg-surface/30 px-3 py-2">
              <div className="font-mono text-sm text-foreground">{words.length}</div>
              <div className="text-muted-foreground">words</div>
            </div>
            <div className="rounded-xl border border-border/70 bg-surface/30 px-3 py-2">
              <div className="font-mono text-sm text-foreground">{hiddenWords.length}</div>
              <div className="text-muted-foreground">hidden</div>
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
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <WordCloudCanvas words={words} onWordClick={this.openWordManager} />
            <div className="min-h-0 overflow-auto rounded-xl border border-border/70 bg-surface/20 p-3">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <BarChartIcon />
                Top Words
              </div>
              <div className="space-y-1.5">
                {words.slice(0, 28).map((item) => (
                  <button
                    key={item.word}
                    type="button"
                    onClick={() => this.openWordManager(item)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_42px] items-center gap-3 rounded-lg border border-transparent px-2 py-1.5 text-left text-sm hover:border-info/35 hover:bg-info/8 hover:text-foreground"
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
            <div className="w-full max-w-[520px] rounded-xl border border-border/70 bg-background/95 shadow-xl">
              <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase text-muted-foreground">Word</div>
                  <div className="truncate text-lg font-semibold text-foreground">{selectedWord.word}</div>
                </div>
                <button type="button" onClick={this.closeWordManager} className="rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-surface/80 hover:text-foreground">Close</button>
              </div>
              <div className="space-y-4 px-4 py-4">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-border/70 bg-surface/25 px-3 py-2">
                    <div className="font-mono text-sm text-foreground">{selectedWord.count}</div>
                    <div className="text-muted-foreground">count</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-surface/25 px-3 py-2">
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
                  <div className="max-h-[180px] overflow-auto rounded-xl border border-border/70 bg-surface/20 p-2">
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

function pathLabel(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

class WordCloudSidebar extends Component<PsmAppSidebarViewRenderProps<AppPluginSurfaceData>, { scope: WordCloudScope }> {
  private unsubscribeScope: (() => void) | null = null

  state = { scope: activeScope }

  componentDidMount() {
    this.unsubscribeScope = subscribeScope(() => this.setState({ scope: activeScope }))
  }

  componentWillUnmount() {
    this.unsubscribeScope?.()
  }

  render() {
    const { data } = this.props
    const { scope } = this.state
    const sessions = getSessions(data)
    const counts = new Map<string, number>()
    for (const session of sessions) {
      if (!session.cwd) continue
      counts.set(session.cwd, (counts.get(session.cwd) ?? 0) + 1)
    }
    const projects = Array.from(counts.entries())
      .map(([path, count]) => ({ path, count, label: pathLabel(path) }))
      .sort((a, b) => a.label.localeCompare(b.label) || a.path.localeCompare(b.path))

    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-3">
        <div className="text-xs font-medium text-muted-foreground">Scope</div>
        <button
          type="button"
          onClick={() => setActiveScope({ type: 'global' })}
          className={`rounded-xl border px-3 py-2 text-left text-sm ${scope.type === 'global' ? 'border-info/40 bg-info/8 text-foreground' : 'border-border/70 text-muted-foreground hover:text-foreground'}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span>Global</span>
            <span className="font-mono text-xs text-muted-foreground">{sessions.length}</span>
          </div>
        </button>

        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border/70 bg-surface/20 p-1">
          {projects.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No projects</div>
          ) : projects.map((project) => {
            const active = scope.type === 'project' && scope.projectPath === project.path
            return (
              <button
                key={project.path}
                type="button"
                onClick={() => setActiveScope({ type: 'project', projectPath: project.path })}
                className={`mb-1 w-full rounded-lg px-2.5 py-2 text-left text-sm last:mb-0 ${active ? 'bg-info/10 text-foreground' : 'text-muted-foreground hover:bg-surface/70 hover:text-foreground'}`}
                title={project.path}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{project.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">{project.count}</span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{project.path}</div>
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
  const maxWords = Number(ctx.settings.get('maxWords', 80))

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
