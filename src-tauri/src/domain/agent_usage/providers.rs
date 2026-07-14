use super::credentials::{env_var, first_string, home_dir, json_string, parse_toml_string, read_json, read_keychain, read_sqlite_map, read_sqlite_query, read_text, unwrap_go_keyring};
use super::http::{http_json, HttpError, HttpRequest};
use super::parsers::{
    parse_amp_rows, parse_antigravity_rows, parse_claude_rows, parse_codex_rows, parse_copilot_rows, parse_cursor_rows, parse_devin_rows, parse_factory_rows, parse_grok_rows, parse_kimi_rows, parse_minimax_rows, parse_opencode_go_rows, parse_openrouter_credits_rows, parse_openrouter_key_rows,
    parse_zai_plan_name, parse_zai_rows, ParsedUsage,
};
use super::types::{available_snapshot, error_snapshot, provider_meta, unavailable, AgentUsageMetric, AgentUsageProvider, PROVIDER_CATALOG};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::PathBuf;

pub async fn fetch_all_providers(allowed: Option<&HashSet<String>>) -> Vec<AgentUsageProvider> {
    let mut handles = Vec::new();
    for meta in PROVIDER_CATALOG {
        if let Some(allowed) = allowed {
            if !allowed.contains(meta.id) {
                continue;
            }
        }
        let id = meta.id;
        handles.push(tokio::spawn(async move { fetch_provider(id).await }));
    }

    let mut providers = Vec::with_capacity(handles.len());
    for handle in handles {
        match handle.await {
            Ok(provider) => providers.push(provider),
            Err(error) => providers.push(error_snapshot(provider_meta("claude").unwrap_or(&PROVIDER_CATALOG[0]), format!("Provider task failed: {error}"))),
        }
    }
    providers.sort_by(|a, b| a.id.cmp(&b.id));
    providers
}

async fn fetch_provider(id: &str) -> AgentUsageProvider {
    let meta = match provider_meta(id) {
        Some(meta) => meta,
        None => return AgentUsageProvider { id: id.to_string(), name: id.to_string(), plan_name: None, fetched_at: chrono::Utc::now().to_rfc3339(), state: super::types::AgentUsageState::Error, message: Some("Unknown provider".to_string()), metrics: Vec::new() },
    };

    match id {
        "antigravity" => fetch_antigravity(meta).await,
        "claude" => fetch_claude(meta).await,
        "codex" => fetch_codex(meta).await,
        "amp" => fetch_amp(meta).await,
        "copilot" => fetch_copilot(meta).await,
        "cursor" => fetch_cursor(meta).await,
        "devin" => fetch_devin(meta).await,
        "factory" => fetch_factory(meta).await,
        "grok" => fetch_grok(meta).await,
        "openrouter" => fetch_openrouter(meta).await,
        "opencode-go" => fetch_opencode_go(meta).await,
        "kimi" => fetch_kimi(meta).await,
        "minimax" => fetch_minimax(meta).await,
        "zai" => fetch_zai(meta).await,
        _ => unavailable(meta, "Unsupported provider"),
    }
}

async fn fetch_with_token(meta: &super::types::ProviderMeta, token: Option<String>, unauthenticated: &str, request: impl FnOnce(&str) -> HttpRequest, parse: impl FnOnce(&Value) -> ParsedUsage) -> AgentUsageProvider {
    let Some(token) = token.filter(|value| !value.is_empty()) else {
        return unavailable(meta, unauthenticated);
    };
    match http_json(request(&token)).await {
        Ok(payload) => {
            let parsed = parse(&payload);
            if parsed.rows.is_empty() {
                unavailable(meta, "No usage data")
            } else {
                available_snapshot(meta, parsed.plan_name, parsed.rows)
            }
        }
        Err(HttpError::Auth) => unavailable(meta, unauthenticated),
        Err(HttpError::Other(_)) => error_snapshot(meta, "Unable to fetch usage"),
    }
}

async fn fetch_claude(meta: &super::types::ProviderMeta) -> AgentUsageProvider {
    let candidates = read_claude_tokens();
    if candidates.is_empty() {
        return unavailable(meta, "Sign in to Claude");
    }
    let mut auth_fallback = None;
    for token in candidates {
        let result = fetch_with_token(
            meta,
            Some(token),
            "Sign in to Claude",
            |token| HttpRequest {
                url: "https://api.anthropic.com/api/oauth/usage".to_string(),
                method: "GET".to_string(),
                headers: vec![
                    ("Authorization".to_string(), format!("Bearer {token}")),
                    ("Accept".to_string(), "application/json".to_string()),
                    ("Content-Type".to_string(), "application/json".to_string()),
                    ("anthropic-beta".to_string(), "oauth-2025-04-20".to_string()),
                    ("User-Agent".to_string(), "claude-code/2.1.69".to_string()),
                ],
                body: None,
            },
            parse_claude_rows,
        )
        .await;
        if result.state == super::types::AgentUsageState::Available {
            return result;
        }
        if result.message.as_deref() == Some("Sign in to Claude") {
            auth_fallback = Some(result);
            continue;
        }
        return result;
    }
    auth_fallback.unwrap_or_else(|| unavailable(meta, "Sign in to Claude"))
}

fn read_claude_tokens() -> Vec<String> {
    let mut tokens = Vec::new();
    if let Some(raw) = read_keychain("Claude Code-credentials", env_var("USER").as_deref()).or_else(|| read_keychain("Claude Code-credentials", None)) {
        if let Ok(payload) = serde_json::from_str::<Value>(&raw) {
            if let Some(token) = json_string(&payload, &["claudeAiOauth", "accessToken"]) {
                tokens.push(token);
            }
        }
    }

    let config_dir = env_var("CLAUDE_CONFIG_DIR").map(PathBuf::from).or_else(|| home_dir().map(|home| home.join(".claude")));
    if let Some(path) = config_dir.map(|dir| dir.join(".credentials.json")) {
        if let Some(payload) = read_json(path) {
            if let Some(token) = json_string(&payload, &["claudeAiOauth", "accessToken"]) {
                if !tokens.contains(&token) {
                    tokens.push(token);
                }
            }
        }
    }

    if tokens.is_empty() {
        if let Some(token) = env_var("CLAUDE_CODE_OAUTH_TOKEN") {
            tokens.push(token);
        }
    }
    tokens
}

async fn fetch_codex(meta: &super::types::ProviderMeta) -> AgentUsageProvider {
    let auth = read_codex_auth();
    let token = auth.as_ref().map(|(token, _)| token.clone());
    let account_id = auth.as_ref().and_then(|(_, account)| account.clone());
    fetch_with_token(
        meta,
        token,
        "Sign in to Codex",
        |token| {
            let mut headers = vec![("Authorization".to_string(), format!("Bearer {token}")), ("Accept".to_string(), "application/json".to_string())];
            if let Some(account_id) = &account_id {
                headers.push(("ChatGPT-Account-Id".to_string(), account_id.clone()));
            }
            HttpRequest { url: "https://chatgpt.com/backend-api/wham/usage".to_string(), method: "GET".to_string(), headers, body: None }
        },
        parse_codex_rows,
    )
    .await
}

fn read_codex_auth() -> Option<(String, Option<String>)> {
    if let Some(token) = env_var("CODEX_ACCESS_TOKEN") {
        return Some((token, env_var("CODEX_ACCOUNT_ID")));
    }
    let home = home_dir()?;
    let candidates = [env_var("CODEX_HOME").map(|dir| PathBuf::from(dir).join("auth.json")), Some(home.join(".config/codex/auth.json")), Some(home.join(".codex/auth.json"))];
    for path in candidates.into_iter().flatten() {
        if let Some(payload) = read_json(path) {
            if let Some(token) = json_string(&payload, &["tokens", "access_token"]) {
                return Some((token, json_string(&payload, &["tokens", "account_id"])));
            }
        }
    }
    None
}

async fn fetch_amp(meta: &super::types::ProviderMeta) -> AgentUsageProvider {
    let home = home_dir();
    let secrets = home.as_ref().and_then(|home| read_json(home.join(".local/share/amp/secrets.json")));
    let token = first_string([env_var("AMP_API_KEY"), secrets.as_ref().and_then(|payload| json_string(payload, &["apiKey@https://ampcode.com/"])), secrets.as_ref().and_then(|payload| json_string(payload, &["apiKey"])), secrets.as_ref().and_then(|payload| json_string(payload, &["token"]))]);
    fetch_with_token(
        meta,
        token,
        "Sign in to Amp",
        |token| HttpRequest {
            url: "https://ampcode.com/api/internal".to_string(),
            method: "POST".to_string(),
            headers: vec![("Authorization".to_string(), format!("Bearer {token}")), ("Content-Type".to_string(), "application/json".to_string()), ("Accept".to_string(), "application/json".to_string())],
            body: Some(json!({ "method": "userDisplayBalanceInfo", "params": {} })),
        },
        parse_amp_rows,
    )
    .await
}

async fn fetch_copilot(meta: &super::types::ProviderMeta) -> AgentUsageProvider {
    let home = home_dir();
    let hosts = home.as_ref().and_then(|home| read_json(home.join(".config/github-copilot/hosts.json")));
    let hosts_token = hosts.as_ref().and_then(|payload| payload.as_object().and_then(|map| map.values().find_map(|host| json_string(host, &["oauth_token"]).or_else(|| json_string(host, &["token"])).or_else(|| json_string(host, &["github_token"])))));
    let gh_token = home.as_ref().and_then(|home| read_text(home.join(".config/gh/hosts.yml"))).and_then(|text| {
        text.lines().find_map(|line| {
            let trimmed = line.trim();
            trimmed.strip_prefix("oauth_token:").map(|value| value.trim().trim_matches(['\'', '"']).to_string()).filter(|value| !value.is_empty())
        })
    });
    let token = first_string([env_var("COPILOT_GITHUB_TOKEN"), env_var("GH_TOKEN"), env_var("GITHUB_TOKEN"), hosts_token, gh_token, read_keychain("github.com", None)]);
    fetch_with_token(
        meta,
        token,
        "Sign in to Copilot",
        |token| HttpRequest { url: "https://api.github.com/copilot_internal/user".to_string(), method: "GET".to_string(), headers: vec![("Authorization".to_string(), format!("token {token}")), ("Accept".to_string(), "application/json".to_string())], body: None },
        parse_copilot_rows,
    )
    .await
}

async fn fetch_cursor(meta: &super::types::ProviderMeta) -> AgentUsageProvider {
    let credentials = read_cursor_credentials();
    let token = credentials.as_ref().map(|(token, _)| token.clone());
    let plan_name = credentials.and_then(|(_, plan)| plan);
    let mut result = fetch_with_token(
        meta,
        token,
        "Sign in to Cursor",
        |token| HttpRequest {
            url: "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage".to_string(),
            method: "POST".to_string(),
            headers: vec![("Authorization".to_string(), format!("Bearer {token}")), ("Content-Type".to_string(), "application/json".to_string()), ("Connect-Protocol-Version".to_string(), "1".to_string())],
            body: Some(json!({})),
        },
        parse_cursor_rows,
    )
    .await;
    if result.plan_name.is_none() {
        result.plan_name = plan_name;
    }
    result
}

fn read_cursor_credentials() -> Option<(String, Option<String>)> {
    if let Some(token) = env_var("CURSOR_ACCESS_TOKEN") {
        return Some((token, None));
    }
    let home = home_dir()?;
    let db_paths = [home.join("Library/Application Support/Cursor/User/globalStorage/state.vscdb"), home.join(".config/Cursor/User/globalStorage/state.vscdb")];
    for db_path in db_paths {
        if let Some(map) = read_sqlite_map(&db_path, &["cursorAuth/accessToken", "cursorAuth/refreshToken", "cursorAuth/stripeMembershipType"]) {
            if let Some(token) = map.get("cursorAuth/accessToken").cloned() {
                return Some((token, map.get("cursorAuth/stripeMembershipType").cloned()));
            }
        }
    }
    None
}

async fn fetch_devin(meta: &super::types::ProviderMeta) -> AgentUsageProvider {
    let Some((api_key, api_server)) = read_devin_credentials() else {
        return unavailable(meta, "Run devin auth login");
    };
    match http_json(HttpRequest {
        url: format!("{api_server}/exa.seat_management_pb.SeatManagementService/GetUserStatus"),
        method: "POST".to_string(),
        headers: vec![("Content-Type".to_string(), "application/json".to_string()), ("Connect-Protocol-Version".to_string(), "1".to_string())],
        body: Some(json!({
            "metadata": {
                "apiKey": api_key,
                "ideName": "devin",
                "ideVersion": "1.108.2",
                "extensionName": "devin",
                "extensionVersion": "1.108.2",
                "locale": "en"
            }
        })),
    })
    .await
    {
        Ok(payload) => {
            let parsed = parse_devin_rows(&payload);
            if parsed.rows.is_empty() {
                unavailable(meta, "No usage data")
            } else {
                available_snapshot(meta, parsed.plan_name, parsed.rows)
            }
        }
        Err(_) => error_snapshot(meta, "Unable to fetch usage"),
    }
}

fn read_devin_credentials() -> Option<(String, String)> {
    if let Some(key) = first_string([env_var("DEVIN_API_KEY"), env_var("WINDSURF_API_KEY")]) {
        return Some((key, "https://server.codeium.com".to_string()));
    }
    let home = home_dir()?;
    if let Some(text) = read_text(home.join(".local/share/devin/credentials.toml")) {
        if let Some(key) = parse_toml_string(&text, "windsurf_api_key") {
            let server = parse_toml_string(&text, "api_server_url").filter(|value| value.starts_with("https://")).unwrap_or_else(|| "https://server.codeium.com".to_string());
            return Some((key, server.trim_end_matches('/').to_string()));
        }
    }
    let db_path = home.join("Library/Application Support/Devin/User/globalStorage/state.vscdb");
    if let Some(rows) = read_sqlite_query(&db_path, "SELECT value FROM ItemTable WHERE key = 'windsurfAuthStatus' LIMIT 1") {
        if let Some(raw) = rows.first().and_then(|row| row.first()) {
            if let Ok(payload) = serde_json::from_str::<Value>(raw) {
                if let Some(key) = json_string(&payload, &["apiKey"]) {
                    return Some((key, "https://server.codeium.com".to_string()));
                }
            }
        }
    }
    None
}

async fn fetch_factory(meta: &super::types::ProviderMeta) -> AgentUsageProvider {
    let home = home_dir();
    let token = first_string([
        env_var("FACTORY_ACCESS_TOKEN"),
        env_var("FACTORY_API_TOKEN"),
        home.as_ref().and_then(|home| token_from_credential_raw(&read_text(home.join(".factory/auth.json")).unwrap_or_default())),
        home.as_ref().and_then(|home| token_from_credential_raw(&read_text(home.join(".factory/auth.encrypted")).unwrap_or_default())),
        read_factory_keychain(),
    ]);
    fetch_with_token(
        meta,
        token,
        "Sign in to Factory",
        |token| HttpRequest {
            url: "https://api.factory.ai/api/organization/subscription/usage".to_string(),
            method: "POST".to_string(),
            headers: vec![("Authorization".to_string(), format!("Bearer {token}")), ("Accept".to_string(), "application/json".to_string()), ("Content-Type".to_string(), "application/json".to_string())],
            body: Some(json!({})),
        },
        parse_factory_rows,
    )
    .await
}

fn read_factory_keychain() -> Option<String> {
    for service in ["Factory Token", "Factory token", "Factory Auth", "Droid Auth"] {
        if let Some(raw) = read_keychain(service, None) {
            if let Some(token) = token_from_credential_raw(&raw) {
                return Some(token);
            }
        }
    }
    None
}

fn token_from_credential_raw(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(payload) = serde_json::from_str::<Value>(trimmed) {
        return first_string([json_string(&payload, &["tokens", "access_token"]), json_string(&payload, &["tokens", "accessToken"]), json_string(&payload, &["access_token"]), json_string(&payload, &["accessToken"])]);
    }
    if trimmed.split('.').count() >= 3 {
        Some(trimmed.to_string())
    } else {
        None
    }
}

async fn fetch_grok(meta: &super::types::ProviderMeta) -> AgentUsageProvider {
    let Some(token) = read_grok_token() else {
        return unavailable(meta, "Sign in to Grok");
    };
    match http_json(HttpRequest {
        url: "https://cli-chat-proxy.grok.com/v1/billing?format=credits".to_string(),
        method: "GET".to_string(),
        headers: vec![("Authorization".to_string(), format!("Bearer {token}")), ("X-XAI-Token-Auth".to_string(), "xai-grok-cli".to_string()), ("Accept".to_string(), "application/json".to_string())],
        body: None,
    })
    .await
    {
        Ok(payload) => {
            let parsed = parse_grok_rows(&payload);
            if parsed.rows.is_empty() {
                unavailable(meta, "No usage data")
            } else {
                let plan_name = http_json(HttpRequest {
                    url: "https://cli-chat-proxy.grok.com/v1/settings".to_string(),
                    method: "GET".to_string(),
                    headers: vec![("Authorization".to_string(), format!("Bearer {token}")), ("X-XAI-Token-Auth".to_string(), "xai-grok-cli".to_string()), ("Accept".to_string(), "application/json".to_string())],
                    body: None,
                })
                .await
                .ok()
                .and_then(|settings| json_string(&settings, &["subscription_tier_display"]));
                available_snapshot(meta, plan_name, parsed.rows)
            }
        }
        Err(HttpError::Auth) => unavailable(meta, "Sign in to Grok"),
        Err(HttpError::Other(_)) => error_snapshot(meta, "Unable to fetch usage"),
    }
}

fn read_grok_token() -> Option<String> {
    if let Some(token) = first_string([env_var("GROK_CODE_XAI_API_KEY"), env_var("XAI_API_KEY")]) {
        return Some(token);
    }
    let home = home_dir()?;
    let auth = read_json(home.join(".grok/auth.json"))?;
    let object = auth.as_object()?;
    for entry in object.values() {
        if let Some(token) = json_string(entry, &["key"]) {
            return Some(token);
        }
    }
    None
}

async fn fetch_openrouter(meta: &super::types::ProviderMeta) -> AgentUsageProvider {
    let Some(api_key) = read_openrouter_key() else {
        return unavailable(meta, "Set OPENROUTER_API_KEY");
    };
    let credits = http_json(HttpRequest { url: "https://openrouter.ai/api/v1/credits".to_string(), method: "GET".to_string(), headers: vec![("Authorization".to_string(), format!("Bearer {api_key}")), ("Accept".to_string(), "application/json".to_string())], body: None }).await;
    let key = http_json(HttpRequest { url: "https://openrouter.ai/api/v1/key".to_string(), method: "GET".to_string(), headers: vec![("Authorization".to_string(), format!("Bearer {api_key}")), ("Accept".to_string(), "application/json".to_string())], body: None }).await.ok();

    match credits {
        Ok(credits_payload) => {
            let mut rows = parse_openrouter_credits_rows(&credits_payload);
            let mut plan_name = None;
            if let Some(key_payload) = key {
                let parsed = parse_openrouter_key_rows(&key_payload);
                rows.extend(parsed.rows);
                plan_name = parsed.plan_name;
            }
            if rows.is_empty() {
                unavailable(meta, "No usage data")
            } else {
                available_snapshot(meta, plan_name, rows)
            }
        }
        Err(_) => error_snapshot(meta, "Unable to fetch usage"),
    }
}

fn read_openrouter_key() -> Option<String> {
    if let Some(key) = first_string([env_var("OPENROUTER_API_KEY"), env_var("OPENROUTER_KEY")]) {
        return Some(key);
    }
    let home = home_dir()?;
    for path in [home.join(".config/openusage/openrouter.json"), home.join(".config/openrouter/key.json")] {
        if let Some(payload) = read_json(&path) {
            if let Some(key) = first_string([json_string(&payload, &["apiKey"]), json_string(&payload, &["api_key"]), json_string(&payload, &["key"])]) {
                return Some(key);
            }
        } else if let Some(raw) = read_text(&path) {
            let trimmed = raw.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

async fn fetch_opencode_go(meta: &super::types::ProviderMeta) -> AgentUsageProvider {
    if read_opencode_go_token().is_none() {
        return unavailable(meta, "Sign in to OpenCode Go");
    }
    let home = match home_dir() {
        Some(home) => home,
        None => return unavailable(meta, "No usage data"),
    };
    let db_path = home.join(".local/share/opencode/opencode.db");
    let sql = "SELECT CAST(COALESCE(json_extract(data, '$.time.created'), time_created) AS INTEGER) AS createdMs, CAST(json_extract(data, '$.cost') AS REAL) AS cost FROM message WHERE json_valid(data) AND json_extract(data, '$.providerID') = 'opencode-go' AND json_extract(data, '$.role') = 'assistant' AND json_type(data, '$.cost') IN ('integer', 'real')";
    let Some(rows) = read_sqlite_query(&db_path, sql) else {
        return unavailable(meta, "No usage data");
    };
    let mut points = Vec::new();
    for row in rows {
        if row.len() < 2 {
            continue;
        }
        let created = row[0].parse::<i64>().unwrap_or(0);
        let cost = row[1].parse::<f64>().unwrap_or(-1.0);
        if created > 0 && cost >= 0.0 {
            points.push((created, cost));
        }
    }
    if points.is_empty() {
        return unavailable(meta, "No usage data");
    }
    let metrics = parse_opencode_go_rows(&points, chrono::Utc::now().timestamp_millis());
    available_snapshot(meta, Some("Go".to_string()), metrics)
}

fn read_opencode_go_token() -> Option<String> {
    if let Some(token) = env_var("OPENCODE_GO_API_KEY") {
        return Some(token);
    }
    let home = home_dir()?;
    let auth = read_json(home.join(".local/share/opencode/auth.json"))?;
    json_string(&auth, &["opencode-go", "key"])
}

async fn fetch_kimi(meta: &super::types::ProviderMeta) -> AgentUsageProvider {
    let token = read_kimi_token();
    fetch_with_token(
        meta,
        token,
        "Sign in to Kimi",
        |token| HttpRequest { url: "https://api.kimi.com/coding/v1/usages".to_string(), method: "GET".to_string(), headers: vec![("Authorization".to_string(), format!("Bearer {token}")), ("Accept".to_string(), "application/json".to_string())], body: None },
        parse_kimi_rows,
    )
    .await
}

fn read_kimi_token() -> Option<String> {
    let home = home_dir()?;
    for path in [home.join(".kimi-code/credentials/kimi-code.json"), home.join(".kimi/credentials/kimi-code.json")] {
        if let Some(payload) = read_json(path) {
            if let Some(token) = json_string(&payload, &["access_token"]) {
                return Some(token);
            }
        }
    }
    None
}

async fn fetch_minimax(meta: &super::types::ProviderMeta) -> AgentUsageProvider {
    let home = home_dir();
    let token = first_string([
        env_var("MINIMAX_CN_API_KEY"),
        env_var("MINIMAX_API_KEY"),
        env_var("MINIMAX_API_TOKEN"),
        home.as_ref().and_then(|home| read_json(home.join(".mmx/config.json")).and_then(|payload| first_string([json_string(&payload, &["api_key"]), json_string(&payload, &["apiKey"]), json_string(&payload, &["token"])]))),
        home.as_ref().and_then(|home| read_json(home.join(".mmx/credentials.json")).and_then(|payload| json_string(&payload, &["auth", "access_token"]))),
    ]);
    let cn = env_var("MINIMAX_CN_API_KEY").is_some();
    let hosts = if cn { vec!["api.minimaxi.com"] } else { vec!["api.minimax.io", "www.minimax.io"] };
    let endpoint = if cn { "/v1/token_plan/remains" } else { "/v1/api/openplatform/coding_plan/remains" };

    let Some(token) = token else {
        return unavailable(meta, "Sign in to MiniMax");
    };

    for host in hosts {
        let result = fetch_with_token(
            meta,
            Some(token.clone()),
            "Sign in to MiniMax",
            |token| HttpRequest { url: format!("https://{host}{endpoint}"), method: "GET".to_string(), headers: vec![("Authorization".to_string(), format!("Bearer {token}")), ("Accept".to_string(), "application/json".to_string())], body: None },
            parse_minimax_rows,
        )
        .await;
        if result.state != super::types::AgentUsageState::Error {
            return result;
        }
    }
    unavailable(meta, "Unable to fetch usage")
}

async fn fetch_zai(meta: &super::types::ProviderMeta) -> AgentUsageProvider {
    let Some(token) = first_string([env_var("ZAI_API_KEY")]) else {
        return unavailable(meta, "SET ZAI_API_KEY");
    };
    let authorization = if token.to_ascii_lowercase().starts_with("bearer ") { token } else { format!("Bearer {token}") };
    let headers = vec![("Authorization".to_string(), authorization), ("Accept".to_string(), "application/json".to_string())];
    let subscription = http_json(HttpRequest { url: "https://api.z.ai/api/biz/subscription/list".to_string(), method: "GET".to_string(), headers: headers.clone(), body: None }).await;
    let quota = http_json(HttpRequest { url: "https://api.z.ai/api/monitor/usage/quota/limit".to_string(), method: "GET".to_string(), headers, body: None }).await;

    match (subscription, quota) {
        (Ok(subscription), Ok(quota)) => {
            let plan_name = parse_zai_plan_name(&subscription);
            let parsed = parse_zai_rows(&quota, plan_name);
            if parsed.rows.is_empty() {
                unavailable(meta, "No usage data")
            } else {
                available_snapshot(meta, parsed.plan_name, parsed.rows)
            }
        }
        _ => error_snapshot(meta, "Unable to fetch usage"),
    }
}

async fn fetch_antigravity(meta: &super::types::ProviderMeta) -> AgentUsageProvider {
    let Some(token) = read_antigravity_token() else {
        return unavailable(meta, "Start Antigravity or run agy");
    };
    for base_url in ["https://daily-cloudcode-pa.googleapis.com", "https://cloudcode-pa.googleapis.com"] {
        match http_json(HttpRequest {
            url: format!("{base_url}/v1internal:retrieveUserQuotaSummary"),
            method: "POST".to_string(),
            headers: vec![("Authorization".to_string(), format!("Bearer {token}")), ("Accept".to_string(), "application/json".to_string()), ("Content-Type".to_string(), "application/json".to_string()), ("User-Agent".to_string(), "antigravity".to_string())],
            body: Some(json!({})),
        })
        .await
        {
            Ok(payload) => {
                let parsed = parse_antigravity_rows(&payload);
                if !parsed.rows.is_empty() {
                    return available_snapshot(meta, parsed.plan_name, parsed.rows);
                }
            }
            Err(_) => continue,
        }
    }
    error_snapshot(meta, "Unable to fetch usage")
}

fn read_antigravity_token() -> Option<String> {
    if let Some(token) = env_var("ANTIGRAVITY_ACCESS_TOKEN") {
        return Some(token);
    }
    let home = home_dir()?;
    if let Some(payload) = read_json(home.join("Library/Application Support/OpenUsage/antigravity/auth.json")) {
        if let Some(token) = json_string(&payload, &["accessToken"]) {
            let expires = payload.get("expiresAtMs").and_then(Value::as_i64).unwrap_or(0);
            if expires > chrono::Utc::now().timestamp_millis() + 60_000 {
                return Some(token);
            }
        }
    }
    let raw = read_keychain("gemini", Some("antigravity")).or_else(|| read_keychain("gemini", None))?;
    let text = unwrap_go_keyring(&raw);
    if let Ok(payload) = serde_json::from_str::<Value>(&text) {
        return antigravity_token_from_object(&payload);
    }
    let token = text.trim().trim_start_matches("Bearer ").trim();
    if token.is_empty() {
        None
    } else {
        Some(token.to_string())
    }
}

fn antigravity_token_from_object(object: &Value) -> Option<String> {
    let source = object.get("token").filter(|value| value.is_object()).unwrap_or(object);
    first_string([
        json_string(source, &["access_token"]),
        json_string(source, &["accessToken"]),
        json_string(source, &["token"]),
        json_string(source, &["id_token"]),
        json_string(source, &["idToken"]),
        json_string(source, &["bearerToken"]),
        json_string(source, &["auth_token"]),
        json_string(source, &["authToken"]),
    ])
    .or_else(|| {
        for key in ["tokens", "oauth", "oauth2", "credentials", "auth"] {
            if let Some(nested) = object.get(key).filter(|value| value.is_object()) {
                if let Some(token) = antigravity_token_from_object(nested) {
                    return Some(token);
                }
            }
        }
        None
    })
}
