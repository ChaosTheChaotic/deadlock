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
        roles: row.get("roles"),
        perms: row.get("perms"),
    }
}

pub async fn user_from_uid(uid: impl AsRef<str>) -> napi::Result<Vec<User>> {
    let uid = uid.as_ref(); // I dont want trait bound generic hell
    let client = get_uidb_pool().get().await.map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let stmt = client.prepare_cached(
        "SELECT
            u.uid::text as uid,
            u.email,
            u.password_hash,
            u.oauth_provider,
            u.oauth_provider_id,
            date_part('epoch', u.creation_time) as creation_time,
            ARRAY(
                SELECT r.role_name
                FROM public.Roles r
                JOIN public.User_Roles ur ON r.role_id = ur.role_id
                WHERE ur.user_uid = u.uid
            ) as roles,
            ARRAY(
                SELECT DISTINCT p.perm 
                FROM public.Perms p
                LEFT JOIN public.Role_Perms rp ON p.perm_id = rp.perm_id
                LEFT JOIN public.User_Roles ur ON rp.role_id = ur.role_id
                LEFT JOIN public.User_Perms up ON p.perm_id = up.perm_id
                WHERE ur.user_uid = u.uid OR up.user_uid = u.uid
            ) as perms
            FROM public.Users u 
            WHERE u.uid::text ILIKE $1",
    ).await.map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let rows = client.query(&stmt, &[&uid]).await.map_err(|e| napi::Error::from_reason(e.to_string()))?;
    Ok(rows.into_iter().map(user_from_row).collect())
}

pub async fn search_users(email_str: impl AsRef<str>) -> napi::Result<Vec<User>> {
    let email_str = email_str.as_ref();
    let client = get_uidb_pool().get().await.map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let stmt = client
        .prepare_cached(
            "SELECT 
                u.uid::text as uid, 
                u.email, 
                u.password_hash, 
                u.oauth_provider, 
                u.oauth_provider_id,
                date_part('epoch', u.creation_time) as creation_time,
                -- Handle roles
                ARRAY(
                    SELECT r.role_name 
                    FROM public.Roles r
                    JOIN public.User_Roles ur ON r.role_id = ur.role_id
                    WHERE ur.user_uid = u.uid
                ) as roles,
                -- Handle permissions
                ARRAY(
                    SELECT DISTINCT p.perm 
                    FROM public.Perms p
                    LEFT JOIN public.Role_Perms rp ON p.perm_id = rp.perm_id
                    LEFT JOIN public.User_Roles ur ON rp.role_id = ur.role_id
                    LEFT JOIN public.User_Perms up ON p.perm_id = up.perm_id
                    WHERE ur.user_uid = u.uid OR up.user_uid = u.uid
                ) as perms
             FROM public.Users u 
             WHERE u.email ILIKE $1",
        )
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let rows = client.query(&stmt, &[&email_str]).await.map_err(|e| napi::Error::from_reason(e.to_string()))?;
    Ok(rows.into_iter().map(user_from_row).collect())
}

pub async fn add_user(
    email: String,
    pass: Option<String>,
    oauth_provider: Option<String>,
    oauth_provider_id: Option<String>,
    roles: Option<Vec<String>>,
    perms: Option<Vec<String>>,
) -> napi::Result<User> {
    let mut client = get_uidb_pool()
        .get()
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    // Start transaction so if role assignment fails, the user wont be created.
    let tx = client
        .transaction()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Transaction error: {e}")))?;

    // Check if user already exists
    let existing_stmt = tx.prepare_cached(
        "SELECT uid::text FROM public.Users 
         WHERE (oauth_provider = $1 AND oauth_provider_id = $2) OR email = $3"
    ).await.map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let existing_uid: Option<String> = tx.query_opt(&existing_stmt, &[&oauth_provider, &oauth_provider_id, &email])
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))?
        .map(|row| row.get(0));

    if let Some(uid) = existing_uid {
        // If user exists, we perform an update
        tx.rollback().await.ok(); 
        return update_user(uid, Some(email), pass, oauth_provider, oauth_provider_id, roles, perms).await;
    }

    // Hash password
    let pwd_hash = if let Some(p) = pass {
        let salt = SaltString::generate(&mut rand_core::OsRng);
        Some(Argon2::default()
            .hash_password(p.as_bytes(), &salt)
            .map_err(|e| napi::Error::from_reason(format!("Hashing failed: {e}")))?
            .to_string())
    } else {
        None
    };

    // Insert New User
    let insert_stmt = tx.prepare_cached(
        "INSERT INTO public.Users (email, password_hash, oauth_provider, oauth_provider_id) 
         VALUES ($1, $2, $3, $4) RETURNING uid::text"
    ).await.map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let row = tx.query_one(&insert_stmt, &[&email, &pwd_hash, &oauth_provider, &oauth_provider_id])
        .await
        .map_err(|e| napi::Error::from_reason(format!("Insert failed: {e}")))?;
    
    let new_uid: String = row.get(0);

    // Handle Roles (default to "user" if none provided)
    let target_roles = roles.unwrap_or_else(|| vec!["user".to_string()]);
    for role_name in target_roles {
        tx.execute(
            "INSERT INTO public.User_Roles (user_uid, role_id) 
             SELECT $1::uuid, role_id FROM public.Roles WHERE role_name = $2",
            &[&new_uid, &role_name],
        ).await.ok();
    }

    // Handle direct permissions
    if let Some(target_perms) = perms {
        for perm_slug in target_perms {
            tx.execute(
                "INSERT INTO public.User_Perms (user_uid, perm_id) 
                 SELECT $1::uuid, perm_id FROM public.Perms WHERE perm = $2",
                &[&new_uid, &perm_slug],
            ).await.ok();
        }
    }

    tx.commit().await.map_err(|e| napi::Error::from_reason(e.to_string()))?;

    Ok(user_from_uid(&new_uid).await?.into_iter().next().ok_or(napi::Error::from_reason("No user returned"))?)
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
    uid: String,
    email: Option<String>,
    pass: Option<String>,
    oauth_provider: Option<String>,
    oauth_provider_id: Option<String>,
    roles: Option<Vec<String>>,
    perms: Option<Vec<String>>,
) -> napi::Result<User> {
    let mut client = get_uidb_pool()
        .get()
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let tx = client
        .transaction()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Transaction error: {e}")))?;

    let mut updates = Vec::new();
    let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = Vec::new();
    let mut param_counter = 1;

    // Handle metadata updates
    if let Some(e) = &email {
        updates.push(format!("email = ${}", param_counter));
        params.push(e);
        param_counter += 1;
    }

    let password_hash_owned;
    if let Some(p) = &pass {
        let salt = SaltString::generate(&mut rand_core::OsRng);
        password_hash_owned = Argon2::default()
            .hash_password(p.as_bytes(), &salt)
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

    if !updates.is_empty() {
        params.push(&uid);
        let query = format!(
            "UPDATE public.Users SET {} WHERE uid = ${}::uuid",
            updates.join(", "),
            param_counter
        );
        tx.execute(&query, &params)
            .await
            .map_err(|e| napi::Error::from_reason(format!("Metadata update failed: {e}")))?;
    }

    // Handle roles
    if let Some(role_list) = roles {
        tx.execute(
            "DELETE FROM public.User_Roles WHERE user_uid = $1::uuid",
            &[&uid],
        ).await.map_err(|e| napi::Error::from_reason(e.to_string()))?;

        for role_name in role_list {
            tx.execute(
                "INSERT INTO public.User_Roles (user_uid, role_id) 
                 SELECT $1::uuid, role_id FROM public.Roles WHERE role_name = $2",
                &[&uid, &role_name],
            ).await.ok(); 
        }
    }

    // Handle direct permissions
    if let Some(perm_list) = perms {
        tx.execute(
            "DELETE FROM public.User_Perms WHERE user_uid = $1::uuid",
            &[&uid],
        ).await.map_err(|e| napi::Error::from_reason(e.to_string()))?;

        for perm_slug in perm_list {
            tx.execute(
                "INSERT INTO public.User_Perms (user_uid, perm_id) 
                 SELECT $1::uuid, perm_id FROM public.Perms WHERE perm = $2",
                &[&uid, &perm_slug],
            ).await.ok();
        }
    }

    tx.commit().await.map_err(|e| napi::Error::from_reason(e.to_string()))?;

    // Return user
    Ok(user_from_uid(&uid).await?.into_iter().next().ok_or(napi::Error::from_reason("No user returned"))?)
}
