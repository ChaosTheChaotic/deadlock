use napi_derive::napi;

#[napi(object)]
pub struct User {
    pub uid: String,
    pub email: String,
    pub pwd_hash: Option<String>,
    pub oauth_provider: Option<String>,
    pub create_time: f64,
}
