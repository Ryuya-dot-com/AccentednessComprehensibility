#!/usr/bin/env python3
"""Stress-test bundled counterbalance allocation under simultaneous starts.

This is a local SQLite analogue of the D1 allocation query. At the launch target
of 200 starts it verifies exact coverage of all 20 cells × 10 speaker-pattern
bundles, along with the cohort and strategy metadata persisted by D1.
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
BUNDLE_COUNT = 10
MICROCELL_COUNT = CELL_COUNT * BUNDLE_COUNT
ALLOCATION_STRATEGY_VERSION = "speaker_bundle_latin_v1"
ALLOCATION_COHORT = "dry_run:speaker_bundle_latin_v1"
STARTED_STATUS = "dry_run_started"
COMPLETED_STATUS = "dry_run_completed"


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


def allocate(
    path: Path,
    worker_id: int,
    barrier: threading.Barrier,
    timeout_s: float,
) -> tuple[int, int, str, str]:
    conn = sqlite3.connect(path, timeout=timeout_s, isolation_level=None)
    try:
        conn.execute(f"PRAGMA busy_timeout = {int(timeout_s * 1000)}")
        barrier.wait(timeout=timeout_s)
        session_id = f"simultaneous-session-{worker_id:05d}"
        allocation_id = str(uuid.uuid4())
        tie_breaker_offset = hash_string(session_id) % MICROCELL_COUNT
        conn.execute(
            """
            WITH scoped AS (
              SELECT cell_id, speaker_pattern_bundle, status
              FROM counterbalance_allocations
              WHERE allocation_cohort = ?
                AND allocation_strategy_version = ?
            ),
            cell_stats AS (
              SELECT
                cell_id,
                SUM(CASE WHEN status IN (?, ?) THEN 1 ELSE 0 END) AS active_completed,
                SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS completed,
                COUNT(*) AS historical
              FROM scoped
              GROUP BY cell_id
            ),
            combination_stats AS (
              SELECT
                cell_id,
                speaker_pattern_bundle,
                SUM(CASE WHEN status IN (?, ?) THEN 1 ELSE 0 END) AS active_completed,
                SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS completed,
                COUNT(*) AS historical
              FROM scoped
              GROUP BY cell_id, speaker_pattern_bundle
            ),
            bundle_stats AS (
              SELECT
                speaker_pattern_bundle,
                SUM(CASE WHEN status IN (?, ?) THEN 1 ELSE 0 END) AS active_completed,
                SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS completed
              FROM scoped
              GROUP BY speaker_pattern_bundle
            )
            INSERT INTO counterbalance_allocations (
              id, session_id, cell_id, speaker_pattern_bundle,
              allocation_strategy_version, allocation_cohort,
              status, assigned_at, updated_at
            )
            SELECT ?, ?, c.cell_id, b.speaker_pattern_bundle, ?, ?, ?, ?, ?
            FROM counterbalance_cells c
            CROSS JOIN speaker_pattern_bundles b
            LEFT JOIN cell_stats cs ON cs.cell_id = c.cell_id
            LEFT JOIN combination_stats cbs
              ON cbs.cell_id = c.cell_id
             AND cbs.speaker_pattern_bundle = b.speaker_pattern_bundle
            LEFT JOIN bundle_stats bs
              ON bs.speaker_pattern_bundle = b.speaker_pattern_bundle
            WHERE b.allocation_strategy_version = ?
            ORDER BY
              COALESCE(cs.active_completed, 0) ASC,
              COALESCE(cs.completed, 0) ASC,
              COALESCE(cbs.active_completed, 0) ASC,
              COALESCE(cbs.completed, 0) ASC,
              COALESCE(bs.active_completed, 0) ASC,
              COALESCE(bs.completed, 0) ASC,
              COALESCE(cs.historical, 0) ASC,
              COALESCE(cbs.historical, 0) ASC,
              ((((c.cell_id - 1) * 10) +
                (b.speaker_pattern_bundle - 1) + ?) % 200) ASC,
              c.cell_id ASC,
              b.speaker_pattern_bundle ASC
            LIMIT 1
            """,
            (
                ALLOCATION_COHORT,
                ALLOCATION_STRATEGY_VERSION,
                STARTED_STATUS,
                COMPLETED_STATUS,
                COMPLETED_STATUS,
                STARTED_STATUS,
                COMPLETED_STATUS,
                COMPLETED_STATUS,
                STARTED_STATUS,
                COMPLETED_STATUS,
                COMPLETED_STATUS,
                allocation_id,
                session_id,
                ALLOCATION_STRATEGY_VERSION,
                ALLOCATION_COHORT,
                STARTED_STATUS,
                FIXED_TIMESTAMP,
                FIXED_TIMESTAMP,
                ALLOCATION_STRATEGY_VERSION,
                tie_breaker_offset,
            ),
        )
        row = conn.execute(
            """SELECT cell_id, speaker_pattern_bundle,
                      allocation_strategy_version, allocation_cohort
               FROM counterbalance_allocations WHERE id = ?""",
            (allocation_id,),
        ).fetchone()
        if not row:
            raise RuntimeError("allocation row was not inserted")
        return int(row[0]), int(row[1]), str(row[2]), str(row[3])
    finally:
        conn.close()


def summarize_cells(path: Path) -> list[tuple[int, int]]:
    conn = sqlite3.connect(path)
    try:
        return [
            (int(cell_id), int(count))
            for cell_id, count in conn.execute(
                """
                SELECT cc.cell_id, COUNT(ca.id) AS n
                FROM counterbalance_cells cc
                LEFT JOIN counterbalance_allocations ca
                  ON ca.cell_id = cc.cell_id
                 AND ca.allocation_cohort = ?
                 AND ca.allocation_strategy_version = ?
                GROUP BY cc.cell_id
                ORDER BY cc.cell_id
                """,
                (ALLOCATION_COHORT, ALLOCATION_STRATEGY_VERSION),
            ).fetchall()
        ]
    finally:
        conn.close()


def summarize_bundles(path: Path) -> list[tuple[int, int]]:
    conn = sqlite3.connect(path)
    try:
        return [
            (int(bundle_id), int(count))
            for bundle_id, count in conn.execute(
                """
                SELECT spb.speaker_pattern_bundle, COUNT(ca.id) AS n
                FROM speaker_pattern_bundles spb
                LEFT JOIN counterbalance_allocations ca
                  ON ca.speaker_pattern_bundle = spb.speaker_pattern_bundle
                 AND ca.allocation_strategy_version = spb.allocation_strategy_version
                 AND ca.allocation_cohort = ?
                WHERE spb.allocation_strategy_version = ?
                GROUP BY spb.speaker_pattern_bundle
                ORDER BY spb.speaker_pattern_bundle
                """,
                (ALLOCATION_COHORT, ALLOCATION_STRATEGY_VERSION),
            ).fetchall()
        ]
    finally:
        conn.close()


def summarize_microcells(path: Path) -> list[tuple[int, int, int]]:
    conn = sqlite3.connect(path)
    try:
        return [
            (int(cell_id), int(bundle_id), int(count))
            for cell_id, bundle_id, count in conn.execute(
                """
                SELECT cc.cell_id, spb.speaker_pattern_bundle, COUNT(ca.id) AS n
                FROM counterbalance_cells cc
                CROSS JOIN speaker_pattern_bundles spb
                LEFT JOIN counterbalance_allocations ca
                  ON ca.cell_id = cc.cell_id
                 AND ca.speaker_pattern_bundle = spb.speaker_pattern_bundle
                 AND ca.allocation_strategy_version = spb.allocation_strategy_version
                 AND ca.allocation_cohort = ?
                WHERE spb.allocation_strategy_version = ?
                GROUP BY cc.cell_id, spb.speaker_pattern_bundle
                ORDER BY cc.cell_id, spb.speaker_pattern_bundle
                """,
                (ALLOCATION_COHORT, ALLOCATION_STRATEGY_VERSION),
            ).fetchall()
        ]
    finally:
        conn.close()


def verify_d1_metadata(path: Path, expected_rows: int) -> None:
    conn = sqlite3.connect(path)
    try:
        rows = conn.execute(
            """
            SELECT cell_id, speaker_pattern_bundle, allocation_strategy_version,
                   allocation_cohort, status
            FROM counterbalance_allocations
            WHERE allocation_cohort = ? AND allocation_strategy_version = ?
            ORDER BY session_id
            """,
            (ALLOCATION_COHORT, ALLOCATION_STRATEGY_VERSION),
        ).fetchall()
        if len(rows) != expected_rows:
            raise RuntimeError(
                f"D1 metadata row count mismatch: expected {expected_rows}, got {len(rows)}"
            )
        for row in rows:
            cell_id, bundle_id, strategy, cohort, status = row
            if not (1 <= int(cell_id) <= CELL_COUNT):
                raise RuntimeError(f"invalid persisted cell_id: {cell_id}")
            if not (1 <= int(bundle_id) <= BUNDLE_COUNT):
                raise RuntimeError(f"invalid persisted speaker_pattern_bundle: {bundle_id}")
            if strategy != ALLOCATION_STRATEGY_VERSION:
                raise RuntimeError(f"invalid persisted allocation strategy: {strategy}")
            if cohort != ALLOCATION_COHORT:
                raise RuntimeError(f"invalid persisted allocation cohort: {cohort}")
            if status != STARTED_STATUS:
                raise RuntimeError(f"invalid persisted allocation status: {status}")
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


def write_report(
    path: Path,
    participants: int,
    workers: int,
    cell_counts: list[tuple[int, int]],
    bundle_counts: list[tuple[int, int]],
    microcell_counts: list[tuple[int, int, int]],
) -> None:
    cell_values = [count for _, count in cell_counts]
    bundle_values = [count for _, count in bundle_counts]
    populated_microcells = sum(count > 0 for _, _, count in microcell_counts)
    exact_gate = participants == MICROCELL_COUNT
    lines = [
        "# Bundled Counterbalance Concurrency Stress Test",
        "",
        f"Generated with `{Path(__file__).name}`.",
        "",
        "## Scenario",
        "",
        f"- Simultaneous starts: {participants}",
        f"- Worker threads: {workers}",
        f"- Fixed timestamp: `{FIXED_TIMESTAMP}`",
        f"- Allocation strategy: `{ALLOCATION_STRATEGY_VERSION}`",
        f"- Allocation cohort: `{ALLOCATION_COHORT}`",
        "- Local engine: SQLite using the same cell×bundle allocation-order SQL as the Pages Function.",
        "",
        "## Result",
        "",
        f"- cell_min: {min(cell_values)}",
        f"- cell_max: {max(cell_values)}",
        f"- cell_spread: {max(cell_values) - min(cell_values)}",
        f"- bundle_min: {min(bundle_values)}",
        f"- bundle_max: {max(bundle_values)}",
        f"- bundle_spread: {max(bundle_values) - min(bundle_values)}",
        f"- populated_microcells: {populated_microcells} / {MICROCELL_COUNT}",
        f"- exact_200_microcell_gate: {'passed' if exact_gate else 'not applicable'}",
        "- persisted_D1_metadata_check: passed",
        "- duplicate_participant_key_check: passed",
        "",
        "## Cell Counts",
        "",
        "| cell_id | assigned_count |",
        "| ---: | ---: |",
    ]
    for cell_id, count in cell_counts:
        lines.append(f"| {cell_id} | {count} |")
    lines.extend(
        [
            "",
            "## Speaker-pattern Bundle Counts",
            "",
            "| speaker_pattern_bundle | assigned_count |",
            "| ---: | ---: |",
        ]
    )
    for bundle_id, count in bundle_counts:
        lines.append(f"| {bundle_id} | {count} |")
    if exact_gate:
        lines.extend(
            [
                "",
                "## Exact Cell × Bundle Coverage",
                "",
                "| cell_id | speaker_pattern_bundle | assigned_count |",
                "| ---: | ---: | ---: |",
            ]
        )
        for cell_id, bundle_id, count in microcell_counts:
            lines.append(f"| {cell_id} | {bundle_id} | {count} |")
    lines.extend(
        [
            "",
            (
                "Interpretation: all 200 cell×bundle microcells must occur exactly once."
                if exact_gate
                else "Interpretation: cell and bundle spreads of 0 or 1 are required; microcell coverage is descriptive for smaller waves."
            ),
            "This local check does not replace a Cloudflare D1 dry run, but it verifies the SQL-level allocation and metadata invariants under SQLite-compatible concurrent writes.",
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

    if args.participants < 1:
        raise SystemExit("--participants must be positive")
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
            allocations = [future.result(timeout=args.timeout_s + 5) for future in futures]

        cell_counts = summarize_cells(db_path)
        bundle_counts = summarize_bundles(db_path)
        microcell_counts = summarize_microcells(db_path)
        cell_values = [count for _, count in cell_counts]
        bundle_values = [count for _, count in bundle_counts]
        cell_spread = max(cell_values) - min(cell_values)
        bundle_spread = max(bundle_values) - min(bundle_values)
        if len(allocations) != args.participants:
            raise RuntimeError("not every participant received an allocation")
        if any(
            strategy != ALLOCATION_STRATEGY_VERSION or cohort != ALLOCATION_COHORT
            for _, _, strategy, cohort in allocations
        ):
            raise RuntimeError("an allocation response did not contain the expected strategy/cohort")
        if cell_spread > 1:
            raise RuntimeError(
                f"cell allocation spread is too large: {cell_spread}; counts={cell_counts}"
            )
        if bundle_spread > 1:
            raise RuntimeError(
                f"bundle allocation spread is too large: {bundle_spread}; counts={bundle_counts}"
            )
        if args.participants == MICROCELL_COUNT:
            invalid_microcells = [row for row in microcell_counts if row[2] != 1]
            if invalid_microcells:
                raise RuntimeError(
                    f"exact 200-start gate failed for {len(invalid_microcells)} microcells: "
                    f"{invalid_microcells[:12]}"
                )

        verify_d1_metadata(db_path, args.participants)
        duplicate_participant_key_check(db_path)
        if report_path:
            write_report(
                report_path.expanduser().resolve(),
                args.participants,
                workers,
                cell_counts,
                bundle_counts,
                microcell_counts,
            )
        print(f"simultaneous starts: {args.participants}")
        print(f"workers: {workers}")
        print(f"cell_min: {min(cell_values)}")
        print(f"cell_max: {max(cell_values)}")
        print(f"cell_spread: {cell_spread}")
        print(f"bundle_min: {min(bundle_values)}")
        print(f"bundle_max: {max(bundle_values)}")
        print(f"bundle_spread: {bundle_spread}")
        print(
            f"populated_microcells: {sum(count > 0 for _, _, count in microcell_counts)}/"
            f"{MICROCELL_COUNT}"
        )
        print(
            "cell_counts:",
            " ".join(f"{cell}:{count}" for cell, count in cell_counts),
        )
        print(
            "bundle_counts:",
            " ".join(f"{bundle}:{count}" for bundle, count in bundle_counts),
        )
        print(
            "exact_200_microcell_gate:",
            "passed" if args.participants == MICROCELL_COUNT else "not_applicable",
        )
        print("persisted_D1_metadata_check: passed")
        print("duplicate_participant_key_check: passed")
        if report_path:
            print(f"report: {report_path.expanduser().resolve()}")
        if args.keep_db:
            print(f"database: {db_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
