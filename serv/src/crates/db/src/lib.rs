use deadpool_postgres::{ManagerConfig, Pool, RecyclingMethod};
use napi_derive::napi;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio_postgres::NoTls;
use tokio::sync::OnceCell;

#[napi(object)]
pub struct User {
    pub uid: String,
    pub email: String,
    pub pwd_hash: Option<String>,
    pub oauth_provider: Option<String>,
    pub create_time: f64,
}

static DB_POOL_USERS: OnceCell<Pool> = OnceCell::const_new();
static DB_POOL_GRIDS: OnceCell<Pool> = OnceCell::const_new();

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
        recycling_method: RecyclingMethod::Fast,
    });

    cfg.create_pool(Some(deadpool_postgres::Runtime::Tokio1), NoTls)
        .map_err(|e| format!("Failed to create pool: {}", e))
}

#[napi]
pub async fn initialize_dbs() {
    DB_POOL_USERS.get_or_init(|| async {
        init_db_pool("uidb").await.expect("Failed to init db pool")
    }).await;
    DB_POOL_GRIDS.get_or_init(|| async {
        init_db_pool("grids").await.expect("Failed to init db pool")
    }).await;
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

#[napi]
pub async fn search_users(email_str: String) -> napi::Result<Vec<User>> {
    let client = get_uidb_pool()
        .get()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to get client from pool: {e}")))?;

    // Use parameterized query to prevent SQL injection
    let stmt = client
        .prepare_cached(
            "SELECT 
                userid::text as userid, 
                email, 
                passwordhash, 
                oauthprovider, 
                date_part('epoch', creationtime) as creationtime
             FROM users 
             WHERE email ILIKE $1",
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to prepare cached: {e}")))?;

    // Execute query with parameter
    let rows = client
        .query(&stmt, &[&format!("%{}%", email_str)])
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to execute query: {e}")))?;

    // Map rows to User structs
    let users: Vec<User> = rows
        .into_iter()
        .map(|row| User {
            uid: row.get("userid"),
            email: row.get("email"),
            pwd_hash: row.get("passwordhash"),
            oauth_provider: row.get("oauthprovider"),
            // Convert timestamp to f64 (seconds since epoch)
            create_time: row.get::<_, f64>("creationtime"),
        })
        .collect();

    Ok(users)
}
