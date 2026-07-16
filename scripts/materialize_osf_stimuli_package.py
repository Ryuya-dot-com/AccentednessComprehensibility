#!/usr/bin/env python3
"""Create an OSF-ready standardized stimulus package from the crosswalk."""

from __future__ import annotations

import argparse
import csv
import hashlib
import shutil
from collections import Counter
from datetime import datetime
from pathlib import Path


DEFAULT_DATE = datetime.now().strftime("%Y%m%d")
SELECTED_PRACTICE_ROWS = [
    {
        "practice_set_id": "practice_calibration_v0.10.1",
        "trial_index": "1",
        "target_word": "appreciation",
        "l1_condition": "ENG",
        "pronunciation_condition": "natural",
        "voice_variant": "eng_female",
        "source_relative_path": "Practice&Calibration/ENG_Female_appreciation_Practice.wav",
        "package_relative_path": "practice/calibration/eng_female_appreciation_practice.wav",
        "app_relative_path": "https://pub-c26f53c7e40c448db5847c2079933f52.r2.dev/practice/calibration/eng_female_appreciation_practice.wav",
        "spoken_form": "appreciation",
        "source_format": "researcher_provided_calibration_wav",
        "expert_comprehensibility_1_9": "",
        "expert_accentedness_1_9": "",
        "expert_comprehensibility_range": "1–2",
        "expert_accentedness_range": "1–2",
        "status": "selected_reviewed",
        "note": "Researcher-provided calibration WAV; collaborator-reviewed reference ranges.",
    },
    {
        "practice_set_id": "practice_calibration_v0.10.1",
        "trial_index": "2",
        "target_word": "pesticide",
        "l1_condition": "JPN",
        "pronunciation_condition": "accented",
        "voice_variant": "jpn_male",
        "source_relative_path": "Practice&Calibration/JPN_Male_pesticide.wav",
        "package_relative_path": "practice/calibration/jpn_male_pesticide_practice.wav",
        "app_relative_path": "https://pub-c26f53c7e40c448db5847c2079933f52.r2.dev/practice/calibration/jpn_male_pesticide_practice.wav",
        "spoken_form": "pesticide",
        "source_format": "researcher_provided_calibration_wav",
        "expert_comprehensibility_1_9": "",
        "expert_accentedness_1_9": "",
        "expert_comprehensibility_range": "1–2",
        "expert_accentedness_range": "2–3",
        "status": "selected_reviewed",
        "note": "Researcher-provided calibration WAV; collaborator-reviewed reference ranges.",
    },
    {
        "practice_set_id": "practice_calibration_v0.10.1",
        "trial_index": "3",
        "target_word": "quality",
        "l1_condition": "JPN",
        "pronunciation_condition": "accented",
        "voice_variant": "jpn_female",
        "source_relative_path": "Practice&Calibration/JPN_Female_quality_Practice.wav",
        "package_relative_path": "practice/calibration/jpn_female_quality_practice.wav",
        "app_relative_path": "https://pub-c26f53c7e40c448db5847c2079933f52.r2.dev/practice/calibration/jpn_female_quality_practice.wav",
        "spoken_form": "quality",
        "source_format": "researcher_provided_calibration_wav",
        "expert_comprehensibility_1_9": "",
        "expert_accentedness_1_9": "",
        "expert_comprehensibility_range": "2–3",
        "expert_accentedness_range": "4–5",
        "status": "selected_reviewed",
        "note": "Researcher-provided calibration WAV; collaborator-reviewed reference ranges.",
    },
    {
        "practice_set_id": "practice_calibration_v0.10.1",
        "trial_index": "4",
        "target_word": "organizer",
        "l1_condition": "CHN",
        "pronunciation_condition": "accented",
        "voice_variant": "chn_female",
        "source_relative_path": "Practice&Calibration/CHN_Female_Organizer_Practice.wav",
        "package_relative_path": "practice/calibration/chn_female_organizer_practice.wav",
        "app_relative_path": "https://pub-c26f53c7e40c448db5847c2079933f52.r2.dev/practice/calibration/chn_female_organizer_practice.wav",
        "spoken_form": "organizer",
        "source_format": "researcher_provided_calibration_wav",
        "expert_comprehensibility_1_9": "",
        "expert_accentedness_1_9": "",
        "expert_comprehensibility_range": "5–7",
        "expert_accentedness_range": "4–6",
        "status": "selected_reviewed",
        "note": "Researcher-provided calibration WAV; collaborator-reviewed reference ranges.",
    },
    {
        "practice_set_id": "practice_calibration_v0.10.1",
        "trial_index": "5",
        "target_word": "balloon",
        "l1_condition": "CHN",
        "pronunciation_condition": "accented",
        "voice_variant": "chn_male",
        "source_relative_path": "Practice&Calibration/CHN_Male_Balloon_Practice.wav",
        "package_relative_path": "practice/calibration/chn_male_balloon_practice.wav",
        "app_relative_path": "https://pub-c26f53c7e40c448db5847c2079933f52.r2.dev/practice/calibration/chn_male_balloon_practice.wav",
        "spoken_form": "balloon",
        "source_format": "researcher_provided_calibration_wav",
        "expert_comprehensibility_1_9": "",
        "expert_accentedness_1_9": "",
        "expert_comprehensibility_range": "4–6",
        "expert_accentedness_range": "6–8",
        "status": "selected_reviewed",
        "note": "Researcher-provided calibration WAV; collaborator-reviewed reference ranges.",
    },
]
CONTENT_TYPES = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".webm": "audio/webm",
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, str]], fieldnames: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def copy_file(source: Path, destination: Path, overwrite: bool) -> str:
    if not source.exists():
        return "missing_source"
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if destination.stat().st_size == source.stat().st_size:
            source_sha256 = sha256_file(source)
            destination_sha256 = sha256_file(destination)
            if destination_sha256 == source_sha256:
                return "already_exists_same_sha256"
            if not overwrite:
                return "exists_different_sha256"
        if not overwrite:
            return "exists_different_size"
    shutil.copy2(source, destination)
    if sha256_file(destination) != sha256_file(source):
        raise OSError(f"copy verification failed: {source} -> {destination}")
    return "copied"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def package_readme(package_root: Path, counts: Counter, manifest_name: str) -> str:
    lines = [
        "# Accentedness Comprehensibility Stimuli OSF Package",
        "",
        f"Generated: {datetime.now().isoformat(timespec='seconds')}",
        "",
        "## Contents",
        "",
        "- `main/`: production stimuli using standardized OSF filenames.",
        "- `practice/`: practice/calibration and ElevenLabs candidate stimuli.",
        "- `metadata/`: rename crosswalks and documentation.",
        "- `metadata/selected_practice_manifest.csv`: five practice WAVs selected for the live app, with collaborator-reviewed rating ranges and source provenance.",
        "- `metadata/r2_upload_plan.csv`: local file, R2 object key, content type, size, and checksum for upload planning.",
        "- `metadata/osf_package_checksums_sha256.csv`: SHA-256 checksums for copied audio files.",
        f"- `{manifest_name}`: app-ready production manifest using paths relative to this package root.",
        "",
        "## Production Manifest",
        "",
        "The rating app can use `remote_manifest.csv` from this package as the counterbalance manifest.",
        "The manifest has already been generated from the OSF rename crosswalk.",
        "`word_number` in the manifest is the CounterBalance lexical item number from",
        "`stimuli/CounterBalance.xlsx`; `source_word_number` preserves the number parsed",
        "from the original source filename.",
        "",
        "## Practice Selection",
        "",
        "The app practice session uses the five researcher-provided WAVs listed in",
        "`metadata/selected_practice_manifest.csv`: `appreciation`, `pesticide`, `quality`, `organizer`, and `balloon`.",
        "The manifest stores collaborator-reviewed Accentedness and Comprehensibility ranges, not scalar expert ratings.",
        "",
        "## Audio Counts",
        "",
    ]
    for key, value in sorted(counts.items()):
        lines.append(f"- `{key}`: {value}")
    lines.extend(
        [
            "",
            "## Speaker IDs",
            "",
            "Original non-contiguous IDs such as `E1`, `J12`, and `C18` are preserved in",
            "`metadata/osf_speaker_id_crosswalk_20260703.csv`. Standardized paths use",
            "`eng_s##`, `jpn_s##`, and `chn_s##`; the manifest also includes `spk###`",
            "as the global speaker ID.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--stimuli-root",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "Stimuli",
    )
    parser.add_argument(
        "--file-crosswalk",
        type=Path,
        default=Path(__file__).resolve().parents[2]
        / "Stimuli"
        / "osf_stimuli_file_rename_crosswalk_20260703.csv",
    )
    parser.add_argument(
        "--speaker-crosswalk",
        type=Path,
        default=Path(__file__).resolve().parents[2]
        / "Stimuli"
        / "osf_speaker_id_crosswalk_20260703.csv",
    )
    parser.add_argument(
        "--folder-crosswalk",
        type=Path,
        default=Path(__file__).resolve().parents[2]
        / "Stimuli"
        / "osf_stimuli_folder_rename_crosswalk_20260703.csv",
    )
    parser.add_argument(
        "--rename-plan",
        type=Path,
        default=Path(__file__).resolve().parents[2]
        / "Stimuli"
        / "OSF_RENAME_PLAN_20260703.md",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path(__file__).resolve().parents[2]
        / "Stimuli"
        / "remote_manifest_production_osf_20260703.csv",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "Stimuli_OSF_Release_20260703",
    )
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    stimuli_root = args.stimuli_root.expanduser().resolve()
    out_dir = args.out_dir.expanduser().resolve()
    file_rows = read_csv(args.file_crosswalk.expanduser().resolve())
    existing_package_paths = {row.get("new_relative_path", "") for row in file_rows}
    for selected in SELECTED_PRACTICE_ROWS:
        if selected["package_relative_path"] in existing_package_paths:
            continue
        file_rows.append(
            {
                "stimulus_set": "practice_calibration_selected",
                "old_relative_path": selected["source_relative_path"],
                "new_relative_path": selected["package_relative_path"],
            }
        )

    copy_log = []
    status_counts: Counter[str] = Counter()
    set_counts: Counter[str] = Counter()
    for row in file_rows:
        source = stimuli_root / row["old_relative_path"]
        destination = out_dir / row["new_relative_path"]
        status = copy_file(source, destination, args.overwrite)
        status_counts[status] += 1
        set_counts[row["stimulus_set"]] += 1
        destination_size = destination.stat().st_size if destination.exists() else ""
        destination_sha256 = sha256_file(destination) if destination.exists() else ""
        copy_log.append(
            {
                "status": status,
                "stimulus_set": row["stimulus_set"],
                "source": source.as_posix(),
                "destination": destination.as_posix(),
                "old_relative_path": row["old_relative_path"],
                "new_relative_path": row["new_relative_path"],
                "size_bytes": destination_size,
                "sha256": destination_sha256,
            }
        )

    metadata_dir = out_dir / "metadata"
    metadata_dir.mkdir(parents=True, exist_ok=True)
    metadata_sources = [
        args.file_crosswalk,
        args.folder_crosswalk,
        args.speaker_crosswalk,
        args.rename_plan,
        args.manifest,
    ]
    for metadata_source in metadata_sources:
        src = metadata_source.expanduser().resolve()
        if src.exists():
            shutil.copy2(src, metadata_dir / src.name)

    manifest_source = args.manifest.expanduser().resolve()
    manifest_destination = out_dir / "remote_manifest.csv"
    shutil.copy2(manifest_source, manifest_destination)

    log_path = metadata_dir / "osf_package_copy_log.csv"
    write_csv(
        log_path,
        copy_log,
        [
            "status",
            "stimulus_set",
            "source",
            "destination",
            "old_relative_path",
            "new_relative_path",
            "size_bytes",
            "sha256",
        ],
    )
    checksums_path = metadata_dir / "osf_package_checksums_sha256.csv"
    write_csv(
        checksums_path,
        [
            {
                "relative_path": row["new_relative_path"],
                "size_bytes": row["size_bytes"],
                "sha256": row["sha256"],
            }
            for row in copy_log
            if row["sha256"]
        ],
        ["relative_path", "size_bytes", "sha256"],
    )
    r2_upload_plan_path = metadata_dir / "r2_upload_plan.csv"
    write_csv(
        r2_upload_plan_path,
        [
            {
                "r2_key": row["new_relative_path"],
                "local_file": row["destination"],
                "content_type": CONTENT_TYPES.get(Path(row["new_relative_path"]).suffix.lower(), "application/octet-stream"),
                "size_bytes": row["size_bytes"],
                "sha256": row["sha256"],
                "stimulus_set": row["stimulus_set"],
            }
            for row in copy_log
            if row["sha256"]
        ],
        ["r2_key", "local_file", "content_type", "size_bytes", "sha256", "stimulus_set"],
    )
    selected_practice_path = metadata_dir / "selected_practice_manifest.csv"
    selected_rows = []
    for row in SELECTED_PRACTICE_ROWS:
        package_file = out_dir / row["package_relative_path"]
        selected_rows.append(
            {
                **row,
                "package_file_exists": int(package_file.exists()),
                "size_bytes": package_file.stat().st_size if package_file.exists() else "",
                "sha256": sha256_file(package_file) if package_file.exists() else "",
            }
        )
    write_csv(
        selected_practice_path,
        selected_rows,
        [
            "practice_set_id",
            "trial_index",
            "target_word",
            "l1_condition",
            "pronunciation_condition",
            "voice_variant",
            "source_relative_path",
            "package_relative_path",
            "app_relative_path",
            "spoken_form",
            "source_format",
            "expert_comprehensibility_1_9",
            "expert_accentedness_1_9",
            "expert_comprehensibility_range",
            "expert_accentedness_range",
            "status",
            "note",
            "package_file_exists",
            "size_bytes",
            "sha256",
        ],
    )

    readme_path = out_dir / "README.md"
    readme_path.write_text(
        package_readme(out_dir, set_counts, manifest_destination.name),
        encoding="utf-8",
    )

    blocking = (
        status_counts["missing_source"]
        + status_counts["exists_different_size"]
        + status_counts["exists_different_sha256"]
    )
    print(f"package_root: {out_dir}")
    print(f"manifest: {manifest_destination}")
    print(f"copy_log: {log_path}")
    print(f"checksums: {checksums_path}")
    print(f"r2_upload_plan: {r2_upload_plan_path}")
    print(f"selected_practice_manifest: {selected_practice_path}")
    print(f"status_counts: {dict(sorted(status_counts.items()))}")
    print(f"stimulus_set_counts: {dict(sorted(set_counts.items()))}")
    print(f"blocking_copy_problems: {blocking}")
    return 1 if blocking else 0


if __name__ == "__main__":
    raise SystemExit(main())
