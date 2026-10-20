/**
 * Mermaid rendering through Ondine (https://ondine.sh).
 *
 * Ondine compiles Mermaid source to SVG in a single synchronous call: the diagram module ships as
 * base64 WebAssembly and is instantiated on the first render. The returned SVG carries no inline
 * colors other than `var(--ondine-*)` lookups, so diagrams follow the current app theme without a
 * recompile (see `_markdown.less` for the token mapping).
 */
import { create, RenderError } from 'ondine/compiler/wasm'
import { wasm as allDiagramModules } from 'ondine/compiler/wasm/all'

export interface MermaidDiagram {
  /** The SVG document, ready to be inserted into the DOM. */
  svg: string
  /** The detected diagram type, e.g. `flowchart`. */
  type: string
  /** Intrinsic width in CSS pixels. */
  width: number
  /** Intrinsic height in CSS pixels. */
  height: number
}

type DiagramRenderer = ReturnType<typeof create>

let renderer: DiagramRenderer | null = null
let rendererBroken = false
let diagramCounter = 0

function getRenderer(): DiagramRenderer | null {
  if (renderer) {
    return renderer
  }
  if (rendererBroken || typeof WebAssembly === 'undefined') {
    return null
  }
  try {
    renderer = create({ modules: { all: allDiagramModules } })
    return renderer
  } catch (error) {
    // The compiler is unusable in this runtime: keep rendering mermaid blocks as source.
    rendererBroken = true
    console.error('[ondine] mermaid compiler unavailable:', error)
    return null
  }
}

/**
 * Renders Mermaid source to SVG, or returns `null` when the source cannot be rendered (unsupported
 * diagram type, syntax error, or a runtime without WebAssembly).
 */
export function renderMermaidSvg(source: string): MermaidDiagram | null {
  const activeRenderer = getRenderer()
  if (!activeRenderer) {
    return null
  }

  diagramCounter += 1
  try {
    const diagram = activeRenderer.render(source, {
      // Keeps element IDs unique when several diagrams share one page.
      idPrefix: `md${diagramCounter.toString(36)}-`,
    })
    return {
      svg: diagram.svg,
      type: diagram.type,
      width: Math.round(diagram.width),
      height: Math.round(diagram.height),
    }
  } catch (error) {
    if (!(error instanceof RenderError)) {
      console.error('[ondine] failed to render mermaid diagram:', error)
    }
    return null
  }
}
