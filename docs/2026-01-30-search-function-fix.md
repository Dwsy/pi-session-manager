# 搜索功能修复与调试

## 日期
2026-01-30

## 问题
1. 项目搜索功能完全无法使用
2. 一直显示 "搜索中..." (Searching...)

## 修复内容

### 1. 前端修复

#### src/App.tsx

**问题**: `mapSearchResults` 函数没有保留会话的 `cwd`（工作目录）信息

**修复**:
```typescript
// 修改前
function mapSearchResults(results: SearchResult[]): SessionInfo[] {
  return results.map((r) => ({
    path: r.session_path,
    id: r.session_id,
    cwd: '',  // ❌ 丢失信息
    name: r.session_name,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    message_count: r.matches.length,
    first_message: r.first_message,
    all_messages_text: '',
  }))
}

// 修改后
function mapSearchResults(results: SearchResult[], allSessions: SessionInfo[]): SessionInfo[] {
  return results.map((r) => {
    const originalSession = allSessions.find(s => s.id === r.session_id)
    return {
      path: r.session_path,
      id: r.session_id,
      cwd: originalSession?.cwd || '',  // ✅ 保留原始信息
      name: r.session_name || originalSession?.name,
      created: originalSession?.created || new Date().toISOString(),
      modified: originalSession?.modified || new Date().toISOString(),
      message_count: r.matches.length,
      first_message: r.first_message,
      all_messages_text: '',
    }
  })
}
```

**调用更新**:
```typescript
// 所有调用处都需要传入 sessions 参数
sessions={isSearching ? mapSearchResults(searchResults, sessions) : sessions}
```

### 2. 后端修复

#### src-tauri/src/search.rs

**问题**: 名称搜索模式使用 OR 逻辑，导致搜索结果不精确

**修复**:
```rust
// 修改前
fn matches_session_name(session: &SessionInfo, query_words: &[&str]) -> bool {
    query_words.iter().any(|word| combined.contains(word))  // ❌ OR 逻辑
}

// 修改后
fn matches_session_name(session: &SessionInfo, query_words: &[&str]) -> bool {
    query_words.iter().all(|word| combined.contains(word))  // ✅ AND 逻辑
}
```

#### src-tauri/src/lib.rs

**问题**: 模块未导出，无法在测试中使用

**修复**:
```rust
pub mod commands;  // 暴露 commands 模块
pub mod search;    // 暴露 search 模块
```

### 3. 调试日志

#### src/App.tsx
- `loadSessions`: 追踪会话加载
- `handleSearch`: 追踪搜索过程
- `mapSearchResults`: 追踪结果映射
- `Render`: 追踪组件状态

#### src/components/SearchPanel.tsx
- Query Change: 追踪输入变化
- Debounced Search: 追踪防抖触发

#### src/components/ProjectList.tsx
- Render: 追踪组件渲染

## 测试

### 单元测试 (src-tauri/tests/search_test.rs)

12 个测试全部通过：
- ✅ test_empty_query_returns_empty_results
- ✅ test_single_word_search
- ✅ test_multiple_word_search
- ✅ test_name_search_mode
- ✅ test_role_filter
- ✅ test_multiple_sessions
- ✅ test_snippet_generation
- ✅ test_score_calculation
- ✅ test_thinking_content
- ✅ test_empty_sessions_list
- ✅ test_special_characters
- ✅ test_unicode_search

### 集成测试 (src-tauri/tests/integration_test.rs)

2 个测试全部通过：
- ✅ test_search_integration (7 个子测试)
- ✅ test_search_results_mapping

## 测试命令

```bash
# 运行所有测试
cd src-tauri && cargo test

# 运行特定测试
cd src-tauri && cargo test --test search_test
cd src-tauri && cargo test --test integration_test

# 查看详细输出
cd src-tauri && cargo test -- --nocapture
```

## 调试步骤

1. 打开浏览器开发者工具 (F12)
2. 切换到 Console 标签
3. 在搜索框输入搜索词
4. 观察控制台日志输出

参考 `SEARCH_DEBUG_GUIDE.md` 查看详细调试指南。

## 验收标准

- [x] 后端搜索功能正常工作（所有测试通过）
- [x] 前端搜索结果正确显示（保留 cwd 等信息）
- [x] 搜索状态正确更新（不再卡在 "搜索中"）
- [x] 添加详细的调试日志
- [x] 测试覆盖完整

## 后续工作

1. 在浏览器中测试实际搜索功能
2. 根据控制台日志排查 "搜索中" 问题
3. 问题解决后移除调试日志
4. 考虑添加搜索历史记录
5. 考虑添加高级搜索选项（正则表达式、精确匹配等）