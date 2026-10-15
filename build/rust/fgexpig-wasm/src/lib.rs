/* 前端复用的纯逻辑（编译为 wasm32-unknown-unknown，无 wasm-bindgen 依赖）
   与 js/main.js 的 buildPauseMapScoreRows() 同一套公式（方案 D）：
     Score = round(999983 x (0.30H + 0.70QC))
     H = 0.7 * P/(P+1000) + 0.3 * L/(L+800)
     Q = 0.45R + 0.45S + 0.10D'
     C = P/(P+1000)
     R = clip((rHat - Rmin)/(Rmax - Rmin), 0, 1), rHat = (L + 100*rBar)/(P + 100)
     S = qHat/(qHat + 10),                        qHat = (L + 100*qBar)/(D + 100)
     D' = 1 - dHat/(dHat + dBar),                 dHat = (D + 100*dBar)/(P + 100) */
#![no_std]

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}

#[no_mangle]
pub extern "C" fn map_score(
    plays: f64,
    likes: f64,
    dislikes: f64,
    r_bar: f64,
    q_bar: f64,
    d_bar: f64,
    r_min: f64,
    r_max: f64,
) -> f64 {
    let p = if plays > 0.0 { plays } else { 0.0 };
    let l = if likes > 0.0 { likes } else { 0.0 };
    let d = if dislikes > 0.0 { dislikes } else { 0.0 };

    let r_hat = (l + 100.0 * r_bar) / (p + 100.0);
    let r = if r_max > r_min {
        let v = (r_hat - r_min) / (r_max - r_min);
        if v < 0.0 {
            0.0
        } else if v > 1.0 {
            1.0
        } else {
            v
        }
    } else {
        0.0
    };
    let q_hat = (l + 100.0 * q_bar) / (d + 100.0);
    let s = q_hat / (q_hat + 10.0);
    let d_hat = (d + 100.0 * d_bar) / (p + 100.0);
    let d_prime = 1.0 - d_hat / (d_hat + d_bar);
    let h = 0.7 * p / (p + 1000.0) + 0.3 * l / (l + 800.0);
    let q = 0.45 * r + 0.45 * s + 0.10 * d_prime;
    let c = p / (p + 1000.0);
    round(999983.0 * (0.30 * h + 0.70 * q * c))
}

#[inline]
fn round(v: f64) -> f64 {
    // no_std 下 f64::round 需要 std/libm，这里用等价实现（分数恒为非负）
    if v <= 0.0 {
        return 0.0;
    }
    (v + 0.5) as i64 as f64
}
