use napi::threadsafe_function::ThreadsafeFunction;
use napi_derive::napi;
use rusqlite::Connection;
use serde_json::json;
use shared_types::LogEntry;
use std::sync::mpsc;
use std::{path::Path, sync::Once, thread};
use tracing::Subscriber;
use tracing_subscriber::{Layer, layer::SubscriberExt, util::SubscriberInitExt};

static INIT_LOGGING: Once = Once::new();

#[napi(object)]
#[derive(Debug, Clone)]
pub struct LogPayload {
    pub level: String,
    pub source: String,
    pub message: String,
    pub metadata: String,
}

#[derive(Default)]
struct MessageVisitor {
    message: String,
}
impl tracing::field::Visit for MessageVisitor {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        if field.name() == "message" {
            self.message = format!("{:?}", value);
        }
    }
}

pub struct SqliteLayer {
    sender: mpsc::Sender<LogPayload>,
    callback: Option<ThreadsafeFunction<LogPayload>>,
}

impl<S: Subscriber> Layer<S> for SqliteLayer {
    fn on_event(
        &self,
        _event: &tracing::Event<'_>,
        _ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        let metadata = _event.metadata();

        let mut visitor = MessageVisitor::default();
        _event.record(&mut visitor);

        let payload = LogPayload {
            level: metadata.level().to_string(),
            source: metadata.target().to_string(),
            message: visitor.message,
            metadata: json!({
                "file": metadata.file(),
                "line": metadata.line(),
                "module": metadata.module_path()
            })
            .to_string(),
        };

        let _ = self.sender.send(payload.clone());
        if let Some(node_callback) = &self.callback {
            node_callback.call(
                Ok(payload),
                napi::threadsafe_function::ThreadsafeFunctionCallMode::NonBlocking,
            );
        }
    }
}

pub async fn init_logger(
    db_path: impl AsRef<Path>,
    callback: Option<ThreadsafeFunction<LogPayload>>,
) {
    INIT_LOGGING.call_once(|| {
        let (tx, rx) = mpsc::channel::<LogPayload>();
        let conn = Connection::open(&db_path).expect("Could not create/open log DB");

        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA cache_size = -2000;
            
            BEGIN;
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')),
                level TEXT NOT NULL,
                source TEXT NOT NULL,
                message TEXT NOT NULL,
                metadata TEXT
            );

            -- Table for indexing
            -- This technically adds a bunch of filesize but makes text searches much faster
            CREATE VIRTUAL TABLE IF NOT EXISTS logs_fts USING fts5(
                message,
                content='logs',
                content_rowid='id'
            );

            -- Ensure rust logging updates search index instantly
            CREATE TRIGGER IF NOT EXISTS logs_ai AFTER INSERT ON logs BEGIN
                INSERT INTO logs_fts(rowid, message) VALUES (new.id, new.message);
            END;

            CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
            CREATE INDEX IF NOT EXISTS idx_logs_source ON logs(source);
            COMMIT;
        ",
        )
        .expect("Failed to initialize high-performance logging schema");

        let dbpb = db_path.as_ref().to_path_buf();

        thread::spawn(move || {
            let conn = Connection::open(&dbpb).expect("Worker failed to open DB");

            let _ = conn.pragma_update(None, "journal_mode", "WAL");
            let _ = conn.pragma_update(None, "synchronous", "NORMAL");

            while let Ok(log) = rx.recv() {
                let _ = conn.execute(
                    "INSERT INTO logs (level, source, message, metadata) VALUES (?1, ?2, ?3, ?4)",
                    (&log.level, &log.source, &log.message, &log.metadata),
                );
            }
        });

        let layer = SqliteLayer {
            sender: tx,
            callback,
        };
        tracing_subscriber::registry()
            .with(layer)
            .with(
                tracing_subscriber::fmt::layer()
                    .with_span_events(tracing_subscriber::fmt::format::FmtSpan::CLOSE),
            )
            .init();
    });
}

pub async fn init_panic_logging() {
    std::panic::set_hook(Box::new(|panic_info| {
        // Extract panic info
        let payload = panic_info
            .payload()
            .downcast_ref::<String>()
            .map(String::as_str)
            .or_else(|| panic_info.payload().downcast_ref::<&str>().copied())
            .unwrap_or("Panic occurred");

        let location = panic_info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "unknown".to_string());

        tracing::error!(
            target: "panic",
            payload = payload,
            location = location,
            "Thread panicked"
        );
    }));
}

pub async fn get_logs(
    db_path: String,
    search_query: String,
    levels: Option<Vec<String>>,
    start_time: Option<String>,
    end_time: Option<String>,
    limit: u32,
) -> napi::Result<Vec<LogEntry>> {
    let conn = Connection::open(&db_path)
        .map_err(|e| napi::Error::from_reason(format!("DB Open Error: {}", e)))?;

    // Base SQL fragments
    let mut where_clauses = Vec::new();
    let mut params: Vec<String> = Vec::new();

    // Level filter
    if let Some(lvls) = levels
        && !lvls.is_empty()
    {
        let placeholders: Vec<String> = (1..=lvls.len()).map(|i| format!("?{}", i)).collect();
        where_clauses.push(format!("level IN ({})", placeholders.join(",")));
        params.extend(lvls);
    }

    // Timestamp filters
    if let Some(start) = start_time {
        where_clauses.push("timestamp >= ?".to_string());
        params.push(start);
    }
    if let Some(end) = end_time {
        where_clauses.push("timestamp <= ?".to_string());
        params.push(end);
    }

    // Decide which query to use based on search_query
    let (sql, mut all_params) = if search_query.is_empty() {
        // Simple query on logs table
        let mut sql = "SELECT id, timestamp, level, source, message FROM logs".to_string();
        if !where_clauses.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&where_clauses.join(" AND "));
        }
        sql.push_str(" ORDER BY id DESC LIMIT ?");
        (sql, params)
    } else {
        // Full‑text search via logs_fts
        let mut sql = "
            SELECT l.id, l.timestamp, l.level, l.source, l.message
            FROM logs l
            JOIN logs_fts f ON l.id = f.rowid
            WHERE logs_fts MATCH ?"
            .to_string();

        // Add additional filters
        if !where_clauses.is_empty() {
            sql.push_str(" AND ");
            sql.push_str(&where_clauses.join(" AND "));
        }
        sql.push_str(" ORDER BY l.id DESC LIMIT ?");

        // Prepend the search_query parameter
        let mut all_params = vec![format!("{}*", search_query)];
        all_params.extend(params);
        (sql, all_params)
    };

    // Append the limit parameter (as string) to the parameter list
    all_params.push(limit.to_string());

    // Prepare and execute statement
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| napi::Error::from_reason(format!("SQL Prepare Error: {}", e)))?;

    let rows = stmt
        .query_map(rusqlite::params_from_iter(all_params), |row| {
            Ok(LogEntry {
                id: row.get::<_, i64>(0)?,
                timestamp: row.get::<_, String>(1)?,
                level: row.get::<_, String>(2)?,
                source: row.get::<_, String>(3)?,
                message: row.get::<_, String>(4)?,
            })
        })
        .map_err(|e| napi::Error::from_reason(format!("Query Execution Error: {}", e)))?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub async fn write_log(level: String, message: String) {
    match level.to_lowercase().as_str() {
        "error" => tracing::error!(target: "nodejs", "{}", message),
        "warn" => tracing::warn!(target: "nodejs", "{}", message),
        "info" => tracing::info!(target: "nodejs", "{}", message),
        "debug" => tracing::debug!(target: "nodejs", "{}", message),
        "trace" => tracing::trace!(target: "nodejs", "{}", message),
        _ => tracing::info!(target: "nodejs", "{}", message),
    }
}
