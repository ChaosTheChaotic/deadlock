use jwt_handler::{gen_jwt_token, refresh_jwt_token, verify_jwt_token};
use napi_derive::napi;
use db::initialize_dbs;
use user_handler::{add_user, search_users as internal_search_users, delete_user as internal_delete_users, validate_pass};
use shared_types::User;

#[napi]
pub async fn init_dbs() {
    initialize_dbs().await
}

#[napi]
pub async fn create_user(email: String, pass: Option<String>, oauth_provider: Option<String>) -> napi::Result<User> {
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
pub async fn gen_jwt(uid: String, email: String) -> napi::Result<String> {
    gen_jwt_token(&uid, &email).await.map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub async fn check_jwt(token: String) -> napi::Result<String> {
    verify_jwt_token(&token).await.map_err(|e| e.to_string())
}
#[napi]
pub async fn refresh_jwt(token: String) -> napi::Result<String> {
    refresh_jwt_token(&token).await.map_err(|e| e.to_string())
}
