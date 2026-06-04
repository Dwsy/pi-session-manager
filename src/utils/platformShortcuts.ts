function resolveIsMac(explicitIsMac?: boolean): boolean {
  if (typeof explicitIsMac === 'boolean') {
    return explicitIsMac
  }

  if (typeof navigator === 'undefined') {
    return false
  }

  const platform = navigator.platform || ''
  const userAgent = navigator.userAgent || ''
  const value = `${platform} ${userAgent}`.toUpperCase()

  return value.includes('MAC') || value.includes('MACINTOSH')
}

function tokenizeShortcut(shortcut: string): string[] {
  return shortcut
    .replace(/⌘/g, 'Cmd+')
    .replace(/⌃/g, 'Ctrl+')
    .replace(/⌥/g, 'Alt+')
    .replace(/⇧/g, 'Shift+')
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
}

export function isMacPlatform(explicitIsMac?: boolean): boolean {
  return resolveIsMac(explicitIsMac)
}

export function shouldUseTauriDragRegion(explicitIsMac?: boolean): boolean {
  return resolveIsMac(explicitIsMac)
}

export function formatShortcutDisplay(
  shortcut: string,
  options?: { isMac?: boolean; symbolic?: boolean },
): string {
  const mac = resolveIsMac(options?.isMac)
  const symbolic = options?.symbolic ?? false
  const tokens = tokenizeShortcut(shortcut)

  const macMap: Record<string, string> = symbolic
    ? {
        Cmd: '⌘',
        Ctrl: '⌃',
        Alt: '⌥',
        Option: '⌥',
        Shift: '⇧',
      }
    : {
        Cmd: 'Cmd',
        Ctrl: 'Ctrl',
        Alt: 'Alt',
        Option: 'Option',
        Shift: 'Shift',
      }

  const otherMap: Record<string, string> = {
    Cmd: 'Ctrl',
    Ctrl: 'Ctrl',
    Alt: 'Alt',
    Option: 'Alt',
    Shift: 'Shift',
  }

  const map = mac ? macMap : otherMap
  const parts = tokens.map((token) => map[token] ?? token)

  return mac && symbolic ? parts.join('') : parts.join('+')
}

export function formatShortcutText(text: string, options?: { isMac?: boolean }): string {
  if (resolveIsMac(options?.isMac)) {
    return text
  }

  return text
    .replace(/⌘\s*([A-Za-z0-9`,])/g, 'Ctrl+$1')
    .replace(/⌃\s*([A-Za-z0-9`,])/g, 'Ctrl+$1')
    .replace(/⌥\s*([A-Za-z0-9`,])/g, 'Alt+$1')
    .replace(/⇧\s*([A-Za-z0-9`,])/g, 'Shift+$1')
    .replace(/\bCmd\b/g, 'Ctrl')
    .replace(/\bOption\b/g, 'Alt')
}

export function stripShortcutSuffix(text: string): string {
  return text.replace(/\s*\((?:Cmd|Ctrl|Alt|Option|Shift|⌘|⌃|⌥|⇧)[^)]+\)\s*$/u, '').trim()
}

export function appendShortcutLabel(
  text: string,
  shortcut: string,
  options?: { isMac?: boolean; symbolic?: boolean },
): string {
  const label = stripShortcutSuffix(text)
  return `${label} (${formatShortcutDisplay(shortcut, options)})`
}
