import type { Content } from '../types'

/**
 * Convert ANSI SGR escape sequences to Markdown + inline HTML.
 *
 * Mapping:
 *   \x1b[1m  → ** (bold)
 *   \x1b[3m  → * (italic)
 *   \x1b[4m  → <u> (underline, no native Markdown equivalent)
 *   \x1b[38;2;R;G;Bm → <span style="color:rgb(R,G,B)">
 *   \x1b[48;2;R;G;Bm → <span style="background-color:rgb(R,G,B)">
 *   \x1b[38;5;Nm → <span style="color:var(--ansi-5bit-N)"> (fallback)
 *   \x1b[0m  → reset (close all open tags)
 *
 * All other SGR sequences are stripped silently.
 * The output is valid Markdown + inline HTML that `marked` will pass through.
 */

// ── ANSI tokeniser ─────────────────────────────────────────────────────────

const ANSI_SGR = /\x1b\[([0-9;?]*)([a-zA-Z])/g

/** Extended 256-color palette (subset — common terminal defaults). */
const XTERM_COLORS: Record<number, string> = {
  0: '#000000', 1: '#cd0000', 2: '#00cd00', 3: '#cdcd00',
  4: '#0000ee', 5: '#cd00cd', 6: '#00cdcd', 7: '#e5e5e5',
  8: '#7f7f7f', 9: '#ff0000', 10: '#00ff00', 11: '#ffff00',
  12: '#5c5cff', 13: '#ff00ff', 14: '#00ffff', 15: '#ffffff',
  16: '#000000', 21: '#00005f', 22: '#000087', 231: '#ffffff',
  232: '#080808', 255: '#eeeeee',
}

interface StyleState {
  bold: boolean
  italic: boolean
  underline: boolean
  fgColor: string | null
  bgColor: string | null
}

/** Parse SGR params into style directives. */
function applySgr(codes: number[], state: StyleState): StyleState {
  if (codes.length === 0 || codes[0] === 0) {
    return { bold: false, italic: false, underline: false, fgColor: null, bgColor: null }
  }

  const next = { ...state }
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]
    if (c === 0) {
      next.bold = false; next.italic = false; next.underline = false
      next.fgColor = null; next.bgColor = null
    } else if (c === 1) {
      next.bold = true
    } else if (c === 3) {
      next.italic = true
    } else if (c === 4) {
      next.underline = true
    } else if (c === 22) {
      next.bold = false
    } else if (c === 23) {
      next.italic = false
    } else if (c === 24) {
      next.underline = false
    } else if (c === 38 && codes[i + 1] === 2 && i + 3 < codes.length) {
      // true color: 38;2;R;G;B
      const r = codes[i + 2], g = codes[i + 3], b = codes[i + 4]
      next.fgColor = `rgb(${r},${g},${b})`
      i += 4
    } else if (c === 38 && codes[i + 1] === 5 && i + 2 < codes.length) {
      // 256 color
      const idx = codes[i + 2]
      next.fgColor = XTERM_COLORS[idx] ?? `var(--ansi-5bit-${idx})`
      i += 2
    } else if (c === 48 && codes[i + 1] === 2 && i + 3 < codes.length) {
      const r = codes[i + 2], g = codes[i + 3], b = codes[i + 4]
      next.bgColor = `rgb(${r},${g},${b})`
      i += 4
    } else if (c === 48 && codes[i + 1] === 5 && i + 2 < codes.length) {
      const idx = codes[i + 2]
      next.bgColor = XTERM_COLORS[idx] ?? `var(--ansi-5bit-${idx})`
      i += 2
    } else if (c >= 30 && c <= 37) {
      // basic 8-color foreground
      const basicFg = ['#000', '#c00', '#0c0', '#cc0', '#00c', '#c0c', '#0cc', '#ccc']
      next.fgColor = basicFg[c - 30]
    } else if (c >= 40 && c <= 47) {
      // basic 8-color background
      const basicBg = ['#000', '#c00', '#0c0', '#cc0', '#00c', '#c0c', '#0cc', '#ccc']
      next.bgColor = basicBg[c - 40]
    } else if (c === 39) {
      next.fgColor = null
    } else if (c === 49) {
      next.bgColor = null
    }
  }
  return next
}

/**
 * Convert one ANSI-escaped text segment into Markdown + inline HTML.
 * Returns the converted string.
 */
export function ansiToMarkdown(text: string): string {
  // Fast path: no ANSI sequences at all
  if (!text.includes('\x1b')) return text

  const parts: string[] = []
  let lastIdx = 0
  let state: StyleState = { bold: false, italic: false, underline: false, fgColor: null, bgColor: null }
  const openTags: string[] = [] // stack of closing markers

  function flushOpenTags() {
    // Close all open tags in reverse order
    for (let i = openTags.length - 1; i >= 0; i--) {
      parts.push(openTags[i])
    }
    openTags.length = 0
  }

  function pushText(from: number, to: number) {
    if (to > from) {
      parts.push(text.slice(from, to))
    }
  }

  ANSI_SGR.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = ANSI_SGR.exec(text)) !== null) {
    pushText(lastIdx, match.index)

    const params = match[1]
    const terminator = match[2]

    if (terminator !== 'm') {
      // Non-SGR escape: skip entirely
      lastIdx = ANSI_SGR.lastIndex
      continue
    }

    const codes = params.split(';').filter(s => s.length > 0).map(Number)
    const newState = applySgr(codes, state)

    // Emit text between last escape and this one with current open tags
    // Then update open tag stack

    // Determine what tags need to close / open by comparing state → newState
    const tagsToClose: string[] = []
    const tagsToOpen: string[] = []

    if (state.bold && !newState.bold) tagsToClose.push('**')
    if (state.italic && !newState.italic) tagsToClose.push('*')
    if (state.underline && !newState.underline) tagsToClose.push('</u>')
    if (state.fgColor && !newState.fgColor) tagsToClose.push('</span>')
    if (state.bgColor && !newState.bgColor) tagsToClose.push('</span>')

    if (!state.underline && newState.underline) tagsToOpen.push('<u>')
    if (!state.fgColor && newState.fgColor) tagsToOpen.push(`<span style="color:${newState.fgColor}">`)
    if (!state.bgColor && newState.bgColor) tagsToOpen.push(`<span style="background-color:${newState.bgColor}">`)
    if (!state.italic && newState.italic) tagsToOpen.push('*')
    if (!state.bold && newState.bold) tagsToOpen.push('**')

    // Close tags (reverse of open order: colors outside, then semantic)
    for (const t of tagsToClose) parts.push(t)
    for (const t of tagsToOpen) parts.push(t)

    // Rebuild openTags stack
    openTags.length = 0
    if (newState.bold) openTags.push('**')
    if (newState.italic) openTags.push('*')
    if (newState.bgColor) openTags.push('</span>')
    if (newState.fgColor) openTags.push('</span>')
    if (newState.underline) openTags.push('</u>')

    state = newState
    lastIdx = ANSI_SGR.lastIndex
  }

  // Remaining text
  pushText(lastIdx, text.length)

  // Close any remaining open tags
  flushOpenTags()

  return parts.join('')
}

// ── Original block-splitting logic (unchanged) ─────────────────────────────

export interface SplitAssistantTextBlocks {
  thinking: string[]
  text: string[]
}

export interface AssistantDisplayedBlocks {
  thinkingBlocks: string[]
  textBlocks: string[]
}

export function looksLikeThinkingText(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return false

  if (
    normalized.startsWith('thinking ...') ||
    normalized.startsWith('thinking…') ||
    normalized.startsWith('thinking:') ||
    normalized.startsWith('reasoning:') ||
    normalized.startsWith('Thinking:') ||
    normalized.startsWith('Thinking:') ||
    normalized.startsWith('Reasoning:') ||
    normalized.startsWith('Reasoning:')
  ) {
    return true
  }

  return normalized.includes('<think>') || normalized.includes('</think>')
}

export function splitAssistantTextBlocks(text: string): SplitAssistantTextBlocks {
  const result: SplitAssistantTextBlocks = { thinking: [], text: [] }
  const raw = text || ''
  if (!raw.trim()) return result

  const hasOpenTag = raw.includes('<think>')
  const hasCloseTag = raw.includes('</think>')

  if (!hasOpenTag && !hasCloseTag) {
    if (looksLikeThinkingText(raw)) {
      result.thinking.push(raw.trim())
    } else {
      result.text.push(raw)
    }
    return result
  }

  if (!hasOpenTag && hasCloseTag) {
    const closeTagIndex = raw.indexOf('</think>')
    const thinkingPart = raw.slice(0, closeTagIndex).trim()
    const textPart = raw.slice(closeTagIndex + '</think>'.length).trim()

    if (thinkingPart) result.thinking.push(thinkingPart)
    if (textPart) result.text.push(textPart)
    return result
  }

  const thinkPattern = /<think>([\s\S]*?)(?:<\/think>|$)/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = thinkPattern.exec(raw)) !== null) {
    const before = raw.slice(lastIndex, match.index).trim()
    if (before) {
      result.text.push(before)
    }

    const thinkingPart = (match[1] || '').trim()
    if (thinkingPart) {
      result.thinking.push(thinkingPart)
    }

    lastIndex = thinkPattern.lastIndex
  }

  const tail = raw.slice(lastIndex).trim()
  if (tail) {
    result.text.push(tail)
  }

  if (result.thinking.length === 0 && result.text.length === 0) {
    if (looksLikeThinkingText(raw)) {
      result.thinking.push(raw.trim())
    } else {
      result.text.push(raw)
    }
  }

  return result
}

export function getAssistantDisplayedBlocks(
  content: Content[],
): AssistantDisplayedBlocks {
  const textBlocks = content.filter((item) => item.type === 'text' && item.text)
  const extractedBlocks = textBlocks.map((item) =>
    splitAssistantTextBlocks(item.text || ''),
  )
  const thinkingBlocks = content
    .filter((item) => item.type === 'thinking' && item.thinking)
    .map((item) => ansiToMarkdown(item.thinking as string))

  return {
    thinkingBlocks: [
      ...thinkingBlocks,
      ...extractedBlocks.flatMap((block) => block.thinking.map(ansiToMarkdown)),
    ],
    textBlocks: extractedBlocks.flatMap((block) => block.text),
  }
}
