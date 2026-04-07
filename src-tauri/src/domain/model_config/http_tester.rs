//! Model HTTP testing logic
use crate::domain::model_config::reader::{get_models_json_path, read_models_config_internal};
use crate::domain::model_config::types::ModelHttpTestResult;
use crate::utils::string::{join_url, shell_escape_single_quotes};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
use serde_json::{Map, Value};
use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant};

fn build_masked_curl_command(url: &str, headers: &HeaderMap, body: &str) -> String {
    let mut parts = vec!["curl -sS -X POST".to_string(), format!("'{}'", shell_escape_single_quotes(url))];

    for (name, value) in headers {
        let key = name.as_str().to_ascii_lowercase();
        let value_text = value.to_str().unwrap_or("");
        let display_value = if key == "authorization" || key == "x-api-key" {
            "***"
        } else {
            value_text
        };
        parts.push(format!(
            "-H '{}: {}'",
            shell_escape_single_quotes(name.as_str()),
            shell_escape_single_quotes(display_value)
        ));
    }

    parts.push(format!("--data '{}'", shell_escape_single_quotes(body)));
    parts.join(" ")
}

fn resolve_dynamic_value(raw: &str) -> Result<String, String> {
    if let Some(command) = raw.strip_prefix('!') {
        let output = Command::new("sh")
            .arg("-lc")
            .arg(command)
            .output()
            .map_err(|e| format!("Run command for dynamic value failed: {e}"))?;
        if !output.status.success() {
            return Err(format!(
                "Command for dynamic value failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }

    if let Ok(value) = std::env::var(raw) {
        return Ok(value);
    }

    Ok(raw.to_string())
}

fn parse_headers_json(
    provider_headers: Option<&Map<String, Value>>,
    model_headers: Option<&Map<String, Value>>,
) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();

    for raw_map in [provider_headers, model_headers].into_iter().flatten() {
        for (k, v) in raw_map {
            let Some(raw_value) = v.as_str() else {
                continue;
            };
            let resolved_value = resolve_dynamic_value(raw_value)?;
            let header_name = HeaderName::from_bytes(k.as_bytes())
                .map_err(|e| format!("Invalid header name `{k}`: {e}"))?;
            let header_value = HeaderValue::from_str(&resolved_value)
                .map_err(|e| format!("Invalid header value for `{k}`: {e}"))?;
            headers.insert(header_name, header_value);
        }
    }

    Ok(headers)
}

#[derive(Clone, Debug)]
struct HttpTestAttempt {
    request_style: &'static str,
    url: String,
    body_value: Value,
    extra_headers: Vec<(HeaderName, HeaderValue)>,
}

fn is_openai_reasoning_model(model: &str) -> bool {
    let normalized = model.trim().to_ascii_lowercase();
    normalized.starts_with("o1")
        || normalized.starts_with("o3")
        || normalized.starts_with("o4")
        || normalized.starts_with("gpt-5")
}

fn build_openai_chat_attempts(base_url: &str, model: &str, prompt_text: &str) -> Vec<HttpTestAttempt> {
    let mut attempts = Vec::with_capacity(2);
    let max_completion_tokens = if is_openai_reasoning_model(model) { 256 } else { 128 };

    attempts.push(HttpTestAttempt {
        request_style: "chat-completions:max_completion_tokens",
        url: join_url(base_url, "chat/completions"),
        body_value: serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": prompt_text}],
            "stream": false,
            "max_completion_tokens": max_completion_tokens,
        }),
        extra_headers: Vec::new(),
    });

    attempts.push(HttpTestAttempt {
        request_style: "chat-completions:max_tokens",
        url: join_url(base_url, "chat/completions"),
        body_value: serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": prompt_text}],
            "stream": false,
            "max_tokens": 128,
        }),
        extra_headers: Vec::new(),
    });

    attempts
}

fn build_openai_responses_attempts(base_url: &str, model: &str, prompt_text: &str) -> Vec<HttpTestAttempt> {
    vec![
        HttpTestAttempt {
            request_style: "responses:input_string",
            url: join_url(base_url, "responses"),
            body_value: serde_json::json!({
                "model": model,
                "input": prompt_text,
                "max_output_tokens": 256,
            }),
            extra_headers: Vec::new(),
        },
        HttpTestAttempt {
            request_style: "responses:input_message_items",
            url: join_url(base_url, "responses"),
            body_value: serde_json::json!({
                "model": model,
                "input": [{
                    "role": "user",
                    "content": [{
                        "type": "input_text",
                        "text": prompt_text,
                    }],
                }],
                "max_output_tokens": 256,
            }),
            extra_headers: Vec::new(),
        },
    ]
}

fn build_anthropic_messages_attempts(base_url: &str, model: &str, prompt_text: &str) -> Vec<HttpTestAttempt> {
    let version_header = (
        HeaderName::from_static("anthropic-version"),
        HeaderValue::from_static("2023-06-01"),
    );

    vec![
        HttpTestAttempt {
            request_style: "anthropic-messages:string_content",
            url: join_url(base_url, "messages"),
            body_value: serde_json::json!({
                "model": model,
                "max_tokens": 256,
                "messages": [{"role": "user", "content": prompt_text}],
            }),
            extra_headers: vec![version_header.clone()],
        },
        HttpTestAttempt {
            request_style: "anthropic-messages:content_blocks",
            url: join_url(base_url, "messages"),
            body_value: serde_json::json!({
                "model": model,
                "max_tokens": 256,
                "messages": [{
                    "role": "user",
                    "content": [{
                        "type": "text",
                        "text": prompt_text,
                    }],
                }],
            }),
            extra_headers: vec![version_header],
        },
    ]
}

pub fn extract_response_preview(api: &str, response_text: &str) -> Option<String> {
    let parsed: Value = serde_json::from_str(response_text).ok()?;
    match api {
        "openai-completions" => parsed
            .get("choices")
            .and_then(|v| v.as_array())
            .and_then(|choices| choices.first())
            .and_then(|choice| choice.get("message"))
            .and_then(|message| message.get("content"))
            .and_then(|content| content.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        "openai-responses" => parsed
            .get("output_text")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .or_else(|| {
                parsed
                    .get("output")
                    .and_then(|v| v.as_array())
                    .and_then(|items| {
                        items.iter().find_map(|item| {
                            item.get("content")
                                .and_then(|v| v.as_array())
                                .and_then(|content| {
                                    content.iter().find_map(|part| {
                                        part.get("text")
                                            .and_then(|v| v.as_str())
                                            .map(str::trim)
                                            .filter(|value| !value.is_empty())
                                            .map(str::to_string)
                                    })
                                })
                        })
                    })
            }),
        "anthropic-messages" => {
            parsed
                .get("content")
                .and_then(|v| v.as_array())
                .and_then(|items| {
                    items.iter().find_map(|item| {
                        item.get("text")
                            .and_then(|v| v.as_str())
                            .map(str::trim)
                            .filter(|value| !value.is_empty())
                            .map(str::to_string)
                    })
                })
        }
        _ => None,
    }
}

fn extract_error_message(response_text: &str) -> Option<String> {
    let parsed: Value = serde_json::from_str(response_text).ok()?;
    parsed
        .get("error")
        .and_then(|value| {
            if let Some(message) = value.get("message").and_then(|message| message.as_str()) {
                Some(message)
            } else {
                value.as_str()
            }
        })
        .or_else(|| parsed.get("message").and_then(|value| value.as_str()))
        .or_else(|| parsed.get("detail").and_then(|value| value.as_str()))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn truncate_response_body(response_text: &str) -> String {
    if response_text.len() > 10_000 {
        format!("{}\n...[truncated]", &response_text[..10_000])
    } else {
        response_text.to_string()
    }
}

#[allow(clippy::type_complexity)]
fn extract_provider_and_model<'a>(
    config: &'a Value,
    provider: &str,
    model: &str,
) -> Result<(&'a Map<String, Value>, Option<&'a Map<String, Value>>), String> {
    let providers = config
        .get("providers")
        .and_then(|v| v.as_object())
        .ok_or("Invalid models.json: missing providers object")?;

    let provider_obj = providers
        .get(provider)
        .and_then(|v| v.as_object())
        .ok_or_else(|| format!("Provider not found in models.json: {provider}"))?;

    let model_obj = provider_obj
        .get("models")
        .and_then(|v| v.as_array())
        .and_then(|models| {
            models.iter().find_map(|entry| {
                let obj = entry.as_object()?;
                let id = obj.get("id")?.as_str()?;
                if id == model {
                    Some(obj)
                } else {
                    None
                }
            })
        });

    Ok((provider_obj, model_obj))
}

pub async fn test_model_http_internal(
    provider: String,
    model: String,
    prompt: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<ModelHttpTestResult, String> {
    let config = read_models_config_internal()?;
    let (provider_obj, model_obj) = extract_provider_and_model(&config, &provider, &model)?;

    let base_url = provider_obj
        .get("baseUrl")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("Provider `{provider}` is missing baseUrl"))?
        .to_string();

    let api = model_obj
        .and_then(|obj| obj.get("api").and_then(|v| v.as_str()))
        .or_else(|| provider_obj.get("api").and_then(|v| v.as_str()))
        .unwrap_or("openai-completions")
        .to_string();

    let api_key_raw = provider_obj
        .get("apiKey")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let resolved_api_key = if api_key_raw.is_empty() {
        String::new()
    } else {
        resolve_dynamic_value(api_key_raw)?
    };

    let auth_header = provider_obj
        .get("authHeader")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let provider_headers = provider_obj.get("headers").and_then(|v| v.as_object());
    let model_headers = model_obj.and_then(|obj| obj.get("headers").and_then(|v| v.as_object()));
    let mut base_headers = parse_headers_json(provider_headers, model_headers)?;
    base_headers
        .entry(CONTENT_TYPE)
        .or_insert_with(|| HeaderValue::from_static("application/json"));

    if auth_header && !resolved_api_key.is_empty() {
        let bearer = format!("Bearer {resolved_api_key}");
        let value = HeaderValue::from_str(&bearer)
            .map_err(|e| format!("Invalid authorization header value: {e}"))?;
        base_headers.insert(HeaderName::from_static("authorization"), value);
    }

    if api == "anthropic-messages" && !resolved_api_key.is_empty() {
        let key_value = HeaderValue::from_str(&resolved_api_key)
            .map_err(|e| format!("Invalid x-api-key header value: {e}"))?;
        base_headers
            .entry(HeaderName::from_static("x-api-key"))
            .or_insert(key_value);
    }

    let prompt_text = prompt.unwrap_or_else(|| {
        "Reply with a concise health-check response that includes the word ok.".to_string()
    });

    let attempts = match api.as_str() {
        "openai-completions" => build_openai_chat_attempts(&base_url, &model, &prompt_text),
        "openai-responses" => build_openai_responses_attempts(&base_url, &model, &prompt_text),
        "anthropic-messages" => build_anthropic_messages_attempts(&base_url, &model, &prompt_text),
        "google-generative-ai" => {
            return Err("google-generative-ai testing is not supported yet in model HTTP tester".to_string())
        }
        other => return Err(format!("Unsupported api type for HTTP test: {other}")),
    };

    let timeout = Duration::from_millis(timeout_ms.unwrap_or(20_000).clamp(1_000, 120_000));
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| format!("Create HTTP client failed: {e}"))?;

    let mut last_result: Option<ModelHttpTestResult> = None;

    for (index, attempt) in attempts.iter().enumerate() {
        let mut headers = base_headers.clone();
        for (name, value) in &attempt.extra_headers {
            headers.entry(name.clone()).or_insert(value.clone());
        }

        let request_body = serde_json::to_string_pretty(&attempt.body_value)
            .map_err(|e| format!("Serialize HTTP test request body: {e}"))?;
        let curl_command = build_masked_curl_command(&attempt.url, &headers, &request_body);

        let start = Instant::now();
        let response_result = client
            .post(&attempt.url)
            .headers(headers)
            .json(&attempt.body_value)
            .send()
            .await;
        let latency_ms = start.elapsed().as_millis() as u64;

        let result = match response_result {
            Ok(response) => {
                let status = response.status();
                let response_text = response.text().await.unwrap_or_default();
                let response_preview = extract_response_preview(&api, &response_text);
                let response_body = truncate_response_body(&response_text);
                let error = if status.is_success() {
                    None
                } else {
                    let detail = extract_error_message(&response_text)
                        .unwrap_or_else(|| format!("HTTP status {}", status.as_u16()));
                    Some(format!("{}: {}", attempt.request_style, detail))
                };

                ModelHttpTestResult {
                    provider: provider.clone(),
                    model: model.clone(),
                    api: api.clone(),
                    method: "POST".to_string(),
                    url: attempt.url.clone(),
                    status_code: Some(status.as_u16()),
                    ok: status.is_success(),
                    latency_ms,
                    curl_command,
                    request_body,
                    request_style: attempt.request_style.to_string(),
                    response_preview,
                    attempt_count: (index + 1) as u8,
                    used_fallback: index > 0,
                    response_body,
                    error,
                }
            }
            Err(err) => ModelHttpTestResult {
                provider: provider.clone(),
                model: model.clone(),
                api: api.clone(),
                method: "POST".to_string(),
                url: attempt.url.clone(),
                status_code: None,
                ok: false,
                latency_ms,
                curl_command,
                request_body,
                request_style: attempt.request_style.to_string(),
                response_preview: None,
                attempt_count: (index + 1) as u8,
                used_fallback: index > 0,
                response_body: String::new(),
                error: Some(err.to_string()),
            },
        };

        let should_retry = api == "openai-completions"
            && !result.ok
            && index + 1 < attempts.len()
            && matches!(result.status_code, Some(400) | Some(404) | Some(422) | None);

        if result.ok || !should_retry {
            return Ok(result);
        }

        last_result = Some(result);
    }

    last_result.ok_or_else(|| "No HTTP test attempt was generated".to_string())
}
