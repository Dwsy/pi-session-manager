# SessionTree 工具调用显示优化

## 问题描述

会话视图的左侧面板（SessionTree）显示的工具调用信息不正确，全都显示为：
- • [1 tool call]
- • [tool result]

用户希望能正确显示工具名称和相关信息。

## 解决方案

修改了 `src/components/SessionTree.tsx` 中的 `getNodeDisplayText` 函数，使其能够：

1. **显示具体的工具名称和参数**
2. **根据不同工具类型显示不同的信息**
3. **显示工具结果的状态（成功/失败）**

## 实现细节

### 1. 工具调用显示

针对不同的工具类型，显示不同的信息：

#### Bash 工具
```typescript
if (toolName === 'bash') {
  const command = firstTool.arguments?.command || ''
  const shortCmd = command.length > 30 ? command.slice(0, 30) + '...' : command
  return `bash: ${shortCmd}`
}
```

**显示效果：**
- `bash: ls -la`
- `bash: npm run build`
- `bash: git status`

#### Read 工具
```typescript
if (toolName === 'read') {
  const path = firstTool.arguments?.path || firstTool.arguments?.file_path || ''
  const fileName = path.split('/').pop() || path
  return `read: ${fileName}`
}
```

**显示效果：**
- `read: App.tsx`
- `read: package.json`
- `read: README.md`

#### Write 工具
```typescript
if (toolName === 'write') {
  const path = firstTool.arguments?.path || firstTool.arguments?.file_path || ''
  const fileName = path.split('/').pop() || path
  return `write: ${fileName}`
}
```

**显示效果：**
- `write: index.ts`
- `write: config.json`
- `write: styles.css`

#### Edit 工具
```typescript
if (toolName === 'edit') {
  const path = firstTool.arguments?.path || firstTool.arguments?.file_path || ''
  const fileName = path.split('/').pop() || path
  return `edit: ${fileName}`
}
```

**显示效果：**
- `edit: utils.ts`
- `edit: App.tsx`
- `edit: index.html`

#### 其他工具
```typescript
return `${toolName}${toolCalls.length > 1 ? ` +${toolCalls.length - 1}` : ''}`
```

**显示效果：**
- `subagent`
- `interview +2` (如果有多个工具调用)

### 2. 工具结果显示

工具结果现在会显示：
1. 对应的工具名称
2. 执行状态（成功 ✓ 或失败 ✗）

```typescript
if (toolCall) {
  const toolName = toolCall.name || 'unknown'
  const hasError = msg.errorMessage || msg.exitCode !== undefined && msg.exitCode !== 0
  const status = hasError ? ' ✗' : ' ✓'
  return `${toolName} result${status}`
}
```

**显示效果：**
- `bash result ✓` - Bash 命令执行成功
- `bash result ✗` - Bash 命令执行失败
- `read result ✓` - 文件读取成功
- `write result ✓` - 文件写入成功
- `edit result ✓` - 文件编辑成功

### 3. 命令截断

对于过长的命令（超过 30 个字符），会自动截断并添加省略号：

```typescript
const shortCmd = command.length > 30 ? command.slice(0, 30) + '...' : command
```

**示例：**
- 原始命令: `npm run build && npm run test && npm run deploy`
- 显示: `bash: npm run build && npm run te...`

## 视觉效果

### 修改前
```
├─ • [1 tool call]
│  └─ • [tool result]
├─ • [1 tool call]
│  └─ • [tool result]
└─ • [2 tool calls]
   ├─ • [tool result]
   └─ • [tool result]
```

### 修改后
```
├─ • bash: ls -la
│  └─ • bash result ✓
├─ • read: App.tsx
│  └─ • read result ✓
├─ • write: index.ts
│  └─ • write result ✓
├─ • edit: utils.ts
│  └─ • edit result ✓
└─ • bash: npm run build && npm run te...
   └─ • bash result ✗
```

## 功能特性

### 1. 清晰的工具识别
- 每个工具调用都显示具体的工具名称
- 显示关键参数（命令、文件名等）
- 易于快速识别工具类型

### 2. 文件名提取
- 自动从完整路径中提取文件名
- 支持 `path` 和 `file_path` 两种参数名
- 显示更简洁，易于阅读

### 3. 状态指示
- 成功: ✓ (绿色勾)
- 失败: ✗ (红色叉)
- 基于 `errorMessage` 和 `exitCode` 判断

### 4. 多工具调用支持
- 显示第一个工具的详细信息
- 如果有多个工具，显示 `+N` 表示还有 N 个工具

### 5. 智能关联
- 工具结果会尝试找到对应的工具调用
- 显示工具名称而不是通用的 "tool result"

## 代码结构

```typescript
const getNodeDisplayText = (entry: SessionEntry, label?: string): string => {
  // 1. 处理用户消息
  if (msg.role === 'user') {
    // 提取文本内容
  }
  
  // 2. 处理助手消息（工具调用）
  else if (msg.role === 'assistant') {
    const toolCalls = // 提取工具调用
    
    if (toolCalls.length > 0) {
      const firstTool = toolCalls[0]
      const toolName = firstTool.name
      
      // 根据工具类型显示不同信息
      switch (toolName) {
        case 'bash': return `bash: ${command}`
        case 'read': return `read: ${fileName}`
        case 'write': return `write: ${fileName}`
        case 'edit': return `edit: ${fileName}`
        default: return toolName
      }
    }
  }
  
  // 3. 处理工具结果
  else if (msg.role === 'toolResult') {
    // 找到对应的工具调用
    // 显示工具名称和状态
    return `${toolName} result${status}`
  }
}
```

## 修改的文件

- `src/components/SessionTree.tsx` - 修改 `getNodeDisplayText` 函数

## 测试建议

1. **基本功能测试**:
   - 测试 Bash 工具调用显示
   - 测试 Read 工具调用显示
   - 测试 Write 工具调用显示
   - 测试 Edit 工具调用显示
   - 测试其他工具调用显示

2. **工具结果测试**:
   - 测试成功的工具结果（✓）
   - 测试失败的工具结果（✗）
   - 测试工具结果与工具调用的关联

3. **边界情况测试**:
   - 测试超长命令的截断
   - 测试没有参数的工具调用
   - 测试多个工具调用的显示
   - 测试未知工具类型

4. **路径测试**:
   - 测试完整路径的文件名提取
   - 测试相对路径
   - 测试只有文件名的情况

## 未来改进

1. **更多工具支持**:
   - 添加更多工具类型的特殊显示
   - 支持自定义工具的显示格式

2. **参数显示优化**:
   - 显示更多关键参数
   - 支持参数的格式化显示

3. **交互功能**:
   - 点击工具调用显示完整参数
   - 悬停显示工具调用详情
   - 支持复制工具调用信息

4. **图标支持**:
   - 为不同工具添加图标
   - 使用颜色区分工具类型

5. **搜索增强**:
   - 支持按工具名称搜索
   - 支持按文件名搜索
   - 支持按命令搜索

## 相关文档

- SessionTree 组件文档
- 工具调用系统文档
- 会话数据结构文档
