pub mod cli_common;
pub mod commands;
pub mod core;
pub mod data;
#[cfg(feature = "gui")]
pub mod deep_link;
pub mod domain;
pub mod paths;
pub mod server;
pub mod types;
pub mod utils;

// Infrastructure (stay at root)
pub mod api_readonly;
pub mod auth;
pub mod compression;
pub mod config;
pub mod dispatch;
pub mod export;
pub mod metrics;
pub mod settings_store;
pub mod stats;
pub mod subagent;
pub mod unified_config;

// GUI-only
#[cfg(feature = "gui")]
pub mod app_state;
#[cfg(feature = "gui")]
pub mod file_watcher;
#[cfg(feature = "gui")]
pub mod macos_dock;
#[cfg(feature = "gui")]
pub mod pi_agent_registry;
#[cfg(feature = "gui")]
pub mod terminal;
#[cfg(feature = "gui")]
pub mod tray;
#[cfg(feature = "gui")]
pub use macos_dock::update_macos_dock_recent_sessions;

// Window dimension constants and helpers (shared between main.rs and tray.rs)
pub const DEFAULT_WINDOW_WIDTH: f64 = 1400.0;
pub const DEFAULT_WINDOW_HEIGHT: f64 = 900.0;
pub const DEFAULT_MIN_WINDOW_WIDTH: f64 = 1000.0;
pub const DEFAULT_MIN_WINDOW_HEIGHT: f64 = 600.0;

pub fn clamp_window_dimensions(available_width: f64, available_height: f64) -> ((f64, f64), (f64, f64)) {
    let initial_width = DEFAULT_WINDOW_WIDTH.min(available_width).max(1.0);
    let initial_height = DEFAULT_WINDOW_HEIGHT.min(available_height).max(1.0);
    let min_width = DEFAULT_MIN_WINDOW_WIDTH.min(initial_width);
    let min_height = DEFAULT_MIN_WINDOW_HEIGHT.min(initial_height);
    ((initial_width, initial_height), (min_width, min_height))
}

#[cfg(feature = "gui")]
pub fn resolve_window_dimensions(monitor: Option<&tauri::Monitor>) -> ((f64, f64), (f64, f64)) {
    monitor.map_or(((DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT), (DEFAULT_MIN_WINDOW_WIDTH, DEFAULT_MIN_WINDOW_HEIGHT)), |monitor| {
        let work_area = monitor.work_area();
        let scale_factor = monitor.scale_factor();
        clamp_window_dimensions(f64::from(work_area.size.width) / scale_factor, f64::from(work_area.size.height) / scale_factor)
    })
}

// Backward-compat re-exports
pub use commands::*;
pub use types::*;

// Module aliases for external consumers (main.rs, src-tauri-cli, etc.)
pub use core::delete as session_delete;
pub use core::intel as session_intel;
pub use core::parser as session_parser;
pub use core::scanner;
pub use core::write_buffer;
pub mod scanner_scheduler {
    pub use crate::core::scanner::ScannerScheduler;
}
pub use data::search::client as search;
pub use data::search::embedding as embedding_service;
pub use data::search::index as search_index;
pub use data::sqlite as sqlite_cache;
#[cfg(feature = "gui")]
pub use server::http as http_adapter;
#[cfg(feature = "gui")]
pub use server::ws as ws_adapter;

#[cfg(feature = "gui")]
mod app;
#[cfg(feature = "gui")]
pub use app::run;
