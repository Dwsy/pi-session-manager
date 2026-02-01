pub mod commands;
pub mod config;
pub mod export;
pub mod file_watcher;
pub mod models;
pub mod scanner;
pub mod scanner_scheduler;
pub mod search;
mod session_parser;
mod sqlite_cache;
mod stats;
mod tantivy_search;

pub use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_sessions,
            read_session_file,
            read_session_file_incremental,
            get_file_stats,
            get_session_entries,
            search_sessions,
            search_sessions_fts,
            delete_session,
            export_session,
            rename_session,
            get_session_stats,
            open_session_in_browser,
            open_session_in_terminal,
            scan_skills,
            scan_prompts,
            get_skill_content,
            get_prompt_content,
            get_system_prompt,
            load_pi_settings,
            save_pi_settings,
            list_models,
            test_model,
            test_models_batch,
            load_app_settings,
            save_app_settings,
            add_favorite,
            remove_favorite,
            get_all_favorites,
            is_favorite,
            toggle_favorite
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}