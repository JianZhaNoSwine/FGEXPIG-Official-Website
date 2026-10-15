/* 本地静态服务：与 electron/server.js 行为对齐
   - 只接受 GET/HEAD；其他 405
   - 文本资源 no-store，其它 public,max-age=3600
   - 支持 Range（206/416）、HEAD
   - /fonts/ 路径优先返回壳程序内置字体
   - 本地缺失时：只对「清单里存在的路径」回源到线上，且同一会话内 404/410 只回源一次 */
use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use tiny_http::{Header, Method, Response, Server, StatusCode};

use crate::manifest;
use crate::paths::{is_text_asset, normalize_remote_key, safe_local_path};

const H_CONTENT_RANGE: &str = "Content-Range";
const H_CONTENT_LENGTH: &str = "Content-Length";
const H_CONTENT_TYPE: &str = "Content-Type";
const H_ACCEPT_RANGES: &str = "Accept-Ranges";
const H_CACHE_CONTROL: &str = "Cache-Control";

pub fn mime_type(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    let ext = lower.rsplit('.').next().unwrap_or("");
    match ext {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "application/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "txt" => "text/plain; charset=utf-8",
        "xml" => "application/xml; charset=utf-8",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        _ => "application/octet-stream",
    }
}

pub struct StaticServer {
    pub port: u16,
    _handle: std::thread::JoinHandle<()>,
}

fn load_manifest_paths(root: &Path) -> Option<HashSet<String>> {
    for name in [crate::LOCAL_MANIFEST_NAME, crate::MANIFEST_NAME] {
        let path = root.join(name);
        if let Ok(text) = fs::read_to_string(&path) {
            if let Some(m) = manifest::parse_manifest(&text) {
                let set: HashSet<String> = m
                    .files
                    .iter()
                    .map(|e| normalize_remote_key(&e.path))
                    .collect();
                if !set.is_empty() {
                    return Some(set);
                }
            }
        }
    }
    None
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).unwrap()
}

/// 启动服务（port=0 时由系统分配）
pub fn start(
    root: PathBuf,
    assets_dir: PathBuf,
    port: u16,
    fallback_base_url: String,
) -> Result<StaticServer, String> {
    let server = Server::http(("127.0.0.1", port)).map_err(|e| e.to_string())?;
    let actual = server
        .server_addr()
        .to_ip()
        .map(|a| a.port())
        .unwrap_or(port);
    let manifest_paths = load_manifest_paths(&root);
    let remote_misses: Arc<Mutex<HashSet<String>>> = Arc::new(Mutex::new(HashSet::new()));
    let handle = std::thread::spawn(move || {
        for request in server.incoming_requests() {
            handle_request(&root, &assets_dir, &fallback_base_url, &manifest_paths, &remote_misses, request);
        }
    });
    Ok(StaticServer { port: actual, _handle: handle })
}

fn handle_request(
    root: &Path,
    assets_dir: &Path,
    fallback_base_url: &str,
    manifest_paths: &Option<HashSet<String>>,
    remote_misses: &Arc<Mutex<HashSet<String>>>,
    request: tiny_http::Request,
) {
    let method = request.method().clone();
    if method != Method::Get && method != Method::Head {
        let _ = request.respond(
            Response::empty(StatusCode(405)).with_header(header("Allow", "GET, HEAD")),
        );
        return;
    }
    let raw_url = request.url().to_string();
    let pathname = match url_pathname(&raw_url) {
        Some(p) => p,
        None => {
            let _ = request.respond(Response::empty(StatusCode(400)));
            return;
        }
    };
    let pathname = if pathname.ends_with('/') {
        format!("{}index.html", pathname)
    } else {
        pathname
    };

    let file_path = match safe_local_path(root, &pathname) {
        Some(p) => p,
        None => {
            let _ = request.respond(Response::empty(StatusCode(403)));
            return;
        }
    };

    // 内置字体优先
    if let Some(font) = crate::fonts::bundled_font(assets_dir, &pathname) {
        match fs::metadata(&font) {
            Ok(stat) if stat.is_file() => {
                send_file(request, &font, stat.len(), &method);
            }
            _ => {
                let _ = request.respond(Response::empty(StatusCode(404)));
            }
        }
        return;
    }

    if let Ok(stat) = fs::metadata(&file_path) {
        if stat.is_file() {
            send_file(request, &file_path, stat.len(), &method);
            return;
        }
    }

    let key = normalize_remote_key(&pathname);
    if let Some(paths) = manifest_paths {
        if !paths.contains(&key) {
            let _ = request.respond(Response::empty(StatusCode(404)));
            return;
        }
    }
    if remote_misses.lock().unwrap().contains(&key) {
        let _ = request.respond(Response::empty(StatusCode(404)));
        return;
    }
    proxy_remote(request, fallback_base_url, &raw_url, &key, remote_misses, &method);
}

fn url_pathname(raw: &str) -> Option<String> {
    let without_query = raw.split('?').next().unwrap_or("");
    if !without_query.starts_with('/') {
        return None;
    }
    Some(without_query.to_string())
}

fn range_headers(file_path: &str, size: u64, range: Option<&str>) -> (u16, Vec<Header>, Option<(u64, u64)>) {
    let text = is_text_asset(file_path);
    let cache_control = if text { "no-store" } else { "public, max-age=3600" };
    let mut headers: Vec<Header> = Vec::new();
    headers.push(header(H_CONTENT_TYPE, mime_type(file_path)));
    headers.push(header(H_ACCEPT_RANGES, "bytes"));
    headers.push(header(H_CACHE_CONTROL, cache_control));
    let range = match range {
        Some(r) => r,
        None => {
            headers.push(header(H_CONTENT_LENGTH, &size.to_string()));
            return (200, headers, None);
        }
    };
    let spec = range.trim().trim_start_matches("bytes=");
    let mut parts = spec.splitn(2, '-');
    let start_raw = parts.next().unwrap_or("").trim().to_string();
    let end_raw = parts.next().unwrap_or("").trim().to_string();
    let parsed = if start_raw.is_empty() {
        // 后缀范围：bytes=-N
        match end_raw.parse::<u64>() {
            Ok(n) if n > 0 && n <= size => {
                let start = size - n;
                Some((start, size - 1))
            }
            _ => None,
        }
    } else {
        match start_raw.parse::<u64>() {
            Ok(start) if start < size => {
                let end = if end_raw.is_empty() {
                    size - 1
                } else {
                    match end_raw.parse::<u64>() {
                        Ok(e) => e.min(size - 1),
                        Err(_) => {
                            let star = format!("bytes */{}", size);
                            return (416, vec![header(H_CONTENT_RANGE, &star)], None);
                        }
                    }
                };
                if start > end {
                    None
                } else {
                    Some((start, end))
                }
            }
            _ => None,
        }
    };
    match parsed {
        Some((start, end)) => {
            let cr = format!("bytes {}-{}/{}", start, end, size);
            headers.push(header(H_CONTENT_RANGE, &cr));
            headers.push(header(H_CONTENT_LENGTH, &(end - start + 1).to_string()));
            (206, headers, Some((start, end)))
        }
        None => {
            let star = format!("bytes */{}", size);
            let mut h: Vec<Header> = Vec::new();
            h.push(header(H_CONTENT_RANGE, &star));
            h.push(header(H_CONTENT_TYPE, "text/plain; charset=utf-8"));
            (416, h, None)
        }
    }
}

fn log_416() {}

fn send_file(request: tiny_http::Request, file_path: &Path, size: u64, method: &Method) {
    let range = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Range"))
        .map(|h| h.value.as_str().to_string());
    let (status, headers, slice) = range_headers(&file_path.to_string_lossy(), size, range.as_deref());
    let response_status = StatusCode(status);

    if *method == Method::Head {
        let mut resp = Response::empty(response_status);
        for h in headers {
            resp = resp.with_header(h);
        }
        let _ = request.respond(resp);
        return;
    }

    let body: Box<dyn Read + Send> = match slice {
        Some((start, end)) => {
            let mut file = match fs::File::open(file_path) {
                Ok(f) => f,
                Err(_) => {
                    let _ = request.respond(Response::empty(StatusCode(500)));
                    return;
                }
            };
            if std::io::Seek::seek(&mut file, std::io::SeekFrom::Start(start)).is_err() {
                let _ = request.respond(Response::empty(StatusCode(500)));
                return;
            }
            let len = (end - start + 1) as usize;
            Box::new(std::io::Read::take(file, len as u64))
        }
        None => match fs::File::open(file_path) {
            Ok(f) => Box::new(f),
            Err(_) => {
                let _ = request.respond(Response::empty(StatusCode(500)));
                return;
            }
        },
    };
    let body_len = match slice {
        Some((start, end)) => (end - start + 1) as usize,
        None => size as usize,
    };
    let mut resp = Response::new(response_status, Vec::new(), body, Some(body_len), None);
    for h in headers {
        resp = resp.with_header(h);
    }
    let _ = request.respond(resp);
}

fn proxy_remote(
    request: tiny_http::Request,
    fallback_base_url: &str,
    raw_url: &str,
    cache_key: &str,
    remote_misses: &Arc<Mutex<HashSet<String>>>,
    method: &Method,
) {
    if fallback_base_url.is_empty() {
        let _ = request.respond(Response::empty(StatusCode(404)));
        return;
    }
    let target = format!("{}{}", fallback_base_url.trim_end_matches('/'), raw_url);
    let range = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Range"))
        .map(|h| h.value.as_str().to_string());
    let upstream = match crate::http::get(&target, range.as_deref()) {
        Ok(r) => r,
        Err(_) => {
            remote_misses.lock().unwrap().insert(cache_key.to_string());
            let _ = request.respond(Response::empty(StatusCode(404)));
            return;
        }
    };
    let status = upstream.status;
    if status == 404 || status == 410 {
        remote_misses.lock().unwrap().insert(cache_key.to_string());
    }
    let mut headers: Vec<Header> = Vec::new();
    headers.push(header(H_CONTENT_TYPE, mime_type(cache_key)));
    headers.push(header(H_ACCEPT_RANGES, "bytes"));
    if let Some(len) = upstream.content_length {
        headers.push(header(H_CONTENT_LENGTH, &len.to_string()));
        if status == 206 {
            if let Some(range) = &range {
                let spec = range.trim().trim_start_matches("bytes=");
                let mut parts = spec.splitn(2, '-');
                let a = parts.next().unwrap_or("").trim();
                let b = parts.next().unwrap_or("").trim();
                let (start, end) = if a.is_empty() {
                    (len.saturating_sub(b.parse::<u64>().unwrap_or(0)), len - 1)
                } else {
                    (
                        a.parse::<u64>().unwrap_or(0),
                        if b.is_empty() { len - 1 } else { b.parse::<u64>().unwrap_or(len - 1) },
                    )
                };
                let cr = format!("bytes {}-{}/{}", start, end, len);
                headers.push(header(H_CONTENT_RANGE, &cr));
            }
        }
    }
    headers.push(header(H_CACHE_CONTROL, "no-store"));
    if *method == Method::Head {
        let mut resp = Response::empty(StatusCode(status));
        for h in headers {
            resp = resp.with_header(h);
        }
        let _ = request.respond(resp);
        return;
    }
    let body: Box<dyn Read + Send> = Box::new(upstream.reader());
    let body_len = upstream.content_length.map(|v| v as usize);
    let mut resp = Response::new(StatusCode(status), Vec::new(), body, body_len, None);
    for h in headers {
        resp = resp.with_header(h);
    }
    let _ = request.respond(resp);
}

/// 供测试：读一点点数据（避免未使用告警）
#[allow(dead_code)]
fn peek(mut r: impl Read) {
    let mut buf = [0u8; 1];
    let _ = r.read(&mut buf);
}
