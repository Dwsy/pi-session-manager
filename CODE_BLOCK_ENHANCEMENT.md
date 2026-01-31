# 代码块功能增强

## 问题描述

用户反馈了以下问题：
1. 代码块和消息之间没有间距
2. 代码块没有行号
3. 代码块没有复制按钮

## 解决方案

### 1. 重新设计代码块组件

修改了 `src/components/CodeBlock.tsx`，添加了：
- ✅ 复制按钮功能
- ✅ 行号显示
- ✅ 更好的视觉设计

### 2. 自定义 Markdown 代码块渲染

修改了 `src/utils/markdown.ts`，使用自定义渲染器：
- ✅ 自动生成行号
- ✅ 添加复制按钮
- ✅ 语法高亮
- ✅ 语言标签显示

### 3. 添加代码块样式

在 `src/index.css` 中添加了完整的代码块样式：
- ✅ 代码块容器样式
- ✅ 头部工具栏样式
- ✅ 行号样式
- ✅ 复制按钮样式
- ✅ 滚动条样式
- ✅ 代码块和消息之间的间距（16px）

### 4. 添加全局复制函数

在 `src/main.tsx` 中添加了全局的 `copyCode` 函数：
- ✅ 复制代码到剪贴板
- ✅ 视觉反馈（按钮状态变化）
- ✅ 2秒后自动恢复

## 功能特性

### 代码块结构

```
┌─────────────────────────────────────────┐
│ [语言标签]              [复制按钮]      │ ← 头部工具栏
├─────────────────────────────────────────┤
│ 1 │ const hello = 'world'              │ ← 行号 + 代码
│ 2 │ console.log(hello)                 │
│ 3 │                                    │
└─────────────────────────────────────────┘
```

### 1. 行号显示

- 自动计算代码行数
- 行号右对齐
- 灰色显示，不干扰阅读
- 不可选中（user-select: none）

### 2. 复制按钮

- 位于代码块右上角
- 点击复制整个代码块
- 复制成功后显示 "Copied!" 并显示勾选图标
- 2秒后自动恢复为 "Copy"

### 3. 语言标签

- 显示代码语言（如 typescript, javascript, python）
- 如果没有指定语言，显示 "code"
- 使用主题色（#8abeb7）

### 4. 语法高亮

- 使用 highlight.js 进行语法高亮
- 支持多种编程语言
- 自动检测语言（如果未指定）

### 5. 间距优化

- 代码块上下各有 16px 的外边距
- 与消息内容有明显的视觉分隔
- 不会紧贴其他元素

## 样式设计

### 颜色方案

- **背景色**: `rgba(0, 0, 0, 0.3)` - 深色半透明
- **边框色**: `rgba(138, 190, 183, 0.2)` - 主题色半透明
- **行号背景**: `rgba(0, 0, 0, 0.2)` - 更深的背景
- **行号文字**: `#6a6f85` - 灰色
- **语言标签**: `#8abeb7` - 主题色
- **复制按钮**: `#6a6f85` - 灰色，悬停时变亮

### 布局

```css
.code-block-wrapper {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(138, 190, 183, 0.2);
  border-radius: 8px;
  margin: 16px 0;
  overflow: hidden;
}

.code-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(138, 190, 183, 0.15);
}

.code-block-content {
  display: flex;
  overflow-x: auto;
}

.code-line-numbers {
  flex-shrink: 0;
  padding: 12px 0;
  background: rgba(0, 0, 0, 0.2);
  border-right: 1px solid rgba(138, 190, 183, 0.15);
  user-select: none;
  text-align: right;
}

.code-block {
  flex: 1;
  margin: 0;
  padding: 12px;
  background: transparent;
  overflow-x: auto;
}
```

## 使用示例

### Markdown 中的代码块

````markdown
```typescript
const hello: string = 'world'
console.log(hello)
```
````

会被渲染为：

```
┌─────────────────────────────────────────┐
│ typescript                    [Copy]    │
├─────────────────────────────────────────┤
│ 1 │ const hello: string = 'world'      │
│ 2 │ console.log(hello)                 │
└─────────────────────────────────────────┘
```

### 复制功能

1. 点击 "Copy" 按钮
2. 代码被复制到剪贴板
3. 按钮显示 "Copied!" 和勾选图标
4. 2秒后恢复为 "Copy"

## 技术实现

### 1. 自定义 Marked 渲染器

```typescript
const renderer = new marked.Renderer()

renderer.code = function({ text, lang }: { text: string; lang?: string }): string {
  // 生成行号
  const lines = text.split('\n')
  const lineCount = lines.length
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => 
    `<div class="code-line-number">${i + 1}</div>`
  ).join('')
  
  // 语法高亮
  let highlightedCode = text
  if (validLang) {
    highlightedCode = hljs.highlight(text, { language: validLang }).value
  }
  
  // 返回完整的 HTML
  return `
    <div class="code-block-wrapper">
      <div class="code-block-header">
        <div class="code-language">${lang || 'code'}</div>
        <button class="code-copy-button" onclick="copyCode(this)">
          <svg>...</svg>
          <span>Copy</span>
        </button>
      </div>
      <div class="code-block-content">
        <div class="code-line-numbers">${lineNumbers}</div>
        <pre class="code-block"><code>${highlightedCode}</code></pre>
      </div>
    </div>
  `
}
```

### 2. 全局复制函数

```typescript
window.copyCode = async (button: HTMLButtonElement) => {
  // 找到代码块
  const wrapper = button.closest('.code-block-wrapper')
  const codeElement = wrapper.querySelector('code')
  const code = codeElement.textContent || ''
  
  // 复制到剪贴板
  await navigator.clipboard.writeText(code)
  
  // 更新按钮状态
  const textSpan = button.querySelector('.code-copy-text')
  textSpan.textContent = 'Copied!'
  
  // 2秒后恢复
  setTimeout(() => {
    textSpan.textContent = 'Copy'
  }, 2000)
}
```

## 相关文件

- `src/components/CodeBlock.tsx` - 代码块组件（增强版）
- `src/utils/markdown.ts` - Markdown 解析器（自定义渲染器）
- `src/index.css` - 代码块样式
- `src/main.tsx` - 全局复制函数

## 测试建议

1. **基本功能测试**:
   - 测试不同语言的代码块（TypeScript, JavaScript, Python, etc.）
   - 测试没有指定语言的代码块
   - 测试单行和多行代码块

2. **复制功能测试**:
   - 点击复制按钮
   - 验证代码是否正确复制到剪贴板
   - 验证按钮状态变化（Copy → Copied! → Copy）

3. **行号测试**:
   - 验证行号是否正确显示
   - 验证行号是否不可选中
   - 验证行号对齐是否正确

4. **样式测试**:
   - 验证代码块和消息之间的间距
   - 验证代码块的边框和背景
   - 验证语法高亮是否正确

5. **响应式测试**:
   - 测试长代码行的水平滚动
   - 测试多行代码的垂直滚动
   - 测试不同屏幕尺寸下的显示

## 未来改进

1. **行号功能增强**:
   - 支持行号点击选中
   - 支持行号范围选择
   - 支持行号高亮

2. **复制功能增强**:
   - 支持复制选中的行
   - 支持复制时保留格式
   - 支持复制时添加语言标签

3. **代码块功能增强**:
   - 支持代码折叠
   - 支持代码搜索
   - 支持代码差异对比

4. **主题支持**:
   - 支持多种代码高亮主题
   - 支持自定义主题
   - 支持明暗主题切换

5. **性能优化**:
   - 虚拟滚动（大型代码块）
   - 延迟加载语法高亮
   - 缓存高亮结果
