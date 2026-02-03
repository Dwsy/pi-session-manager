use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use std::path::PathBuf;
use std::sync::mpsc::{channel, Receiver};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tracing::{error, info};

/// 启动文件监听器
pub fn start_file_watcher(sessions_dir: PathBuf, app_handle: AppHandle) -> Result<(), String> {
    info!("Starting file watcher for: {:?}", sessions_dir);

    // 创建事件通道
    let (tx, rx) = channel();

    // 创建防抖动的监听器（3秒防抖，合并多次变化）
    let debouncer = new_debouncer(
        Duration::from_secs(3),
        None,
        move |result: DebounceEventResult| {
            if let Err(e) = tx.send(result) {
                error!("Failed to send file event: {:?}", e);
            }
        },
    )
    .map_err(|e| format!("Failed to create file watcher: {}", e))?;

    // 监听 sessions 目录
    let mut debouncer_guard = debouncer;
    debouncer_guard
        .watcher()
        .watch(&sessions_dir, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch directory: {}", e))?;

    info!("File watcher started successfully (3s debounce + batch merge)");

    // 使用 Arc<Mutex> 管理 debouncer 生命周期，避免内存泄漏
    let debouncer_arc = Arc::new(Mutex::new(debouncer_guard));

    // 克隆 app_handle 用于线程
    let app_handle_for_thread = app_handle.clone();

    // 启动后台线程处理文件事件（带批量合并）
    let debouncer_for_thread = Arc::clone(&debouncer_arc);
    std::thread::spawn(move || {
        // 保持 debouncer 引用存活，直到线程结束
        let _debouncer = debouncer_for_thread;
        process_events_with_merge(rx, app_handle_for_thread);
    });

    // 将 Arc 存储到 Tauri 应用状态中以保持生命周期
    app_handle.manage(debouncer_arc);

    Ok(())
}

/// 处理文件事件，带批量合并逻辑
fn process_events_with_merge(rx: Receiver<DebounceEventResult>, app_handle: AppHandle) {
    let mut last_notification = Instant::now();
    let min_interval = Duration::from_secs(5); // 最小通知间隔 5 秒
    let mut pending_notification = false;

    loop {
        // 尝试接收事件，带超时
        let result = rx.recv_timeout(Duration::from_secs(1));

        match result {
            Ok(event_result) => {
                match event_result {
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
                            info!("Detected .jsonl file changes (batching...)");
                            pending_notification = true;
                        }
                    }
                    Err(errors) => {
                        for error in errors {
                            error!("File watcher error: {:?}", error);
                        }
                    }
                }
            }
            Err(_) => {
                // 超时，检查是否需要发送通知
            }
        }

        // 检查是否应该发送通知
        if pending_notification {
            let elapsed = last_notification.elapsed();
            if elapsed >= min_interval {
                info!("Sending batched notification to frontend (after {:?})", elapsed);
                
                if let Err(e) = app_handle.emit("sessions-changed", ()) {
                    error!("Failed to emit event: {}", e);
                } else {
                    last_notification = Instant::now();
                    pending_notification = false;
                }
            }
        }
    }
}
