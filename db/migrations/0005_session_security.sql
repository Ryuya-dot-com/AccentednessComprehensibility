ALTER TABLE sessions ADD COLUMN session_token_hash TEXT;
ALTER TABLE sessions ADD COLUMN turnstile_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN completion_url_issued_at TEXT;
ALTER TABLE sessions ADD COLUMN completion_url_issued_count INTEGER NOT NULL DEFAULT 0;
