import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function CommandLoading() {
  const { t } = useTranslation()
  
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-6 h-6 text-muted-foreground animate-spin mr-2" />
      <span className="text-sm text-muted-foreground">
        {t('command.loading', 'Searching...')}
      </span>
    </div>
  )
}
