/* 等价（已移除的）Node 版 tools/build-desktop-manifest.js（唯一的行为调整：文件排序由 localeCompare 改为
   确定的码点顺序，避免同一份清单在不同系统语言下产生不同顺序/版本号）。 */
use std::fs;
use std::path::Path;

use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};

use crate::datafile;

const ROOT_FILES: [&str; 5] = ["index.html", "sw.js", "favicon.ico", "robots.txt", "sitemap.xml"];
const DIRS: [&str; 11] = [
    "button", "css", "emoji", "fonts", "i18n", "js", "logo", "music", "profile", "resources", "wallpaper",
];

fn is_text_asset(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    [".html", ".htm", ".css", ".js", ".mjs", ".json", ".txt", ".xml", ".csv", ".md", ".svg"]
        .iter()
        .any(|ext| lower.ends_with(ext))
}

fn quality_level(relative: &str) -> u32 {
    let normalized = relative.replace('\\', "/");
    let parts: Vec<&str> = normalized.split('/').collect();
    if parts.len() < 2 {
        return 0;
    }
    // /\/([1-5])\/[^/]+$/  → 倒数第二段是 1~5 且是单字符
    let seg = parts[parts.len() - 2];
    if seg.len() == 1 && ('1'..='5').contains(&seg.chars().next().unwrap()) {
        seg.chars().next().unwrap().to_digit(10).unwrap()
    } else {
        0
    }
}

fn include(relative: &str) -> bool {
    let normalized = relative.replace('\\', "/");
    let base = normalized.rsplit('/').next().unwrap_or("").to_ascii_lowercase();
    if base == "desktop.ini" || base == "thumbs.db" || base == ".ds_store" {
        return false;
    }
    let quality = quality_level(&normalized);
    if quality != 0 && quality != 5 {
        return false;
    }
    if normalized.starts_with("i18n/") && normalized.to_ascii_lowercase().ends_with(".csv") {
        return false;
    }
    if normalized == "css/home.css" || normalized == "js/home.js" {
        return false;
    }
    true
}

fn walk(dir: &Path, root: &Path, out: &mut Vec<String>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.is_dir() {
            walk(&path, root, out);
        } else if meta.is_file() {
            if let Ok(rel) = path.strip_prefix(root) {
                let rel = rel.to_string_lossy().to_string();
                if include(&rel) {
                    out.push(rel);
                }
            }
        }
    }
}

fn utf16_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let ua: Vec<u16> = a.encode_utf16().collect();
    let ub: Vec<u16> = b.encode_utf16().collect();
    ua.cmp(&ub)
}

/// encodeURIComponent：仅保留 A-Za-z0-9 - _ . ! ~ * ' ( )
fn encode_uri_component(s: &str) -> String {
    let mut out = String::new();
    for byte in s.as_bytes() {
        let c = *byte as char;
        let keep = c.is_ascii_alphanumeric()
            || matches!(c, '-' | '_' | '.' | '!' | '~' | '*' | '\'' | '(' | ')');
        if keep {
            out.push(c);
        } else {
            out.push_str(&format!("%{:02X}", byte));
        }
    }
    out
}

fn url_path(relative: &str) -> String {
    relative
        .split('\\')
        .map(encode_uri_component)
        .collect::<Vec<_>>()
        .join("/")
}

fn normalize_lf(bytes: &[u8]) -> Vec<u8> {
    if !bytes.contains(&0x0d) {
        return bytes.to_vec();
    }
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == 0x0d && i + 1 < bytes.len() && bytes[i + 1] == 0x0a {
            out.push(0x0a);
            i += 2;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    out
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    format!("{:x}", h.finalize())
}

fn with_release_salt(hash: &str, salt: &str) -> String {
    sha256_hex(format!("{}|{}", hash, salt).as_bytes())
}

fn parse_release_date(raw: &str) -> i64 {
    // JS: Date.parse(raw.replace(/[年月日]/g, '/')) —— 形如 "2026 年 5 月 29 日" → "2026 / 5 / 29 "
    let cleaned: String = raw
        .chars()
        .map(|c| if c == '年' || c == '月' || c == '日' { '/' } else { c })
        .collect();
    let nums: Vec<i64> = cleaned
        .split(|c: char| !c.is_ascii_digit())
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.parse::<i64>().ok())
        .collect();
    if nums.len() < 3 {
        return 0;
    }
    let (y, m, d) = (nums[0], nums[1], nums[2]);
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return 0;
    }
    // 只用于排序，按“天序号”即可
    y * 372 + m * 31 + d
}

fn default_activity_id(root: &Path) -> String {
    let core_data = match datafile::read_data_file(root, "resources/core.js") {
        Some(v) => v,
        None => return String::new(),
    };
    let rows = match core_data.get("core").and_then(|c| c.as_array()) {
        Some(r) => r,
        None => return String::new(),
    };
    let mut picked: Vec<(&Value, i64)> = Vec::new();
    for row in rows {
        let held_ok = row.get("held").map(|h| h != &Value::Bool(false)).unwrap_or(true);
        if !held_ok {
            continue;
        }
        let display_is_11 = row
            .get("display")
            .map(|d| match d {
                Value::Number(n) => n.as_f64() == Some(11.0),
                Value::String(s) => s.trim().parse::<f64>().map(|v| v == 11.0).unwrap_or(false),
                _ => false,
            })
            .unwrap_or(false);
        let default_selected = row.get("defaultSelected") == Some(&Value::Bool(true));
        if display_is_11 || default_selected {
            let ts = parse_release_date(row.get("releaseDate").and_then(|v| v.as_str()).unwrap_or(""));
            picked.push((row, ts));
        }
    }
    if picked.len() > 1 {
        // 稳定排序：时间倒序（Node 的 sort 是稳定的，这里用索引做次键）
        let mut indexed: Vec<(usize, (&Value, i64))> = picked.into_iter().enumerate().collect();
        indexed.sort_by(|a, b| b.1 .1.cmp(&a.1 .1).then(a.0.cmp(&b.0)));
        picked = indexed.into_iter().map(|(_, v)| v).collect();
    }
    picked
        .first()
        .and_then(|(row, _)| row.get("id").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_string()
}

fn collect_emoji_names(value: &Value, names: &[String], result: &mut Vec<String>) {
    match value {
        Value::String(s) => {
            let units: Vec<u16> = s.encode_utf16().collect();
            let mut i = 0usize;
            while i < units.len() {
                if units[i] != b'\\' as u16 {
                    i += 1;
                    continue;
                }
                let tail = &units[i + 1..];
                let mut matched_len = 0usize;
                let mut matched_name = String::new();
                for name in names {
                    let nu: Vec<u16> = name.encode_utf16().collect();
                    if nu.len() > tail.len() || nu.len() <= matched_len {
                        continue;
                    }
                    let same = nu
                        .iter()
                        .zip(tail.iter())
                        .all(|(a, b)| a.to_string().to_lowercase() == b.to_string().to_lowercase());
                    if same {
                        matched_len = nu.len();
                        matched_name = name.clone();
                    }
                }
                if matched_len > 0 {
                    if !result.iter().any(|n| n == &matched_name) {
                        result.push(matched_name);
                    }
                    i += matched_len;
                } else {
                    i += 1;
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_emoji_names(item, names, result);
            }
        }
        Value::Object(map) => {
            for (_k, v) in map.iter() {
                collect_emoji_names(v, names, result);
            }
        }
        _ => {}
    }
}

fn activity_emoji_names(root: &Path, activity_id: &str, all_names: &[String]) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    if activity_id.is_empty() {
        return result;
    }
    let relative = format!("resources/{}/news.js", activity_id);
    let data = match datafile::read_data_file(root, &relative) {
        Some(v) => v,
        None => return result,
    };
    let rows = data
        .get("hotspots")
        .and_then(|h| h.get(activity_id))
        .cloned()
        .unwrap_or(Value::Null);
    collect_emoji_names(&rows, all_names, &mut result);
    result
}

pub fn run(root: &Path) -> i32 {
    let release_salt = std::env::var("FGEXPIG_RELEASE_SALT")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(crate::time::iso_now);
    let emoji_names: Vec<String> = datafile::read_js_array(root, "js/emoji-manifest.js", "window.FGEXPIG_EMOJI_MANIFEST =")
        .and_then(|v| v.as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()))
        .unwrap_or_default();
    let activity_id = default_activity_id(root);
    let default_emoji = activity_emoji_names(root, &activity_id, &emoji_names);

    let mut paths: Vec<String> = Vec::new();
    for file in ROOT_FILES {
        if root.join(file).is_file() {
            paths.push(file.to_string());
        }
    }
    for dir in DIRS {
        let full = root.join(dir);
        if full.is_dir() {
            walk(&full, root, &mut paths);
        }
    }
    paths.sort_by(|a, b| utf16_cmp(a, b));

    let mut files: Vec<(String, String, u64, u32, u32)> = Vec::new();
    for relative in &paths {
        let full = root.join(relative.replace('\\', std::path::MAIN_SEPARATOR_STR));
        let (hash, size) = if is_text_asset(relative) {
            let bytes = match fs::read(&full) {
                Ok(b) => b,
                Err(e) => {
                    eprintln!("[ERROR] 读不到 {}: {}", full.display(), e);
                    return 2;
                }
            };
            let normalized = normalize_lf(&bytes);
            let base = sha256_hex(&normalized);
            (with_release_salt(&base, &release_salt), normalized.len() as u64)
        } else {
            let bytes = match fs::read(&full) {
                Ok(b) => b,
                Err(e) => {
                    eprintln!("[ERROR] 读不到 {}: {}", full.display(), e);
                    return 2;
                }
            };
            (sha256_hex(&bytes), bytes.len() as u64)
        };
        let level = level_of(relative, &activity_id, &default_emoji);
        let quality = quality_level(relative);
        files.push((url_path(relative), hash, size, level, quality));
    }
    // 与 JS 版一致：按 path 排序（此处统一用码点顺序，localeCompare 会随系统语言变化）
    files.sort_by(|a, b| a.0.cmp(&b.0));

    let mut counts = [0u64; 3];
    for f in &files {
        let idx = (f.3.saturating_sub(1)) as usize;
        if idx < 3 {
            counts[idx] += 1;
        }
    }

    let files_json: Value = Value::Array(
        files
            .iter()
            .map(|(path, hash, size, level, quality)| {
                let mut m = Map::new();
                m.insert("path".into(), Value::String(path.clone()));
                m.insert("hash".into(), Value::String(hash.clone()));
                m.insert("size".into(), Value::Number((*size).into()));
                m.insert("level".into(), Value::Number((*level).into()));
                m.insert("quality".into(), Value::Number((*quality).into()));
                Value::Object(m)
            })
            .collect(),
    );
    let compact_files = serde_json::to_string(&files_json).unwrap();
    let version = sha256_hex(compact_files.as_bytes())[..16].to_string();

    let mut counts_obj = Map::new();
    counts_obj.insert("1".into(), Value::Number(counts[0].into()));
    counts_obj.insert("2".into(), Value::Number(counts[1].into()));
    counts_obj.insert("3".into(), Value::Number(counts[2].into()));

    let mut manifest = Map::new();
    manifest.insert("version".into(), Value::String(version.clone()));
    manifest.insert("generatedAt".into(), Value::String(crate::time::iso_now()));
    manifest.insert("releaseSalt".into(), Value::String(release_salt.clone()));
    manifest.insert("counts".into(), Value::Object(counts_obj));
    manifest.insert("files".into(), files_json);

    let out = format!(
        "{}\n",
        serde_json::to_string_pretty(&Value::Object(manifest)).unwrap()
    );
    if let Err(e) = fs::write(root.join("desktop-manifest.json"), out.as_bytes()) {
        eprintln!("[ERROR] 写 desktop-manifest.json 失败: {}", e);
        return 2;
    }
    println!(
        "desktop manifest: {} files, levels {} version {} releaseSalt {}",
        files.len(),
        json!({ "1": counts[0], "2": counts[1], "3": counts[2] }),
        version,
        release_salt
    );
    0
}

fn level_of(relative: &str, activity_id: &str, default_emoji: &[String]) -> u32 {
    if is_text_asset(relative) {
        return 1;
    }
    let normalized = relative.replace('\\', "/");
    if let Some(rest) = normalized.strip_prefix("resources/") {
        let act = rest.split('/').next().unwrap_or("");
        return if act == activity_id { 1 } else { 2 };
    }
    if let Some(rest) = normalized.strip_prefix("emoji/") {
        let name = rest.rsplit_once('.').map(|(a, _)| a).unwrap_or(rest);
        let decoded = percent_decode(name);
        return if default_emoji.iter().any(|n| n == &decoded) { 1 } else { 2 };
    }
    1
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(h) = hex {
                if let Ok(v) = u8::from_str_radix(h, 16) {
                    out.push(v);
                    i += 3;
                    continue;
                }
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}
