-- Safety hardening for Prolific sessions and counterbalance allocation logs.
-- Safe to run more than once.

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_prolific_session_unique
  ON sessions(prolific_session_id)
  WHERE prolific_session_id IS NOT NULL AND prolific_session_id != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_prolific_pid_study_unique
  ON sessions(prolific_pid, prolific_study_id)
  WHERE prolific_pid IS NOT NULL AND prolific_pid != ''
    AND prolific_study_id IS NOT NULL AND prolific_study_id != '';

CREATE INDEX IF NOT EXISTS idx_counterbalance_allocations_updated
  ON counterbalance_allocations(status, updated_at);
