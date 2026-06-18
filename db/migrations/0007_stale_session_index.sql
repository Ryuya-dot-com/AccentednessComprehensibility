CREATE INDEX IF NOT EXISTS idx_sessions_status_last_seen_ms
  ON sessions(status, last_seen_at_ms);
