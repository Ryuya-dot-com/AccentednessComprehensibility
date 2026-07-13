-- Cloudflare D1 schema for the server-backed Rating Platform.
-- Apply with:
--   wrangler d1 execute <DB_NAME> --file=./db/schema.sql

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'rater',
  rater_id TEXT NOT NULL,
  session_label TEXT NOT NULL,
  task_mode TEXT NOT NULL,
  platform_version TEXT NOT NULL,
  prolific_pid TEXT,
  prolific_study_id TEXT,
  prolific_session_id TEXT,
  participant_key TEXT,
  seed TEXT,
  user_agent TEXT,
  timezone TEXT,
  participant_age_years INTEGER,
  english_variety TEXT,
  english_variety_other TEXT,
  gender TEXT,
  gender_other TEXT,
  english_teaching_experience TEXT,
  english_teaching_experience_details TEXT,
  linguistics_knowledge TEXT,
  linguistics_knowledge_details TEXT,
  japanese_familiarity_1_6 INTEGER,
  chinese_familiarity_1_6 INTEGER,
  word_familiarity_required INTEGER NOT NULL DEFAULT 0,
  completion_code TEXT,
  session_token_hash TEXT,
  turnstile_verified INTEGER NOT NULL DEFAULT 0,
  counterbalance_allocation_id TEXT,
  counterbalance_cell INTEGER,
  list_comb TEXT,
  pronunciation_style TEXT,
  speaker_pattern_bundle INTEGER,
  allocation_strategy_version TEXT,
  allocation_cohort TEXT,
  screen_json TEXT,
  started_at TEXT NOT NULL,
  started_at_ms INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  completed_at_ms INTEGER,
  last_seen_at TEXT NOT NULL,
  last_seen_at_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'started',
  trial_count INTEGER NOT NULL DEFAULT 0,
  completed_trial_count INTEGER NOT NULL DEFAULT 0,
  completion_url_issued_at TEXT,
  completion_url_issued_at_ms INTEGER,
  completion_url_issued_count INTEGER NOT NULL DEFAULT 0,
  duplicate_start_count INTEGER NOT NULL DEFAULT 0,
  duplicate_start_last_at TEXT,
  duplicate_start_last_at_ms INTEGER
);

CREATE TABLE IF NOT EXISTS rating_assignments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'main',
  trial_index INTEGER NOT NULL,
  source_path TEXT,
  audio_url TEXT,
  file_name TEXT,
  target_word TEXT,
  participant_id TEXT,
  native_language TEXT,
  accent_condition TEXT,
  condition TEXT,
  talker TEXT,
  pass_number TEXT,
  word_number TEXT,
  trial_number TEXT,
  take_number TEXT,
  spoken_form TEXT,
  practice_note TEXT,
  source_format TEXT,
  practice_kind TEXT,
  practice_group TEXT,
  counterbalance_cell INTEGER,
  list_comb TEXT,
  pronunciation_style TEXT,
  stimulus_list TEXT,
  l1_condition TEXT,
  pronunciation_condition TEXT,
  block_index INTEGER,
  block_list TEXT,
  within_block_index INTEGER,
  block_trial_count INTEGER,
  speaker_pattern_bundle INTEGER,
  allocation_strategy_version TEXT,
  allocation_cohort TEXT,
  speaker_pattern_index INTEGER,
  speaker_pattern_speaker TEXT,
  expert_comprehensibility_1_9 INTEGER,
  expert_accentedness_1_9 INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, phase, trial_index),
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS rating_trials (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  assignment_id TEXT,
  rater_id TEXT NOT NULL,
  session_label TEXT NOT NULL,
  prolific_pid TEXT,
  prolific_study_id TEXT,
  prolific_session_id TEXT,
  task_mode TEXT NOT NULL,
  platform_version TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'main',
  practice_kind TEXT,
  practice_group TEXT,
  counterbalance_cell INTEGER,
  list_comb TEXT,
  pronunciation_style TEXT,
  stimulus_list TEXT,
  l1_condition TEXT,
  pronunciation_condition TEXT,
  block_index INTEGER,
  block_list TEXT,
  within_block_index INTEGER,
  block_trial_count INTEGER,
  speaker_pattern_bundle INTEGER,
  allocation_strategy_version TEXT,
  allocation_cohort TEXT,
  speaker_pattern_index INTEGER,
  speaker_pattern_speaker TEXT,
  trial_index INTEGER NOT NULL,
  trial_total INTEGER NOT NULL,
  completed_at TEXT NOT NULL,
  played_at TEXT,
  source_path TEXT,
  audio_url TEXT,
  file_name TEXT,
  participant_id TEXT,
  native_language TEXT,
  accent_condition TEXT,
  condition TEXT,
  talker TEXT,
  pass_number TEXT,
  word_number TEXT,
  trial_number TEXT,
  take_number TEXT,
  spoken_form TEXT,
  practice_note TEXT,
  source_format TEXT,
  target_word TEXT,
  typed_response TEXT,
  normalized_response TEXT,
  normalized_target TEXT,
  intelligibility_exact INTEGER,
  intelligibility_needs_manual_review INTEGER,
  intelligibility_response_status TEXT,
  intelligibility_unidentified INTEGER NOT NULL DEFAULT 0,
  comprehensibility_1_9 INTEGER,
  accentedness_1_9 INTEGER,
  expert_comprehensibility_1_9 INTEGER,
  expert_accentedness_1_9 INTEGER,
  practice_feedback TEXT,
  practice_requires_reason INTEGER,
  practice_reason TEXT,
  japanese_familiarity_1_6 INTEGER,
  chinese_familiarity_1_6 INTEGER,
  first_key_rt_ms REAL,
  submit_rt_ms REAL,
  audio_duration_s REAL,
  replay_count INTEGER NOT NULL DEFAULT 0,
  response_flow TEXT,
  dictation_played_at TEXT,
  rating_played_at TEXT,
  dictation_submit_rt_ms REAL,
  rating_submit_rt_ms REAL,
  dictation_audio_duration_s REAL,
  rating_audio_duration_s REAL,
  response_order TEXT,
  first_response_field TEXT,
  first_response_rt_ms REAL,
  rating_order TEXT,
  rating_interaction_sequence TEXT,
  first_rating_field TEXT,
  first_rating_rt_ms REAL,
  comprehensibility_first_rt_ms REAL,
  comprehensibility_last_rt_ms REAL,
  comprehensibility_selection_count INTEGER NOT NULL DEFAULT 0,
  accentedness_first_rt_ms REAL,
  accentedness_last_rt_ms REAL,
  accentedness_selection_count INTEGER NOT NULL DEFAULT 0,
  unidentified_selected_rt_ms REAL,
  client_saved_at TEXT NOT NULL,
  server_received_at TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  UNIQUE(session_id, phase, trial_index),
  FOREIGN KEY(session_id) REFERENCES sessions(id),
  FOREIGN KEY(assignment_id) REFERENCES rating_assignments(id)
);

CREATE TABLE IF NOT EXISTS word_familiarity_responses (
  session_id TEXT NOT NULL,
  word_number INTEGER NOT NULL CHECK(word_number BETWEEN 1 AND 50),
  target_word TEXT NOT NULL,
  word_known INTEGER NOT NULL CHECK(word_known IN (0, 1)),
  submitted_at TEXT NOT NULL,
  submitted_at_ms INTEGER NOT NULL,
  PRIMARY KEY(session_id, word_number),
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS event_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  rater_id TEXT,
  event_type TEXT NOT NULL,
  trial_index INTEGER,
  event_at TEXT NOT NULL,
  server_received_at TEXT NOT NULL,
  payload_json TEXT,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS counterbalance_cells (
  cell_id INTEGER PRIMARY KEY,
  list_comb TEXT NOT NULL,
  pronunciation_style TEXT NOT NULL CHECK(pronunciation_style IN ('a', 'b')),
  UNIQUE(list_comb, pronunciation_style)
);

CREATE TABLE IF NOT EXISTS speaker_pattern_bundles (
  allocation_strategy_version TEXT NOT NULL,
  speaker_pattern_bundle INTEGER NOT NULL CHECK(speaker_pattern_bundle BETWEEN 1 AND 10),
  block_1_pattern INTEGER NOT NULL CHECK(block_1_pattern BETWEEN 1 AND 10),
  block_2_pattern INTEGER NOT NULL CHECK(block_2_pattern BETWEEN 1 AND 10),
  block_3_pattern INTEGER NOT NULL CHECK(block_3_pattern BETWEEN 1 AND 10),
  block_4_pattern INTEGER NOT NULL CHECK(block_4_pattern BETWEEN 1 AND 10),
  PRIMARY KEY(allocation_strategy_version, speaker_pattern_bundle)
);

CREATE TABLE IF NOT EXISTS counterbalance_allocations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  cell_id INTEGER NOT NULL,
  speaker_pattern_bundle INTEGER,
  allocation_strategy_version TEXT,
  allocation_cohort TEXT,
  status TEXT NOT NULL DEFAULT 'started',
  assigned_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(cell_id) REFERENCES counterbalance_cells(cell_id)
);

INSERT OR IGNORE INTO counterbalance_cells (cell_id, list_comb, pronunciation_style) VALUES
  (1, 'ABCD', 'a'),
  (2, 'BCDE', 'a'),
  (3, 'CDEF', 'a'),
  (4, 'DEFG', 'a'),
  (5, 'EFGH', 'a'),
  (6, 'FGHI', 'a'),
  (7, 'GHIJ', 'a'),
  (8, 'HIJA', 'a'),
  (9, 'IJAB', 'a'),
  (10, 'JABC', 'a'),
  (11, 'ABCD', 'b'),
  (12, 'BCDE', 'b'),
  (13, 'CDEF', 'b'),
  (14, 'DEFG', 'b'),
  (15, 'EFGH', 'b'),
  (16, 'FGHI', 'b'),
  (17, 'GHIJ', 'b'),
  (18, 'HIJA', 'b'),
  (19, 'IJAB', 'b'),
  (20, 'JABC', 'b');

INSERT OR IGNORE INTO speaker_pattern_bundles (
  allocation_strategy_version, speaker_pattern_bundle,
  block_1_pattern, block_2_pattern, block_3_pattern, block_4_pattern
) VALUES
  ('speaker_bundle_latin_v1', 1, 10, 8, 5, 9),
  ('speaker_bundle_latin_v1', 2, 6, 1, 9, 10),
  ('speaker_bundle_latin_v1', 3, 1, 6, 4, 3),
  ('speaker_bundle_latin_v1', 4, 8, 10, 3, 7),
  ('speaker_bundle_latin_v1', 5, 3, 5, 6, 2),
  ('speaker_bundle_latin_v1', 6, 9, 4, 8, 1),
  ('speaker_bundle_latin_v1', 7, 2, 9, 7, 6),
  ('speaker_bundle_latin_v1', 8, 4, 7, 10, 5),
  ('speaker_bundle_latin_v1', 9, 5, 2, 1, 8),
  ('speaker_bundle_latin_v1', 10, 7, 3, 2, 4);

CREATE INDEX IF NOT EXISTS idx_sessions_rater ON sessions(rater_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_status_last_seen_ms ON sessions(status, last_seen_at_ms);
CREATE INDEX IF NOT EXISTS idx_sessions_counterbalance ON sessions(counterbalance_cell, status);
CREATE INDEX IF NOT EXISTS idx_sessions_counterbalance_bundle
  ON sessions(allocation_cohort, allocation_strategy_version, counterbalance_cell, speaker_pattern_bundle, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_participant_key_unique
  ON sessions(participant_key)
  WHERE participant_key IS NOT NULL AND participant_key != ''
    AND status != 'start_failed';
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_prolific_session_unique
  ON sessions(prolific_session_id)
  WHERE prolific_session_id IS NOT NULL AND prolific_session_id != ''
    AND status != 'start_failed';
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_prolific_pid_study_unique
  ON sessions(prolific_pid, prolific_study_id)
  WHERE prolific_pid IS NOT NULL AND prolific_pid != ''
    AND prolific_study_id IS NOT NULL AND prolific_study_id != ''
    AND status != 'start_failed';
CREATE INDEX IF NOT EXISTS idx_assignments_session ON rating_assignments(session_id, phase, trial_index);
CREATE INDEX IF NOT EXISTS idx_trials_session ON rating_trials(session_id, phase, trial_index);
CREATE INDEX IF NOT EXISTS idx_trials_participant ON rating_trials(participant_id);
CREATE INDEX IF NOT EXISTS idx_word_familiarity_target
  ON word_familiarity_responses(target_word, word_known);
CREATE INDEX IF NOT EXISTS idx_events_session ON event_logs(session_id, event_at);
CREATE INDEX IF NOT EXISTS idx_counterbalance_allocations_cell ON counterbalance_allocations(cell_id, status);
CREATE INDEX IF NOT EXISTS idx_counterbalance_allocations_updated ON counterbalance_allocations(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_counterbalance_allocations_bundle
  ON counterbalance_allocations(
    allocation_cohort, allocation_strategy_version, cell_id, speaker_pattern_bundle, status
  );
