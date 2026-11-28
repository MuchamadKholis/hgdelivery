-- Store hashed login identifiers only; raw email and IP are never persisted here.
CREATE TABLE auth_login_limits (
  limit_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_auth_login_limits_updated ON auth_login_limits(updated_at);
