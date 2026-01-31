# Session Viewer 搜索功能实现

## 概述

为 Session Viewer 添加了 cmd+f 搜索功能，支持在会话消息中搜索关键词，并高亮显示搜索结果。

## 功能特性

### 1. 快捷键支持
- **macOS**: `Cmd+F` 打开搜索
- **Windows/Linux**: `Ctrl+F` 打开搜索
- **关闭搜索**: `Esc` 键
- **导航**:
  - `Enter`: 下一个结果
  - `Shift+Enter`: 上一个结果

### 2. 搜索功能
- **实时搜索**: 输入关键词后自动搜索
- **大小写不敏感**: 搜索时忽略大小写
- **全文搜索**: 在所有用户消息和助手消息中搜索
- **结果计数**: 显示当前结果位置（如 1/5）
- **无结果提示**: 当没有匹配结果时显示提示

### 3. 搜索高亮
- **黄色高亮**: 所有匹配的关键词都会被高亮显示
- **橙色高亮**: 当前选中的搜索结果会用更深的颜色高亮
- **自动滚动**: 自动滚动到当前搜索结果位置

### 4. UI 设计
- **浮动搜索栏**: 类似浏览器的搜索栏，位于右上角
- **简洁界面**: 包含搜索框、结果计数、导航按钮、关闭按钮
- **响应式设计**: 适配不同屏幕尺寸

## 实现细节

### 新增文件

1. **src/components/SearchBar.tsx**
   - 搜索栏组件
   - 包含搜索框、导航按钮、关闭按钮
   - 支持快捷键（Enter, Shift+Enter, Esc）

2. **src/utils/search.ts**
   - 搜索工具函数
   - `highlightSearchInHTML()`: 在 HTML 中高亮搜索关键词
   - `containsSearchQuery()`: 检查文本是否包含关键词
   - `extractTextFromHTML()`: 从 HTML 中提取纯文本

### 修改文件

1. **src/components/SessionViewer.tsx**
   - 添加搜索状态管理
   - 添加快捷键监听
   - 实现搜索逻辑和导航
   - 传入 searchQuery 到消息组件

2. **src/components/UserMessage.tsx**
   - 添加 searchQuery 参数
   - 在渲染前高亮搜索关键词

3. **src/components/AssistantMessage.tsx**
   - 添加 searchQuery 参数
   - 传递给 MarkdownContent 组件

4. **src/components/MarkdownContent.tsx**
   - 添加 searchQuery 参数
   - 在渲染前高亮搜索关键词

5. **src/styles/session.css**
   - 添加搜索栏样式
   - 添加搜索高亮样式

6. **src/i18n/locales/en-US.ts**
   - 添加搜索相关翻译

7. **src/i18n/locales/zh-CN.ts**
   - 添加搜索相关翻译

## 使用方法

1. **打开搜索**:
   - 按 `Cmd+F` (macOS) 或 `Ctrl+F` (Windows/Linux)
   - 搜索栏会出现在右上角

2. **输入关键词**:
   - 在搜索框中输入要搜索的关键词
   - 搜索结果会自动更新

3. **导航结果**:
   - 点击向上箭头或按 `Shift+Enter` 跳转到上一个结果
   - 点击向下箭头或按 `Enter` 跳转到下一个结果
   - 当前结果会自动滚动到视口中央并高亮

4. **关闭搜索**:
   - 点击关闭按钮或按 `Esc` 键
   - 搜索栏会消失，高亮会清除

## 技术实现

### 搜索算法

1. **文本提取**:
   - 从消息内容中提取所有文本块
   - 将 Markdown 解析为 HTML
   - 从 HTML 中提取纯文本（移除标签）

2. **搜索匹配**:
   - 使用大小写不敏感的字符串匹配
   - 记录所有匹配的消息 ID

3. **高亮渲染**:
   - 使用正则表达式在 HTML 中查找关键词
   - 避免在 HTML 标签内搜索（临时替换标签）
   - 用 `<mark>` 标签包裹匹配的关键词

### 状态管理

```typescript
const [showSearch, setShowSearch] = useState(false)
const [searchQuery, setSearchQuery] = useState('')
const [searchResults, setSearchResults] = useState<string[]>([])
const [currentResultIndex, setCurrentResultIndex] = useState(0)
```

### 快捷键监听

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault()
      setShowSearch(true)
    }
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [])
```

### 搜索执行

```typescript
useEffect(() => {
  if (!searchQuery.trim()) {
    setSearchResults([])
    return
  }

  const results: string[] = []
  entries.forEach(entry => {
    if (entry.type === 'message' && entry.message) {
      const text = extractTextFromMessage(entry.message)
      if (containsSearchQuery(text, searchQuery)) {
        results.push(entry.id)
      }
    }
  })

  setSearchResults(results)
  setCurrentResultIndex(0)
}, [searchQuery, entries])
```

## 样式设计

### 搜索栏样式

```css
.search-bar {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 1000;
  background: #2a2b36;
  border: 1px solid rgba(138, 190, 183, 0.3);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  padding: 8px;
  min-width: 320px;
}
```

### 高亮样式

```css
.search-highlight {
  background: rgba(255, 215, 0, 0.3);
  color: inherit;
  padding: 2px 0;
  border-radius: 2px;
}

.search-highlight.current {
  background: rgba(255, 165, 0, 0.5);
  box-shadow: 0 0 0 2px rgba(255, 165, 0, 0.3);
}
```

## 国际化

### 英文翻译

```typescript
search: {
  placeholder: 'Search in session...',
  noResults: 'No results',
  previous: 'Previous result (Shift+Enter)',
  next: 'Next result (Enter)',
  close: 'Close search (Esc)',
}
```

### 中文翻译

```typescript
search: {
  placeholder: '在会话中搜索...',
  noResults: '无结果',
  previous: '上一个结果 (Shift+Enter)',
  next: '下一个结果 (Enter)',
  close: '关闭搜索 (Esc)',
}
```

## 测试建议

1. **基本功能测试**:
   - 测试 cmd+f / ctrl+f 快捷键
   - 测试搜索框输入和结果更新
   - 测试导航按钮（上一个/下一个）
   - 测试 Esc 关闭搜索

2. **边界情况测试**:
   - 空搜索关键词
   - 无匹配结果
   - 单个匹配结果
   - 多个匹配结果
   - 特殊字符搜索（正则表达式特殊字符）

3. **UI 测试**:
   - 搜索高亮是否正确显示
   - 当前结果是否正确高亮
   - 自动滚动是否正常工作
   - 搜索栏位置和样式是否正确

4. **性能测试**:
   - 大量消息时的搜索性能
   - 长文本消息的搜索性能
   - 高亮渲染性能

## 未来改进

1. **高级搜索**:
   - 支持正则表达式搜索
   - 支持大小写敏感选项
   - 支持全词匹配选项

2. **搜索范围**:
   - 支持仅在用户消息中搜索
   - 支持仅在助手消息中搜索
   - 支持在工具调用结果中搜索

3. **搜索历史**:
   - 记录最近的搜索关键词
   - 支持快速选择历史搜索

4. **性能优化**:
   - 使用 Web Worker 进行搜索
   - 使用虚拟滚动优化大量结果的渲染
   - 缓存搜索结果

5. **UI 改进**:
   - 支持搜索栏拖拽移动
   - 支持搜索栏最小化
   - 添加搜索进度指示器

## 相关文件

- `src/components/SearchBar.tsx` - 搜索栏组件
- `src/utils/search.ts` - 搜索工具函数
- `src/components/SessionViewer.tsx` - 会话查看器（主要修改）
- `src/components/UserMessage.tsx` - 用户消息组件
- `src/components/AssistantMessage.tsx` - 助手消息组件
- `src/components/MarkdownContent.tsx` - Markdown 内容组件
- `src/styles/session.css` - 样式文件
- `src/i18n/locales/en-US.ts` - 英文翻译
- `src/i18n/locales/zh-CN.ts` - 中文翻译
