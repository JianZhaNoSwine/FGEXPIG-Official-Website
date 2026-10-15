/* 分级同步 / 校验 / 清理：与 electron/updater.js 行为对齐 */
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use sha2::{Digest, Sha256};

use crate::manifest::{self, Entry, Manifest};
use crate::paths::{decode_manifest_path, is_text_asset, safe_local_path};

#[derive(Debug, Clone, serde::Serialize)]
pub struct Progress {
    pub phase: String,
    pub current: usize,
    pub target: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downloaded: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failed: Option<usize>,
}

pub struct SyncResult {
    pub version: String,
    pub count: usize,
    pub level: u32,
    pub quality: u32,
    pub completed_level: u32,
    pub pruned: usize,
}

pub fn is_priority_entry(entry: &Entry) -> bool {
    let p = entry.path.replace('\\', "/");
    if !p.starts_with("wallpaper/") {
        return false;
    }
    let lower = p.to_ascii_lowercase();
    [".webp", ".jpg", ".jpeg", ".png", ".gif", ".avif", ".mp4"]
        .iter()
        .any(|ext| lower.ends_with(ext))
}

/// exe 内置资源（字体已打进 exe，不参与下载/校验）
pub fn is_bundled_asset(entry: &Entry) -> bool {
    entry.path.replace('\\', "/").starts_with("fonts/")
}

pub fn sha256_file(path: &Path) -> std::io::Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// 等价 updater.js 的 mapLimit
fn map_limit<T: Sync, F>(items: &[T], limit: usize, worker: F)
where
    F: Fn(&T) + Sync,
{
    let index = AtomicUsize::new(0);
    let workers = limit.max(1).min(items.len().max(1));
    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| loop {
                let i = index.fetch_add(1, Ordering::SeqCst);
                if i >= items.len() {
                    break;
                }
                worker(&items[i]);
            });
        }
    });
}

/// 等价 updater.js 的 fileState：本地是否已是最新
pub fn file_state(root: &Path, entry: &Entry, local: Option<&Entry>) -> bool {
    let local = match local {
        Some(l) => l,
        None => return false,
    };
    if local.hash != entry.hash {
        return false;
    }
    let file = match safe_local_path(root, &entry.path) {
        Some(f) => f,
        None => return false,
    };
    let stat = match fs::metadata(&file) {
        Ok(s) if s.is_file() => s,
        _ => return false,
    };
    if is_text_asset(&entry.path) {
        let recorded = local.local_size.unwrap_or(0);
        if recorded > 0 {
            return stat.len() == recorded;
        }
        return stat.len() > 0;
    }
    local.size == entry.size && stat.len() == entry.size
}

/// 等价 updater.js 的 downloadEntry
pub fn download_entry(base_url: &str, root: &Path, entry: &Entry) -> Result<(), String> {
    let file = safe_local_path(root, &entry.path)
        .ok_or_else(|| format!("unsafe path: {}", entry.path))?;
    let temp_dir = root.join(".downloads");
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let temp = temp_dir.join(format!(
        "{}.part",
        unique_stamp()
    ));
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let url = format!("{}/{}", base_url.trim_end_matches('/'), entry.path);
    let response = crate::http::get(&url, None)
        .map_err(|e| format!("download error {}: {}", entry.path, e))?;
    if response.status != 200 {
        let _ = fs::remove_file(&temp);
        return Err(format!("download HTTP {}: {}", response.status, entry.path));
    }
    let mut reader = response.reader();
    let mut hasher = Sha256::new();
    let mut out = fs::File::create(&temp).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; 64 * 1024];
    let copy_result = (|| -> Result<(), String> {
        loop {
            let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
            std::io::Write::write_all(&mut out, &buf[..n]).map_err(|e| e.to_string())?;
        }
        Ok(())
    })();
    drop(out);
    if let Err(e) = copy_result {
        let _ = fs::remove_file(&temp);
        return Err(e);
    }
    let actual = format!("{:x}", hasher.finalize());
    let tolerate = is_text_asset(&entry.path);
    if actual != entry.hash && !tolerate {
        let _ = fs::remove_file(&temp);
        return Err(format!("hash mismatch: {}", entry.path));
    }
    let _ = fs::remove_file(&file);
    fs::rename(&temp, &file).map_err(|e| {
        let _ = fs::remove_file(&temp);
        e.to_string()
    })
}

fn unique_stamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:x}-{:x}", std::process::id(), nanos)
}

/// 等价 updater.js 的 syncEntries（exe 自有的两类缓存都走这里）
pub fn sync_entries<F>(
    base_url: &str,
    root: &Path,
    manifest: &Manifest,
    entries: &[Entry],
    on_progress: F,
) -> Result<(usize, usize), String>
where
    F: Fn(Progress) + Sync,
{
    let local = manifest::read_local_manifest(root);
    let mut local_map: Vec<Entry> = local
        .as_ref()
        .map(|m| m.files.clone())
        .unwrap_or_default();

    // 迁移：旧清单没记录文本资源落盘大小 → 强制重下文本资源
    let has_text_local_size = local_map
        .iter()
        .any(|e| is_text_asset(&e.path) && e.local_size.unwrap_or(0) > 0);
    let migrate_text = !local_map.is_empty() && !has_text_local_size;

    let site_paths: Vec<String> = manifest.files.iter().map(|e| e.path.clone()).collect();

    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let target = entries.len();
    let current = AtomicUsize::new(0);
    let downloaded = AtomicUsize::new(0);
    let local_map = Mutex::new(local_map);

    on_progress(Progress {
        phase: "download".into(),
        current: 0,
        target,
        level: None,
        downloaded: Some(0),
        failed: None,
    });

    map_limit(entries, 6, |entry: &Entry| {
        let file = safe_local_path(root, &entry.path);
        let local_entry = {
            let map = local_map.lock().unwrap();
            map.iter().find(|e| e.path == entry.path).cloned()
        };
        let force_text = migrate_text && is_text_asset(&entry.path) && local_entry.is_some();
        let force_index_refresh = entry.path == "index.html";
        let mut keep = false;
        if !force_text && !force_index_refresh {
            keep = file_state(root, entry, local_entry.as_ref());
        }
        if !keep {
            if let Err(e) = download_entry(base_url, root, entry) {
                eprintln!("[desktop] download failed: {}", e);
            } else {
                downloaded.fetch_add(1, Ordering::SeqCst);
            }
        }
        let size = file
            .as_ref()
            .and_then(|f| fs::metadata(f).ok())
            .map(|m| m.len())
            .unwrap_or(0);
        {
            let mut map = local_map.lock().unwrap();
            if let Some(existing) = map.iter_mut().find(|e| e.path == entry.path) {
                existing.hash = entry.hash.clone();
                existing.size = entry.size;
                existing.level = entry.level;
                existing.quality = entry.quality;
                existing.local_size = Some(size);
            } else {
                let mut cloned = entry.clone();
                cloned.local_size = Some(size);
                map.push(cloned);
            }
        }
        let done = current.fetch_add(1, Ordering::SeqCst) + 1;
        on_progress(Progress {
            phase: "download".into(),
            current: done,
            target,
            level: None,
            downloaded: Some(downloaded.load(Ordering::SeqCst)),
            failed: None,
        });
    });

    let merged: Vec<Entry> = {
        let map = local_map.lock().unwrap();
        map.iter()
            .filter(|e| site_paths.iter().any(|p| p == &e.path))
            .cloned()
            .collect()
    };
    manifest::write_local_manifest(root, &manifest.version, 3, 5, &merged)
        .map_err(|e| e.to_string())?;
    Ok((target, downloaded.load(Ordering::SeqCst)))
}

/// 等价 updater.js 的 verifyEntries
pub fn verify_entries<F>(root: &Path, entries: &[Entry], on_progress: F) -> Result<Vec<String>, String>
where
    F: Fn(Progress) + Sync,
{
    let target = entries.len();
    let current = AtomicUsize::new(0);
    let failed: Mutex<Vec<String>> = Mutex::new(Vec::new());
    on_progress(Progress {
        phase: "verify".into(),
        current: 0,
        target,
        level: None,
        downloaded: None,
        failed: Some(0),
    });
    map_limit(entries, 4, |entry: &Entry| {
        let mut ok = false;
        if let Some(file) = safe_local_path(root, &entry.path) {
            if let Ok(stat) = fs::metadata(&file) {
                if stat.is_file() {
                    if is_text_asset(&entry.path) {
                        ok = stat.len() > 0;
                    } else {
                        ok = sha256_file(&file).map(|h| h == entry.hash).unwrap_or(false);
                    }
                }
            }
        }
        if !ok {
            failed.lock().unwrap().push(entry.path.clone());
        }
        let done = current.fetch_add(1, Ordering::SeqCst) + 1;
        on_progress(Progress {
            phase: "verify".into(),
            current: done,
            target,
            level: None,
            downloaded: None,
            failed: Some(failed.lock().unwrap().len()),
        });
    });
    let out = failed.lock().unwrap().clone();
    Ok(out)
}

/// 等价 updater.js 的 pruneStaleFiles
pub fn prune_stale_files(root: &Path, manifest: &Manifest) -> usize {
    let keep: Vec<String> = manifest
        .files
        .iter()
        .map(|e| decode_manifest_path(&e.path))
        .collect();
    if keep.is_empty() {
        return 0;
    }
    let removed = AtomicUsize::new(0);
    walk_prune(root, root, &keep, &removed);
    removed.load(Ordering::SeqCst)
}

fn walk_prune(dir: &Path, root: &Path, keep: &[String], removed: &AtomicUsize) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let full = entry.path();
        let relative = full
            .strip_prefix(root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            if relative == ".downloads" {
                continue;
            }
            walk_prune(&full, root, keep, removed);
            let _ = fs::remove_dir(&full);
            continue;
        }
        if relative == crate::LOCAL_MANIFEST_NAME {
            continue;
        }
        if !keep.iter().any(|k| k == &relative) {
            if fs::remove_file(&full).is_ok() {
                removed.fetch_add(1, Ordering::SeqCst);
            }
        }
    }
}

/// 等价 updater.js 的 syncSite（按 level/quality 过滤后整站同步）
pub fn sync_site<F>(
    base_url: &str,
    root: &Path,
    max_level: u32,
    quality: u32,
    on_progress: F,
) -> Result<SyncResult, String>
where
    F: Fn(Progress) + Sync,
{
    let manifest = manifest::fetch_manifest(base_url)?;
    let local = manifest::read_local_manifest(root);
    let local_entries: Vec<Entry> = local.as_ref().map(|m| m.files.clone()).unwrap_or_default();
    let max_level = max_level.clamp(1, 3);
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let selected_quality = if quality == 3 { 3 } else { 5 };

    let files: Vec<Entry> = manifest
        .files
        .iter()
        .filter(|e| {
            let entry_quality = e.quality;
            let quality_matches = entry_quality == 0 || entry_quality == selected_quality;
            let level = e.level.clamp(1, 3);
            quality_matches && level <= max_level
        })
        .cloned()
        .collect();

    let current = AtomicUsize::new(0);
    let target = files.len();
    on_progress(Progress {
        phase: "check".into(),
        current: 0,
        target,
        level: Some(max_level),
        downloaded: None,
        failed: None,
    });
    map_limit(&files, 6, |entry: &Entry| {
        let local_entry = local_entries.iter().find(|e| e.path == entry.path);
        if !file_state(root, &entry, local_entry) {
            if let Err(e) = download_entry(base_url, root, &entry) {
                eprintln!("[desktop] download failed: {}", e);
            }
        }
        let done = current.fetch_add(1, Ordering::SeqCst) + 1;
        on_progress(Progress {
            phase: "download".into(),
            current: done,
            target,
            level: Some(max_level),
            downloaded: None,
            failed: None,
        });
    });

    let completed_level = manifest
        .completed_level
        .max(max_level)
        .max(local.as_ref().map(|m| m.completed_level).unwrap_or(0));
    manifest::write_local_manifest(root, &manifest.version, completed_level, selected_quality, &manifest.files)
        .map_err(|e| e.to_string())?;
    let pruned = prune_stale_files(root, &manifest);
    Ok(SyncResult {
        version: manifest.version.clone(),
        count: files.len(),
        level: max_level,
        quality: selected_quality,
        completed_level,
        pruned,
    })
}

pub fn local_state(root: &Path) -> (bool, usize, u32, String) {
    let local = manifest::read_local_manifest(root);
    let count = local.as_ref().map(|m| m.files.len()).unwrap_or(0);
    let level = local.as_ref().map(|m| m.completed_level).unwrap_or(0);
    let version = local.as_ref().map(|m| m.version.clone()).unwrap_or_default();
    (manifest::has_local_site(root), count, level, version)
}

pub fn entry_paths(entries: &[Entry]) -> Vec<PathBuf> {
    entries
        .iter()
        .filter_map(|e| safe_local_path(Path::new("."), &e.path))
        .collect()
}
