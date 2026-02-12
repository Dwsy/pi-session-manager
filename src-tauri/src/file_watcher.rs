use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::mpsc::{channel, Receiver};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tracing::{error, info, warn};

/// File watcher state that can be managed by Tauri
pub struct FileWatcherState {
    watcher: Arc<Mutex<Option<FileWatcher>>>,
}

impl FileWatcherState {
    pub fn new() -> Self {
        Self {
            watcher: Arc::new(Mutex::new(None)),
        }
    }

    /// Start or restart the file watcher with new paths
    pub fn restart(&self, paths: Vec<PathBuf>, app_handle: AppHandle) -> Result<(), String> {
        let mut guard = self.watcher.lock().map_err(|e| e.to_string())?;

        // Stop existing watcher if any (drop old watcher)
        *guard = None;

        // Create new watcher
        let watcher = FileWatcher::new(paths, app_handle)?;
        *guard = Some(watcher);

        Ok(())
    }
}

impl Default for FileWatcherState {
    fn default() -> Self {
        Self::new()
    }
}

/// Multi-path file watcher with debouncing
pub struct FileWatcher {
    _debouncer: Arc<Mutex<Debouncer<RecommendedWatcher, FileIdMap>>>,
}

impl FileWatcher {
    pub fn new(paths: Vec<PathBuf>, app_handle: AppHandle) -> Result<Self, String> {
        if paths.is_empty() {
            return Err("No paths to watch".to_string());
        }

        // Filter existing paths and deduplicate
        let unique_paths: Vec<PathBuf> = paths
            .into_iter()
            .filter(|p| p.exists())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();

        if unique_paths.is_empty() {
            warn!("No existing session directories to watch");
            return Err("No existing paths to watch".to_string());
        }

        info!("Starting file watcher for {} directories:", unique_paths.len());
        for path in &unique_paths {
            info!("  - {:?}", path);
        }

        // Create event channel
        let (tx, rx) = channel();

        // Create debounced watcher (3 second debounce)
        let debouncer = new_debouncer(
            Duration::from_secs(3),
            None,
            move |result: DebounceEventResult| {
                if let Err(e) = tx.send(result) {
                    error!("Failed to send file event: {:?}", e);
                }
            },
        )
        .map_err(|e| format!("Failed to create file watcher: {e}"))?;

        let mut debouncer_guard = debouncer;

        // Watch all paths
        for path in &unique_paths {
            if let Err(e) = debouncer_guard
                .watcher()
                .watch(path, RecursiveMode::Recursive)
            {
                error!("Failed to watch directory {:?}: {}", path, e);
            }
        }

        info!(
            "File watcher started successfully (3s debounce + batch merge) for {} dirs",
            unique_paths.len()
        );

        // Keep debouncer alive
        let debouncer_arc = Arc::new(Mutex::new(debouncer_guard));
        let debouncer_for_thread = Arc::clone(&debouncer_arc);
        let app_handle_for_thread = app_handle.clone();

        // Start event processing thread
        std::thread::spawn(move || {
            let _debouncer = debouncer_for_thread;
            process_events_with_merge(rx, app_handle_for_thread);
        });

        Ok(Self {
            _debouncer: debouncer_arc,
        })
    }
}

/// Legacy function for single path - starts a watcher for one directory
pub fn start_file_watcher(sessions_dir: PathBuf, app_handle: AppHandle) -> Result<(), String> {
    FileWatcher::new(vec![sessions_dir], app_handle)?;
    Ok(())
}

/// Start watcher for all configured session directories
pub fn start_watcher_for_all_dirs(app_handle: AppHandle) -> Result<FileWatcherState, String> {
    let state = FileWatcherState::new();

    let config = crate::config::load_config().unwrap_or_default();
    let all_dirs = crate::scanner::get_all_session_dirs(&config);

    state.restart(all_dirs, app_handle)?;

    Ok(state)
}

/// Restart watcher when config changes (call this after saving session_paths)
pub fn restart_watcher_with_config(
    watcher_state: &FileWatcherState,
    app_handle: AppHandle,
) -> Result<(), String> {
    let config = crate::config::load_config().unwrap_or_default();
    let all_dirs = crate::scanner::get_all_session_dirs(&config);

    info!("Restarting file watcher with {} directories", all_dirs.len());
    watcher_state.restart(all_dirs, app_handle)?;

    Ok(())
}

/// Process file events with batch merging
fn process_events_with_merge(rx: Receiver<DebounceEventResult>, app_handle: AppHandle) {
    let mut last_notification = Instant::now();
    let min_interval = Duration::from_secs(5);
    let mut pending_notification = false;

    loop {
        let result = rx.recv_timeout(Duration::from_secs(1));

        match result {
            Ok(event_result) => match event_result {
                Ok(events) => {
                    let has_jsonl_changes = events.iter().any(|event| {
                        event.paths.iter().any(|path| {
                            path.extension()
                                .map(|ext| ext == "jsonl")
                                .unwrap_or(false)
                        })
                    });

                    if has_jsonl_changes {
                        info!("Detected .jsonl file changes (batching...)");
                        pending_notification = true;
                    }
                }
                Err(errors) => {
                    for error in errors {
                        error!("File watcher error: {:?}", error);
                    }
                }
            },
            Err(_) => {
                // Timeout, check if we should send notification
            }
        }

        if pending_notification && last_notification.elapsed() >= min_interval {
            info!("Sending batched notification to frontend");

            if let Err(e) = app_handle.emit("sessions-changed", ()) {
                error!("Failed to emit event: {}", e);
            } else {
                last_notification = Instant::now();
                pending_notification = false;
            }
        }
    }
}
