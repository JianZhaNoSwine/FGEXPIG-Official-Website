/* FGEXPIG 桌面端（Tauri v2 壳，阶段 2）
   与 Electron 版对齐：
     - 同一个 userData 目录 %APPDATA%\fgexpig-desktop（site / desktop-settings.json / mapstats.json）
     - 分辨率 = 「能正好放下 N 张成就卡」的窗口尺寸（2 比例 × 5 档）
     - 资源同步/校验/清理/静态服务全部交给 sidecar（fgexpig-desktop）
     - 前端通过初始化脚本拿到与 Electron preload 完全一致的 window.FGEXPIG_DESKTOP
   未完成（下一步）：启动器（launcher.html + 幻灯片/进度）、NSIS 安装包、状态全量文件化。 */
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

mod launcher;

// ---------- 常量（与 electron/main.js 一致） ----------
const ACHV_ITEM_HEIGHT: f64 = 58.0;
const SUBCARD_GAP: f64 = 10.0;
const MIN_ACHV_CARDS: i32 = 6;
const MAX_ACHV_CARDS: i32 = 10;
const CARD_HEIGHT_MIN: f64 = 46.0;
const CARD_HEIGHT_MAX: f64 = 66.0;
const CARD_HEIGHT_VIEWPORT_RATIO: f64 = 0.076;
const ACHV_BODY_CHROME_HEIGHT: f64 = 255.0;
const DESKTOP_PORT: u16 = 37655;
const DEFAULT_BASE_URL: &str = "https://fgexpig.cc/";
const MAP_STATS_API: &str = "https://api2.fallguysdb.info/api/creative/";

#[derive(Serialize, Deserialize, Clone)]
struct AspectOption {
    id: String,
    ratio: f64,
    #[serde(default)]
    label: String,
}

fn aspect_options() -> Vec<AspectOption> {
    vec![
        AspectOption { id: "16:9".into(), ratio: 16.0 / 9.0, label: String::new() },
        AspectOption { id: "16:10".into(), ratio: 16.0 / 10.0, label: String::new() },
    ]
}

fn aspect_ratio(id: &str) -> f64 {
    aspect_options()
        .into_iter()
        .find(|a| a.id == id)
        .map(|a| a.ratio)
        .unwrap_or(16.0 / 9.0)
}

#[derive(Serialize, Deserialize, Clone, PartialEq)]
struct Resolution {
    width: i32,
    height: i32,
    #[serde(default)]
    aspect: String,
    #[serde(default)]
    cards: i32,
}

#[derive(Serialize, Deserialize, Default, Clone)]
struct DesktopSettings {
    #[serde(default = "default_aspect")]
    aspect: String,
    #[serde(default)]
    resolution: Option<Resolution>,
    #[serde(default)]
    quality: u32,
}

fn default_aspect() -> String {
    "16:9".into()
}

fn achv_body_target(cards: i32) -> f64 {
    cards as f64 * ACHV_ITEM_HEIGHT + (cards - 1) as f64 * SUBCARD_GAP
}

fn achv_body_height_for_viewport_height(viewport_height: f64) -> f64 {
    let card_height = (viewport_height * CARD_HEIGHT_VIEWPORT_RATIO)
        .clamp(CARD_HEIGHT_MIN, CARD_HEIGHT_MAX);
    viewport_height - card_height - ACHV_BODY_CHROME_HEIGHT
}

/// 能正好放下 cards 张卡片的窗口高度（对应 electron/main.js 的 cssViewportHeightForCards）
fn css_viewport_height_for_cards(cards: i32) -> f64 {
    let target = achv_body_target(cards);
    let mut viewport_height = (target + ACHV_BODY_CHROME_HEIGHT) / (1.0 - CARD_HEIGHT_VIEWPORT_RATIO);
    let ratio_min_height = CARD_HEIGHT_MIN / CARD_HEIGHT_VIEWPORT_RATIO;
    let ratio_max_height = CARD_HEIGHT_MAX / CARD_HEIGHT_VIEWPORT_RATIO;
    if viewport_height < ratio_min_height {
        viewport_height = target + ACHV_BODY_CHROME_HEIGHT + CARD_HEIGHT_MIN;
    } else if viewport_height > ratio_max_height {
        viewport_height = target + ACHV_BODY_CHROME_HEIGHT + CARD_HEIGHT_MAX;
    }
    let base = viewport_height.round();
    let mut best = base;
    let mut best_diff = f64::INFINITY;
    let mut candidate = base - 3.0;
    while candidate <= base + 3.0 {
        let diff = achv_body_height_for_viewport_height(candidate).round() - target;
        if diff >= 0.0 && diff < best_diff {
            best = candidate;
            best_diff = diff;
        }
        candidate += 1.0;
    }
    best
}

fn desktop_resolution_options(aspect_id: &str, scale: f64) -> Vec<Resolution> {
    let ratio = aspect_ratio(aspect_id);
    let scale = if scale > 0.0 { scale } else { 1.0 };
    let mut out = Vec::new();
    let mut cards = MAX_ACHV_CARDS;
    while cards >= MIN_ACHV_CARDS {
        let css_height = css_viewport_height_for_cards(cards);
        let physical_height = (css_height * scale).round() as i32;
        let physical_width = (physical_height as f64 * ratio).round() as i32;
        out.push(Resolution {
            width: physical_width,
            height: physical_height,
            aspect: aspect_id.to_string(),
            cards,
        });
        cards -= 1;
    }
    out
}

fn allowed_resolutions(aspect_id: &str, max_width: i32, max_height: i32, scale: f64) -> Vec<Resolution> {
    let all = desktop_resolution_options(aspect_id, scale);
    let list: Vec<Resolution> = all
        .iter()
        .filter(|item| item.width <= max_width && item.height <= max_height)
        .cloned()
        .collect();
    if list.is_empty() {
        vec![all[all.len() - 1].clone()]
    } else {
        list
    }
}

fn default_resolution_for_list(list: &[Resolution]) -> Resolution {
    list.iter()
        .find(|item| item.cards == 8)
        .cloned()
        .unwrap_or_else(|| list[0].clone())
}

fn selected_resolution(settings: &DesktopSettings, aspect_id: &str, max_w: i32, max_h: i32, scale: f64) -> Resolution {
    let list = allowed_resolutions(aspect_id, max_w, max_h, scale);
    if let Some(saved) = &settings.resolution {
        if let Some(found) = list
            .iter()
            .find(|item| item.width == saved.width && item.height == saved.height)
        {
            return found.clone();
        }
    }
    default_resolution_for_list(&list)
}

// ---------- 路径 ----------
fn app_data_dir() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    PathBuf::from(base).join("fgexpig-desktop")
}

fn site_root() -> PathBuf {
    app_data_dir().join("site")
}

fn settings_file() -> PathBuf {
    app_data_dir().join("desktop-settings.json")
}

fn mapstats_file() -> PathBuf {
    app_data_dir().join("mapstats.json")
}

fn read_settings() -> DesktopSettings {
    std::fs::read_to_string(settings_file())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn write_settings(settings: &DesktopSettings) {
    let _ = std::fs::create_dir_all(app_data_dir());
    if let Ok(text) = serde_json::to_string(settings) {
        let _ = std::fs::write(settings_file(), text);
    }
}

// ---------- 单实例：互斥体 + 心跳文件 ----------
// 只有互斥体不够：进程被强杀/异常退出时，内核对象可能被"幽灵进程"长时间占着，
// 此时新实例会静默什么都不做（用户看到"双击没反应"）。所以再配合一个心跳文件：
// 心跳新鲜 = 真有实例在跑；心跳过期 = 是遗留占用，照常启动。
fn heartbeat_file() -> PathBuf {
    app_data_dir().join(".alive")
}

fn heartbeat_fresh() -> bool {
    match std::fs::metadata(heartbeat_file()).and_then(|m| m.modified()) {
        Ok(time) => time
            .elapsed()
            .map(|d| d.as_secs() < 6)
            .unwrap_or(false),
        Err(_) => false,
    }
}

fn spawn_heartbeat() {
    std::thread::spawn(|| loop {
        let _ = std::fs::create_dir_all(app_data_dir());
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let _ = std::fs::write(heartbeat_file(), now.to_string());
        std::thread::sleep(std::time::Duration::from_secs(2));
    });
}

// ---------- 单实例（Windows 命名互斥体） ----------
#[cfg(windows)]
fn single_instance_ok() -> bool {
    const ERROR_ALREADY_EXISTS: u32 = 183;
    #[link(name = "kernel32")]
    extern "system" {
        fn CreateMutexW(attr: *const core::ffi::c_void, owner: i32, name: *const u16) -> *mut core::ffi::c_void;
        fn GetLastError() -> u32;
    }
    let name: Vec<u16> = "Local\\FGEXPIG.Desktop.SingleInstance"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        let handle = CreateMutexW(std::ptr::null(), 0, name.as_ptr());
        if handle.is_null() {
            return true;
        }
        GetLastError() != ERROR_ALREADY_EXISTS
    }
}

#[cfg(not(windows))]
fn single_instance_ok() -> bool {
    true
}

// ---------- sidecar ----------
struct Sidecar {
    child: Child,
    stdin: ChildStdin,
    reader: Option<BufReader<std::process::ChildStdout>>,
    port: u16,
    first_ready: bool,
    base_url: String,
    site_root: PathBuf,
}

impl Sidecar {
    fn binary_path() -> Option<PathBuf> {
        if let Ok(p) = std::env::var("FGEXPIG_SIDECAR") {
            let path = PathBuf::from(p);
            if path.is_file() {
                return Some(path);
            }
        }
        let mut candidates: Vec<PathBuf> = Vec::new();
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                candidates.push(dir.join("fgexpig-desktop.exe"));
            }
        }
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        if let Some(root) = manifest_dir.parent().and_then(|p| p.parent()) {
            candidates.push(root.join("tools").join("bin").join("fgexpig-desktop.exe"));
            candidates.push(root.join("rust").join("target").join("release").join("fgexpig-desktop.exe"));
        }
        candidates.into_iter().find(|p| p.is_file())
    }

    fn start(base_url: &str, site_root: PathBuf) -> Result<Sidecar, String> {
        let binary = Sidecar::binary_path().ok_or_else(|| "找不到 fgexpig-desktop.exe（sidecar）".to_string())?;
        let assets_dir = binary
            .parent()
            .map(|p| p.join("assets"))
            .unwrap_or_default()
            .display()
            .to_string();
        let mut command = Command::new(&binary);
        command
            .args([
                "serve",
                "--site-root",
                &site_root.display().to_string(),
                "--assets",
                &assets_dir,
                "--port",
                &DESKTOP_PORT.to_string(),
                "--parent-pid",
                &std::process::id().to_string(),
                "--base-url",
                base_url,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        let mut child = command
            .spawn()
            .map_err(|e| format!("sidecar 启动失败：{}", e))?;
        let stdout = child.stdout.take().ok_or_else(|| "sidecar 无 stdout".to_string())?;
        let stdin = child.stdin.take().ok_or_else(|| "sidecar 无 stdin".to_string())?;
        let mut reader = BufReader::new(stdout);
        let mut port: Option<u16> = None;
        let mut startup_error: Option<String> = None;
        for line in reader.by_ref().lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => break,
            };
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(event) = serde_json::from_str::<serde_json::Value>(trimmed) {
                match event.get("ev").and_then(|v| v.as_str()) {
                    Some("ready") => {
                        port = Some(
                            event
                                .get("port")
                                .and_then(|v| v.as_u64())
                                .map(|p| p as u16)
                                .unwrap_or(DESKTOP_PORT),
                        );
                        break;
                    }
                    // sidecar 起不来时（例如端口全被占用）会先报 error 再退出：
                    // 这里必须把它当成启动失败，否则壳会拿着一个死掉的服务继续跑，表现为永久卡在启动器。
                    Some("error") => {
                        let op = event.get("op").and_then(|v| v.as_str()).unwrap_or("serve");
                        let message = event
                            .get("message")
                            .and_then(|v| v.as_str())
                            .unwrap_or("未知错误");
                        startup_error = Some(format!("{}: {}", op, message));
                        break;
                    }
                    _ => {}
                }
            }
        }
        let port = match port {
            Some(p) => p,
            None => {
                let _ = child.kill();
                return Err(format!(
                    "sidecar 未能就绪：{}",
                    startup_error.unwrap_or_else(|| "sidecar 提前退出".to_string())
                ));
            }
        };
        Ok(Sidecar {
            child,
            stdin,
            reader: Some(reader),
            port,
            first_ready: true,
            base_url: base_url.to_string(),
            site_root,
        })
    }

    fn send(&mut self, command: serde_json::Value) -> bool {
        let line = command.to_string();
        writeln!(self.stdin, "{}", line).is_ok() && self.stdin.flush().is_ok()
    }

    fn url(&self) -> String {
        format!("http://127.0.0.1:{}/", self.port)
    }

    fn stop(&mut self) {
        let _ = self.send(serde_json::json!({ "cmd": "quit" }));
        let _ = self.child.kill();
    }
}

struct DisplayMetrics {
    scale: f64,
    max_width: i32,
    max_height: i32,
}

struct AppState {
    sidecar: Mutex<Option<Sidecar>>,
    settings: Mutex<DesktopSettings>,
    display: Mutex<DisplayMetrics>,
    site_url: String,
}

impl AppState {
    fn metrics(&self) -> (f64, i32, i32) {
        let d = self.display.lock().unwrap();
        (d.scale, d.max_width, d.max_height)
    }
}

// ---------- 命令 ----------
#[derive(Serialize)]
struct ResolutionState {
    aspects: Vec<AspectOption>,
    aspect: String,
    options: Vec<Resolution>,
    current: Resolution,
    max: MaxResolution,
}

#[derive(Serialize)]
struct MaxResolution {
    width: i32,
    height: i32,
    scale: f64,
}

fn resolution_state(state: &AppState) -> ResolutionState {
    let settings = state.settings.lock().unwrap().clone();
    let aspect = if settings.aspect.is_empty() { default_aspect() } else { settings.aspect.clone() };
    let (scale, max_w, max_h) = state.metrics();
    let options = allowed_resolutions(&aspect, max_w, max_h, scale);
    let current = selected_resolution(&settings, &aspect, max_w, max_h, scale);
    ResolutionState {
        aspects: aspect_options(),
        aspect,
        options,
        current,
        max: MaxResolution {
            width: max_w,
            height: max_h,
            scale,
        },
    }
}

#[tauri::command]
fn resolution_get(state: tauri::State<AppState>) -> ResolutionState {
    resolution_state(&state)
}

fn apply_window_size(window: &tauri::WebviewWindow, resolution: &Resolution, scale: f64) {
    let scale = if scale > 0.0 { scale } else { 1.0 };
    let width = ((resolution.width as f64) / scale).round().max(1.0);
    let height = ((resolution.height as f64) / scale).round().max(1.0);
    let _ = window.set_size(tauri::LogicalSize::new(width, height));
}

#[tauri::command]
fn resolution_set(value: Resolution, state: tauri::State<AppState>, window: tauri::WebviewWindow) -> ResolutionState {
    let (scale, max_w, max_h) = state.metrics();
    let options = allowed_resolutions(&state.settings.lock().unwrap().aspect.clone(), max_w, max_h, scale);
    let chosen = options
        .iter()
        .find(|item| item.width == value.width && item.height == value.height)
        .cloned()
        .unwrap_or_else(|| default_resolution_for_list(&options));
    {
        let mut settings = state.settings.lock().unwrap();
        settings.resolution = Some(chosen.clone());
        write_settings(&settings);
    }
    eprintln!("[shell] resolution_set -> {}x{} (scale {}, max {}x{})", chosen.width, chosen.height, scale, max_w, max_h);
    apply_window_size(&window, &chosen, scale);
    resolution_state(&state)
}

#[tauri::command]
fn aspect_set(value: String, state: tauri::State<AppState>, window: tauri::WebviewWindow) -> ResolutionState {
    let next_aspect = aspect_options()
        .into_iter()
        .find(|a| a.id == value)
        .map(|a| a.id)
        .unwrap_or_else(default_aspect);
    let (scale, max_w, max_h) = state.metrics();
    let list = allowed_resolutions(&next_aspect, max_w, max_h, scale);
    let previous_cards = state
        .settings
        .lock()
        .unwrap()
        .resolution
        .as_ref()
        .map(|r| r.cards)
        .unwrap_or(8);
    let chosen = list
        .iter()
        .find(|item| item.cards == previous_cards)
        .cloned()
        .unwrap_or_else(|| default_resolution_for_list(&list));
    {
        let mut settings = state.settings.lock().unwrap();
        settings.aspect = next_aspect.clone();
        settings.resolution = Some(chosen.clone());
        write_settings(&settings);
    }
    apply_window_size(&window, &chosen, scale);
    resolution_state(&state)
}

fn state_file() -> PathBuf {
    app_data_dir().join("state.json")
}

/// 前端 localStorage 的落盘镜像（登录态/设置/称号/语言……全部走这里）
/// 前端启动诊断：origin / 镜像 key 数 / 注入 key 数（排查"登录、设置丢失"）
#[tauri::command]
fn state_report(origin: String, href: String, keys: usize, mirrored: usize, injected: usize, mapcodes: usize) {
    eprintln!(
        "[shell] state: origin={} keys={} mirrored={} injected={} mapcodes={} ({})",
        origin, keys, mirrored, injected, mapcodes, href
    );
}

#[tauri::command]
fn state_load() -> String {
    std::fs::read_to_string(state_file()).unwrap_or_default()
}

#[tauri::command]
fn state_save(json: String) {
    let _ = std::fs::create_dir_all(app_data_dir());
    let _ = std::fs::write(state_file(), json);
}

#[tauri::command]
fn mapstats_store_get() -> String {
    std::fs::read_to_string(mapstats_file()).unwrap_or_default()
}

/// 地图数据是"只累加"的历史数据（站点只会新增/更新条目，从不删），
/// 一旦被一份更小的数据覆盖就永久损失。所以落盘时按并集合并：只增不减。
fn mapstat_codes(value: &serde_json::Value) -> usize {
    value
        .get("codes")
        .and_then(|c| c.as_object())
        .map(|c| c.len())
        .unwrap_or(0)
}

fn day_rank(text: &str) -> i64 {
    let mut parts = text.split('-');
    let y = parts.next().and_then(|v| v.parse::<i64>().ok()).unwrap_or(0);
    let m = parts.next().and_then(|v| v.parse::<i64>().ok()).unwrap_or(0);
    let d = parts.next().and_then(|v| v.parse::<i64>().ok()).unwrap_or(0);
    y * 10000 + m * 100 + d
}

fn merge_mapstats(old_text: &str, new_text: &str) -> String {
    let old: Option<serde_json::Value> = serde_json::from_str(old_text).ok();
    let new: Option<serde_json::Value> = serde_json::from_str(new_text).ok();
    let (old, new) = match (old, new) {
        (None, None) => return new_text.to_string(),
        (None, Some(n)) => return n.to_string(),
        (Some(o), None) => return o.to_string(),
        (Some(o), Some(n)) => (o, n),
    };

    let mut codes = old
        .get("codes")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    if let Some(new_codes) = new.get("codes").and_then(|v| v.as_object()) {
        for (code, record) in new_codes {
            let existing_at = codes
                .get(code)
                .and_then(|r| r.get("at"))
                .and_then(|a| a.as_f64())
                .unwrap_or(-1.0);
            let incoming_at = record.get("at").and_then(|a| a.as_f64()).unwrap_or(-1.0);
            if !codes.contains_key(code) || incoming_at >= existing_at {
                codes.insert(code.clone(), record.clone());
            }
        }
    }

    let mut days = old
        .get("days")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    if let Some(new_days) = new.get("days").and_then(|v| v.as_object()) {
        for (code, day) in new_days {
            let existing = days.get(code).and_then(|v| v.as_str()).unwrap_or("");
            let incoming = day.as_str().unwrap_or("");
            if !days.contains_key(code) || day_rank(incoming) > day_rank(existing) {
                days.insert(code.clone(), day.clone());
            }
        }
    }

    let resume_from_old = old.get("resumeAt").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let resume_from_new = new.get("resumeAt").and_then(|v| v.as_f64()).unwrap_or(0.0);

    serde_json::json!({
        "codes": codes,
        "days": days,
        "resumeAt": if resume_from_new > resume_from_old { resume_from_new } else { resume_from_old },
    })
    .to_string()
}

#[tauri::command]
fn mapstats_store_set(value: String) {
    let _ = std::fs::create_dir_all(app_data_dir());
    let old_text = std::fs::read_to_string(mapstats_file()).unwrap_or_default();
    let merged = merge_mapstats(&old_text, &value);
    let before = serde_json::from_str::<serde_json::Value>(&old_text)
        .map(|v| mapstat_codes(&v))
        .unwrap_or(0);
    let after = serde_json::from_str::<serde_json::Value>(&merged)
        .map(|v| mapstat_codes(&v))
        .unwrap_or(0);
    if after != before {
        eprintln!("[shell] mapstats: 地图条目 {} -> {}", before, after);
    }
    let _ = std::fs::write(mapstats_file(), &merged);
}

#[derive(Serialize)]
struct MapStatsPayload {
    status: u16,
    body: String,
    #[serde(rename = "retryAfterMs")]
    retry_after_ms: u64,
}

#[tauri::command]
fn mapstats_fetch(code: String) -> MapStatsPayload {
    let value = code.trim().to_string();
    let ok = value.len() == 14
        && value.chars().enumerate().all(|(i, c)| {
            if i == 4 || i == 9 {
                c == '-'
            } else {
                c.is_ascii_hexdigit()
            }
        });
    if !ok {
        return MapStatsPayload { status: 0, body: String::new(), retry_after_ms: 0 };
    }
    let url = format!("{}{}.json", MAP_STATS_API, value);
    match fgexpig_core::http::get(&url, None) {
        Ok(response) => {
            let status = response.status;
            let retry_after_ms = response
                .header("Retry-After")
                .and_then(|raw| raw.trim().parse::<f64>().ok())
                .map(|secs| (secs * 1000.0).round() as u64)
                .unwrap_or(0);
            let mut reader = response.reader();
            let mut bytes: Vec<u8> = Vec::new();
            let _ = reader.read_to_end(&mut bytes);
            MapStatsPayload {
                status,
                body: String::from_utf8_lossy(&bytes).to_string(),
                retry_after_ms,
            }
        }
        Err(_) => MapStatsPayload { status: 0, body: String::new(), retry_after_ms: 0 },
    }
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg(windows)]
fn open_external(url: &str) {
    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(
            hwnd: *mut core::ffi::c_void,
            op: *const u16,
            file: *const u16,
            params: *const u16,
            dir: *const u16,
            show: i32,
        ) -> *mut core::ffi::c_void;
    }
    let verb: Vec<u16> = "open".encode_utf16().chain(std::iter::once(0)).collect();
    let target: Vec<u16> = url.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            target.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1,
        );
    }
}

#[cfg(not(windows))]
fn open_external(_url: &str) {}

/// 开屏页结束 → 开始三阶段缓存（与 Electron 版一致）
#[tauri::command]
fn launcher_splash_done(app: tauri::AppHandle) {
    let send_handle = app.clone();
    launcher::drive(app.clone(), move |command| {
        if let Some(state) = send_handle.try_state::<AppState>() {
            if let Some(sidecar) = state.sidecar.lock().unwrap().as_mut() {
                sidecar.send(command);
            }
        }
    });
}

/// 启动器「进入应用」→ 窗口切到站点
#[tauri::command]
fn launcher_enter(app: tauri::AppHandle) {
    navigate_main(&app, None);
}

/// 站点里点「退出至菜单」→ 回到启动器主菜单（resume）
#[tauri::command]
fn back_to_menu(app: tauri::AppHandle) {
    navigate_main(&app, Some("launcher.html?resume=1"));
    let _ = app.emit("fgexpig://launcher", serde_json::json!({ "type": "ready" }));
}

#[tauri::command]
fn bridge_loaded(href: String) {
    eprintln!("[shell] bridge loaded at {}", href);
}

#[tauri::command]
fn bridge_failed(href: String, reason: String) {
    eprintln!("[shell] bridge FAILED at {} : {}", href, reason);
}

#[tauri::command]
fn launcher_listener_ready() {
    eprintln!("[shell] launcher event listener ready");
}

#[tauri::command]
fn launcher_listener_failed(reason: String) {
    eprintln!("[shell] launcher event listener FAILED: {}", reason);
}

#[tauri::command]
fn launcher_quit(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn launcher_open_site() {
    open_external(&std::env::var("FGEXPIG_UPDATE_BASE_URL").unwrap_or_else(|_| DEFAULT_BASE_URL.to_string()));
}

#[tauri::command]
fn launcher_github() {
    open_external("https://github.com/JianZhaNoSwine/FGEXPIG-Official-Website");
}

/// page = None 表示跳到站点首页；Some(path) 表示跳回应用内页面（启动器）
fn navigate_main(app: &tauri::AppHandle, page: Option<&str>) {
    let window = match app.get_webview_window("main") {
        Some(w) => w,
        None => return,
    };
    match page {
        Some(path) => {
            if let Ok(url) = format!("tauri://localhost/{}", path).parse::<tauri::Url>() {
                let _ = window.navigate(url);
            }
        }
        None => {
            if let Some(state) = app.try_state::<AppState>() {
                let target = state.site_url.clone();
                if let Ok(url) = target.parse::<tauri::Url>() {
                    let _ = window.navigate(url);
                }
            }
        }
    }
}

fn main() {
    if !single_instance_ok() {
        if heartbeat_fresh() {
            eprintln!("[shell] 已有实例在运行，本实例退出");
            return;
        }
        eprintln!("[shell] 单实例互斥体被遗留进程占用（心跳已过期），继续启动");
    }
    spawn_heartbeat();
    let settings = read_settings();
    let base_url = std::env::var("FGEXPIG_UPDATE_BASE_URL").unwrap_or_else(|_| DEFAULT_BASE_URL.to_string());
    let base_url = format!("{}/", base_url.trim_end_matches('/'));

    let sidecar = match Sidecar::start(&base_url, site_root()) {
        Ok(s) => Some(s),
        Err(err) => {
            eprintln!("[shell] {}", err);
            None
        }
    };
    let site_url = sidecar
        .as_ref()
        .map(|s| format!("{}index.html", s.url()))
        .unwrap_or_else(|| "index.html".to_string());

    eprintln!("[shell] data dir: {}", app_data_dir().display());
    match &sidecar {
        Some(s) => eprintln!("[shell] sidecar port: {}", s.port),
        None => eprintln!("[shell] sidecar: 未启动"),
    }

    tauri::Builder::default()
        .manage(AppState {
            sidecar: Mutex::new(sidecar),
            settings: Mutex::new(settings),
            display: Mutex::new(DisplayMetrics { scale: 1.0, max_width: 1920, max_height: 1080 }),
            site_url: site_url.clone(),
        })
        .invoke_handler(tauri::generate_handler![
            resolution_get,
            resolution_set,
            aspect_set,
            state_load,
            state_save,
            state_report,
            mapstats_store_get,
            mapstats_store_set,
            mapstats_fetch,
            quit_app,
            back_to_menu,
            launcher_splash_done,
            launcher_enter,
            launcher_quit,
            launcher_open_site,
            launcher_github,
            launcher_listener_ready,
            launcher_listener_failed,
            bridge_loaded,
            bridge_failed
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            let (scale, max_w, max_h) = match app.primary_monitor() {
                Ok(Some(monitor)) => {
                    let size = monitor.size();
                    (monitor.scale_factor(), size.width as i32, size.height as i32)
                }
                _ => (1.0, 1920, 1080),
            };
            {
                let state = app.state::<AppState>();
                {
                    let mut display = state.display.lock().unwrap();
                    display.scale = scale;
                    display.max_width = max_w;
                    display.max_height = max_h;
                }
                eprintln!("[shell] display: {}x{} @ scale {}", max_w, max_h, scale);
                let mut stored = state.settings.lock().unwrap().clone();
                let current = selected_resolution(&stored, &stored.aspect.clone(), max_w, max_h, scale);
                stored.resolution = Some(current.clone());
                write_settings(&stored);
                let mut settings = state.settings.lock().unwrap();
                *settings = stored;
                let _ = state;
            }
            let state = app.state::<AppState>();
            let current = state.settings.lock().unwrap().resolution.clone().unwrap();
            let logical_width = ((current.width as f64) / scale).round().max(1.0);
            let logical_height = ((current.height as f64) / scale).round().max(1.0);

            // 初始化脚本：给前端一份与 Electron preload 一致的 window.FGEXPIG_DESKTOP
            let boot = serde_json::json!({
                "current": current,
                "options": allowed_resolutions(&state.settings.lock().unwrap().aspect.clone(), max_w, max_h, scale),
                "aspect": state.settings.lock().unwrap().aspect.clone(),
                "aspects": aspect_options(),
                "max": { "width": max_w, "height": max_h, "scale": scale }
            });
            let state_text = std::fs::read_to_string(state_file()).unwrap_or_default();
            let mapstats_text = std::fs::read_to_string(mapstats_file()).unwrap_or_default();
            let mut init_script = DESKTOP_BRIDGE_TEMPLATE.to_string();
            init_script = init_script.replace("__BOOT__", &boot.to_string());
            init_script = init_script.replace("__MAXW__", &max_w.to_string());
            init_script = init_script.replace("__MAXH__", &max_h.to_string());
            init_script = init_script.replace("__SCALE__", &format!("{}", scale));
            init_script = init_script.replace(
                "__STATE__",
                &serde_json::to_string(&state_text).unwrap_or_else(|_| "\"\"".to_string()),
            );
            // 地图数据单独注入：页面初始化时会把「文件并集 ∪ localStorage」合并，
            // 保证不管 origin 怎么换，看到的地图数据永远不会比文件里少。
            init_script = init_script.replace(
                "__MAPSTATS__",
                &serde_json::to_string(&mapstats_text).unwrap_or_else(|_| "\"\"".to_string()),
            );

            // sidecar 事件读取线程：进度 / 幻灯片 / ready 等转发给启动器页面
            let reader = {
                let state = app.state::<AppState>();
                let mut guard = state.sidecar.lock().unwrap();
                guard.as_mut().and_then(|s| s.reader.take())
            };
            if let Some(reader) = reader {
                let reader_handle = handle.clone();
                let local_base = {
                    let state = app.state::<AppState>();
                    let guard = state.sidecar.lock().unwrap();
                    guard
                        .as_ref()
                        .map(|s| s.url())
                        .unwrap_or_else(|| format!("http://127.0.0.1:{}/", DESKTOP_PORT))
                };
                std::thread::spawn(move || {
                    for line in reader.lines() {
                        match line {
                            Ok(text) => launcher::handle_line(&reader_handle, &text, &local_base),
                            Err(_) => break,
                        }
                    }
                });
            }

            eprintln!(
                "[shell] init_script len={} unresolved_placeholders={}",
                init_script.len(),
                init_script.matches("__").count()
            );
            let launcher_bridge = launcher_bridge_script();
            let open_site_directly = std::env::var("FGEXPIG_OPEN_SITE").map(|v| v == "1").unwrap_or(false);
            let initial_url = if open_site_directly {
                match site_url.parse::<tauri::Url>() {
                    Ok(url) => WebviewUrl::External(url),
                    Err(_) => WebviewUrl::App("launcher.html".into()),
                }
            } else {
                WebviewUrl::App("launcher.html".into())
            };
            let window = WebviewWindowBuilder::new(&handle, "main", initial_url)
                .title("FGEXPIG")
                .inner_size(logical_width, logical_height)
                .resizable(false)
                .maximizable(false)
                // 无边框：去掉 Windows 原生标题栏（那条白条），让启动器/壁纸图铺到窗口最顶端。
                // 拖动窗口改用页面顶部 32px 空白区域（见 bridge.js）。
                .decorations(false)
                // 不开投影：tao 的"无边框+投影"会保留 WS_THICKFRAME，窗口四周会多出 7-8px 的
                // frame 区域（WebView2 铺不到那里，露出窗口白底 → 看起来就是白边）。关掉后
                // 客户端 = 整个窗口，没有任何白边。
                .shadow(false)
                .initialization_script(&init_script)
                .initialization_script(&launcher_bridge)
                .build()?;
            apply_win11_round_corners(&window);
            let _ = window.show();

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<AppState>() {
                    if let Some(sidecar) = state.sidecar.lock().unwrap().as_mut() {
                        sidecar.stop();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running FGEXPIG shell");
}

#[allow(dead_code)]
fn emit_progress(app: &tauri::AppHandle, payload: serde_json::Value) {
    let _ = app.emit("fgexpig://progress", payload);
}

#[allow(dead_code)]
fn unused_paths() -> (PathBuf, PathBuf, PathBuf) {
    (app_data_dir(), site_root(), settings_file())
}

#[allow(dead_code)]
fn unused_path(p: &Path) -> String {
    p.display().to_string()
}

/// 让无边框窗口服从 Windows 11 的圆角：由 DWM 裁剪窗口形状，圆角外露出桌面。
/// 同时把 DWM 边框线设为 none，避免圆角外侧又被描一圈浅色线。
#[cfg(windows)]
fn apply_win11_round_corners(window: &tauri::WebviewWindow) {
    let hwnd = match window.hwnd() {
        Ok(handle) => handle,
        Err(_) => return,
    };
    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: *mut core::ffi::c_void,
            attribute: u32,
            value: *const core::ffi::c_void,
            size: u32,
        ) -> i32;
    }
    const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33; // DWMWCP_ROUND = 2
    const DWMWCP_ROUND: i32 = 2;
    const DWMWA_BORDER_COLOR: u32 = 34; // DWMWA_COLOR_NONE = 0xFFFFFFFE
    const DWMWA_COLOR_NONE: u32 = 0xFFFF_FFFE;
    unsafe {
        DwmSetWindowAttribute(
            hwnd.0 as *mut core::ffi::c_void,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &DWMWCP_ROUND as *const i32 as *const core::ffi::c_void,
            4,
        );
        DwmSetWindowAttribute(
            hwnd.0 as *mut core::ffi::c_void,
            DWMWA_BORDER_COLOR,
            &DWMWA_COLOR_NONE as *const u32 as *const core::ffi::c_void,
            4,
        );
    }
}

#[cfg(not(windows))]
fn apply_win11_round_corners(_window: &tauri::WebviewWindow) {}

/// 网页侧桌面桥（bridge.js）：localStorage 文件镜像 + 同步分辨率 API
const DESKTOP_BRIDGE_TEMPLATE: &str = include_str!("bridge.js");


/// 启动器页面的桥（与 Electron preload 的 FGEXPIG_LAUNCHER 同 API）
fn launcher_bridge_script() -> String {
    r#"
(function () {
  var core = window.__TAURI__ && window.__TAURI__.core;
  var eventApi = window.__TAURI__ && window.__TAURI__.event;
  function call(name, payload) {
    if (!core || !core.invoke) return Promise.resolve(null);
    return core.invoke(name, payload || {});
  }
  window.FGEXPIG_LAUNCHER = {
    onMessage: function (callback) {
      if (typeof callback !== 'function') return;
      if (!eventApi || !eventApi.listen) { call('launcher_listener_failed', { reason: 'no event api' }); return; }
      eventApi.listen('fgexpig://launcher', function (e) { callback(e.payload); })
        .then(function () { call('launcher_listener_ready'); })
        .catch(function (err) { call('launcher_listener_failed', { reason: String(err && err.message || err) }); });
    },
    music: function () {
      return fetch('assets/menu.mp3').then(function (r) { return r.arrayBuffer(); }).catch(function () { return null; });
    },
    splashDone: function () { call('launcher_splash_done'); },
    enter: function () { call('launcher_enter'); },
    openSite: function () { call('launcher_open_site'); },
    github: function () { call('launcher_github'); },
    quit: function () { call('launcher_quit'); }
  };
})();
"#
    .to_string()
}
