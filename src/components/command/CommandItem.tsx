import { Command } from 'cmdk'
import type { SearchPluginResult, SearchPlugin } from '@/plugins/types'

interface CommandItemProps {
  result: SearchPluginResult
  plugin: SearchPlugin
  onSelect: () => void
}

export default function CommandItem({ result, plugin, onSelect }: CommandItemProps) {
  const itemValue = `${plugin.id}:${result.id}`

  // Use custom renderer if provided by plugin
  if (plugin.renderItem) {
    return (
      <Command.Item
        value={itemValue}
        onSelect={onSelect}
        className="group px-3 py-2.5 rounded-lg border border-transparent hover:bg-surface/70 hover:border-border/70 data-[selected=true]:bg-surface data-[selected=true]:border-border motion-surface motion-color"
      >
        {plugin.renderItem(result)}
      </Command.Item>
    )
  }

  // Default rendering
  return (
    <Command.Item
      value={itemValue}
      onSelect={onSelect}
      className="group px-3 py-2.5 rounded-lg border border-transparent hover:bg-surface/70 hover:border-border/70 data-[selected=true]:bg-surface data-[selected=true]:border-border motion-surface motion-color"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        {result.icon && (
          <div className="flex-shrink-0 mt-0.5">
            {result.icon}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="text-sm font-medium text-foreground truncate">
            {result.title}
          </div>

          {/* Subtitle */}
          {result.subtitle && (
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {result.subtitle}
            </div>
          )}

          {/* Description */}
          {result.description && (
            <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {result.description}
            </div>
          )}
        </div>

        {/* Score (development mode) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="flex-shrink-0 text-xs text-muted-foreground">
            {result.score.toFixed(2)}
          </div>
        )}
      </div>
    </Command.Item>
  )
}
