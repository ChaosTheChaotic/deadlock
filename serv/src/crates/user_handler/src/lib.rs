use db::get_uidb_pool;
use napi_derive::napi;
use shared_types::{Row, User};
use argon2::{
    Argon2,
    password_hash::{
        SaltString,
        PasswordHasher,
    }
};

pub fn user_from_row(row: Row) -> User {
    User {
        uid: row.get("uid"),
        email: row.get("email"),
        pwd_hash: row.get("password_hash"),
        oauth_provider: row.get("oauth_provider"),
        create_time: row.get::<_, f64>("creation_time"),
    }
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
                uid::text as uid, 
                email, 
                password_hash, 
                oauth_provider, 
                date_part('epoch', creation_time) as creation_time
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
    let users: Vec<User> = rows.into_iter().map(|row| user_from_row(row)).collect();

    Ok(users)
}

#[napi]
pub async fn add_user(
    email: String,
    pass: Option<String>,
    oauth_provider: Option<String>,
) -> napi::Result<User> {
    if pass.is_none() && oauth_provider.is_none() {
        return Err(napi::Error::from_status(napi::Status::InvalidArg));
    }

    let client = get_uidb_pool()
        .get()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to get client from pool: {e}")))?;

    if let Some(password) = pass {
        // Hash the password with Argon2
        let salt = SaltString::generate(&mut rand_core::OsRng);
        let argon2 = Argon2::default();
        let password_hash = argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| napi::Error::from_reason(format!("Failed to hash password: {e}")))?
            .to_string();

        // Prepare and execute insert statement for password-based user
        let stmt = client
            .prepare_cached(
                "INSERT INTO users (email, password_hash) VALUES ($1, $2) 
                 RETURNING 
                    uid::text as uid, 
                    email, 
                    password_hash, 
                    oauth_provider, 
                    date_part('epoch', creation_time) as creation_time",
            )
            .await
            .map_err(|e| napi::Error::from_reason(format!("Failed to prepare cached: {e}")))?;

        let row = client
            .query_one(&stmt, &[&email, &password_hash])
            .await
            .map_err(|e| {
                napi::Error::from_reason(format!("Failed to execute insert statement: {e}"))
            })?;

        Ok(user_from_row(row))
    } else {
        let provider = oauth_provider.as_ref().unwrap();

        let stmt = client
            .prepare_cached(
                "INSERT INTO users (email, oauth_provider) VALUES ($1, $2) 
                 RETURNING 
                    uid::text as uid, 
                    email, 
                    password_hash, 
                    oauth_provider, 
                    date_part('epoch', creation_time) as creation_time",
            )
            .await
            .map_err(|e| napi::Error::from_reason(format!("Failed to prepare cached: {e}")))?;

        let row = client
            .query_one(&stmt, &[&email, provider])
            .await
            .map_err(|e| {
                napi::Error::from_reason(format!("Failed to execute insert statement: {e}"))
            })?;

        Ok(user_from_row(row))
    }
}
