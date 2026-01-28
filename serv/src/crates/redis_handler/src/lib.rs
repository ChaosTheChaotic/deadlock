use deadpool_redis::redis::{self, AsyncCommands};
use deadpool_redis::{Config, Runtime};
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::env;
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;
use tokio::sync::OnceCell;

static REDIS_POOL: OnceCell<deadpool_redis::Pool> = OnceCell::const_new();

#[derive(Error, Debug)]
pub enum RedisHandlerError {
    #[error("Redis pool not initialized")]
    PoolNotInitialized,
    #[error("Redis connection error: {0}")]
    ConnectionError(String),
    #[error("Redis operation error: {0}")]
    OperationError(String),
    #[error("Serialization error: {0}")]
    SerializationError(String),
    #[error("Deserialization error: {0}")]
    DeserializationError(String),
    #[error("IO error: {0}")]
    IoError(String),
}

impl From<deadpool_redis::CreatePoolError> for RedisHandlerError {
    fn from(err: deadpool_redis::CreatePoolError) -> Self {
        RedisHandlerError::ConnectionError(format!("Failed to create Redis pool: {}", err))
    }
}

impl From<deadpool_redis::PoolError> for RedisHandlerError {
    fn from(err: deadpool_redis::PoolError) -> Self {
        RedisHandlerError::ConnectionError(format!("Failed to get Redis connection: {}", err))
    }
}

impl From<redis::RedisError> for RedisHandlerError {
    fn from(err: redis::RedisError) -> Self {
        RedisHandlerError::OperationError(format!("Redis operation failed: {}", err))
    }
}

impl From<serde_json::Error> for RedisHandlerError {
    fn from(err: serde_json::Error) -> Self {
        RedisHandlerError::SerializationError(format!("Serialization failed: {}", err))
    }
}

impl From<std::time::SystemTimeError> for RedisHandlerError {
    fn from(err: std::time::SystemTimeError) -> Self {
        RedisHandlerError::IoError(format!("Time error: {}", err))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct RefreshTokenData {
    pub user_id: String,
    pub email: String,
    pub jti: String,
    pub expires_at: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct RateLimitConfig {
    pub max_requests: u32,
    pub window_seconds: u32,
    pub identifier: String,
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

pub async fn init_redis() -> Result<(), RedisHandlerError> {
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
    let pool = cfg.create_pool(Some(Runtime::Tokio1))?;

    // Test the connection
    let mut conn = pool.get().await?;
    let _: String = redis::cmd("PING").query_async(&mut conn).await?;

    REDIS_POOL
        .set(pool)
        .map_err(|_| RedisHandlerError::PoolNotInitialized)?;

    Ok(())
}

fn get_redis_pool() -> Result<&'static deadpool_redis::Pool, RedisHandlerError> {
    REDIS_POOL
        .get()
        .ok_or(RedisHandlerError::PoolNotInitialized)
}

pub async fn store_refresh_token(
    jti: String,
    user_id: String,
    email: String,
    expires_in_seconds: i64,
) -> Result<bool, RedisHandlerError> {
    let pool = get_redis_pool()?;
    let mut conn = pool.get().await?;

    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64;

    let expires_at = now + expires_in_seconds;

    let token_data = RefreshTokenData {
        user_id: user_id.clone(),
        email: email.clone(),
        jti: jti.clone(),
        expires_at,
        created_at: now,
    };

    let key = format!("refresh_token:{}", jti);
    let json_data = serde_json::to_string(&token_data)?;

    // Store with expiration (in seconds)
    let _: () = conn
        .set_ex(&key, json_data, expires_in_seconds as u64)
        .await?;

    // Also store in user index for easy cleanup
    let user_tokens_key = format!("user_tokens:{}", user_id);
    let _: usize = conn.sadd(&user_tokens_key, &jti).await?;

    // Set expiration on user tokens set as well
    let _: bool = conn.expire(&user_tokens_key, expires_in_seconds).await?;

    Ok(true)
}

pub async fn get_refresh_token(jti: String) -> Result<Option<RefreshTokenData>, RedisHandlerError> {
    let pool = get_redis_pool()?;
    let mut conn = pool.get().await?;

    let key = format!("refresh_token:{}", jti);
    let json_data: Option<String> = conn.get(&key).await?;

    match json_data {
        Some(data) => {
            let token_data: RefreshTokenData = serde_json::from_str(&data)?;
            Ok(Some(token_data))
        }
        None => Ok(None),
    }
}

pub async fn delete_refresh_token(jti: String) -> Result<bool, RedisHandlerError> {
    let pool = get_redis_pool()?;
    let mut conn = pool.get().await?;

    let key = format!("refresh_token:{}", jti);

    // Get the token first to find user_id
    let json_data: Option<String> = conn.get(&key).await?;

    if let Some(data) = json_data {
        let token_data: RefreshTokenData = serde_json::from_str(&data)?;

        // Also remove from user tokens set
        let user_tokens_key = format!("user_tokens:{}", token_data.user_id);
        let _: usize = conn.srem(&user_tokens_key, &jti).await?;
    }

    let deleted: usize = conn.del(&key).await?;
    Ok(deleted > 0)
}

pub async fn delete_user_refresh_tokens(user_id: String) -> Result<u32, RedisHandlerError> {
    let pool = get_redis_pool()?;
    let mut conn = pool.get().await?;

    let user_tokens_key = format!("user_tokens:{}", user_id);
    let tokens: Vec<String> = conn.smembers(&user_tokens_key).await?;

    let mut deleted_count = 0;

    for jti in &tokens {
        let key = format!("refresh_token:{}", jti);
        let _: usize = conn.del(&key).await?;
        deleted_count += 1;
    }

    // Delete the user tokens set
    let _: usize = conn.del(&user_tokens_key).await?;

    Ok(deleted_count)
}

pub async fn validate_refresh_token(jti: String) -> Result<bool, RedisHandlerError> {
    match get_refresh_token(jti).await? {
        Some(token_data) => Ok(!token_data.is_expired()),
        None => Ok(false),
    }
}

pub async fn cleanup_expired_tokens() -> Result<u32, RedisHandlerError> {
    let pool = get_redis_pool()?;
    let mut conn = pool.get().await?;

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
            .await?;

        for key in keys {
            let ttl: i64 = redis::cmd("TTL").arg(&key).query_async(&mut conn).await?;

            if ttl <= 0 {
                let deleted: usize = redis::cmd("DEL").arg(&key).query_async(&mut conn).await?;

                if deleted > 0 {
                    cleaned += 1;

                    // Also remove from user tokens set if it exists
                    if let Some(jti) = key.strip_prefix("refresh_token:")
                        && let Ok(Some(token_data)) = get_refresh_token(jti.to_string()).await
                    {
                        let user_tokens_key = format!("user_tokens:{}", token_data.user_id);
                        let _: usize = conn.srem(&user_tokens_key, jti).await?;
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

pub async fn check_rate_limit(
    identifier: String,
    max_requests: u32,
    window_seconds: u32,
) -> Result<(bool, u32, u32), RedisHandlerError> {
    let pool = get_redis_pool()?;
    let mut conn = pool.get().await?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let key = format!("rate_limit:{}", identifier);

    // Remove old entries (outside the window)
    let _: () = redis::cmd("ZREMRANGEBYSCORE")
        .arg(&key)
        .arg(0)
        .arg(now - window_seconds as u64)
        .query_async(&mut conn)
        .await?;

    let remaining: u64 = redis::cmd("ZCARD").arg(&key).query_async(&mut conn).await?;

    if remaining == 0 {
        let _: usize = conn.del(&key).await?;
        return Ok((true, window_seconds, max_requests));
    }

    // Get current count
    let current_count: usize = redis::cmd("ZCARD").arg(&key).query_async(&mut conn).await?;

    if current_count >= max_requests as usize {
        // Get TTL of the key
        let ttl: i64 = redis::cmd("TTL").arg(&key).query_async(&mut conn).await?;

        let remaining_seconds = if ttl > 0 { ttl as u32 } else { window_seconds };

        let remaining_requests = 0;
        return Ok((false, remaining_seconds, remaining_requests));
    }

    // Add current request with timestamp as score
    let _: () = redis::cmd("ZADD")
        .arg(&key)
        .arg(now)
        .arg(now.to_string())
        .query_async(&mut conn)
        .await?;

    // Set expiry on the entire sorted set
    let _: bool = redis::cmd("EXPIRE")
        .arg(&key)
        .arg(window_seconds)
        .query_async(&mut conn)
        .await?;

    let remaining_requests = max_requests - (current_count as u32 + 1);
    let remaining_seconds = window_seconds;

    Ok((true, remaining_seconds, remaining_requests))
}

pub async fn reset_rate_limit(identifier: String) -> Result<bool, RedisHandlerError> {
    let pool = get_redis_pool()?;
    let mut conn = pool.get().await?;

    let key = format!("rate_limit:{}", identifier);
    let deleted: u64 = redis::cmd("DEL").arg(&key).query_async(&mut conn).await?;

    Ok(deleted > 0)
}

pub async fn get_rate_limit_stats(identifier: String) -> Result<(u32, u32), RedisHandlerError> {
    let pool = get_redis_pool()?;
    let mut conn = pool.get().await?;

    let key = format!("rate_limit:{}", identifier);

    // Get current count
    let current_count: u64 = redis::cmd("ZCARD").arg(&key).query_async(&mut conn).await?;

    // Get TTL
    let ttl: i64 = redis::cmd("TTL").arg(&key).query_async(&mut conn).await?;

    let remaining_seconds = if ttl > 0 { ttl as u32 } else { 0 };

    Ok((current_count as u32, remaining_seconds))
}

pub async fn health_check() -> Result<bool, RedisHandlerError> {
    let pool = get_redis_pool()?;
    let mut conn = pool.get().await?;

    let pong: String = redis::cmd("PING").query_async(&mut conn).await?;
    Ok(pong == "PONG")
}

pub async fn get_redis_info() -> Result<String, RedisHandlerError> {
    let pool = get_redis_pool()?;
    let mut conn = pool.get().await?;

    let info: String = redis::cmd("INFO").query_async(&mut conn).await?;
    Ok(info)
}

pub async fn flush_all() -> Result<bool, RedisHandlerError> {
    let pool = get_redis_pool()?;
    let mut conn = pool.get().await?;

    let result: String = redis::cmd("FLUSHALL").query_async(&mut conn).await?;
    Ok(result == "OK")
}

pub async fn get_all_refresh_tokens() -> Result<Vec<RefreshTokenData>, RedisHandlerError> {
    let pool = get_redis_pool()?;
    let mut conn = pool.get().await?;

    let mut tokens = Vec::new();
    let pattern = "refresh_token:*";

    // Use a cursor-based scan to avoid blocking Redis
    let mut cursor: u64 = 0;
    loop {
        let (next_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
            .arg(cursor)
            .arg("MATCH")
            .arg(pattern)
            .arg("COUNT")
            .arg(100)
            .query_async(&mut conn)
            .await?;

        for key in keys {
            let json_data: Option<String> = conn.get(&key).await?;
            if let Some(data) = json_data {
                match serde_json::from_str(&data) {
                    Ok(token_data) => tokens.push(token_data),
                    Err(_) => continue, // Skip invalid tokens
                }
            }
        }

        cursor = next_cursor;
        if cursor == 0 {
            break;
        }
    }

    Ok(tokens)
}

pub async fn cleanup_rate_limit_keys() -> Result<u32, RedisHandlerError> {
    let pool = get_redis_pool()?;
    let mut conn = pool.get().await?;

    let mut cleaned = 0;
    let pattern = "rate_limit:*";

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
            .await?;

        for key in keys {
            // Check if the key is empty or has no members
            let count: u64 = redis::cmd("ZCARD").arg(&key).query_async(&mut conn).await?;

            if count == 0 {
                // Delete empty rate limit keys
                let _: usize = conn.del(&key).await?;
                cleaned += 1;
                continue;
            }

            // Check TTL if negative, the key should have been auto-deleted
            let ttl: i64 = redis::cmd("TTL").arg(&key).query_async(&mut conn).await?;

            if ttl < 0 {
                // Key has expired, delete it
                let _: usize = conn.del(&key).await?;
                cleaned += 1;
            }
        }

        cursor = next_cursor;
        if cursor == 0 {
            break; // Scan complete
        }
    }

    Ok(cleaned)
}
