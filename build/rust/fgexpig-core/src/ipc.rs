/* sidecar 与壳之间的 JSON Lines 协议
   stdin：一行一条命令；stdout：一行一个事件 */
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum Command {
    /// 拉取远端清单（失败时壳可自行回退本地清单）
    Manifest,
    /// 同步「优先缓存」：wallpaper/ 下的图片与视频
    SyncPriority,
    /// 同步「其它缓存」：除优先缓存与内置字体外的全部条目
    SyncOther,
    /// 按给定路径重下（校验失败后的补下）
    SyncPaths { #[serde(default)] paths: Vec<String> },
    /// 校验全部条目（不含内置字体）
    Verify,
    /// 清理清单外的陈旧缓存
    Prune,
    /// 取启动器幻灯片用的壁纸地址
    Wallpapers,
    /// 整站同步（按 level / quality 过滤）——网页/开发模式用
    SyncSite { #[serde(default)] max_level: u32, #[serde(default)] quality: u32 },
    /// 本地缓存状态
    LocalState,
    Quit,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "ev", rename_all = "snake_case")]
pub enum Event {
    Ready { port: u16, site_root: String, base_url: String },
    Progress { phase: String, current: usize, target: usize, #[serde(skip_serializing_if = "Option::is_none")] level: Option<u32>, #[serde(skip_serializing_if = "Option::is_none")] downloaded: Option<usize>, #[serde(skip_serializing_if = "Option::is_none")] failed: Option<usize> },
    Manifest { version: String, count: usize, source: String },
    SyncDone { op: String, target: usize, downloaded: usize },
    VerifyDone { target: usize, failed: Vec<String> },
    Pruned { count: usize },
    Wallpapers { list: Vec<String> },
    SyncSiteDone { version: String, count: usize, level: u32, quality: u32, completed_level: u32, pruned: usize },
    LocalState { has_site: bool, files: usize, completed_level: u32, version: String },
    Error { op: String, message: String },
}

impl Event {
    pub fn to_line(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{\"ev\":\"error\",\"op\":\"serialize\",\"message\":\"failed\"}".to_string())
    }
}

impl Command {
    pub fn parse(line: &str) -> Option<Command> {
        serde_json::from_str::<Command>(line.trim()).ok()
    }
}
