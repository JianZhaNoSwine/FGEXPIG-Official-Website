fn main() {
    // 应用的「自定义命令」需要显式声明权限，
    // 否则来自非本地源（http://127.0.0.1:<port> 的站点页面）的 IPC 会被 ACL 拒绝，
    // 表现为：网页里 window.FGEXPIG_DESKTOP 存在，但所有调用（分辨率/状态/地图数据）静默失败。
    let commands: &'static [&'static str] = &[
        "resolution_get",
        "resolution_set",
        "aspect_set",
        "state_load",
        "state_save",
        "state_report",
        "mapstats_store_get",
        "mapstats_store_set",
        "mapstats_fetch",
        "quit_app",
        "back_to_menu",
        "launcher_splash_done",
        "launcher_enter",
        "launcher_quit",
        "launcher_open_site",
        "launcher_github",
        "launcher_listener_ready",
        "launcher_listener_failed",
        "bridge_loaded",
        "bridge_failed",
    ];

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(commands)),
    )
    .expect("failed to run tauri-build");
}
