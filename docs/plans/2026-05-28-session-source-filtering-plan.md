# Session Source Filtering Plan

> 方案 A：查询时过滤，不清除缓存

## 目标

切换默认 Pi 会话目录或外部 CLI 来源时，不清除 SQLite 缓存，查询时动态过滤显示。

## 验收标准

- [ ] 切换默认路径开关响应 < 100ms（无磁盘扫描）
- [ ] 关闭后重新开启，会话瞬间恢复（无需重新解析文件）
- [ ] 搜索、统计、会话列表均正确过滤隐藏来源
- [ ] 文件监听器继续监听所有路径（包括禁用的），保持数据新鲜

---

## 全链路可行性分析

### 架构现状

| 组件 | 技术 | 是否受方案 A 影响 |
|------|------|----------------|
| Session 存储 | SQLite | ✅ 需加 `source_type` 字段 |
| 全文搜索 | SQLite FTS5 (`message_fts`) | ✅ 需后过滤 |
| 列表查询 | SQLite + 内存缓存 | ✅ 需动态过滤 |
| 文件监听 | `notify` crate | ✅ 需调整范围 |

### 关键发现

- **无 Tantivy**：搜索基于 SQLite FTS5，结构简单
- **已有 Migration 系统**：`migrations.rs` 支持到 version 18，添加新列安全
- **现有过滤模式**：`filter_by_source_slugs()` 可作为参考实现

### 关键决策点

| 决策 | 推荐方案 | 原因 |
|------|---------|------|
| FTS5 过滤方式 | **搜索后过滤** | FTS5 未索引 source_type，后过滤简单可靠 |
| 内存缓存策略 | **缓存全部，查询时过滤** | 保持数据新鲜，切换时无重新扫描 |
| 是否保留 clear_all_cache | **保留为 fallback** | 数据修复场景可用 |

---

## Task 1: DB Schema Migration - 添加 source_type 字段

**描述**: 修改 sessions 表结构，为每个 session 记录来源类型

**改动文件**:
- `src-tauri/src/data/sqlite/migrations.rs` - 添加 migration_19
- `src-tauri/src/data/sqlite/schema.rs` - 更新表结构定义

**实现要点**:
```rust
// migration_19
conn.execute(
    "ALTER TABLE sessions ADD COLUMN source_type TEXT DEFAULT 'pi_default'",
    []
)?;

// source_type 枚举值
pi_default    - ~/.pi/agent/sessions
pi_custom     - 用户自定义路径
codex         - ~/.codex/sessions
claude        - ~/.claude/projects
gemini        - ~/.gemini/tmp
factory       - ~/.factory/sessions
clawdbot      - ~/.clawdbot/sessions
opencode      - ~/.config/opencode/sessions
unknown       - 无法识别
```

**验收标准**:
- [ ] Migration 可重复执行（幂等）
- [ ] 旧数据自动标记为 `pi_default`
- [ ] `cargo test` 通过所有现有测试

---

## Task 2: 扫描时识别并存储来源类型

**描述**: 修改 scanner，在扫描时识别 session 来源并写入 DB

**改动文件**:
- `src-tauri/src/core/scanner.rs` - 新增 `detect_source_type()` 函数
- `src-tauri/src/types.rs` - `SessionInfo` 添加 `source_type: String` 字段
- `src-tauri/src/data/sqlite/sessions.rs` - 更新 upsert 逻辑

**实现要点**:
```rust
fn detect_source_type(path: &Path, config: &Config) -> String {
    let default_pi = pi_agent_sessions_dir().ok();

    if default_pi.as_ref().is_some_and(|d| path.starts_with(d)) {
        "pi_default".to_string()
    } else if config.session_paths.iter().any(|p| {
        path.starts_with(expand_tilde(p))
    }) {
        "pi_custom".to_string()
    } else if SessionBridgeSource::from_path(path).is_some() {
        // 利用现有 source_from_path 逻辑
        source.slug().replace("_", "-")
    } else {
        "unknown".to_string()
    }
}
```

**验收标准**:
- [ ] 新扫描的 session 正确标记来源
- [ ] `scan_sessions()` 返回的 SessionInfo 包含 source_type
- [ ] 现有测试通过

---

## Task 3: 保存配置时不清除缓存

**描述**: 修改 settings 命令，切换来源时只更新配置，不清除数据

**改动文件**:
- `src-tauri/src/commands/settings.rs` - `save_default_pi_session_dir_enabled_core()`
- `src-tauri/src/commands/settings.rs` - `save_session_scan_other_agents_core()`

**实现要点**:
```rust
pub async fn save_default_pi_session_dir_enabled_core(enabled: bool) -> Result<bool, String> {
    let mut config = Config::load().unwrap_or_default();
    if config.include_default_pi_session_dir == enabled {
        return Ok(false); // 无变化
    }

    // 保存配置
    config.include_default_pi_session_dir = enabled;
    crate::config::save_config(&config)?;
    crate::settings_store::set(INCLUDE_DEFAULT_PI_SESSION_DIR_KEY, &enabled)?;

    // ✅ 移除以下清理代码
    // let conn = crate::data::sqlite::init_db_with_config(&config)?;
    // crate::data::sqlite::clear_all_cache(&conn)?;
    // crate::core::scanner::invalidate_cache();

    // 只通知前端刷新列表（重新查询时会过滤）
    Ok(true)
}
```

**验收标准**:
- [ ] 切换开关后 SQLite 中数据仍然存在
- [ ] 切换响应时间 < 100ms
- [ ] 前端收到刷新通知后正确更新显示

---

## Task 4: 查询时动态过滤

**描述**: SessionList 查询时根据配置过滤来源类型

**改动文件**:
- `src-tauri/src/domain/session_list/filtering.rs` - 新增 `filter_by_active_paths()`
- `src-tauri/src/domain/session_list/mod.rs` - `scan_sessions_paginated_impl()` 应用过滤
- `src-tauri/src/commands/session.rs` - 统计接口过滤

**实现要点**:
```rust
// filtering.rs
pub fn filter_by_active_paths(sessions: &mut Vec<SessionInfo>, config: &Config) {
    let active_types = compute_active_source_types(config);
    sessions.retain(|s| active_types.contains(&s.source_type));
}

fn compute_active_source_types(config: &Config) -> HashSet<String> {
    let mut types = HashSet::new();

    if config.include_default_pi_session_dir {
        types.insert("pi_default".to_string());
    }
    types.insert("pi_custom".to_string()); // 自定义路径始终启用

    // 外部 CLI 来源根据配置添加
    for slug in config.effective_external_session_provider_slugs() {
        types.insert(slug.replace("_", "-"));
    }

    types
}

// mod.rs - scan_sessions_paginated_impl
let mut sessions = get_all_sessions_including_hidden().await?;
filter_by_active_paths(&mut sessions, &config); // 应用过滤
// 继续其他过滤...
```

**缓存策略**:
- `get_cached_sessions_for_list()` 缓存全部 sessions（不过滤）
- 每次查询时根据当前配置动态过滤
- 切换配置时只需重新查询，无需重新扫描磁盘

**验收标准**:
- [ ] 关闭默认路径后，列表不再显示 pi_default 会话
- [ ] 搜索接口只返回启用的来源
- [ ] 统计数字正确（排除隐藏的会话）
- [ ] 重新开启后，会话立即显示（无需重新扫描）

---

## Task 5: 搜索索引同步过滤

**描述**: FTS5 搜索时应用相同的来源过滤

**改动文件**:
- `src-tauri/src/commands/search.rs` - `search_message_fts()` 后过滤结果
- `src-tauri/src/types.rs` - `FullTextSearchHit` 添加 `source_type` 字段

**实现要点**:
```rust
// search.rs
pub async fn search_sessions(...) -> Result<FullTextSearchResponse, String> {
    let hits = search_message_fts(query).await?;

    // 后过滤：排除禁用来源的结果
    let config = Config::load()?;
    let active_types = compute_active_source_types(&config);

    let filtered_hits: Vec<_> = hits.into_iter()
        .filter(|hit| active_types.contains(&hit.source_type))
        .collect();

    Ok(FullTextSearchResponse {
        hits: filtered_hits,
        total_hits: filtered_hits.len(),
        has_more: false
    })
}
```

**性能考虑**:
- 搜索后过滤可能返回较少结果，需增加 candidate limit
- 或改用 path 前缀匹配减少无效搜索范围

**验收标准**:
- [ ] 搜索结果不包含已禁用来源的会话
- [ ] 搜索性能可接受（不过滤导致扫描大量无用结果）

---

## Task 6: 文件监听器调整

**描述**: 继续监听所有路径，但只处理启用的来源

**改动文件**:
- `src-tauri/src/file_watcher.rs` - 使用 `get_all_potential_dirs()` 替代 `get_all_session_dirs()`
- `src-tauri/src/core/scanner.rs` - 新增 `get_all_potential_dirs()` 函数

**实现要点**:
```rust
// scanner.rs - 新增
pub fn get_all_potential_dirs(config: &Config) -> Vec<PathBuf> {
    // 包含所有可能的路径，无论是否启用
    let mut dirs = vec![];

    // 默认 Pi 路径（即使禁用也监听）
    if let Ok(default) = pi_agent_sessions_dir() {
        dirs.push(default);
    }

    // 自定义路径
    for p in &config.session_paths {
        dirs.push(expand_tilde(p).into());
    }

    // 外部 CLI 路径（根据 scan_other_agent_jsonl 配置）
    if config.scan_other_agent_jsonl {
        dirs.extend(external_session_roots());
    }

    dirs
}

// file_watcher.rs
let all_dirs = get_all_potential_dirs(&config); // 监听所有

fn handle_file_event(path: &Path, config: &Config) {
    // 1. 更新 DB（无论是否启用）
    let source_type = detect_source_type(path, config);
    update_session_in_db(path, source_type);

    // 2. 只通知前端启用的来源变更
    if is_source_enabled(&source_type, config) {
        emit_sessions_changed();
    }
}
```

**验收标准**:
- [ ] 禁用来源的文件变更仍更新 DB（保持数据新鲜）
- [ ] 禁用来源的变更不触发前端刷新（减少噪声）
- [ ] 重新开启后，最新数据立即可用

---

## Task 7: 集成测试

**描述**: 添加端到端测试验证完整流程

**改动文件**:
- `src-tauri/tests/session_source_filtering.rs` - 新增测试文件

**测试场景**:
```rust
#[tokio::test]
async fn test_toggle_default_path_no_rescan() {
    // 1. 初始状态：默认路径开启，扫描完成
    let config = Config::default();
    let sessions = scan_sessions_with_config(&config).await.unwrap();
    assert!(sessions.iter().any(|s| s.source_type == "pi_default"));

    // 2. 关闭默认路径 -> 验证列表为空，DB 仍有数据
    config.include_default_pi_session_dir = false;
    save_config(&config).unwrap();

    let filtered = get_filtered_sessions(&config).await.unwrap();
    assert!(filtered.iter().all(|s| s.source_type != "pi_default"));

    // 3. 验证切换时间 < 100ms
    let start = Instant::now();
    toggle_default_path(false).await.unwrap();
    assert!(start.elapsed().as_millis() < 100);

    // 4. 重新开启 -> 验证列表恢复，无需重新扫描
    let start = Instant::now();
    toggle_default_path(true).await.unwrap();
    let restored = get_filtered_sessions(&config).await.unwrap();
    assert!(restored.iter().any(|s| s.source_type == "pi_default"));
    assert!(start.elapsed().as_millis() < 100); // 瞬间恢复
}
```

**验收标准**:
- [ ] 所有新测试通过
- [ ] `cargo test` 全部通过
- [ ] `cargo clippy` 无警告

---

## 依赖关系

```
Task 1 (Schema) → Task 2 (Scanner)
                     ↓
Task 3 (Settings) → Task 4 (Query Filter) → Task 5 (Search) → Task 7 (Test)
                     ↓
Task 6 (Watcher) ───┘
```

**关键路径**: Task 1 → Task 2 → Task 4 → Task 7

## 修改工作量评估

| Task | 文件数 | 复杂度 | 预估时间 |
|------|-------|--------|---------|
| 1. DB Schema | 2 | 低 | 2h |
| 2. Scanner 识别 | 3 | 中 | 4h |
| 3. Settings 清理 | 2 | 低 | 2h |
| 4. 查询过滤 | 3 | 中 | 4h |
| 5. 搜索过滤 | 2 | 中 | 3h |
| 6. 监听调整 | 2 | 低 | 2h |
| 7. 测试 | 1 | 中 | 3h |
| **总计** | **15** | **中** | **20h (2-3天)** |

## 回滚方案

1. **DB Migration 回滚**:
   ```sql
   ALTER TABLE sessions DROP COLUMN source_type; -- 可选，不影响功能
   ```

2. **代码回滚**:
   - Task 3 保留旧代码路径为注释，可快速恢复 `clear_all_cache()` 行为
   - Task 4/5 添加 `if config.enable_source_filtering` 开关

3. **紧急修复**:
   - 若出现数据不一致，手动触发 `clear_all_cache()` 重新扫描

## 风险与缓解

| 风险 | 影响 | 缓解方案 |
|------|------|---------|
| FTS5 搜索结果包含禁用来源 | 搜索泄露隐藏数据 | 后过滤确保结果正确 |
| 内存缓存增长 | 长期禁用大量外部 sessions | 设置缓存上限 10k sessions |
| 切换后列表/搜索不一致 | UX 问题 | 统一 `compute_active_source_types()` 逻辑 |
| Migration 失败 | 启动崩溃 | `ALTER TABLE` 幂等，失败重试 |
