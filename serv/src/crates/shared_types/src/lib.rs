use deadpool_postgres::Pool;
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use tokio::sync::OnceCell;
pub use tokio_postgres::Row;

pub static DB_POOL_USERS: OnceCell<Pool> = OnceCell::const_new();
pub static DB_POOL_GRIDS: OnceCell<Pool> = OnceCell::const_new();

#[napi(object)]
pub struct User {
    pub uid: String,
    pub email: String,
    pub pwd_hash: Option<String>,
    pub oauth_provider: Option<String>,
    pub oauth_provider_id: Option<String>,
    pub create_time: f64,
    pub roles: Vec<String>,
    pub perms: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expiry: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthContext {
    pub uid: String,
    pub email: String,
}

#[napi(object)]
pub struct LogEntry {
    pub id: i64,
    pub timestamp: String,
    pub level: String,
    pub source: String,
    pub message: String,
}
