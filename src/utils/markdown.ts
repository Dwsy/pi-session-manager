import { marked } from 'marked'
import hljs from 'highlight.js'

// Custom renderer
const renderer = new marked.Renderer()

// Custom code block rendering
renderer.code = function({ text, lang }: { text: string; lang?: string }): string {
  const language = lang || ''
  const validLang = language && hljs.getLanguage(language) ? language : ''
  
  // Highlight code
  let highlightedCode = escapeHtml(text)
  if (validLang) {
    try {
      highlightedCode = hljs.highlight(text, { language: validLang }).value
    } catch {
      highlightedCode = escapeHtml(text)
    }
  }
  
  // Calculate line count
  const lines = text.split('\n')
  const lineCount = lines.length
  
  // Generate line numbers
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => 
    `<div class="code-line-number">${i + 1}</div>`
  ).join('')
  
  // Return complete code block HTML
  return `
    <div class="code-block-wrapper">
      <div class="code-block-header">
        ${language ? `<div class="code-language">${language}</div>` : '<div class="code-language">code</div>'}
        <button class="code-copy-button" data-code-copy="true" aria-label="Copy code">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span class="code-copy-text">Copy</span>
        </button>
      </div>
      <div class="code-block-content">
        <div class="code-line-numbers">${lineNumbers}</div>
        <pre class="code-block"><code class="hljs ${validLang}">${highlightedCode}</code></pre>
      </div>
    </div>
  `
}

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
  renderer: renderer,
})

const PARSED_MARKDOWN_CACHE_MAX_ENTRIES = 120
const PARSED_MARKDOWN_CACHE_MAX_BYTES = 12 * 1024 * 1024
const PARSED_MARKDOWN_CACHE_TTL_MS = 5 * 60 * 1000
const PARSED_MARKDOWN_CACHE_MAX_SOURCE_LENGTH = 8 * 1024
const PARSED_MARKDOWN_CACHE_MAX_HTML_LENGTH = 64 * 1024

const SESSION_SWITCH_KEEP_ENTRIES = 24
const SESSION_SWITCH_KEEP_BYTES = 2 * 1024 * 1024

interface MarkdownCacheEntry {
  html: string
  bytes: number
  expiresAt: number
}

const parsedMarkdownCache = new Map<string, MarkdownCacheEntry>()
let parsedMarkdownCacheBytes = 0

function estimateStringBytes(text: string): number {
  return text.length * 2
}

function createMarkdownCacheKey(text: string): string {
  let hash1 = 5381
  let hash2 = 52711
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    hash1 = ((hash1 << 5) + hash1) ^ code
    hash2 = ((hash2 << 5) + hash2) ^ code
  }
  return `${text.length}:${(hash1 >>> 0).toString(16)}:${(hash2 >>> 0).toString(16)}`
}

function estimateEntryBytes(cacheKey: string, html: string): number {
  return estimateStringBytes(cacheKey) + estimateStringBytes(html)
}

function removeMarkdownCacheEntry(cacheKey: string): void {
  const existing = parsedMarkdownCache.get(cacheKey)
  if (!existing) {
    return
  }
  parsedMarkdownCache.delete(cacheKey)
  parsedMarkdownCacheBytes = Math.max(0, parsedMarkdownCacheBytes - existing.bytes)
}

function sweepExpiredMarkdownCache(now: number): void {
  for (const [cacheKey, entry] of parsedMarkdownCache) {
    if (entry.expiresAt <= now) {
      removeMarkdownCacheEntry(cacheKey)
    }
  }
}

function evictMarkdownCache(now: number): void {
  sweepExpiredMarkdownCache(now)
  while (
    parsedMarkdownCache.size > PARSED_MARKDOWN_CACHE_MAX_ENTRIES ||
    parsedMarkdownCacheBytes > PARSED_MARKDOWN_CACHE_MAX_BYTES
  ) {
    const oldestKey = parsedMarkdownCache.keys().next().value
    if (!oldestKey) {
      break
    }
    removeMarkdownCacheEntry(oldestKey)
  }
}

function canCacheMarkdown(text: string, html: string): boolean {
  return (
    text.length <= PARSED_MARKDOWN_CACHE_MAX_SOURCE_LENGTH &&
    html.length <= PARSED_MARKDOWN_CACHE_MAX_HTML_LENGTH
  )
}

function upsertMarkdownCache(cacheKey: string, html: string, now: number): string {
  removeMarkdownCacheEntry(cacheKey)
  const entry: MarkdownCacheEntry = {
    html,
    bytes: estimateEntryBytes(cacheKey, html),
    expiresAt: now + PARSED_MARKDOWN_CACHE_TTL_MS,
  }
  parsedMarkdownCache.set(cacheKey, entry)
  parsedMarkdownCacheBytes += entry.bytes
  evictMarkdownCache(now)
  return html
}

function getMarkdownCache(cacheKey: string, now: number): string | null {
  const cached = parsedMarkdownCache.get(cacheKey)
  if (!cached) {
    return null
  }
  if (cached.expiresAt <= now) {
    removeMarkdownCacheEntry(cacheKey)
    return null
  }
  return upsertMarkdownCache(cacheKey, cached.html, now)
}

export function trimMarkdownCacheOnSessionSwitch(): void {
  const now = Date.now()
  sweepExpiredMarkdownCache(now)
  while (
    parsedMarkdownCache.size > SESSION_SWITCH_KEEP_ENTRIES ||
    parsedMarkdownCacheBytes > SESSION_SWITCH_KEEP_BYTES
  ) {
    const oldestKey = parsedMarkdownCache.keys().next().value
    if (!oldestKey) {
      break
    }
    removeMarkdownCacheEntry(oldestKey)
  }
}

export function parseMarkdown(text: string): string {
  const now = Date.now()
  const cacheKey = createMarkdownCacheKey(text)
  const cached = getMarkdownCache(cacheKey, now)
  if (cached !== null) {
    return cached
  }

  const parsed = marked.parse(text) as string
  if (!canCacheMarkdown(text, parsed)) {
    return parsed
  }
  return upsertMarkdownCache(cacheKey, parsed, now)
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export function highlightCode(code: string, language?: string): string {
  if (!language) {
    return escapeHtml(code)
  }
  try {
    return hljs.highlight(code, { language }).value
  } catch {
    return escapeHtml(code)
  }
}

export function renderCodeHtml(code: string, language?: string): string {
  try {
    if (language) {
      return hljs.highlight(code, { language }).value
    }
    return hljs.highlightAuto(code).value
  } catch {
    try {
      return hljs.highlightAuto(code, []).value
    } catch {
      return escapeHtml(code)
    }
  }
}

export function getLanguageFromPath(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase()
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    css: 'css',
    scss: 'scss',
    html: 'html',
    htm: 'html',
    xml: 'xml',
    json: 'json',
    md: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'bash',
    sql: 'sql',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    cmake: 'cmake',
    toml: 'toml',
    ini: 'ini',
    conf: 'ini',
    vue: 'vue',
    svelte: 'svelte',
  }
  return ext ? langMap[ext] : undefined
}
