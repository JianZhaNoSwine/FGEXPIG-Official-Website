/* 地图跑分 C+V3（wasm32-unknown-unknown，无 wasm-bindgen 依赖）：
   C = P × min(L/D, 10) × 10.24
   T = 0.75 / 1 / 1.5 / 2.25 / 3.25 / 4.5 / 6
       （点赞率 0~5 / 5~10 / 10~15 / 15~20 / 20~25 / 25~30 / 30+）
   Score = round(C × T)
   与 js/main.js 的 buildPauseMapScoreRows() 保持一致。 */
#![no_std]

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}

fn like_rate_tier(rate: f64) -> f64 {
    if rate < 0.05 {
        0.75
    } else if rate < 0.10 {
        1.0
    } else if rate < 0.15 {
        1.5
    } else if rate < 0.20 {
        2.25
    } else if rate < 0.25 {
        3.25
    } else if rate < 0.30 {
        4.5
    } else {
        6.0
    }
}

#[no_mangle]
pub extern "C" fn map_score(plays: f64, likes: f64, dislikes: f64) -> f64 {
    let p = if plays > 0.0 { plays } else { 0.0 };
    let l = if likes > 0.0 { likes } else { 0.0 };
    let d = if dislikes > 0.0 { dislikes } else { 0.0 };
    if p <= 0.0 {
        return 0.0;
    }
    let ratio = if d > 0.0 {
        l / d
    } else if l > 0.0 {
        10.0
    } else {
        0.0
    };
    let ratio = if ratio > 10.0 { 10.0 } else { ratio };
    round(p * ratio * 10.24 * like_rate_tier(l / p))
}

#[inline]
fn round(v: f64) -> f64 {
    // no_std 下 f64::round 需要 std/libm，这里用等价实现（分数恒为非负）
    if v <= 0.0 {
        return 0.0;
    }
    (v + 0.5) as i64 as f64
}
