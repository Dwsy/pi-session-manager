//! Pi CLI RPC 客户端实现
//!
//! 通过 stdin/stdout 与 Pi CLI 进行 JSON RPC 通信

use crate::pi_rpc::types::{RPCCommand, RPCEvent, RPCMessage, RPCPhase, RPCSessionState};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::{mpsc, oneshot, Mutex, RwLock};

fn command_name(command: &RPCCommand) -> &'static str {
    match command {
        RPCCommand::Prompt { .. } => "prompt",
        RPCCommand::Steer { .. } => "steer",
        RPCCommand::FollowUp { .. } => "follow_up",
        RPCCommand::Abort => "abort",
        RPCCommand::GetState => "get_state",
        RPCCommand::GetMessages => "get_messages",
        RPCCommand::GetAvailableModels => "get_available_models",
        RPCCommand::SetModel { .. } => "set_model",
        RPCCommand::CycleModel => "cycle_model",
        RPCCommand::SetThinkingLevel { .. } => "set_thinking_level",
        RPCCommand::CycleThinkingLevel => "cycle_thinking_level",
        RPCCommand::Compact { .. } => "compact",
        RPCCommand::SetAutoCompaction { .. } => "set_auto_compaction",
        RPCCommand::NewSession { .. } => "new_session",
        RPCCommand::SwitchSession { .. } => "switch_session",
        RPCCommand::Bash { .. } => "bash",
        RPCCommand::AbortBash => "abort_bash",
        RPCCommand::GetSessionStats => "get_session_stats",
        RPCCommand::GetCommands => "get_commands",
    }
}

fn truncate_text(input: &str, max: usize) -> String {
    if input.len() <= max {
        input.to_string()
    } else {
        let mut end = max.min(input.len());
        while end > 0 && !input.is_char_boundary(end) {
            end -= 1;
        }
        if end == 0 {
            format!("...(len={})", input.len())
        } else {
            format!("{}...(len={})", &input[..end], input.len())
        }
    }
}

fn parse_request_number(request_id: &str) -> Option<u64> {
    request_id.strip_prefix("req-")?.parse::<u64>().ok()
}

fn strip_terminal_control_sequences(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut output: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0usize;

    while i < bytes.len() {
        if bytes[i] == 0x1b {
            // OSC: ESC ] ... BEL or ST(ESC \)
            if i + 1 < bytes.len() && bytes[i + 1] == b']' {
                i += 2;
                while i < bytes.len() {
                    if bytes[i] == 0x07 {
                        i += 1;
                        break;
                    }
                    if i + 1 < bytes.len() && bytes[i] == 0x1b && bytes[i + 1] == b'\\' {
                        i += 2;
                        break;
                    }
                    i += 1;
                }
                continue;
            }

            // CSI: ESC [ ... <final byte 0x40-0x7E>
            if i + 1 < bytes.len() && bytes[i + 1] == b'[' {
                i += 2;
                while i < bytes.len() {
                    let b = bytes[i];
                    i += 1;
                    if (0x40..=0x7E).contains(&b) {
                        break;
                    }
                }
                continue;
            }

            // 其他 ESC 序列，跳过 ESC 和下一个字符
            i += if i + 1 < bytes.len() { 2 } else { 1 };
            continue;
        }

        output.push(bytes[i]);
        i += 1;
    }

    String::from_utf8_lossy(&output).to_string()
}

fn normalize_event_payload(raw_line: &str) -> Option<String> {
    let stripped = strip_terminal_control_sequences(raw_line);
    let trimmed = stripped.trim();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        return Some(trimmed.to_string());
    }

    if let Some(pos) = trimmed.find('{') {
        return Some(trimmed[pos..].to_string());
    }

    if let Some(pos) = trimmed.find('[') {
        return Some(trimmed[pos..].to_string());
    }

    None
}

fn normalize_message_for_cache(value: &serde_json::Value, index: usize) -> serde_json::Value {
    let mut obj = match value.as_object() {
        Some(map) => map.clone(),
        None => return value.clone(),
    };

    if let Some(role) = obj.get("role").and_then(|v| v.as_str()) {
        match role {
            "toolResult" | "tool_result" => {
                obj.insert(
                    "role".to_string(),
                    serde_json::Value::String("tool".to_string()),
                );
                if !obj.contains_key("id") {
                    if let Some(tool_call_id) = obj.get("toolCallId").and_then(|v| v.as_str()) {
                        obj.insert(
                            "id".to_string(),
                            serde_json::Value::String(tool_call_id.to_string()),
                        );
                    }
                }
            }
            "user" | "assistant" | "tool" => {}
            _ => {
                obj.insert(
                    "role".to_string(),
                    serde_json::Value::String("assistant".to_string()),
                );
            }
        }
    }

    let missing_id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().is_empty())
        .unwrap_or(true);
    if missing_id {
        let synthetic = format!("rpc-cache-msg-{}", index);
        obj.insert("id".to_string(), serde_json::Value::String(synthetic));
    }

    if !obj.contains_key("role") {
        obj.insert(
            "role".to_string(),
            serde_json::Value::String("assistant".to_string()),
        );
    }

    serde_json::Value::Object(obj)
}

/// RPC 客户端状态
#[derive(Debug, Clone)]
pub struct RPCState {
    /// 当前阶段
    pub phase: RPCPhase,
    /// 当前会话文件路径
    pub session_file: Option<String>,
    /// 是否已连接
    pub is_connected: bool,
    /// 最后错误信息
    pub last_error: Option<String>,
}

impl Default for RPCState {
    fn default() -> Self {
        Self {
            phase: RPCPhase::Disconnected,
            session_file: None,
            is_connected: false,
            last_error: None,
        }
    }
}

/// Pi RPC 客户端
pub struct PiRPCClient {
    /// Pi CLI 可执行文件路径
    pi_path: String,
    /// 进程启动时的工作目录
    working_dir: Option<String>,
    /// Pi CLI 进程
    process: Child,
    /// 标准输入
    stdin: ChildStdin,
    /// 事件发送通道
    event_tx: mpsc::Sender<RPCEvent>,
    /// 客户端状态
    state: Arc<RwLock<RPCState>>,
    /// 命令序列号（用于匹配响应）
    command_id: Arc<Mutex<u64>>,
    /// 待处理的响应
    pending_responses: Arc<Mutex<HashMap<String, PendingResponse>>>,
    /// 缓存的消息列表
    message_cache: Arc<Mutex<Vec<RPCMessage>>>,
    /// 进程退出通知（true 表示需要自动重启）
    exit_tx: tokio::sync::watch::Sender<bool>,
    /// 是否允许自动重启
    auto_restart_enabled: Arc<AtomicBool>,
}

#[derive(serde::Serialize)]
struct RPCCommandEnvelope<'a> {
    id: String,
    #[serde(flatten)]
    command: &'a RPCCommand,
}

struct PendingResponse {
    command: String,
    sender: oneshot::Sender<RPCEvent>,
}

impl PiRPCClient {
    /// 创建新的 RPC 客户端
    ///
    /// # Arguments
    /// * `pi_path` - Pi CLI 可执行文件路径
    /// * `event_tx` - 事件发送通道，用于将接收到的 RPC 事件发送到外部
    ///
    /// # Returns
    /// * `Result<Self, String>` - 成功返回客户端实例，失败返回错误信息
    pub async fn new(
        pi_path: &str,
        event_tx: mpsc::Sender<RPCEvent>,
        session_file: Option<String>,
        working_dir: Option<String>,
    ) -> Result<Self, String> {
        log::info!("Starting Pi RPC client with: {}", pi_path);

        // 启动 Pi CLI 进程
        let mut command = Command::new(pi_path);
        command.arg("--mode").arg("rpc");
        if let Some(session) = session_file.as_ref() {
            command.arg("--session").arg(session);
        }
        if let Some(dir) = working_dir.as_ref() {
            command.current_dir(dir);
        }

        let mut process = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start pi process: {}", e))?;

        let stdin = process.stdin.take().ok_or("Failed to get stdin")?;

        let stdout = process.stdout.take().ok_or("Failed to get stdout")?;

        let stderr = process.stderr.take().ok_or("Failed to get stderr")?;

        let state = Arc::new(RwLock::new(RPCState {
            phase: RPCPhase::Starting,
            is_connected: true,
            ..Default::default()
        }));

        let (exit_tx, _exit_rx) = tokio::sync::watch::channel(false);
        let auto_restart_enabled = Arc::new(AtomicBool::new(true));

        // 启动事件读取任务
        let state_clone = state.clone();
        let event_tx_clone = event_tx.clone();
        let pending_clone = Arc::new(Mutex::new(HashMap::new()));
        let pending_reader = pending_clone.clone();
        let message_cache = Arc::new(Mutex::new(Vec::new()));
        let cache_reader = message_cache.clone();
        let exit_reader = exit_tx.clone();
        let restart_reader = auto_restart_enabled.clone();
        tokio::spawn(Self::read_events(
            BufReader::new(stdout),
            event_tx_clone,
            state_clone,
            pending_reader,
            cache_reader,
            exit_reader,
            restart_reader,
        ));

        // 启动错误读取任务
        tokio::spawn(Self::read_stderr(BufReader::new(stderr)));

        log::info!("Pi RPC client started successfully");

        Ok(Self {
            pi_path: pi_path.to_string(),
            working_dir: working_dir.clone(),
            process,
            stdin,
            event_tx,
            state,
            command_id: Arc::new(Mutex::new(0)),
            pending_responses: pending_clone,
            message_cache,
            exit_tx,
            auto_restart_enabled,
        })
    }

    async fn next_command_id(&self) -> String {
        let mut guard = self.command_id.lock().await;
        *guard += 1;
        format!("req-{}", *guard)
    }

    /// 发送 RPC 命令
    ///
    /// # Arguments
    /// * `command` - 要发送的命令
    ///
    /// # Returns
    /// * `Result<(), String>` - 成功返回 Ok，失败返回错误信息
    pub async fn send_command(&mut self, command: RPCCommand) -> Result<(), String> {
        let id = self.next_command_id().await;
        let cmd_name = command_name(&command);
        let envelope = RPCCommandEnvelope {
            id: id.clone(),
            command: &command,
        };

        let json = serde_json::to_string(&envelope)
            .map_err(|e| format!("Failed to serialize command: {}", e))?;

        log::info!(
            "[RPC-TRACE] send command id={} cmd={} payload={}",
            id,
            cmd_name,
            truncate_text(&json, 512)
        );

        // 发送命令（每行一个 JSON 对象）
        let line = format!("{}\n", json);
        self.stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;

        self.stdin
            .flush()
            .await
            .map_err(|e| format!("Failed to flush stdin: {}", e))?;

        // 更新状态
        let mut state = self.state.write().await;
        match command {
            RPCCommand::Prompt { .. } | RPCCommand::Steer { .. } | RPCCommand::FollowUp { .. } => {
                state.phase = RPCPhase::Thinking;
            }
            _ => {}
        }

        Ok(())
    }

    /// 发送 RPC 命令并等待响应
    pub async fn send_command_with_response(
        &mut self,
        command: RPCCommand,
        timeout_secs: u64,
    ) -> Result<RPCEvent, String> {
        let id = self.next_command_id().await;
        let cmd_name = command_name(&command);
        let (tx, rx) = oneshot::channel();

        {
            let mut pending = self.pending_responses.lock().await;
            pending.insert(
                id.clone(),
                PendingResponse {
                    command: cmd_name.to_string(),
                    sender: tx,
                },
            );
        }

        let envelope = RPCCommandEnvelope {
            id: id.clone(),
            command: &command,
        };

        let json = serde_json::to_string(&envelope)
            .map_err(|e| format!("Failed to serialize command: {}", e))?;

        if cmd_name == "get_messages" {
            log::debug!(
                "[RPC-TRACE] send command(wait) id={} cmd={} timeout={}s payload={}",
                id,
                cmd_name,
                timeout_secs,
                truncate_text(&json, 512)
            );
        } else {
            log::info!(
                "[RPC-TRACE] send command(wait) id={} cmd={} timeout={}s payload={}",
                id,
                cmd_name,
                timeout_secs,
                truncate_text(&json, 512)
            );
        }

        let line = format!("{}\n", json);
        self.stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;

        self.stdin
            .flush()
            .await
            .map_err(|e| format!("Failed to flush stdin: {}", e))?;

        match tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), rx).await {
            Ok(Ok(event)) => {
                if cmd_name == "get_messages" {
                    log::debug!(
                        "[RPC-TRACE] recv response id={} cmd={} success={:?} type={}",
                        id,
                        cmd_name,
                        event.success,
                        event.r#type
                    );
                } else {
                    log::info!(
                        "[RPC-TRACE] recv response id={} cmd={} success={:?} type={}",
                        id,
                        cmd_name,
                        event.success,
                        event.r#type
                    );
                }
                Ok(event)
            }
            Ok(Err(_)) => Err("Response channel closed".to_string()),
            Err(_) => {
                let mut pending = self.pending_responses.lock().await;
                pending.remove(&id);
                log::warn!(
                    "[RPC-TRACE] response timeout id={} cmd={} timeout={}s",
                    id,
                    cmd_name,
                    timeout_secs
                );
                Err(format!("Timeout waiting for response: {}", id))
            }
        }
    }

    /// 获取当前状态
    pub async fn get_state(&self) -> RPCState {
        self.state.read().await.clone()
    }

    /// 获取启动使用的 Pi 路径
    pub fn get_pi_path(&self) -> &str {
        &self.pi_path
    }

    /// 获取进程启动时的工作目录
    pub fn get_working_dir(&self) -> Option<&str> {
        self.working_dir.as_deref()
    }

    /// 获取当前会话文件路径
    pub async fn get_session_file(&self) -> Option<String> {
        self.state.read().await.session_file.clone()
    }

    /// 设置当前会话文件路径
    pub async fn set_session_file(&self, path: String) {
        self.state.write().await.session_file = Some(path);
    }

    /// 检查是否已连接
    pub async fn is_connected(&self) -> bool {
        self.state.read().await.is_connected
    }

    /// 关闭客户端
    pub async fn shutdown(&mut self) -> Result<(), String> {
        log::info!("Shutting down Pi RPC client");

        self.auto_restart_enabled.store(false, Ordering::SeqCst);
        let _ = self.exit_tx.send(false);

        // Send abort then kill immediately — don't wait for graceful exit
        let _ = self.send_command(RPCCommand::Abort).await;

        // Give process 500ms to exit gracefully, then force kill
        match tokio::time::timeout(tokio::time::Duration::from_millis(500), self.process.wait())
            .await
        {
            Ok(Ok(status)) => {
                log::info!("Pi process exited with status: {:?}", status);
            }
            Ok(Err(e)) => {
                log::error!("Failed to wait for pi process: {}", e);
            }
            Err(_) => {
                log::info!("Force killing Pi process after 500ms");
                let _ = self.process.kill().await;
            }
        }

        // 更新状态
        let mut state = self.state.write().await;
        state.is_connected = false;
        state.phase = RPCPhase::Disconnected;

        Ok(())
    }

    /// 订阅退出事件
    pub fn subscribe_exit(&self) -> tokio::sync::watch::Receiver<bool> {
        self.exit_tx.subscribe()
    }

    /// 获取缓存的消息
    pub async fn get_cached_messages(&self) -> Vec<RPCMessage> {
        self.message_cache.lock().await.clone()
    }

    /// 替换缓存的消息列表
    pub async fn set_cached_messages(&self, messages: Vec<RPCMessage>) {
        let mut cache = self.message_cache.lock().await;
        *cache = messages;
    }

    /// 更新缓存中的单条消息
    async fn upsert_cached_message(cache: &Arc<Mutex<Vec<RPCMessage>>>, message: RPCMessage) {
        let mut guard = cache.lock().await;
        if let Some(existing) = guard.iter_mut().find(|m| m.id == message.id) {
            *existing = message;
            return;
        }
        guard.push(message);
    }

    fn parse_messages_from_event(event: &RPCEvent) -> Option<Vec<RPCMessage>> {
        if let Some(messages) = event.messages.as_ref() {
            let normalized = messages
                .iter()
                .enumerate()
                .map(|(index, value)| normalize_message_for_cache(value, index))
                .collect();
            if let Ok(parsed) =
                serde_json::from_value::<Vec<RPCMessage>>(serde_json::Value::Array(normalized))
            {
                return Some(parsed);
            }
        }
        if let Some(data) = event.data.as_ref() {
            if let Some(messages) = data.get("messages").and_then(|v| v.as_array()) {
                let normalized = messages
                    .iter()
                    .enumerate()
                    .map(|(index, value)| normalize_message_for_cache(value, index))
                    .collect();
                if let Ok(parsed) =
                    serde_json::from_value::<Vec<RPCMessage>>(serde_json::Value::Array(normalized))
                {
                    return Some(parsed);
                }
            }
        }
        None
    }

    /// 读取 RPC 事件（后台任务）
    async fn read_events(
        mut reader: BufReader<ChildStdout>,
        event_tx: mpsc::Sender<RPCEvent>,
        state: Arc<RwLock<RPCState>>,
        pending_responses: Arc<Mutex<HashMap<String, PendingResponse>>>,
        message_cache: Arc<Mutex<Vec<RPCMessage>>>,
        exit_tx: tokio::sync::watch::Sender<bool>,
        auto_restart_enabled: Arc<AtomicBool>,
    ) {
        let mut line = String::new();

        loop {
            line.clear();

            match reader.read_line(&mut line).await {
                Ok(0) => {
                    // EOF，进程结束
                    log::warn!("Pi stdout closed (EOF)");
                    break;
                }
                Ok(_) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    let Some(payload) = normalize_event_payload(trimmed) else {
                        log::debug!(
                            "Ignoring non-JSON stdout payload: {}",
                            truncate_text(trimmed, 256)
                        );
                        continue;
                    };

                    log::debug!(
                        "Received RPC event payload: {}",
                        truncate_text(&payload, 1024)
                    );

                    match serde_json::from_str::<RPCEvent>(&payload) {
                        Ok(event) => {
                            if event.r#type == "response"
                                && matches!(
                                    event.command.as_deref(),
                                    Some("get_messages") | Some("get_state")
                                )
                            {
                                log::debug!(
                                    "[RPC-TRACE] event type={} id={:?} command={:?} success={:?}",
                                    event.r#type,
                                    event.id,
                                    event.command,
                                    event.success
                                );
                            } else {
                                log::info!(
                                    "[RPC-TRACE] event type={} id={:?} command={:?} success={:?}",
                                    event.r#type,
                                    event.id,
                                    event.command,
                                    event.success
                                );
                            }
                            // 更新内部状态
                            Self::update_state_from_event(&state, &event).await;

                            if event.r#type == "response" {
                                if event.command.as_deref() == Some("get_messages") {
                                    if let Some(messages) = Self::parse_messages_from_event(&event)
                                    {
                                        let mut cache = message_cache.lock().await;
                                        *cache = messages;
                                    }
                                }
                                let sender = {
                                    let mut pending = pending_responses.lock().await;
                                    let mut sender = None;

                                    if let Some(id) = event.id.as_ref() {
                                        if let Some(entry) = pending.remove(id) {
                                            sender = Some(entry.sender);
                                        }
                                    }

                                    if sender.is_none() {
                                        if let Some(command) = event.command.as_ref() {
                                            let key = pending
                                                .iter()
                                                .filter(|(_, entry)| entry.command == *command)
                                                .min_by_key(|(key, _)| {
                                                    parse_request_number(key).unwrap_or(u64::MAX)
                                                })
                                                .map(|(key, _)| key.clone());
                                            if let Some(key) = key {
                                                if let Some(entry) = pending.remove(&key) {
                                                    sender = Some(entry.sender);
                                                }
                                            }
                                        }
                                    }

                                    sender
                                };

                                if let Some(tx) = sender {
                                    let _ = tx.send(event.clone());
                                }
                            } else if event.r#type == "message_update" {
                                if let Some(message) = event.message.as_ref() {
                                    let normalized = normalize_message_for_cache(message, 0);
                                    if let Ok(parsed) =
                                        serde_json::from_value::<RPCMessage>(normalized)
                                    {
                                        Self::upsert_cached_message(&message_cache, parsed).await;
                                    }
                                }
                            }

                            // 发送事件到外部
                            if let Err(e) = event_tx.send(event).await {
                                log::error!("Failed to send event: {}", e);
                                break;
                            }
                        }
                        Err(e) => {
                            log::error!(
                                "Failed to parse RPC event: {} | Raw: {}",
                                e,
                                truncate_text(trimmed, 1024)
                            );
                        }
                    }
                }
                Err(e) => {
                    log::error!("Failed to read from stdout: {}", e);
                    break;
                }
            }
        }

        // 更新状态为断开
        let mut state = state.write().await;
        state.is_connected = false;
        state.phase = RPCPhase::Disconnected;

        if auto_restart_enabled.load(Ordering::SeqCst) {
            let _ = exit_tx.send(true);
        } else {
            let _ = exit_tx.send(false);
        }
        log::info!("RPC event reader stopped");
    }

    /// 读取 stderr（后台任务，用于日志记录）
    async fn read_stderr(mut reader: BufReader<tokio::process::ChildStderr>) {
        let mut line = String::new();

        loop {
            line.clear();

            match reader.read_line(&mut line).await {
                Ok(0) => break,
                Ok(_) => {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        log::debug!("Pi stderr: {}", trimmed);
                    }
                }
                Err(_) => break,
            }
        }
    }

    /// 根据事件更新状态
    async fn update_state_from_event(state: &Arc<RwLock<RPCState>>, event: &RPCEvent) {
        let mut state = state.write().await;

        match event.r#type.as_str() {
            "response" => {
                if let Some(command) = event.command.as_deref() {
                    if command == "get_state" {
                        if let Some(data) = event.data.clone() {
                            if let Ok(session_state) =
                                serde_json::from_value::<RPCSessionState>(data)
                            {
                                if let Some(session_file) = session_state.session_file {
                                    state.session_file = Some(session_file);
                                }
                            }
                        }
                    }
                }
            }
            "agent_start" => {
                state.phase = RPCPhase::Thinking;
            }
            "agent_end" => {
                state.phase = RPCPhase::Idle;
            }
            "tool_execution_start" => {
                state.phase = RPCPhase::Executing;
            }
            "tool_execution_end" => {
                state.phase = RPCPhase::Idle;
            }
            "message_update" => {
                if let Some(ref ame) = event.assistant_message_event {
                    match ame.r#type.as_str() {
                        "done" => {
                            state.phase = RPCPhase::Idle;
                        }
                        "toolcall_start" => {
                            state.phase = RPCPhase::Executing;
                        }
                        _ => {}
                    }
                }
            }
            "error" => {
                state.phase = RPCPhase::Error;
                state.last_error = event.error.clone();
            }
            _ => {}
        }
    }
}

impl Drop for PiRPCClient {
    fn drop(&mut self) {
        // 尝试优雅关闭
        // 注意：这里不能使用 async，所以只能尽力而为
        log::info!("PiRPCClient dropping");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn test_rpc_state_default() {
        let state = RPCState::default();
        assert_eq!(state.phase, RPCPhase::Disconnected);
        assert!(!state.is_connected);
        assert!(state.session_file.is_none());
        assert!(state.last_error.is_none());
    }

    #[test]
    fn normalize_cache_message_maps_tool_result_role() {
        let value = json!({
            "role": "toolResult",
            "toolCallId": "tool-9",
            "toolName": "write"
        });
        let normalized = normalize_message_for_cache(&value, 0);
        assert_eq!(
            normalized.get("role").and_then(|v| v.as_str()),
            Some("tool")
        );
        assert_eq!(
            normalized.get("id").and_then(|v| v.as_str()),
            Some("tool-9")
        );
    }

    #[test]
    fn parse_request_number_extracts_sequence() {
        assert_eq!(parse_request_number("req-42"), Some(42));
        assert_eq!(parse_request_number("request-42"), None);
        assert_eq!(parse_request_number("req-abc"), None);
    }

    #[test]
    fn normalize_event_payload_strips_osc_prefix() {
        let raw =
            "\u{1b}]777;notify;Pi;Ready for input\u{7}{\"type\":\"turn_end\",\"command\":\"x\"}";
        let payload = normalize_event_payload(raw).expect("payload should be present");
        assert_eq!(payload, "{\"type\":\"turn_end\",\"command\":\"x\"}");
    }

    #[test]
    fn normalize_event_payload_extracts_json_after_plain_text() {
        let raw = "notice before json {\"type\":\"response\",\"command\":\"get_state\"}";
        let payload = normalize_event_payload(raw).expect("payload should be present");
        assert_eq!(payload, "{\"type\":\"response\",\"command\":\"get_state\"}");
    }

    #[test]
    fn truncate_text_handles_utf8_boundary() {
        let raw = "ab内cd";
        let truncated = truncate_text(raw, 4);
        assert_eq!(truncated, "ab...(len=7)");
    }
}
