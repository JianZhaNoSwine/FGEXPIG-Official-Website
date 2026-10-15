/* 等价（已移除的）Node 版 build-i18n-pack.js：CSV → i18n/index.js + i18n/lang 语言包 */
use std::fs;
use std::path::Path;

use serde_json::{Map, Value};
use sha1::{Digest, Sha1};

use crate::csv;

struct Lang {
    id: &'static str,
    native: &'static str,
    column: &'static str,
    html_lang: &'static str,
    source: bool,
}

const LANGUAGES: [Lang; 13] = [
    Lang { id: "zh-Hans", native: "简体中文", column: "简体中文", html_lang: "zh-Hans", source: true },
    Lang { id: "ja", native: "日本語", column: "日语", html_lang: "ja", source: false },
    Lang { id: "en", native: "English", column: "英语", html_lang: "en", source: false },
    Lang { id: "fr", native: "Français", column: "法语", html_lang: "fr", source: false },
    Lang { id: "it", native: "Italiano", column: "意大利语", html_lang: "it", source: false },
    Lang { id: "de", native: "Deutsch", column: "德语", html_lang: "de", source: false },
    Lang { id: "es-ES", native: "Español (España)", column: "西班牙语（西班牙）", html_lang: "es-ES", source: false },
    Lang { id: "ar", native: "العربية", column: "阿拉伯语", html_lang: "ar", source: false },
    Lang { id: "ko", native: "한국어", column: "韩语", html_lang: "ko", source: false },
    Lang { id: "pt-BR", native: "Português (Brasil)", column: "葡萄牙语（巴西）", html_lang: "pt-BR", source: false },
    Lang { id: "ru", native: "Русский", column: "俄语", html_lang: "ru", source: false },
    Lang { id: "zh-Hant", native: "繁體中文", column: "繁体中文", html_lang: "zh-Hant", source: false },
    Lang { id: "pl", native: "Polski", column: "波兰语", html_lang: "pl", source: false },
];

const CSV_NAMES: [&str; 5] = [
    "ui-strings.csv",
    "shop-strings.csv",
    "resources-strings.csv",
    "hotspot-strings.csv",
    "title-strings.csv",
];

const BANNER: &str = "/* 自动生成，请勿手改；源文件：i18n/ui-strings.csv、i18n/shop-strings.csv、i18n/resources-strings.csv、i18n/hotspot-strings.csv、i18n/title-strings.csv（改动后运行 build/tools/update-i18n-pack.bat） */\n";

fn utf16_len(s: &str) -> usize {
    s.chars().map(|c| c.len_utf16()).sum()
}

fn escape_js_regex_char(c: char) -> bool {
    matches!(c, '.' | '*' | '+' | '?' | '^' | '$' | '{' | '}' | '(' | ')' | '|' | '[' | ']' | '\\')
}

fn is_param(part: &str) -> Option<&str> {
    let inner = part.strip_prefix('{')?.strip_suffix('}')?;
    if !inner.is_empty() && inner.chars().all(|c| c.is_ascii_alphabetic() || c == '_') {
        Some(inner)
    } else {
        None
    }
}

/// 等价 patternOf()：返回 (names, src)
fn pattern_of(zh: &str) -> (Vec<String>, String) {
    // 等价 zh.split(/(\{[A-Za-z_]+\})/)：保留分隔符
    let mut parts: Vec<String> = Vec::new();
    let mut current = String::new();
    let chars: Vec<char> = zh.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '{' {
            let mut j = i + 1;
            while j < chars.len() && (chars[j].is_ascii_alphabetic() || chars[j] == '_') {
                j += 1;
            }
            if j < chars.len() && chars[j] == '}' && j > i + 1 {
                parts.push(std::mem::take(&mut current));
                parts.push(chars[i..=j].iter().collect());
                i = j + 1;
                continue;
            }
        }
        current.push(chars[i]);
        i += 1;
    }
    parts.push(current);

    let mut names: Vec<String> = Vec::new();
    let mut src = String::from("^");
    for part in parts {
        if let Some(name) = is_param(&part) {
            names.push(name.to_string());
            src.push_str("(.+?)");
            continue;
        }
        for c in part.chars() {
            if escape_js_regex_char(c) {
                src.push('\\');
            }
            src.push(c);
        }
    }
    src.push('$');
    (names, src)
}

pub fn run(root: &Path) -> i32 {
    let mut source_texts: Vec<String> = Vec::new();
    for name in CSV_NAMES {
        let path = root.join("i18n").join(name);
        match fs::read_to_string(&path) {
            Ok(t) => source_texts.push(t),
            Err(e) => {
                eprintln!("[ERROR] 读不到 {}: {}", path.display(), e);
                return 2;
            }
        }
    }
    let csv_text = source_texts.join("\n\n/* FGEXPIG-SOURCE-SPLIT */\n\n");

    let mut zh: Map<String, Value> = Map::new();
    let mut by_zh: Map<String, Value> = Map::new();
    let mut resource_by_zh: Map<String, Value> = Map::new();
    let mut hotspot_by_zh: Map<String, Value> = Map::new();
    let mut title_by_zh: Map<String, Value> = Map::new();
    let mut patterns: Vec<(String, Vec<String>, String)> = Vec::new();
    let mut cells_by_lang: Vec<(String, Map<String, Value>)> =
        LANGUAGES.iter().filter(|l| !l.source).map(|l| (l.id.to_string(), Map::new())).collect();

    for text in &source_texts {
        let rows = csv::parse(text);
        let header: Vec<String> = rows.first().cloned().unwrap_or_default();
        let col_of = |name: &str| header.iter().position(|h| h == name);
        let zh_idx = match col_of("简体中文") {
            Some(i) => i,
            None => {
                eprintln!("[ERROR] CSV 缺少「简体中文」列");
                return 2;
            }
        };
        for r in rows.iter().skip(1) {
            let key = r.first().map(|s| s.trim().to_string()).unwrap_or_default();
            if key.is_empty() {
                continue;
            }
            let zh_text = r.get(zh_idx).cloned().unwrap_or_default();
            zh.insert(key.clone(), Value::String(zh_text.clone()));
            if !zh_text.is_empty() {
                if !by_zh.contains_key(&zh_text) {
                    by_zh.insert(zh_text.clone(), Value::String(key.clone()));
                }
                if key.starts_with("resource.") && !resource_by_zh.contains_key(&zh_text) {
                    resource_by_zh.insert(zh_text.clone(), Value::String(key.clone()));
                }
                if key.starts_with("hotspot.") && !hotspot_by_zh.contains_key(&zh_text) {
                    hotspot_by_zh.insert(zh_text.clone(), Value::String(key.clone()));
                }
                if key.starts_with("title.") && !title_by_zh.contains_key(&zh_text) {
                    title_by_zh.insert(zh_text.clone(), Value::String(key.clone()));
                }
                if zh_text.contains('{') && zh_text.contains('}') {
                    if let Some(_) = zh_text.find('{') {
                        let (names, src) = pattern_of(&zh_text);
                        if !names.is_empty() {
                            patterns.push((key.clone(), names, src));
                        }
                    }
                }
            }
            for (lang_idx, lang) in LANGUAGES.iter().enumerate().filter(|(_, l)| !l.source) {
                let _ = lang_idx;
                if let Some(idx) = col_of(lang.column) {
                    let val = r.get(idx).cloned().unwrap_or_default();
                    if !val.is_empty() {
                        cells_by_lang
                            .iter_mut()
                            .find(|(id, _)| id == lang.id)
                            .map(|(_, m)| m.insert(key.clone(), Value::String(val)));
                    }
                }
            }
        }
    }

    // 先具体后通用：字面量越长的模板越优先（稳定排序）
    patterns.sort_by(|a, b| {
        let lit_a = utf16_len(&a.2.replace("(.+?)", ""));
        let lit_b = utf16_len(&b.2.replace("(.+?)", ""));
        if lit_a != lit_b {
            return lit_b.cmp(&lit_a);
        }
        b.1.len().cmp(&a.1.len())
    });

    let mut hasher = Sha1::new();
    hasher.update(csv_text.as_bytes());
    let version = format!("{:x}", hasher.finalize())[..12].to_string();

    let mut index_obj: Map<String, Value> = Map::new();
    index_obj.insert("version".into(), Value::String(version.clone()));
    index_obj.insert("generatedAt".into(), Value::String(crate::time::iso_now()));
    index_obj.insert("defaultId".into(), Value::String("en".into()));
    index_obj.insert("sourceId".into(), Value::String("zh-Hans".into()));
    index_obj.insert(
        "languages".into(),
        Value::Array(
            LANGUAGES
                .iter()
                .map(|l| {
                    let mut m = Map::new();
                    m.insert("id".into(), Value::String(l.id.into()));
                    m.insert("native".into(), Value::String(l.native.into()));
                    m.insert("htmlLang".into(), Value::String(l.html_lang.into()));
                    m.insert("source".into(), Value::Bool(l.source));
                    Value::Object(m)
                })
                .collect(),
        ),
    );
    index_obj.insert("zh".into(), Value::Object(zh.clone()));
    index_obj.insert("byZh".into(), Value::Object(by_zh.clone()));
    index_obj.insert("resourceByZh".into(), Value::Object(resource_by_zh.clone()));
    index_obj.insert("hotspotByZh".into(), Value::Object(hotspot_by_zh.clone()));
    index_obj.insert("titleByZh".into(), Value::Object(title_by_zh.clone()));
    index_obj.insert(
        "patterns".into(),
        Value::Array(
            patterns
                .iter()
                .map(|(key, names, src)| {
                    let mut m = Map::new();
                    m.insert("key".into(), Value::String(key.clone()));
                    m.insert(
                        "names".into(),
                        Value::Array(names.iter().map(|n| Value::String(n.clone())).collect()),
                    );
                    m.insert("src".into(), Value::String(src.clone()));
                    Value::Object(m)
                })
                .collect(),
        ),
    );

    let index_body = format!(
        "{}window.FGEXPIG_I18N_INDEX = {};\n",
        BANNER,
        serde_json::to_string(&Value::Object(index_obj)).unwrap()
    );
    let index_path = root.join("i18n").join("index.js");
    if let Err(e) = fs::write(&index_path, index_body.as_bytes()) {
        eprintln!("[ERROR] 写 index.js 失败: {}", e);
        return 2;
    }

    let lang_dir = root.join("i18n").join("lang");
    if let Err(e) = fs::create_dir_all(&lang_dir) {
        eprintln!("[ERROR] 建 lang 目录失败: {}", e);
        return 2;
    }
    let mut written: Vec<String> = Vec::new();
    for (id, cells) in &cells_by_lang {
        let mut pack: Map<String, Value> = Map::new();
        pack.insert("id".into(), Value::String(id.clone()));
        pack.insert("cells".into(), Value::Object(cells.clone()));
        let body = format!(
            "{}window.FGEXPIG_I18N_LANG_PACKS = window.FGEXPIG_I18N_LANG_PACKS || {{}};\nwindow.FGEXPIG_I18N_LANG_PACKS[{}] = {};\n",
            BANNER,
            serde_json::to_string(&Value::String(id.clone())).unwrap(),
            serde_json::to_string(&Value::Object(pack)).unwrap()
        );
        let file = lang_dir.join(format!("{}.js", id));
        if let Err(e) = fs::write(&file, body.as_bytes()) {
            eprintln!("[ERROR] 写 {} 失败: {}", file.display(), e);
            return 2;
        }
        written.push(format!("{}.js ({})", id, utf16_len(&body)));
    }

    println!(
        "CSV   : {}  ({} chars, version {})",
        CSV_NAMES.join(" + "),
        utf16_len(&csv_text),
        version
    );
    println!(
        "INDEX : i18n/index.js ({} chars, {} keys, {} patterns)",
        utf16_len(&index_body),
        zh.len(),
        patterns.len()
    );
    println!("LANG  : {} files -> {}", written.len(), written.join(", "));
    0
}
