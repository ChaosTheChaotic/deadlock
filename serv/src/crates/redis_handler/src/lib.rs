use deadpool_redis::redis::{self, AsyncCommands, RedisError};
use deadpool_redis::{Config, Runtime};
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::env;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::OnceCell;

static REDIS_POOL: OnceCell<deadpool_redis::Pool> = OnceCell::const_new();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct RefreshTokenData {
    pub user_id: String,
    pub email: String,
    pub jti: String,
    pub expires_at: i64,
    pub created_at: i64,
}

impl RefreshTokenData {
    pub fn is_expired(&self) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        self.expires_at <= now
    }
}

pub async fn init_redis() -> napi::Result<()> {
    dotenv::dotenv().ok();

    let redis_url = {
        let host = env::var("REDIS_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
        let port = env::var("REDIS_PORT").unwrap_or_else(|_| "6379".to_string());
        let password = env::var("REDIS_PASSWD").unwrap_or_else(|_| "".to_string());

        if password.is_empty() {
            format!("redis://{}:{}", host, port)
        } else {
            format!("redis://:{}@{}:{}", password, host, port)
        }
    };

    let cfg = Config::from_url(&redis_url);

    let pool = cfg.create_pool(Some(Runtime::Tokio1)).map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("Failed to create Redis pool: {}", e),
        )
    })?;

    // Test the connection
    let mut conn = pool.get().await.map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("Failed to get Redis connection: {}", e),
        )
    })?;

    // Simple ping test
    let _: String = redis::cmd("PING")
        .query_async(&mut conn)
        .await
        .map_err(|e| {
            napi::Error::new(
                napi::Status::GenericFailure,
                format!("Redis connection test failed: {}", e),
            )
        })?;

    REDIS_POOL.set(pool).map_err(|_| {
        napi::Error::new(
            napi::Status::GenericFailure,
            "Redis pool already initialized",
        )
    })?;

    Ok(())
}

fn get_redis_pool() -> napi::Result<&'static deadpool_redis::Pool> {
    REDIS_POOL.get().ok_or_else(|| {
        napi::Error::new(
            napi::Status::GenericFailure,
            "Redis pool not initialized. Call init_redis() first.",
        )
    })
}

pub async fn store_refresh_token(
    jti: String,
    user_id: String,
    email: String,
    expires_in_seconds: i64,
) -> napi::Result<bool> {
    let pool = get_redis_pool()?;
    let mut conn = pool.get().await.map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("Failed to get Redis connection: {}", e),
        )
    })?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let expires_at = now + expires_in_seconds;

    let token_data = RefreshTokenData {
        user_id: user_id.clone(),
        email: email.clone(),
        jti: jti.clone(),
        expires_at,
        created_at: now,
    };

    let key = format!("refresh_token:{}", jti);
    let json_data = serde_json::to_string(&token_data).map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("Failed to serialize token data: {}", e),
        )
    })?;

    // Store with expiration (in seconds)
    let result: Result<(), RedisError> = conn
        .set_ex(&key, json_data, expires_in_seconds as u64)
        .await;

    // Also store in user index for easy cleanup
    let user_tokens_key = format!("user_tokens:{}", user_id);
    let _: Result<(), RedisError> = conn.sadd(&user_tokens_key, &jti).await;

    // Set expiration on user tokens set as well
    let _: Result<(), RedisError> = conn.expire(&user_tokens_key, expires_in_seconds).await;

    result.map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("Failed to store refresh token: {}", e),
        )
    })?;

    Ok(true)
}

pub async fn get_refresh_token(jti: String) -> napi::Result<Option<RefreshTokenData>> {
    let pool = get_redis_pool()?;
    let mut conn = pool.get().await.map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("Failed to get Redis connection: {}", e),
        )
    })?;

    let key = format!("refresh_token:{}", jti);
    let json_data: Option<String> = conn.get(&key).await.map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("Failed to get refresh token: {}", e),
        )
    })?;

    match json_data {
        Some(data) => {
            let token_data: RefreshTokenData = serde_json::from_str(&data).map_err(|e| {
                napi::Error::new(
                    napi::Status::GenericFailure,
                    format!("Failed to parse token data: {}", e),
                )
            })?;

            Ok(Some(token_data))
        }
        None => Ok(None),
    }
}

pub async fn delete_refresh_token(jti: String) -> napi::Result<bool> {
    let pool = get_redis_pool()?;
    let mut conn = pool.get().await.map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("Failed to get Redis connection: {}", e),
        )
    })?;

    let key = format!("refresh_token:{}", jti);

    // Get the token first to find user_id
    let json_data: Option<String> = conn.get(&key).await.map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("Failed to get refresh token: {}", e),
        )
    })?;

    if let Some(data) = json_data {
        let token_data: RefreshTokenData = serde_json::from_str(&data).map_err(|e| {
            napi::Error::new(
                napi::Status::GenericFailure,
                format!("Failed to parse token data: {}", e),
            )
        })?;

        // Also remove from user tokens set
        let user_tokens_key = format!("user_tokens:{}", token_data.user_id);
        let _: Result<(), RedisError> = conn.srem(&user_tokens_key, &jti).await;
    }

    let deleted: i32 = conn.del(&key).await.map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("Failed to delete refresh token: {}", e),
        )
    })?;

    Ok(deleted > 0)
}

pub async fn delete_user_refresh_tokens(user_id: String) -> napi::Result<u32> {
    let pool = get_redis_pool()?;
    let mut conn = pool.get().await.map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("Failed to get Redis connection: {}", e),
        )
    })?;

    let user_tokens_key = format!("user_tokens:{}", user_id);
    let tokens: Vec<String> = conn.smembers(&user_tokens_key).await.map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("Failed to get user tokens: {}", e),
        )
    })?;

    let mut deleted_count = 0;

    for jti in &tokens {
        let key = format!("refresh_token:{}", jti);
        let _: usize = conn.del(&key).await.map_err(|e| {
            napi::Error::new(
                napi::Status::GenericFailure,
                format!("Failed to delete key {}: {}", key, e),
            )
        })?;
        deleted_count += 1;
    }

    // Delete the user tokens set
    let _: usize = conn.del(&user_tokens_key).await.map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!(
                "Failed to delete user tokens set {}: {}",
                user_tokens_key, e
            ),
        )
    })?;

    Ok(deleted_count)
}

pub async fn validate_refresh_token(jti: String) -> napi::Result<bool> {
    match get_refresh_token(jti).await? {
        Some(token_data) => Ok(!token_data.is_expired()),
        None => Ok(false),
    }
}

pub async fn cleanup_expired_tokens() -> napi::Result<u32> {
    let pool = get_redis_pool()?;
    let mut conn = pool.get().await.map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("Failed to get Redis connection: {}", e),
        )
    })?;

    let mut cleaned = 0;
    let pattern = "refresh_token:*";

    // Use a cursor-based scan to avoid blocking Redis
    let mut cursor: u64 = 0;
    loop {
        let (next_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
            .arg(cursor)
            .arg("MATCH")
            .arg(pattern)
            .arg("COUNT")
            .arg(100) // Scan 100 keys at a time
            .query_async(&mut conn)
            .await
            .map_err(|e| {
                napi::Error::new(
                    napi::Status::GenericFailure,
                    format!("Failed to scan keys: {}", e),
                )
            })?;

        for key in keys {
            let ttl: i64 = redis::cmd("TTL")
                .arg(&key)
                .query_async(&mut conn)
                .await
                .map_err(|e| {
                    napi::Error::new(
                        napi::Status::GenericFailure,
                        format!("Failed to get TTL for key {}: {}", key, e),
                    )
                })?;

            if ttl <= 0 {
                let deleted: i32 = redis::cmd("DEL")
                    .arg(&key)
                    .query_async(&mut conn)
                    .await
                    .map_err(|e| {
                        napi::Error::new(
                            napi::Status::GenericFailure,
                            format!("Failed to delete key {}: {}", key, e),
                        )
                    })?;

                if deleted > 0 {
                    cleaned += 1;

                    // Also remove from user tokens set if it exists
                    if let Some(jti) = key.strip_prefix("refresh_token:")
                        && let Ok(Some(token_data)) = get_refresh_token(jti.to_string()).await
                    {
                        let user_tokens_key = format!("user_tokens:{}", token_data.user_id);
                        let _: Result<(), RedisError> = conn.srem(&user_tokens_key, jti).await;
                    }
                }
            }
        }

        cursor = next_cursor;
        if cursor == 0 {
            break; // Scan complete
        }
    }

    Ok(cleaned)
}
