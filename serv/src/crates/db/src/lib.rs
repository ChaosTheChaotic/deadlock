use std::time::{SystemTime, UNIX_EPOCH};
use napi_derive::napi;
use once_cell::sync::OnceCell;
use tokio_postgres::NoTls;
use deadpool_postgres::{ManagerConfig, Pool, RecyclingMethod};

static DB_POOL: OnceCell<Pool> = OnceCell::new();

#[napi]
pub fn time_diff(msg: String) -> String {
    let start = SystemTime::now();
    let time = match start.duration_since(UNIX_EPOCH) {
        Ok(dse) => dse,
        Err(e) => e.duration(),
    };
    format!("{msg}: {:?}", time)
}

async fn init_db_pool() -> Result<Pool, String> {
    // Load environment variables
    dotenv::dotenv().ok();
    
    // Get environment variables with fallbacks
    let host = std::env::var("DB_HOST").unwrap_or_else(|_| "localhost".to_string());
    let port = std::env::var("DB_PORT")
        .unwrap_or_else(|_| "5432".to_string())
        .parse::<u16>()
        .map_err(|e| format!("Invalid DB_PORT: {}", e))?;
    let user = std::env::var("DB_USER").unwrap_or_else(|_| "postgres".to_string());
    let password = std::env::var("DB_PASSWD").unwrap_or_else(|_| "postgres".to_string());
    let dbname = std::env::var("DB_NAME").unwrap_or_else(|_| "postgres".to_string());

    // Configure connection pool
    let mut cfg = deadpool_postgres::Config::new();
    cfg.host = Some(host);
    cfg.port = Some(port);
    cfg.user = Some(user);
    cfg.password = Some(password);
    cfg.dbname = Some(dbname);
    
    // Pool configuration for better performance and security
    cfg.pool = Some(deadpool_postgres::PoolConfig {
        max_size: 16,
        timeouts: deadpool_postgres::Timeouts::default(),
        ..Default::default()
    });

    cfg.manager = Some(ManagerConfig { 
        recycling_method: RecyclingMethod::Fast 
    });
    
    // Create pool
    cfg.create_pool(Some(deadpool_postgres::Runtime::Tokio1), NoTls)
        .map_err(|e| format!("Failed to create pool: {}", e))
}

pub async fn initialize_db() {
    let pool = init_db_pool().await.expect("Failed to initialize database pool");
    DB_POOL.set(pool).expect("Database pool already initialized");
}

pub fn get_db_pool() -> &'static Pool {
    DB_POOL.get().expect("Database pool not initialized. Call initialize_db() first.")
}

#[napi]
pub async fn connect_db() -> napi::Result<String> {
    initialize_db().await;

    // Test connection
    let client = get_db_pool().get()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to get client from pool: {}", e)))?;
    
    // Execute a simple query to verify connection
    let rows = client.query("SELECT 1", &[])
        .await
        .map_err(|e| napi::Error::from_reason(format!("Query failed: {}", e)))?;
    
    Ok(format!("Connected successfully. Test query returned {} row(s)", rows.len()))
}
