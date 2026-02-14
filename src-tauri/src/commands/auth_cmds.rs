use crate::auth;

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_api_keys() -> Result<Vec<auth::TokenInfo>, String> {
    auth::list_tokens()
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn create_api_key(name: String) -> Result<String, String> {
    auth::create_token(&name)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn revoke_api_key(key_preview: String) -> Result<(), String> {
    auth::revoke_token(&key_preview)
}
