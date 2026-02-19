# Role-Memory 插件只读接入（最小补丁）

目标：不改现有 MEMORY.md 写入链路，仅增加读取增强。

## 1) before_agent_start

调用：`POST /v1/memory/unified`

请求：
```json
{
  "query": "<当前用户问题>",
  "top_k": 5,
  "experience_limit": 5
}
```

注入到系统上下文：
- `intent`
- `confidence`
- `evidence[0..3]`
- `next_actions[0..3]`

低置信度策略：
- 若 `confidence < 0.5`，优先执行 `clarify-intent`。

## 2) agent_end

调用：`POST /v1/experience/extract`（limit=5）

用途：
- 只做候选经验统计和日志展示
- 不直接写回 MEMORY.md（保持现有写入逻辑不变）

## 3) 健康监控（可选）

调用：`GET /v1/analytics/overview`

用于观测：
- sessions 总量
- top_cwds
- intent_counts

## 4) 故障回退

当接口不可达时：
1. 跳过增强层
2. 使用现有 role-memory 逻辑
3. 记录一次降级日志

## 5) 成功标准（1周）

- recall 命中率可见（有 evidence 返回）
- next_actions 被主流程消费
- 无写入链路改动
- 无额外权限需求（只读）
