use std::time::{SystemTime, UNIX_EPOCH};
use napi_derive::napi;
use once_cell::sync::OnceCell;
use tokio_postgres::NoTls;
use deadpool_postgres::{ManagerConfig, Pool, RecyclingMethod};

#[napi(object)]
pub struct User {
    pub uid: String,
    pub email: String,
    pub pwd_hash: Option<String>,
    pub oauth_provider: Option<String>,
    pub create_time: f64,
}

static DB_POOL_USERS: OnceCell<Pool> = OnceCell::new();
static DB_POOL_GRIDS: OnceCell<Pool> = OnceCell::new();

#[napi]
pub fn time_diff(msg: String) -> String {
    let start = SystemTime::now();
    let time = match start.duration_since(UNIX_EPOCH) {
        Ok(dse) => dse,
        Err(e) => e.duration(),
    };
    format!("{msg}: {:?}", time)
}

async fn init_db_pool(dbname: &str) -> Result<Pool, String> {
    dotenv::dotenv().ok();
    let host = std::env::var("DB_HOST").unwrap_or_else(|_| "localhost".to_string());
    let port = std::env::var("DB_PORT")
        .unwrap_or_else(|_| "5432".to_string())
        .parse::<u16>()
        .map_err(|e| format!("Invalid DB_PORT: {}", e))?;
    let user = std::env::var("DB_USER").unwrap_or_else(|_| "postgres".to_string());
    let password = std::env::var("DB_PASSWD").unwrap_or_else(|_| "postgres".to_string());

    let mut cfg = deadpool_postgres::Config::new();
    cfg.host = Some(host);
    cfg.port = Some(port);
    cfg.user = Some(user);
    cfg.password = Some(password);
    cfg.dbname = Some(dbname.to_string());
    
    cfg.pool = Some(deadpool_postgres::PoolConfig {
        max_size: 16,
        timeouts: deadpool_postgres::Timeouts::default(),
        ..Default::default()
    });

    cfg.manager = Some(ManagerConfig { 
        recycling_method: RecyclingMethod::Fast 
    });
    
    cfg.create_pool(Some(deadpool_postgres::Runtime::Tokio1), NoTls)
        .map_err(|e| format!("Failed to create pool: {}", e))
}

pub async fn initialize_dbs() {
    let users_pool = init_db_pool("uidb").await.expect("Failed to initialize database pool");
    DB_POOL_USERS.set(users_pool).expect("Database pool already initialized");

    let grids_pool = init_db_pool("grids").await.expect("Failed to initialize database pool");
    DB_POOL_USERS.set(grids_pool).expect("Database pool already initialized");
}

pub fn get_uidb_pool() -> &'static Pool {
    DB_POOL_USERS.get().expect("Database pool not initialized. Call initialize_db() first.")
}

pub fn get_grids_pool() -> &'static Pool {
    DB_POOL_GRIDS.get().expect("Database pool not initialized. Call initialize_db() first.")
}

#[napi]
pub async fn connect_db() -> napi::Result<String> {
    initialize_dbs().await;

    // Test connection
    let ui_client = get_uidb_pool().get()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to get client from pool: {}", e)))?;
    
    // Execute a simple query to verify connection
    let ui_rows = ui_client.query("SELECT 1", &[])
        .await
        .map_err(|e| napi::Error::from_reason(format!("Query failed: {}", e)))?;

    let grids_client = get_grids_pool().get().await.map_err(|e| napi::Error::from_reason(format!("Failed to get client from pool: {e}")))?;
    let grid_rows = grids_client.query("SELECT 1", &[]).await.map_err(|e| napi::Error::from_reason(format!("Query failed: {e}")))?;
    
    Ok(format!("Connected successfully. Test query of user info db and grids db returned: {} and {} row(s) respectively", ui_rows.len(), grid_rows.len()))
}
