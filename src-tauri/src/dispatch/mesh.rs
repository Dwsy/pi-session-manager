//! Narrow backend-local pi-mesh adapter. The Hub remains the only control/state owner.
use super::*;
use std::time::Duration;
#[cfg(feature = "gui")]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(feature = "gui")]
use futures_util::StreamExt;
#[cfg(feature = "gui")]
use tauri::Emitter;

pub(super) const COMMANDS: &[&str] = &[
    "plugin_mesh_peers",
    "plugin_mesh_message",
    "plugin_mesh_cancel",
    "plugin_mesh_follow",
    "plugin_mesh_herdr_agents",
    "plugin_mesh_focus",
];

fn mesh_port() -> Result<u16, String> {
    let home = std::env::var_os("HOME").ok_or("Mesh unavailable: HOME is not set")?;
    let file = std::path::PathBuf::from(home).join(".pi/pi-mesh/config.json");
    let port = match std::fs::read_to_string(&file) {
        Ok(data) => {
            let config: Value = serde_json::from_str(&data)
                .map_err(|e| format!("Invalid Mesh Hub config: {e}"))?;
            match config.get("httpPort") {
                None => 5210,
                Some(value) => value.as_u64()
                    .and_then(|number| u16::try_from(number).ok())
                    .filter(|port| *port >= 1024)
                    .ok_or_else(|| "Invalid Mesh Hub httpPort".to_string())?,
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => 5210,
        Err(error) => return Err(format!("Cannot read Mesh Hub config: {error}")),
    };
    Ok(port)
}

fn full_id(value: &Value, name: &str) -> Result<String, String> {
    let id = value.get(name).and_then(Value::as_str).ok_or_else(|| format!("Missing {name}"))?;
    // Mesh session IDs are full Pi UUIDs. Never rely on the Hub's short-id/contains lookup.
    if id.len() != 36 || !id.as_bytes().iter().enumerate().all(|(index, byte)| {
        if matches!(index, 8 | 13 | 18 | 23) { *byte == b'-' }
        else { byte.is_ascii_hexdigit() }
    }) {
        return Err(format!("{name} must be a complete session UUID"));
    }
    Ok(id.to_owned())
}

async fn request(method: reqwest::Method, path: &str, body: Option<Value>) -> Result<Value, String> {
    let client = reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(13)).build()
        .map_err(|e| format!("Mesh HTTP client unavailable: {e}"))?;
    let url = format!("http://127.0.0.1:{}{path}", mesh_port()?);
    let mut outgoing = client.request(method, url);
    if let Some(body) = body { outgoing = outgoing.json(&body); }
    let response = outgoing.send().await.map_err(|e| format!("Mesh Hub unreachable: {e}"))?;
    let status = response.status();
    let value: Value = response.json().await.map_err(|e| format!("Invalid Mesh Hub response: {e}"))?;
    if !status.is_success() || value.get("ok").and_then(Value::as_bool) == Some(false) {
        return Err(value.get("error").or_else(|| value.get("message"))
            .and_then(Value::as_str).unwrap_or("Mesh Hub rejected request").to_string());
    }
    Ok(value)
}

fn verify_peer_snapshot(snapshot: &Value, id: &str, online: bool) -> Result<(), String> {
    let peers = snapshot.get("peers").and_then(Value::as_array)
        .ok_or("Invalid Mesh peers snapshot")?;
    let mut matches = peers.iter().filter(|peer| peer.get("sessionId").and_then(Value::as_str) == Some(id));
    let peer = matches.next()
        .ok_or("Mesh target not registered")?;
    if matches.next().is_some() {
        return Err("Ambiguous Mesh session UUID: refusing control".to_string());
    }
    if online && !matches!(peer.get("state").and_then(Value::as_str), Some("running" | "waiting")) {
        return Err("Mesh target is offline; request not sent".to_string());
    }
    Ok(())
}

async fn require_peer(id: &str, online: bool) -> Result<(), String> {
    let snapshot = request(reqwest::Method::GET, "/api/peers", None).await?;
    verify_peer_snapshot(&snapshot, id, online)
}
#[cfg(feature = "gui")]
static RELAY_STARTED: AtomicBool = AtomicBool::new(false);

#[cfg(feature = "gui")]
fn ensure_event_relay(app_state: &Option<DispatchAppState>) {
    let Some(state) = app_state else { return };
    if RELAY_STARTED.swap(true, Ordering::AcqRel) { return; }
    let app = state.app_handle.clone();
    tauri::async_runtime::spawn(async move {
        // One stream per backend process, regardless of windows or plugins.
        // Keep peer data in the existing Hub; emit only invalidation signals.
        loop {
            let port = match mesh_port() {
                Ok(port) => port,
                Err(_) => {
                    let _ = app.emit("psm-mesh:availability", serde_json::json!({"available": false}));
                    tokio::time::sleep(Duration::from_secs(3)).await;
                    continue;
                },
            };
            let response = match reqwest::Client::builder().no_proxy().connect_timeout(Duration::from_secs(4)).build() {
                Ok(client) => client.get(format!("http://127.0.0.1:{port}/api/events")).send().await,
                Err(error) => Err(error),
            };
            match response {
                Ok(response) if response.status().is_success() => {
                    let _ = app.emit("psm-mesh:availability", serde_json::json!({"available": true}));
                    let mut stream = response.bytes_stream();
                    let mut buffer = Vec::<u8>::new();
                    while let Some(chunk) = stream.next().await {
                        match chunk {
                            Ok(bytes) => buffer.extend_from_slice(&bytes),
                            Err(_) => break,
                        }
                        if buffer.len() > 1024 * 1024 { break; }
                        while let Some(end) = buffer.windows(2).position(|pair| pair == b"\n\n") {
                            let frame = buffer.drain(..end + 2).collect::<Vec<_>>();
                            if let Some(body) = frame.strip_prefix(b"data: ") {
                                if let Ok(value) = serde_json::from_slice::<Value>(body.trim_ascii()) {
                                    if matches!(value.get("type").and_then(Value::as_str), Some("peers" | "file_activity")) {
                                        let _ = app.emit("psm-mesh:changed", serde_json::json!({ "kind": value.get("type") }));
                                    }
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
            let _ = app.emit("psm-mesh:availability", serde_json::json!({"available": false}));
            tokio::time::sleep(Duration::from_secs(3)).await;
        }
    });
}

pub(super) async fn dispatch(
    #[cfg(feature = "gui")] app_state: &Option<DispatchAppState>,
    command: &str,
    payload: &Value,
) -> DispatchResult {
    if !COMMANDS.contains(&command) { return None; }
    #[cfg(feature = "gui")]
    if command == "plugin_mesh_peers" { ensure_event_relay(app_state); }
    Some(async {
        match command {
            "plugin_mesh_peers" => request(reqwest::Method::GET, "/api/peers", None).await,
            "plugin_mesh_herdr_agents" => request(reqwest::Method::GET, "/api/herdr", None).await,
            "plugin_mesh_focus" => {
                let target = full_id(payload, "targetSessionId")?;
                require_peer(&target, true).await?;
                request(reqwest::Method::POST, &format!("/api/peers/{target}/focus"), Some(serde_json::json!({}))).await
            }
            "plugin_mesh_message" => {
                let target = full_id(payload, "targetSessionId")?;
                let text = extract(payload, "text")?;
                if text.trim().is_empty() { return Err("Mesh message text is required".into()); }
                let mode = extract(payload, "mode")?;
                if mode != "steer" && mode != "followUp" { return Err("Invalid Mesh delivery mode".into()); }
                let mut body = serde_json::json!({"text": text, "mode": mode});
                if payload.get("fromSessionId").is_some() {
                    let sender = full_id(payload, "fromSessionId")?;
                    require_peer(&sender, true).await?;
                    body["fromSessionId"] = Value::String(sender);
                }
                require_peer(&target, true).await?;
                request(reqwest::Method::POST, &format!("/api/peers/{target}/message"), Some(body)).await
            }
            "plugin_mesh_cancel" => {
                let target = full_id(payload, "targetSessionId")?;
                require_peer(&target, true).await?;
                request(reqwest::Method::POST, &format!("/api/peers/{target}/cancel"), Some(serde_json::json!({}))).await
            }
            "plugin_mesh_follow" => {
                let source = full_id(payload, "fromSessionId")?;
                let target = full_id(payload, "targetSessionId")?;
                let following = payload.get("following").and_then(Value::as_bool)
                    .ok_or("Missing following flag")?;
                require_peer(&source, true).await?;
                require_peer(&target, false).await?;
                let action = if following { "follow" } else { "unfollow" };
                request(reqwest::Method::POST, &format!("/api/peers/{source}/{action}"), Some(serde_json::json!({"targetSessionId": target}))).await
            }
            _ => unreachable!(),
        }
    }.await)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_partial_and_ambiguous_ids_before_network() {
        for id in ["", "12345678", "pi:00000000-0000-0000-0000-000000000000", "../api/peers", "00000000-0000-0000-0000-00000000000g"] {
            assert!(full_id(&serde_json::json!({"targetSessionId": id}), "targetSessionId").is_err());
        }
        assert!(full_id(&serde_json::json!({"targetSessionId": "00000000-0000-4000-8000-000000000000"}), "targetSessionId").is_ok());
    }
    #[test]
    fn refuses_ambiguous_and_offline_mesh_snapshot() {
        let id = "00000000-0000-4000-8000-000000000000";
        let valid = serde_json::json!({"peers":[{"sessionId":id, "state":"running"}]});
        assert!(verify_peer_snapshot(&valid, id, true).is_ok());
        let duplicate = serde_json::json!({"peers":[{"sessionId":id, "state":"running"},{"sessionId":id, "state":"waiting"}]});
        assert!(verify_peer_snapshot(&duplicate, id, true).unwrap_err().contains("Ambiguous"));
        let offline = serde_json::json!({"peers":[{"sessionId":id, "state":"offline"}]});
        assert!(verify_peer_snapshot(&offline, id, true).unwrap_err().contains("offline"));
        assert!(verify_peer_snapshot(&offline, id, false).is_ok());
    }
}
