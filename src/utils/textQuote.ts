import type { PsmTextQuoteSelector } from '@dwsy/plugin-sdk'

/**
 * Text-quote anchoring over rendered DOM text (W3C Web Annotation
 * TextQuoteSelector subset). The quote is stored normalized; anchoring maps
 * normalized offsets back to raw DOM text offsets so highlights survive
 * markdown re-renders and whitespace drift.
 */

export const TEXT_QUOTE_CONTEXT_CHARS = 32

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ')
}

interface NormalizedTextIndex {
  raw: string
  norm: string
  /** norm offset -> raw offset of the first raw char backing that norm char */
  normToRaw: number[]
}

function buildNormalizedIndex(raw: string): NormalizedTextIndex {
  const normChars: string[] = []
  const normToRaw: number[] = []
  let index = 0
  while (index < raw.length) {
    const char = raw[index]
    if (/\s/.test(char)) {
      normChars.push(' ')
      normToRaw.push(index)
      while (index < raw.length && /\s/.test(raw[index])) index += 1
    } else {
      normChars.push(char)
      normToRaw.push(index)
      index += 1
    }
  }
  return { raw, norm: normChars.join(''), normToRaw }
}

/** Raw offset one past the norm char at `normIndex`, respecting whitespace runs. */
function rawEndForNormIndex(index: NormalizedTextIndex, normIndex: number): number {
  if (normIndex + 1 < index.norm.length) return index.normToRaw[normIndex + 1]
  return index.raw.length
}

function compareBackward(haystack: string, needle: string): number {
  const span = Math.min(haystack.length, needle.length, TEXT_QUOTE_CONTEXT_CHARS)
  let matched = 0
  for (let step = 1; step <= span; step += 1) {
    if (haystack[haystack.length - step] !== needle[needle.length - step]) break
    matched = step
  }
  return matched
}

function compareForward(haystack: string, needle: string): number {
  const span = Math.min(haystack.length, needle.length, TEXT_QUOTE_CONTEXT_CHARS)
  let matched = 0
  for (let step = 0; step < span; step += 1) {
    if (haystack[step] !== needle[step]) break
    matched += 1
  }
  return matched
}

export interface TextQuoteMatch {
  /** Raw DOM text offsets into `root.textContent`. */
  start: number
  end: number
  score: number
}

/**
 * Locate `quote` inside `root`'s text. Returns every candidate match with a
 * prefix/suffix disambiguation score, best first. Empty array when the exact
 * text cannot be found (e.g. the source entry was edited).
 */
export function findQuoteMatches(root: Node, quote: PsmTextQuoteSelector): TextQuoteMatch[] {
  const exact = normalizeWhitespace(quote.exact ?? '').trim()
  if (!exact) return []
  const index = buildNormalizedIndex(root.textContent ?? '')
  if (!index.norm) return []

  const prefix = normalizeWhitespace(quote.prefix ?? '')
  const suffix = normalizeWhitespace(quote.suffix ?? '')

  const matches: TextQuoteMatch[] = []
  let from = 0
  for (;;) {
    const at = index.norm.indexOf(exact, from)
    if (at === -1) break
    const end = at + exact.length
    const score =
      compareBackward(index.norm.slice(Math.max(0, at - TEXT_QUOTE_CONTEXT_CHARS), at), prefix) +
      compareForward(index.norm.slice(end, end + TEXT_QUOTE_CONTEXT_CHARS), suffix)
    matches.push({
      start: index.normToRaw[at],
      end: rawEndForNormIndex(index, end - 1),
      score,
    })
    from = at + 1
  }
  return matches.sort((a, b) => b.score - a.score || a.start - b.start)
}

function resolveRawRange(root: Node, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let consumed = 0
  let startSet = false
  let node = walker.nextNode() as Text | null
  while (node) {
    const length = node.data.length
    if (!startSet && consumed + length >= start) {
      range.setStart(node, start - consumed)
      startSet = true
    }
    if (startSet && consumed + length >= end) {
      range.setEnd(node, end - consumed)
      return range
    }
    consumed += length
    node = walker.nextNode() as Text | null
  }
  return null
}

/** Best DOM Range for `quote`, or null when the text is gone. */
export function findQuoteRange(root: Node, quote: PsmTextQuoteSelector): Range | null {
  const [best] = findQuoteMatches(root, quote)
  if (!best) return null
  return resolveRawRange(root, best.start, best.end)
}

function rawOffsetForBoundary(root: Node, container: Node, offset: number): number | null {
  const prefix = document.createRange()
  prefix.selectNodeContents(root)
  try {
    prefix.setEnd(container, offset)
  } catch {
    return null
  }
  return prefix.toString().length
}

/** Build a text quote for `range` (collapsed or outside `root` -> null). */
export function extractTextQuote(root: Node, range: Range): PsmTextQuoteSelector | null {
  if (range.collapsed) return null
  const start = rawOffsetForBoundary(root, range.startContainer, range.startOffset)
  const end = rawOffsetForBoundary(root, range.endContainer, range.endOffset)
  if (start === null || end === null || end <= start) return null

  const raw = root.textContent ?? ''
  const selectedRaw = raw.slice(start, end)
  const exact = normalizeWhitespace(selectedRaw).trim()
  if (!exact) return null

  const prefixStart = Math.max(0, start - TEXT_QUOTE_CONTEXT_CHARS * 2)
  const suffixEnd = Math.min(raw.length, end + TEXT_QUOTE_CONTEXT_CHARS * 2)
  const prefix = normalizeWhitespace(raw.slice(prefixStart, start)).slice(-TEXT_QUOTE_CONTEXT_CHARS)
  const suffix = normalizeWhitespace(raw.slice(end, suffixEnd)).slice(0, TEXT_QUOTE_CONTEXT_CHARS)
  return { exact, prefix, suffix }
}

/**
 * Wrap every text run of `range` in a `<mark>` element. Handles ranges that
 * span partial elements (extract + reinsert) without corrupting the DOM.
 */
export function wrapRange(range: Range, mark: HTMLElement): void {
  if (range.collapsed) return
  mark.appendChild(range.extractContents())
  range.insertNode(mark)
}
