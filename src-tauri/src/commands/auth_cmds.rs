use crate::auth;

#[tauri::command]
pub async fn list_api_keys() -> Result<Vec<auth::TokenInfo>, String> {
    auth::list_tokens()
}

#[tauri::command]
pub async fn create_api_key(name: String) -> Result<String, String> {
    auth::create_token(&name)
}

#[tauri::command]
pub async fn revoke_api_key(key_preview: String) -> Result<(), String> {
    auth::revoke_token(&key_preview)
}
