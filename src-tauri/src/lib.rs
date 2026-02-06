pub mod app_state;
pub mod commands;
pub mod config;
pub mod export;
pub mod file_watcher;
pub mod models;
pub mod pi_rpc;
pub mod scanner;
pub mod scanner_scheduler;
pub mod search;
pub mod services;
mod session_parser;
mod sqlite_cache;
pub mod stats;
mod tantivy_search;
pub mod ws_adapter;

pub use commands::*;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize RPC client state
            let rpc_client = pi_rpc::create_shared_client();
            let rpc_pool = pi_rpc::create_rpc_pool();
            app.manage(rpc_client.clone());
            app.manage(rpc_pool);

            // Create shared app state for WebSocket adapter
            let app_handle = app.handle().clone();
            let app_state = app_state::create_app_state(rpc_client, app_handle.clone());

            // Initialize WebSocket adapter for dual-channel support
            tauri::async_runtime::spawn(async move {
                if let Err(e) = ws_adapter::init_ws_adapter(app_state, 52130).await {
                    eprintln!("Failed to init WebSocket adapter: {}", e);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_sessions,
            read_session_file,
            read_session_file_incremental,
            get_file_completions,
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
            toggle_devtools,
            open_external_url,
            // RPC commands
            detect_pi_rpc_support,
            start_pi_rpc,
            stop_pi_rpc,
            restart_pi_rpc,
            get_rpc_status,
            send_prompt,
            send_follow_up,
            send_steer,
            send_abort,
            cycle_rpc_model,
            set_rpc_thinking_level,
            cycle_rpc_thinking_level,
            compact_rpc_session,
            set_rpc_auto_compaction,
            send_rpc_bash,
            abort_rpc_bash,
            switch_session_rpc,
            get_rpc_messages,
            get_rpc_cached_messages,
            sync_rpc_session_cache,
            get_rpc_state,
            get_rpc_available_models,
            get_rpc_session_stats,
            get_rpc_commands,
            set_rpc_model,
            new_rpc_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
