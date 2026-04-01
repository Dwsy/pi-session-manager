import { MessageSquare, FolderOpen, FileText, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function CommandHints() {
  const { t } = useTranslation()
  
  const hints = [
    {
      icon: MessageSquare,
      title: t('command.hints.messages', 'Search messages'),
      examples: [
        t('command.hints.messageExample1', '"auth" - Search messages containing auth'),
        t('command.hints.messageExample2', '"error" - Search error related messages'),
      ]
    },
    {
      icon: FolderOpen,
      title: t('command.hints.projects', 'Search projects'),
      examples: [
        t('command.hints.projectExample1', '"pi-session" - Search project names'),
        t('command.hints.projectExample2', '"/Users/..." - Search project paths'),
      ]
    },
    {
      icon: FileText,
      title: t('command.hints.sessions', 'Search sessions'),
      examples: [
        t('command.hints.sessionExample1', '"implement feature" - Search session names'),
        t('command.hints.sessionExample2', '"today" - Search recent sessions'),
      ]
    }
  ]
  
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-medium text-foreground">
          {t('command.hints.title', 'Search tips')}
        </h3>
      </div>
      
      <div className="space-y-4">
        {hints.map((hint, index) => (
          <div key={index} className="space-y-2">
            <div className="flex items-center gap-2">
              <hint.icon className="w-4 h-4 text-muted-foreground" />
              <h4 className="text-sm font-medium text-foreground">
                {hint.title}
              </h4>
            </div>
            <ul className="space-y-1 ml-6">
              {hint.examples.map((example, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  {example}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{t('command.hints.navigate', 'Use ↑↓ to navigate')}</span>
          <span>{t('command.hints.select', 'Press Enter to select')}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground/80">
          <span>{t('command.hints.switchTab', 'Alt + 1/2/3/4 to switch categories')}</span>
          <span>{t('command.hints.scopeToggle', 'Click project button to switch search scope')}</span>
        </div>
      </div>
    </div>
  )
}
