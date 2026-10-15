use std::path::{Path, PathBuf};

/// 文本类资源（与 updater.js 的 TEXT_RE 一致）
pub fn is_text_asset(encoded_path: &str) -> bool {
    let value = percent_decode(encoded_path).to_ascii_lowercase();
    for ext in [
        ".html", ".htm", ".css", ".js", ".mjs", ".json", ".txt", ".xml", ".csv", ".md", ".svg",
    ] {
        if value.ends_with(ext) {
            return true;
        }
    }
    false
}

pub fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(v) = u8::from_str_radix(hex, 16) {
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

/// 清单里的 URL 编码路径 → 文件系统相对路径（/ 分隔）
pub fn decode_manifest_path(value: &str) -> String {
    value
        .split('/')
        .map(|seg| percent_decode(seg))
        .collect::<Vec<_>>()
        .join("/")
}

/// 等价 updater.js 的 safeLocalPath：越界返回 None
pub fn safe_local_path(root: &Path, encoded_path: &str) -> Option<PathBuf> {
    let mut relative = percent_decode(encoded_path);
    relative = relative.replace('\\', "/");
    let relative = relative.trim_start_matches('/').to_string();
    let candidate = root.join(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
    let ok = candidate.starts_with(root);
    if !ok {
        return None;
    }
    Some(candidate)
}

/// 等价 server.js 的 normalizeRemoteKey
pub fn normalize_remote_key(pathname: &str) -> String {
    percent_decode(pathname)
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_string()
}
