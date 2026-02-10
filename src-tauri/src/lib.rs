pub mod app_state;
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
pub mod stats;
mod tantivy_search;
pub mod ws_adapter;
mod write_buffer;

pub use commands::*;
use tauri::Listener;

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
            toggle_favorite,
            toggle_devtools
        ])
        .setup(|app| {
            // 启动定期刷新缓冲的任务
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(10));
                loop {
                    interval.tick().await;
                    if let Some((sessions, details)) = write_buffer::check_and_take_flush_data() {
                        let sessions_count = sessions.len();
                        let details_count = details.len();
                        if let Ok(conn) = sqlite_cache::init_db() {
                            for entry in sessions {
                                let _ = sqlite_cache::upsert_session(&conn, &entry.session, entry.file_modified);
                            }
                            for entry in details {
                                let _ = sqlite_cache::upsert_session_details_cache(
                                    &conn,
                                    &entry.path,
                                    entry.file_modified,
                                    &entry.details,
                                );
                            }
                            log::trace!("Flushed {} sessions and {} details to database", sessions_count, details_count);
                        }
                    }
                }
            });

            // 应用退出时强制刷新
            let app_handle_clone = app.handle().clone();
            app_handle_clone.listen("tauri://exit", |_| {
                if let Some((sessions, details)) = write_buffer::force_flush_all() {
                    if let Ok(conn) = sqlite_cache::init_db() {
                        for entry in sessions {
                            let _ = sqlite_cache::upsert_session(&conn, &entry.session, entry.file_modified);
                        }
                        for entry in details {
                            let _ = sqlite_cache::upsert_session_details_cache(
                                &conn,
                                &entry.path,
                                entry.file_modified,
                                &entry.details,
                            );
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}