//! Pi CLI RPC 协议类型定义
//!
//! 基于 stdin/stdout 的 JSON RPC 协议，与 Pi Island 兼容

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// RPC 命令类型
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RPCCommand {
    /// 发送用户消息
    Prompt {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        images: Option<Vec<ImageData>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "streamingBehavior")]
        streaming_behavior: Option<StreamingBehavior>,
    },
    /// 干预当前执行
    Steer { message: String },
    /// 后续消息（队列）
    FollowUp { message: String },
    /// 中止当前操作
    Abort,
    /// 获取当前状态
    GetState,
    /// 获取消息列表
    GetMessages,
    /// 获取可用模型
    GetAvailableModels,
    /// 设置模型
    SetModel {
        provider: String,
        #[serde(rename = "modelId")]
        model_id: String,
    },
    /// 切换下一个模型
    CycleModel,
    /// 设置思考级别
    SetThinkingLevel { level: ThinkingLevel },
    /// 切换思考级别
    CycleThinkingLevel,
    /// 压缩上下文
    Compact {
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "customInstructions")]
        custom_instructions: Option<String>,
    },
    /// 设置自动压缩
    SetAutoCompaction { enabled: bool },
    /// 创建新会话
    NewSession {
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "parentSession")]
        parent_session: Option<String>,
    },
    /// 切换会话
    SwitchSession {
        #[serde(rename = "sessionPath")]
        session_path: String,
    },
    /// 执行 Bash 命令
    Bash { command: String },
    /// 中止 Bash 执行
    AbortBash,
    /// 获取会话统计
    GetSessionStats,
    /// 获取可用命令
    GetCommands,
}

/// 流式行为
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StreamingBehavior {
    /// 干预模式
    Steer,
    /// 后续模式
    FollowUp,
}

/// 思考级别
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThinkingLevel {
    Off,
    Minimal,
    Low,
    Medium,
    High,
    Xhigh,
}

/// 图片数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageData {
    #[serde(rename = "type")]
    pub data_type: String,
    pub source: ImageSource,
}

/// 图片来源
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageSource {
    #[serde(rename = "type")]
    pub source_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "mediaType")]
    pub media_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

/// RPC 事件类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RPCEvent {
    /// 请求 ID（仅用于响应）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// 事件类型
    pub r#type: String,
    /// 对应的命令名
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    /// 是否成功
    #[serde(skip_serializing_if = "Option::is_none")]
    pub success: Option<bool>,
    /// 错误信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// 响应数据
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    /// 消息对象
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<serde_json::Value>,
    /// 消息列表
    #[serde(skip_serializing_if = "Option::is_none")]
    pub messages: Option<Vec<serde_json::Value>>,
    /// 流式消息事件
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "assistantMessageEvent")]
    pub assistant_message_event: Option<AssistantMessageEvent>,
    /// 工具调用 ID
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "toolCallId")]
    pub tool_call_id: Option<String>,
    /// 工具名称
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "toolName")]
    pub tool_name: Option<String>,
    /// 工具参数
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "toolArgs")]
    pub args: Option<HashMap<String, serde_json::Value>>,
    /// 工具结果
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "toolResult")]
    pub result: Option<serde_json::Value>,
    /// 部分结果
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "partialResult")]
    pub partial_result: Option<serde_json::Value>,
    /// 是否错误
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "isError")]
    pub is_error: Option<bool>,
    /// 原因/说明
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// 重试次数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attempt: Option<i32>,
    /// 最大重试次数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_attempts: Option<i32>,
    /// 延迟毫秒
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delay_ms: Option<i32>,
    /// 错误消息
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "errorMessage")]
    pub error_message: Option<String>,
    /// 最终错误
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "finalError")]
    pub final_error: Option<String>,
    /// 是否已中止
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aborted: Option<bool>,
    /// 是否会重试
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "willRetry")]
    pub will_retry: Option<bool>,
    /// 扩展路径
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "extensionPath")]
    pub extension_path: Option<String>,
    /// 子事件类型
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<String>,
    /// UI 请求方法
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    /// 通知类型
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "notifyType")]
    pub notify_type: Option<String>,
}

/// 流式消息事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssistantMessageEvent {
    /// 事件子类型
    pub r#type: String,
    /// 内容索引
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "contentIndex")]
    pub content_index: Option<i32>,
    /// 增量文本
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta: Option<String>,
    /// 完整内容
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// 思考内容
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking: Option<String>,
    /// 原因/说明
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// 工具调用数据
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "toolCall")]
    pub tool_call: Option<ToolCallData>,
    /// 部分数据
    #[serde(skip_serializing_if = "Option::is_none")]
    pub partial: Option<serde_json::Value>,
}

/// 工具调用数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallData {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<HashMap<String, serde_json::Value>>,
}

/// RPC 会话状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RPCSessionState {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<RPCModel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "thinkingLevel")]
    pub thinking_level: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "isStreaming")]
    pub is_streaming: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "isCompacting")]
    pub is_compacting: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "steeringMode")]
    pub steering_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "followUpMode")]
    pub follow_up_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "sessionFile")]
    pub session_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "sessionId")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "autoCompactionEnabled")]
    pub auto_compaction_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "messageCount")]
    pub message_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "pendingMessageCount")]
    pub pending_message_count: Option<i32>,
}

/// RPC 模型信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RPCModel {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api: Option<String>,
    pub provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "baseUrl")]
    pub base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "contextWindow")]
    pub context_window: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "maxTokens")]
    pub max_tokens: Option<i32>,
}

/// RPC 消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RPCMessage {
    pub id: String,
    pub role: RPCMessageRole,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "toolCallId")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "toolName")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "toolArgs")]
    pub tool_args: Option<HashMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "toolResult")]
    pub tool_result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "toolStatus")]
    pub tool_status: Option<RPCToolStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<serde_json::Value>,
}

/// 消息角色
#[derive(Debug, Clone, Serialize)]
pub enum RPCMessageRole {
    #[serde(rename = "user")]
    User,
    #[serde(rename = "assistant")]
    Assistant,
    #[serde(rename = "tool")]
    #[serde(alias = "toolResult")]
    #[serde(alias = "tool_result")]
    Tool,
}

impl<'de> Deserialize<'de> for RPCMessageRole {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        match value.as_str() {
            "user" => Ok(RPCMessageRole::User),
            "assistant" => Ok(RPCMessageRole::Assistant),
            "tool" | "toolResult" | "tool_result" => Ok(RPCMessageRole::Tool),
            _ => Ok(RPCMessageRole::Assistant),
        }
    }
}

/// 工具状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RPCToolStatus {
    Running,
    Success,
    Error,
}

/// RPC 阶段
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RPCPhase {
    Disconnected,
    Starting,
    Idle,
    Thinking,
    Executing,
    Error,
}

/// RPC 统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RPCSessionStats {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "sessionFile")]
    pub session_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "sessionId")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "userMessages")]
    pub user_messages: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "assistantMessages")]
    pub assistant_messages: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "toolCalls")]
    pub tool_calls: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "toolResults")]
    pub tool_results: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "totalMessages")]
    pub total_messages: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens: Option<RPCTokens>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<f64>,
}

/// Token 统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RPCTokens {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "cacheRead")]
    pub cache_read: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(alias = "cacheWrite")]
    pub cache_write: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<i32>,
}

/// 斜杠命令信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlashCommandInfo {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<String>,
}

/// 工具执行信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RPCToolExecution {
    pub id: String,
    pub name: String,
    pub args: HashMap<String, serde_json::Value>,
    pub status: RPCToolStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub partial_output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
}

impl Default for ThinkingLevel {
    fn default() -> Self {
        ThinkingLevel::Medium
    }
}

impl Default for RPCPhase {
    fn default() -> Self {
        RPCPhase::Disconnected
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn switch_session_serializes_camel_case_key() {
        let cmd = RPCCommand::SwitchSession {
            session_path: "/tmp/session.jsonl".to_string(),
        };
        let value = serde_json::to_value(cmd).expect("serialize switch_session");
        assert_eq!(
            value.get("type").and_then(|v| v.as_str()),
            Some("switch_session")
        );
        assert_eq!(
            value.get("sessionPath").and_then(|v| v.as_str()),
            Some("/tmp/session.jsonl")
        );
        assert!(value.get("session_path").is_none());
    }

    #[test]
    fn set_model_serializes_model_id_camel_case() {
        let cmd = RPCCommand::SetModel {
            provider: "openai".to_string(),
            model_id: "gpt-5".to_string(),
        };
        let value = serde_json::to_value(cmd).expect("serialize set_model");
        assert_eq!(
            value.get("type").and_then(|v| v.as_str()),
            Some("set_model")
        );
        assert_eq!(
            value.get("provider").and_then(|v| v.as_str()),
            Some("openai")
        );
        assert_eq!(value.get("modelId").and_then(|v| v.as_str()), Some("gpt-5"));
        assert!(value.get("model_id").is_none());
    }

    #[test]
    fn message_role_accepts_tool_result_alias() {
        let role: RPCMessageRole =
            serde_json::from_str("\"toolResult\"").expect("deserialize toolResult role");
        match role {
            RPCMessageRole::Tool => {}
            _ => panic!("toolResult should map to Tool"),
        }
    }

    #[test]
    fn prompt_serializes_streaming_behavior_camel_case() {
        let cmd = RPCCommand::Prompt {
            message: "hi".to_string(),
            images: None,
            streaming_behavior: Some(StreamingBehavior::FollowUp),
        };
        let value = serde_json::to_value(cmd).expect("serialize prompt");
        assert_eq!(value.get("type").and_then(|v| v.as_str()), Some("prompt"));
        assert_eq!(
            value.get("streamingBehavior").and_then(|v| v.as_str()),
            Some("followUp")
        );
        assert!(value.get("streaming_behavior").is_none());
    }

    #[test]
    fn new_session_serializes_parent_session_camel_case() {
        let cmd = RPCCommand::NewSession {
            parent_session: Some("parent-1".to_string()),
        };
        let value = serde_json::to_value(cmd).expect("serialize new_session");
        assert_eq!(
            value.get("type").and_then(|v| v.as_str()),
            Some("new_session")
        );
        assert_eq!(
            value.get("parentSession").and_then(|v| v.as_str()),
            Some("parent-1")
        );
        assert!(value.get("parent_session").is_none());
    }

    #[test]
    fn compact_serializes_custom_instructions_camel_case() {
        let cmd = RPCCommand::Compact {
            custom_instructions: Some("keep short".to_string()),
        };
        let value = serde_json::to_value(cmd).expect("serialize compact");
        assert_eq!(value.get("type").and_then(|v| v.as_str()), Some("compact"));
        assert_eq!(
            value.get("customInstructions").and_then(|v| v.as_str()),
            Some("keep short")
        );
        assert!(value.get("custom_instructions").is_none());
    }
}
