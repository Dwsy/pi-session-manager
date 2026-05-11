# TODO/FIXME 清理记录

**清理时间**: 2026-05-11
**执行人**: MiMo Agent
**任务**: 清理代码中的 TODO/FIXME 标记

---

## 📊 扫描结果

### 代码中的 TODO（4 个）
| 文件 | 行号 | 内容 | 处理方式 |
|------|------|------|----------|
| src-tauri/src/data/search/client.rs | 204 | 搜索摘要中心化改进 | → Issue #1 |
| src-tauri/src/utils/search_text.rs | 1 | CJK 字符支持扩展 | → Issue #2 |
| src/components/command/CommandPalette.tsx | 118 | 编辑模式打开会话 | → Issue #3 |
| src/components/command/CommandPalette.tsx | 125 | 显示删除确认 | → Issue #4 |

### 文档中的 TODO（多个）
| 文件 | 说明 | 处理方式 |
|------|------|----------|
| docs/TODO.md | 项目整体 TODO 列表 | 保留（文档用途） |
| docs/SETTINGS_FRAMEWORK.md | 设置框架 TODO | 保留（文档用途） |
| docs/issues/20260214-pi-config-tui-refactor.md | Pi Config 重构计划 | 保留（文档用途） |

### 非 TODO 匹配（已忽略）
| 文件 | 说明 |
|------|------|
| src-tauri/crates/casr/AGENTS.md | 文档中提到 TODO 功能说明 |
| src-tauri/crates/casr/scripts/*.sh | 脚本中的 XXXX 模式（临时文件名） |

---

## 📋 Issue 转换详情

### Issue #1: 搜索摘要中心化显示
**文件**: `src-tauri/src/data/search/client.rs:204`
**当前代码**:
```rust
// TODO: Snippet takes first 130 chars; if the match is in the middle or later,
// it won't be visible. Should center around the match position instead,
// e.g. substr(content, instr(content, ?) - 40, 120).
let snippet = entry.content.chars().take(130).collect::<String>();
```

**问题描述**:
搜索结果摘要目前只取前 130 个字符，如果匹配位置在中间或后面，用户看不到匹配内容。

**期望行为**:
摘要应该以匹配位置为中心，向前后各取一定字符数，确保匹配内容可见。

**优先级**: 中
**标签**: enhancement, search, ux

---

### Issue #2: 扩展 CJK 字符支持范围
**文件**: `src-tauri/src/utils/search_text.rs:1`
**当前代码**:
```rust
// TODO: Missing Korean Hangul (U+AC00–U+D7AF), Japanese Hiragana (U+3040–U+309F),
// Katakana (U+30A0–U+30FF), CJK Radicals (U+2E80–U+2EFF) etc.
// Korean/Japanese kana queries won't be detected as CJK, skipping per-char tokenization,
// which may cause missed or inaccurate search results.
pub fn is_cjk_char(ch: char) -> bool {
    matches!(
        ch as u32,
        0x4E00..=0x9FFF | 0x3400..=0x4DBF | 0xF900..=0xFAFF
    )
}
```

**问题描述**:
当前 CJK 字符检测只支持中文汉字，不支持韩语、日语假名等 CJK 字符。

**期望行为**:
扩展 `is_cjk_char` 函数，支持：
- 韩语 Hangul (U+AC00–U+D7AF)
- 日语平假名 (U+3040–U+309F)
- 日语片假名 (U+30A0–U+30FF)
- CJK 部首 (U+2E80–U+2EFF)

**优先级**: 低
**标签**: enhancement, search, i18n

---

### Issue #3: 实现 Cmd+E 编辑模式
**文件**: `src/components/command/CommandPalette.tsx:118`
**当前代码**:
```tsx
// Cmd+E → edit (placeholder for future)
if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
  e.preventDefault()
  // TODO: open session in edit mode
  return
}
```

**问题描述**:
Cmd+E 快捷键已绑定，但功能未实现。

**期望行为**:
按 Cmd+E 后，在编辑模式下打开选中的会话（可能需要跳转到会话编辑器）。

**优先级**: 中
**标签**: enhancement, keyboard-shortcut, ux

---

### Issue #4: 实现 Cmd+D 删除确认
**文件**: `src/components/command/CommandPalette.tsx:125`
**当前代码**:
```tsx
// Cmd+D → delete (placeholder for future)
if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
  e.preventDefault()
  // TODO: show delete confirmation
  return
}
```

**问题描述**:
Cmd+D 快捷键已绑定，但功能未实现。

**期望行为**:
按 Cmd+D 后，显示删除确认对话框，确认后删除选中的会话。

**优先级**: 中
**标签**: enhancement, keyboard-shortcut, ux

---

## ✅ 处理结果

### 代码清理 ✅
- [x] 移除 client.rs 中的 TODO 注释 → 改为说明性注释 + Issue 链接
- [x] 移除 search_text.rs 中的 TODO 注释 → 改为说明性注释 + Issue 链接
- [x] 移除 CommandPalette.tsx 中的 2 个 TODO 注释 → 改为说明性注释 + Issue 链接

### Issue 创建 ✅
- [x] 创建 Issue #1: 搜索摘要中心化显示 → `docs/issues/search-snippet-centering.md`
- [x] 创建 Issue #2: 扩展 CJK 字符支持范围 → `docs/issues/expand-cjk-support.md`
- [x] 创建 Issue #3: 实现 Cmd+E 编辑模式 → `docs/issues/cmd-e-edit-mode.md`
- [x] 创建 Issue #4: 实现 Cmd+D 删除确认 → `docs/issues/cmd-d-delete-confirm.md`

### 文档更新 ✅
- [x] 创建清理记录文档 → `task/todo-cleanup-record.md`
- [x] 在 docs/issues/ 目录创建 4 个 Issue 文档

### 验证 ✅
- [x] 代码中无遗留的 TODO/FIXME 标记
- [x] 所有 TODO 已转为 Issue 或说明性注释

---

## 📝 备注

1. **文档中的 TODO 保留**: docs/TODO.md 和 docs/SETTINGS_FRAMEWORK.md 中的 TODO 是文档用途，用于跟踪项目进度，不需要清理。

2. **优先级建议**:
   - Issue #1 和 #3、#4 优先级中等，影响用户体验
   - Issue #2 优先级低，只影响韩语/日语用户

3. **实现复杂度**:
   - Issue #1: 中等（需要修改 SQL 查询逻辑）
   - Issue #2: 简单（只需扩展 Unicode 范围）
   - Issue #3: 中等（需要与会话编辑器集成）
   - Issue #4: 简单（复用现有的删除确认组件）

---

**清理完成时间**: 2026-05-11
**状态**: ✅ 已完成
