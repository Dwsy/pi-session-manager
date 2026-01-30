import { marked } from 'marked'
import hljs from 'highlight.js'

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
})

export function parseMarkdown(text: string): string {
  return marked.parse(text) as string
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