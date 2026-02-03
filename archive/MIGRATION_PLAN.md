# Session Viewer 完整渲染功能迁移计划

## 目标

将原始 Pi Session HTML 的完整渲染功能迁移到当前的 Tauri + React 项目中，实现：
- Markdown 渲染
- 代码高亮
- 工具调用可视化
- 可展开输出
- 图片支持
- 思考内容展示
- 统计信息面板

---

## 当前状态分析

### 原始 HTML 功能清单

| 功能 | 实现方式 | 优先级 |
|------|---------|--------|
| Markdown 渲染 | marked.js v15.0.4 | P0 |
| 代码高亮 | highlight.js v11.9.0 | P0 |
| 用户消息渲染 | 图片 + Markdown | P0 |
| 助手消息渲染 | text + thinking + toolCalls | P0 |
| 工具调用渲染 | bash/read/write/edit 等专用组件 | P1 |
| 可展开输出 | 长文本折叠/展开 | P1 |
| 图片支持 | base64 图片显示 | P1 |
| 思考内容 | 完整显示 + 可折叠 | P1 |
| 统计信息 | tokens/cost/messages | P2 |
| 侧边栏导航 | 消息树形结构 | P2 |
| 复制链接 | 悬停显示 | P3 |
| 深色主题 | 50+ CSS 变量 | P0 |

### 当前 SessionViewer.tsx 局限

| 功能 | 状态 | 差距 |
|------|------|------|
| Markdown 渲染 | ❌ 无 | 需要集成 marked.js |
| 代码高亮 | ❌ 无 | 需要集成 highlight.js |
| 工具调用 | ❌ 无 | 需要实现专用渲染器 |
| 可展开输出 | ❌ 无 | 需要交互逻辑 |
| 图片支持 | ❌ 无 | 需要处理 base64 |
| 思考内容 | ⚠️ 仅 100 字符 | 需要完整显示 |
| 消息类型 | ⚠️ 仅 user/assistant | 需要扩展类型 |
| 样式 | ⚠️ 基础 CSS | 需要完整主题 |

---

## 迁移架构设计

### 组件层次结构

```
SessionViewer
├── SessionHeader (统计信息 + 系统提示)
├── MessageList
│   ├── UserMessage
│   │   ├── MessageImages
│   │   └── MarkdownContent
│   ├── AssistantMessage
│   │   ├── ThinkingBlock
│   │   ├── MarkdownContent
│   │   └── ToolCallList
│   │       ├── BashExecution
│   │       ├── ReadExecution
│   │       ├── WriteExecution
│   │       ├── EditExecution
│   │       └── GenericToolCall
│   ├── ToolResult
│   ├── ModelChange
│   ├── Compaction
│   ├── BranchSummary
│   └── CustomMessage
└── SessionStats (统计面板)
```

### 数据流

```
JSONL 文件
    ↓
read_session_file (Tauri)
    ↓
SessionEntry[]
    ↓
parseSessionEntries (前端)
    ↓
MessageRenderData[]
    ↓
各类型组件渲染
```

---

## Phase 1: 基础设施搭建

### 1.1 添加依赖

```bash
npm install marked highlight.js
npm install -D @types/highlight.js
```

**依赖说明：**
- `marked`: Markdown 解析器（与原始 HTML 版本一致）
- `highlight.js`: 代码高亮库（与原始 HTML 版本一致）

### 1.2 创建类型定义

**文件：** `src/types.ts`（扩展）

```typescript
// 扩展现有类型
export interface SessionEntry {
  type: string
  id: string
  parentId?: string
  timestamp: string
  message?: Message
  provider?: string
  modelId?: string
  tokensBefore?: number
  summary?: string
  display?: boolean
  customType?: string
  content?: any
}

export interface Message {
  role: string
  content: Content[]
  model?: string
  provider?: string
  usage?: TokenUsage
  stopReason?: string
  errorMessage?: string
  cancelled?: boolean
  exitCode?: number
  command?: string
  output?: string
}

export interface Content {
  type: 'text' | 'thinking' | 'image' | 'toolCall'
  text?: string
  thinking?: string
  mimeType?: string
  data?: string
  name?: string
  id?: string
  arguments?: Record<string, any>
}

export interface ToolResult {
  content: Content[]
  isError?: boolean
  details?: {
    diff?: string
  }
}

export interface TokenUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost?: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
  }
}

export interface SessionStats {
  userMessages: number
  assistantMessages: number
  toolResults: number
  customMessages: number
  compactions: number
  branchSummaries: number
  toolCalls: number
  tokens: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
  }
  cost: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
  }
  models: string[]
}
```

### 1.3 创建工具函数

**文件：** `src/utils/markdown.ts`

```typescript
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
    css: 'css',
    html: 'html',
    json: 'json',
    md: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    sql: 'sql',
  }
  return ext ? langMap[ext] : undefined
}
```

**文件：** `src/utils/format.ts`

```typescript
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`
  return tokens.toString()
}

export function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleString()
}

export function shortenPath(path: string, maxLength: number = 50): string {
  if (path.length <= maxLength) return path
  const parts = path.split('/')
  if (parts.length <= 2) return path
  return `.../${parts.slice(-2).join('/')}`
}

export function replaceTabs(text: string, spaces: number = 2): string {
  return text.replace(/\t/g, ' '.repeat(spaces))
}
```

**文件：** `src/utils/session.ts`

```typescript
import type { SessionEntry, SessionStats } from '../types'

export function parseSessionEntries(jsonlContent: string): SessionEntry[] {
  const entries: SessionEntry[] = []
  const lines = jsonlContent.split('\n').filter(line => line.trim())

  for (const line of lines) {
    try {
      const entry = JSON.parse(line)
      entries.push(entry)
    } catch (e) {
      console.warn('Failed to parse line:', line.substring(0, 100))
    }
  }

  return entries
}

export function computeStats(entries: SessionEntry[]): SessionStats {
  const stats: SessionStats = {
    userMessages: 0,
    assistantMessages: 0,
    toolResults: 0,
    customMessages: 0,
    compactions: 0,
    branchSummaries: 0,
    toolCalls: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    models: [],
  }

  const modelSet = new Set<string>()

  for (const entry of entries) {
    if (entry.type === 'message') {
      const msg = entry.message
      if (!msg) continue

      if (msg.role === 'user') stats.userMessages++
      if (msg.role === 'assistant') {
        stats.assistantMessages++
        if (msg.model) {
          const modelName = msg.provider ? `${msg.provider}/${msg.model}` : msg.model
          modelSet.add(modelName)
        }
        if (msg.usage) {
          stats.tokens.input += msg.usage.input || 0
          stats.tokens.output += msg.usage.output || 0
          stats.tokens.cacheRead += msg.usage.cacheRead || 0
          stats.tokens.cacheWrite += msg.usage.cacheWrite || 0
          if (msg.usage.cost) {
            stats.cost.input += msg.usage.cost.input || 0
            stats.cost.output += msg.usage.cost.output || 0
            stats.cost.cacheRead += msg.usage.cost.cacheRead || 0
            stats.cost.cacheWrite += msg.usage.cost.cacheWrite || 0
          }
        }
        stats.toolCalls += msg.content.filter(c => c.type === 'toolCall').length
      }
      if (msg.role === 'toolResult') stats.toolResults++
    } else if (entry.type === 'compaction') {
      stats.compactions++
    } else if (entry.type === 'branch_summary') {
      stats.branchSummaries++
    } else if (entry.type === 'custom_message') {
      stats.customMessages++
    }
  }

  stats.models = Array.from(modelSet)
  return stats
}

export function findToolResult(
  entries: SessionEntry[],
  toolCallId: string
): SessionEntry | null {
  return entries.find(
    e => e.type === 'message' &&
    e.message?.role === 'toolResult' &&
    e.message?.content.some((c: any) => c.id === toolCallId)
  ) || null
}
```

### 1.4 创建 CSS 变量主题

**文件：** `src/styles/session.css`

```css
:root {
  /* 原始 HTML 主题变量迁移 */
  --accent: #8abeb7;
  --border: #5f87ff;
  --borderAccent: #00d7ff;
  --borderMuted: #505050;
  --success: #b5bd68;
  --error: #cc6666;
  --warning: #ffff00;
  --muted: #808080;
  --dim: #666666;
  --text: #e5e5e7;
  --thinkingText: #808080;
  --selectedBg: #3a3a4a;
  --userMessageBg: #343541;
  --userMessageText: #e5e5e7;
  --customMessageBg: #2d2838;
  --customMessageText: #e5e5e7;
  --customMessageLabel: #9575cd;
  --toolPendingBg: #282832;
  --toolSuccessBg: #283228;
  --toolErrorBg: #3c2828;
  --toolTitle: #e5e5e7;
  --toolOutput: #808080;
  --mdHeading: #f0c674;
  --mdLink: #81a2be;
  --mdCode: #8abeb7;
  --syntaxComment: #6A9955;
  --syntaxKeyword: #569CD6;
  --syntaxFunction: #DCDCAA;
  --syntaxString: #CE9178;
  --body-bg: rgb(36, 37, 46);
  --container-bg: rgb(44, 45, 55);
}

.session-viewer {
  --line-height: 18px;
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: var(--line-height);
  color: var(--text);
  background: var(--body-bg);
  overflow-y: auto;
  padding: calc(var(--line-height) * 2);
}

/* Markdown 内容样式 */
.markdown-content {
  color: var(--text);
}

.markdown-content h1,
.markdown-content h2,
.markdown-content h3,
.markdown-content h4,
.markdown-content h5,
.markdown-content h6 {
  color: var(--mdHeading);
  margin: var(--line-height) 0 0 0;
  font-weight: bold;
}

.markdown-content h1 { font-size: 1em; }
.markdown-content h2 { font-size: 1em; }
.markdown-content h3 { font-size: 1em; }

.markdown-content p { margin: 0; }
.markdown-content p + p { margin-top: var(--line-height); }

.markdown-content code {
  background: rgba(128, 128, 128, 0.2);
  color: var(--mdCode);
  padding: 0 4px;
  border-radius: 3px;
  font-family: inherit;
}

.markdown-content pre {
  background: rgba(128, 128, 128, 0.05);
  margin: var(--line-height) 0;
  padding: var(--line-height);
  border-radius: 4px;
  overflow-x: auto;
}

.markdown-content pre code {
  background: transparent;
  padding: 0;
  color: var(--text);
}

.markdown-content blockquote {
  border-left: 3px solid var(--muted);
  padding-left: var(--line-height);
  margin: var(--line-height) 0;
  color: var(--muted);
  font-style: italic;
}

.markdown-content ul,
.markdown-content ol {
  margin: var(--line-height) 0;
  padding-left: calc(var(--line-height) * 2);
}

.markdown-content li { margin: 0; }
.markdown-content li::marker { color: var(--accent); }

/* 消息样式 */
.user-message {
  background: var(--userMessageBg);
  color: var(--userMessageText);
  padding: var(--line-height);
  border-radius: 4px;
  margin-bottom: var(--line-height);
}

.assistant-message {
  padding: 0;
  margin-bottom: var(--line-height);
}

.message-timestamp {
  font-size: 10px;
  color: var(--dim);
  opacity: 0.8;
  margin-bottom: calc(var(--line-height) / 2);
}

.assistant-text {
  padding: var(--line-height);
  padding-bottom: 0;
}

/* 思考内容 */
.thinking-block {
  padding: var(--line-height);
  color: var(--thinkingText);
  font-style: italic;
  white-space: pre-wrap;
}

.thinking-text {
  padding: var(--line-height);
  color: var(--thinkingText);
  font-style: italic;
}

/* 工具执行 */
.tool-execution {
  padding: var(--line-height);
  border-radius: 4px;
  margin-top: var(--line-height);
}

.tool-execution.pending { background: var(--toolPendingBg); }
.tool-execution.success { background: var(--toolSuccessBg); }
.tool-execution.error { background: var(--toolErrorBg); }

.tool-header, .tool-name {
  font-weight: bold;
}

.tool-path {
  color: var(--accent);
  word-break: break-all;
}

.tool-command {
  font-weight: bold;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
}

.tool-output {
  margin-top: var(--line-height);
  color: var(--toolOutput);
  word-wrap: break-word;
  overflow-wrap: break-word;
  font-family: inherit;
  overflow-x: auto;
}

.tool-output pre {
  margin: 0;
  padding: 0;
  font-family: inherit;
  color: inherit;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* Diff */
.tool-diff {
  font-size: 11px;
  overflow-x: auto;
  white-space: pre;
}

.diff-added { color: var(--success); }
.diff-removed { color: var(--error); }
.diff-context { color: var(--muted); }

/* 可展开内容 */
.expandable {
  cursor: pointer;
}

.expandable:hover {
  opacity: 0.9;
}

.expandable .output-full {
  display: none;
}

.expandable.expanded .output-preview {
  display: none;
}

.expandable.expanded .output-full {
  display: block;
}

.expand-hint {
  color: var(--toolOutput);
  margin-top: var(--line-height);
}

/* 图片 */
.message-images,
.tool-images {
  margin-bottom: calc(var(--line-height));
}

.message-image,
.tool-image {
  max-width: 100%;
  max-height: 500px;
  border-radius: 4px;
  margin: var(--line-height) 0;
}

/* 其他类型 */
.model-change {
  padding: 0 var(--line-height);
  color: var(--dim);
  font-size: 11px;
  margin-bottom: var(--line-height);
}

.model-name {
  color: var(--borderAccent);
  font-weight: bold;
}

.compaction {
  background: var(--customMessageBg);
  border-radius: 4px;
  padding: var(--line-height);
  cursor: pointer;
  margin-bottom: var(--line-height);
}

.compaction-label {
  color: var(--customMessageLabel);
  font-weight: bold;
}

.compaction-collapsed {
  color: var(--customMessageText);
}

.compaction-content {
  display: none;
  color: var(--customMessageText);
  white-space: pre-wrap;
  margin-top: var(--line-height);
}

.compaction.expanded .compaction-collapsed {
  display: none;
}

.compaction.expanded .compaction-content {
  display: block;
}

.branch-summary {
  background: var(--customMessageBg);
  padding: var(--line-height);
  border-radius: 4px;
  margin-bottom: var(--line-height);
}

.branch-summary-header {
  font-weight: bold;
  color: var(--borderAccent);
}

.hook-message {
  background: var(--customMessageBg);
  color: var(--customMessageText);
  padding: var(--line-height);
  border-radius: 4px;
  margin-bottom: var(--line-height);
}

.hook-type {
  color: var(--customMessageLabel);
  font-weight: bold;
}

.error-text {
  color: var(--error);
  padding: 0 var(--line-height);
}

/* 代码高亮 */
.hljs {
  background: transparent;
  color: var(--text);
}

.hljs-comment, .hljs-quote { color: var(--syntaxComment); }
.hljs-keyword, .hljs-selector-tag { color: var(--syntaxKeyword); }
.hljs-string, .hljs-doctag { color: var(--syntaxString); }
.hljs-function, .hljs-title { color: var(--syntaxFunction); }
```

---

## Phase 2: 核心组件实现

### 2.1 MarkdownContent 组件

**文件：** `src/components/MarkdownContent.tsx`

```typescript
import { useEffect, useRef } from 'react'
import { parseMarkdown } from '../utils/markdown'

interface MarkdownContentProps {
  content: string
  className?: string
}

export default function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = parseMarkdown(content)
    }
  }, [content])

  return <div ref={containerRef} className={`markdown-content ${className}`} />
}
```

### 2.2 ExpandableOutput 组件

**文件：** `src/components/ExpandableOutput.tsx`

```typescript
import { useState } from 'react'
import { highlightCode, getLanguageFromPath, replaceTabs, escapeHtml } from '../utils/markdown'

interface ExpandableOutputProps {
  text: string
  maxLines?: number
  language?: string
}

export default function ExpandableOutput({
  text,
  maxLines = 10,
  language
}: ExpandableOutputProps) {
  const [expanded, setExpanded] = useState(false)
  const lines = text.split('\n')
  const shouldExpand = lines.length > maxLines

  const renderContent = (content: string, highlight: boolean) => {
    const processed = replaceTabs(content)
    if (highlight && language) {
      const highlighted = highlightCode(processed, language)
      return `<pre><code class="hljs">${highlighted}</code></pre>`
    }
    const escaped = escapeHtml(processed)
    return `<div>${escaped.split('\n').map(line => `<div>${line}</div>`).join('')}</div>`
  }

  if (!shouldExpand) {
    return (
      <div
        className="tool-output"
        dangerouslySetInnerHTML={{
          __html: renderContent(text, !!language)
        }}
      />
    )
  }

  const preview = lines.slice(0, maxLines).join('\n')
  const remaining = lines.length - maxLines

  return (
    <div
      className={`tool-output expandable ${expanded ? 'expanded' : ''}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="output-preview">
        <div
          dangerouslySetInnerHTML={{
            __html: renderContent(preview, !!language)
          }}
        />
        <div className="expand-hint">... ({remaining} more lines, click to expand)</div>
      </div>
      <div className="output-full">
        <div
          dangerouslySetInnerHTML={{
            __html: renderContent(text, !!language)
          }}
        />
      </div>
    </div>
  )
}
```

### 2.3 基础消息组件

**文件：** `src/components/UserMessage.tsx`

```typescript
import MarkdownContent from './MarkdownContent'
import { formatDate } from '../utils/format'
import type { Message } from '../types'

interface UserMessageProps {
  message: Message
  timestamp?: string
}

export default function UserMessage({ message, timestamp }: UserMessageProps) {
  const content = message.content

  // 提取图片
  const images = content.filter(c => c.type === 'image')
  const text = typeof content === 'string'
    ? content
    : content.filter(c => c.type === 'text').map(c => c.text).join('\n')

  return (
    <div className="user-message">
      {timestamp && (
        <div className="message-timestamp">{formatDate(timestamp)}</div>
      )}

      {images.length > 0 && (
        <div className="message-images">
          {images.map((img, idx) => (
            <img
              key={idx}
              src={`data:${img.mimeType};base64,${img.data}`}
              alt="Message image"
              className="message-image"
            />
          ))}
        </div>
      )}

      {text.trim() && (
        <MarkdownContent content={text} />
      )}
    </div>
  )
}
```

**文件：** `src/components/AssistantMessage.tsx`

```typescript
import { useState } from 'react'
import MarkdownContent from './MarkdownContent'
import ThinkingBlock from './ThinkingBlock'
import ToolCallList from './ToolCallList'
import { formatDate, escapeHtml } from '../utils/format'
import type { Message } from '../types'

interface AssistantMessageProps {
  message: Message
  timestamp?: string
  toolResults?: any[]
}

export default function AssistantMessage({
  message,
  timestamp,
  toolResults = []
}: AssistantMessageProps) {
  const [showThinking, setShowThinking] = useState(false)

  const textBlocks = message.content.filter(c => c.type === 'text')
  const thinkingBlocks = message.content.filter(c => c.type === 'thinking')
  const toolCalls = message.content.filter(c => c.type === 'toolCall')

  return (
    <div className="assistant-message">
      {timestamp && (
        <div className="message-timestamp">{formatDate(timestamp)}</div>
      )}

      {textBlocks.map((block, idx) => (
        <MarkdownContent
          key={`text-${idx}`}
          content={block.text || ''}
          className="assistant-text"
        />
      ))}

      {thinkingBlocks.map((block, idx) => (
        <ThinkingBlock
          key={`thinking-${idx}`}
          content={block.thinking || ''}
          expanded={showThinking}
          onToggle={() => setShowThinking(!showThinking)}
        />
      ))}

      {toolCalls.length > 0 && (
        <ToolCallList calls={toolCalls} results={toolResults} />
      )}

      {message.stopReason === 'aborted' && (
        <div className="error-text">Aborted</div>
      )}

      {message.stopReason === 'error' && (
        <div className="error-text">
          Error: {escapeHtml(message.errorMessage || 'Unknown error')}
        </div>
      )}
    </div>
  )
}
```

**文件：** `src/components/ThinkingBlock.tsx`

```typescript
import { escapeHtml } from '../utils/format'

interface ThinkingBlockProps {
  content: string
  expanded?: boolean
  onToggle?: () => void
}

export default function ThinkingBlock({ content, expanded, onToggle }: ThinkingBlockProps) {
  return (
    <div
      className={`thinking-block ${expanded ? 'expanded' : ''}`}
      onClick={onToggle}
    >
      <div className="thinking-text">{escapeHtml(content)}</div>
      {!expanded && (
        <div className="thinking-collapsed">Thinking ... (click to expand)</div>
      )}
    </div>
  )
}
```

---

## Phase 3: 工具调用组件实现

### 3.1 ToolCallList 和通用组件

**文件：** `src/components/ToolCallList.tsx`

```typescript
import BashExecution from './BashExecution'
import ReadExecution from './ReadExecution'
import WriteExecution from './WriteExecution'
import EditExecution from './EditExecution'
import GenericToolCall from './GenericToolCall'
import type { Content } from '../types'

interface ToolCallListProps {
  calls: Content[]
  results?: any[]
}

export default function ToolCallList({ calls, results = [] }: ToolCallListProps) {
  return (
    <div className="tool-call-list">
      {calls.map((call, idx) => {
        const result = results.find(r => r.content.some((c: any) => c.id === call.id))

        switch (call.name) {
          case 'bash':
            return <BashExecution key={idx} call={call} result={result} />
          case 'read':
            return <ReadExecution key={idx} call={call} result={result} />
          case 'write':
            return <WriteExecution key={idx} call={call} result={result} />
          case 'edit':
            return <EditExecution key={idx} call={call} result={result} />
          default:
            return <GenericToolCall key={idx} call={call} result={result} />
        }
      })}
    </div>
  )
}
```

**文件：** `src/components/BashExecution.tsx`

```typescript
import { escapeHtml, replaceTabs } from '../utils/format'
import ExpandableOutput from './ExpandableOutput'
import type { Content } from '../types'

interface BashExecutionProps {
  call: Content
  result?: any
}

export default function BashExecution({ call, result }: BashExecutionProps) {
  const command = call.arguments?.command || ''
  const isError = result?.isError || false
  const output = result?.content
    ?.filter((c: any) => c.type === 'text')
    ?.map((c: any) => c.text)
    ?.join('\n') || ''

  return (
    <div className={`tool-execution ${result ? (isError ? 'error' : 'success') : 'pending'}`}>
      <div className="tool-command">$ {escapeHtml(command)}</div>
      {output && <ExpandableOutput text={output} maxLines={5} />}
    </div>
  )
}
```

**文件：** `src/components/ReadExecution.tsx`

```typescript
import { escapeHtml, shortenPath } from '../utils/format'
import ExpandableOutput from './ExpandableOutput'
import { getLanguageFromPath } from '../utils/markdown'
import type { Content } from '../types'

interface ReadExecutionProps {
  call: Content
  result?: any
}

export default function ReadExecution({ call, result }: ReadExecutionProps) {
  const filePath = call.arguments?.file_path || call.arguments?.path || ''
  const offset = call.arguments?.offset
  const limit = call.arguments?.limit
  const lang = getLanguageFromPath(filePath)

  let pathHtml = escapeHtml(shortenPath(filePath))
  if (offset !== undefined || limit !== undefined) {
    const startLine = offset ?? 1
    const endLine = limit !== undefined ? startLine + limit - 1 : ''
    pathHtml += `<span class="line-numbers">:${startLine}${endLine ? '-' + endLine : ''}</span>`
  }

  const images = result?.content?.filter((c: any) => c.type === 'image') || []
  const output = result?.content
    ?.filter((c: any) => c.type === 'text')
    ?.map((c: any) => c.text)
    ?.join('\n') || ''

  return (
    <div className={`tool-execution ${result ? (result.isError ? 'error' : 'success') : 'pending'}`}>
      <div
        className="tool-header"
        dangerouslySetInnerHTML={{
          __html: `<span class="tool-name">read</span> <span class="tool-path">${pathHtml}</span>`
        }}
      />

      {images.length > 0 && (
        <div className="tool-images">
          {images.map((img: any, idx: number) => (
            <img
              key={idx}
              src={`data:${img.mimeType};base64,${img.data}`}
              alt="Tool output image"
              className="tool-image"
            />
          ))}
        </div>
      )}

      {output && <ExpandableOutput text={output} maxLines={10} language={lang} />}
    </div>
  )
}
```

**文件：** `src/components/WriteExecution.tsx`

```typescript
import { escapeHtml, shortenPath } from '../utils/format'
import ExpandableOutput from './ExpandableOutput'
import { getLanguageFromPath } from '../utils/markdown'
import type { Content } from '../types'

interface WriteExecutionProps {
  call: Content
  result?: any
}

export default function WriteExecution({ call, result }: WriteExecutionProps) {
  const filePath = call.arguments?.file_path || call.arguments?.path || ''
  const content = call.arguments?.content || ''
  const lines = content.split('\n')
  const lang = getLanguageFromPath(filePath)

  return (
    <div className={`tool-execution ${result ? (result.isError ? 'error' : 'success') : 'pending'}`}>
      <div className="tool-header">
        <span className="tool-name">write</span>
        <span className="tool-path">{escapeHtml(shortenPath(filePath))}</span>
        {lines.length > 10 && (
          <span className="line-count">({lines.length} lines)</span>
        )}
      </div>

      {content && <ExpandableOutput text={content} maxLines={10} language={lang} />}

      {result && (
        <div className="tool-output">
          <div>{escapeHtml(result.content?.[0]?.text || '')}</div>
        </div>
      )}
    </div>
  )
}
```

**文件：** `src/components/EditExecution.tsx`

```typescript
import { escapeHtml, shortenPath, replaceTabs } from '../utils/format'
import type { Content } from '../types'

interface EditExecutionProps {
  call: Content
  result?: any
}

export default function EditExecution({ call, result }: EditExecutionProps) {
  const filePath = call.arguments?.file_path || call.arguments?.path || ''

  return (
    <div className={`tool-execution ${result ? (result.isError ? 'error' : 'success') : 'pending'}`}>
      <div className="tool-header">
        <span className="tool-name">edit</span>
        <span className="tool-path">{escapeHtml(shortenPath(filePath))}</span>
      </div>

      {result?.details?.diff && (
        <div className="tool-diff">
          {result.details.diff.split('\n').map((line: string, idx: number) => {
            const cls = line.match(/^\+/)
              ? 'diff-added'
              : line.match(/^-/)
              ? 'diff-removed'
              : 'diff-context'
            return (
              <div key={idx} className={cls}>
                {escapeHtml(replaceTabs(line))}
              </div>
            )
          })}
        </div>
      )}

      {result && !result.details?.diff && (
        <div className="tool-output">
          <div>{escapeHtml(result.content?.[0]?.text || '')}</div>
        </div>
      )}
    </div>
  )
}
```

**文件：** `src/components/GenericToolCall.tsx`

```typescript
import { escapeHtml } from '../utils/format'
import type { Content } from '../types'

interface GenericToolCallProps {
  call: Content
  result?: any
}

export default function GenericToolCall({ call, result }: GenericToolCallProps) {
  const name = call.name || 'unknown'
  const args = call.arguments || {}
  const isError = result?.isError || false

  return (
    <div className={`tool-execution ${result ? (isError ? 'error' : 'success') : 'pending'}`}>
      <div className="tool-header">
        <span className="tool-name">{escapeHtml(name)}</span>
      </div>

      <div className="tool-output">
        <pre>{escapeHtml(JSON.stringify(args, null, 2))}</pre>
      </div>

      {result && (
        <div className="tool-output">
          <div>{escapeHtml(result.content?.[0]?.text || JSON.stringify(result))}</div>
        </div>
      )}
    </div>
  )
}
```

### 3.2 其他消息类型组件

**文件：** `src/components/ModelChange.tsx`

```typescript
import { formatDate } from '../utils/format'
import type { SessionEntry } from '../types'

interface ModelChangeProps {
  entry: SessionEntry
}

export default function ModelChange({ entry }: ModelChangeProps) {
  return (
    <div className="model-change">
      {entry.timestamp && <span>{formatDate(entry.timestamp)} </span>}
      Switched to model:{' '}
      <span className="model-name">
        {entry.provider}/{entry.modelId}
      </span>
    </div>
  )
}
```

**文件：** `src/components/Compaction.tsx`

```typescript
import { useState } from 'react'
import { escapeHtml, formatTokens } from '../utils/format'
import type { SessionEntry } from '../types'

interface CompactionProps {
  entry: SessionEntry
}

export default function Compaction({ entry }: CompactionProps) {
  const [expanded, setExpanded] = useState(false)
  const tokensBefore = entry.tokensBefore || 0
  const summary = entry.summary || ''

  return (
    <div
      className={`compaction ${expanded ? 'expanded' : ''}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="compaction-label">[compaction]</div>
      <div className="compaction-collapsed">
        Compacted from {formatTokens(tokensBefore)} tokens
      </div>
      <div className="compaction-content">
        <strong>Compacted from {formatTokens(tokensBefore)} tokens</strong>
        <br /><br />
        {escapeHtml(summary)}
      </div>
    </div>
  )
}
```

**文件：** `src/components/BranchSummary.tsx`

```typescript
import MarkdownContent from './MarkdownContent'
import { formatDate } from '../utils/format'
import type { SessionEntry } from '../types'

interface BranchSummaryProps {
  entry: SessionEntry
}

export default function BranchSummary({ entry }: BranchSummaryProps) {
  return (
    <div className="branch-summary">
      {entry.timestamp && (
        <div className="message-timestamp">{formatDate(entry.timestamp)}</div>
      )}
      <div className="branch-summary-header">Branch Summary</div>
      <MarkdownContent content={typeof entry.summary === 'string' ? entry.summary : ''} />
    </div>
  )
}
```

**文件：** `src/components/CustomMessage.tsx`

```typescript
import MarkdownContent from './MarkdownContent'
import { formatDate, escapeHtml } from '../utils/format'
import type { SessionEntry } from '../types'

interface CustomMessageProps {
  entry: SessionEntry
}

export default function CustomMessage({ entry }: CustomMessageProps) {
  const content = typeof entry.content === 'string'
    ? entry.content
    : JSON.stringify(entry.content)

  return (
    <div className="hook-message">
      {entry.timestamp && (
        <div className="message-timestamp">{formatDate(entry.timestamp)}</div>
      )}
      <div className="hook-type">[{escapeHtml(entry.customType || 'custom')}]</div>
      <MarkdownContent content={content} />
    </div>
  )
}
```

---

## Phase 4: 主组件重构

### 4.1 重构 SessionViewer

**文件：** `src/components/SessionViewer.tsx`（完整重写）

```typescript
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { parseSessionEntries, computeStats, findToolResult } from '../utils/session'
import { formatDate, formatTokens } from '../utils/format'
import UserMessage from './UserMessage'
import AssistantMessage from './AssistantMessage'
import ModelChange from './ModelChange'
import Compaction from './Compaction'
import BranchSummary from './BranchSummary'
import CustomMessage from './CustomMessage'
import SessionHeader from './SessionHeader'
import '../styles/session.css'
import type { SessionInfo, SessionEntry } from '../types'

interface SessionViewerProps {
  session: SessionInfo
  onExport: () => void
  onRename: () => void
}

export default function SessionViewer({ session, onExport, onRename }: SessionViewerProps) {
  const [entries, setEntries] = useState<SessionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSession()
  }, [session])

  const loadSession = async () => {
    try {
      setLoading(true)
      setError(null)

      const jsonlContent = await invoke<string>('read_session_file', { path: session.path })
      const parsedEntries = parseSessionEntries(jsonlContent)
      setEntries(parsedEntries)
    } catch (err) {
      console.error('Failed to load session:', err)
      setError(err instanceof Error ? err.message : 'Failed to load session')
    } finally {
      setLoading(false)
    }
  }

  const renderEntry = (entry: SessionEntry) => {
    switch (entry.type) {
      case 'message':
        if (!entry.message) return null

        if (entry.message.role === 'user') {
          return <UserMessage key={entry.id} message={entry.message} timestamp={entry.timestamp} />
        }

        if (entry.message.role === 'assistant') {
          // 查找相关的 tool results
          const toolCalls = entry.message.content.filter(c => c.type === 'toolCall')
          const toolResults = toolCalls.map(call =>
            findToolResult(entries, call.id)
          ).filter(Boolean)

          return (
            <AssistantMessage
              key={entry.id}
              message={entry.message}
              timestamp={entry.timestamp}
              toolResults={toolResults}
            />
          )
        }

        if (entry.message.role === 'bashExecution') {
          return (
            <div key={entry.id} className="tool-execution">
              <div className="tool-command">$ {entry.message.command}</div>
              {entry.message.output && <div className="tool-output">{entry.message.output}</div>}
            </div>
          )
        }

        return null

      case 'model_change':
        return <ModelChange key={entry.id} entry={entry} />

      case 'compaction':
        return <Compaction key={entry.id} entry={entry} />

      case 'branch_summary':
        return <BranchSummary key={entry.id} entry={entry} />

      case 'custom_message':
        return entry.display ? <CustomMessage key={entry.id} entry={entry} /> : null

      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin">Loading session...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-400">
        <div className="text-center">
          <p className="mb-2">Error loading session</p>
          <p className="text-sm text-[#6a6f85]">{error}</p>
        </div>
      </div>
    )
  }

  const stats = computeStats(entries)
  const header = entries.find(e => e.type === 'session')
  const systemPrompt = (header as any)?.systemPrompt

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#2c2d3b]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{session.name || 'Session'}</span>
          <span className="text-xs text-[#6a6f85]">
            {entries.filter(e => e.type === 'message').length} messages
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRename}
            className="px-3 py-1 text-xs bg-[#2c2d3b] hover:bg-[#3c3d4b] rounded transition-colors"
          >
            Rename
          </button>
          <button
            onClick={onExport}
            className="px-3 py-1 text-xs bg-[#2c2d3b] hover:bg-[#3c3d4b] rounded transition-colors"
          >
            Export
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="session-viewer h-full">
          <SessionHeader
            header={header as any}
            systemPrompt={systemPrompt}
            stats={stats}
          />

          <div className="messages">
            {entries.map(renderEntry)}
          </div>
        </div>
      </div>
    </div>
  )
}
```

### 4.2 SessionHeader 组件

**文件：** `src/components/SessionHeader.tsx`

```typescript
import { useState } from 'react'
import MarkdownContent from './MarkdownContent'
import { formatDate, formatTokens, escapeHtml } from '../utils/format'
import type { SessionStats } from '../types'

interface SessionHeaderProps {
  header?: any
  systemPrompt?: string
  stats: SessionStats
}

export default function SessionHeader({ header, systemPrompt, stats }: SessionHeaderProps) {
  const [expandedSystemPrompt, setExpandedSystemPrompt] = useState(false)

  const totalCost = stats.cost.input + stats.cost.output + stats.cost.cacheRead + stats.cost.cacheWrite

  const tokenParts = []
  if (stats.tokens.input) tokenParts.push(`↑${formatTokens(stats.tokens.input)}`)
  if (stats.tokens.output) tokenParts.push(`↓${formatTokens(stats.tokens.output)}`)
  if (stats.tokens.cacheRead) tokenParts.push(`R${formatTokens(stats.tokens.cacheRead)}`)
  if (stats.tokens.cacheWrite) tokenParts.push(`W${formatTokens(stats.tokens.cacheWrite)}`)

  const msgParts = []
  if (stats.userMessages) msgParts.push(`${stats.userMessages} user`)
  if (stats.assistantMessages) msgParts.push(`${stats.assistantMessages} assistant`)
  if (stats.toolResults) msgParts.push(`${stats.toolResults} tool results`)
  if (stats.customMessages) msgParts.push(`${stats.customMessages} custom`)
  if (stats.compactions) msgParts.push(`${stats.compactions} compactions`)
  if (stats.branchSummaries) msgParts.push(`${stats.branchSummaries} branch summaries`)

  return (
    <div className="header">
      <h1>Session: {escapeHtml(header?.id || 'unknown')}</h1>

      <div className="header-info">
        <div className="info-item">
          <span className="info-label">Date:</span>
          <span className="info-value">
            {header?.timestamp ? formatDate(header.timestamp) : 'unknown'}
          </span>
        </div>
        <div className="info-item">
          <span className="info-label">Models:</span>
          <span className="info-value">{stats.models.join(', ') || 'unknown'}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Messages:</span>
          <span className="info-value">{msgParts.join(', ') || '0'}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Tool Calls:</span>
          <span className="info-value">{stats.toolCalls}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Tokens:</span>
          <span className="info-value">{tokenParts.join(' ') || '0'}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Cost:</span>
          <span className="info-value">${totalCost.toFixed(3)}</span>
        </div>
      </div>

      {systemPrompt && (
        <div className="system-prompt">
          <div className="system-prompt-header">System Prompt</div>
          <div className="system-prompt-preview">
            {escapeHtml(systemPrompt.split('\n').slice(0, 10).join('\n'))}
          </div>
          <div className="system-prompt-expand-hint">
            ... ({systemPrompt.split('\n').length - 10} more lines, click to expand)
          </div>
          <div className="system-prompt-full">
            {escapeHtml(systemPrompt)}
          </div>
        </div>
      )}
    </div>
  )
}
```

---

## Phase 5: 测试和优化

### 5.1 测试计划

| 测试项 | 测试内容 |
|--------|---------|
| 基础渲染 | 用户消息、助手消息正确显示 |
| Markdown | 标题、列表、代码块、链接正确渲染 |
| 代码高亮 | 不同语言代码正确高亮 |
| 工具调用 | bash/read/write/edit 正确显示 |
| 可展开输出 | 长文本折叠/展开功能正常 |
| 图片支持 | base64 图片正确显示 |
| 思考内容 | thinking 内容显示和折叠正常 |
| 统计信息 | tokens/cost/messages 计算正确 |
| 错误处理 | 错误消息正确显示 |

### 5.2 性能优化

- 使用 `React.memo` 优化消息组件
- 实现虚拟滚动（大型 session）
- 代码高亮懒加载
- 图片懒加载

### 5.3 可访问性

- 键盘导航支持
- ARIA 标签
- 高对比度模式

---

## 实施时间表

| Phase | 任务 | 预计时间 |
|-------|------|---------|
| Phase 1 | 基础设施搭建 | 2-3 小时 |
| Phase 2 | 核心组件实现 | 3-4 小时 |
| Phase 3 | 工具调用组件 | 2-3 小时 |
| Phase 4 | 主组件重构 | 2-3 小时 |
| Phase 5 | 测试和优化 | 2-3 小时 |
| **总计** | | **11-16 小时** |

---

## 风险和注意事项

### 技术风险

1. **marked.js 版本兼容性**
   - 确保 v15.0.4 与 React 兼容
   - 测试 XSS 防护

2. **highlight.js 语言支持**
   - 验证所有需要语言的语法高亮
   - 考虑添加自定义语言支持

3. **性能问题**
   - 大型 session 可能导致性能下降
   - 考虑分页或虚拟滚动

### 注意事项

1. **安全性**
   - 所有用户输入必须经过 `escapeHtml` 处理
   - 防止 XSS 攻击

2. **类型安全**
   - 确保所有 TypeScript 类型正确
   - 处理可选字段

3. **错误处理**
   - 添加友好的错误提示
   - 记录解析失败的条目

---

## 后续增强功能

### Phase 6（可选）

- [ ] 侧边栏导航树
- [ ] 消息搜索功能
- [ ] 深度链接（消息锚点）
- [ ] 导出功能增强（PDF）
- [ ] 主题切换（亮色/暗色）
- [ ] 自定义样式配置
- [ ] 消息编辑功能
- [ ] 批量操作

---

## 总结

本迁移计划将原始 Pi Session HTML 的完整渲染功能逐步迁移到当前的 Tauri + React 项目中，确保：

1. **功能完整性** - 实现所有核心功能
2. **代码质量** - 使用 TypeScript 和 React 最佳实践
3. **可维护性** - 模块化组件设计
4. **可扩展性** - 易于添加新功能

按照此计划执行，预计需要 **11-16 小时** 完成完整迁移。