use crate::auth;

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_api_keys() -> Result<Vec<auth::TokenInfo>, String> {
    auth::list_tokens()
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn create_api_key(
    name: Option<String>,
    key: Option<String>,
    value: Option<String>,
) -> Result<String, String> {
    let final_name = key
        .as_deref()
        .or(name.as_deref())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("unnamed")
        .to_string();

    match (key, value) {
        (Some(_), Some(v)) => auth::create_token(&final_name, Some(v.as_str())),
        (None, None) => auth::create_token(&final_name, None),
        _ => Err("Both key and value are required for manual key creation".to_string()),
    }
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn revoke_api_key(key_preview: String) -> Result<(), String> {
    auth::revoke_token(&key_preview)
}
