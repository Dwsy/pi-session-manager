use std::sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex};
use tauri::{AppHandle, Emitter, Runtime};

#[derive(Clone, Default)]
pub struct DeepLinkState {
    frontend_ready: Arc<AtomicBool>,
    pending_urls: Arc<Mutex<Vec<String>>>,
}

impl DeepLinkState {
    pub fn new() -> Self {
        Self::default()
    }
}

pub fn handle_deep_link_payload<R: Runtime>(app: &AppHandle<R>, state: &DeepLinkState, payload: &str) {
    crate::tray::show_or_create_window(app);
    for url in parse_deep_link_payload(payload) {
        emit_or_queue(app, state, url);
    }
}

pub fn mark_frontend_ready<R: Runtime>(app: &AppHandle<R>, state: &DeepLinkState) {
    state.frontend_ready.store(true, Ordering::SeqCst);
    let urls = match state.pending_urls.lock() {
        Ok(mut pending) => pending.drain(..).collect::<Vec<_>>(),
        Err(error) => {
            log::warn!("Failed to drain pending deep links: {error}");
            Vec::new()
        }
    };

    for url in urls {
        let _ = app.emit("deep-link://navigate", url);
    }
}

fn emit_or_queue<R: Runtime>(app: &AppHandle<R>, state: &DeepLinkState, url: String) {
    if state.frontend_ready.load(Ordering::SeqCst) {
        let _ = app.emit("deep-link://navigate", url);
        return;
    }

    match state.pending_urls.lock() {
        Ok(mut pending) => pending.push(url),
        Err(error) => log::warn!("Failed to queue pending deep link: {error}"),
    }
}

fn parse_deep_link_payload(payload: &str) -> Vec<String> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(payload) else {
        return Vec::new();
    };

    if let Some(arr) = value.as_array() {
        return arr.iter().filter_map(|url| url.as_str().map(str::to_string)).collect();
    }

    value.as_str().map(|url| vec![url.to_string()]).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::parse_deep_link_payload;

    #[test]
    fn parses_single_url_payload() {
        assert_eq!(parse_deep_link_payload("\"pi-session://kanban\""), vec!["pi-session://kanban"]);
    }

    #[test]
    fn parses_url_array_payload() {
        assert_eq!(parse_deep_link_payload("[\"pi-session://kanban\",\"pi-session://settings\"]"), vec!["pi-session://kanban", "pi-session://settings"]);
    }
}
