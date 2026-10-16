/* 启动器流程（阶段 2）：把 electron/main.js 里 createWindow 的后半段搬到 Rust
   顺序：splashDone → 优先缓存(priority) → 幻灯片(slides) → 其它缓存(other) → 清理 → 校验(verify)
        → 失败补下 → ready（主菜单按钮出现）
   进度事件通过 fgexpig://launcher 事件转发给启动器页面（与 Electron 的 launcher 消息同形）。 */
use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

type Waiter = Arc<(Mutex<bool>, Condvar)>;

static WAITERS: OnceLock<Mutex<HashMap<String, Waiter>>> = OnceLock::new();

fn waiters() -> &'static Mutex<HashMap<String, Waiter>> {
    WAITERS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn register(op: &str) -> Waiter {
    let waiter: Waiter = Arc::new((Mutex::new(false), Condvar::new()));
    waiters().lock().unwrap().insert(op.to_string(), Arc::clone(&waiter));
    waiter
}

fn signal(op: &str) {
    if let Some(waiter) = waiters().lock().unwrap().get(op).cloned() {
        let (lock, cvar) = &*waiter;
        *lock.lock().unwrap() = true;
        cvar.notify_all();
    }
}

fn wait_for(op: &str, timeout: Duration) -> bool {
    let waiter = waiters().lock().unwrap().get(op).cloned();
    match waiter {
        Some(w) => {
            let (lock, cvar) = &*w;
            let guard = lock.lock().unwrap();
            let (guard, _) = cvar
                .wait_timeout_while(guard, timeout, |done| !*done)
                .unwrap();
            let ok = *guard;
            drop(guard);
            waiters().lock().unwrap().remove(op);
            ok
        }
        None => false,
    }
}

/// 处理 sidecar 的一行事件：转发给前端并唤醒对应等待者
pub fn handle_line(app: &AppHandle, line: &str, local_base: &str) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return;
    }
    let event: Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => return,
    };
    let kind = event.get("ev").and_then(|v| v.as_str()).unwrap_or("");
    match kind {
        "progress" => {
            let phase = event.get("phase").and_then(|v| v.as_str()).unwrap_or("");
            let payload = if phase == "verify" {
                serde_json::json!({
                    "type": "verify",
                    "current": event.get("current").cloned().unwrap_or(Value::Null),
                    "total": event.get("target").cloned().unwrap_or(Value::Null),
                })
            } else {
                let current = event.get("current").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let target = event.get("target").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let percent = if target > 0.0 { current / target * 100.0 } else { 100.0 };
                let stage = if event.get("op").and_then(|v| v.as_str()) == Some("sync_priority") || priority_stage() {
                    "priority"
                } else {
                    "other"
                };
                serde_json::json!({ "type": stage, "percent": percent })
            };
            let _ = app.emit("fgexpig://launcher", payload);
        }
        "sync_done" => {
            if let Some(op) = event.get("op").and_then(|v| v.as_str()) {
                if op == "sync_priority" {
                    mark_priority_done();
                }
                signal(op);
            }
        }
        "verify_done" => {
            let failed: Vec<String> = event
                .get("failed")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();
            record_failed(failed);
            signal("verify");
        }
        "pruned" => signal("prune"),
        "wallpapers" => {
            let raw = event.get("list").cloned().unwrap_or(Value::Array(vec![]));
            // sidecar 给出的是线上 URL；幻灯片必须走本地服务（缓存里已有的壁纸）
            let local_base = local_base.trim_end_matches('/').to_string();
            let list: Vec<Value> = raw
                .as_array()
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_str())
                        .map(|url| {
                            let path = match url.find("://") {
                                Some(i) => match url[i + 3..].find('/') {
                                    Some(j) => &url[i + 3 + j..],
                                    None => "/",
                                },
                                None => url,
                            };
                            Value::String(format!("{}{}", local_base, path))
                        })
                        .collect()
                })
                .unwrap_or_default();
            eprintln!("[shell] wallpapers = {} (local)", list.len());
            // 记下来：resume 回主菜单时要补发（见 main.rs 的 launcher_listener_ready）
            if let Some(state) = app.try_state::<crate::AppState>() {
                *state.slides.lock().unwrap() = Some(Value::Array(list.clone()));
            }
            let _ = app.emit("fgexpig://launcher", serde_json::json!({ "type": "slides", "wallpapers": list }));
            signal("wallpapers");
        }
        "error" => {
            if let Some(op) = event.get("op").and_then(|v| v.as_str()) {
                eprintln!("[shell] sidecar error ({}): {}", op, event.get("message").cloned().unwrap_or(Value::Null));
                signal(op);
            }
        }
        "ready" => {}
        _ => {}
    }
}

// 「当前是否处于优先缓存阶段」：progress 事件里没有 op 字段，用一个共享标志区分阶段
static PRIORITY_STAGE: OnceLock<Mutex<bool>> = OnceLock::new();

fn priority_flag() -> &'static Mutex<bool> {
    PRIORITY_STAGE.get_or_init(|| Mutex::new(true))
}

fn priority_stage() -> bool {
    *priority_flag().lock().unwrap()
}

fn mark_priority_done() {
    *priority_flag().lock().unwrap() = false;
}

/// 完整启动流程（在后台线程里执行）
pub fn drive<F>(app: AppHandle, send: F)
where
    F: Fn(Value) + Send + 'static,
{
    std::thread::spawn(move || {
        eprintln!("[shell] drive: start");
        // 1) 优先缓存：所有壁纸 + 启动视频
        *priority_flag().lock().unwrap() = true;
        let _ = register("sync_priority");
        send(serde_json::json!({ "cmd": "sync_priority" }));
        let ok = wait_for("sync_priority", Duration::from_secs(30 * 60));
        eprintln!("[shell] drive: sync_priority done = {}", ok);

        // 2) 幻灯片壁纸列表
        let _ = register("wallpapers");
        send(serde_json::json!({ "cmd": "wallpapers" }));
        let ok = wait_for("wallpapers", Duration::from_secs(30));
        eprintln!("[shell] drive: wallpapers done = {}", ok);

        // 3) 其它缓存 + 清理
        let _ = register("sync_other");
        send(serde_json::json!({ "cmd": "sync_other" }));
        let ok = wait_for("sync_other", Duration::from_secs(60 * 60));
        eprintln!("[shell] drive: sync_other done = {}", ok);

        let _ = register("prune");
        send(serde_json::json!({ "cmd": "prune" }));
        wait_for("prune", Duration::from_secs(10 * 60));

        // 4) 校验（失败的重下再校验一次）
        let failed = verify_once(&send);
        eprintln!("[shell] drive: verify failed = {}", failed.len());
        if !failed.is_empty() {
            let _ = register("sync_paths");
            send(serde_json::json!({ "cmd": "sync_paths", "paths": failed }));
            wait_for("sync_paths", Duration::from_secs(60 * 60));
            let _ = verify_once(&send);
        }

        // 5) 主菜单
        eprintln!("[shell] drive: emit ready");
        let _ = app.emit("fgexpig://launcher", serde_json::json!({ "type": "ready" }));
    });
}

static LAST_FAILED: OnceLock<Mutex<Vec<String>>> = OnceLock::new();

fn failed_slot() -> &'static Mutex<Vec<String>> {
    LAST_FAILED.get_or_init(|| Mutex::new(Vec::new()))
}

/// 记录 verify_done 里的失败列表（handle_line 里解析）
pub fn record_failed(paths: Vec<String>) {
    *failed_slot().lock().unwrap() = paths;
}

fn verify_once<F>(send: &F) -> Vec<String>
where
    F: Fn(Value),
{
    let _ = register("verify");
    send(serde_json::json!({ "cmd": "verify" }));
    wait_for("verify", Duration::from_secs(60 * 60));
    failed_slot().lock().unwrap().clone()
}
