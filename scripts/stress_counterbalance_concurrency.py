#!/usr/bin/env python3
"""Stress-test counterbalance allocation under simultaneous starts.

    This is a local SQLite analogue of the D1 allocation query. It verifies that
    many sessions with the same timestamp are still spread across the 20 cells by
    the active-or-completed / completed / assigned ordering and session-based
    tie-breaker used by the Pages Function.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import os
import sqlite3
import tempfile
import threading
import uuid
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ROOT.parent
DROPBOX_PACKAGE_ROOT = Path("/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703")
SCHEMA = ROOT / "db" / "schema.sql"
FIXED_TIMESTAMP = "2026-07-03T00:00:00.000Z"
CELL_COUNT = 20


def default_package_root() -> Path:
    env_root = os.environ.get("STIMULI_PACKAGE_ROOT", "").strip()
    if env_root:
        return Path(env_root).expanduser()
    adjacent_root = PROJECT_ROOT / "Stimuli_OSF_Release_20260703"
    if package_root_looks_usable(DROPBOX_PACKAGE_ROOT):
        return DROPBOX_PACKAGE_ROOT
    if package_root_looks_usable(adjacent_root):
        return adjacent_root
    return adjacent_root


def package_root_looks_usable(package_root: Path) -> bool:
    return (package_root / "remote_manifest.csv").exists() or (
        package_root / "metadata" / "selected_practice_manifest.csv"
    ).exists()


def init_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.executescript(SCHEMA.read_text(encoding="utf-8"))
        conn.commit()
    finally:
        conn.close()


def hash_string(value: str) -> int:
    h = 2166136261
    for char in str(value):
        h ^= ord(char)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def allocate(path: Path, worker_id: int, barrier: threading.Barrier, timeout_s: float) -> int:
    conn = sqlite3.connect(path, timeout=timeout_s, isolation_level=None)
    try:
        conn.execute(f"PRAGMA busy_timeout = {int(timeout_s * 1000)}")
        barrier.wait(timeout=timeout_s)
        session_id = f"simultaneous-session-{worker_id:05d}"
        allocation_id = str(uuid.uuid4())
        tie_breaker_offset = hash_string(session_id) % CELL_COUNT
        conn.execute(
            """
            INSERT INTO counterbalance_allocations (
              id, session_id, cell_id, status, assigned_at, updated_at
            )
            SELECT ?, ?, c.cell_id, 'started', ?, ?
            FROM counterbalance_cells c
            ORDER BY
              (
                SELECT COUNT(*)
                FROM counterbalance_allocations ca
                WHERE ca.cell_id = c.cell_id
                  AND ca.status IN ('started', 'completed')
              ) ASC,
              (
                SELECT COUNT(*)
                FROM counterbalance_allocations ca
                WHERE ca.cell_id = c.cell_id
                  AND ca.status = 'completed'
              ) ASC,
              (
                SELECT COUNT(*)
                FROM counterbalance_allocations ca
                WHERE ca.cell_id = c.cell_id
                  AND ca.status NOT LIKE 'dry_run_%'
              ) ASC,
              ((c.cell_id + ?) % 20) ASC,
              c.cell_id ASC
            LIMIT 1
            """,
            (allocation_id, session_id, FIXED_TIMESTAMP, FIXED_TIMESTAMP, tie_breaker_offset),
        )
        row = conn.execute(
            "SELECT cell_id FROM counterbalance_allocations WHERE id = ?",
            (allocation_id,),
        ).fetchone()
        if not row:
            raise RuntimeError("allocation row was not inserted")
        return int(row[0])
    finally:
        conn.close()


def summarize(path: Path) -> list[tuple[int, int]]:
    conn = sqlite3.connect(path)
    try:
        return [
            (int(cell_id), int(count))
            for cell_id, count in conn.execute(
                """
                SELECT cc.cell_id, COUNT(ca.id) AS n
                FROM counterbalance_cells cc
                LEFT JOIN counterbalance_allocations ca ON ca.cell_id = cc.cell_id
                GROUP BY cc.cell_id
                ORDER BY cc.cell_id
                """
            ).fetchall()
        ]
    finally:
        conn.close()


def duplicate_participant_key_check(path: Path) -> None:
    conn = sqlite3.connect(path)
    try:
        base = {
            "id": "duplicate-a",
            "rater_id": "rater",
            "session_label": "session",
            "task_mode": "combined",
            "platform_version": "stress",
            "prolific_pid": "P_DUP",
            "prolific_study_id": "STUDY_DUP",
            "prolific_session_id": "SESSION_DUP_A",
            "participant_key": "prolific:study_dup:p_dup",
            "started_at": FIXED_TIMESTAMP,
            "started_at_ms": 1,
            "last_seen_at": FIXED_TIMESTAMP,
            "last_seen_at_ms": 1,
            "trial_count": 104,
        }
        conn.execute(
            """
            INSERT INTO sessions (
              id, rater_id, session_label, task_mode, platform_version,
              prolific_pid, prolific_study_id, prolific_session_id,
              participant_key, started_at, started_at_ms, last_seen_at,
              last_seen_at_ms, trial_count
            ) VALUES (
              :id, :rater_id, :session_label, :task_mode, :platform_version,
              :prolific_pid, :prolific_study_id, :prolific_session_id,
              :participant_key, :started_at, :started_at_ms, :last_seen_at,
              :last_seen_at_ms, :trial_count
            )
            """,
            base,
        )
        duplicate = {**base, "id": "duplicate-b", "prolific_session_id": "SESSION_DUP_B"}
        try:
            conn.execute(
                """
                INSERT INTO sessions (
                  id, rater_id, session_label, task_mode, platform_version,
                  prolific_pid, prolific_study_id, prolific_session_id,
                  participant_key, started_at, started_at_ms, last_seen_at,
                  last_seen_at_ms, trial_count
                ) VALUES (
                  :id, :rater_id, :session_label, :task_mode, :platform_version,
                  :prolific_pid, :prolific_study_id, :prolific_session_id,
                  :participant_key, :started_at, :started_at_ms, :last_seen_at,
                  :last_seen_at_ms, :trial_count
                )
                """,
                duplicate,
            )
        except sqlite3.IntegrityError:
            return
        raise RuntimeError("duplicate participant_key insert unexpectedly succeeded")
    finally:
        conn.close()


def write_report(path: Path, participants: int, workers: int, counts: list[tuple[int, int]]) -> None:
    values = [count for _, count in counts]
    lines = [
        "# Counterbalance Concurrency Stress Test",
        "",
        f"Generated with `{Path(__file__).name}`.",
        "",
        "## Scenario",
        "",
        f"- Simultaneous starts: {participants}",
        f"- Worker threads: {workers}",
        f"- Fixed timestamp: `{FIXED_TIMESTAMP}`",
        "- Local engine: SQLite using the same allocation-order SQL as the Pages Function.",
        "",
        "## Result",
        "",
        f"- assigned_min: {min(values)}",
        f"- assigned_max: {max(values)}",
        f"- assigned_spread: {max(values) - min(values)}",
        "- duplicate_participant_key_check: passed",
        "",
        "## Cell Counts",
        "",
        "| cell_id | assigned_count |",
        "| ---: | ---: |",
    ]
    for cell_id, count in counts:
        lines.append(f"| {cell_id} | {count} |")
    lines.extend(
        [
            "",
            "Interpretation: a spread of 0 or 1 is expected for a single simultaneous-start wave.",
            "This local check does not replace a Cloudflare D1 dry run, but it verifies the SQL-level invariant under SQLite-compatible concurrent writes.",
            "",
        ]
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--participants", type=int, default=200)
    parser.add_argument("--workers", type=int, default=0, help="Defaults to --participants.")
    parser.add_argument("--timeout-s", type=float, default=30.0)
    parser.add_argument("--keep-db", type=Path, default=None)
    parser.add_argument("--package-root", type=Path, default=None)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()
    package_root = args.package_root.expanduser() if args.package_root else default_package_root()
    report_path = args.out or package_root / "metadata" / "COUNTERBALANCE_CONCURRENCY_STRESS_20260703.md"

    if args.participants < 20:
        raise SystemExit("--participants must be at least 20")
    workers = args.workers or args.participants
    if workers < 1:
        raise SystemExit("--workers must be positive")
    if workers < args.participants:
        raise SystemExit("--workers must be at least --participants for a single simultaneous-start wave")

    with tempfile.TemporaryDirectory() as tmp:
        db_path = args.keep_db.expanduser().resolve() if args.keep_db else Path(tmp) / "counterbalance_stress.sqlite3"
        init_db(db_path)
        barrier = threading.Barrier(args.participants)
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [
                executor.submit(allocate, db_path, index + 1, barrier, args.timeout_s)
                for index in range(args.participants)
            ]
            cell_ids = [future.result(timeout=args.timeout_s + 5) for future in futures]

        counts = summarize(db_path)
        values = [count for _, count in counts]
        spread = max(values) - min(values)
        if len(cell_ids) != args.participants:
            raise RuntimeError("not every participant received an allocation")
        if spread > 1:
            raise RuntimeError(f"allocation spread is too large: {spread}; counts={counts}")

        duplicate_participant_key_check(db_path)
        if report_path:
            write_report(report_path.expanduser().resolve(), args.participants, workers, counts)
        print(f"simultaneous starts: {args.participants}")
        print(f"workers: {workers}")
        print(f"assigned_min: {min(values)}")
        print(f"assigned_max: {max(values)}")
        print(f"assigned_spread: {spread}")
        print("cell_counts:", " ".join(f"{cell}:{count}" for cell, count in counts))
        print("duplicate_participant_key_check: passed")
        if report_path:
            print(f"report: {report_path.expanduser().resolve()}")
        if args.keep_db:
            print(f"database: {db_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
