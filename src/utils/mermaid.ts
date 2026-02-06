export type MermaidSegment =
  | { type: 'markdown'; content: string }
  | { type: 'mermaid'; content: string }

const MERMAID_FENCE = /```mermaid\s*([\s\S]*?)```/gi

export function splitMermaidSegments(markdown: string): MermaidSegment[] {
  if (!markdown) {
    return []
  }

  const segments: MermaidSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = MERMAID_FENCE.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      const text = markdown.slice(lastIndex, match.index)
      if (text) {
        segments.push({ type: 'markdown', content: text })
      }
    }

    const rawCode = match[1] ?? ''
    const code = rawCode.trim()
    segments.push({ type: 'mermaid', content: code })

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < markdown.length) {
    const text = markdown.slice(lastIndex)
    if (text) {
      segments.push({ type: 'markdown', content: text })
    }
  }

  if (segments.length === 0) {
    return [{ type: 'markdown', content: markdown }]
  }

  return segments
}
