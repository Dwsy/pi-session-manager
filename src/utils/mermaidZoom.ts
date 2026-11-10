export const MERMAID_ZOOM_STEP = 1.25
export const MERMAID_ZOOM_MAX = 8
const MERMAID_ZOOM_MIN = 0.05

/** Keep very large diagrams zoomable from their fitted size. */
export function minMermaidZoom(fitScale: number): number {
  return Math.min(MERMAID_ZOOM_MIN, fitScale)
}

export function clampMermaidZoom(scale: number, fitScale: number): number {
  return Math.min(MERMAID_ZOOM_MAX, Math.max(minMermaidZoom(fitScale), scale))
}

export function formatMermaidZoom(scale: number): string {
  const percent = scale * 100
  if (percent < 0.1) return '<0.1%'
  return (percent < 1 ? percent.toFixed(1) : Math.round(percent)) + '%'
}
