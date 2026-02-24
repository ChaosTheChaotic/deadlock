use db::initialize_dbs;
use jwt_handler::{
    AccessTokenClaims, RefreshTokenClaims, gen_access_token, gen_refresh_token,
    rotate_refresh_token, verify_access_token, verify_refresh_token,
};
use logger::LogPayload;
use napi::threadsafe_function::ThreadsafeFunction;
use napi_derive::napi;
use redis_handler::RefreshTokenData;
use shared_types::{LogEntry, User};
use user_handler::{
    add_user, delete_user as internal_delete_users, search_users as internal_search_users,
    update_user as internal_update_user, user_from_uid, validate_pass,
};

#[napi]
pub async fn init_dbs() {
    initialize_dbs().await
}

#[napi]
pub async fn create_user(
    email: String,
    pass: Option<String>,
    oauth_provider: Option<String>,
    oauth_provider_id: Option<String>,
    roles: Option<Vec<String>>,
    perms: Option<Vec<String>>,
) -> napi::Result<User> {
    add_user(email, pass, oauth_provider, oauth_provider_id, roles, perms)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to create user: {e}")))
}

#[napi]
pub async fn update_user(
    uid: String,
    email: Option<String>,
    pass: Option<String>,
    oauth_provider: Option<String>,
    oauth_provider_id: Option<String>,
    roles: Option<Vec<String>>,
    perms: Option<Vec<String>>,
) -> napi::Result<User> {
    internal_update_user(
        uid,
        email,
        pass,
        oauth_provider,
        oauth_provider_id,
        roles,
        perms,
    )
    .await
    .map_err(|e| napi::Error::from_reason(format!("Failed to update user: {e}")))
}

#[napi]
pub async fn search_users(email_str: String) -> napi::Result<Vec<User>> {
    internal_search_users(email_str)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to search users: {e}")))
}

#[napi]
pub async fn delete_user(email: String) -> napi::Result<User> {
    internal_delete_users(email)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to delete user: {e}")))
}

#[napi]
pub async fn check_pass(email: String, pass: String) -> napi::Result<bool> {
    validate_pass(email, pass)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to validate password: {e}")))
}

#[napi]
pub async fn gen_access_jwt(uid: String, email: String) -> napi::Result<String> {
    gen_access_token(&uid, &email)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to generate access token: {e}")))
}

#[napi]
pub async fn gen_refresh_jwt(uid: String, email: String) -> napi::Result<(String, String)> {
    gen_refresh_token(&uid, &email)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to generate refresh token: {e}")))
}

#[napi]
pub async fn check_access_jwt(token: String) -> napi::Result<AccessTokenClaims> {
    verify_access_token(&token)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Invalid access token: {e}")))
}

#[napi]
pub async fn check_refresh_jwt(token: String) -> napi::Result<RefreshTokenClaims> {
    verify_refresh_token(&token)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Invalid refresh token: {e}")))
}

#[napi]
pub async fn rotate_refresh_jwt(token: String) -> napi::Result<(String, String, String)> {
    rotate_refresh_token(&token)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to rotate refresh token: {e}")))
}

#[napi]
pub async fn init_redis() -> napi::Result<()> {
    redis_handler::init_redis()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to initialize Redis: {e}")))
}

#[napi]
pub async fn store_refresh_token(
    jti: String,
    user_id: String,
    email: String,
    expires_in_seconds: i64,
) -> napi::Result<bool> {
    redis_handler::store_refresh_token(jti, user_id, email, expires_in_seconds)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to store refresh token: {e}")))
}

#[napi]
pub async fn get_refresh_token(jti: String) -> napi::Result<Option<RefreshTokenData>> {
    redis_handler::get_refresh_token(jti)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to get refresh token: {e}")))
}

#[napi]
pub async fn delete_refresh_token(jti: String) -> napi::Result<bool> {
    redis_handler::delete_refresh_token(jti)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to delete refresh token: {e}")))
}

#[napi]
pub async fn delete_user_refresh_tokens(user_id: String) -> napi::Result<u32> {
    redis_handler::delete_user_refresh_tokens(user_id)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to delete user refresh tokens: {e}")))
}

#[napi]
pub async fn validate_refresh_token(jti: String) -> napi::Result<bool> {
    redis_handler::validate_refresh_token(jti)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to validate refresh token: {e}")))
}

#[napi]
pub async fn cleanup_expired_tokens() -> napi::Result<u32> {
    redis_handler::cleanup_expired_tokens()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to cleanup expired tokens: {e}")))
}

#[napi]
pub async fn check_rate_limit(
    identifier: String,
    max_requests: u32,
    window_seconds: u32,
) -> napi::Result<(bool, u32, u32)> {
    redis_handler::check_rate_limit(identifier, max_requests, window_seconds)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to check rate limit: {e}")))
}

#[napi]
pub async fn reset_rate_limit(identifier: String) -> napi::Result<bool> {
    redis_handler::reset_rate_limit(identifier)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to reset rate limit: {e}")))
}

#[napi]
pub async fn get_rate_limit_stats(identifier: String) -> napi::Result<(u32, u32)> {
    redis_handler::get_rate_limit_stats(identifier)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to get rate limit stats: {e}")))
}

#[napi]
pub async fn redis_health_check() -> napi::Result<bool> {
    redis_handler::health_check()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Redis health check failed: {e}")))
}

#[napi]
pub async fn get_redis_info() -> napi::Result<String> {
    redis_handler::get_redis_info()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to get Redis info: {e}")))
}

#[napi]
pub async fn flush_redis() -> napi::Result<bool> {
    redis_handler::flush_all()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to flush Redis: {e}")))
}

#[napi]
pub async fn get_all_refresh_tokens() -> napi::Result<Vec<RefreshTokenData>> {
    redis_handler::get_all_refresh_tokens()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to get all refresh tokens: {e}")))
}

#[napi]
pub async fn cleanup_rate_limit_keys() -> napi::Result<u32> {
    redis_handler::cleanup_rate_limit_keys()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to cleanup rate limit keys: {e}")))
}

#[napi]
pub async fn uid_lookup(uid: String) -> napi::Result<User> {
    user_from_uid(&uid)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to lookup user from uid: {e}")))
}

#[napi]
pub async fn init_logger(db_path: String, callback: Option<ThreadsafeFunction<LogPayload>>) {
    logger::init_logger(db_path, callback).await
}

#[napi]
pub async fn init_panic_logging() {
    logger::init_panic_logging().await
}

#[napi]
pub async fn get_logs(
    db_path: String,
    search_query: String,
    levels: Option<Vec<String>>,
    start_time: Option<String>,
    end_time: Option<String>,
    limit: u32,
) -> napi::Result<Vec<LogEntry>> {
    logger::get_logs(db_path, search_query, levels, start_time, end_time, limit).await
}
