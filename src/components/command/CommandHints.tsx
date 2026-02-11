import { MessageSquare, FolderOpen, FileText, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function CommandHints() {
  const { t } = useTranslation()
  
  const hints = [
    {
      icon: MessageSquare,
      title: t('command.hints.messages', '搜索消息'),
      examples: [
        t('command.hints.messageExample1', '"auth" - 搜索包含 auth 的消息'),
        t('command.hints.messageExample2', '"error" - 搜索错误相关消息'),
      ]
    },
    {
      icon: FolderOpen,
      title: t('command.hints.projects', '搜索项目'),
      examples: [
        t('command.hints.projectExample1', '"pi-session" - 搜索项目名称'),
        t('command.hints.projectExample2', '"/Users/..." - 搜索项目路径'),
      ]
    },
    {
      icon: FileText,
      title: t('command.hints.sessions', '搜索会话'),
      examples: [
        t('command.hints.sessionExample1', '"实现功能" - 搜索会话名称'),
        t('command.hints.sessionExample2', '"今天" - 搜索最近会话'),
      ]
    }
  ]
  
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-medium text-foreground">
          {t('command.hints.title', '搜索提示')}
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
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t('command.hints.navigate', '使用 ↑↓ 导航')}</span>
          <span>{t('command.hints.select', '按 Enter 选择')}</span>
        </div>
      </div>
    </div>
  )
}
