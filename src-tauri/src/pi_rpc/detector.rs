//! RPC 能力检测模块
//!
//! 自动检测 Pi CLI 是否支持 RPC 模式

use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration, Instant};

/// RPC 检测结果
#[derive(Debug, Clone)]
pub struct RPCDetectionResult {
    /// 是否支持 RPC
    pub supported: bool,
    /// Pi CLI 版本（如果检测成功）
    pub version: Option<String>,
    /// 错误信息（如果检测失败）
    pub error: Option<String>,
}

/// 检测 Pi CLI 是否支持 RPC 模式
///
/// 通过尝试启动 `pi --mode rpc` 并等待初始响应来检测
///
/// # Arguments
/// * `pi_path` - Pi CLI 可执行文件路径
///
/// # Returns
/// * `RPCDetectionResult` - 检测结果
pub async fn detect_rpc_support(pi_path: &str) -> RPCDetectionResult {
    log::info!("Detecting RPC support for: {}", pi_path);

    // 首先检查帮助信息
    match check_help(pi_path).await {
        Ok(version) => {
            log::info!("Pi CLI version detected: {}", version);
        }
        Err(e) => {
            log::warn!("Failed to get pi help: {}", e);
        }
    }

    // 尝试启动 RPC 模式
    let detection_timeout = Duration::from_secs(5);

    let result = timeout(detection_timeout, try_start_rpc(pi_path)).await;

    match result {
        Ok(Ok(())) => {
            log::info!("RPC support detected successfully");
            RPCDetectionResult {
                supported: true,
                version: None,
                error: None,
            }
        }
        Ok(Err(e)) => {
            log::warn!("RPC not supported: {}", e);
            RPCDetectionResult {
                supported: false,
                version: None,
                error: Some(e),
            }
        }
        Err(_) => {
            log::warn!("RPC detection timeout");
            RPCDetectionResult {
                supported: false,
                version: None,
                error: Some("Detection timeout".to_string()),
            }
        }
    }
}

/// 检查帮助信息
async fn check_help(pi_path: &str) -> Result<String, String> {
    let output = Command::new(pi_path)
        .arg("--help")
        .output()
        .await
        .map_err(|e| format!("Failed to run pi --help: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "pi --help failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let help_text = String::from_utf8_lossy(&output.stdout);

    // 检查是否包含 --mode 选项
    if !help_text.contains("--mode") {
        return Err("Pi CLI does not support --mode option".to_string());
    }

    // 尝试提取版本信息
    let version = help_text
        .lines()
        .find(|line| line.to_lowercase().contains("version"))
        .map(|line| line.trim().to_string());

    Ok(version.unwrap_or_else(|| "unknown".to_string()))
}

/// 尝试启动 RPC 模式
async fn try_start_rpc(pi_path: &str) -> Result<(), String> {
    // 启动 Pi CLI RPC 模式
    let mut process = Command::new(pi_path)
        .arg("--mode")
        .arg("rpc")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start pi: {}", e))?;

    let mut stdin = process.stdin.take().ok_or("Failed to get stdin")?;

    let stdout = process.stdout.take().ok_or("Failed to get stdout")?;

    // 发送 get_state 命令作为测试
    let test_command = r#"{"type": "get_state"}"#;
    stdin
        .write_all(format!("{}\n", test_command).as_bytes())
        .await
        .map_err(|e| format!("Failed to write to stdin: {}", e))?;

    stdin
        .flush()
        .await
        .map_err(|e| format!("Failed to flush stdin: {}", e))?;

    // 读取响应（忽略空行/控制序列）
    let mut reader = BufReader::new(stdout);
    let deadline = Instant::now() + Duration::from_secs(3);
    let mut last_non_json: Option<String> = None;

    let result = loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            break Err("Timeout waiting for RPC response".to_string());
        }

        let mut line = String::new();
        let read_result = timeout(remaining, reader.read_line(&mut line)).await;

        match read_result {
            Ok(Ok(0)) => {
                if let Some(last) = last_non_json {
                    break Err(format!("Pi process closed connection (EOF): {}", last));
                }
                break Err("Pi process closed connection (EOF)".to_string());
            }
            Ok(Ok(_)) => {
                let Some(payload) = normalize_event_payload(&line) else {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        last_non_json = Some(truncate_text(trimmed, 120));
                    }
                    continue;
                };

                log::debug!("RPC test response: {}", payload);
                match serde_json::from_str::<serde_json::Value>(&payload)
                    .or_else(|_| parse_json_candidate(&payload))
                {
                    Ok(json) => {
                        if json.get("type").is_some() {
                            break Ok(());
                        }
                        last_non_json = Some(truncate_text(&payload, 120));
                        continue;
                    }
                    Err(e) => {
                        last_non_json = Some(format!("Invalid JSON response: {}", e));
                        continue;
                    }
                }
            }
            Ok(Err(e)) => break Err(format!("Failed to read from stdout: {}", e)),
            Err(_) => break Err("Timeout waiting for RPC response".to_string()),
        }
    };

    // 清理进程
    let _ = process.kill().await;

    result
}

fn strip_terminal_control_sequences(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut i = 0;

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

fn parse_json_candidate(payload: &str) -> Result<serde_json::Value, serde_json::Error> {
    let trimmed = payload.trim();
    if trimmed.starts_with('{') {
        if let Some(end) = trimmed.rfind('}') {
            return serde_json::from_str(&trimmed[..=end]);
        }
    }
    if trimmed.starts_with('[') {
        if let Some(end) = trimmed.rfind(']') {
            return serde_json::from_str(&trimmed[..=end]);
        }
    }
    serde_json::from_str(trimmed)
}

fn truncate_text(input: &str, max_len: usize) -> String {
    let mut count = 0usize;
    for (idx, _) in input.char_indices() {
        if count >= max_len {
            return format!("{}...(len={})", &input[..idx], input.len());
        }
        count += 1;
    }
    input.to_string()
}

/// 查找 Pi CLI 路径
///
/// 尝试在常见位置查找 pi 可执行文件
///
/// # Returns
/// * `Option<String>` - 找到的路径或 None
pub async fn find_pi_path() -> Option<String> {
    // 常见路径列表
    let common_paths = [
        "pi",
        "/usr/local/bin/pi",
        "/usr/bin/pi",
        "/opt/homebrew/bin/pi",
        "$HOME/.local/bin/pi",
        "$HOME/.npm-global/bin/pi",
        "$HOME/.nvm/versions/node/*/bin/pi",
    ];

    // 首先尝试直接使用 'pi'（在 PATH 中）
    if let Ok(output) = Command::new("which").arg("pi").output().await {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                log::info!("Found pi at: {}", path);
                return Some(path);
            }
        }
    }

    // 尝试常见路径
    for path in &common_paths {
        // 展开环境变量
        let expanded = if path.starts_with("$") {
            expand_env_vars(path)
        } else {
            path.to_string()
        };

        // 处理通配符
        if expanded.contains('*') {
            // 简单的通配符匹配
            if let Some(matched) = glob_match(&expanded).await {
                return Some(matched);
            }
        } else if tokio::fs::metadata(&expanded).await.is_ok() {
            log::info!("Found pi at: {}", expanded);
            return Some(expanded);
        }
    }

    log::warn!("Pi CLI not found in common locations");
    None
}

/// 展开环境变量
fn expand_env_vars(path: &str) -> String {
    let mut result = path.to_string();

    if result.contains("$HOME") {
        if let Ok(home) = std::env::var("HOME") {
            result = result.replace("$HOME", &home);
        }
    }

    result
}

/// 简单的通配符匹配
async fn glob_match(pattern: &str) -> Option<String> {
    // 提取目录部分和文件名模式
    let parts: Vec<&str> = pattern.split('*').collect();
    if parts.len() != 2 {
        return None;
    }

    let prefix = parts[0];
    let suffix = parts[1];

    // 获取父目录
    let parent = std::path::Path::new(prefix).parent()?;
    let file_name = std::path::Path::new(prefix).file_name()?.to_str()?;

    // 读取目录
    let mut entries = match tokio::fs::read_dir(parent).await {
        Ok(entries) => entries,
        Err(_) => return None,
    };

    while let Ok(Some(entry)) = entries.next_entry().await {
        let name = entry.file_name();
        let name_str = name.to_str()?;

        if name_str.starts_with(file_name) && name_str.ends_with(suffix) {
            if let Ok(path) = entry.path().canonicalize() {
                return Some(path.to_string_lossy().to_string());
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_expand_env_vars() {
        std::env::set_var("TEST_HOME", "/home/test");
        let result = expand_env_vars("$HOME/.local/bin/pi");
        // 结果取决于实际环境
        assert!(!result.contains("$HOME"));
    }

    #[tokio::test]
    async fn test_rpc_detection_result() {
        let result = RPCDetectionResult {
            supported: true,
            version: Some("1.0.0".to_string()),
            error: None,
        };

        assert!(result.supported);
        assert_eq!(result.version, Some("1.0.0".to_string()));
        assert!(result.error.is_none());
    }
}
