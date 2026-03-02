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
        <button class="code-copy-button" onclick="copyCode(this)" title="Copy code">
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

const PARSED_MARKDOWN_CACHE_MAX_SIZE = 600
const parsedMarkdownCache = new Map<string, string>()

function touchMarkdownCache(text: string, html: string): string {
  if (parsedMarkdownCache.has(text)) {
    parsedMarkdownCache.delete(text)
  }
  parsedMarkdownCache.set(text, html)

  if (parsedMarkdownCache.size > PARSED_MARKDOWN_CACHE_MAX_SIZE) {
    const oldestKey = parsedMarkdownCache.keys().next().value
    if (oldestKey) {
      parsedMarkdownCache.delete(oldestKey)
    }
  }

  return html
}

export function parseMarkdown(text: string): string {
  const cached = parsedMarkdownCache.get(text)
  if (cached !== undefined) {
    return touchMarkdownCache(text, cached)
  }

  const parsed = marked.parse(text) as string
  return touchMarkdownCache(text, parsed)
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