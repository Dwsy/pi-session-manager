export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`
  return tokens.toString()
}

export function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleString()
}

export function shortenPath(path: string, maxLength: number = 50): string {
  if (path.length <= maxLength) return path
  const parts = path.split('/')
  if (parts.length <= 2) return path
  return `.../${parts.slice(-2).join('/')}`
}

export function replaceTabs(text: string, spaces: number = 2): string {
  return text.replace(/\t/g, ' '.repeat(spaces))
}