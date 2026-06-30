import { marked, type Tokens } from 'marked'
import { createHighlighterCoreSync } from '@shikijs/core'
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'
import bash from '@shikijs/langs/bash'
import c from '@shikijs/langs/c'
import cmake from '@shikijs/langs/cmake'
import cpp from '@shikijs/langs/cpp'
import csharp from '@shikijs/langs/csharp'
import css from '@shikijs/langs/css'
import dart from '@shikijs/langs/dart'
import dockerfile from '@shikijs/langs/dockerfile'
import go from '@shikijs/langs/go'
import graphql from '@shikijs/langs/graphql'
import html from '@shikijs/langs/html'
import ini from '@shikijs/langs/ini'
import java from '@shikijs/langs/java'
import javascript from '@shikijs/langs/javascript'
import kotlin from '@shikijs/langs/kotlin'
import lua from '@shikijs/langs/lua'
import json from '@shikijs/langs/json'
import jsx from '@shikijs/langs/jsx'
import make from '@shikijs/langs/make'
import markdown from '@shikijs/langs/markdown'
import php from '@shikijs/langs/php'
import powershell from '@shikijs/langs/powershell'
import python from '@shikijs/langs/python'
import ruby from '@shikijs/langs/ruby'
import rust from '@shikijs/langs/rust'
import scss from '@shikijs/langs/scss'
import shellscript from '@shikijs/langs/shellscript'
import sql from '@shikijs/langs/sql'
import svelte from '@shikijs/langs/svelte'
import swift from '@shikijs/langs/swift'
import toml from '@shikijs/langs/toml'
import tsx from '@shikijs/langs/tsx'
import typescript from '@shikijs/langs/typescript'
import vue from '@shikijs/langs/vue'
import xml from '@shikijs/langs/xml'
import yaml from '@shikijs/langs/yaml'
import catppuccinLatte from '@shikijs/themes/catppuccin-latte'
import catppuccinMocha from '@shikijs/themes/catppuccin-mocha'
import dracula from '@shikijs/themes/dracula'
import githubDark from '@shikijs/themes/github-dark'
import githubLight from '@shikijs/themes/github-light'
import monokai from '@shikijs/themes/monokai'
import nightOwl from '@shikijs/themes/night-owl'
import nord from '@shikijs/themes/nord'
import oneDarkPro from '@shikijs/themes/one-dark-pro'
import oneLight from '@shikijs/themes/one-light'
import rosePine from '@shikijs/themes/rose-pine'
import solarizedDark from '@shikijs/themes/solarized-dark'
import solarizedLight from '@shikijs/themes/solarized-light'
import tokyoNight from '@shikijs/themes/tokyo-night'
import { resolveShikiTheme } from './codeThemes'
import { classifyMarkdownLink, getMarkdownLinkConfirmationMessage } from './markdownLinkPolicy'

type ShikiLanguage =
  | 'bash'
  | 'shellscript'
  | 'typescript'
  | 'tsx'
  | 'javascript'
  | 'jsx'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'cpp'
  | 'c'
  | 'csharp'
  | 'css'
  | 'scss'
  | 'html'
  | 'xml'
  | 'dart'
  | 'graphql'
  | 'kotlin'
  | 'lua'
  | 'json'
  | 'markdown'
  | 'php'
  | 'powershell'
  | 'yaml'
  | 'sql'
  | 'dockerfile'
  | 'make'
  | 'cmake'
  | 'toml'
  | 'ini'
  | 'vue'
  | 'svelte'
  | 'ruby'
  | 'swift'

type ShikiTheme =
  | 'one-dark-pro'
  | 'monokai'
  | 'dracula'
  | 'github-dark'
  | 'github-light'
  | 'catppuccin-mocha'
  | 'catppuccin-latte'
  | 'tokyo-night'
  | 'night-owl'
  | 'nord'
  | 'solarized-dark'
  | 'solarized-light'
  | 'rose-pine'
  | 'one-light'

const shikiHighlighter = createHighlighterCoreSync({
  themes: [
    oneDarkPro, monokai, dracula, githubDark, githubLight,
    catppuccinMocha, catppuccinLatte, tokyoNight, nightOwl, nord,
    solarizedDark, solarizedLight, rosePine, oneLight,
  ],
  langs: [
    typescript,
    tsx,
    javascript,
    jsx,
    python,
    ruby,
    rust,
    go,
    java,
    cpp,
    c,
    csharp,
    css,
    dart,
    scss,
    html,
    xml,
    graphql,
    kotlin,
    lua,
    json,
    markdown,
    php,
    powershell,
    yaml,
    bash,
    shellscript,
    sql,
    dockerfile,
    make,
    cmake,
    toml,
    ini,
    vue,
    svelte,
    swift,
  ],
  engine: createJavaScriptRegexEngine(),
})

const shikiLanguageAliases: Record<string, ShikiLanguage> = {
  bash: 'bash',
  shell: 'shellscript',
  sh: 'shellscript',
  zsh: 'shellscript',
  fish: 'shellscript',
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  py: 'python',
  rs: 'rust',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  md: 'markdown',
  yml: 'yaml',
  makefile: 'make',
  docker: 'dockerfile',
  dockerfile: 'dockerfile',
}

const loadedShikiLanguages = new Set<string>(shikiHighlighter.getLoadedLanguages())

function normalizeShikiLanguage(language?: string): ShikiLanguage | undefined {
  const rawLanguage = language?.trim().toLowerCase().replace(/^language-/, '')
  if (!rawLanguage) {
    return undefined
  }

  const normalized = shikiLanguageAliases[rawLanguage] ?? rawLanguage
  return loadedShikiLanguages.has(normalized) ? normalized as ShikiLanguage : undefined
}

function getCurrentShikiTheme(): ShikiTheme {
  if (typeof document === 'undefined') {
    return 'one-dark-pro'
  }
  const codeTheme = document.documentElement.getAttribute('data-code-theme') || 'github'
  return resolveShikiTheme(codeTheme) as ShikiTheme
}

function stripShikiPreCode(html: string): string {
  const match = html.match(/^<pre[^>]*><code[^>]*>([\s\S]*)<\/code><\/pre>$/)
  return match ? match[1] : html
}

function renderShikiCodeHtml(code: string, language?: string, themeOverride?: ShikiTheme): string {
  const lang = normalizeShikiLanguage(language)
  if (!lang) {
    return escapeHtml(code)
  }

  try {
    return stripShikiPreCode(shikiHighlighter.codeToHtml(code, {
      lang,
      theme: themeOverride ?? getCurrentShikiTheme(),
    }))
  } catch {
    return escapeHtml(code)
  }
}

// Custom renderer
const renderer = new marked.Renderer()

// Custom code block rendering
renderer.code = function({ text, lang }: { text: string; lang?: string }): string {
  const language = lang || ''
  const validLang = normalizeShikiLanguage(language)
  const highlightedCode = renderShikiCodeHtml(text, validLang)

  // Return complete code block HTML. Keep controls in the top-right overlay;
  // line numbers are intentionally omitted for markdown content to avoid
  // misalignment and wasted vertical space in chat messages.
  return `
    <div class="code-block-wrapper markdown-code-block">
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
        <pre class="code-block"><code class="shiki ${validLang || ''}">${highlightedCode}</code></pre>
      </div>
    </div>
  `
}

// Unsafe protocols never reach the DOM as active href values; click handling
// performs the final open/confirm step in MarkdownContent.
renderer.link = function({ href, title, tokens }: Tokens.Link): string {
  const label = this.parser.parseInline(tokens)
  const target = classifyMarkdownLink(href)
  const safeHref = target.kind === 'anchor' ? href : '#'
  const safeTitle = title || (target.kind === 'unsupported' ? getMarkdownLinkConfirmationMessage(target) : undefined)
  const titleAttr = safeTitle ? ` title="${escapeHtml(safeTitle)}"` : ''
  const rawHrefAttr = ` data-markdown-href="${escapeHtml(href)}"`
  return `<a href="${escapeHtml(safeHref)}"${rawHrefAttr}${titleAttr}>${label}</a>`
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
  const theme = getCurrentShikiTheme()
  let hash1 = 5381
  let hash2 = 52711
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    hash1 = ((hash1 << 5) + hash1) ^ code
    hash2 = ((hash2 << 5) + hash2) ^ code
  }
  return `${theme}:${text.length}:${(hash1 >>> 0).toString(16)}:${(hash2 >>> 0).toString(16)}`
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

function preprocessXmlBlocks(text: string): string {
  // Mask code blocks to avoid rendering XML tags inside them
  const codeBlocks: string[] = [];
  const maskPlaceholder = (index: number) => `__XML_MASK_PLACEHOLDER_${index}__`;

  // Regex to match markdown code blocks and inline code
  const codeBlockRegex = /(```[\s\S]*?```|`[^`\n]+`)/g;

  let maskedText = text.replace(codeBlockRegex, (match) => {
    codeBlocks.push(match);
    return maskPlaceholder(codeBlocks.length - 1);
  });

  // Now process the XML blocks in the masked text
  const xmlBlockRegex = /<(read-files|modified-files|read-file|write-file|task|goals|plan|file|files|details)\s*>([\s\S]*?)<\/\1>/gi;

  maskedText = maskedText.replace(xmlBlockRegex, (match, tagName, innerContent) => {
    // Parse the inner content as markdown.
    const parsedInner = marked.parse(innerContent.trim()) as string;

    // Convert to collapsible <details> tag with Tokyo Night styling
    return `
<details class="xml-details-block" open>
  <summary class="xml-details-summary">
    <span class="xml-details-title">${escapeHtml(tagName)}</span>
  </summary>
  <div class="xml-details-content">
    ${parsedInner}
  </div>
</details>
`;
  });

  // Restore masked code blocks
  for (let i = 0; i < codeBlocks.length; i++) {
    // Escape regex characters in the placeholder name to be safe
    const placeholder = maskPlaceholder(i);
    maskedText = maskedText.replace(placeholder, () => codeBlocks[i]);
  }

  return maskedText;
}

export function parseMarkdown(text: string): string {
  const now = Date.now()
  const cacheKey = createMarkdownCacheKey(text)
  const cached = getMarkdownCache(cacheKey, now)
  if (cached !== null) {
    return cached
  }

  const processedText = preprocessXmlBlocks(text)
  const parsed = marked.parse(processedText) as string
  if (!canCacheMarkdown(text, parsed)) {
    return parsed
  }
  return upsertMarkdownCache(cacheKey, parsed, now)
}

export function escapeHtml(text: string): string {
  if (typeof document === 'undefined') {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export function highlightCode(code: string, language?: string): string {
  return renderShikiCodeHtml(code, language)
}

export function renderCodeHtml(code: string, language?: string): string {
  return renderShikiCodeHtml(code, language)
}

export function renderCodeHtmlWithTheme(code: string, language: string | undefined, themeId: string): string {
  return renderShikiCodeHtml(code, language, resolveShikiTheme(themeId) as ShikiTheme)
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
    kt: 'kotlin',
  }
  return ext ? langMap[ext] : undefined
}
