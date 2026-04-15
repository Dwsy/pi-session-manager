# 删除 all_messages_text 冗余字段

## 状态: todo

## 问题

`sessions.all_messages_text` 是冗余缓存字段，与 `message_entries.content` + FTS5 索引存在功能重叠。

- `all_messages_text`: 71.8MB 总字符，189MB SQLite 存储
- `message_entries`: 69.6MB 总字符，248MB SQLite 存储

两者数据基本重复，用于搜索预筛选。

## 影响分析

### 核心用途
1. **Search 预筛选** — `data/search/client.rs` 中 `has_match_in_text()` 快速过滤
2. **前端本地过滤** — `browser-dataset/core.ts` 加载后用于快速匹配
3. **stats/intel** — 统计分析查询

### 可替代方案
- FTS5 全文索引 (`message_fts`) 可提供相同/更强的搜索能力
- `message_entries.content` 拼接可动态生成（仅需时）

## 修改范围

### 需要修改的文件 (18个)

**Rust 后端:**
- `src-tauri/src/types/mod.rs` — 删除字段定义
- `src-tauri/src/domain/pi_session.rs` — 移除拼接逻辑
- `src-tauri/src/domain/session_list/mod.rs` — 移除默认值
- `src-tauri/src/domain/session_list/pagination.rs` — 移除默认值
- `src-tauri/src/domain/casr_min/adapters.rs` — 移除赋值
- `src-tauri/src/core/scanner.rs` — 移除赋值
- `src-tauri/src/core/intel.rs` — 移除查询
- `src-tauri/src/data/sqlite/bootstrap.rs` — 移除 schema 列
- `src-tauri/src/data/sqlite/sessions.rs` — 移除读写
- `src-tauri/src/data/sqlite/maintenance.rs` — 移除维护
- `src-tauri/src/data/sqlite/legacy_fts.rs` — 移除迁移
- `src-tauri/src/data/search/client.rs` — 移除预筛选逻辑
- `src-tauri/src/commands/session.rs` — 移除参数
- `src-tauri/src/commands/settings.rs` — 移除查询
- `src-tauri/src/stats.rs` — 移除测试数据

**TypeScript 前端:**
- `src/types.ts` — 移除类型定义
- `src/browser-dataset/core.ts` — 移除赋值
- `src/demo/content.ts` — 移除测试数据

**测试文件 (需同步更新):**
- `src-tauri/src/types/mod.rs` 测试
- `src-tauri/src/tests/*.rs` 中的测试数据

## 实施步骤

1. [ ] 删除 `types/mod.rs` 中 `all_messages_text` 字段
2. [ ] 更新 `pi_session.rs` 解析逻辑
3. [ ] 更新 `search/client.rs` 移除预筛选逻辑
4. [ ] 更新 SQLite schema 和读写逻辑
5. [ ] 更新前端 TypeScript 类型
6. [ ] 运行测试验证
7. [ ] 构建验证

## 预期收益

- SQLite 存储减少 ~180MB
- 消除数据冗余
- 简化维护
