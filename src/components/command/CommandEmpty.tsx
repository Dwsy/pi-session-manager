import { SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface CommandEmptyProps {
  query: string
}

export default function CommandEmpty({ query }: CommandEmptyProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <SearchX className="w-12 h-12 text-muted-foreground/50 mb-3" />
      <p className="text-sm text-muted-foreground">
        {t('command.empty', 'No results found')}
      </p>
      {query && (
        <p className="text-xs text-muted-foreground/70 mt-1">
          {t('command.emptyHint', { query, defaultValue: `Try searching with different keywords` })}
        </p>
      )}
    </div>
  )
}
