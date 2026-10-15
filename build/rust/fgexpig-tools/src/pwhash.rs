use sha2::{Digest, Sha256};

const SALT: &str = "fgexpig::admin::v1";

pub fn run(args: &[String]) -> i32 {
    let pw = args.join(" ");
    if pw.is_empty() {
        println!("用法: fgexpig-tools password-hash 新密码");
        return 1;
    }
    let mut hasher = Sha256::new();
    hasher.update(format!("{}{}", SALT, pw).as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    println!();
    println!("salt : {}", SALT);
    println!("hash : {}", hash);
    println!();
    println!("把上面的 hash 填到 js/main.js 的 ADMIN_PASS_HASH 即可（记得升版本号）。");
    0
}
