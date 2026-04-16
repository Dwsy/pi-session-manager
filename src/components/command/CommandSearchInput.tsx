import { Search, Loader2, FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { formatSourceFilterToken } from '@/utils/search'
import { getSourceFilterLabel } from './utils'
import type { FullTextSearchSourceFilter } from '@/types'

interface CommandSearchInputProps {
  query: string
  onChange: (value: string) => void
  onKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void
  isSearching: boolean
  sourceFilterSuggestions: FullTextSearchSourceFilter[]
  onApplySuggestion: (filter: FullTextSearchSourceFilter) => void
  currentProjectName: string | null
  searchCurrentProjectOnly: boolean
  setSearchCurrentProjectOnly: (value: boolean) => void
  inputPlaceholder: string
}

export default function CommandSearchInput({
  query,
  onChange,
  onKeyDown,
  isSearching,
  sourceFilterSuggestions,
  onApplySuggestion,
  currentProjectName,
  searchCurrentProjectOnly,
  setSearchCurrentProjectOnly,
  inputPlaceholder,
}: CommandSearchInputProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-background px-4 py-3 shadow-sm">
      <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
      <div className="relative flex-1">
        <input
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={inputPlaceholder}
          className="w-full bg-transparent border-0 outline-none text-[15px] font-medium text-foreground placeholder:text-muted-foreground/70"
          autoFocus
        />
        {sourceFilterSuggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-border/80 bg-background shadow-xl">
            {sourceFilterSuggestions.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onApplySuggestion(value)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-surface"
              >
                <span className="font-mono text-[12px] text-blue-600">
                  {formatSourceFilterToken(value)}
                </span>
                <span className="text-muted-foreground">
                  {getSourceFilterLabel(t, value)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {isSearching && (
        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />
      )}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => {
            if (currentProjectName)
              setSearchCurrentProjectOnly(!searchCurrentProjectOnly)
          }}
          disabled={!currentProjectName}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
            !currentProjectName
              ? 'border-border/50 text-muted-foreground/40 cursor-not-allowed'
              : searchCurrentProjectOnly
                ? 'border-blue-500/30 bg-blue-500/8 text-blue-600'
                : 'border-border/70 text-muted-foreground hover:text-foreground hover:bg-surface'
          }`}
          title={
            currentProjectName
              ? t('command.currentProjectOnly', 'Current project only')
              : t('command.noProject', 'No active project')
          }
        >
          <FolderOpen className="w-4 h-4" />
        </button>
        <kbd className="inline-flex h-9 items-center rounded-lg border border-border/70 bg-surface px-2.5 text-[10px] text-muted-foreground font-mono">
          ESC
        </kbd>
      </div>
    </div>
  )
}
