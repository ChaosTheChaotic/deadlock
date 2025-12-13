use deadpool_postgres::{ManagerConfig, Pool, RecyclingMethod};
use napi_derive::napi;
use tokio::sync::OnceCell;
use tokio_postgres::NoTls;

static DB_POOL_USERS: OnceCell<Pool> = OnceCell::const_new();
static DB_POOL_GRIDS: OnceCell<Pool> = OnceCell::const_new();

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
        recycling_method: RecyclingMethod::Fast,
    });

    cfg.create_pool(Some(deadpool_postgres::Runtime::Tokio1), NoTls)
        .map_err(|e| format!("Failed to create pool: {}", e))
}

#[napi]
pub async fn initialize_dbs() {
    DB_POOL_USERS
        .get_or_init(|| async { init_db_pool("uidb").await.expect("Failed to init db pool") })
        .await;
    DB_POOL_GRIDS
        .get_or_init(|| async { init_db_pool("grids").await.expect("Failed to init db pool") })
        .await;
}

pub fn get_uidb_pool() -> &'static Pool {
    DB_POOL_USERS
        .get()
        .expect("Database pool not initialized. Call initialize_db() first.")
}

pub fn get_grids_pool() -> &'static Pool {
    DB_POOL_GRIDS
        .get()
        .expect("Database pool not initialized. Call initialize_db() first.")
}

#[napi]
pub async fn connect_db() -> napi::Result<String> {
    // Test connection
    let ui_client = get_uidb_pool()
        .get()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to get client from pool: {}", e)))?;

    // Execute a simple query to verify connection
    let ui_rows = ui_client
        .query("SELECT 1", &[])
        .await
        .map_err(|e| napi::Error::from_reason(format!("Query failed: {}", e)))?;

    let grids_client = get_grids_pool()
        .get()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to get client from pool: {e}")))?;
    let grid_rows = grids_client
        .query("SELECT 1", &[])
        .await
        .map_err(|e| napi::Error::from_reason(format!("Query failed: {e}")))?;

    Ok(format!(
        "Connected successfully. Test query of user info db and grids db returned: {} and {} row(s) respectively",
        ui_rows.len(),
        grid_rows.len()
    ))
}

