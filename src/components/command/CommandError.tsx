import { AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface CommandErrorProps {
  error?: string
}

export default function CommandError({ error }: CommandErrorProps) {
  const { t } = useTranslation()
  
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
      <p className="text-sm text-foreground mb-2">
        {t('command.error', 'Search error')}
      </p>
      <p className="text-xs text-muted-foreground">
        {error || t('command.errorHint', 'Please retry later or check console logs')}
      </p>
    </div>
  )
}
