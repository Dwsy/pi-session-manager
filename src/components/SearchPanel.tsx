import { useState, useEffect, useRef } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface SearchPanelProps {
  onSearch: (query: string) => void
  resultCount: number
  isSearching: boolean
}

export default function SearchPanel({ onSearch, resultCount, isSearching }: SearchPanelProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const debounceRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    console.log('[SearchPanel] query changed:', query)
    console.log('[SearchPanel] isSearching:', isSearching)
    console.log('[SearchPanel] resultCount:', resultCount)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      console.log('[SearchPanel] Debounced search triggered for query:', query)
      onSearch(query)
    }, 200)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query, onSearch, isSearching, resultCount])

  const handleClear = () => {
    setQuery('')
  }

  return (
    <div className="px-3 py-2 border-b border-border/50">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder={t('search.panel.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-8 pr-7 py-1.5 bg-[#252636] border-0 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-400/50 placeholder:text-muted-foreground/60"
          autoFocus
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
            aria-label={t('search.clear')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground h-3.5">
        <div className="flex items-center gap-1.5">
          {isSearching && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{t('search.searching')}</span>
            </>
          )}
        </div>
        {!isSearching && resultCount > 0 && (
          <span>{t('search.results', { count: resultCount })}</span>
        )}
      </div>
    </div>
  )
}