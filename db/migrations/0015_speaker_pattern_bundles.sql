-- Adds the versioned speaker-pattern bundle allocation dimensions.
-- Existing sessions and allocations intentionally retain NULL values so their
-- legacy hash-based assignments remain distinguishable and resumable.

ALTER TABLE sessions ADD COLUMN speaker_pattern_bundle INTEGER;
ALTER TABLE sessions ADD COLUMN allocation_strategy_version TEXT;
ALTER TABLE sessions ADD COLUMN allocation_cohort TEXT;

ALTER TABLE rating_assignments ADD COLUMN speaker_pattern_bundle INTEGER;
ALTER TABLE rating_assignments ADD COLUMN allocation_strategy_version TEXT;
ALTER TABLE rating_assignments ADD COLUMN allocation_cohort TEXT;

ALTER TABLE rating_trials ADD COLUMN speaker_pattern_bundle INTEGER;
ALTER TABLE rating_trials ADD COLUMN allocation_strategy_version TEXT;
ALTER TABLE rating_trials ADD COLUMN allocation_cohort TEXT;

ALTER TABLE counterbalance_allocations ADD COLUMN speaker_pattern_bundle INTEGER;
ALTER TABLE counterbalance_allocations ADD COLUMN allocation_strategy_version TEXT;
ALTER TABLE counterbalance_allocations ADD COLUMN allocation_cohort TEXT;

CREATE TABLE IF NOT EXISTS speaker_pattern_bundles (
  allocation_strategy_version TEXT NOT NULL,
  speaker_pattern_bundle INTEGER NOT NULL CHECK(speaker_pattern_bundle BETWEEN 1 AND 10),
  block_1_pattern INTEGER NOT NULL CHECK(block_1_pattern BETWEEN 1 AND 10),
  block_2_pattern INTEGER NOT NULL CHECK(block_2_pattern BETWEEN 1 AND 10),
  block_3_pattern INTEGER NOT NULL CHECK(block_3_pattern BETWEEN 1 AND 10),
  block_4_pattern INTEGER NOT NULL CHECK(block_4_pattern BETWEEN 1 AND 10),
  PRIMARY KEY(allocation_strategy_version, speaker_pattern_bundle)
);

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

CREATE INDEX IF NOT EXISTS idx_sessions_counterbalance_bundle
  ON sessions(allocation_cohort, allocation_strategy_version, counterbalance_cell, speaker_pattern_bundle, status);

CREATE INDEX IF NOT EXISTS idx_counterbalance_allocations_bundle
  ON counterbalance_allocations(
    allocation_cohort, allocation_strategy_version, cell_id, speaker_pattern_bundle, status
  );
