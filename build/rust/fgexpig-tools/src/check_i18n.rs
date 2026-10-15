/* 等价（已移除的）Node 版 tools/check-untranslated.js：CSV 结构/空译文 + 资源内容是否都已进 CSV
   （不检查：评测正文、热点帖子正文、评论/回复正文、更新日志正文） */
use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde_json::Value;

use crate::csv;

const CSV_FILES: [&str; 5] = [
    "ui-strings.csv",
    "shop-strings.csv",
    "resources-strings.csv",
    "hotspot-strings.csv",
    "title-strings.csv",
];
const LANG_COLUMNS: [&str; 12] = [
    "日语", "英语", "法语", "意大利语", "德语", "西班牙语（西班牙）", "阿拉伯语", "韩语",
    "葡萄牙语（巴西）", "俄语", "繁体中文", "波兰语",
];
const BLACKLISTED: [&str; 4] = ["review.js", "update.js", "account.js", "library.js"];

#[derive(Clone)]
struct Issue {
    kind: String,
    text: String,
    locations: Vec<String>,
    file: String,
    key: String,
    lang: String,
}

fn has_cjk(s: &str) -> bool {
    s.chars().any(|c| ('\u{3400}'..='\u{9fff}').contains(&c))
}

fn should_check(value: &str) -> bool {
    let text = value.trim();
    if text.is_empty() || !has_cjk(text) {
        return false;
    }
    let lower = text.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("www.") {
        return false;
    }
    let punctuation_only = text.chars().all(|c| {
        c.is_ascii_digit()
            || c.is_whitespace()
            || matches!(
                c,
                '.' | ',' | '，' | '。' | ':' | '：' | ';' | '；' | '+' | '-' | '–' | '—' | '/' | '\\'
                    | '(' | ')' | '[' | ']' | '{' | '}' | '<' | '>' | '《' | '》' | '「' | '」'
                    | '『' | '』' | '【' | '】' | '…'
            )
    });
    if punctuation_only {
        return false;
    }
    if [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".mp3", ".m4a", ".wav", ".mp4", ".webm"]
        .iter()
        .any(|ext| lower.ends_with(ext))
    {
        return false;
    }
    true
}

struct Collector {
    order: Vec<String>,
    locations: HashMap<String, Vec<String>>,
}

impl Collector {
    fn new() -> Self {
        Collector { order: Vec::new(), locations: HashMap::new() }
    }
    fn add(&mut self, text: &str, file: &str, location: Option<&str>) {
        if !should_check(text) {
            return;
        }
        let key = text.trim().to_string();
        if !self.locations.contains_key(&key) {
            self.order.push(key.clone());
            self.locations.insert(key.clone(), Vec::new());
        }
        let entry = self.locations.get_mut(&key).unwrap();
        let value = match location {
            Some(where_) if !where_.is_empty() => format!("{} ({})", file, where_),
            _ => file.to_string(),
        };
        entry.push(value);
    }
    fn add_array(&mut self, value: Option<&Value>, file: &str, location: Option<&str>) {
        if let Some(Value::Array(items)) = value {
            for item in items {
                if let Some(s) = item.as_str() {
                    self.add(s, file, location);
                }
            }
        }
    }
}

fn walk_js(dir: &Path, root: &Path, out: &mut Vec<String>) {
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
            walk_js(&path, root, out);
        } else if meta.is_file() && path.extension().map(|e| e.eq_ignore_ascii_case("js")).unwrap_or(false) {
            if let Ok(rel) = path.strip_prefix(root) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
}

fn collect_comment_names(comments: Option<&Value>, prefix: &str, file: &str, post: &str, collector: &mut Collector) {
    let items = match comments {
        Some(Value::Array(a)) => a,
        _ => return,
    };
    for (j, comment) in items.iter().enumerate() {
        if comment.is_null() {
            continue;
        }
        if let Some(name) = comment.get("name").and_then(|v| v.as_str()) {
            let where_ = format!("{}.commentName{}{}", post, prefix, j);
            collector.add(name, file, Some(&where_));
        }
        collect_comment_names(comment.get("replies"), &format!("{}-{}", prefix, j), file, post, collector);
    }
}

fn collect_resources(root: &Path, collector: &mut Collector) {
    let mut files: Vec<String> = Vec::new();
    walk_js(&root.join("resources"), root, &mut files);
    for file in files {
        let base = file.rsplit('/').next().unwrap_or("").to_string();
        if BLACKLISTED.contains(&base.as_str()) {
            continue;
        }
        let data = match crate::datafile::read_data_file(root, &file) {
            Some(v) => v,
            None => continue,
        };
        match base.as_str() {
            "core.js" => {
                if let Some(rows) = data.get("core").and_then(|v| v.as_array()) {
                    for (i, row) in rows.iter().enumerate() {
                        collector.add_array(row.get("tags"), &file, Some(&format!("core.tags#{}", i)));
                    }
                }
            }
            "shop.js" => {
                if let Some(shops) = data.get("shops").and_then(|v| v.as_object()) {
                    for (id, shop) in shops.iter() {
                        let mut items: Vec<&Value> = Vec::new();
                        for key in ["versions", "dlcs"] {
                            if let Some(arr) = shop.get(key).and_then(|v| v.as_array()) {
                                items.extend(arr.iter());
                            }
                        }
                        for (i, item) in items.iter().enumerate() {
                            if item.is_null() {
                                continue;
                            }
                            if let Some(name) = item.get("name").and_then(|v| v.as_str()) {
                                collector.add(name, &file, Some(&format!("{}.item#{}.name", id, i)));
                            }
                            collector.add_array(
                                item.get("contents"),
                                &file,
                                Some(&format!("{}.item#{}.contents", id, i)),
                            );
                        }
                    }
                }
            }
            "title.js" => {
                if let Some(titles) = data.get("titles").and_then(|v| v.as_object()) {
                    for (nick, rows) in titles.iter() {
                        if let Some(arr) = rows.as_array() {
                            for (i, row) in arr.iter().enumerate() {
                                if row.is_null() {
                                    continue;
                                }
                                if let Some(text) = row.get("text").and_then(|v| v.as_str()) {
                                    collector.add(text, &file, Some(&format!("#title{}", i)));
                                }
                            }
                        }
                        let _ = nick;
                    }
                }
            }
            "achievements.js" => {
                if let Some(map) = data.get("achievements").and_then(|v| v.as_object()) {
                    for (id, rows) in map.iter() {
                        if let Some(arr) = rows.as_array() {
                            for (i, row) in arr.iter().enumerate() {
                                if row.is_null() {
                                    continue;
                                }
                                collector.add(
                                    row.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                                    &file,
                                    Some(&format!("{}#achv{}.name", id, i)),
                                );
                                collector.add(
                                    row.get("desc").and_then(|v| v.as_str()).unwrap_or(""),
                                    &file,
                                    Some(&format!("{}#achv{}.desc", id, i)),
                                );
                                collector.add(
                                    row.get("group").and_then(|v| v.as_str()).unwrap_or(""),
                                    &file,
                                    Some(&format!("{}#achv{}.group", id, i)),
                                );
                            }
                        }
                    }
                }
            }
            "list.js" => {
                for group in ["lists", "featuredLists"] {
                    if let Some(map) = data.get(group).and_then(|v| v.as_object()) {
                        for (id, rows) in map.iter() {
                            if let Some(arr) = rows.as_array() {
                                for (i, row) in arr.iter().enumerate() {
                                    if row.is_null() {
                                        continue;
                                    }
                                    collector.add(
                                        row.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                                        &file,
                                        Some(&format!("{}.resource{}.title", id, i)),
                                    );
                                    collector.add(
                                        row.get("category").and_then(|v| v.as_str()).unwrap_or(""),
                                        &file,
                                        Some(&format!("{}.resource{}.category", id, i)),
                                    );
                                }
                            }
                        }
                    }
                }
            }
            "date.js" => {
                if let Some(map) = data.get("schedules").and_then(|v| v.as_object()) {
                    for (id, rows) in map.iter() {
                        if let Some(arr) = rows.as_array() {
                            for (i, row) in arr.iter().enumerate() {
                                if row.is_null() {
                                    continue;
                                }
                                collector.add(
                                    row.get("text").and_then(|v| v.as_str()).unwrap_or(""),
                                    &file,
                                    Some(&format!("{}.schedule{}", id, i)),
                                );
                            }
                        }
                    }
                }
            }
            "points.js" => {
                if let Some(map) = data.get("points").and_then(|v| v.as_object()) {
                    for (id, rows) in map.iter() {
                        collector.add_array(Some(rows), &file, Some(&format!("{}.keywords", id)));
                    }
                }
            }
            "news.js" => {
                if let Some(map) = data.get("hotspots").and_then(|v| v.as_object()) {
                    for (id, rows) in map.iter() {
                        if let Some(arr) = rows.as_array() {
                            for (i, post) in arr.iter().enumerate() {
                                if post.is_null() {
                                    continue;
                                }
                                let post_name = format!("{}.post{}", id, i);
                                collector.add(
                                    post.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                                    &file,
                                    Some(&format!("{}.title", post_name)),
                                );
                                collect_comment_names(
                                    post.get("comments"),
                                    "",
                                    &file,
                                    &post_name,
                                    collector,
                                );
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

fn collect_achievement_titles(root: &Path, collector: &mut Collector) {
    let path = root.join("js").join("main.js");
    let text = match fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return,
    };
    let marker = "var ACHIEVEMENT_TITLE_GROUPS = [";
    let start = match text.find(marker) {
        Some(i) => i,
        None => return,
    };
    let end = text[start..].find("\n  ];").map(|i| start + i);
    let snippet = match end {
        Some(e) if e > start => &text[start..e],
        _ => "",
    };
    if snippet.is_empty() {
        return;
    }
    let bytes = snippet.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if let Some(pos) = snippet[i..].find("text:") {
            let at = i + pos + 5;
            let rest = &snippet[at..];
            let ws = rest.len() - rest.trim_start().len();
            let after = &rest[ws..];
            if let Some(body) = after.strip_prefix('\'') {
                if let Some(q) = body.find('\'') {
                    collector.add(&body[..q], "js/main.js", Some("achievementTitle"));
                    i = at + ws + 1 + q + 1;
                    continue;
                }
            }
            i = at;
        } else {
            break;
        }
    }
}

pub fn run(root: &Path) -> i32 {
    let mut issues: Vec<Issue> = Vec::new();
    let mut csv_keys: Vec<String> = Vec::new();
    let mut csv_row_count = 0usize;
    let mut by_zh: HashMap<String, Vec<(String, String, Vec<String>, HashMap<String, usize>)>> = HashMap::new();

    for file in CSV_FILES {
        let path = root.join("i18n").join(file);
        let text = match fs::read_to_string(&path) {
            Ok(t) => t,
            Err(_) => {
                issues.push(Issue {
                    kind: "CSV_FILE_MISSING".into(),
                    text: String::new(),
                    locations: Vec::new(),
                    file: file.to_string(),
                    key: String::new(),
                    lang: String::new(),
                });
                continue;
            }
        };
        let rows = csv::parse(&text);
        if rows.is_empty() {
            issues.push(Issue {
                kind: "CSV_EMPTY".into(),
                text: String::new(),
                locations: Vec::new(),
                file: file.to_string(),
                key: String::new(),
                lang: String::new(),
            });
            continue;
        }
        let header: Vec<String> = rows[0].iter().map(|h| h.trim().to_string()).collect();
        let mut index: HashMap<String, usize> = HashMap::new();
        for (i, name) in header.iter().enumerate() {
            index.insert(name.clone(), i);
        }
        if !index.contains_key("key") || !index.contains_key("简体中文") {
            issues.push(Issue {
                kind: "CSV_HEADER".into(),
                text: header.join(","),
                locations: Vec::new(),
                file: file.to_string(),
                key: String::new(),
                lang: String::new(),
            });
            continue;
        }
        for lang in LANG_COLUMNS {
            if !index.contains_key(lang) {
                issues.push(Issue {
                    kind: "CSV_COLUMN_MISSING".into(),
                    text: lang.to_string(),
                    locations: Vec::new(),
                    file: file.to_string(),
                    key: String::new(),
                    lang: String::new(),
                });
            }
        }
        let key_idx = index["key"];
        let zh_idx = index["简体中文"];
        for row in rows.iter().skip(1) {
            if row.iter().all(|c| c.trim().is_empty()) {
                continue;
            }
            let key = row.get(key_idx).map(|s| s.trim().to_string()).unwrap_or_default();
            if key.is_empty() {
                continue;
            }
            let zh = row.get(zh_idx).map(|s| s.trim().to_string()).unwrap_or_default();
            csv_row_count += 1;
            if csv_keys.iter().any(|k| k == &key) {
                issues.push(Issue {
                    kind: "DUPLICATE_KEY".into(),
                    text: String::new(),
                    locations: Vec::new(),
                    file: file.to_string(),
                    key: key.clone(),
                    lang: String::new(),
                });
            }
            csv_keys.push(key.clone());
            if zh.is_empty() {
                issues.push(Issue {
                    kind: "EMPTY_SOURCE".into(),
                    text: String::new(),
                    locations: Vec::new(),
                    file: file.to_string(),
                    key: key.clone(),
                    lang: String::new(),
                });
            }
            let entry = by_zh.entry(zh.clone()).or_default();
            entry.push((file.to_string(), key.clone(), row.clone(), index.clone()));
            for lang in LANG_COLUMNS {
                let idx = match index.get(lang) {
                    Some(i) => *i,
                    None => continue,
                };
                let value = row.get(idx).map(|s| s.trim().to_string()).unwrap_or_default();
                if value.is_empty() {
                    issues.push(Issue {
                        kind: "MISSING_TRANSLATION".into(),
                        text: zh.clone(),
                        locations: Vec::new(),
                        file: file.to_string(),
                        key: key.clone(),
                        lang: lang.to_string(),
                    });
                }
            }
        }
    }

    let mut collector = Collector::new();
    collect_resources(root, &mut collector);
    collect_achievement_titles(root, &mut collector);

    for text in &collector.order {
        let rows = by_zh.get(text);
        match rows {
            Some(list) if !list.is_empty() => {
                for (file, key, row, index) in list {
                    for lang in LANG_COLUMNS {
                        let idx = match index.get(lang) {
                            Some(i) => *i,
                            None => continue,
                        };
                        let value = row.get(idx).map(|s| s.trim().to_string()).unwrap_or_default();
                        if value.is_empty() {
                            issues.push(Issue {
                                kind: "MISSING_TRANSLATION".into(),
                                text: text.clone(),
                                locations: Vec::new(),
                                file: file.clone(),
                                key: key.clone(),
                                lang: lang.to_string(),
                            });
                        }
                    }
                }
            }
            _ => issues.push(Issue {
                kind: "MISSING_SOURCE".into(),
                text: text.clone(),
                locations: collector.locations.get(text).cloned().unwrap_or_default(),
                file: String::new(),
                key: String::new(),
                lang: String::new(),
            }),
        }
    }

    let mut counts: HashMap<String, usize> = HashMap::new();
    for issue in &issues {
        *counts.entry(issue.kind.clone()).or_insert(0) += 1;
    }
    println!("Translation check");
    println!("  source text: {}", collector.order.len());
    println!("  CSV rows: {} / keys: {}", csv_row_count, csv_keys.len());
    println!("  issues: {}", issues.len());
    let mut kinds: Vec<&String> = counts.keys().collect();
    kinds.sort();
    for kind in kinds {
        println!("  {}: {}", kind, counts[kind]);
    }
    if !issues.is_empty() {
        println!();
        for issue in issues.iter().take(300) {
            if issue.kind == "MISSING_SOURCE" {
                let locs: Vec<String> = issue.locations.iter().take(3).cloned().collect();
                println!("[MISSING SOURCE] {}  <- {}", issue.text, locs.join(", "));
            } else if issue.kind == "MISSING_TRANSLATION" {
                println!(
                    "[MISSING TRANSLATION] {} | {} | {}{}",
                    issue.file,
                    issue.key,
                    issue.lang,
                    if issue.text.is_empty() { String::new() } else { format!(" | {}", issue.text) }
                );
            } else {
                println!("[{}] text={} file={} key={} lang={}", issue.kind, issue.text, issue.file, issue.key, issue.lang);
            }
        }
        if issues.len() > 300 {
            println!("... {} more issues", issues.len() - 300);
        }
    }
    if issues.is_empty() { 0 } else { 1 }
}
