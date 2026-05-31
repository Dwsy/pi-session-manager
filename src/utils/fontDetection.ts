/**
 * System font detection — Tauri native + Canvas fallback.
 *
 * In Tauri (desktop), uses font-kit to list system fonts via Rust.
 * In browser/WS, uses Canvas width comparison to detect installed fonts.
 */

import type { FontPreset } from './codeThemes'

export interface DetectedFont {
  /** Display family name */
  family: string
  /** PostScript name (Tauri only) */
  postscriptName?: string
  /** Whether detected as monospace */
  isMonospace: boolean
  /** Source of detection */
  source: 'system' | 'preset'
}

/** Whether we're running inside Tauri */
function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__ !== 'undefined'
}

// ─── Tauri path ──────────────────────────────────────────────

interface TauriFont {
  family: string
  postscript_name?: string | null
}

async function listFontsViaTauri(monospaceOnly: boolean): Promise<DetectedFont[]> {
  const { invoke } = await import('@tauri-apps/api/core')
  const command = monospaceOnly ? 'list_monospace_fonts' : 'list_system_fonts'
  const fonts: TauriFont[] = await invoke(command)
  return fonts.map((f) => ({
    family: f.family,
    postscriptName: f.postscript_name ?? undefined,
    isMonospace: monospaceOnly,
    source: 'system' as const,
  }))
}

// ─── Canvas fallback path ────────────────────────────────────

/**
 * Test string widths. A font is monospace if all chars share the same advance width.
 */
const REFERENCE_FONTS = 'monospace'
const CANVAS_FONT_SIZE = 72

let canvasCtx: CanvasRenderingContext2D | null = null
function getCtx(): CanvasRenderingContext2D {
  if (!canvasCtx) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    canvasCtx = canvas.getContext('2d')!
  }
  return canvasCtx
}

function measureWidth(text: string, fontFamily: string): number {
  const ctx = getCtx()
  ctx.font = `${CANVAS_FONT_SIZE}px ${fontFamily}, ${REFERENCE_FONTS}`
  return ctx.measureText(text).width
}

/**
 * Check if a font is installed by comparing width against the reference monospace.
 * If the width differs, the font is installed.
 */
function isFontInstalled(fontName: string): boolean {
  const refWidth = measureWidth('mmmmmmmmmmlli', `${REFERENCE_FONTS}`)
  const testWidth = measureWidth('mmmmmmmmmmlli', `"${fontName}", ${REFERENCE_FONTS}`)
  // Threshold: >1% difference means the font is installed
  return Math.abs(testWidth - refWidth) / refWidth > 0.01
}

/**
 * Check if a font renders as monospace (i and W have same width).
 */
function checkMonospace(fontName: string): boolean {
  const wI = measureWidth('i', `"${fontName}"`)
  const wW = measureWidth('W', `"${fontName}"`)
  return Math.abs(wI - wW) / wI < 0.02
}

/** Well-known monospace fonts to probe */
const PROBE_MONO_FONTS = [
  'JetBrains Mono',
  'Fira Code',
  'Cascadia Code',
  'Cascadia Mono',
  'Source Code Pro',
  'SF Mono',
  'SFMono-Regular',
  'Menlo',
  'Monaco',
  'Consolas',
  'Courier New',
  'Courier',
  'DejaVu Sans Mono',
  'Liberation Mono',
  'Roboto Mono',
  'IBM Plex Mono',
  'Inconsolata',
  'Ubuntu Mono',
  'Droid Sans Mono',
  'Anonymous Pro',
  'Hack',
  'Iosevka',
  'Meslo LG M',
  'Noto Sans Mono',
  'Lucida Console',
  'Fixedsys',
  'Terminal',
  'monospace',
]

/** Well-known proportional fonts to probe (for the full list mode) */
const PROBE_PROP_FONTS = [
  'Arial',
  'Helvetica',
  'Helvetica Neue',
  'Times New Roman',
  'Georgia',
  'Verdana',
  'Trebuchet MS',
  'Palatino',
  'Garamond',
  'Segoe UI',
  'San Francisco',
  'SF Pro Text',
  'PingFang SC',
  'Microsoft YaHei',
  'Noto Sans CJK SC',
  'Hiragino Sans',
  'Noto Sans',
  'Roboto',
  'Inter',
  'Open Sans',
]

async function listFontsViaCanvas(monospaceOnly: boolean): Promise<DetectedFont[]> {
  // Run detection in a microtask to avoid blocking UI
  return new Promise((resolve) => {
    setTimeout(() => {
      const probe = monospaceOnly ? PROBE_MONO_FONTS : [...PROBE_MONO_FONTS, ...PROBE_PROP_FONTS]
      const result: DetectedFont[] = []

      for (const name of probe) {
        if (isFontInstalled(name)) {
          const isMono = monospaceOnly || checkMonospace(name)
          if (!monospaceOnly || isMono) {
            result.push({
              family: name,
              isMonospace: isMono,
              source: 'system',
            })
          }
        }
      }

      resolve(result)
    }, 0)
  })
}

// ─── Public API ──────────────────────────────────────────────

/**
 * List all installed monospace fonts.
 * Falls back to canvas detection when Tauri is unavailable.
 */
export async function listSystemMonospaceFonts(): Promise<DetectedFont[]> {
  try {
    if (isTauriEnv()) {
      return await listFontsViaTauri(true)
    }
  } catch {
    // Tauri invoke failed, fall through to canvas
  }
  return listFontsViaCanvas(true)
}

/**
 * List all installed fonts (monospace + proportional).
 */
export async function listAllSystemFonts(): Promise<DetectedFont[]> {
  try {
    if (isTauriEnv()) {
      return await listFontsViaTauri(false)
    }
  } catch {
    // Fall through
  }
  return listFontsViaCanvas(false)
}

/**
 * Merge detected system fonts with built-in presets.
 * Deduplicates by family name (case-insensitive).
 */
export function mergeWithPresets(
  detected: DetectedFont[],
  presets: FontPreset[],
): DetectedFont[] {
  const detMap = new Map<string, DetectedFont>()
  for (const d of detected) {
    detMap.set(d.family.toLowerCase(), d)
  }

  const merged: DetectedFont[] = []

  // Add detected fonts first
  for (const d of detected) {
    merged.push(d)
  }

  // Add presets that weren't detected
  for (const p of presets) {
    // Extract the primary font name from CSS value (first quoted or unquoted token)
    const match = p.value.match(/^["']?([^"',]+)/)
    const primaryName = match?.[1]?.trim()
    if (primaryName && !detMap.has(primaryName.toLowerCase())) {
      merged.push({
        family: primaryName,
        isMonospace: true,
        source: 'preset',
      })
    }
  }

  return merged
}

/**
 * Check if a specific font is installed.
 */
export function checkFontInstalled(fontName: string): boolean {
  return isFontInstalled(fontName)
}
