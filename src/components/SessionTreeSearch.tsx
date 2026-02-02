import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'

export interface SessionTreeSearchRef {
  focus: () => void
}

interface SessionTreeSearchProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  onClear: () => void
  onNext: () => void
  onPrevious: () => void
  currentIndex: number
  totalResults: number
}

const SessionTreeSearch = forwardRef<SessionTreeSearchRef, SessionTreeSearchProps>(
  function SessionTreeSearch({
    searchQuery,
    onSearchChange,
    onClear,
    onNext,
    onPrevious,
    currentIndex,
    totalResults
  }: SessionTreeSearchProps,
  ref
) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }))

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClear()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        onPrevious()
      } else {
        onNext()
      }
    }
  }, [onClear, onNext, onPrevious])

  return (
    <div className="session-tree-search">
      <div className="session-tree-search-content">
        <div className="search-input-wrapper">
          <Search className="search-icon" size={14} />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('search.placeholder')}
            className="search-input"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="clear-button"
              title={t('search.clear')}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {searchQuery && (
          <div className="search-results-info">
            {totalResults > 0 ? (
              <span className="results-count">
                {currentIndex + 1} / {totalResults}
              </span>
            ) : (
              <span className="no-results">{t('search.noResults')}</span>
            )}
          </div>
        )}

        <div className="search-navigation">
          <button
            onClick={onClear}
            className="nav-button close-button"
            title={t('search.clearAll')}
          >
            <X size={20} />
          </button>
        </div>
      </div>
    </div>
  )
})

export default SessionTreeSearch
