/* 资源数据文件读取：resources 下的 .js 数据文件形态是
   (window.FGEXPIG_DATA_FILES = window.FGEXPIG_DATA_FILES || {})["resources/xx/yy.js"] = { ... };
   正文本身就是严格 JSON，这里按「已知前缀 + 尾部 ;」剥离后解析，不需要内置 JS 引擎。 */
use std::fs;
use std::path::Path;

use serde_json::Value;

pub const PREFIX: &str = "(window.FGEXPIG_DATA_FILES = window.FGEXPIG_DATA_FILES || {})[";

pub fn read_data_file(root: &Path, relative: &str) -> Option<Value> {
    let file = root.join(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
    let text = fs::read_to_string(file).ok()?;
    let body = extract_body(&text)?;
    serde_json::from_str(&body).ok()
}

pub fn extract_body(text: &str) -> Option<String> {
    let start = text.find("] = ")?;
    let mut body = text[start + 4..].trim();
    if let Some(stripped) = body.strip_suffix(';') {
        body = stripped;
    }
    Some(body.trim().to_string())
}

/// 从 `js/emoji-manifest.js` 里取出数组（= [ ... ] 部分是严格 JSON）
pub fn read_js_array(root: &Path, relative: &str, marker: &str) -> Option<Value> {
    let file = root.join(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
    let text = fs::read_to_string(file).ok()?;
    let start = text.find(marker)? + marker.len();
    let rest = &text[start..];
    let open = rest.find('[')?;
    let close = rest.rfind(']')?;
    serde_json::from_str(&rest[open..=close]).ok()
}
