import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import CompositionInput from '@/components/ui/CompositionInput'

export interface RPCModel {
  id: string
  name?: string
  provider: string
}

interface ModelSelectorProps {
  buttonId?: string
  models: RPCModel[]
  currentModel: RPCModel | null
  onSelect: (model: RPCModel) => void
  loading?: boolean
  disabled?: boolean
  className?: string
}

const RECENT_MODELS_KEY = 'pi-session-manager-recent-models'
const MAX_RECENT_MODELS = 6

interface FuzzyMatchResult {
  matches: boolean
  score: number
}

function fuzzyMatch(query: string, text: string): FuzzyMatchResult {
  const queryLower = query.toLowerCase()
  const textLower = text.toLowerCase()

  let score = 0
  let queryIdx = 0
  let textIdx = 0
  let consecutiveMatches = 0

  while (queryIdx < queryLower.length && textIdx < textLower.length) {
    if (queryLower[queryIdx] === textLower[textIdx]) {
      score += 1 + consecutiveMatches * 0.5
      consecutiveMatches++
      queryIdx++
    } else {
      consecutiveMatches = 0
    }
    textIdx++
  }

  if (queryIdx !== queryLower.length) {
    return { matches: false, score: 0 }
  }

  score -= textIdx * 0.1
  return { matches: true, score }
}

function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string
): T[] {
  if (!query.trim()) return items

  const tokens = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (tokens.length === 0) return items

  const results: { item: T; totalScore: number }[] = []

  for (const item of items) {
    const text = getText(item)
    let totalScore = 0
    let allMatch = true

    for (const token of tokens) {
      const match = fuzzyMatch(token, text)
      if (!match.matches) {
        allMatch = false
        break
      }
      totalScore += match.score
    }

    if (allMatch) {
      results.push({ item, totalScore })
    }
  }

  results.sort((a, b) => a.totalScore - b.totalScore)
  return results.map((entry) => entry.item)
}

export default function ModelSelector({
  buttonId,
  models,
  currentModel,
  onSelect,
  loading = false,
  disabled = false,
  className,
}: ModelSelectorProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [recentKeys, setRecentKeys] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem(RECENT_MODELS_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })

  const triggerRef = useRef<HTMLButtonElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({ visibility: 'hidden' })

  const modelKey = useCallback((model: RPCModel) => `${model.provider}:${model.id}`, [])

  const allModels = useMemo(() => {
    if (!currentModel) return models
    const exists = models.some(
      (model) =>
        model.provider === currentModel.provider && model.id === currentModel.id,
    )
    return exists ? models : [currentModel, ...models]
  }, [currentModel, models])

  const filteredModels = useMemo(() => {
    return fuzzyFilter(
      allModels,
      searchQuery,
      (model) => `${model.provider} ${model.id} ${model.name || ''}`,
    )
  }, [allModels, searchQuery])

  const isCurrentModel = useCallback(
    (model: RPCModel) =>
      currentModel?.provider === model.provider && currentModel?.id === model.id,
    [currentModel],
  )

  const recentModels = useMemo(() => {
    if (searchQuery.trim()) return []
    const byKey = new Map(allModels.map((model) => [modelKey(model), model]))
    return recentKeys
      .map((key) => byKey.get(key))
      .filter(Boolean) as RPCModel[]
  }, [allModels, modelKey, recentKeys, searchQuery])

  const recentKeySet = useMemo(() => new Set(recentKeys), [recentKeys])

  const visibleRecentModels = useMemo(
    () => recentModels.filter((model) => !isCurrentModel(model)),
    [isCurrentModel, recentModels],
  )

  const otherModels = useMemo(() => {
    if (searchQuery.trim()) return filteredModels
    return filteredModels.filter((model) => !recentKeySet.has(modelKey(model)))
  }, [filteredModels, modelKey, recentKeySet, searchQuery])

  const visibleOtherModels = useMemo(
    () => otherModels.filter((model) => !isCurrentModel(model)),
    [isCurrentModel, otherModels],
  )

  const displayModels = useMemo(() => {
    if (searchQuery.trim()) return filteredModels
    return [
      ...(currentModel ? [currentModel] : []),
      ...visibleRecentModels,
      ...visibleOtherModels,
    ]
  }, [currentModel, filteredModels, searchQuery, visibleOtherModels, visibleRecentModels])

  const currentLabel = currentModel
    ? (currentModel.provider ? `${currentModel.provider}/${currentModel.name || currentModel.id}` : (currentModel.name || currentModel.id))
    : t('session.modelControls.selectModel', 'Select model')

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger || typeof window === 'undefined') return

    const rect = trigger.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const width = Math.min(Math.max(rect.width, 280), viewportWidth - 16)
    const left = Math.min(Math.max(8, rect.left), viewportWidth - width - 8)
    const availableBelow = viewportHeight - rect.bottom - 8
    const availableAbove = rect.top - 8
    const openUpward = availableBelow < 280 && availableAbove > availableBelow
    const maxHeight = Math.min(
      Math.max(openUpward ? availableAbove : availableBelow, 180),
      360,
    )

    setMenuStyle({
      position: 'fixed',
      left,
      top: openUpward ? Math.max(8, rect.top - maxHeight - 8) : rect.bottom + 8,
      width,
      maxHeight,
      zIndex: 1300,
      visibility: 'visible',
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (
        target
        && !wrapperRef.current?.contains(target)
        && !menuRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }

    updateMenuPosition()
    const raf = requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      const currentIndex = displayModels.findIndex((model) => isCurrentModel(model))
      setSelectedIndex(currentIndex >= 0 ? currentIndex : 0)
    })

    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [displayModels, isCurrentModel, open, updateMenuPosition])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }

      if (!displayModels.length) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, displayModels.length - 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const target = displayModels[selectedIndex]
        if (target) {
          handleSelect(target)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [displayModels, open, selectedIndex])

  useEffect(() => {
    if (!open) return
    const active = menuRef.current?.querySelector<HTMLButtonElement>(
      '[data-model-item="selected"]',
    )
    if (typeof active?.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' })
    }
  }, [open, selectedIndex])

  const handleSelect = (model: RPCModel) => {
    onSelect(model)
    const key = modelKey(model)
    setRecentKeys((prev) => {
      const next = [key, ...prev.filter((item) => item !== key)].slice(0, MAX_RECENT_MODELS)
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(RECENT_MODELS_KEY, JSON.stringify(next))
        } catch {
          // ignore
        }
      }
      return next
    })
    setSearchQuery('')
    setOpen(false)
  }

  const renderModelItem = (model: RPCModel, index: number) => {
    const selected = index === selectedIndex
    const current = isCurrentModel(model)
    return (
      <button
        key={modelKey(model)}
        type="button"
        data-model-item={selected ? 'selected' : undefined}
        className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
          selected
            ? 'bg-primary/12 text-foreground'
            : current
              ? 'bg-secondary/70 text-foreground'
              : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
        }`}
        onClick={() => handleSelect(model)}
      >
        <div className="min-w-0">
          <div className="truncate font-medium">{model.provider ? `${model.provider}/${model.name || model.id}` : (model.name || model.id)}</div>
          {model.name && model.name !== model.id && (
            <div className="truncate text-[10px] text-muted-foreground/80">{model.id}</div>
          )}
        </div>
        {current && (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {t('session.modelControls.current', 'Current')}
          </span>
        )}
      </button>
    )
  }

  const menu = (
    <div
      ref={menuRef}
      style={menuStyle}
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-md"
    >
      <div className="border-b border-border/60 p-2">
        <div className="flex items-center gap-2 rounded-md border border-border/70 bg-background/70 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground/70" />
          <CompositionInput
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(value) => {
              setSearchQuery(value)
              setSelectedIndex(0)
            }}
            placeholder={t('session.modelControls.searchPlaceholder', 'Search models...')}
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {displayModels.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            {searchQuery
              ? t('session.modelControls.noMatchingModels', 'No matching models')
              : t('session.modelControls.noModels', 'No models available')}
          </div>
        ) : searchQuery.trim() ? (
          <div className="space-y-0.5">
            {displayModels.map((model, index) => renderModelItem(model, index))}
          </div>
        ) : (
          <div className="space-y-2">
            {currentModel && (
              <div className="space-y-0.5">
                <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  {t('session.modelControls.currentSection', 'Current')}
                </div>
                {renderModelItem(currentModel, 0)}
              </div>
            )}
            {recentModels.length > 0 && (
              <div className="space-y-0.5">
                <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  {t('session.modelControls.recentModels', 'Recent')}
                </div>
                {visibleRecentModels.map((model, index) => renderModelItem(model, index + (currentModel ? 1 : 0)))}
              </div>
            )}
            {visibleOtherModels.length > 0 && (
              <div className="space-y-0.5">
                <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  {t('session.modelControls.allModels', 'All models')}
                </div>
                {visibleOtherModels
                  .map((model, idx) =>
                    renderModelItem(
                      model,
                      idx + (currentModel ? 1 : 0) + visibleRecentModels.length,
                    ),
                  )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div ref={wrapperRef} className="relative">
      <button
        id={buttonId}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setOpen((prev) => !prev)
          }
        }}
        className={`inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-secondary px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary-hover active:bg-secondary-hover disabled:cursor-not-allowed disabled:opacity-50 ${className || "max-w-[210px]"}`}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : null}
        <span className="truncate font-medium">
          {loading ? t('session.modelControls.loadingModels', 'Loading models...') : currentLabel}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && typeof document !== 'undefined' ? createPortal(menu, document.body) : null}
    </div>
  )
}
