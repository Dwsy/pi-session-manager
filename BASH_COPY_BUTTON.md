# BASH 工具调用复制按钮功能

## 功能描述

为 BASH 工具调用添加复制按钮，支持：
1. 复制命令
2. 复制输出

## 实现方案

### 1. 命令复制按钮

在命令行右侧添加复制按钮：

```tsx
<div className="tool-command-wrapper">
  <div className="tool-command">$ {command}</div>
  <button onClick={handleCopyCommand} className="tool-copy-button">
    {commandCopied ? <CheckIcon /> : <CopyIcon />}
  </button>
</div>
```

### 2. 输出复制按钮

在输出区域顶部添加复制按钮：

```tsx
<div className="tool-output-wrapper">
  <div className="tool-output-header">
    <span className="tool-output-label">Output</span>
    <button onClick={handleCopyOutput} className="tool-copy-button">
      {outputCopied ? <CheckIcon /> : <CopyIcon />}
    </button>
  </div>
  <div className="tool-output">
    <ExpandableOutput text={output} />
  </div>
</div>
```

### 3. 复制逻辑

```typescript
const handleCopyCommand = async () => {
  try {
    await navigator.clipboard.writeText(command)
    setCommandCopied(true)
    setTimeout(() => setCommandCopied(false), 2000)
  } catch (err) {
    console.error('Failed to copy command:', err)
  }
}

const handleCopyOutput = async () => {
  try {
    if (output) {
      await navigator.clipboard.writeText(output)
      setOutputCopied(true)
      setTimeout(() => setOutputCopied(false), 2000)
    }
  } catch (err) {
    console.error('Failed to copy output:', err)
  }
}
```

## 视觉效果

### 修改前
```
┌─────────────────────────────────────────┐
│ [Terminal Icon] Bash          exit 0    │
├─────────────────────────────────────────┤
│ $ npm run build                         │
├─────────────────────────────────────────┤
│ > build                                 │
│ > tsc && vite build                     │
│ ...                                     │
└─────────────────────────────────────────┘
```

### 修改后
```
┌─────────────────────────────────────────┐
│ [Terminal Icon] Bash          exit 0    │
├─────────────────────────────────────────┤
│ $ npm run build              [Copy] ←   │ 命令复制按钮
├─────────────────────────────────────────┤
│ Output                       [Copy] ←   │ 输出复制按钮
├─────────────────────────────────────────┤
│ > build                                 │
│ > tsc && vite build                     │
│ ...                                     │
└─────────────────────────────────────────┘
```

## 功能特性

### 1. 命令复制
- 点击命令行右侧的复制按钮
- 复制完整的命令（不包含 `$` 提示符）
- 显示勾选图标 2 秒后恢复

### 2. 输出复制
- 点击输出区域顶部的复制按钮
- 复制完整的输出内容
- 显示勾选图标 2 秒后恢复

### 3. 视觉反馈
- 复制前：显示复制图标
- 复制后：显示勾选图标（绿色）
- 2 秒后自动恢复为复制图标

### 4. 悬停效果
- 鼠标悬停时按钮高亮
- 边框颜色变化
- 背景色变化

## 样式设计

### 命令包装器
```css
.tool-command-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(138, 190, 183, 0.15);
  padding-right: 8px;
}
```

### 输出头部
```css
.tool-output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(138, 190, 183, 0.15);
}
```

### 复制按钮
```css
.tool-copy-button {
  padding: 4px;
  background: transparent;
  color: #6a6f85;
  border: 1px solid rgba(138, 190, 183, 0.2);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-copy-button:hover {
  color: #d4d4d8;
  border-color: rgba(138, 190, 183, 0.4);
  background: rgba(138, 190, 183, 0.05);
}
```

## 使用场景

### 1. 复制命令重新执行
```bash
# 用户看到一个 bash 命令
$ npm run build

# 点击复制按钮
# 粘贴到终端执行
npm run build
```

### 2. 复制输出用于分析
```bash
# 用户看到错误输出
Error: Cannot find module 'xxx'
at Function.Module._resolveFilename
...

# 点击复制按钮
# 粘贴到搜索引擎或 AI 助手
```

### 3. 复制输出用于文档
```bash
# 用户看到成功输出
Build complete!
dist/index.html  1.2 kB
dist/assets/...  45.3 kB

# 点击复制按钮
# 粘贴到文档或报告
```

## 技术实现

### 1. 状态管理
```typescript
const [commandCopied, setCommandCopied] = useState(false)
const [outputCopied, setOutputCopied] = useState(false)
```

### 2. 复制到剪贴板
```typescript
await navigator.clipboard.writeText(text)
```

### 3. 视觉反馈
```typescript
setCommandCopied(true)
setTimeout(() => setCommandCopied(false), 2000)
```

### 4. 图标切换
```tsx
{commandCopied ? (
  <svg><!-- Check Icon --></svg>
) : (
  <svg><!-- Copy Icon --></svg>
)}
```

## 修改的文件

1. **src/components/BashExecution.tsx** - 添加复制按钮和逻辑
2. **src/index.css** - 添加复制按钮样式

## 代码结构

```typescript
export default function BashExecution({
  command,
  output,
  exitCode,
  cancelled,
  timestamp,
  entryId,
}: BashExecutionProps) {
  // 状态
  const [commandCopied, setCommandCopied] = useState(false)
  const [outputCopied, setOutputCopied] = useState(false)

  // 复制命令
  const handleCopyCommand = async () => {
    await navigator.clipboard.writeText(command)
    setCommandCopied(true)
    setTimeout(() => setCommandCopied(false), 2000)
  }

  // 复制输出
  const handleCopyOutput = async () => {
    if (output) {
      await navigator.clipboard.writeText(output)
      setOutputCopied(true)
      setTimeout(() => setOutputCopied(false), 2000)
    }
  }

  return (
    <div className="tool-execution">
      {/* 头部 */}
      <div className="tool-header">...</div>
      
      {/* 命令 + 复制按钮 */}
      <div className="tool-command-wrapper">
        <div className="tool-command">$ {command}</div>
        <button onClick={handleCopyCommand}>
          {commandCopied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
      
      {/* 输出 + 复制按钮 */}
      {output && (
        <div className="tool-output-wrapper">
          <div className="tool-output-header">
            <span>Output</span>
            <button onClick={handleCopyOutput}>
              {outputCopied ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
          <div className="tool-output">
            <ExpandableOutput text={output} />
          </div>
        </div>
      )}
    </div>
  )
}
```

## 测试建议

1. **基本功能测试**:
   - 测试命令复制
   - 测试输出复制
   - 测试复制后的视觉反馈
   - 测试 2 秒后图标恢复

2. **边界情况测试**:
   - 测试空命令
   - 测试空输出
   - 测试超长命令
   - 测试超长输出

3. **交互测试**:
   - 测试快速连续点击
   - 测试同时复制命令和输出
   - 测试悬停效果

4. **兼容性测试**:
   - 测试不同浏览器
   - 测试剪贴板权限
   - 测试复制失败的情况

## 未来改进

1. **复制选项**:
   - 支持复制命令时包含/不包含 `$` 提示符
   - 支持复制输出时包含/不包含时间戳

2. **批量复制**:
   - 支持复制命令 + 输出
   - 支持复制多个 bash 命令

3. **格式化复制**:
   - 支持复制为 Markdown 格式
   - 支持复制为纯文本格式

4. **快捷键支持**:
   - 支持 Ctrl+C 复制选中内容
   - 支持自定义快捷键

5. **复制历史**:
   - 记录复制历史
   - 支持查看和重新复制

## 相关文档

- BashExecution 组件文档
- 工具调用显示优化文档
- 代码块复制功能文档
