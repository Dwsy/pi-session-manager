import type { KanbanLabel } from './kanbanLabelsStore'

interface KanbanLabelBadgeProps {
  label: KanbanLabel
  compact?: boolean
}

function readableTextColor(hex: string) {
  const normalized = hex.replace('#', '')
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  const luminance = (red * 0.299 + green * 0.587 + blue * 0.114) / 255
  return luminance > 0.62 ? '#111827' : '#ffffff'
}

export default function KanbanLabelBadge({ label, compact = false }: KanbanLabelBadgeProps) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full font-medium ${compact ? 'px-1.5 py-0 text-[8px]' : 'px-2 py-0.5 text-[10px]'}`}
      style={{ backgroundColor: label.color, color: readableTextColor(label.color) }}
      title={label.description || label.name}
      data-testid="kanban-label-badge"
    >
      <span className="truncate">{label.name}</span>
    </span>
  )
}
