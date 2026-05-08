# resume-x Phase 1 & TODO — 交给高级模型

**Date:** 2026-05-08
**Session:** resume-x 滚动优化 + Alt+X Bug 修复 + 大文件拆分规划
**Tag:** `before-resume-x-phase1-fixes` (git tag created)

---

## ✅ Phase 1: 已完成的紧急修复

### 1.1 Alt+X 快捷键 Bug 修复

**问题：**
```typescript
// ❌ 旧代码：快捷键不更新 switchSessionFn
pi.registerShortcut("alt+x", {
  handler: async (ctx) => {
    await runResumeX(ctx);  // switchSessionFn 可能为 null
  },
});

// ✅ 命令 handler 有更新
pi.registerCommand("resume-x", {
  handler: async (_, ctx) => {
    if (typeof ctx.switchSession === "function") switchSessionFn = ctx.switchSession;
    await runResumeX(ctx);
  },
});
```

**现象：**
- `/resume-x` 命令 ✅ 工作（使用 `ctx.switchSession`）
- `Alt+X` 快捷键 ❌ 不工作（fallback 到 `setSessionFile`，UI 不刷新）

**根因：**
`switchSessionFn` 只在命令 handler 中赋值，快捷键 handler 未赋值，导致 `switchSessionFn` 保持 `null`。

**修复：**
删除 `switchSessionFn` 捕获逻辑，所有路径统一直接使用 `ctx.switchSession`：
```typescript
const runResumeX = async (ctx: ExtensionContext) => {
  const selectedPath = await ctx.ui.custom(...);
  if (!selectedPath) return;

  if (typeof ctx.switchSession === "function") {
    await ctx.switchSession(selectedPath);  // 直接调用，100% 可用
    return;
  }
  // fallback...
};
```

**同时删除：**
- `pi.on("session_start", ...)` 监听器（不再需要）
- `let switchSessionFn: ... | null = null` 变量声明

---

### 1.2 滚动速度提升

**旧行为：**
```typescript
if (isUp)   previewScrollOffset = Math.max(0, previewScrollOffset - 1);  // 1行
if (isDown) previewScrollOffset = Math.min(maxOffset, previewScrollOffset + 1);  // 1行
```

**新行为：**
```typescript
const SCROLL = { LINE: 1, FAST_LINE: 3, HALF_PAGE: 9, PAGE: 18 };

if (isUp)   previewScrollOffset = clampScroll(previewScrollOffset - SCROLL.FAST_LINE, ...);
if (isDown) previewScrollOffset = clampScroll(previewScrollOffset + SCROLL.FAST_LINE, ...);
if (isShiftUp/Down)  scroll by SCROLL.HALF_PAGE  (9 lines)
if (isPgUp/PgDn)     scroll by SCROLL.PAGE       (18 lines)
```

**速度对比：**
| 按键 | 旧速度 | 新速度 | 提升 |
|------|--------|--------|------|
| ↑/↓ | 1 行/次 | **3 行/次** | **3x** |
| Shift+↑/↓ | N/A | **9 行/次** | 新增 |
| PgUp/PgDn | ~18 行 | ~18 行 | 不变 |

---

## 📁 Phase 2: 大文件拆分计划（1154行 → 6模块）

### 2.1 目标结构

```
extensions/resume-x/
├── index.ts              (~80 行)  ← 入口：注册命令 + runResumeX 调度
├── lib/
│   ├── types.ts          (~100 行) ← 所有接口定义
│   ├── db.ts             (~120 行) ← SQLite 连接 + 查询
│   ├── search.ts         (~150 行) ← 全文搜索 + buildSearchLines
│   ├── render.ts         (~200 行) ← buildPreviewLines, buildDetailLines, patch
│   └── utils.ts          (~80 行)  ← fmtTokens, fmtCost, fmtTime, wrapText
├── components/
│   ├── PreviewPanel.ts   (~150 行) ← 原生 TUI Component 替代字符串拼接
│   └── SearchPanel.ts    (~120 行) ← 原生 TUI Component
└── README.md             (新增)    ← 使用说明 + 架构
```

**总计：** ~1000 行 → 分散到 8 文件，每文件 < 200 行

---

### 2.2 依赖图

```
index.ts
  ├─ lib/types.ts      (共享接口)
  ├─ lib/db.ts         (types + better-sqlite3)
  ├─ lib/search.ts     (db + utils + types)
  ├─ lib/render.ts     (db + utils + types)
  ├─ lib/utils.ts      (无依赖)
  └─ components/
       ├─ PreviewPanel.ts  (render + types)
       └─ SearchPanel.ts   (search + render + types)
```

---

### 2.3 拆分步骤（7 Phases）

#### Phase 2.1: 提取 `lib/types.ts`
**移动：**
- `ResumeSession`
- `ResumeSessionWithDetail`
- `SessionDetail`
- `SessionMessage`
- `SearchResult`
- `KanbanTag`
- `SessionTagMark`
- `ResumeXConfig`（新增，用于配置）

**注意：**
- Date 类型在运行时是字符串，但接口中保持 `Date`（原代码已 `new Date()` 转换）
- 移除所有 `any` 断言，改用具体类型

---

#### Phase 2.2: 提取 `lib/db.ts`
**移动：**
- `let db: Database | null = null`
- `detailCache: Map<string, SessionDetail | null>`
- `getDbPath()`
- `initDb()`
- `loadSessionsFromSqlite(cwdFilter?)`
- `loadSessionDetail(sessionPath)`
- `loadSessionMessages(sessionPath)`
- `_crash()` 函数（保留，用于错误日志）

**新增导出：**
```typescript
export function querySessions(cwdFilter?: string): ResumeSession[] { ... }
export function querySessionDetail(path: string): SessionDetail | null { ... }
export function querySessionMessages(path: string): SessionMessage[] { ... }
```

---

#### Phase 2.3: 提取 `lib/search.ts`
**移动：**
- `searchSessions(query, cwdFilter?)`
- `buildSearchLines(...)`
- `loadKanbanData()`
- `getSessionKanbanTags(sessionId)`
- `mapTagColorToTheme(color)`

**依赖：**
- `db.ts` 中的 `loadSessionsFromSqlite`（当前是函数内联，需重构）
- 建议：`searchSessions` 改为接收 `ResumeSession[]` 参数，避免重复查询 DB

**重构点：**
```typescript
// 当前：searchSessions 内部重复查询 DB
// 改为：接收 sessions 列表，纯内存过滤
export function searchSessions(
  query: string,
  sessions: ResumeSession[],
  cwdFilter?: string,
  tagsData?: { tags: KanbanTag[]; marks: SessionTagMark[] }
): SearchResult[] { ... }
```

---

#### Phase 2.4: 提取 `lib/render.ts`
**移动：**
- `buildPreviewLines(...)`
- `buildDetailLines(...)`
- `patchSessionListRender(sessionList)`
- `getTheme()`
- `fmtTime()`
- `wrapText()`
- `safeLine()` 辅助函数

**注意：**
- `buildPreviewLines` 使用 `process.stdout.rows`，保持原逻辑
- `patchSessionListRender` 需要访问 `sessionList` 的原型，保持不变

---

#### Phase 2.5: 提取 `lib/utils.ts`
**移动：**
- `fmtTokens(n)`
- `fmtCost(v)`
- `shortModel(m)`
- `getPsmConfigDir()`（后续可能由 PSM 配置系统提供）

---

#### Phase 2.6: 组件化重构（可选增强）

**当前：** `buildPreviewLines` 返回 `string[]`
**目标：** 实现 `PreviewPanel` 类（继承 `Component`）

```typescript
// components/PreviewPanel.ts
import { Component, Text, Spacer, theme } from "@mariozechner/pi-tui";

export class PreviewPanel implements Component {
  private messages: SessionMessage[] = [];
  private scrollOffset = 0;
  private totalLines = 0;

  setMessages(messages: SessionMessage[]): void { ... }

  render(width: number): string[] {
    // 使用 pi-tui 的 Text 组件，而非字符串拼接
    // 自动应用主题颜色
  }

  handleInput(data: string): void { ... }  // 滚动控制
}
```

**类似地：** `SearchPanel` 替代 `buildSearchLines`

**好处：**
- 统一的 `invalidate()` 支持
- 更好的主题集成
- 可组合（Container 管理多个组件）

**代价：**
- 需要重写渲染逻辑（字符串 → 组件 API）
- 测试工作量增加

**建议：** Phase 2.6 作为 **可选项**，如果时间紧张可跳过，保持字符串拼接。

---

#### Phase 2.7: 精简 `index.ts`

**目标：** 入口文件只保留：
```typescript
export { default } from "./lib/extension.js";
// 或
import { runResumeX } from "./lib/runner";
import { registerCommands } from "./lib/commands";

export default async function resumeXExtension(pi: ExtensionAPI) {
  await registerCommands(pi, runResumeX);
}
```

**原则：**
- 不暴露内部模块细节
- 导入路径清晰
- 总行数 < 100

---

### 2.4 拆分检查清单

- [ ] 所有 `import` 路径更新为相对路径（`./lib/types`）
- [ ] 移除循环依赖（`db` 不导入 `search`，反之亦然）
- [ ] `_crash` 函数保留在 `db.ts`（依赖 `path`, `homedir`）
- [ ] `getTheme()` 保留在 `render.ts`（依赖 `globalThis` 符号）
- [ ] `detailCache` 作为 `db.ts` 的 module-scoped 变量单例
- [ ] `patchSessionListRender` 仍然在 `render.ts`，由 `runResumeX` 调用
- [ ] `index.ts` 中的 `runResumeX` 简化为：加载数据 → 创建 UI → 处理结果

---

## 🌟 Phase 3: 折叠/展开功能（条件渲染 + 树形结构）

### 3.1 数据模型增强

```typescript
interface FlatSessionNode {
  session: ResumeSession;
  depth: number;
  isLast: boolean;
  ancestorContinues: boolean[];
  expanded: boolean;          // NEW
  childCount?: number;        // NEW (optional)
}
```

---

### 3.2 树构建逻辑

```typescript
function flattenSessionTree(
  sessions: ResumeSession[],
  expandedSet: Set<string>,
): FlatSessionNode[] {
  // 1. 构建 parent-child Map
  // 2. 递归 walk，仅当 expanded 才递归子节点
  // 3. 返回 flat list（可能过滤掉折叠节点的子节点）
}
```

---

### 3.3 前缀渲染

```typescript
private buildTreePrefix(node: FlatSessionNode): string {
  if (node.depth === 0) return "";

  const parts = node.ancestorContinues
    .map(continues => continues ? "│  " : "   ");
  const branch = node.isLast ? "└─ " : "├─ ";

  // 折叠指示符
  const hasChildren = node.childCount > 0;
  const fold = hasChildren
    ? (node.expanded ? "▼ " : "▶ ")
    : "";

  return parts.join("") + fold + branch;
}
```

---

### 3.4 O 键切换

```typescript
// 在 SessionList.handleInput 或 PreviewPanel.handleInput 中
if (data === "o" || keybindings.matches(data, "app.session.toggleExpand")) {
  const selected = this.filteredSessions[this.selectedIndex];
  if (selected && selected.session.childCount > 0) {
    this.toggleExpanded(selected.session.path);
  }
  return;
}

private toggleExpanded(path: string): void {
  if (this.expandedSet.has(path)) {
    this.expandedSet.delete(path);
  } else {
    this.expandedSet.add(path);
  }
  this.requestRender();
}
```

---

## 🎯 下一步任务（交予高级模型）

### 优先级 1: Phase 2 拆分（高价值）

**目标：** 将 1154 行的 `index.ts` 拆分为模块化结构

**执行顺序：**
1. **Phase 2.1 类型提取** → 创建 `lib/types.ts`，移动所有接口
2. **Phase 2.2 DB 拆分** → 创建 `lib/db.ts`，移动 SQLite 逻辑
3. **Phase 2.5 Utils 提取** → 创建 `lib/utils.ts`，移动格式化函数
4. **Phase 2.3 Search 拆分** → 创建 `lib/search.ts`，重构 `searchSessions` 接收 sessions 参数
5. **Phase 2.4 Render 拆分** → 创建 `lib/render.ts`，移动渲染函数
6. **Phase 2.7 精简入口** → 重写 `index.ts` 仅保留注册逻辑

**验证标准：**
- `npx tsc --noEmit` 无错误
- pi 启动后 `/resume-x` 命令可用
- Alt+X 快捷键可用
- 滚动速度已优化

---

### 优先级 2: Phase 2.6 组件化（可选）

如果时间充裕，将 `buildPreviewLines` 和 `buildSearchLines` 重构为原生 `Component` 实现，获得：
- 统一的 `invalidate()` 支持
- 更好的主题集成
- 可组合性

---

### 优先级 3: Phase 3 折叠展开（增强）

实现会话列表的树形折叠功能，按键 `O` 切换。

---

## 📋 验证清单（交付前）

- [ ] TypeScript 编译通过（`npx tsc --noEmit`）
- [ ] pi TUI 中 `/resume-x` 命令正常
- [ ] Alt+X 快捷键正常 resume（UI 刷新）
- [ ] 滚动速度：
  - [ ] ↑/↓ = 3 行
  - [ ] Shift+↑/↓ = 9 行（半屏）
  - [ ] PgUp/PgDn = 18 行（整屏）
- [ ] 数据库查询正常（无 `SQLITE_BUSY` 错误）
- [ ] 日志文件无新错误（`~/.pi/agent/resume-x-crash.log`）
- [ ] 文件拆分后目录结构符合规划

---

## 🔧 修复摘要（已提交代码）

**File:** `extensions/resume-x/index.ts`

**Changes:**
1. 删除 `switchSessionFn` 变量和 `session_start` 监听器
2. 快捷键和命令 handler 统一直接调用 `ctx.switchSession`
3. 添加 `SCROLL` 配置对象
4. 添加 `getTermHeight()`, `getMaxVisible()`, `clampScroll()` 辅助函数
5. 重写预览模式滚动逻辑：
   - ↑/↓ → 3 行
   - Shift+↑/↓ → 9 行
   - PgUp/PgDn → 18 行

**Lines changed:** ~100 行修改

---

## 📎 参考信息

### 环境
- **OS:** macOS (Darwin/arm64)
- **Node:** v23.11.1
- **pi 路径:** `~/.local/share/nvm/v23.11.1/bin/pi` → `@mariozechner/pi-coding-agent`
- **Database:** `~/.pi/agent/sessions/sessions.db` (463M)
- **Extension 已启用:** `~/.pi/agent/settings.json` 包含 `"/Users/.../resume-x/index.ts"`

### pi-mono 原生组件参考
- `SessionSelectorComponent`: `/Users/dengwenyu/.pi/pi-mono/packages/coding-agent/src/modes/interactive/components/session-selector.ts`
- `SettingsList`: `/Users/dengwenyu/.pi/pi-mono/packages/tui/src/components/settings-list.ts`
- `SelectList`: `/Users/dengwenyu/.pi/pi-mono/packages/tui/src/components/select-list.ts`

---

## 🚀 交付给高级模型的指令

**任务：** 继续执行 Phase 2 文件拆分（优先级 1）

**约束：**
1. 保持 API 兼容性（外部调用 `resume-x` 命令无感知）
2. 逐步迁移，每阶段可独立验证
3. 避免循环依赖
4. 保留错误处理（`_crash`, try-catch）

**建议工具使用顺序：**
1. 使用 `write` 创建新文件（`lib/types.ts`, `db.ts`, `utils.ts`...）
2. 使用 `edit` 修改 `index.ts`（删除已迁移的代码，更新 import）
3. 每迁移一个模块，运行 `npx tsc --noEmit` 验证

**关键决策点：**
- `searchSessions` 是否改为纯函数接收 `ResumeSession[]`？（推荐：是，便于测试）
- `buildPreviewLines` 是否保留字符串数组返回？（Phase 2.6 前保留）

**成功标准：**
- 所有文件成功拆分，`index.ts` 降至 ~80 行
- `resume-x` 功能完全正常（命令 + 快捷键 + 滚动）
- 无编译错误和运行时错误

---

**Tag:** `before-resume-x-phase1-fixes`
**Git commit:** 待高级模型执行拆分后统一提交

---

*End of TODO document*
