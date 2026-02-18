use argon2::{
    Argon2, PasswordHash, PasswordVerifier,
    password_hash::{PasswordHasher, SaltString},
};
use db::get_uidb_pool;
use shared_types::{Row, User};

pub fn user_from_row(row: Row) -> User {
    User {
        uid: row.get("uid"),
        email: row.get("email"),
        pwd_hash: row.get("password_hash"),
        oauth_provider: row.get("oauth_provider"),
        oauth_provider_id: row.get("oauth_provider_id"),
        create_time: row.get::<_, f64>("creation_time"),
    }
}

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
                oauth_provider_id,
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
    let users: Vec<User> = rows.into_iter().map(user_from_row).collect();

    Ok(users)
}

pub async fn add_user(
    email: String,
    pass: Option<String>,
    oauth_provider: Option<String>,
    oauth_provider_id: Option<String>,
) -> napi::Result<User> {
    let client = get_uidb_pool()
        .get()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to get client from pool: {e}")))?;

    // Check if user already exists by email or OAuth
    if let (Some(provider), Some(provider_id)) = (&oauth_provider, &oauth_provider_id) {
        let check_oauth_stmt = client
            .prepare_cached(
                "SELECT uid::text as uid, email, password_hash, oauth_provider, oauth_provider_id,
                        date_part('epoch', creation_time) as creation_time
                 FROM users 
                 WHERE oauth_provider = $1 AND oauth_provider_id = $2",
            )
            .await
            .map_err(|e| napi::Error::from_reason(format!("Failed to prepare cached: {e}")))?;

        if let Ok(Some(row)) = client
            .query_opt(&check_oauth_stmt, &[provider, provider_id])
            .await
        {
            return Ok(user_from_row(row));
        }
    }

    // Check by email
    let check_email_stmt = client
        .prepare_cached(
            "SELECT uid::text as uid, email, password_hash, oauth_provider, oauth_provider_id,
                    date_part('epoch', creation_time) as creation_time
             FROM users 
             WHERE email = $1",
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to prepare cached: {e}")))?;

    if let Ok(Some(row)) = client.query_opt(&check_email_stmt, &[&email]).await {
        let existing_oauth_provider: Option<String> = row.get("oauth_provider");
        let existing_oauth_provider_id: Option<String> = row.get("oauth_provider_id");

        // If user exists without OAuth, link the OAuth account
        if existing_oauth_provider.is_none()
            && existing_oauth_provider_id.is_none()
            && let (Some(provider), Some(provider_id)) = (&oauth_provider, &oauth_provider_id)
        {
            return update_user(
                email,
                None,
                Some(provider.clone()),
                Some(provider_id.clone()),
            )
            .await;
        }
        return Ok(user_from_row(row));
    }

    // Insert new user
    if let (Some(provider), Some(provider_id)) = (&oauth_provider, &oauth_provider_id) {
        // OAuth user
        let stmt = client
            .prepare_cached(
                "INSERT INTO users (email, oauth_provider, oauth_provider_id) 
                 VALUES ($1, $2, $3)
                 RETURNING uid::text as uid, email, password_hash, oauth_provider, oauth_provider_id,
                           date_part('epoch', creation_time) as creation_time",
            )
            .await
            .map_err(|e| napi::Error::from_reason(format!("Failed to prepare cached: {e}")))?;

        let row = client
            .query_one(&stmt, &[&email, provider, provider_id])
            .await
            .map_err(|e| napi::Error::from_reason(format!("Failed to insert user: {e}")))?;

        Ok(user_from_row(row))
    } else if let Some(password) = pass {
        // Password user
        let salt = SaltString::generate(&mut rand_core::OsRng);
        let argon2 = Argon2::default();
        let password_hash = argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| napi::Error::from_reason(format!("Failed to hash password: {e}")))?
            .to_string();

        let stmt = client
            .prepare_cached(
                "INSERT INTO users (email, password_hash) 
                 VALUES ($1, $2)
                 RETURNING uid::text as uid, email, password_hash, oauth_provider, oauth_provider_id,
                           date_part('epoch', creation_time) as creation_time",
            )
            .await
            .map_err(|e| napi::Error::from_reason(format!("Failed to prepare cached: {e}")))?;

        let row = client
            .query_one(&stmt, &[&email, &password_hash])
            .await
            .map_err(|e| napi::Error::from_reason(format!("Failed to insert user: {e}")))?;

        Ok(user_from_row(row))
    } else {
        Err(napi::Error::from_reason(
            "Either password or OAuth provider must be provided",
        ))
    }
}

pub async fn validate_pass(email: String, pass: String) -> napi::Result<bool> {
    let client = get_uidb_pool()
        .get()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to get client from pool: {e}")))?;

    let stmt = client
        .prepare_cached(
            "SELECT 
                password_hash
             FROM users 
             WHERE email ILIKE $1",
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to prepare cached: {e}")))?;

    let rows = client
        .query(&stmt, &[&email])
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to execute query: {e}")))?;

    // If no user found or multiple users found (shouldn't happen with unique email), return false
    if rows.len() != 1 {
        return Ok(false);
    }

    let row = &rows[0];

    let password_hash: Option<String> = row.get("password_hash");

    match password_hash {
        Some(hash) => {
            let parsed_hash = PasswordHash::new(&hash).map_err(|e| {
                napi::Error::from_reason(format!("Failed to parse password hash: {e}"))
            })?;

            // Use Argon2 to verify the password
            let argon2 = Argon2::default();
            let is_valid = argon2
                .verify_password(pass.as_bytes(), &parsed_hash)
                .is_ok();

            Ok(is_valid)
        }
        None => Ok(false),
    }
}

pub async fn delete_user(email: String) -> napi::Result<User> {
    let client = get_uidb_pool()
        .get()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to get client from pool: {e}")))?;

    let stmt = client
        .prepare_cached(
            "DELETE FROM users 
             WHERE email = $1
             RETURNING 
                uid::text as uid, 
                email, 
                password_hash, 
                oauth_provider, 
                oauth_provider_id,
                date_part('epoch', creation_time) as creation_time",
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to prepare cached: {e}")))?;

    let row = client.query_opt(&stmt, &[&email]).await.map_err(|e| {
        napi::Error::from_reason(format!("Failed to execute delete statement: {e}"))
    })?;

    match row {
        Some(row) => Ok(user_from_row(row)),
        None => Err(napi::Error::from_reason("User not found")),
    }
}

pub async fn update_user(
    email: String,
    pass: Option<String>,
    oauth_provider: Option<String>,
    oauth_provider_id: Option<String>,
) -> napi::Result<User> {
    let client = get_uidb_pool()
        .get()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to get client from pool: {e}")))?;

    let mut updates = Vec::new();
    let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = Vec::new();
    let mut param_counter = 1;
    let password_hash_owned: String;

    if let Some(password) = &pass {
        let salt = SaltString::generate(&mut rand_core::OsRng);
        password_hash_owned = Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| napi::Error::from_reason(format!("Hashing failed: {e}")))?
            .to_string();

        updates.push(format!("password_hash = ${}", param_counter));
        params.push(&password_hash_owned);
        param_counter += 1;
    }

    if let Some(provider) = &oauth_provider {
        updates.push(format!("oauth_provider = ${}", param_counter));
        params.push(provider);
        param_counter += 1;
    }

    if let Some(provider_id) = &oauth_provider_id {
        updates.push(format!("oauth_provider_id = ${}", param_counter));
        params.push(provider_id);
        param_counter += 1;
    }

    if updates.is_empty() {
        return Err(napi::Error::from_reason("No fields to update"));
    }

    params.push(&email);

    let query = format!(
        "UPDATE users 
         SET {}
         WHERE email = ${}
         RETURNING 
            uid::text as uid, 
            email, 
            password_hash, 
            oauth_provider, 
            oauth_provider_id,
            date_part('epoch', creation_time) as creation_time",
        updates.join(", "),
        param_counter
    );

    let stmt = client.prepare_cached(&query).await.map_err(|e| {
        napi::Error::from_reason(format!("Failed to prepare update statement: {e}"))
    })?;

    let row = client
        .query_one(&stmt, &params)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to execute update: {e}")))?;

    Ok(user_from_row(row))
}
