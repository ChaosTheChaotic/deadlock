use napi_derive::napi;
pub use tokio_postgres::Row;
use tokio::sync::OnceCell;
use deadpool_postgres::Pool;

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
