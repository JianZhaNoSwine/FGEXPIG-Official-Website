/* FGEXPIG 桌面端核心（阶段 1）
   与 electron/server.js + electron/updater.js 行为对齐：
     - 资源清单（desktop-manifest.json / 本地 .desktop-manifest.json）
     - 分级同步（3 级缓存：文本=1、非默认活动资源=2、表情包=2 …按清单 level 字段）
     - sha256 校验（文本类放宽为「存在且大小一致/大于 0」，因为 CDN 可能改写）
     - 静态服务（Range / no-store 文本 / 内置字体 / 清单外 404 / 缺文件回源） */
pub mod fonts;
pub mod http;
pub mod ipc;
pub mod manifest;
pub mod paths;
pub mod server;
pub mod sync;

pub const MANIFEST_NAME: &str = "desktop-manifest.json";
pub const LOCAL_MANIFEST_NAME: &str = ".desktop-manifest.json";
pub const DEFAULT_BASE_URL: &str = "https://fgexpig.cc/";
pub const DEFAULT_PORT: u16 = 37655;
