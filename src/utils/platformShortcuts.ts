import { detectPlatform, shouldUseTauriDragRegion as platformShouldUseTauriDragRegion } from "./platform";

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
  return explicitIsMac ?? detectPlatform() === "macos";
}

export function shouldUseTauriDragRegion(explicitIsMac?: boolean): boolean {
  return explicitIsMac ?? platformShouldUseTauriDragRegion();
}

export function formatShortcutDisplay(
  shortcut: string,
  options?: { isMac?: boolean; symbolic?: boolean },
): string {
  const mac = options?.isMac ?? detectPlatform() === "macos"
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
  if (isMacPlatform(options?.isMac)) {
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
