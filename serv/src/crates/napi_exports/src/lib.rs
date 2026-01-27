use db::initialize_dbs;
use jwt_handler::{
    gen_access_token, gen_refresh_token, rotate_refresh_token, verify_access_token,
    verify_refresh_token,
};
use napi_derive::napi;
use shared_types::User;
use user_handler::{
    add_user, delete_user as internal_delete_users, search_users as internal_search_users,
    validate_pass,
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
) -> napi::Result<User> {
    add_user(email, pass, oauth_provider).await
}

#[napi]
pub async fn search_users(email_str: String) -> napi::Result<Vec<User>> {
    internal_search_users(email_str).await
}

#[napi]
pub async fn delete_user(email: String) -> napi::Result<User> {
    internal_delete_users(email).await
}

#[napi]
pub async fn check_pass(email: String, pass: String) -> napi::Result<bool> {
    validate_pass(email, pass).await
}

#[napi]
pub async fn gen_access_jwt(uid: String, email: String) -> napi::Result<String> {
    gen_access_token(&uid, &email)
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub async fn gen_refresh_jwt(uid: String, email: String) -> napi::Result<(String, String)> {
    gen_refresh_token(&uid, &email)
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub async fn check_access_jwt(token: String) -> napi::Result<String> {
    verify_access_token(&token)
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub async fn check_refresh_jwt(token: String) -> napi::Result<String> {
    verify_refresh_token(&token)
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub async fn rotate_refresh_jwt(token: String) -> napi::Result<(String, String, String)> {
    rotate_refresh_token(&token)
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub async fn init_redis() -> napi::Result<()> {
    redis_handler::init_redis()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to initialize Redis: {}", e)))
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
        .map_err(|e| napi::Error::from_reason(format!("Failed to store refresh token: {}", e)))
}

#[napi]
pub async fn get_refresh_token(jti: String) -> napi::Result<Option<redis_handler::RefreshTokenData>> {
    redis_handler::get_refresh_token(jti)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to get refresh token: {}", e)))
}

#[napi]
pub async fn delete_refresh_token(jti: String) -> napi::Result<bool> {
    redis_handler::delete_refresh_token(jti)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to delete refresh token: {}", e)))
}

#[napi]
pub async fn delete_user_refresh_tokens(user_id: String) -> napi::Result<u32> {
    redis_handler::delete_user_refresh_tokens(user_id)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to delete user refresh tokens: {}", e)))
}

#[napi]
pub async fn validate_refresh_token(jti: String) -> napi::Result<bool> {
    redis_handler::validate_refresh_token(jti)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to validate refresh token: {}", e)))
}

#[napi]
pub async fn cleanup_expired_tokens() -> napi::Result<u32> {
    redis_handler::cleanup_expired_tokens()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to cleanup expired tokens: {}", e)))
}
