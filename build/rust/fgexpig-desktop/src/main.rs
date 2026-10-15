/* FGEXPIG 桌面端 sidecar（阶段 1）
   用法：
     fgexpig-desktop serve --site-root <站点缓存目录> --assets <壳的 assets 目录> --port 37655
                          [--base-url https://fgexpig.cc/] [--one-shot-manifest]
     fgexpig-desktop selftest --site-root <目录> [--port 0]        # 起服务并打印端口后退出
     fgexpig-desktop sync --site-root <目录> --max-level 3 --quality 5
   壳（Electron/Tauri）用 stdin/stdout 的 JSON Lines 与之通信（见 fgexpig_core::ipc）。 */
use std::io::{BufRead, Write};
use std::path::PathBuf;

use fgexpig_core::ipc::{Command, Event};
use fgexpig_core::{manifest, server, sync};

struct Args {
    site_root: PathBuf,
    assets: PathBuf,
    port: u16,
    base_url: String,
    max_level: u32,
    quality: u32,
    /// 壳进程的 PID：壳异常退出时用它做看门狗，避免 sidecar 变孤儿占着端口
    parent_pid: Option<u32>,
}

/// 看门狗：打开父进程句柄并等待其退出，父进程一死就结束自己。
/// （只靠 stdin EOF 不够：WebView2 子进程会继承句柄，导致管道迟迟不关闭。）
#[cfg(windows)]
fn spawn_parent_watchdog(parent_pid: u32) {
    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut core::ffi::c_void;
        fn WaitForSingleObject(handle: *mut core::ffi::c_void, milliseconds: u32) -> u32;
        fn CloseHandle(handle: *mut core::ffi::c_void) -> i32;
    }
    const SYNCHRONIZE: u32 = 0x0010_0000;
    const INFINITE: u32 = 0xFFFF_FFFF;
    std::thread::spawn(move || unsafe {
        let handle = OpenProcess(SYNCHRONIZE, 0, parent_pid);
        if handle.is_null() {
            return;
        }
        WaitForSingleObject(handle, INFINITE);
        CloseHandle(handle);
        std::process::exit(0);
    });
}

#[cfg(not(windows))]
fn spawn_parent_watchdog(_parent_pid: u32) {}

fn parse_args(argv: &[String]) -> Result<(String, Args), String> {
    let mut sub = String::new();
    let mut site_root: Option<PathBuf> = None;
    let mut assets: Option<PathBuf> = None;
    let mut port: u16 = fgexpig_core::DEFAULT_PORT;
    let mut base_url = fgexpig_core::DEFAULT_BASE_URL.to_string();
    let mut max_level: u32 = 3;
    let mut quality: u32 = 5;
    let mut parent_pid: Option<u32> = None;
    let mut i = 0;
    while i < argv.len() {
        let key = argv[i].as_str();
        let mut next = || -> String { String::new() };
        match key {
            "serve" | "selftest" | "sync" | "help" | "--help" | "-h" => sub = key.to_string(),
            "--site-root" => {
                i += 1;
                site_root = argv.get(i).map(PathBuf::from);
            }
            "--assets" => {
                i += 1;
                assets = argv.get(i).map(PathBuf::from);
            }
            "--port" => {
                i += 1;
                port = argv
                    .get(i)
                    .and_then(|v| v.parse::<u16>().ok())
                    .ok_or_else(|| "--port 需要一个整数".to_string())?;
            }
            "--parent-pid" => {
                i += 1;
                parent_pid = argv.get(i).and_then(|v| v.parse::<u32>().ok());
            }
            "--base-url" => {
                i += 1;
                base_url = argv.get(i).cloned().unwrap_or(base_url);
            }
            "--max-level" => {
                i += 1;
                max_level = argv.get(i).and_then(|v| v.parse().ok()).unwrap_or(3);
            }
            "--quality" => {
                i += 1;
                quality = argv.get(i).and_then(|v| v.parse().ok()).unwrap_or(5);
            }
            other => return Err(format!("未知参数：{}", other)),
        }
        let _ = next();
        i += 1;
    }
    let site_root = site_root.ok_or_else(|| "缺少 --site-root".to_string())?;
    let assets = assets.unwrap_or_else(|| PathBuf::from("assets"));
    Ok((
        sub,
        Args { site_root, assets, port, base_url, max_level, quality, parent_pid },
    ))
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    if argv.is_empty() || argv[0] == "--help" || argv[0] == "-h" || argv[0] == "help" {
        println!("用法：fgexpig-desktop serve --site-root <dir> [--assets <dir>] [--port 37655] [--base-url https://fgexpig.cc/]");
        std::process::exit(2);
    }
    let (sub, args) = match parse_args(&argv) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[ERROR] {}", e);
            std::process::exit(2);
        }
    };
    match sub.as_str() {
        "serve" => run_serve(args),
        "selftest" => run_selftest(args),
        "sync" => run_sync(args),
        _ => {
            println!("用法：fgexpig-desktop serve --site-root <dir> [--assets <dir>] [--port 37655]");
            std::process::exit(2);
        }
    }
}

fn emit(event: Event) {
    let line = event.to_line();
    let mut out = std::io::stdout();
    let _ = writeln!(out, "{}", line);
    let _ = out.flush();
}

/// 侧车主循环：起本地服务 + 逐条处理 stdin 命令
fn run_serve(args: Args) {
    if let Some(pid) = args.parent_pid {
        spawn_parent_watchdog(pid);
    }
    // 端口可能被上一轮残留进程占用（例如壳被强杀、sidecar 变孤儿）：依次尝试后续端口，
    // 避免"绑不上端口 → 静默退出 → 壳卡在启动器"这种无法自愈的状态。
    // 先牢牢占住首选端口：端口决定页面 origin，而 localStorage 是按 origin 隔离的，
    // 所以能不动端口就不要动（多试几次，等上一轮的 socket 释放）。
    let mut started: Option<server::StaticServer> = None;
    let mut last_error = String::new();
    for attempt in 0..6u32 {
        match server::start(
            args.site_root.clone(),
            args.assets.clone(),
            args.port,
            args.base_url.clone(),
        ) {
            Ok(s) => {
                started = Some(s);
                break;
            }
            Err(e) => {
                last_error = e;
                if attempt < 5 {
                    std::thread::sleep(std::time::Duration::from_millis(400));
                }
            }
        }
        if started.is_some() {
            break;
        }
    }
    for offset in 1..16u16 {
        if started.is_some() {
            break;
        }
        let port = args.port.saturating_add(offset);
        match server::start(
            args.site_root.clone(),
            args.assets.clone(),
            port,
            args.base_url.clone(),
        ) {
            Ok(s) => {
                if offset > 0 {
                    eprintln!("[sidecar] 端口 {} 被占用，改用 {}", args.port, s.port);
                }
                started = Some(s);
                break;
            }
            Err(e) => last_error = e,
        }
    }
    let started = match started {
        Some(s) => s,
        None => {
            emit(Event::Error { op: "serve".into(), message: last_error });
            std::process::exit(1);
        }
    };
    emit(Event::Ready {
        port: started.port,
        site_root: args.site_root.display().to_string(),
        base_url: args.base_url.clone(),
    });

    let stdin = std::io::stdin();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.trim().is_empty() {
            continue;
        }
        let command = match Command::parse(&line) {
            Some(c) => c,
            None => {
                emit(Event::Error {
                    op: "parse".into(),
                    message: format!("无法解析命令：{}", line),
                });
                continue;
            }
        };
        match command {
            Command::Quit => break,
            Command::Manifest => handle_manifest(&args),
            Command::Wallpapers => handle_wallpapers(&args),
            Command::SyncPriority => handle_sync_entries(&args, true),
            Command::SyncOther => handle_sync_entries(&args, false),
            Command::SyncPaths { paths } => handle_sync_paths(&args, paths),
            Command::Verify => handle_verify(&args),
            Command::Prune => handle_prune(&args),
            Command::SyncSite { max_level, quality } => {
                let level = if max_level == 0 { args.max_level } else { max_level };
                let q = if quality == 0 { args.quality } else { quality };
                handle_sync_site(&args, level, q)
            }
            Command::LocalState => {
                let (has_site, files, level, version) = sync::local_state(&args.site_root);
                emit(Event::LocalState { has_site, files, completed_level: level, version });
            }
        }
    }
    // 收到 quit / stdin 结束：直接退出（不等待后台服务线程）
    std::process::exit(0);
}

fn current_manifest(args: &Args) -> Option<manifest::Manifest> {
    match manifest::fetch_manifest(&args.base_url) {
        Ok(m) => Some(m),
        Err(err) => {
            eprintln!("[desktop] manifest fetch failed, fall back to local manifest: {}", err);
            manifest::read_local_manifest(&args.site_root)
        }
    }
}

fn handle_manifest(args: &Args) {
    let remote = manifest::fetch_manifest(&args.base_url);
    match remote {
        Ok(m) => emit(Event::Manifest {
            version: m.version.clone(),
            count: m.files.len(),
            source: "remote".into(),
        }),
        Err(err) => match manifest::read_local_manifest(&args.site_root) {
            Some(m) => emit(Event::Manifest {
                version: m.version.clone(),
                count: m.files.len(),
                source: "local".into(),
            }),
            None => emit(Event::Error { op: "manifest".into(), message: err }),
        },
    }
}

fn handle_wallpapers(args: &Args) {
    match current_manifest(args) {
        Some(m) => emit(Event::Wallpapers {
            list: manifest::collect_wallpapers(&args.base_url, &m),
        }),
        None => emit(Event::Error {
            op: "wallpapers".into(),
            message: "没有可用清单".into(),
        }),
    }
}

fn handle_sync_entries(args: &Args, priority: bool) {
    let op = if priority { "sync_priority" } else { "sync_other" };
    let m = match current_manifest(args) {
        Some(m) => m,
        None => {
            emit(Event::Error { op: op.into(), message: "没有可用清单".into() });
            return;
        }
    };
    let entries: Vec<manifest::Entry> = m
        .files
        .iter()
        .filter(|e| {
            if sync::is_bundled_asset(e) {
                return false;
            }
            if priority {
                sync::is_priority_entry(e)
            } else {
                !sync::is_priority_entry(e)
            }
        })
        .cloned()
        .collect();
    let result = sync::sync_entries(&args.base_url, &args.site_root, &m, &entries, |p| {
        emit(Event::Progress {
            phase: p.phase,
            current: p.current,
            target: p.target,
            level: p.level,
            downloaded: p.downloaded,
            failed: p.failed,
        });
    });
    match result {
        Ok((target, downloaded)) => emit(Event::SyncDone { op: op.into(), target, downloaded }),
        Err(e) => emit(Event::Error { op: op.into(), message: e }),
    }
}

fn handle_sync_paths(args: &Args, paths: Vec<String>) {
    let m = match current_manifest(args) {
        Some(m) => m,
        None => {
            emit(Event::Error { op: "sync_paths".into(), message: "没有可用清单".into() });
            return;
        }
    };
    let entries: Vec<manifest::Entry> = m
        .files
        .iter()
        .filter(|e| paths.iter().any(|p| p == &e.path) && !sync::is_bundled_asset(e))
        .cloned()
        .collect();
    match sync::sync_entries(&args.base_url, &args.site_root, &m, &entries, |p| {
        emit(Event::Progress {
            phase: p.phase,
            current: p.current,
            target: p.target,
            level: p.level,
            downloaded: p.downloaded,
            failed: p.failed,
        });
    }) {
        Ok((target, downloaded)) => emit(Event::SyncDone { op: "sync_paths".into(), target, downloaded }),
        Err(e) => emit(Event::Error { op: "sync_paths".into(), message: e }),
    }
}

fn handle_verify(args: &Args) {
    let m = match current_manifest(args) {
        Some(m) => m,
        None => {
            emit(Event::Error { op: "verify".into(), message: "没有可用清单".into() });
            return;
        }
    };
    let entries: Vec<manifest::Entry> = m
        .files
        .iter()
        .filter(|e| !sync::is_bundled_asset(e))
        .cloned()
        .collect();
    match sync::verify_entries(&args.site_root, &entries, |p| {
        emit(Event::Progress {
            phase: p.phase,
            current: p.current,
            target: p.target,
            level: p.level,
            downloaded: p.downloaded,
            failed: p.failed,
        });
    }) {
        Ok(failed) => emit(Event::VerifyDone {
            target: entries.len(),
            failed,
        }),
        Err(e) => emit(Event::Error { op: "verify".into(), message: e }),
    }
}

fn handle_prune(args: &Args) {
    match current_manifest(args) {
        Some(m) => emit(Event::Pruned {
            count: sync::prune_stale_files(&args.site_root, &m),
        }),
        None => emit(Event::Error { op: "prune".into(), message: "没有可用清单".into() }),
    }
}

fn handle_sync_site(args: &Args, level: u32, quality: u32) {
    match sync::sync_site(&args.base_url, &args.site_root, level, quality, |p| {
        emit(Event::Progress {
            phase: p.phase,
            current: p.current,
            target: p.target,
            level: p.level,
            downloaded: p.downloaded,
            failed: p.failed,
        });
    }) {
        Ok(r) => emit(Event::SyncSiteDone {
            version: r.version,
            count: r.count,
            level: r.level,
            quality: r.quality,
            completed_level: r.completed_level,
            pruned: r.pruned,
        }),
        Err(e) => emit(Event::Error { op: "sync_site".into(), message: e }),
    }
}

/// 自检：起服务，打印端口，收到任意输入后退出（供脚本/测试用）
fn run_selftest(args: Args) {
    match server::start(args.site_root.clone(), args.assets.clone(), args.port, args.base_url.clone()) {
        Ok(s) => {
            println!("listening {}", s.port);
            let _ = std::io::stdout().flush();
            let mut line = String::new();
            let _ = std::io::stdin().read_line(&mut line);
        }
        Err(e) => {
            eprintln!("[ERROR] {}", e);
            std::process::exit(1);
        }
    }
}

/// 一次性整站同步（开发/测试用）
fn run_sync(args: Args) {
    match sync::sync_site(&args.base_url, &args.site_root, args.max_level, args.quality, |p| {
        if p.phase == "download" && (p.current % 50 == 0 || p.current == p.target) {
            println!("{} {}/{}", p.phase, p.current, p.target);
        }
    }) {
        Ok(r) => println!(
            "sync done: version={} files={} level={} quality={} completedLevel={} pruned={}",
            r.version, r.count, r.level, r.quality, r.completed_level, r.pruned
        ),
        Err(e) => {
            eprintln!("[ERROR] {}", e);
            std::process::exit(1);
        }
    }
}
