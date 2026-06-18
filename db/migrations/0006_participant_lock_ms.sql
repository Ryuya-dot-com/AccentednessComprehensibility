ALTER TABLE sessions ADD COLUMN participant_key TEXT;
ALTER TABLE sessions ADD COLUMN started_at_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN completed_at_ms INTEGER;
ALTER TABLE sessions ADD COLUMN last_seen_at_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN completion_url_issued_at_ms INTEGER;
ALTER TABLE sessions ADD COLUMN duplicate_start_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN duplicate_start_last_at TEXT;
ALTER TABLE sessions ADD COLUMN duplicate_start_last_at_ms INTEGER;

UPDATE sessions
SET participant_key = CASE
    WHEN prolific_study_id IS NOT NULL AND prolific_study_id != ''
      AND prolific_pid IS NOT NULL AND prolific_pid != ''
      THEN 'prolific:' || lower(prolific_study_id) || ':' || lower(prolific_pid)
    WHEN prolific_session_id IS NOT NULL AND prolific_session_id != ''
      THEN 'prolific-session:' || lower(prolific_session_id)
    ELSE NULL
  END
WHERE participant_key IS NULL;

UPDATE sessions
SET
  started_at_ms = COALESCE(started_at_ms, 0),
  last_seen_at_ms = COALESCE(last_seen_at_ms, started_at_ms, 0),
  completed_at_ms = CASE WHEN completed_at IS NOT NULL AND completed_at != '' THEN completed_at_ms ELSE NULL END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_participant_key_unique
  ON sessions(participant_key)
  WHERE participant_key IS NOT NULL AND participant_key != '';
