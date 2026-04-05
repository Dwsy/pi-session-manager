#[cfg(feature = "gui")]
use crate::app_state::SharedAppState;
use crate::dispatch::dispatch;
#[cfg(feature = "gui")]
use crate::server::ws::ws_dispatch;
use crate::types::{SessionEntry, SessionInfo};
use axum::extract::{ConnectInfo, Path, Query, State};
use axum::http::{HeaderMap, StatusCode, Uri};
use axum::response::Response;
use axum::Json;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::net::SocketAddr;

use super::common::{
    is_authorized, json_error_response, json_success_response, parse_time_opt,
    session_matches_scope, unauthorized_response, CheckoutRequest, MilestoneCreateRequest,
    SessionsQuery,
};

async fn dispatch_json(
    app_state: &SharedAppState,
    command: &str,
    payload: Value,
) -> Result<Value, String> {
    dispatch(&Some(app_state.clone()), command, &payload).await
}

async fn find_session_path_by_id(
    app_state: &SharedAppState,
    id: &str,
) -> Result<Option<String>, String> {
    let sessions_value = dispatch_json(app_state, "scan_sessions", json!({})).await?;
    let sessions: Vec<SessionInfo> = serde_json::from_value(sessions_value).unwrap_or_default();
    Ok(sessions
        .into_iter()
        .find(|session| session.id == id)
        .map(|session| session.path))
}

pub(crate) async fn v1_list_sessions(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    Query(query): Query<SessionsQuery>,
    headers: HeaderMap,
    uri: Uri,
) -> Response {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return unauthorized_response();
    }

    let from = match parse_time_opt(&query.from) {
        Ok(value) => value,
        Err(error) => return json_error_response(StatusCode::BAD_REQUEST, error.to_string()),
    };
    let to = match parse_time_opt(&query.to) {
        Ok(value) => value,
        Err(error) => return json_error_response(StatusCode::BAD_REQUEST, error.to_string()),
    };

    match dispatch_json(&app_state, "scan_sessions", json!({})).await {
        Ok(data) => {
            let mut sessions: Vec<SessionInfo> = serde_json::from_value(data).unwrap_or_default();

            if let Some(cwd) = query.cwd {
                sessions.retain(|session| session.cwd == cwd);
            }
            if let Some(query_text) = query.q {
                let query_text = query_text.to_lowercase();
                sessions.retain(|session| {
                    session.id.to_lowercase().contains(&query_text)
                        || session.path.to_lowercase().contains(&query_text)
                        || session
                            .name
                            .as_ref()
                            .map(|name| name.to_lowercase().contains(&query_text))
                            .unwrap_or(false)
                        || session.first_message.to_lowercase().contains(&query_text)
                });
            }

            sessions.retain(|session| {
                session_matches_scope(session, query.project.as_deref(), from, to)
            });
            if let Some(limit) = query.limit {
                sessions.truncate(limit);
            }

            json_success_response(sessions)
        }
        Err(error) => json_error_response(StatusCode::INTERNAL_SERVER_ERROR, error),
    }
}

pub(crate) async fn v1_get_session_entries(
    Path(id): Path<String>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
) -> Response {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return unauthorized_response();
    }

    let Some(session_path) = (match find_session_path_by_id(&app_state, &id).await {
        Ok(value) => value,
        Err(error) => return json_error_response(StatusCode::INTERNAL_SERVER_ERROR, error),
    }) else {
        return json_error_response(StatusCode::NOT_FOUND, "Session not found");
    };

    match dispatch_json(
        &app_state,
        "get_session_entries",
        json!({ "path": session_path }),
    )
    .await
    {
        Ok(data) => json_success_response(data),
        Err(error) => json_error_response(StatusCode::INTERNAL_SERVER_ERROR, error),
    }
}

pub(crate) async fn v1_create_milestone(
    Path(id): Path<String>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
    Json(req): Json<MilestoneCreateRequest>,
) -> Response {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return unauthorized_response();
    }

    let _ = (&id, &app_state, &req.name, &req.color, &req.icon);
    json_error_response(
        StatusCode::FORBIDDEN,
        "Read-only mode: creating milestones is disabled",
    )
}

pub(crate) async fn v1_list_milestones(
    Path(id): Path<String>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
) -> Response {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return unauthorized_response();
    }

    let session_tags_value =
        match dispatch_json(&app_state, "get_all_session_tags", json!({})).await {
            Ok(value) => value,
            Err(error) => return json_error_response(StatusCode::INTERNAL_SERVER_ERROR, error),
        };
    let tags_value = match dispatch_json(&app_state, "get_all_tags", json!({})).await {
        Ok(value) => value,
        Err(error) => return json_error_response(StatusCode::INTERNAL_SERVER_ERROR, error),
    };

    let session_tags: Vec<crate::commands::SessionTagItem> =
        serde_json::from_value(session_tags_value).unwrap_or_default();
    let tags: Vec<crate::commands::TagItem> =
        serde_json::from_value(tags_value).unwrap_or_default();

    let milestone_tag_ids: HashSet<String> = session_tags
        .into_iter()
        .filter(|session_tag| session_tag.session_id == id)
        .map(|session_tag| session_tag.tag_id)
        .collect();

    let milestones: Vec<crate::commands::TagItem> = tags
        .into_iter()
        .filter(|tag| milestone_tag_ids.contains(&tag.id))
        .filter(|tag| tag.name.starts_with("milestone/"))
        .collect();

    json_success_response(milestones)
}

pub(crate) async fn v1_session_snapshot(
    Path(id): Path<String>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
) -> Response {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return unauthorized_response();
    }

    let Some(path) = (match find_session_path_by_id(&app_state, &id).await {
        Ok(value) => value,
        Err(error) => return json_error_response(StatusCode::INTERNAL_SERVER_ERROR, error),
    }) else {
        return json_error_response(StatusCode::NOT_FOUND, "Session not found");
    };

    let entries_value =
        match dispatch_json(&app_state, "get_session_entries", json!({ "path": path })).await {
            Ok(value) => value,
            Err(error) => return json_error_response(StatusCode::INTERNAL_SERVER_ERROR, error),
        };
    let entries: Vec<SessionEntry> = serde_json::from_value(entries_value).unwrap_or_default();

    let mut user_count = 0usize;
    let mut assistant_count = 0usize;
    let mut tool_count = 0usize;
    let mut recent = Vec::new();

    for entry in &entries {
        if entry.entry_type != "message" {
            continue;
        }
        if let Some(message) = &entry.message {
            match message.role.as_str() {
                "user" => user_count += 1,
                "assistant" => assistant_count += 1,
                "toolResult" => tool_count += 1,
                _ => {}
            }
        }
    }

    for entry in entries.iter().rev().take(5).rev() {
        let text = entry
            .message
            .as_ref()
            .and_then(|message| message.content.first())
            .and_then(|content| content.text.clone())
            .unwrap_or_default();
        let role = entry
            .message
            .as_ref()
            .map(|message| message.role.clone())
            .unwrap_or_default();
        recent.push(json!({
            "entry_id": entry.id,
            "type": entry.entry_type,
            "role": role,
            "timestamp": entry.timestamp,
            "text": text,
        }));
    }

    json_success_response(json!({
        "session_id": id,
        "entry_count": entries.len(),
        "message_stats": {
            "user": user_count,
            "assistant": assistant_count,
            "toolResult": tool_count,
        },
        "recent": recent,
    }))
}

pub(crate) async fn v1_checkout_session(
    Path(id): Path<String>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
    Json(req): Json<CheckoutRequest>,
) -> Response {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return unauthorized_response();
    }
    if req.target_value.trim().is_empty() {
        return json_error_response(StatusCode::BAD_REQUEST, "target_value is required");
    }

    let Some(path) = (match find_session_path_by_id(&app_state, &id).await {
        Ok(value) => value,
        Err(error) => return json_error_response(StatusCode::INTERNAL_SERVER_ERROR, error),
    }) else {
        return json_error_response(StatusCode::NOT_FOUND, "Session not found");
    };

    let entries_value =
        match dispatch_json(&app_state, "get_session_entries", json!({ "path": path })).await {
            Ok(value) => value,
            Err(error) => return json_error_response(StatusCode::INTERNAL_SERVER_ERROR, error),
        };
    let entries: Vec<SessionEntry> = serde_json::from_value(entries_value).unwrap_or_default();
    if entries.is_empty() {
        return json_error_response(StatusCode::BAD_REQUEST, "Session has no entries");
    }

    let target_idx = match req.target_type.as_str() {
        "position" => match req.target_value.parse::<usize>() {
            Ok(value) if value < entries.len() => value,
            _ => {
                return json_error_response(
                    StatusCode::BAD_REQUEST,
                    format!("Invalid position: {}", req.target_value),
                );
            }
        },
        _ => match entries
            .iter()
            .position(|entry| entry.id == req.target_value)
        {
            Some(value) => value,
            None => {
                return json_error_response(
                    StatusCode::BAD_REQUEST,
                    format!("Target entry not found: {}", req.target_value),
                );
            }
        },
    };

    let kept_entries = &entries[..=target_idx];
    let preview_messages: Vec<Value> = kept_entries
        .iter()
        .rev()
        .take(6)
        .rev()
        .map(|entry| {
            let role = entry
                .message
                .as_ref()
                .map(|message| message.role.clone())
                .unwrap_or_else(|| "system".to_string());
            let text = entry
                .message
                .as_ref()
                .and_then(|message| {
                    message
                        .content
                        .iter()
                        .find_map(|content| content.text.clone())
                })
                .unwrap_or_default();
            json!({
                "entry_id": entry.id,
                "role": role,
                "timestamp": entry.timestamp,
                "text": text,
            })
        })
        .collect();

    let strategy = req.strategy.unwrap_or_else(|| "preview".to_string());
    if strategy == "reset" || strategy == "squash" {
        return json_error_response(
            StatusCode::FORBIDDEN,
            "Read-only mode: checkout apply is disabled, use strategy=preview",
        );
    }

    let checkout_id = format!("chk-{}", chrono::Utc::now().timestamp_millis());
    json_success_response(json!({
        "checkout_id": checkout_id,
        "session_id": id,
        "strategy": strategy,
        "target": {
            "type": req.target_type,
            "value": req.target_value,
            "resolved_index": target_idx,
        },
        "carryover_message": req.carryover_message,
        "result": {
            "previous_length": entries.len(),
            "new_length": kept_entries.len(),
            "messages_removed": entries.len().saturating_sub(kept_entries.len()),
            "apply_mode": "preview_only",
        },
        "preview": {
            "recent": preview_messages,
        }
    }))
}
