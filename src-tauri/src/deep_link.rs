use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{AppHandle, Emitter, Manager, Runtime};

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
    // Defer off the current call stack.
    //
    // On macOS, `RunEvent::Opened` runs while Tauri holds `manager.plugins` (non-reentrant).
    // The deep-link plugin emits `deep-link://new-url` from that hook; synchronous
    // `show_or_create_window` can re-enter `plugins.lock` via webview init and hang the UI.
    // Hop to a worker first so `run_on_main_thread` queues via the event-loop proxy
    // instead of running inline under the held plugins lock.
    let app = app.clone();
    let state = state.clone();
    let payload = payload.to_string();
    tauri::async_runtime::spawn(async move {
        let app_for_main = app.clone();
        let _ = app.run_on_main_thread(move || {
            handle_deep_link_payload_now(&app_for_main, &state, &payload);
        });
    });
}

fn handle_deep_link_payload_now<R: Runtime>(app: &AppHandle<R>, state: &DeepLinkState, payload: &str) {
    crate::tray::show_or_create_window(app);
    for url in parse_deep_link_payload(payload) {
        emit_or_queue(app, state, url);
    }
}

pub fn queue_current_deep_links<R: Runtime>(app: &AppHandle<R>, state: &DeepLinkState) {
    let Some(deep_link) = app.try_state::<tauri_plugin_deep_link::DeepLink<R>>() else {
        return;
    };

    match deep_link.get_current() {
        Ok(Some(urls)) => {
            for url in urls {
                emit_or_queue(app, state, url.to_string());
            }
        }
        Ok(None) => {}
        Err(error) => log::warn!("Failed to read current deep links: {error}"),
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
        Ok(mut pending) => {
            if !pending.contains(&url) {
                pending.push(url);
            }
        }
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
        assert_eq!(parse_deep_link_payload("\"pi-session://plugin-view\""), vec!["pi-session://plugin-view"]);
    }

    #[test]
    fn parses_url_array_payload() {
        assert_eq!(parse_deep_link_payload("[\"pi-session://plugin-view\",\"pi-session://settings\"]"), vec!["pi-session://plugin-view", "pi-session://settings"]);
    }
}
