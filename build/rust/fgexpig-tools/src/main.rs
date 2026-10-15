/* FGEXPIG 构建工具（Rust 版）
   子命令：
     i18n-pack       生成 i18n/index.js + i18n/lang 语言包（等价已移除的 build-i18n-pack.js）
     manifest        生成 desktop-manifest.json（等价已移除的 build-desktop-manifest.js）
     check-i18n      翻译检查（等价已移除的 check-untranslated.js）
     password-hash   管理员密码哈希（等价已移除的 make-password-hash.js）
   默认根目录 = 当前工作目录；可用 --root <dir> 指定。 */
mod check_i18n;
mod csv;
mod datafile;
mod i18n_pack;
mod manifest;
mod pwhash;
mod time;

use std::path::PathBuf;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut root: Option<PathBuf> = None;
    let mut rest: Vec<String> = Vec::new();
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--root" && i + 1 < args.len() {
            root = Some(PathBuf::from(&args[i + 1]));
            i += 2;
            continue;
        }
        rest.push(args[i].clone());
        i += 1;
    }
    let cmd = rest.first().cloned().unwrap_or_default();
    let root = match root {
        Some(p) => p,
        None => std::env::current_dir().expect("cannot read current dir"),
    };
    if !root.join("i18n").join("ui-strings.csv").exists() {
        eprintln!(
            "[ERROR] 这里不是项目根目录（找不到 i18n/ui-strings.csv）：{}",
            root.display()
        );
        std::process::exit(2);
    }
    let code = match cmd.as_str() {
        "i18n-pack" => i18n_pack::run(&root),
        "manifest" => manifest::run(&root),
        "check-i18n" => check_i18n::run(&root),
        "password-hash" => pwhash::run(&rest[1..]),
        "" | "-h" | "--help" | "help" => {
            println!("FGEXPIG 构建工具（Rust）");
            println!("  fgexpig-tools i18n-pack       生成 i18n/index.js + i18n/lang 语言包");
            println!("  fgexpig-tools manifest        生成 desktop-manifest.json");
            println!("  fgexpig-tools check-i18n      翻译检查");
            println!("  fgexpig-tools password-hash <新密码>");
            println!("  可选：--root <项目根目录>（默认当前目录）");
            0
        }
        other => {
            eprintln!("[ERROR] 未知子命令：{}（用 --help 查看）", other);
            2
        }
    };
    std::process::exit(code);
}
