-- Optional migration for a D1 database that was created before counterbalancing
-- fields were added. Run only once on an existing database.
--
-- New databases should use db/schema.sql instead.

ALTER TABLE sessions ADD COLUMN counterbalance_allocation_id TEXT;
ALTER TABLE sessions ADD COLUMN counterbalance_cell INTEGER;
ALTER TABLE sessions ADD COLUMN list_comb TEXT;
ALTER TABLE sessions ADD COLUMN pronunciation_style TEXT;

ALTER TABLE rating_assignments ADD COLUMN counterbalance_cell INTEGER;
ALTER TABLE rating_assignments ADD COLUMN list_comb TEXT;
ALTER TABLE rating_assignments ADD COLUMN pronunciation_style TEXT;
ALTER TABLE rating_assignments ADD COLUMN stimulus_list TEXT;
ALTER TABLE rating_assignments ADD COLUMN l1_condition TEXT;
ALTER TABLE rating_assignments ADD COLUMN pronunciation_condition TEXT;

ALTER TABLE rating_trials ADD COLUMN counterbalance_cell INTEGER;
ALTER TABLE rating_trials ADD COLUMN list_comb TEXT;
ALTER TABLE rating_trials ADD COLUMN pronunciation_style TEXT;
ALTER TABLE rating_trials ADD COLUMN stimulus_list TEXT;
ALTER TABLE rating_trials ADD COLUMN l1_condition TEXT;
ALTER TABLE rating_trials ADD COLUMN pronunciation_condition TEXT;

CREATE TABLE IF NOT EXISTS counterbalance_cells (
  cell_id INTEGER PRIMARY KEY,
  list_comb TEXT NOT NULL,
  pronunciation_style TEXT NOT NULL CHECK(pronunciation_style IN ('a', 'b')),
  UNIQUE(list_comb, pronunciation_style)
);

CREATE TABLE IF NOT EXISTS counterbalance_allocations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  cell_id INTEGER NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_sessions_counterbalance ON sessions(counterbalance_cell, status);
CREATE INDEX IF NOT EXISTS idx_counterbalance_allocations_cell ON counterbalance_allocations(cell_id, status);
