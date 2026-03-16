const Database = require('better-sqlite3');
const path = require('path');

// Store the database file in the backend directory.
// Using a file-based DB (not :memory:) so data persists across server restarts.
const db = new Database(path.join(__dirname, 'analytics.db'));

// Enable WAL mode for better concurrent read performance.
// WAL (Write-Ahead Logging) allows reads and writes to happen simultaneously,
// which matters when the dashboard polls while events are being inserted.
db.pragma('journal_mode = WAL');

// Enforce foreign key constraints at the SQLite level.
// SQLite disables them by default — enabling ensures referential integrity.
db.pragma('foreign_keys = ON');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      event_name  TEXT NOT NULL,
      session_id  TEXT NOT NULL,
      page_url    TEXT,
      properties  TEXT,         -- Stored as a JSON string, never parsed by SQLite
      ip_hash     TEXT,         -- SHA-256 hash of the raw IP — raw IP is never stored (GDPR)
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes on the columns most frequently used in WHERE / GROUP BY clauses.
    -- Without these, every aggregate query would do a full table scan.
    CREATE INDEX IF NOT EXISTS idx_event_name ON events(event_name);
    CREATE INDEX IF NOT EXISTS idx_session_id ON events(session_id);
    CREATE INDEX IF NOT EXISTS idx_created_at ON events(created_at);
  `);
}

initSchema();

module.exports = db;
