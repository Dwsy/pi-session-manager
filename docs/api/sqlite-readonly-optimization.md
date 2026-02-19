# SQLite 只读优化方案（memory / experience / route）

## 1) 三类高价值查询

### A. recall（快速召回）
- 目标：按关键词/意图快速找到历史证据
- 数据源：`sessions(all_messages_text, first_message, last_message)` + `sessions_fts`
- SQL 示例：
```sql
SELECT id, path, cwd, modified, first_message, last_message
FROM sessions
WHERE lower(all_messages_text) LIKE '%' || lower(:q) || '%'
ORDER BY modified DESC
LIMIT :k;
```

### B. experience（经验抽取）
- 目标：从会话中提炼 problem→action→outcome
- 数据源：`sessions`（候选集） + JSONL 文件（精抽取）
- SQL 示例（候选集）：
```sql
SELECT id, path, modified, first_message, last_message
FROM sessions
ORDER BY modified DESC
LIMIT 200;
```

### C. route（路由纠偏）
- 目标：基于历史分布给下一步建议
- 数据源：`sessions(all_messages_text, cwd)`
- SQL 示例：
```sql
SELECT cwd, COUNT(*) c
FROM sessions
GROUP BY cwd
ORDER BY c DESC
LIMIT 10;
```

## 2) 推荐索引（读优化）

> 当前主线是只读；索引变更建议先在副本验证。

```sql
CREATE INDEX IF NOT EXISTS idx_sessions_modified ON sessions(modified DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_cwd ON sessions(cwd);
CREATE INDEX IF NOT EXISTS idx_sessions_last_accessed ON sessions(last_accessed DESC);
```

原因：
- `modified`：时间线、最近会话检索高频
- `cwd`：项目级聚合与路由分组
- `last_accessed`：热会话优先

## 3) 风险与回滚

- 风险：索引创建会写库，不符合当前只读阶段
- 处理：
  1. 先只用现有查询 + LIMIT 控制
  2. 需要索引时在离线副本上验证
  3. 回滚：`DROP INDEX idx_xxx`

## 4) 立即可执行（纯只读）

```sql
-- 总量
SELECT COUNT(*) FROM sessions;
SELECT COUNT(*) FROM session_details_cache;

-- 路由分布
SELECT cwd, COUNT(*) c
FROM sessions
GROUP BY cwd
ORDER BY c DESC
LIMIT 5;

-- 意图粗分类分布
SELECT
  SUM(CASE WHEN lower(all_messages_text) LIKE '%error%' OR all_messages_text LIKE '%报错%' OR all_messages_text LIKE '%修复%' THEN 1 ELSE 0 END) AS debugging,
  SUM(CASE WHEN all_messages_text LIKE '%架构%' OR lower(all_messages_text) LIKE '%design%' THEN 1 ELSE 0 END) AS architecture,
  SUM(CASE WHEN all_messages_text LIKE '%实现%' OR all_messages_text LIKE '%开发%' OR lower(all_messages_text) LIKE '%implement%' THEN 1 ELSE 0 END) AS implementation,
  SUM(CASE WHEN all_messages_text LIKE '%测试%' OR lower(all_messages_text) LIKE '%test%' THEN 1 ELSE 0 END) AS testing
FROM sessions;
```
