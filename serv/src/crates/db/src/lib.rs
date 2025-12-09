use std::time::{SystemTime, UNIX_EPOCH};
use napi_derive::napi;
use tokio_postgres::NoTls;

#[napi]
pub fn time_diff(msg: String) -> String {
    let start = SystemTime::now();
    let time = match start.duration_since(UNIX_EPOCH) {
        Ok(dse) => dse,
        Err(e) => e.duration(),
    };
    format!("{msg}: {:?}", time)
}

#[napi]
pub fn connect_db() -> Result<(), String> {
    let host = envcrypt::envc!("DB_HOST");
    let port = envcrypt::envc!("DB_PORT");
    let user = envcrypt::envc!("DB_USER");
    let passwd = envcrypt::envc!("DB_PASSWD");

    let (client, conn) = tokio_postgres::connect(format!("host={host} port={port} user={user}"), NoTls);
}
