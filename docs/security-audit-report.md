# Rust 项目安全报告

**项目**: pi-session-manager (Tauri 后端)  
**分析日期**: 2026-02-05  
**报告类型**: 代码安全审计

---

## 1. 执行摘要

本报告对 pi-session-manager 的 Rust 后端进行了安全审计。项目采用 Tauri + Rust 构建，提供桌面端 IPC 和 WebSocket 双通道支持。审计发现了 **高风险漏洞 2 处**、**中风险问题 4 处**、**低风险问题 3 处**。

### 风险等级分布

| 等级 | 数量 | 问题类型 |
|------|------|----------|
| 🔴 高 | 2 | 远程代码执行、任意文件删除 |
| 🟠 中 | 4 | 输入验证不足、缺乏速率限制 |
| 🟢 低 | 3 | 错误处理、信息泄露 |

---

## 2. 高风险漏洞

### 2.1 任意命令执行 (ws_adapter.rs)

**位置**: `dispatch_command` → `send_rpc_bash`  
**严重程度**: 🔴 严重  
**CVSS**: 9.8 (Critical)

**问题描述**:
```rust
"send_rpc_bash" => {
    let command = extract_string(payload, "command")?;
    rpc_service::send_rpc_bash_impl(rpc_client, command).await?;
    Ok(Value::Null)
}
```

WebSocket 接口允许客户端执行任意 bash 命令，没有任何验证或沙箱限制。

**攻击场景**:
```json
{
  "command": "send_rpc_bash",
  "payload": {
    "command": "rm -rf ~/*"
  }
}
```

**建议**:
1. 实现命令白名单机制
2. 添加命令执行超时限制
3. 使用受限的 shell（如 `rbash`）
4. 要求用户显式授权高风险命令

---

### 2.2 任意文件读取/删除 (ws_adapter.rs)

**位置**: `dispatch_command` → `read_session_file`, `delete_session`  
**严重程度**: 🔴 严重  
**CVSS**: 9.1

**问题描述**:
```rust
"read_session_file" => {
    let path = extract_string(payload, "path")?;
    let result = std::fs::read_to_string(&path)... // 无路径验证
}

"delete_session" => {
    let path = extract_string(payload, "path")?;
    std::fs::remove_file(&path)... // 无路径验证
}
```

攻击者可读取/删除系统任意文件。

**攻击向量**:
```json
{
  "command": "read_session_file",
  "payload": {
    "path": "/etc/passwd"
  }
}
```

**建议**:
1. 实现路径规范化 (`std::fs::canonicalize`)
2. 限制访问范围在会话目录内
3. 添加访问控制列表 (ACL)
4. 使用沙箱文件系统

---

## 3. 中风险问题

### 3.1 WebSocket 无身份验证

**位置**: `ws_adapter.rs` → `start()`  
**严重程度**: 🟠 高  
**CVSS**: 8.1

**问题描述**:
```rust
let listener = TcpListener::bind(&addr).await?;
```

WebSocket 服务器绑定到 localhost，但任何本地进程都可连接，无身份验证机制。

**影响**:
- 本地攻击者可调用所有命令
- 如果端口暴露，存在 RCE 风险

**建议**:
1. 实现 WebSocket 认证令牌
2. 使用 TLS 加密 (WSS)
3. 限制连接来源

---

### 3.2 缺乏速率限制

**位置**: 全局  
**严重程度**: 🟠 中  
**CVSS**: 5.3

**问题描述**:
- 无请求频率限制
- 无并发连接限制
- 无请求大小限制

**影响**:
- 资源耗尽 (DoS)
- 暴力破解

**建议**:
```rust
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

struct RateLimiter {
    requests: RwLock<HashMap<String, (Instant, usize)>>,
    max_requests: usize,
    window: Duration,
}

impl RateLimiter {
    fn check(&self, client_id: &str) -> Result<(), String> {
        // 实现滑动窗口限流
    }
}
```

---

### 3.3 JSON 解析错误处理

**位置**: `ws_adapter.rs` → `handle_connection`  
**严重程度**: 🟠 中  
**CVSS**: 5.3

**问题描述**:
```rust
match serde_json::from_str::<WsRequest>(&text) {
    Ok(request) => { ... }
    Err(e) => {
        log::error!("Failed to parse request: {}", e);
        // 继续处理下一个消息，没有断开连接
    }
}
```

恶意构造的 JSON 可能导致解析器行为异常。

**建议**:
1. 添加解析超时
2. 限制 JSON 大小
3. 使用 `from_str` 的安全模式

---

### 3.4 使用 `unwrap()` 可能导致 Panic

**位置**: 多处  
**严重程度**: 🟠 中  
**CVSS**: 5.0

**问题示例** (scanner.rs):
```rust
let file_modified: DateTime<Utc> = match metadata {
    Ok(m) => {
        DateTime::from(m.modified().unwrap_or(std::time::SystemTime::now()))
    }
    Err(_) => continue,
};
```

**建议**:
```rust
// 改用 ? 运算符或显式错误处理
let modified = metadata?
    .modified()
    .map_err(|e| format!("Failed to get modified time: {}", e))?;
```

---

## 4. 低风险问题

### 4.1 敏感信息明文存储

**位置**: `sqlite_cache.rs`  
**严重程度**: 🟢 低  
**CVSS**: 3.7

- 会话消息明文存储在 SQLite
- 配置文件包含敏感设置
- 无数据库加密

**建议**:
1. 使用 SQLCipher 加密数据库
2. 加密敏感配置字段

---

### 4.2 错误信息泄露

**位置**: 多处错误处理  
**严重程度**: 🟢 低  
**CVSS**: 3.5

```rust
Err(error) => WsResponse {
    error: Some(error), // 可能泄露内部路径
}
```

**建议**:
```rust
Err(error) => WsResponse {
    error: Some("Operation failed".to_string()),
}
```

---

### 4.3 缺少安全响应头

**位置**: Tauri 配置  
**严重程度**: 🟢 低  
**CVSS**: 2.6

- 缺少 CSP (Content Security Policy)
- 缺少安全响应头配置

---

## 5. 安全架构评估

### 5.1 架构优势 ✅

1. **Rust 语言安全性**
   - 内存安全 (无 GC，无数据竞争)
   - 强类型系统
   - 所有权模型

2. **错误处理模式**
   - 使用 `Result<T, E>` 模式
   - 避免了异常控制流

3. **依赖管理**
   - 使用 Cargo.lock 锁定版本
   - 定期更新依赖

### 5.2 需要改进 ⚠️

1. **缺少安全测试**
   - 无模糊测试 (fuzzing)
   - 无安全扫描集成

2. **审计覆盖不足**
   - 无第三方安全审计
   - 缺少自动化安全检测

---

## 6. 修复优先级

| 优先级 | 问题 | 预计工时 |
|--------|------|----------|
| P0 | 任意命令执行 | 4h |
| P0 | 任意文件读写 | 2h |
| P1 | WebSocket 认证 | 2h |
| P1 | 速率限制 | 4h |
| P2 | JSON 解析加固 | 2h |
| P2 | unwrap() 替换 | 3h |
| P3 | 数据库加密 | 8h |

---

## 7. 总结

pi-session-manager 的 Rust 实现总体质量良好，充分利用了 Rust 的安全特性。但 **WebSocket 接口存在严重的安全漏洞**，建议立即修复 P0 级别问题后再发布。

### 立即行动项

1. ✅ 修复 `send_rpc_bash` 的命令注入漏洞
2. ✅ 修复 `read_session_file/delete_session` 的路径遍历漏洞
3. ✅ 添加 WebSocket 认证
4. ✅ 实现速率限制

---

*报告生成时间: 2026-02-05 01:32*
*审计工具: 人工代码审查*
