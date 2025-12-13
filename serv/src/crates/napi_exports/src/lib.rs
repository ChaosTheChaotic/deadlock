use napi_derive::napi;
use db::initialize_dbs;
use user_handler::{add_user, search_users as internal_search_users};
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
