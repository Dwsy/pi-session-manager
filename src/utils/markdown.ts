import { marked } from 'marked'
import { codeToHtml } from 'shiki'
import type { BundledTheme } from 'shiki'

// 代码高亮缓存
const highlightCache = new Map<string, string>()

// 异步高亮代码块
async function highlightCodeBlock(code: string, lang: string, theme: BundledTheme = 'github-dark'): Promise<string> {
  const cacheKey = `${theme}:${lang}:${code}`
  
  if (highlightCache.has(cacheKey)) {
    return highlightCache.get(cacheKey)!
  }
  
  try {
    const html = await codeToHtml(code, {
      lang: lang || 'text',
      theme: theme,
      rootStyle: false, // 移除背景色
    })
    
    highlightCache.set(cacheKey, html)
    return html
  } catch (err) {
    console.warn('Failed to highlight code:', err)
    return `<pre><code>${escapeHtml(code)}</code></pre>`
  }
}

// 配置 marked 的基础选项
marked.setOptions({
  breaks: true,
  gfm: true,
})

// 异步解析 Markdown（带代码高亮）
export async function parseMarkdownAsync(text: string, theme: BundledTheme = 'github-dark'): Promise<string> {
  // 使用 marked.use 添加异步扩展
  const tokens = marked.lexer(text)
  
  // 遍历 tokens，找到代码块并异步高亮
  for (const token of tokens) {
    if (token.type === 'code') {
      const lang = token.lang || 'text'
      const code = token.text
      
      // 异步高亮代码
      const highlightedHtml = await highlightCodeBlock(code, lang, theme)
      
      // 计算行数
      const lines = code.split('\n')
      const lineCount = lines.length
      
      // 生成行号
      const lineNumbers = Array.from({ length: lineCount }, (_, i) => 
        `<div class="code-line-number">${i + 1}</div>`
      ).join('')
      
      // 构建完整的代码块 HTML
      token.type = 'html' as any
      ;(token as any).text = `
        <div class="code-block-wrapper">
          <div class="code-block-header">
            ${lang ? `<div class="code-language">${lang}</div>` : '<div class="code-language">code</div>'}
            <button class="code-copy-button" onclick="copyCode(this)" title="Copy code">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span class="code-copy-text">Copy</span>
            </button>
          </div>
          <div class="code-block-content">
            <div class="code-line-numbers">${lineNumbers}</div>
            <div class="shiki-wrapper">${highlightedHtml}</div>
          </div>
        </div>
      `
    }
  }
  
  // 使用 marked.parser 将 tokens 转换为 HTML
  return marked.parser(tokens)
}

// 同步版本（不带代码高亮，作为后备）
export function parseMarkdown(text: string): string {
  return marked.parse(text) as string
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export async function highlightCode(code: string, language?: string, theme: BundledTheme = 'github-dark'): Promise<string> {
  if (!language) {
    return escapeHtml(code)
  }
  try {
    return await codeToHtml(code, {
      lang: language,
      theme: theme,
      rootStyle: false, // 移除背景色
    })
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
