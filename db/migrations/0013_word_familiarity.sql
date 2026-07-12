ALTER TABLE sessions ADD COLUMN word_familiarity_required INTEGER NOT NULL DEFAULT 0;

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

CREATE INDEX IF NOT EXISTS idx_word_familiarity_target
  ON word_familiarity_responses(target_word, word_known);
