// Read the language from the bare i18next singleton (same instance the app
// configures) to avoid importing '@/i18n', whose module side effects break
// tests that fully mock react-i18next.
import i18n from 'i18next'
import { splitPathSegments } from './path'

export function formatBytes(bytes: number, decimals: number = 0): string {
  if (bytes === 0) return '0 B'
  const sign = bytes < 0 ? '-' : ''
  const absoluteBytes = Math.abs(bytes)
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(
    Math.floor(Math.log(absoluteBytes) / Math.log(1024)),
    units.length - 1,
  )
  const value = absoluteBytes / Math.pow(1024, unitIndex)
  return `${sign}${value.toFixed(decimals).replace(/\.0+$/, '')} ${units[unitIndex]}`
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = Math.floor(seconds % 60)

  if (hours > 0) return `${hours}h ${minutes}m ${remainingSeconds}s`
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`
  return `${remainingSeconds}s`
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}…`
}

// Canonical compact number format for tokens and other large counts.
// Single source of truth: 1 decimal, lowercase k, uppercase M/B.
export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens === 0) return '0'
  const abs = Math.abs(tokens)
  if (abs >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return Math.round(tokens).toString()
}

export function formatDate(timestamp: string | Date): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const locale = i18n.language || undefined

  const timeStr = date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })

  if (isToday) {
    return timeStr
  }

  const dateStr = date.toLocaleDateString(locale, {
    month: '2-digit',
    day: '2-digit'
  })

  return `${dateStr} ${timeStr}`
}

export function shortenPath(path: string, maxLength: number = 50): string {
  if (path.length <= maxLength) return path
  const parts = splitPathSegments(path)
  if (parts.length <= 2) return path
  return `.../${parts.slice(-2).join('/')}`
}

export function replaceTabs(text: string, spaces: number = 2): string {
  return text.replace(/\t/g, ' '.repeat(spaces))
}
