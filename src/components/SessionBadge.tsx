interface SessionBadgeProps {
  type: 'new' | 'updated'
  className?: string
}

/**
 * 会话状态 Badge 组件
 * 显示 NEW 或 UPDATED 标签
 */
export function SessionBadge({ type, className = '' }: SessionBadgeProps) {
  const isNew = type === 'new'

  return (
    <span
      className={`
        inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase
        ${isNew 
          ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
        }
        ${className}
      `}
    >
      {isNew ? 'NEW' : 'UPDATED'}
    </span>
  )
}
