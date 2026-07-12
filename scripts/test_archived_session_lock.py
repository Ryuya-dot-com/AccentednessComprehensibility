#!/usr/bin/env python3
"""Regression test for archived Prolific preview identity locks."""

from pathlib import Path
import sqlite3


ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "db" / "schema.sql"
MIGRATION = ROOT / "db" / "migrations" / "0014_archived_session_locks.sql"

PID = "test-prolific-pid"
STUDY = "test-study-id"
OLD_SESSION = "old-session-id"
NEW_SESSION = "new-session-id"


def insert_session(
    db: sqlite3.Connection,
    *,
    row_id: str,
    session_id: str,
    participant_key: str,
    status: str,
) -> None:
    db.execute(
        """
        INSERT INTO sessions (
          id, rater_id, session_label, task_mode, platform_version,
          prolific_pid, prolific_study_id, prolific_session_id,
          participant_key, started_at, last_seen_at, status, trial_count
        ) VALUES (?, ?, ?, 'combined', 'pronunciation_rating_v0.8.0',
                  ?, ?, ?, ?, '2026-07-13T00:00:00.000Z',
                  '2026-07-13T00:00:00.000Z', ?, 104)
        """,
        (
            row_id,
            PID,
            session_id,
            PID,
            STUDY,
            session_id,
            participant_key,
            status,
        ),
    )


def assert_active_duplicate_rejected(db: sqlite3.Connection) -> None:
    try:
        insert_session(
            db,
            row_id="duplicate-active",
            session_id="another-session-id",
            participant_key=f"prolific:{STUDY}:{PID}:duplicate",
            status="started",
        )
    except sqlite3.IntegrityError:
        return
    raise AssertionError("A second active PID+study session bypassed the participant lock")


def test_fresh_schema() -> None:
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA.read_text(encoding="utf-8"))
    insert_session(
        db,
        row_id="archived",
        session_id=OLD_SESSION,
        participant_key="dry-run:archived-preview:archived",
        status="start_failed",
    )
    insert_session(
        db,
        row_id="active",
        session_id=NEW_SESSION,
        participant_key=f"prolific:{STUDY}:{PID}",
        status="started",
    )
    archived = db.execute(
        "SELECT prolific_pid, prolific_study_id, prolific_session_id FROM sessions WHERE id='archived'"
    ).fetchone()
    assert archived == (PID, STUDY, OLD_SESSION), "Archived Prolific IDs were not preserved"
    assert_active_duplicate_rejected(db)
    db.close()


def test_migration() -> None:
    db = sqlite3.connect(":memory:")
    db.executescript(
        """
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          rater_id TEXT NOT NULL,
          session_label TEXT NOT NULL,
          task_mode TEXT NOT NULL,
          platform_version TEXT NOT NULL,
          prolific_pid TEXT,
          prolific_study_id TEXT,
          prolific_session_id TEXT,
          participant_key TEXT,
          started_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          status TEXT NOT NULL,
          trial_count INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX idx_sessions_participant_key_unique
          ON sessions(participant_key)
          WHERE participant_key IS NOT NULL AND participant_key != '';
        CREATE UNIQUE INDEX idx_sessions_prolific_session_unique
          ON sessions(prolific_session_id)
          WHERE prolific_session_id IS NOT NULL AND prolific_session_id != '';
        CREATE UNIQUE INDEX idx_sessions_prolific_pid_study_unique
          ON sessions(prolific_pid, prolific_study_id)
          WHERE prolific_pid IS NOT NULL AND prolific_pid != ''
            AND prolific_study_id IS NOT NULL AND prolific_study_id != '';
        """
    )
    insert_session(
        db,
        row_id="archived",
        session_id=OLD_SESSION,
        participant_key="dry-run:archived-preview:archived",
        status="start_failed",
    )
    db.executescript(MIGRATION.read_text(encoding="utf-8"))
    insert_session(
        db,
        row_id="active",
        session_id=NEW_SESSION,
        participant_key=f"prolific:{STUDY}:{PID}",
        status="started",
    )
    assert_active_duplicate_rejected(db)
    db.close()


def main() -> None:
    test_fresh_schema()
    test_migration()
    print("archived_session_preserves_ids: true")
    print("archived_session_releases_lock: true")
    print("active_session_lock_preserved: true")


if __name__ == "__main__":
    main()
