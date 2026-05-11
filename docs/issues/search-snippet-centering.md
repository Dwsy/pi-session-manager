# Issue #1: 搜索摘要中心化显示

**状态**: 📋 待实现
**优先级**: 中
**标签**: enhancement, search, ux
**创建时间**: 2026-05-11

---

## 📝 问题描述

在 `src-tauri/src/data/search/client.rs:204` 中，搜索结果摘要目前只取前 130 个字符：

```rust
let snippet = entry.content.chars().take(130).collect::<String>();
```

如果匹配位置在内容的中间或后面，用户在搜索结果中看不到匹配的内容，影响搜索体验。

## 🎯 期望行为

摘要应该以匹配位置为中心，向前后各取一定字符数，确保匹配内容在摘要中可见。

### 示例
- **当前行为**: 内容 = "AAA...BBB...CCC...DDD"，匹配 "CCC"，摘要 = "AAA...BBB..." → 看不到匹配
- **期望行为**: 内容 = "AAA...BBB...CCC...DDD"，匹配 "CCC"，摘要 = "...BBB CCC DDD..." → 匹配可见

## 💡 实现建议

```rust
// 伪代码
let match_pos = entry.content.find(&query).unwrap_or(0);
let start = match_pos.saturating_sub(40);
let end = (match_pos + 90).min(entry.content.len());
let snippet = entry.content[start..end].to_string();
```

### SQL 实现
```sql
-- 使用 SQLite 的 substr 和 instr 函数
SELECT
  *,
  CASE
    WHEN instr(content, ?1) > 0 THEN
      substr(
        content,
        max(1, instr(content, ?1) - 40),
        130
      )
    ELSE
      substr(content, 1, 130)
  END as snippet
FROM entries
WHERE content LIKE '%' || ?1 || '%'
```

## 📊 影响范围

- **文件**: `src-tauri/src/data/search/client.rs`
- **函数**: 搜索结果匹配逻辑
- **测试**: 需要添加测试用例验证不同匹配位置的摘要

## ✅ 验收标准

- [ ] 搜索结果摘要以匹配位置为中心
- [ ] 匹配内容在摘要中可见
- [ ] 前后各显示约 40-60 个字符
- [ ] 边界情况处理（匹配在开头/结尾）
- [ ] 添加单元测试

## 🔗 相关文件

- `src-tauri/src/data/search/client.rs:204`
- `src/browser-dataset/search.ts` (前端搜索)

---

**创建人**: MiMo Agent
**来源**: TODO 清理任务
