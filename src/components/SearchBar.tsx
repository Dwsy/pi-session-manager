import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface SearchBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  onClose: () => void
  onNext: () => void
  onPrevious: () => void
  currentIndex: number
  totalResults: number
}

export default function SearchBar({
  searchQuery,
  onSearchChange,
  onClose,
  onNext,
  onPrevious,
  currentIndex,
  totalResults
}: SearchBarProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // 自动聚焦搜索框
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Enter') {
      if (e.shiftKey) {
        onPrevious()
      } else {
        onNext()
      }
    }
  }

  return (
    <div className="search-bar">
      <div className="search-bar-content">
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
          <div className="search-results-info">
            {totalResults > 0 ? (
              <span className="text-xs text-[#6a6f85]">
                {currentIndex + 1} / {totalResults}
              </span>
            ) : (
              <span className="text-xs text-[#6a6f85]">
                {t('search.noResults')}
              </span>
            )}
          </div>
        )}

        <div className="search-controls">
          <button
            onClick={onPrevious}
            disabled={totalResults === 0}
            className="search-button"
            title={t('search.previous')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          
          <button
            onClick={onNext}
            disabled={totalResults === 0}
            className="search-button"
            title={t('search.next')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          <button
            onClick={onClose}
            className="search-button"
            title={t('search.close')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
