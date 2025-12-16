use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenClaims {
    pub uid: String,
    pub email:  String,
    pub iat: i64,
    pub exp: i64,
}

pub struct JwtManager {
    secret: Vec<u8>,
    texp_hrs: i64,
}

impl JwtManager {
    pub fn new() -> Result<Self, String> {
        let secret = env::var("JWT_SECRET")?;
        
        let texp_hrs = env::var("JWT_EXPIRY_HOURS")
            .unwrap_or_else(|_| "24".to_string())
            .parse::<i64>()
            .map_err(|e| format!("Invalid JWT_EXPIRY_HOURS: {}", e))?;

        Ok(JwtManager {
            secret:  secret.into_bytes(),
            texp_hrs,
        })
    }

    pub async fn gen_token(&self, uid:  &str, email: &str) -> Result<String, String> {
        let now = Utc::now();
        let iat = now.timestamp();
        let exp = (now + Duration::hours(self. texp_hrs)).timestamp();

        let claims = TokenClaims {
            uid:  uid.to_string(),
            email: email.to_string(),
            iat,
            exp,
        };

        let encoding_key = EncodingKey::from_secret(&self.secret);
        encode(&Header::default(), &claims, &encoding_key)
            .map_err(|e| format! ("Failed to encode token: {}", e))
    }

    pub async fn verify_token(&self, token: &str) -> Result<TokenClaims, String> {
        let decoding_key = DecodingKey::from_secret(&self.secret);
        let validation = Validation::new(Algorithm::HS256);

        decode::<TokenClaims>(token, &decoding_key, &validation)
            .map(|data| data.claims)
            .map_err(|e| format!("Failed to verify token: {}", e))
    }

    pub async fn refresh_token(&self, token: &str) -> Result<String, String> {
        let claims = self.verify_token(token)?;
        self.generate_token(&claims.uid, &claims.email)
    }
}

impl Default for JwtManager {
    fn default() -> Self {
        Self:: new().expect("Failed to create JwtManager")
    }
}

pub async fn gen_jwt_token(uid: &str, email: &str) -> Result<String, String> {
    let jwt_manager = JwtManager::new()?;
    let token = jwt_manager.gen_token(uid, email)?;
    Ok(token)
}

pub async fn verify_jwt_token(token: &str) -> Result<String, String> {
    let jwt_manager = JwtManager::new()?;
    let claims = jwt_manager.verify_token(token)?;
    Ok(json! ({
        "uid": claims. uid,
        "email": claims.email,
        "iat": claims.iat,
        "exp": claims.exp
    }).to_string())
}

pub async fn refresh_jwt_token(token: &str) -> Result<String, String> {
    let jwt_manager = JwtManager::new()?;
    jwt_manager.refresh_token(token)
}
