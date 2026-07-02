#!/usr/bin/env python3
"""Apply completed practice reference-rating review decisions to app/manifests."""

from __future__ import annotations

import argparse
import csv
import re
import shutil
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_ROOT = PROJECT_ROOT / "Stimuli_OSF_Release_20260703"
DEFAULT_REVIEW_CSV = PACKAGE_ROOT / "metadata" / "review_packet_20260703" / "completed_stimulus_review.csv"
DEFAULT_REPO_PRACTICE_MANIFEST = (
    REPO_ROOT
    / "practice_training_audio"
    / "elevenlabs_selected_chocolate_coffee_pizza_sofa_20260703"
    / "practice_manifest.csv"
)
DEFAULT_PACKAGE_SELECTED_MANIFEST = PACKAGE_ROOT / "metadata" / "selected_practice_manifest.csv"
DEFAULT_APP_JS = REPO_ROOT / "app.js"
DEFAULT_MATERIALIZE_SCRIPT = REPO_ROOT / "scripts" / "materialize_osf_stimuli_package.py"
DEFAULT_APPLIED_COPY = PACKAGE_ROOT / "metadata" / "practice_reference_rating_review_applied.csv"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, str]], columns: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def parse_rating(value: str, label: str, word: str) -> str:
    try:
        rating = int(str(value).strip())
    except ValueError as exc:
        raise ValueError(f"{word}: {label} must be an integer 1-9") from exc
    if rating < 1 or rating > 9:
        raise ValueError(f"{word}: {label} must be in 1-9")
    return str(rating)


def completed_practice_reviews(rows: list[dict[str, str]]) -> dict[str, dict[str, str]]:
    practice_rows = [
        row for row in rows if row.get("review_item_type") == "practice_reference_rating"
    ]
    if len(practice_rows) != 4:
        raise ValueError(f"Expected 4 practice review rows, found {len(practice_rows)}")
    reviews: dict[str, dict[str, str]] = {}
    for row in practice_rows:
        word = row.get("target_word", "").strip().lower()
        if not word:
            raise ValueError("Practice review row is missing target_word")
        if row.get("accepted_for_practice", "").strip() != "1":
            raise ValueError(f"{word}: accepted_for_practice must be 1 before applying")
        reviewer = row.get("reviewer", "").strip()
        review_date = row.get("review_date", "").strip()
        if not reviewer:
            raise ValueError(f"{word}: reviewer is required")
        if not review_date:
            raise ValueError(f"{word}: review_date is required")
        row["final_comprehensibility_1_9"] = parse_rating(
            row.get("final_comprehensibility_1_9", ""),
            "final_comprehensibility_1_9",
            word,
        )
        row["final_accentedness_1_9"] = parse_rating(
            row.get("final_accentedness_1_9", ""),
            "final_accentedness_1_9",
            word,
        )
        reviews[word] = row
    expected = {"chocolate", "coffee", "pizza", "sofa"}
    missing = sorted(expected - set(reviews))
    if missing:
        raise ValueError(f"Missing practice review words: {missing}")
    return reviews


def reviewed_note(row: dict[str, str]) -> str:
    reviewer = row["reviewer"].strip()
    review_date = row["review_date"].strip()
    notes = row.get("notes", "").strip()
    suffix = f"Reference ratings reviewed by {reviewer} on {review_date}."
    return f"{suffix} {notes}".strip()


def backup(path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    destination = path.with_suffix(path.suffix + f".bak-{stamp}")
    shutil.copy2(path, destination)
    return destination


def update_repo_practice_manifest(path: Path, reviews: dict[str, dict[str, str]], dry_run: bool) -> None:
    rows = read_csv(path)
    for row in rows:
        word = row.get("target_word", "").strip().lower()
        if word not in reviews:
            continue
        review = reviews[word]
        row["expert_comprehensibility_1_9"] = review["final_comprehensibility_1_9"]
        row["expert_accentedness_1_9"] = review["final_accentedness_1_9"]
        row["source_note"] = reviewed_note(review)
    if not dry_run:
        backup(path)
        write_csv(path, rows, list(rows[0].keys()))


def update_package_selected_manifest(path: Path, reviews: dict[str, dict[str, str]], dry_run: bool) -> None:
    rows = read_csv(path)
    for row in rows:
        word = row.get("target_word", "").strip().lower()
        if word not in reviews:
            continue
        review = reviews[word]
        row["expert_comprehensibility_1_9"] = review["final_comprehensibility_1_9"]
        row["expert_accentedness_1_9"] = review["final_accentedness_1_9"]
        row["status"] = "selected_reviewed"
        row["note"] = reviewed_note(review)
    if not dry_run:
        backup(path)
        write_csv(path, rows, list(rows[0].keys()))


def update_app_js(path: Path, reviews: dict[str, dict[str, str]], dry_run: bool) -> None:
    text = path.read_text(encoding="utf-8")
    updated = text
    for word, review in reviews.items():
        pattern = re.compile(r"(\{\n\s+practice_kind:[\s\S]*?word: \"" + re.escape(word) + r"\",[\s\S]*?\n\s+\})")
        match = pattern.search(updated)
        if not match:
            raise ValueError(f"Could not find practice item in app.js: {word}")
        block = match.group(1)
        block = re.sub(
            r"expert_comprehensibility_1_9:\s*\d+",
            f"expert_comprehensibility_1_9: {review['final_comprehensibility_1_9']}",
            block,
        )
        block = re.sub(
            r"expert_accentedness_1_9:\s*\d+",
            f"expert_accentedness_1_9: {review['final_accentedness_1_9']}",
            block,
        )
        note = reviewed_note(review).replace("\\", "\\\\").replace('"', '\\"')
        block = re.sub(r'practice_note:\s*"[^"]*"', f'practice_note: "{note}"', block)
        updated = updated[: match.start(1)] + block + updated[match.end(1) :]
    if not dry_run:
        backup(path)
        path.write_text(updated, encoding="utf-8")


def update_materialize_script(path: Path, reviews: dict[str, dict[str, str]], dry_run: bool) -> None:
    text = path.read_text(encoding="utf-8")
    updated = text
    for word, review in reviews.items():
        pattern = re.compile(r"(\{\n\s+\"trial_index\":[\s\S]*?\"target_word\": \"" + re.escape(word) + r"\",[\s\S]*?\n\s+\})")
        match = pattern.search(updated)
        if not match:
            raise ValueError(f"Could not find SELECTED_PRACTICE_ROWS entry: {word}")
        block = match.group(1)
        block = re.sub(
            r'"expert_comprehensibility_1_9":\s*"\d+"',
            f'"expert_comprehensibility_1_9": "{review["final_comprehensibility_1_9"]}"',
            block,
        )
        block = re.sub(
            r'"expert_accentedness_1_9":\s*"\d+"',
            f'"expert_accentedness_1_9": "{review["final_accentedness_1_9"]}"',
            block,
        )
        note = reviewed_note(review).replace("\\", "\\\\").replace('"', '\\"')
        block = re.sub(r'"status":\s*"[^"]+"', '"status": "selected_reviewed"', block)
        block = re.sub(r'"note":\s*"[^"]+"', f'"note": "{note}"', block)
        updated = updated[: match.start(1)] + block + updated[match.end(1) :]
    if not dry_run:
        backup(path)
        path.write_text(updated, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--review-csv", type=Path, default=DEFAULT_REVIEW_CSV)
    parser.add_argument("--repo-practice-manifest", type=Path, default=DEFAULT_REPO_PRACTICE_MANIFEST)
    parser.add_argument("--package-selected-manifest", type=Path, default=DEFAULT_PACKAGE_SELECTED_MANIFEST)
    parser.add_argument("--app-js", type=Path, default=DEFAULT_APP_JS)
    parser.add_argument("--materialize-script", type=Path, default=DEFAULT_MATERIALIZE_SCRIPT)
    parser.add_argument("--applied-copy", type=Path, default=DEFAULT_APPLIED_COPY)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    review_path = args.review_csv.expanduser().resolve()
    reviews = completed_practice_reviews(read_csv(review_path))
    update_repo_practice_manifest(args.repo_practice_manifest.expanduser().resolve(), reviews, args.dry_run)
    update_package_selected_manifest(args.package_selected_manifest.expanduser().resolve(), reviews, args.dry_run)
    update_app_js(args.app_js.expanduser().resolve(), reviews, args.dry_run)
    update_materialize_script(args.materialize_script.expanduser().resolve(), reviews, args.dry_run)
    if not args.dry_run:
        args.applied_copy.expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(review_path, args.applied_copy.expanduser().resolve())
    print(f"practice review rows validated: {len(reviews)}")
    print("dry_run:", args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
