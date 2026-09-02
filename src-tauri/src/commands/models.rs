use std::process::{Command, Stdio};
use std::time::Instant;
#[cfg(feature = "gui")]
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command as TokioCommand;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ModelInfo {
    pub provider: String,
    pub model: String,
    pub available: bool,
    pub tested: bool,
    pub last_test_time: Option<String>,
    pub response_time: Option<f64>,
    pub status: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ModelTestResult {
    pub provider: String,
    pub model: String,
    pub time: f64,
    pub output: String,
    pub status: String,
    pub error_msg: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModelTextResponse {
    pub text: String,
    pub provider: String,
    pub model: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModelTextStreamEvent {
    pub r#type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<ModelTextResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub async fn invoke_model_text(system_prompt: String, prompt: String, provider: Option<String>, model: Option<String>, reasoning: Option<String>) -> Result<ModelTextResponse, String> {
    let mut response = run_pi_model_text(system_prompt, prompt, provider, model, reasoning, false, |_| {}).await?;
    response.text = response.text.trim().to_string();
    Ok(response)
}

#[cfg(feature = "gui")]
pub async fn invoke_model_text_stream(app_state: crate::app_state::SharedAppState, request_id: String, system_prompt: String, prompt: String, provider: Option<String>, model: Option<String>, reasoning: Option<String>) -> Result<ModelTextResponse, String> {
    let event_name = format!("psm-ai-stream:{request_id}");
    let delta_app = app_state.app_handle.clone();
    let delta_event_name = event_name.clone();
    let result = run_pi_model_text(system_prompt, prompt, provider, model, reasoning, true, move |delta| {
        let _ = delta_app.emit(&delta_event_name, ModelTextStreamEvent { r#type: "delta".to_string(), delta: Some(delta.to_string()), response: None, error: None });
    })
    .await;

    match result {
        Ok(mut response) => {
            response.text = response.text.trim().to_string();
            app_state.app_handle.emit(&event_name, ModelTextStreamEvent { r#type: "done".to_string(), delta: None, response: Some(response.clone()), error: None }).map_err(|error| format!("Failed to emit model stream completion: {error}"))?;
            Ok(response)
        }
        Err(error) => {
            let _ = app_state.app_handle.emit(&event_name, ModelTextStreamEvent { r#type: "error".to_string(), delta: None, response: None, error: Some(error.clone()) });
            Err(error)
        }
    }
}

#[cfg(feature = "gui")]
pub async fn invoke_model_agent_stream(app_state: crate::app_state::SharedAppState, request_id: String, mut request: serde_json::Value) -> Result<serde_json::Value, String> {
    let event_name = format!("psm-ai-stream:{request_id}");
    request["stream"] = serde_json::Value::Bool(true);
    request["protocol"] = serde_json::Value::String("pi-agent".to_string());

    let delta_app = app_state.app_handle.clone();
    let delta_event_name = event_name.clone();
    let result = run_pi_model_agent_stream(request, move |event| {
        let _ = delta_app.emit(&delta_event_name, event.clone());
    })
    .await;

    match result {
        Ok(response) => Ok(response),
        Err(error) => {
            let _ = app_state.app_handle.emit(&event_name, ModelTextStreamEvent { r#type: "error".to_string(), delta: None, response: None, error: Some(error.clone()) });
            Err(error)
        }
    }
}

async fn run_pi_model_text<F>(system_prompt: String, prompt: String, provider: Option<String>, model: Option<String>, reasoning: Option<String>, stream: bool, mut on_delta: F) -> Result<ModelTextResponse, String>
where
    F: FnMut(&str) + Send,
{
    let script = pi_model_text_script_path()?;
    let mut child = TokioCommand::new("node").arg(script).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|error| format!("Failed to start Pi AI SDK helper: {error}"))?;

    let request = serde_json::json!({
        "systemPrompt": system_prompt,
        "prompt": prompt,
        "provider": provider,
        "model": model,
        "reasoning": reasoning,
        "stream": stream,
    });

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(request.to_string().as_bytes()).await.map_err(|error| format!("Failed to write Pi AI request: {error}"))?;
    }

    let stdout = child.stdout.take().ok_or_else(|| "Pi AI helper did not expose stdout".to_string())?;
    let mut lines = BufReader::new(stdout).lines();
    let mut final_response: Option<ModelTextResponse> = None;
    let mut helper_error: Option<String> = None;

    while let Some(line) = lines.next_line().await.map_err(|error| format!("Failed to read Pi AI helper output: {error}"))? {
        if line.trim().is_empty() {
            continue;
        }
        let event: ModelTextStreamEvent = serde_json::from_str(&line).map_err(|error| format!("Invalid Pi AI helper event: {error}. Raw: {line}"))?;
        match event.r#type.as_str() {
            "delta" => {
                if let Some(delta) = event.delta.as_deref() {
                    on_delta(delta);
                }
            }
            "done" => {
                final_response = event.response;
            }
            "error" => {
                helper_error = event.error;
            }
            _ => {}
        }
    }

    let output = child.wait_with_output().await.map_err(|error| format!("Failed to wait for Pi AI helper: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(helper_error.or(if stderr.is_empty() { None } else { Some(stderr) }).unwrap_or_else(|| format!("Pi AI helper exited with {}", output.status)));
    }

    final_response.ok_or_else(|| helper_error.unwrap_or_else(|| "Pi AI helper did not return a final response".to_string()))
}

#[cfg(feature = "gui")]
async fn run_pi_model_agent_stream<F>(request: serde_json::Value, on_event: F) -> Result<serde_json::Value, String>
where
    F: FnMut(&serde_json::Value) + Send,
{
    if let Ok(script) = pi_model_text_script_path() {
        return run_pi_model_agent_helper(script, request, on_event).await;
    }

    run_pi_cli_agent_stream(request, on_event).await
}

#[cfg(feature = "gui")]
async fn run_pi_model_agent_helper<F>(script: std::path::PathBuf, request: serde_json::Value, mut on_event: F) -> Result<serde_json::Value, String>
where
    F: FnMut(&serde_json::Value) + Send,
{
    let mut child = TokioCommand::new("node").arg(script).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|error| format!("Failed to start Pi AI SDK helper: {error}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(request.to_string().as_bytes()).await.map_err(|error| format!("Failed to write Pi AI request: {error}"))?;
    }

    let stdout = child.stdout.take().ok_or_else(|| "Pi AI helper did not expose stdout".to_string())?;
    let mut lines = BufReader::new(stdout).lines();
    let mut final_response: Option<serde_json::Value> = None;
    let mut helper_error: Option<String> = None;

    while let Some(line) = lines.next_line().await.map_err(|error| format!("Failed to read Pi AI helper output: {error}"))? {
        if line.trim().is_empty() {
            continue;
        }
        let event: serde_json::Value = serde_json::from_str(&line).map_err(|error| format!("Invalid Pi AI helper event: {error}. Raw: {line}"))?;
        match event.get("type").and_then(|value| value.as_str()) {
            Some("done") => {
                final_response = event.get("message").cloned().or_else(|| event.get("response").cloned());
            }
            Some("error") => {
                final_response = event.get("error").cloned();
                helper_error = event.get("error").and_then(|value| value.as_str().map(str::to_string).or_else(|| value.get("errorMessage").and_then(|message| message.as_str()).map(str::to_string)));
            }
            _ => {}
        }
        on_event(&event);
    }

    let output = child.wait_with_output().await.map_err(|error| format!("Failed to wait for Pi AI helper: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(helper_error.or(if stderr.is_empty() { None } else { Some(stderr) }).unwrap_or_else(|| format!("Pi AI helper exited with {}", output.status)));
    }

    Ok(final_response.unwrap_or(serde_json::Value::Null))
}

#[cfg(feature = "gui")]
fn pi_cli_request_string(request: &serde_json::Value, key: &str) -> Option<String> {
    request.get(key).and_then(serde_json::Value::as_str).map(str::trim).filter(|value| !value.is_empty()).map(str::to_string)
}

#[cfg(feature = "gui")]
fn pi_cli_text_delta(event: &serde_json::Value) -> Option<&str> {
    if event.get("type").and_then(serde_json::Value::as_str) != Some("message_update") {
        return None;
    }
    let update = event.get("assistantMessageEvent")?;
    if update.get("type").and_then(serde_json::Value::as_str) != Some("text_delta") {
        return None;
    }
    update.get("delta").and_then(serde_json::Value::as_str)
}

#[cfg(feature = "gui")]
fn pi_cli_assistant_error(event: &serde_json::Value) -> Option<&str> {
    if event.get("type").and_then(serde_json::Value::as_str) != Some("message_end") {
        return None;
    }
    let message = event.get("message")?;
    if message.get("role").and_then(serde_json::Value::as_str) != Some("assistant") || message.get("stopReason").and_then(serde_json::Value::as_str) != Some("error") {
        return None;
    }
    message.get("errorMessage").and_then(serde_json::Value::as_str)
}

#[cfg(feature = "gui")]
async fn run_pi_cli_agent_stream<F>(request: serde_json::Value, mut on_event: F) -> Result<serde_json::Value, String>
where
    F: FnMut(&serde_json::Value) + Send,
{
    if request.get("tools").and_then(serde_json::Value::as_array).is_some_and(|tools| !tools.is_empty()) {
        return Err("Installed Pi CLI fallback does not support PSM agent tools".to_string());
    }

    let system_prompt = pi_cli_request_string(&request, "systemPrompt").unwrap_or_default();
    let prompt = pi_cli_request_string(&request, "prompt").unwrap_or_default();
    let provider = pi_cli_request_string(&request, "provider");
    let model = pi_cli_request_string(&request, "model");
    let reasoning = pi_cli_request_string(&request, "reasoning");

    let mut args = vec!["--mode".to_string(), "json".to_string(), "--print".to_string(), "--no-session".to_string(), "--no-tools".to_string(), "--no-skills".to_string(), "--no-extensions".to_string(), "--system-prompt".to_string(), system_prompt];
    if let Some(value) = provider.as_deref() {
        args.extend(["--provider".to_string(), value.to_string()]);
    }
    if let Some(value) = model.as_deref() {
        args.extend(["--model".to_string(), value.to_string()]);
    }
    if let Some(value) = reasoning.as_deref() {
        args.extend(["--thinking".to_string(), value.to_string()]);
    }
    args.extend(["--".to_string(), prompt]);

    let mut child = None;
    let mut spawn_errors = Vec::new();
    for command in ["pi", "omp"] {
        match TokioCommand::new(command).args(&args).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn() {
            Ok(process) => {
                child = Some(process);
                break;
            }
            Err(error) => spawn_errors.push(format!("{command}: {error}")),
        }
    }
    let mut child = child.ok_or_else(|| format!("Failed to start installed Pi CLI: {}", spawn_errors.join("; ")))?;

    let stdout = child.stdout.take().ok_or_else(|| "Installed Pi CLI did not expose stdout".to_string())?;
    let mut lines = BufReader::new(stdout).lines();
    let mut text = String::new();
    let mut agent_error: Option<String> = None;

    while let Some(line) = lines.next_line().await.map_err(|error| format!("Failed to read installed Pi CLI output: {error}"))? {
        if line.trim().is_empty() {
            continue;
        }
        let event: serde_json::Value = serde_json::from_str(&line).map_err(|error| format!("Invalid installed Pi CLI event: {error}. Raw: {line}"))?;
        if let Some(delta) = pi_cli_text_delta(&event) {
            text.push_str(delta);
            on_event(&serde_json::json!({ "type": "delta", "delta": delta }));
        }
        if let Some(error) = pi_cli_assistant_error(&event) {
            agent_error = Some(error.to_string());
        }
    }

    let output = child.wait_with_output().await.map_err(|error| format!("Failed to wait for installed Pi CLI: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() { format!("Installed Pi CLI exited with {}", output.status) } else { stderr });
    }
    if let Some(error) = agent_error {
        return Err(error);
    }

    let response = serde_json::json!({
        "text": text,
        "provider": provider.unwrap_or_default(),
        "model": model.unwrap_or_default(),
    });
    on_event(&serde_json::json!({ "type": "done", "response": response.clone() }));
    Ok(response)
}

fn pi_model_text_script_path() -> Result<std::path::PathBuf, String> {
    let cwd = std::env::current_dir().map_err(|error| format!("Failed to resolve current directory: {error}"))?;
    let direct = cwd.join("scripts/pi-model-text.mjs");
    if direct.exists() {
        return Ok(direct);
    }

    let parent = cwd.parent().map(|path| path.join("scripts/pi-model-text.mjs"));
    if let Some(path) = parent {
        if path.exists() {
            return Ok(path);
        }
    }

    Err("Pi AI SDK helper not found at scripts/pi-model-text.mjs".to_string())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_models(search: Option<String>) -> Result<Vec<ModelInfo>, String> {
    let mut args = vec!["--list-models".to_string()];
    if let Some(query) = search {
        args.push(query);
    }

    let output = Command::new("pi").args(&args).output().map_err(|e| format!("Failed to execute pi --list-models: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pi --list-models failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut models = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if line.contains("provider") && line.contains("model") {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let provider = parts[0].to_string();
            let model = parts[1].to_string();

            models.push(ModelInfo { provider, model, available: true, tested: false, last_test_time: None, response_time: None, status: "ready".to_string() });
        }
    }

    Ok(models)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn test_model(provider: String, model: String, _prompt: Option<String>) -> Result<ModelTestResult, String> {
    let args = vec!["--provider", &provider, "--model", &model, "--no-tools", "--no-skills", "--no-extensions", "--no-session", "--print"];

    let start_time = Instant::now();

    let output = Command::new("pi").args(&args).stdin(Stdio::piped()).output().map_err(|e| format!("Failed to execute pi: {e}"))?;

    let duration = start_time.elapsed().as_secs_f64();

    if output.status.success() {
        Ok(ModelTestResult { provider, model, time: duration, output: "OK".to_string(), status: "success".to_string(), error_msg: None })
    } else {
        Ok(ModelTestResult { provider, model, time: duration, output: "Failed".to_string(), status: "error".to_string(), error_msg: Some(String::from_utf8_lossy(&output.stderr).to_string()) })
    }
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn test_models_batch(models: Vec<(String, String)>, prompt: Option<String>) -> Result<Vec<ModelTestResult>, String> {
    let mut results = Vec::new();

    for (provider, model) in models {
        match test_model(provider.clone(), model.clone(), prompt.clone()).await {
            Ok(result) => results.push(result),
            Err(e) => {
                results.push(ModelTestResult { provider, model, time: 0.0, output: String::new(), status: "error".to_string(), error_msg: Some(e) });
            }
        }
    }

    Ok(results)
}

#[cfg(all(test, feature = "gui"))]
mod tests {
    use super::{pi_cli_assistant_error, pi_cli_text_delta};

    #[test]
    fn extracts_text_delta_from_pi_cli_agent_event() {
        let event = serde_json::json!({
            "type": "message_update",
            "assistantMessageEvent": {
                "type": "text_delta",
                "delta": "hello"
            }
        });

        assert_eq!(pi_cli_text_delta(&event), Some("hello"));
    }

    #[test]
    fn extracts_assistant_error_from_pi_cli_message_end() {
        let event = serde_json::json!({
            "type": "message_end",
            "message": {
                "role": "assistant",
                "stopReason": "error",
                "errorMessage": "token expired"
            }
        });

        assert_eq!(pi_cli_assistant_error(&event), Some("token expired"));
    }
}
