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
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      onSearch(query)
    }, 200)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query, onSearch])

  const handleClear = () => {
    setQuery('')
  }

  return (
    <div className="p-4 border-b border-border">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-9 pr-9 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground"
            aria-label={t('search.clear')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
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