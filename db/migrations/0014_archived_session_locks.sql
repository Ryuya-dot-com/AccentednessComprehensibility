-- Keep archived/start_failed Prolific test rows for audit without blocking a
-- new active session for the same Prolific identity.
--
-- Active and completed rows remain strictly unique. The session-start lookup
-- already excludes status='start_failed', so the index predicates must match
-- that lifecycle rule.

DROP INDEX IF EXISTS idx_sessions_participant_key_unique;
DROP INDEX IF EXISTS idx_sessions_prolific_session_unique;
DROP INDEX IF EXISTS idx_sessions_prolific_pid_study_unique;

CREATE UNIQUE INDEX idx_sessions_participant_key_unique
  ON sessions(participant_key)
  WHERE participant_key IS NOT NULL AND participant_key != ''
    AND status != 'start_failed';

CREATE UNIQUE INDEX idx_sessions_prolific_session_unique
  ON sessions(prolific_session_id)
  WHERE prolific_session_id IS NOT NULL AND prolific_session_id != ''
    AND status != 'start_failed';

CREATE UNIQUE INDEX idx_sessions_prolific_pid_study_unique
  ON sessions(prolific_pid, prolific_study_id)
  WHERE prolific_pid IS NOT NULL AND prolific_pid != ''
    AND prolific_study_id IS NOT NULL AND prolific_study_id != ''
    AND status != 'start_failed';
