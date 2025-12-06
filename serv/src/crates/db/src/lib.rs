use std::time::{SystemTime, UNIX_EPOCH};
use napi_derive::napi;

#[napi]
pub fn time_diff(msg: String) -> String {
    let start = SystemTime::now();
    let time = match start.duration_since(UNIX_EPOCH) {
        Ok(dse) => dse,
        Err(e) => e.duration(),
    };
    format!("{msg}: {:?}", time)
}
