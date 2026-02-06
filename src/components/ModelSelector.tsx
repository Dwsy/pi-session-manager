import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search } from 'lucide-react'

export interface RPCModel {
  id: string
  name?: string
  provider: string
}

interface ModelSelectorProps {
  models: RPCModel[]
  currentModel: RPCModel | null
  onSelect: (model: RPCModel) => void
  loading?: boolean
  disabled?: boolean
}

const RECENT_MODELS_KEY = 'pi-session-manager-recent-models'
const MAX_RECENT_MODELS = 6

// Fuzzy match implementation from badlogic/pi-mono
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
  
  // Penalty for distance from start
  score -= textIdx * 0.1
  
  return { matches: true, score }
}

function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string
): T[] {
  if (!query.trim()) {
    return items
  }

  const tokens = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)

  if (tokens.length === 0) {
    return items
  }

  const results: { item: T; totalScore: number }[] = []

  for (const item of items) {
    const text = getText(item)
    let totalScore = 0
    let allMatch = true

    for (const token of tokens) {
      const match = fuzzyMatch(token, text)
      if (match.matches) {
        totalScore += match.score
      } else {
        allMatch = false
        break
      }
    }

    if (allMatch) {
      results.push({ item, totalScore })
    }
  }

  results.sort((a, b) => a.totalScore - b.totalScore)
  return results.map((r) => r.item)
}

export default function ModelSelector({
  models,
  currentModel,
  onSelect,
  loading = false,
  disabled = false,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [recentKeys, setRecentKeys] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem(RECENT_MODELS_KEY)
      const parsed = raw ? (JSON.parse(raw) as string[]) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const searchInputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const [openUpward, setOpenUpward] = useState(true)

  const currentLabel = currentModel
    ? `${currentModel.provider}/${currentModel.name || currentModel.id}`
    : '模型'

  const label = loading
    ? '加载中...'
    : currentLabel

  const modelKey = useCallback((model: RPCModel) => `${model.provider}:${model.id}`, [])

  const isCurrentModel = useCallback(
    (model: RPCModel) =>
      currentModel?.id === model.id && currentModel?.provider === model.provider,
    [currentModel]
  )

  // TUI 版本的模糊搜索算法
  const filteredModels = useMemo(() => {
    return fuzzyFilter(
      models,
      searchQuery,
      (model) => `${model.id} ${model.provider}`
    )
  }, [models, searchQuery])

  const recentModels = useMemo(() => {
    if (searchQuery.trim()) return []
    const byKey = new Map(models.map(model => [modelKey(model), model]))
    return recentKeys.map(key => byKey.get(key)).filter(Boolean) as RPCModel[]
  }, [models, recentKeys, searchQuery, modelKey])

  const recentKeySet = useMemo(() => new Set(recentKeys), [recentKeys])

  const otherModels = useMemo(() => {
    if (searchQuery.trim()) return filteredModels
    return filteredModels.filter(model => !recentKeySet.has(modelKey(model)))
  }, [filteredModels, recentKeySet, modelKey, searchQuery])

  const displayModels = useMemo(() => {
    if (searchQuery.trim()) return filteredModels
    return [...recentModels, ...otherModels]
  }, [filteredModels, otherModels, recentModels, searchQuery])

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger || typeof window === 'undefined') return

    const rect = trigger.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const maxWidth = Math.max(220, viewportWidth - 16)
    const width = Math.min(Math.max(rect.width, 240), Math.min(360, maxWidth))
    const left = Math.min(Math.max(8, rect.left), viewportWidth - width - 8)

    const spaceAbove = Math.max(0, rect.top - 8)
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 8)
    const shouldOpenUpward =
      rect.bottom > viewportHeight * 0.5 ||
      spaceBelow < 200 ||
      spaceAbove > spaceBelow
    const availableHeight = shouldOpenUpward ? spaceAbove : spaceBelow
    const maxHeight = Math.min(availableHeight, Math.min(viewportHeight * 0.55, 320))

    const top = shouldOpenUpward
      ? Math.max(8, rect.top - maxHeight - 8)
      : Math.min(viewportHeight - maxHeight - 8, rect.bottom + 8)

    setOpenUpward(shouldOpenUpward)
    setMenuStyle({
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.floor(width)}px`,
      maxHeight: `${Math.floor(maxHeight)}px`,
      zIndex: 1300,
    })
  }, [])

  // 打开菜单时聚焦搜索框并选中当前模型
  useEffect(() => {
    if (!open) return
    updateMenuPosition()
    const raf = requestAnimationFrame(() => {
      searchInputRef.current?.focus()
    })
    // 选中当前模型或第一个
    const currentIndex = displayModels.findIndex(model => isCurrentModel(model))
    setSelectedIndex(currentIndex >= 0 ? currentIndex : 0)
    return () => cancelAnimationFrame(raf)
  }, [open, updateMenuPosition, displayModels, isCurrentModel])

  useEffect(() => {
    if (!open) return
    const handleViewportChange = () => updateMenuPosition()
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [open])

  // 关闭时清空搜索
  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setSelectedIndex(0)
    } else if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(RECENT_MODELS_KEY)
        const parsed = raw ? (JSON.parse(raw) as string[]) : []
        setRecentKeys(Array.isArray(parsed) ? parsed : [])
      } catch {
        setRecentKeys([])
      }
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [displayModels])

  useEffect(() => {
    if (!open) return
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (!wrapperRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [open])

  // TUI 版本的键盘导航处理
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          setOpen(false)
          break
        case 'ArrowDown':
          event.preventDefault()
          if (displayModels.length === 0) return
          // 循环到底部时回到顶部
          setSelectedIndex(prev => 
            prev === displayModels.length - 1 ? 0 : prev + 1
          )
          break
        case 'ArrowUp':
          event.preventDefault()
          if (displayModels.length === 0) return
          // 循环到顶部时回到底部
          setSelectedIndex(prev => 
            prev === 0 ? displayModels.length - 1 : prev - 1
          )
          break
        case 'Enter':
          event.preventDefault()
          if (displayModels.length > 0) {
            handleSelect(displayModels[selectedIndex])
          }
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, displayModels, selectedIndex])

  useEffect(() => {
    if (!open) return
    const activeItem = menuRef.current?.querySelector<HTMLButtonElement>(
      '.model-selector-item.selected'
    )
    activeItem?.scrollIntoView({ block: 'nearest' })
  }, [open, selectedIndex, displayModels.length])

  const handleSelect = (model: RPCModel) => {
    onSelect(model)
    const key = modelKey(model)
    setRecentKeys((prev) => {
      const next = [key, ...prev.filter(item => item !== key)].slice(0, MAX_RECENT_MODELS)
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(RECENT_MODELS_KEY, JSON.stringify(next))
        } catch {
          // ignore
        }
      }
      return next
    })
    setOpen(false)
  }

  const menu = (
    <div
      ref={menuRef}
      className={`model-selector-menu ${openUpward ? 'upward' : 'downward'}`}
      style={menuStyle}
    >
      <div className="model-selector-search">
        <Search size={12} className="search-icon" />
        <input
          ref={searchInputRef}
          type="text"
          className="search-input"
          placeholder="搜索模型..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="model-selector-list">
        {displayModels.length === 0 && (
          <div className="model-selector-empty">
            {searchQuery ? '无匹配模型' : '暂无模型'}
          </div>
        )}
        {searchQuery.trim() ? (
          displayModels.map((model, index) => {
            const modelLabel = `${model.provider}/${model.name || model.id}`
            const isCurrent = isCurrentModel(model)
            const isSelected = index === selectedIndex
            return (
              <button
                key={modelKey(model)}
                type="button"
                className={`model-selector-item ${isCurrent ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelect(model)}
              >
                <span className="model-selector-item-name">{modelLabel}</span>
                {isCurrent && <span className="model-selector-item-flag">当前</span>}
              </button>
            )
          })
        ) : (
          <>
            {recentModels.length > 0 && (
              <div className="model-selector-section">
                <div className="model-selector-section-title">最近使用</div>
                {recentModels.map((model, index) => {
                  const modelLabel = `${model.provider}/${model.name || model.id}`
                  const isCurrent = isCurrentModel(model)
                  const isSelected = index === selectedIndex
                  return (
                    <button
                      key={modelKey(model)}
                      type="button"
                      className={`model-selector-item ${isCurrent ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelect(model)}
                    >
                      <span className="model-selector-item-name">{modelLabel}</span>
                      {isCurrent && <span className="model-selector-item-flag">当前</span>}
                    </button>
                  )
                })}
              </div>
            )}
            {otherModels.length > 0 && (
              <div className="model-selector-section">
                <div className="model-selector-section-title">全部模型</div>
                {otherModels.map((model, idx) => {
                  const offset = recentModels.length
                  const index = idx + offset
                  const modelLabel = `${model.provider}/${model.name || model.id}`
                  const isCurrent = isCurrentModel(model)
                  const isSelected = index === selectedIndex
                  return (
                    <button
                      key={modelKey(model)}
                      type="button"
                      className={`model-selector-item ${isCurrent ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelect(model)}
                    >
                      <span className="model-selector-item-name">{modelLabel}</span>
                      {isCurrent && <span className="model-selector-item-flag">当前</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className="model-selector" ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className="model-selector-trigger"
        onClick={() => !disabled && setOpen(prev => !prev)}
        disabled={disabled}
      >
        <span className="model-selector-label">{label}</span>
        <ChevronDown size={14} />
      </button>
      {open && typeof document !== 'undefined' ? createPortal(menu, document.body) : null}
    </div>
  )
}
