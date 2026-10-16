/* 极简 HTTPS 客户端：直接调用系统 WinHTTP（Schannel 提供 TLS）
   这样就不需要 windows-sys / ring / cc，也就不需要 C 工具链。
   仅实现桌面端用得到的：GET（可选 Range）、流式读取响应体、读状态码与 Content-Length。 */
use std::io::Read;
use std::os::windows::ffi::OsStrExt;
use std::ptr;
use std::sync::{Arc, OnceLock};

type Handle = *mut core::ffi::c_void;

#[link(name = "winhttp")]
extern "system" {
    fn WinHttpOpen(
        agent: *const u16,
        access_type: u32,
        proxy: *const u16,
        bypass: *const u16,
        flags: u32,
    ) -> Handle;
    fn WinHttpConnect(session: Handle, server: *const u16, port: u16, reserved: u32) -> Handle;
    fn WinHttpOpenRequest(
        connect: Handle,
        verb: *const u16,
        object: *const u16,
        version: *const u16,
        referrer: *const u16,
        accept_types: *const *const u16,
        flags: u32,
    ) -> Handle;
    fn WinHttpSendRequest(
        request: Handle,
        headers: *const u16,
        headers_length: u32,
        optional: *mut core::ffi::c_void,
        optional_length: u32,
        total_length: u32,
        context: usize,
    ) -> i32;
    fn WinHttpReceiveResponse(request: Handle, reserved: *mut core::ffi::c_void) -> i32;
    fn WinHttpQueryHeaders(
        request: Handle,
        info_level: u32,
        name: *const u16,
        buffer: *mut core::ffi::c_void,
        buffer_length: *mut u32,
        index: *mut u32,
    ) -> i32;
    fn WinHttpQueryDataAvailable(request: Handle, bytes_available: *mut u32) -> i32;
    fn WinHttpReadData(
        request: Handle,
        buffer: *mut core::ffi::c_void,
        to_read: u32,
        read: *mut u32,
    ) -> i32;
    fn WinHttpCloseHandle(handle: Handle) -> i32;
    fn WinHttpSetTimeouts(handle: Handle, resolve: i32, connect: i32, send: i32, receive: i32) -> i32;
}

const ACCESS_TYPE_AUTOMATIC_PROXY: u32 = 4;
const FLAG_SECURE: u32 = 0x0080_0000;
const QUERY_STATUS_CODE: u32 = 19;
const QUERY_CONTENT_LENGTH: u32 = 5;
const QUERY_FLAG_NUMBER: u32 = 0x2000_0000;

fn wide(s: &str) -> Vec<u16> {
    std::ffi::OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

struct Raw {
    handle: Handle,
}

unsafe impl Send for Raw {}
unsafe impl Sync for Raw {}

impl Drop for Raw {
    fn drop(&mut self) {
        unsafe {
            WinHttpCloseHandle(self.handle);
        }
    }
}

struct Session(Handle);

impl Drop for Session {
    fn drop(&mut self) {
        unsafe {
            WinHttpCloseHandle(self.0);
        }
    }
}

fn session_handle() -> Arc<Session> {
    thread_local! {
        static SESSION: OnceLock<Arc<Session>> = OnceLock::new();
    }
    SESSION.with(|cell| {
        cell.get_or_init(|| {
            let handle = unsafe {
                let agent = wide("FGEXPIG-Desktop/0.1");
                let h = WinHttpOpen(
                    agent.as_ptr(),
                    ACCESS_TYPE_AUTOMATIC_PROXY,
                    ptr::null(),
                    ptr::null(),
                    0,
                );
                WinHttpSetTimeouts(h, 15000, 15000, 30000, 60000);
                h
            };
            Arc::new(Session(handle))
        })
        .clone()
    })
}

pub struct Response {
    pub status: u16,
    pub content_length: Option<u64>,
    raw: Arc<Raw>,
}

pub struct BodyReader {
    raw: Arc<Raw>,
    done: bool,
}

impl Response {
    /// 读取响应头（WinHTTP 按名字查询，WINHTTP_QUERY_CUSTOM = 65535）
    pub fn header(&self, name: &str) -> Option<String> {
        unsafe {
            let name_w = wide(name);
            let mut buffer = [0u16; 256];
            let mut length = (buffer.len() * 2) as u32;
            let ok = WinHttpQueryHeaders(
                self.raw.handle,
                65535,
                name_w.as_ptr(),
                buffer.as_mut_ptr() as *mut core::ffi::c_void,
                &mut length,
                ptr::null_mut(),
            );
            if ok == 0 {
                return None;
            }
            let chars = (length as usize / 2).saturating_sub(1);
            Some(String::from_utf16_lossy(&buffer[..chars.min(buffer.len())]))
        }
    }

    pub fn reader(&self) -> BodyReader {
        BodyReader {
            raw: Arc::clone(&self.raw),
            done: false,
        }
    }
}

impl Read for BodyReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if self.done || buf.is_empty() {
            return Ok(0);
        }
        unsafe {
            let mut available: u32 = 0;
            if WinHttpQueryDataAvailable(self.raw.handle, &mut available) == 0 {
                return Err(std::io::Error::last_os_error());
            }
            if available == 0 {
                self.done = true;
                return Ok(0);
            }
            let want = available.min(buf.len() as u32);
            let mut read: u32 = 0;
            if WinHttpReadData(
                self.raw.handle,
                buf.as_mut_ptr() as *mut core::ffi::c_void,
                want,
                &mut read,
            ) == 0
            {
                return Err(std::io::Error::last_os_error());
            }
            if read == 0 {
                self.done = true;
            }
            Ok(read as usize)
        }
    }
}

fn query_number(request: Handle, info_level: u32) -> Option<u64> {
    unsafe {
        let mut value: u32 = 0;
        let mut length = std::mem::size_of::<u32>() as u32;
        let ok = WinHttpQueryHeaders(
            request,
            info_level | QUERY_FLAG_NUMBER,
            ptr::null(),
            &mut value as *mut u32 as *mut core::ffi::c_void,
            &mut length,
            ptr::null_mut(),
        );
        if ok == 0 {
            None
        } else {
            Some(value as u64)
        }
    }
}

struct Url {
    host: String,
    port: u16,
    path: String,
    secure: bool,
}

fn parse_url(raw: &str) -> Result<Url, String> {
    let (secure, rest) = if let Some(r) = raw.strip_prefix("https://") {
        (true, r)
    } else if let Some(r) = raw.strip_prefix("http://") {
        (false, r)
    } else {
        return Err(format!("不支持的 URL：{}", raw));
    };
    let (authority, path) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, "/"),
    };
    let (host, port) = match authority.rsplit_once(':') {
        Some((h, p)) => (h.to_string(), p.parse::<u16>().map_err(|e| e.to_string())?),
        None => (authority.to_string(), if secure { 443 } else { 80 }),
    };
    if host.is_empty() {
        return Err(format!("URL 缺少主机名：{}", raw));
    }
    Ok(Url {
        host,
        port,
        path: path.to_string(),
        secure,
    })
}

/// 注意：`?` 必须原样保留。以前 '?' 会被编码成 %3F，
/// 导致本地服务回源 /css/style.css?v=xxx 这类带查询串的 URL 时线上 404，
/// 表现为「缓存没命中时进站黑屏（CSS/JS 全 404）」。
pub fn encode_url_path(path: &str) -> String {
    let mut out = String::new();
    for byte in path.as_bytes() {
        let c = *byte as char;
        let keep = c.is_ascii_alphanumeric()
            || matches!(
                c,
                '/' | '-' | '_' | '.' | '~' | '%' | '!' | '$' | '&' | '\'' | '(' | ')' | '*' | '+' | ',' | ';' | '=' | ':' | '@' | '?'
            );
        if keep {
            out.push(c);
        } else {
            out.push_str(&format!("%{:02X}", byte));
        }
    }
    out
}

/// GET（range 形如 "bytes=0-1023"）
pub fn get(url: &str, range: Option<&str>) -> Result<Response, String> {
    let parsed = parse_url(url)?;
    let session = session_handle();
    unsafe {
        let host = wide(&parsed.host);
        let connect = WinHttpConnect(session.0, host.as_ptr(), parsed.port, 0);
        if connect.is_null() {
            return Err(format!("WinHttpConnect 失败：{}", parsed.host));
        }
        let verb = wide("GET");
        let object = wide(&encode_url_path(&parsed.path));
        let flags = if parsed.secure { FLAG_SECURE } else { 0 };
        let request = WinHttpOpenRequest(
            connect,
            verb.as_ptr(),
            object.as_ptr(),
            ptr::null(),
            ptr::null(),
            ptr::null(),
            flags,
        );
        WinHttpCloseHandle(connect);
        if request.is_null() {
            return Err(format!("WinHttpOpenRequest 失败：{}", url));
        }
        let mut headers = String::from("Accept-Encoding: identity\r\nCache-Control: no-store\r\n");
        if let Some(r) = range {
            headers.push_str(&format!("Range: {}\r\n", r));
        }
        let headers_wide = wide(&headers);
        let ok = WinHttpSendRequest(
            request,
            headers_wide.as_ptr(),
            u32::MAX,
            ptr::null_mut(),
            0,
            0,
            0,
        );
        if ok == 0 {
            WinHttpCloseHandle(request);
            return Err(format!("WinHttpSendRequest 失败：{}", url));
        }
        if WinHttpReceiveResponse(request, ptr::null_mut()) == 0 {
            WinHttpCloseHandle(request);
            return Err(format!("WinHttpReceiveResponse 失败：{}", url));
        }
        let status = query_number(request, QUERY_STATUS_CODE).unwrap_or(0) as u16;
        let content_length = query_number(request, QUERY_CONTENT_LENGTH);
        Ok(Response {
            status,
            content_length,
            raw: Arc::new(Raw { handle: request }),
        })
    }
}

/// 下载到内存（小文件用，例如 desktop-manifest.json）
pub fn get_string(url: &str) -> Result<(u16, String), String> {
    let response = get(url, None)?;
    let mut reader = response.reader();
    let mut bytes: Vec<u8> = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .map_err(|e| format!("读取响应失败：{}", e))?;
    Ok((response.status, String::from_utf8_lossy(&bytes).to_string()))
}
