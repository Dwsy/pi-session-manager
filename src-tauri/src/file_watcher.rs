use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use std::path::PathBuf;
use std::sync::mpsc::channel;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tracing::{error, info};

use crate::scanner;

/// 启动文件监听器
pub fn start_file_watcher(sessions_dir: PathBuf, app_handle: AppHandle) -> Result<(), String> {
    info!("Starting file watcher for: {:?}", sessions_dir);

    // 创建事件通道
    let (tx, rx) = channel();

    // 创建防抖动的监听器（1秒防抖）
    let mut debouncer = new_debouncer(
        Duration::from_secs(1),
        None,
        move |result: DebounceEventResult| {
            if let Err(e) = tx.send(result) {
                error!("Failed to send file event: {:?}", e);
            }
        },
    )
    .map_err(|e| format!("Failed to create file watcher: {}", e))?;

    // 监听 sessions 目录
    debouncer
        .watcher()
        .watch(&sessions_dir, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch directory: {}", e))?;

    info!("File watcher started successfully");

    // 启动后台线程处理文件事件
    std::thread::spawn(move || {
        while let Ok(result) = rx.recv() {
            match result {
                Ok(events) => {
                    // 检查是否有 .jsonl 文件变化
                    let has_jsonl_changes = events.iter().any(|event| {
                        event.paths.iter().any(|path| {
                            path.extension()
                                .map(|ext| ext == "jsonl")
                                .unwrap_or(false)
                        })
                    });

                    if has_jsonl_changes {
                        info!("Detected .jsonl file changes, notifying frontend...");
                        
                        // 发送事件到前端
                        if let Err(e) = app_handle.emit("sessions-changed", ()) {
                            error!("Failed to emit event: {}", e);
                        }
                    }
                }
                Err(errors) => {
                    for error in errors {
                        error!("File watcher error: {:?}", error);
                    }
                }
            }
        }
    });

    // 将 debouncer 泄漏到静态生命周期，保持运行
    Box::leak(Box::new(debouncer));

    Ok(())
}
