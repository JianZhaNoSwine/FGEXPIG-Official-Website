use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

pub const BINARY_HASH_ALGORITHM: &str = "sha256";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Entry {
    pub path: String,
    pub hash: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub level: u32,
    #[serde(default)]
    pub quality: u32,
    #[serde(default, rename = "localSize", skip_serializing_if = "Option::is_none")]
    pub local_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    #[serde(default)]
    pub version: String,
    #[serde(default, rename = "generatedAt")]
    pub generated_at: String,
    #[serde(default, rename = "releaseSalt")]
    pub release_salt: String,
    #[serde(default)]
    pub counts: serde_json::Value,
    #[serde(default)]
    pub completed_level: u32,
    #[serde(default)]
    pub quality: u32,
    pub files: Vec<Entry>,
}

#[derive(Debug, Clone, Deserialize)]
struct RawEntry {
    path: String,
    hash: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    level: u32,
    #[serde(default)]
    quality: u32,
    #[serde(default, rename = "localSize")]
    local_size: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
struct RawManifest {
    #[serde(default)]
    version: String,
    #[serde(default)]
    files: Option<Vec<RawEntry>>,
}

/// 解析本地/远端清单（容错：缺字段按默认值）
pub fn parse_manifest(text: &str) -> Option<Manifest> {
    let raw: RawManifest = serde_json::from_str(text).ok()?;
    let files = raw.files?;
    let value: serde_json::Value = serde_json::from_str(text).ok()?;
    Some(Manifest {
        version: raw.version,
        generated_at: value
            .get("generatedAt")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        release_salt: value
            .get("releaseSalt")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        counts: value.get("counts").cloned().unwrap_or(serde_json::Value::Null),
        completed_level: value
            .get("completedLevel")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32,
        quality: value.get("quality").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        files: files
            .into_iter()
            .map(|e| Entry {
                path: e.path,
                hash: e.hash,
                size: e.size,
                level: e.level,
                quality: e.quality,
                local_size: e.local_size,
            })
            .collect(),
    })
}

pub fn read_local_manifest(root: &Path) -> Option<Manifest> {
    let path = root.join(crate::LOCAL_MANIFEST_NAME);
    let text = fs::read_to_string(path).ok()?;
    parse_manifest(&text)
}

pub fn read_local_manifest_raw(root: &Path) -> Option<serde_json::Value> {
    let path = root.join(crate::LOCAL_MANIFEST_NAME);
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// 写本地清单：键顺序与 JS 版一致（version / completedLevel / quality / files），2 空格缩进
pub fn write_local_manifest(
    root: &Path,
    version: &str,
    completed_level: u32,
    quality: u32,
    files: &[Entry],
) -> std::io::Result<()> {
    fs::create_dir_all(root)?;
    let mut map = serde_json::Map::new();
    map.insert("version".into(), serde_json::Value::String(version.to_string()));
    map.insert(
        "completedLevel".into(),
        serde_json::Value::Number(completed_level.into()),
    );
    map.insert("quality".into(), serde_json::Value::Number(quality.into()));
    let list: Vec<serde_json::Value> = files
        .iter()
        .map(|e| {
            let mut m = serde_json::Map::new();
            m.insert("path".into(), serde_json::Value::String(e.path.clone()));
            m.insert("hash".into(), serde_json::Value::String(e.hash.clone()));
            m.insert("size".into(), serde_json::Value::Number(e.size.into()));
            m.insert("level".into(), serde_json::Value::Number(e.level.into()));
            m.insert("quality".into(), serde_json::Value::Number(e.quality.into()));
            if let Some(local) = e.local_size {
                m.insert("localSize".into(), serde_json::Value::Number(local.into()));
            }
            serde_json::Value::Object(m)
        })
        .collect();
    map.insert("files".into(), serde_json::Value::Array(list));
    let text = format!(
        "{}\n",
        serde_json::to_string_pretty(&serde_json::Value::Object(map))
            .unwrap_or_else(|_| "{}".to_string())
    );
    fs::write(root.join(crate::LOCAL_MANIFEST_NAME), text)
}

/// 拉取远端 desktop-manifest.json
pub fn fetch_manifest(base_url: &str) -> Result<Manifest, String> {
    let url = format!("{}{}", base_url.trim_end_matches('/'), "/desktop-manifest.json");
    let (status, text) = crate::http::get_string(&url)?;
    if status != 200 {
        return Err(format!("manifest HTTP {}", status));
    }
    parse_manifest(&text).ok_or_else(|| "invalid desktop manifest".to_string())
}

pub fn has_local_site(root: &Path) -> bool {
    root.join("index.html").is_file()
}

/// 启动器幻灯片用的壁纸地址（wallpaper/5/*，排除二维码与视频）
pub fn collect_wallpapers(base_url: &str, manifest: &Manifest) -> Vec<String> {
    let base = base_url.trim_end_matches('/');
    manifest
        .files
        .iter()
        .filter(|e| {
            let p = e.path.replace('\\', "/");
            let lower = p.to_ascii_lowercase();
            if !lower.starts_with("wallpaper/5/") {
                return false;
            }
            [".webp", ".jpg", ".jpeg", ".png", ".gif", ".avif"]
                .iter()
                .any(|ext| lower.ends_with(ext))
        })
        .map(|e| format!("{}/{}", base, e.path))
        .collect()
}
