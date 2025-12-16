use napi_derive::napi;
pub use tokio_postgres::Row;
use tokio::sync::OnceCell;
use deadpool_postgres::Pool;
use serde::{Serialize, Deserialize};

pub static DB_POOL_USERS: OnceCell<Pool> = OnceCell::const_new();
pub static DB_POOL_GRIDS: OnceCell<Pool> = OnceCell::const_new();

#[napi(object)]
pub struct User {
    pub uid: String,
    pub email: String,
    pub pwd_hash: Option<String>,
    pub oauth_provider: Option<String>,
    pub create_time: f64,
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
    pub email:  String,
}
