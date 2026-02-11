import { Command } from 'cmdk'
import type { SearchPluginResult, SearchPlugin } from '../../plugins/types'

interface CommandItemProps {
  result: SearchPluginResult
  plugin: SearchPlugin
  onSelect: () => void
}

export default function CommandItem({ result, plugin, onSelect }: CommandItemProps) {
  // 如果插件提供了自定义渲染，使用它
  if (plugin.renderItem) {
    return (
      <Command.Item
        value={result.id}
        onSelect={onSelect}
        className="px-3 py-2 rounded-md cursor-pointer hover:bg-surface data-[selected=true]:bg-surface transition-colors"
      >
        {plugin.renderItem(result)}
      </Command.Item>
    )
  }
  
  // 默认渲染
  return (
    <Command.Item
      value={result.id}
      onSelect={onSelect}
      className="px-3 py-2 rounded-md cursor-pointer hover:bg-surface data-[selected=true]:bg-surface transition-colors"
    >
      <div className="flex items-start gap-3">
        {/* 图标 */}
        {result.icon && (
          <div className="flex-shrink-0 mt-0.5">
            {result.icon}
          </div>
        )}
        
        {/* 内容 */}
        <div className="flex-1 min-w-0">
          {/* 标题 */}
          <div className="text-sm font-medium text-foreground truncate">
            {result.title}
          </div>
          
          {/* 副标题 */}
          {result.subtitle && (
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {result.subtitle}
            </div>
          )}
          
          {/* 描述 */}
          {result.description && (
            <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {result.description}
            </div>
          )}
        </div>
        
        {/* 分数（开发模式） */}
        {process.env.NODE_ENV === 'development' && (
          <div className="flex-shrink-0 text-xs text-muted-foreground">
            {result.score.toFixed(2)}
          </div>
        )}
      </div>
    </Command.Item>
  )
}
