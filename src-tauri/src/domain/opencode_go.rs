//! Shared OpenCode Go service routes and local credential discovery.

use serde_json::{Map, Value};
use std::path::PathBuf;

/// OpenCode Go's account usage meters, scoped to the bearer key.
pub(super) const USAGE_URL: &str = "https://opencode.ai/inference/go/v1/usage";

/// Match only Go on the official service, including its older Go-specific alias.
pub(super) fn is_go_url(base: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(base) else {
        return false;
    };
    url.scheme() == "https" && url.host_str() == Some("opencode.ai") && url.port().is_none() && ["/inference/go", "/zen/go"].iter().any(|prefix| url.path().strip_prefix(prefix).is_some_and(|suffix| suffix.is_empty() || suffix.starts_with('/')))
}

/// Select the current wire-level base for one of Pi's supported text APIs.
pub(super) fn inference_base(api: &str) -> Option<&'static str> {
    match api {
        "openai-completions" | "openai-responses" => Some("https://opencode.ai/inference/go/openai/v1"),
        "anthropic-messages" => Some("https://opencode.ai/inference/go/anthropic/v1"),
        "google-generative-ai" => Some("https://opencode.ai/inference/go/google/v1beta"),
        _ => None,
    }
}

/// Return the Pi SDK base for a Go protocol. Its Anthropic adapter adds /v1 itself.
fn pi_base(api: &str) -> Option<&'static str> {
    let base = inference_base(api)?;
    if api == "anthropic-messages" {
        base.strip_suffix("/v1")
    } else {
        Some(base)
    }
}

/// Read a nonblank Go configuration field without consuming the rest of the object.
fn field<'a>(entry: &'a Map<String, Value>, name: &str) -> Option<&'a str> {
    entry.get(name)?.as_str().map(str::trim).filter(|value| !value.is_empty())
}

/// All routes must be Go before a provider-wide credential can be sent to Go directly.
pub(super) fn can_reuse_credentials(provider: &Map<String, Value>) -> bool {
    std::iter::once(provider).chain(provider.get("models").and_then(Value::as_array).into_iter().flatten().filter_map(Value::as_object)).filter_map(|entry| field(entry, "baseUrl")).all(is_go_url)
}

/// Remove empty overrides and restore native routing for Pi's built-in Go models.
pub(super) fn prepare_config_for_save(config: &mut Value) {
    let Some(provider) = config.pointer_mut("/providers/opencode-go").and_then(Value::as_object_mut) else {
        return;
    };

    // A provider-wide Go URL replaces the native URL of every built-in model in Pi.
    let global_go_url = field(provider, "baseUrl").is_some_and(is_go_url) && !provider.contains_key("oauth");
    for key in ["apiKey", "api", "baseUrl"] {
        if provider.get(key).and_then(Value::as_str).is_some_and(|value| value.trim().is_empty()) {
            provider.remove(key);
        }
    }
    if global_go_url {
        provider.remove("baseUrl");
    }
    let provider_api = field(provider, "api").map(str::to_owned);
    let Some(models) = provider.get_mut("models").and_then(Value::as_array_mut) else {
        return;
    };

    // Carry a removed Go base into explicitly configured chat models according to their protocol.
    for model in models.iter_mut().filter_map(Value::as_object_mut) {
        for key in ["api", "baseUrl"] {
            if model.get(key).and_then(Value::as_str).is_some_and(|value| value.trim().is_empty()) {
                model.remove(key);
            }
        }
        let needs_route = field(model, "baseUrl").map(is_go_url).unwrap_or(global_go_url);
        if needs_route {
            if let Some(base) = field(model, "api").or(provider_api.as_deref()).and_then(pi_base) {
                model.insert("baseUrl".to_string(), Value::String(base.to_string()));
            }
        }
    }
}

/// Resolve the saved Pi base to its wire form, rejecting stale routes before sending a probe.
pub(super) fn verify_probe_base(configured_base: Option<&str>, api: &str) -> Result<&'static str, String> {
    let wire = inference_base(api).ok_or_else(|| format!("Unsupported OpenCode Go API for HTTP test: {api}"))?;
    let saved = configured_base.map(|base| base.trim_end_matches('/'));
    if saved.is_some() && saved != pi_base(api) {
        return Err(format!("The saved OpenCode Go Base URL does not match {api}. Save the OpenCode Go provider again to update its routes. The expected Pi Base URL is {}.", pi_base(api).unwrap_or(wire)));
    }
    Ok(wire)
}

/// Read one provider's stored API key without falling back to a different provider identity.
fn stored_key(path: PathBuf) -> Option<String> {
    let data = std::fs::read(path).ok()?;
    let auth: Value = serde_json::from_slice(&data).ok()?;
    auth.pointer("/opencode-go/key")?.as_str().map(str::trim).filter(|key| !key.is_empty()).map(str::to_string)
}

/// Resolve Pi's Go account in the same order as Pi.
pub(super) fn pi_api_key(configured: Option<&str>, resolve_command: impl FnOnce(&str) -> Result<String, String>) -> Result<Option<String>, String> {
    // Read the credential next to the same models.json PSM loaded.
    let pi_auth = crate::paths::pi_agent_models_path().ok().map(|path| path.with_file_name("auth.json"));
    if let Some(key) = pi_auth.and_then(stored_key) {
        return resolve_key(&key, resolve_command).map(Some);
    }
    if let Some(key) = configured.map(str::trim).filter(|key| !key.is_empty()) {
        return resolve_key(key, resolve_command).map(Some);
    }

    Ok(env_key("OPENCODE_API_KEY"))
}

/// Let the usage dashboard also serve Go users who connected only in OpenCode.
pub(super) fn standalone_api_key() -> Option<String> {
    let opencode_auth = std::env::var_os("XDG_DATA_HOME").filter(|dir| !dir.is_empty()).map(PathBuf::from).or_else(|| dirs::home_dir().map(|home| home.join(".local/share"))).map(|dir| dir.join("opencode/auth.json"));
    env_key("OPENCODE_GO_API_KEY").or_else(|| opencode_auth.and_then(stored_key))
}

/// Read a nonempty API key from the process environment.
fn env_key(name: &str) -> Option<String> {
    std::env::var(name).ok().map(|key| key.trim().to_string()).filter(|key| !key.is_empty())
}

/// Resolve a literal key or a standalone environment reference without exposing it in errors.
pub(super) fn resolve_key(raw: &str, resolve_command: impl FnOnce(&str) -> Result<String, String>) -> Result<String, String> {
    if raw.starts_with('!') {
        return resolve_command(raw);
    }
    if let Some(reference) = raw.strip_prefix('$') {
        let name = reference.strip_prefix('{').and_then(|name| name.strip_suffix('}')).unwrap_or(reference);
        return env_key(name).ok_or_else(|| "OpenCode Go API key environment variable is missing or empty".to_string());
    }
    Ok(raw.to_string())
}

#[cfg(test)]
mod tests {
    use super::can_reuse_credentials;
    use serde_json::json;

    #[test]
    fn opencode_go_credentials_are_isolated_from_proxy_routes() {
        for provider in [json!({"baseUrl": "https://proxy.example/v1"}), json!({"models": [{"id": "proxy-model", "baseUrl": "https://proxy.example/v1"}]})] {
            assert!(!can_reuse_credentials(provider.as_object().unwrap()));
        }
        let native = json!({"baseUrl": "https://opencode.ai/zen/go/v1", "models": [{"id": "go-model", "baseUrl": "https://opencode.ai/inference/go/anthropic"}]});
        assert!(can_reuse_credentials(native.as_object().unwrap()));
    }
}
