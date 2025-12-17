use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::env;
use std::sync::OnceLock;
use napi_derive::napi;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AccessTokenClaims {
    pub uid: String,
    pub email: String,
    pub iat: i64,
    pub exp: i64,
    pub token_type: String, // "access"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[napi(object)]
pub struct RefreshTokenClaims {
    pub uid: String,
    pub email: String,
    pub iat: i64,
    pub exp: i64,
    pub token_type: String, // "refresh"
    pub jti: String, // JWT ID for refresh token rotation
}

pub struct JwtManager {
    access_secret: Vec<u8>,
    refresh_secret: Vec<u8>,
    access_exp_hours: i64,
    refresh_exp_days: i64,
}

impl JwtManager {
    pub fn new() -> Result<Self, String> {
        let access_secret = env::var("JWT_ACCESS_SECRET")
            .map_err(|_| "JWT_ACCESS_SECRET not set".to_string())?;
        
        let refresh_secret = env::var("JWT_REFRESH_SECRET")
            .map_err(|_| "JWT_REFRESH_SECRET not set".to_string())?;
        
        // Different expiration times for access vs refresh tokens
        let access_exp_hours = env::var("JWT_ACCESS_EXPIRY_HRS")
            .unwrap_or_else(|_| "1".to_string()) // 1 hour for access
            .parse::<i64>()
            .map_err(|e| format!("Invalid JWT_ACCESS_EXPIRY_HRS: {}", e))?;

        let refresh_exp_days = env::var("JWT_REFRESH_EXPIRY_DAYS")
            .unwrap_or_else(|_| "30".to_string()) // 30 days for refresh
            .parse::<i64>()
            .map_err(|e| format!("Invalid JWT_REFRESH_EXPIRY_DAYS: {}", e))?;

        Ok(JwtManager {
            access_secret: access_secret.into_bytes(),
            refresh_secret: refresh_secret.into_bytes(),
            access_exp_hours,
            refresh_exp_days,
        })
    }

    pub async fn gen_access_token(&self, uid: &str, email: &str) -> Result<String, String> {
        let now = Utc::now();
        let iat = now.timestamp();
        let exp = (now + Duration::hours(self.access_exp_hours)).timestamp();

        let claims = AccessTokenClaims {
            uid: uid.to_string(),
            email: email.to_string(),
            iat,
            exp,
            token_type: "access".to_string(),
        };

        let encoding_key = EncodingKey::from_secret(&self.access_secret);
        encode(&Header::new(Algorithm::HS256), &claims, &encoding_key)
            .map_err(|e| format!("Failed to encode access token: {}", e))
    }

    pub async fn gen_refresh_token(&self, uid: &str, email: &str) -> Result<(String, String), String> {
        let now = Utc::now();
        let iat = now.timestamp();
        let exp = (now + Duration::days(self.refresh_exp_days)).timestamp();
        let jti = uuid::Uuid::new_v4().to_string(); // Unique ID for refresh token

        let claims = RefreshTokenClaims {
            uid: uid.to_string(),
            email: email.to_string(),
            iat,
            exp,
            token_type: "refresh".to_string(),
            jti: jti.clone(),
        };

        let encoding_key = EncodingKey::from_secret(&self.refresh_secret);
        let token = encode(&Header::new(Algorithm::HS256), &claims, &encoding_key)
            .map_err(|e| format!("Failed to encode refresh token: {}", e))?;

        Ok((token, jti))
    }

    pub async fn verify_access_token(&self, token: &str) -> Result<AccessTokenClaims, String> {
        let decoding_key = DecodingKey::from_secret(&self.access_secret);
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;
        validation.set_required_spec_claims(&["exp", "iat", "token_type"]);
        
        let token_data = decode::<AccessTokenClaims>(token, &decoding_key, &validation)
            .map_err(|e| format!("Failed to verify access token: {}", e))?;

        // Validate token type
        if token_data.claims.token_type != "access" {
            return Err("Invalid token type".to_string());
        }

        Ok(token_data.claims)
    }

    pub async fn verify_refresh_token(&self, token: &str) -> Result<RefreshTokenClaims, String> {
        let decoding_key = DecodingKey::from_secret(&self.refresh_secret);
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;
        validation.set_required_spec_claims(&["exp", "iat", "token_type", "jti"]);
        
        let token_data = decode::<RefreshTokenClaims>(token, &decoding_key, &validation)
            .map_err(|e| format!("Failed to verify refresh token: {}", e))?;

        if token_data.claims.token_type != "refresh" {
            return Err("Invalid token type".to_string());
        }

        Ok(token_data.claims)
    }

    pub async fn rotate_refresh_token(&self, old_refresh_token: &str) -> Result<(String, String, String), String> {
        // Verify old refresh token
        let old_claims = self.verify_refresh_token(old_refresh_token).await?;
        
        // Generate new refresh token with new JTI
        let (new_token, new_jti) = self.gen_refresh_token(&old_claims.uid, &old_claims.email).await?;
        
        // Generate new access token
        let new_access_token = self.gen_access_token(&old_claims.uid, &old_claims.email).await?;
        
        Ok((new_access_token, new_token, new_jti))
    }
}

// Singleton instance for better performance
static JWT_MANAGER: OnceLock<Result<JwtManager, String>> = OnceLock::new();

pub async fn get_jwt_manager() -> Result<&'static JwtManager, String> {
    JWT_MANAGER.get_or_init(JwtManager::new).as_ref().map_err(|e| e.clone())
}

// Public API functions start here
pub async fn gen_access_token(uid: &str, email: &str) -> Result<String, String> {
    get_jwt_manager().await?.gen_access_token(uid, email).await
}

pub async fn gen_refresh_token(uid: &str, email: &str) -> Result<(String, String), String> {
    get_jwt_manager().await?.gen_refresh_token(uid, email).await
}

pub async fn verify_access_token(token: &str) -> Result<String, String> {
    let claims = get_jwt_manager().await?.verify_access_token(token).await?;
    Ok(json!({
        "uid": claims.uid,
        "email": claims.email,
        "iat": claims.iat,
        "exp": claims.exp
    }).to_string())
}

pub async fn verify_refresh_token(token: &str) -> Result<String, String> {
    let claims = get_jwt_manager().await?.verify_refresh_token(token).await?;
    Ok(json!({
        "uid": claims.uid,
        "email": claims.email,
        "iat": claims.iat,
        "exp": claims.exp,
        "jti": claims.jti
    }).to_string())
}

pub async fn rotate_refresh_token(token: &str) -> Result<(String, String, String), String> {
    get_jwt_manager().await?.rotate_refresh_token(token).await
}
