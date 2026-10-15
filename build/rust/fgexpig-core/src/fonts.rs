use std::path::{Path, PathBuf};

/// exe 内置字体：网站请求 /fonts/xxx 时直接返回打包进 exe 的字体（与 server.js 一致）
const BUNDLED_FONTS: [(&str, &str); 8] = [
    ("等距更纱黑体(默认).woff", "default.woff"),
    ("等距更纱黑体(默认).ttf", "default.woff"),
    ("楷体.woff", "kaiti.woff"),
    ("楷体.ttf", "kaiti.woff"),
    ("萌芽熊体.woff", "mengya.woff"),
    ("萌芽熊体.ttf", "mengya.woff"),
    ("山海仲夏夜物语.woff", "shanhai.woff"),
    ("山海仲夏夜物语.ttf", "shanhai.woff"),
];

/// assets_dir = 壳程序自己的 assets 目录（里面有 fonts/）
pub fn bundled_font(assets_dir: &Path, pathname: &str) -> Option<PathBuf> {
    let rest = pathname.strip_prefix("/fonts/")?;
    let name = crate::paths::percent_decode(rest);
    let target = BUNDLED_FONTS.iter().find(|(from, _)| *from == name)?.1;
    let file = assets_dir.join("fonts").join(target);
    if file.is_file() {
        Some(file)
    } else {
        None
    }
}
